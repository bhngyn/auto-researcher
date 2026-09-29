#!/usr/bin/env python3
"""Stage 10: validate, then apply, prose proposals. Agents propose; this script applies.

  python3 scripts/apply_prose.py --project <dir> [--dir data/prose] [--apply] [--no-review]

For each proposal <dir>/out/<REC>.json (see briefs/prose.md) with its review <dir>/review/<REC>.json (briefs/prose_review.md):
  * review verdict reject -> skipped; revise -> the reviewer's paragraphs/card_html replace the draft; accept -> as drafted;
    no review -> skipped unless --no-review;
  * every marker id must be in the item's allowed_ids and be a usable claim;
  * every number in a marker-ended sentence must appear in the claims that sentence cites (check_prose logic);
  * every sentence (text ending before a marker or at the end of a <p>) needs a marker; a card's <h3> must equal the record title;
  * extend  -> paragraphs are appended to the card <div> (skipped if its first paragraph is already present: idempotent);
  * new_card -> inserted after the card whose <h3> is after_card_title (or appended to the chapter), and records.json gets the card ref.
Dry run by default. --apply backs up the section files and records.json (data/backups/pre_prose_<stamp>/) first.
Afterwards run: check_records.py --derive, build_report.py, check_prose.py, build_edition.py, check_edition.py.
"""
import html
import json
import re
import sys
from pathlib import Path

import lib
import check_prose as cp
from prose_prep import card_div


def plain(h):
    return html.unescape(re.sub(r"<[^>]+>", " ", h))


def validate(fragment_html, allowed, claims, ignore):
    errs = []
    for m in lib.MARKER.finditer(fragment_html):
        for i in [x.strip() for x in m.group(1).split(",")]:
            if i not in claims:
                errs.append(f"unknown/rejected claim {i}")
            elif allowed is not None and i not in allowed:
                errs.append(f"claim {i} not in allowed_ids")
    for bad, cover, last in cp.number_flags(plain(fragment_html), claims, ignore):
        errs.append(f"numbers {bad} not in {cover}: ...{last.strip()[-90:]}")
    for para in re.findall(r"<p[^>]*>(.*?)</p>", fragment_html, re.S):
        t = plain(para).strip()
        if len(t.split()) >= 6 and not re.search(r"\{\{c:[^}]+\}\}\s*$", para.strip()):
            errs.append(f"paragraph does not end in a marker: ...{t[-60:]}")
    return errs


def main():
    args = lib.cli(__doc__, (["--dir"], {"default": "data/prose"}), (["--apply"], {"action": "store_true"}), (["--no-review"], {"action": "store_true"}))
    p = lib.get_project(args)
    claims = {k: c for k, c in p.load_claims().items() if c.get("verdict") != "rejected"}
    ignore = p.cfg.get("prose_check_ignore", [])
    base = p.root / args.dir
    items = {}
    for f in sorted((base / "in").glob("*.json")):
        for it in lib.read_json(f):
            items[it["rec"]] = it
    recpath = p.data / "records.json"
    rdoc = lib.read_json(recpath)
    recs = {r["id"]: r for r in rdoc["records"]}
    plan, problems, skipped = [], [], []
    for of in sorted((base / "out").glob("*.json")):
        prop = lib.read_json(of)
        rid = prop.get("rec")
        it = items.get(rid)
        if not it:
            problems.append(f"{rid}: no input item")
            continue
        rv_path = base / "review" / of.name
        rv = lib.read_json(rv_path) if rv_path.exists() else None
        if rv is None and not args.no_review:
            skipped.append(f"{rid}: no review yet")
            continue
        if rv and rv.get("verdict") == "reject":
            skipped.append(f"{rid}: reviewer rejected ({rv.get('reason', '')[:60]})")
            continue
        para = (rv.get("paragraphs") if rv and rv.get("verdict") == "revise" and rv.get("paragraphs") else prop.get("paragraphs")) or []
        card_html = (rv.get("card_html") if rv and rv.get("verdict") == "revise" and rv.get("card_html") else prop.get("card_html")) or ""
        if prop["kind"] == "extend":
            if not para:
                skipped.append(f"{rid}: nothing to add ({prop.get('skip_reason', '')})")
                continue
            frag = "".join(para)
        else:
            frag = card_html
            m = re.search(r"<h3[^>]*>(.*?)</h3>", frag, re.S)
            title = re.sub(r"<span[^>]*lang=[^>]*>.*?</span>", "", m.group(1)) if m else ""
            if re.sub(r"\W+", " ", plain(title)).strip().lower() != re.sub(r"\W+", " ", it["title"]).strip().lower():
                problems.append(f"{rid}: card <h3> differs from the record title")
        errs = validate(frag, set(it["allowed_ids"]), claims, ignore)
        if errs:
            problems += [f"{rid}: {e}" for e in errs]
            continue
        plan.append((prop, it, para, card_html))
    for s in skipped:
        print("skip", s)
    for pr in problems:
        print("PROBLEM", pr)
    print(f"{len(plan)} proposals valid, {len(skipped)} skipped, {len(problems)} problems")
    if not args.apply:
        print("(dry run: nothing written)")
        return
    if problems:
        sys.exit("refusing to apply with problems: fix or drop the failing proposals")
    files = {p.sections / f"{it['chapter']}.html" for _, it, _, _ in plan if it.get("chapter")} | {recpath}
    lib.backup_files(p, [f for f in files if f.exists()], f"pre_prose_{lib.stamp()}")
    applied = 0
    for prop, it, para, card_html in plan:
        ch = it.get("chapter") or prop.get("page")
        f = p.sections / f"{ch}.html"
        h = f.read_text(encoding="utf-8")
        if prop["kind"] == "extend":
            anchor = recs[prop["rec"]]["card"]["anchor"]
            div = card_div(h, anchor)
            first = plain(para[0]).strip()[:60]
            if not div or first in plain(div):
                print(f"skip {prop['rec']}: card not found or already extended")
                continue
            h = h.replace(div, div[:div.rfind("</div>")] + "\n".join(para) + "\n</div>", 1)
        else:
            cid = f"rec-{prop['rec'].split('-')[-1].lower()}"
            card = re.sub(r"^<div\b", f'<div id="{cid}" data-rec="{prop["rec"]}"', card_html.strip(), count=1) if "data-rec" not in card_html else card_html
            after = prop.get("after_card_title")
            m = re.search(rf"<h3[^>]*>\s*{re.escape(after)}", h) if after else None
            if m:
                start = h.rfind("<div", 0, m.start())
                aid = re.search(r'id="([^"]+)"', h[start:m.start()])
                div = card_div(h, aid.group(1)) if aid else None
                h = h.replace(div, div + "\n" + card, 1) if div else h + "\n" + card
            else:
                h = h.rstrip() + "\n" + card + "\n"
            recs[prop["rec"]]["card"] = {"chapter": ch, "anchor": cid}
        f.write_text(h, encoding="utf-8")
        applied += 1
    recpath.write_text(lib.dump_json(rdoc, recpath.read_text(encoding="utf-8")), encoding="utf-8")
    print(f"applied {applied}; now run check_records.py --derive, build_report.py, check_prose.py, build_edition.py, check_edition.py")


if __name__ == "__main__":
    main()
