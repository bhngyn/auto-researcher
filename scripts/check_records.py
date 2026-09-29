#!/usr/bin/env python3
"""Stage 8: validate data/records.json (and optionally re-derive its computed fields).

  python3 scripts/check_records.py --project <dir> [--derive]

FAILS CLOSED (exit 1) on:
  * duplicate record ids; unknown or rejected claim ids anywhere (categories, claims, figures, links, counterclaims,
    headline_toll, victims); unknown related/same_as/parent/children ids; asymmetric parent <-> children;
  * a card whose chapter file lacks the anchor, or whose <h3> differs from the record title;
  * link levels outside L1_direct / L2_area_command / L3_presence; a link slug not in data/entities.json;
  * victims_named with a status other than 'killed' (unless project.json protected.allow_other_victim_status);
  * a headline_toll that is not low <= high, or whose claims do not exist.
REPORTS (does not fail): usable claims attached to no record ("unattached"), weak records, in-scope records
without a card.

--derive recomputes derived fields and writes the file (backup first): evidence.{claim_grades, best_claim_grade,
card_grade, distinct_nonpartisan_origins, nonpartisan_origins, partisan_origins}, weak (best core-claim grade is C),
scope.in_scope (= scope.attribution == "stated", unless scope.in_scope_override is set). Curated fields (parent,
children, related, same_as, links, headline_toll, claim lists) are never touched.
"""
import html
import re
import sys

import lib

LEVELS = {"L1_direct", "L2_area_command", "L3_presence"}
RANK = {"A": 0, "B": 1, "C": 2}


def norm_title(t):
    return re.sub(r"[^a-z0-9]+", " ", html.unescape(re.sub(r"<[^>]+>", "", t)).lower()).strip()


def rec_claim_ids(r):
    ids = set(r["claims"].get("core", [])) | set(r["claims"].get("context", []))
    for c in r.get("categories", []):
        ids |= set(c.get("claims", []))
    ids |= {f["claim"] for f in r.get("figures", [])}
    for l in r.get("links", []):
        ids |= set(l.get("claims", []))
    ids |= {c["claim"] for c in r.get("counterclaims", []) if c.get("claim")}
    ids |= {v["claim"] for v in r.get("victims_named", []) if v.get("claim")}
    ids |= {a["claim"] for a in r.get("actors_as_reported", [])}
    ids |= set((r.get("headline_toll") or {}).get("claims", []))
    return ids


def main():
    args = lib.cli(__doc__, (["--derive"], {"action": "store_true"}))
    p = lib.get_project(args)
    path = p.data / "records.json"
    raw = path.read_text(encoding="utf-8")
    d = lib.read_json(path)
    recs = d["records"]
    claims = p.load_claims()
    ents = {e["slug"] for e in lib.read_json(p.data / "entities.json")["entities"]} if (p.data / "entities.json").exists() else set()
    by_id, errors = {}, []
    for r in recs:
        if r["id"] in by_id:
            errors.append(f"duplicate id {r['id']}")
        by_id[r["id"]] = r
    allow_other = p.cfg.get("protected", {}).get("allow_other_victim_status", False)
    cited = set()
    for r in recs:
        w = r["id"]
        for cid in rec_claim_ids(r):
            cited.add(cid)
            if cid not in claims:
                errors.append(f"{w}: unknown claim {cid}")
            elif claims[cid].get("verdict") == "rejected":
                errors.append(f"{w}: rejected claim {cid}")
        for k in ("related", "same_as", "children"):
            for o in r.get(k, []):
                if o not in by_id:
                    errors.append(f"{w}: {k} -> unknown record {o}")
        if r.get("parent"):
            if r["parent"] not in by_id:
                errors.append(f"{w}: unknown parent {r['parent']}")
            elif w not in by_id[r["parent"]].get("children", []):
                errors.append(f"{w}: parent {r['parent']} does not list it as a child")
        for ch in r.get("children", []):
            if ch in by_id and by_id[ch].get("parent") != w:
                errors.append(f"{w}: child {ch} does not name it as parent")
        for l in r.get("links", []):
            if l.get("level") not in LEVELS:
                errors.append(f"{w}: bad link level {l.get('level')}")
            if l.get("slug") and l["slug"] not in ents:
                errors.append(f"{w}: link slug {l['slug']} not in entities.json")
        for v in r.get("victims_named", []):
            if v.get("status") != "killed" and not allow_other:
                errors.append(f"{w}: victim with status {v.get('status')!r} (protected)")
        t = r.get("headline_toll")
        if t and t.get("low") is not None and t.get("high") is not None and t["low"] > t["high"]:
            errors.append(f"{w}: headline_toll low > high")
        card = r.get("card")
        if card:
            f = p.sections / f"{card['chapter']}.html"
            if not f.exists():
                errors.append(f"{w}: card chapter file {f.name} missing")
            else:
                h = f.read_text(encoding="utf-8")
                m = re.search(rf'<div[^>]*id="{re.escape(card["anchor"])}"[^>]*>\s*<h3[^>]*>(.*?)</h3>', h, re.S)
                if not m:
                    errors.append(f"{w}: card anchor #{card['anchor']} missing in {f.name}")
                elif norm_title(re.sub(r"<span[^>]*lang=[^>]*>.*?</span>", "", m.group(1))) != norm_title(r["title"]):
                    errors.append(f"{w}: card <h3> differs from record title")

    if args.derive:
        for r in recs:
            core = [c for c in r["claims"].get("core", []) if c in claims]
            allc = sorted(rec_claim_ids(r) & set(claims))
            grades = {c: claims[c].get("confidence", "C") for c in allc}
            best = min((grades[c] for c in core), key=lambda g: RANK.get(g, 3), default="C")
            np_o, p_o = set(), set()
            for c in core:
                for s in p.usable_sources(claims[c]):
                    (p_o if p.is_partisan(s) else np_o).add(s.get("originating_source") or s.get("publisher"))
            card_grade = ""
            if r.get("card"):
                f = p.sections / f"{r['card']['chapter']}.html"
                m = re.search(rf'id="{re.escape(r["card"]["anchor"])}".*?Grade\s+([A-C](?:[–\-][A-C])?[^<{{]*)', f.read_text(encoding="utf-8"), re.S)
                card_grade = m.group(1).strip() if m else ""
            r["evidence"] = {"claim_grades": grades, "best_claim_grade": best, "card_grade": card_grade or best,
                             "distinct_nonpartisan_origins": len(np_o), "nonpartisan_origins": sorted(np_o),
                             "partisan_origins": sorted(p_o)}
            r["weak"] = best == "C"
            sc = r.setdefault("scope", {})
            sc["in_scope"] = sc["in_scope_override"] if "in_scope_override" in sc else sc.get("attribution") == "stated"
        if not errors:
            lib.backup_files(p, [path], f"pre_derive_{lib.stamp()}")
            path.write_text(lib.dump_json(d, raw), encoding="utf-8")
            print("derived fields written")

    unattached = sorted(c for c, v in claims.items() if v.get("verdict") != "rejected" and c not in cited)
    weak = [r["id"] for r in recs if r.get("weak")]
    nocard = [r["id"] for r in recs if r.get("scope", {}).get("in_scope") and not r.get("card")]
    for e in errors:
        print("ERROR", e)
    print(f"{len(recs)} records, {sum(1 for r in recs if r.get('scope', {}).get('in_scope'))} in scope, {len(weak)} weak {weak}; "
          f"{len(unattached)} usable claims attached to no record; in-scope records without a card: {nocard or 'none'}")
    if unattached:
        print("  unattached:", ", ".join(unattached[:30]) + (" ..." if len(unattached) > 30 else ""))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
