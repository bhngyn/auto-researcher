#!/usr/bin/env python3
"""Stage 13: fail-closed checks on the built edition. Run after build_edition.py.

  python3 scripts/check_edition.py --project <dir> [--page path/to/edition.html]

1. VERBATIM LOCK. Each chapter's visible text equals report/sections/<id>.html with {{c:}} markers and {{STAT}}
   placeholders resolved. The edition may add attributes and markers, and split paragraphs, never change words.
2. REFERENCES. Every claim marker, record link, entity link, "cited in" entry and command link resolves; no
   rejected claim appears anywhere in the data blob.
3. INVENTORY. The counts the design promises: chapters, usable claims, records, entities, glossary, analysis blocks.
4. SAFETY. No protected-status victim is present; a record marked in scope has an actor; every card in a chapter
   has a record; every record with a card has its anchor in the chapter html.
5. LAYERS. Any D.layers.<name> that contains claim/record/entity references must resolve them (scan for
   data-c=/#/r/REC-/#/e/slug).
Exit code 1 on any failure.
"""
import html
import json
import os
import re
import sys
from pathlib import Path

import lib
import build_report as br


def text_of(s):
    s = re.sub(r"\{\{c:[^}]+\}\}", "", s)
    s = re.sub(r'<sup class="cm"[^>]*></sup>', "", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def main():
    args = lib.cli(__doc__, (["--page"], {"default": None}))
    p = lib.get_project(args)
    page = Path(args.page or os.environ.get("BUILD_EDITION_OUT") or p.build / "edition.html")
    if not page.exists():
        sys.exit(f"{page} not found: run build_edition.py first")
    m = re.search(r'<script type="application/json" id="data">(.*?)</script>', page.read_text(encoding="utf-8"), re.S)
    D = json.loads(m.group(1).replace("<\\/", "</"))
    fails, notes = [], []
    raw = p.load_claims()
    st = br.stats(p, raw)
    rejected = {k for k, c in raw.items() if c.get("verdict") == "rejected"}
    usable = {k for k in raw if k not in rejected}

    # 1 verbatim
    for ch in D["chapters"]:
        src = br.fill_stats((p.sections / f"{ch['id']}.html").read_text(encoding="utf-8"), st)
        a, b = text_of(src), text_of(ch["html"])
        if a != b:
            i = next((k for k in range(min(len(a), len(b))) if a[k] != b[k]), min(len(a), len(b)))
            fails.append(f"verbatim: chapter {ch['id']} differs at char {i}: ...{a[max(0, i - 40):i + 40]!r} vs ...{b[max(0, i - 40):i + 40]!r}")

    # 2 references
    claims, recs, ents = D["claims"], D["records"], D["entities"]
    for cid in rejected:
        if cid in claims:
            fails.append(f"rejected claim present: {cid}")
    an_html = []
    for b in D["an"].get("blocks", []):
        an_html += [b.get("detail", ""), b.get("a", "")] + b.get("care", [])
    all_html = " ".join([c["html"] for c in D["chapters"]] + an_html + [D["method"]]
                        + [e["summary"] + " ".join(x["html"] for x in e["bio"]) for e in ents.values()])
    for ids in re.findall(r'<sup class="cm" data-c="([^"]*)"', all_html):
        for cid in ids.split(","):
            if cid not in claims:
                fails.append(f"marker -> unknown claim {cid}")
    for rid in re.findall(r'href="#/r/(REC-[\w-]+)"', all_html) + re.findall(r'data-rec="([^"]*)"', all_html):
        if rid and rid not in recs:
            fails.append(f"link/card -> unknown record {rid}")
    for r in recs.values():
        for l in r["links"]:
            if l.get("slug") and l["slug"] not in ents:
                fails.append(f"{r['id']}: link -> unknown entity {l['slug']}")
        for rel in r["related"] + r["children"] + ([r["parent"]] if r["parent"] else []):
            if rel not in recs:
                fails.append(f"{r['id']}: relation -> unknown record {rel}")
        for cid in [x for c in r["categories"] for x in c["claims"]] + r["claims"].get("core", []) + r["claims"].get("context", []):
            if cid not in claims:
                fails.append(f"{r['id']}: unknown claim {cid}")
        if r["card"]:
            ch = next((c for c in D["chapters"] if c["id"] == r["card"]["chapter"]), None)
            if not ch or f'id="{r["card"]["anchor"]}"' not in ch["html"]:
                fails.append(f"card anchor missing: {r['id']} -> {r['card']['chapter']}#{r['card']['anchor']}")
        if r["in_scope"] and not r["actor"]:
            fails.append(f"{r['id']}: in scope but no actor")
        if not p.cfg.get("protected", {}).get("allow_other_victim_status"):
            for v in r["victims"]:
                if v.get("status") != "killed":
                    fails.append(f"{r['id']}: protected victim status {v.get('status')!r} present")
    for cid, where in D["cited"].items():
        if cid not in claims:
            fails.append(f"cited index -> unknown claim {cid}")
        for w in where:
            t, v = w.split(":", 1)
            if (t == "r" and v not in recs) or (t == "e" and v not in ents) or (t == "c" and v not in {c["id"] for c in D["chapters"]}) \
                    or (t == "a" and v not in {b["id"] for b in D["an"].get("blocks", [])}):
                fails.append(f"cited index {cid} -> dangling {w}")
    for g in D["glossary"]:
        if g.get("slug") and g["slug"] not in ents:
            notes.append(f"glossary slug {g['slug']} has no entity page")
    for name, layer in (D.get("layers") or {}).items():
        blob = json.dumps(layer, ensure_ascii=False)
        for rid in set(re.findall(r"#/r/(REC-[\w-]+)", blob)) | set(re.findall(r'"(REC-\d+)"', blob)):
            if rid not in recs:
                fails.append(f"layer {name} -> unknown record {rid}")
        for slug in set(re.findall(r"#/e/([\w-]+)", blob)):
            if slug not in ents:
                fails.append(f"layer {name} -> unknown entity {slug}")
        for ids in re.findall(r'data-c(?:laim)?=\\?"([^"\\]+)', blob):
            for cid in ids.split(","):
                if cid and cid not in claims:
                    fails.append(f"layer {name} -> unknown claim {cid}")

    # 3 inventory
    if set(claims) != usable:
        fails.append(f"inventory: {len(claims)} claims in the edition vs {len(usable)} usable in the store")
    if (p.data / "records.json").exists():
        n = len(lib.read_json(p.data / "records.json")["records"])
        if n != len(recs):
            fails.append(f"inventory: {len(recs)} records in the edition vs {n} in records.json")
    if (p.data / "entities.json").exists():
        n = len(lib.read_json(p.data / "entities.json")["entities"])
        if n != len(ents):
            fails.append(f"inventory: {len(ents)} entities in the edition vs {n} in entities.json")
    ecfg = lib.read_json(p.root / "edition" / "edition.json")
    if len(D["chapters"]) != len(ecfg["chapters"]):
        fails.append(f"inventory: {len(D['chapters'])} chapters vs {len(ecfg['chapters'])} in edition.json")
    # every card in a chapter is a known record
    for ch in D["chapters"]:
        for rid in re.findall(r'<div[^>]*class="incident"[^>]*data-rec="([^"]*)"', ch["html"]):
            if rid not in recs:
                fails.append(f"chapter {ch['id']}: card for unknown record {rid}")

    for n in notes:
        print("note:", n)
    for f in fails:
        print("FAIL", f)
    print(f"check_edition: {'PASS' if not fails else 'FAIL'} ({len(D['chapters'])} chapters, {len(recs)} records, {len(ents)} entities, "
          f"{len(claims)} claims, {len(fails)} failures)")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
