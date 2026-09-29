#!/usr/bin/env python3
"""Stage 12: validate attribution-link proposals (briefs/attribution_links.md) and merge them into records.json.

  python3 scripts/validate_links.py <out_dir> [<out_dir2> ...] --project <dir> [--apply]

Each out dir holds <record_id>.json files. Later directories supersede earlier ones for the same record (batch 17
supersedes batch 10). For every link:
  * level in L1_direct / L2_area_command / L3_presence / reject;
  * every evidence.ref is a usable claim id or timeline:<slug>:<i> that exists, and evidence.quote occurs VERBATIM in that
    claim's text (statement, figures, notes, actor, excerpts) or timeline entry (whitespace/quote tolerant);
  * the link's grade is not better than the weakest cited claim (it is lowered, and reported, never raised);
  * a slug (if given) exists in data/entities.json;
  * `reject` entries are kept out of records.json (they are the audit trail: they stay in the out files).
Corroboration never lowers a link's grade: if an agent lowered one because a corroborating source was weaker, restore the A
evidence by hand and put the corroboration in `reasoning`.
Dry run by default. --apply backs up records.json and writes records[*].links (only for records that have an out file).
"""
import sys
from pathlib import Path

import lib

LEVELS = {"L1_direct", "L2_area_command", "L3_presence"}
RANK = {"A": 0, "B": 1, "C": 2}


def main():
    args = lib.cli(__doc__, ("dirs", {"nargs": "+"}), (["--apply"], {"action": "store_true"}))
    p = lib.get_project(args)
    claims = {k: c for k, c in p.load_claims().items() if c.get("verdict") != "rejected"}
    ents = {e["slug"]: e for e in lib.read_json(p.data / "entities.json")["entities"]} if (p.data / "entities.json").exists() else {}
    rpath = p.data / "records.json"
    rdoc = lib.read_json(rpath)
    recs = {r["id"]: r for r in rdoc["records"]}
    latest = {}
    for d in args.dirs:
        for f in sorted(Path(d).glob("*.json")):
            latest[f.stem] = lib.read_json(f)
    errors, lowered, applied = [], [], {}
    for rid, out in latest.items():
        if rid not in recs:
            errors.append(f"{rid}: unknown record")
            continue
        keep = []
        for l in out.get("links", []):
            lvl = l.get("level")
            if lvl == "reject":
                continue
            w = f"{rid}/{l.get('name')}"
            n_err = len(errors)
            if lvl not in LEVELS:
                errors.append(f"{w}: bad level {lvl}")
                continue
            if l.get("slug") and l["slug"] not in ents:
                errors.append(f"{w}: slug {l['slug']} not in entities.json")
            weakest, cids = "A", []
            for ev in l.get("evidence", []):
                ref, quote = ev.get("ref", ""), ev.get("quote", "")
                if ref.startswith("timeline:"):
                    _, slug, i = ref.split(":")
                    try:
                        text = ents[slug]["timeline"][int(i)]["text"]
                        cids += ents[slug]["timeline"][int(i)].get("claims", [])
                    except Exception:  # noqa: BLE001
                        errors.append(f"{w}: bad timeline ref {ref}")
                        continue
                    hay = text
                elif ref in claims:
                    hay = lib.claim_text(claims[ref])
                    cids.append(ref)
                else:
                    errors.append(f"{w}: unknown ref {ref}")
                    continue
                if not lib.excerpt_found(quote, hay) and lib.norm_text(quote).lower() not in lib.norm_text(hay).lower():
                    errors.append(f"{w}: quote not verbatim in {ref}: {quote[:60]!r}")
            for c in set(cids):
                g = claims[c].get("confidence", "C") if c in claims else "C"
                if RANK[g] > RANK[weakest]:
                    weakest = g
            g = l.get("grade", "C")
            if RANK[g] < RANK[weakest]:
                lowered.append(f"{w}: grade {g} -> {weakest} (weakest cited claim)")
                g = weakest
            if len(errors) > n_err:
                continue
            keep.append({"slug": l.get("slug"), "name": l.get("name"), "unit": l.get("unit"), "level": lvl, "grade": g,
                         "partisan_only": bool(l.get("partisan_only")), "claims": sorted({c for c in cids if c in claims}),
                         "reasoning": l.get("reasoning", "")})
        applied[rid] = keep
    for e in errors:
        print("ERROR", e)
    for x in lowered:
        print("LOWERED", x)
    print(f"{len(applied)} records, {sum(len(v) for v in applied.values())} links accepted, {len(errors)} errors")
    if not args.apply:
        print("(dry run: nothing written)")
        return
    if errors:
        sys.exit("refusing to apply with errors")
    lib.backup_files(p, [rpath], f"pre_links_{lib.stamp()}")
    for rid, links in applied.items():
        recs[rid]["links"] = links
    rpath.write_text(lib.dump_json(rdoc, rpath.read_text(encoding="utf-8")), encoding="utf-8")
    print("links written to records.json")


if __name__ == "__main__":
    main()
