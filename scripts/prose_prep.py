#!/usr/bin/env python3
"""Stage 10: build the inputs for prose-drafting agents (briefs/prose.md).

  python3 scripts/prose_prep.py --project <dir> [--out data/prose] [--batch-size 8] [--include-weak]

Reads data/records.json, the section files and the claim store. For each record it writes an item:
  extend    the record has a card, and some of its claims are not yet cited in the card
            -> {kind, rec, title, card_html, new_claims[{id, statement, grade, relation?}], allowed_ids}
  new_card  the record is in scope, has no card, and is not weak (weak records only with --include-weak)
            -> {kind, rec, title, claims[...], allowed_ids, page_cards[titles], chapter (a guess: by region)}
Items go to <out>/in/batch-NN.json (a list). Agents write <out>/out/<REC>.json; reviewers write <out>/review/<REC>.json.
"""
import html
import json
import re

import lib
import check_records as cr


def card_div(h, anchor):
    """The full <div id=anchor>...</div> of a card (balanced), or None."""
    m = re.search(rf'<div[^>]*id="{re.escape(anchor)}"[^>]*>', h)
    if not m:
        return None
    depth, i = 0, m.start()
    for t in re.finditer(r"<(/?)div\b[^>]*>", h[i:]):
        depth += -1 if t.group(1) else 1
        if depth == 0:
            return h[i:i + t.end()]
    return None


def main():
    args = lib.cli(__doc__, (["--out"], {"default": "data/prose"}), (["--batch-size"], {"type": int, "default": 8}),
                   (["--include-weak"], {"action": "store_true"}))
    p = lib.get_project(args)
    claims = {k: c for k, c in p.load_claims().items() if c.get("verdict") != "rejected"}
    recs = lib.read_json(p.data / "records.json")["records"]
    ecfg = lib.read_json(p.root / "edition" / "edition.json") if (p.root / "edition" / "edition.json").exists() else {"chapters": []}
    by_region = {c.get("region"): c["id"] for c in ecfg["chapters"] if c.get("region")}
    page_cards = {}
    for f in p.sections.glob("*.html"):
        page_cards[f.stem] = [html.unescape(re.sub(r"<[^>]+>", "", t)) for t in re.findall(r"<h3[^>]*>(.*?)</h3>", f.read_text(encoding="utf-8"), re.S)]
    items = []
    for r in recs:
        ids = sorted(cr.rec_claim_ids(r) & set(claims))
        info = lambda i: {"id": i, "statement": claims[i]["statement"], "grade": claims[i]["confidence"], "date": claims[i].get("date", ""),
                          "figures": claims[i].get("figures", ""), "actor": claims[i].get("actor", "")}
        if r.get("card"):
            h = (p.sections / f"{r['card']['chapter']}.html").read_text(encoding="utf-8")
            card = card_div(h, r["card"]["anchor"]) or ""
            cited = {i.strip() for m in lib.MARKER.finditer(card) for i in m.group(1).split(",")}
            new = [i for i in ids if i not in cited]
            if new:
                items.append({"kind": "extend", "rec": r["id"], "title": r["title"], "chapter": r["card"]["chapter"], "card_html": card,
                              "new_claims": [info(i) for i in new], "allowed_ids": sorted(set(new) | (cited & set(claims)))})
        elif r.get("scope", {}).get("in_scope") and (args.include_weak or not r.get("weak")):
            ch = by_region.get(r["where"].get("region"), "")
            items.append({"kind": "new_card", "rec": r["id"], "title": r["title"], "chapter": ch, "claims": [info(i) for i in ids],
                          "allowed_ids": ids, "page_cards": page_cards.get(ch, []), "date_text": r["when"].get("text", ""),
                          "place": r["where"].get("text", ""), "actor_line": r["scope"].get("actor_line", "")})
    out = p.root / args.out
    (out / "in").mkdir(parents=True, exist_ok=True)
    for d in ("out", "review"):
        (out / d).mkdir(exist_ok=True)
    n = args.batch_size
    for b in range(0, len(items), n):
        (out / "in" / f"batch-{b // n + 1:02d}.json").write_text(json.dumps(items[b:b + n], indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{len(items)} items ({sum(1 for i in items if i['kind'] == 'extend')} extend, "
          f"{sum(1 for i in items if i['kind'] == 'new_card')} new_card) in {(len(items) + n - 1) // n} batches -> {out / 'in'}")


if __name__ == "__main__":
    main()
