#!/usr/bin/env python3
"""Stage 13: build the single-file edition.

  python3 scripts/build_edition.py --project <dir>       ->  <dir>/build/edition.html   (env BUILD_EDITION_OUT overrides)

One self-contained HTML document: one router, one data store (a JSON blob), one evidence drawer, no iframes, no
network for data, works from file://. See edition/DATA_CONTRACT.md for the data shape (D) and
edition/DESIGN_TEMPLATE.md for the design rules.

READ-ONLY inputs, each owned by another stage:
  data/verified*/*.json           claims (rejected claims are never emitted)
  report/sections/<chapter>.html  the facts layer, rendered VERBATIM; {{c:ID}} becomes a claim marker
  report/method.html              method (markers and {{STAT:KEY}} allowed)
  data/records.json, data/entities.json, data/glossary.json, analysis/analysis.json
  edition/edition.json            chapters, actors, facets, cover numbers, labels (the structure the research chose)
  edition/layers/*.js|*.css       optional per-project layers, inlined after the core (see edition/LAYERS.md)
  data/layers/<name>.json         optional data for a layer -> D.layers.<name>

FAILS CLOSED on: an unknown or rejected claim id anywhere, a chapter file that is missing, a record/entity that
cites an unknown claim. Warns on unfilled {placeholders} in the analysis and on records with figures but no toll.
"""
import html
import json
import os
import re
import sys
from pathlib import Path

import lib
import build_report as br

CORE = lib.REPO / "edition" / "core"
esc = html.escape


def slug(s):
    return re.sub(r"[^a-z0-9]+", "_", (s or "").lower()).strip("_")


def cm(text):
    """{{c:a,b}} -> claim marker element (hydrated by app.js)."""
    return lib.MARKER.sub(lambda m: f'<sup class="cm" data-c="{esc(",".join(i.strip() for i in m.group(1).split(",") if i.strip()))}"></sup>', text)


def split_long_paragraphs(h, limit=650):
    """Paragraphs must be short: split a long <p> after a marker-ended sentence. Text is unchanged (only whitespace)."""
    def fix(m):
        inner = m.group(2)
        if len(re.sub(r"<[^>]+>", "", inner)) <= limit:
            return m.group(0)
        parts = re.split(r'(?<=</sup>)\s+(?=[A-Z"“(])', inner)
        if len(parts) < 2:
            return m.group(0)
        chunks, cur = [], ""
        for part in parts:
            cur = (cur + " " + part).strip() if cur else part
            if len(re.sub(r"<[^>]+>", "", cur)) > limit * 0.5:
                chunks.append(cur)
                cur = ""
        if cur:
            chunks.append(cur)
        return "".join(f"<p{m.group(1)}>{c}</p>" for c in chunks)
    return re.sub(r"<p((?:\s[^>]*)?)>(.*?)</p>", fix, h, flags=re.S)


def quantity_floor(records):
    """Sum of reconciled LOW counts over in-scope records with cover != False, counting a parent OR its children,
    never both. A floor, not an estimate. Returns (low_sum, high_sum, n_records)."""
    counted = {r["id"] for r in records if r["in_scope"] and r.get("toll") and r["toll"].get("low") is not None
               and r["toll"].get("cover", True)}
    lo = hi = n = 0
    for r in records:
        if r["id"] not in counted:
            continue
        if r.get("parent") in counted:
            continue
        t = r["toll"]
        lo += t["low"]
        hi += t.get("high") if t.get("high") is not None else t["low"]
        n += 1
    return lo, hi, n


def main():
    args = lib.cli(__doc__)
    p = lib.get_project(args)
    ecfg = lib.read_json(p.root / "edition" / "edition.json")
    claims_raw = p.load_claims()
    errors, warns = [], []

    # ------------------------------------------------------------------ claims + sources
    st = br.stats(p, claims_raw)
    src_index, sources, claims = {}, [], {}
    for cid, c in claims_raw.items():
        if c.get("verdict") == "rejected":
            continue
        rows = {}
        for s in p.usable_sources(c):
            key = s.get("url") or (s.get("publisher", "") + "|" + s.get("title", ""))
            if key not in src_index:
                src_index[key] = len(sources)
                sources.append({"p": s.get("publisher_canonical") or s.get("publisher", ""), "t": s.get("title", ""),
                                "te": s.get("title_en", ""), "d": s.get("date", ""), "u": s.get("url", ""),
                                "ty": s.get("source_type", ""), "o": s.get("originating_source", ""),
                                "l": s.get("language", ""), "partisan": p.is_partisan(s)})
            row = [src_index[key], s.get("supporting_excerpt", ""), s.get("fetch_status", "")]
            rows[(row[0], row[1].strip())] = row  # an identical excerpt cited twice from one document shows once
        claims[cid] = {"s": c.get("statement", ""), "g": c.get("confidence", "C"), "d": c.get("date", ""), "l": c.get("location", ""),
                       "a": c.get("actor", ""), "k": c.get("category", ""), "x": c.get("figures", "") or "",
                       "n": c.get("notes", ""), "io": c.get("independent_origins"), "v": c.get("verdict", ""),
                       "vn": c.get("verification_note", ""), "os": c.get("osint_status", "") or "",
                       "ent": c.get("entities_named") or [], "src": list(rows.values())}

    def check_ids(text, where):
        return br.validate_markers(p, text, claims_raw, where=f"{where}: ", errors=errors)

    # ------------------------------------------------------------------ chapters (verbatim) + method
    chapters, cited = [], {}
    for ch in ecfg["chapters"]:
        f = p.sections / f"{ch['id']}.html"
        if not f.exists():
            errors.append(f"chapter file missing: {f}")
            continue
        raw = br.fill_stats(f.read_text(encoding="utf-8"), st)
        ids = check_ids(raw, f"chapter {ch['id']}")
        h = split_long_paragraphs(cm(raw))
        chapters.append({**ch, "html": h})
        for cid in set(ids):
            cited.setdefault(cid, []).append(f"c:{ch['id']}")
    mpath = p.report / "method.html"
    method = ""
    if mpath.exists():
        mraw = br.fill_stats(mpath.read_text(encoding="utf-8"), st)
        check_ids(mraw, "method")
        method = split_long_paragraphs(cm(mraw))

    # ------------------------------------------------------------------ records
    rdoc = lib.read_json(p.data / "records.json")["records"] if (p.data / "records.json").exists() else []
    records = []
    for r in rdoc:
        ev, sc, wh, wn = r.get("evidence", {}), r.get("scope", {}), r.get("where", {}), r.get("when", {})
        figs = r.get("figures", [])
        t = r.get("headline_toll")
        toll = None
        if t and (t.get("low") is not None or t.get("high") is not None):
            toll = {"low": t.get("low"), "high": t.get("high") if t.get("high") is not None else t.get("low"),
                    "note": t.get("note", ""), "claims": t.get("claims", []), "cover": t.get("cover") is not False, "kind": "headline"}
        elif any(f.get("killed_figures") for f in figs):
            allf = [x for f in figs for x in f.get("killed_figures", [])]
            toll = {"low": min(allf), "high": max(allf), "note": "Range of the figures in the record's claims; not reconciled into one count.",
                    "claims": [f["claim"] for f in figs], "cover": False, "kind": "figures"}
            warns.append(f"{r['id']}: figures but no reconciled toll (shown as an unreconciled range, kept off the cover sum)")
        rec = {"id": r["id"], "title": r["title"], "kind": r.get("kind", "event"), "parent": r.get("parent"),
               "children": r.get("children", []), "related": r.get("related", []), "card": r.get("card"),
               "in_scope": bool(sc.get("in_scope")), "weak": bool(r.get("weak")),
               "actor": sc.get("actor_group", ""), "actor_line": sc.get("actor_line", ""), "attribution": sc.get("attribution", ""),
               "start": wn.get("start"), "end": wn.get("end"), "when_text": wn.get("text", ""), "precision": wn.get("precision", "day"),
               "place_text": wh.get("text", ""), "place": wh.get("place", ""), "region": wh.get("region", ""),
               "lat": wh.get("lat"), "lon": wh.get("lon"), "geo_precision": wh.get("precision", "none"),
               "categories": r.get("categories", []), "card_grade": ev.get("card_grade", ""), "best_grade": ev.get("best_claim_grade", "C"),
               "grades": ev.get("claim_grades", {}), "origins": ev.get("distinct_nonpartisan_origins", 0),
               "figures": figs, "toll": toll, "actors_as_reported": r.get("actors_as_reported", []), "links": r.get("links", []),
               "victims": [v for v in r.get("victims_named", []) if v.get("status") == "killed"] if not p.cfg.get("protected", {}).get("allow_other_victim_status") else r.get("victims_named", []),
               "counterclaims": r.get("counterclaims", []), "claims": r.get("claims", {"core": [], "context": []}), "notes": r.get("notes", [])}
        for cid in br.validate_markers(p, "".join("{{c:%s}}" % i for i in _rec_ids(r)), claims_raw, where=f"{r['id']}: ", errors=errors):
            cited.setdefault(cid, []).append(f"r:{r['id']}")
        records.append(rec)
    for r in records:
        r["weak_note"] = "Weakly sourced: the best claim is grade C." if r["weak"] else ""

    # ------------------------------------------------------------------ entities
    edoc = lib.read_json(p.data / "entities.json")["entities"] if (p.data / "entities.json").exists() else []
    entities = {}
    for e in edoc:
        summary = br.fill_stats(e.get("summary", ""), st)
        bio = [{"h": b.get("h", ""), "html": cm(br.fill_stats(b.get("html", ""), st))} for b in e.get("bio", [])]
        ids = check_ids(summary + " ".join(b["html"] for b in e.get("bio", [])), f"entity {e['slug']}")
        for it in e.get("timeline", []) + e.get("identifiers", []):
            for cid in it.get("claims", []):
                check_ids("{{c:%s}}" % cid, f"entity {e['slug']}")
                ids.append(cid)
        for cid in set(ids):
            cited.setdefault(cid, []).append(f"e:{e['slug']}")
        entities[e["slug"]] = {**{k: e.get(k) for k in ("slug", "name", "type", "group", "role", "namesake_risk")},
                               "native": e.get("native") or "", "latin": e.get("latin") or [], "flags": e.get("flags") or [],
                               "identifiers": e.get("identifiers") or [], "timeline": e.get("timeline") or [],
                               "summary": cm(summary), "bio": bio,
                               "records": [[r["id"], l["level"], l["grade"]] for r in records for l in r["links"] if l.get("slug") == e["slug"]]}
    for r in records:
        for l in r["links"]:
            if l.get("slug") and l["slug"] not in entities:
                errors.append(f"{r['id']}: link slug {l['slug']} has no entity")

    # ------------------------------------------------------------------ glossary, analysis
    gpath = p.data / "glossary.json"
    glossary = lib.read_json(gpath) if gpath.exists() else []
    computed = {"n_records": len(records), "n_scope": sum(1 for r in records if r["in_scope"]), "n_claims": len(claims),
                "n_entities": len(entities), "n_sources": len(sources)}
    for reg in {r["region"] for r in records if r["region"]}:
        computed[f"n_region_{slug(reg)}"] = sum(1 for r in records if r["in_scope"] and r["region"] == reg)
    for a in {r["actor"] for r in records if r["actor"]}:
        computed[f"n_actor_{slug(a)}"] = sum(1 for r in records if r["in_scope"] and r["actor"] == a)
    apath = p.analysis / "analysis.json"
    an = {"findings": [], "blocks": []}
    if apath.exists():
        an_raw = lib.read_json(apath)

        def fill(x):
            if isinstance(x, str):
                def rp(m):
                    if m.group(1) in computed:
                        return str(computed[m.group(1)])
                    warns.append(f"analysis: UNFILLED placeholder {{{m.group(1)}}}")
                    return m.group(0)
                return re.sub(r"(?<!\{)\{([a-z_0-9]+)\}(?!\})", rp, x)
            if isinstance(x, list):
                return [fill(i) for i in x]
            if isinstance(x, dict):
                return {k: fill(v) for k, v in x.items()}
            return x
        an_raw = fill(an_raw)
        for b in an_raw.get("blocks", []):
            for row in (b.get("viz") or {}).get("rows", []):
                if isinstance(row.get("value"), str) and re.fullmatch(r"-?\d+(\.\d+)?", row["value"]):
                    row["value"] = float(row["value"]) if "." in row["value"] else int(row["value"])
        for b in an_raw.get("blocks", []):
            ids = check_ids(b.get("detail", ""), f"analysis {b['id']}")
            b["detail"] = cm(b.get("detail", ""))
            for cid in set(ids):
                cited.setdefault(cid, []).append(f"a:{b['id']}")
        an = an_raw

    # ------------------------------------------------------------------ cover numbers, config, layers
    lo, hi, nq = quantity_floor(records)
    values = {"records_in_scope": computed["n_scope"], "records": computed["n_records"], "claims": computed["n_claims"],
              "entities": computed["n_entities"], "sources": computed["n_sources"]}
    cover = []
    for cn in ecfg.get("cover_numbers", []):
        if cn["value"] == "quantity_floor":
            cover.append({**cn, "text": f"at least {lo:,}", "sub": f"up to {hi:,}, from {nq} records"})
        else:
            cover.append({**cn, "text": f"{values.get(cn['value'], cn['value']):,}" if isinstance(values.get(cn['value']), int) else str(cn["value"])})
    layers_data = {f.stem: lib.read_json(f) for f in sorted((p.data / "layers").glob("*.json"))} if (p.data / "layers").exists() else {}
    per = p.cfg.get("period", {})
    D = {
        "meta": {"title": p.cfg["title"], "subtitle": p.cfg.get("subtitle", ""), "brand": ecfg.get("brand", p.cfg["title"]),
                 "tagline": ecfg.get("tagline", ""), "dek": ecfg.get("cover_dek", ""), "asof": per.get("asof", ""),
                 "period": f"{per.get('start', '')} to {per.get('end', '')}", "period_start": per.get("start", ""), "period_end": per.get("end", ""), "built": lib.today(),
                 "contentWarning": ecfg.get("content_warning", ""), "disclaimer": p.cfg.get("protected", {}).get("disclaimer", ""),
                 "recordNoun": ecfg.get("record_noun", ["Record", "Records"]), "entityNoun": ecfg.get("entity_noun", ["Entity", "Entities"])},
        "config": {"actors": ecfg.get("actors", []), "facets": ecfg.get("facets", []), "timeline": ecfg.get("timeline", {}),
                   "regions": ecfg.get("regions", []), "cover": cover, "grades": p.cfg["evidence"]["grades"],
                   "quantity": {"label": p.cfg.get("quantity_name", ""), "low": lo, "high": hi, "n": nq}},
        "chapters": chapters, "claims": claims, "sources": sources, "records": {r["id"]: r for r in records},
        "entities": entities, "glossary": glossary, "an": an, "method": method, "cited": cited, "stats": st,
        "layers": layers_data,
    }

    if errors:
        sys.exit("BUILD FAILED:\n  " + "\n  ".join(sorted(set(errors))))
    for w in sorted(set(warns)):
        print("WARNING", w)

    # ------------------------------------------------------------------ assemble
    layers_js = "\n".join(f.read_text(encoding="utf-8") for f in sorted((p.root / "edition" / "layers").glob("*.js"))) if (p.root / "edition" / "layers").exists() else ""
    layers_css = "\n".join(f.read_text(encoding="utf-8") for f in sorted((p.root / "edition" / "layers").glob("*.css"))) if (p.root / "edition" / "layers").exists() else ""
    tpl = (CORE / "template.html").read_text(encoding="utf-8")
    blob = json.dumps(D, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    out = (tpl.replace("/*__TITLE__*/", esc(D["meta"]["title"])).replace("/*__DESC__*/", esc(D["meta"]["dek"] or D["meta"]["subtitle"]))
           .replace("/*__CSS__*/", (CORE / "style.css").read_text(encoding="utf-8") + "\n" + layers_css)
           .replace("/*__JS__*/", (CORE / "app.js").read_text(encoding="utf-8") + "\n" + layers_js)
           .replace("/*__DATA__*/", blob))
    dest = Path(os.environ["BUILD_EDITION_OUT"]) if os.environ.get("BUILD_EDITION_OUT") else p.build / "edition.html"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(out, encoding="utf-8")
    print(f"OK: {len(chapters)} chapters, {len(records)} records ({computed['n_scope']} in scope), {len(entities)} entities, "
          f"{len(claims)} claims, {len(sources)} sources, {len(out) / 1e6:.2f} MB -> {dest}")


def _rec_ids(r):
    import check_records as cr
    return sorted(cr.rec_claim_ids(r))


if __name__ == "__main__":
    main()
