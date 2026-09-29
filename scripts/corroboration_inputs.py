#!/usr/bin/env python3
"""Stage 7: list the claims worth a corroboration agent and write batch inputs for briefs/corroboration.md.

  python3 scripts/corroboration_inputs.py --project <dir> [--out data/corrob] [--grades B,C] [--category abuse,...]
                                          [--batch-size 12] [--group record|category] [--only-in-scope]

Selects usable claims whose grade is in --grades AND that rest on <= 1 independent origin. Groups them by the record
that cites them (so an agent researches one event at a time) or by category. Writes <out>/batch-NN/input.json and an
empty <out>/batch-NN/out/. Claims that are already reviewed (a corroboration note in verification_note) are skipped
unless --again.
"""
import json

import lib
import check_records as cr


def main():
    args = lib.cli(__doc__, (["--out"], {"default": "data/corrob"}), (["--grades"], {"default": "B,C"}),
                   (["--category"], {"default": ""}), (["--batch-size"], {"type": int, "default": 12}),
                   (["--group"], {"default": "record"}), (["--only-in-scope"], {"action": "store_true"}),
                   (["--again"], {"action": "store_true"}))
    p = lib.get_project(args)
    claims = {k: c for k, c in p.load_claims().items() if c.get("verdict") != "rejected"}
    grades, cats = set(args.grades.split(",")), set(filter(None, args.category.split(",")))
    rp = p.data / "records.json"
    recs = lib.read_json(rp)["records"] if rp.exists() else []
    owner = {}
    for r in recs:
        if args.only_in_scope and not r.get("scope", {}).get("in_scope"):
            continue
        for cid in cr.rec_claim_ids(r):
            owner.setdefault(cid, r["id"])
    sel = []
    for cid, c in sorted(claims.items()):
        if c.get("confidence") not in grades or (c.get("independent_origins") or 0) > 1:
            continue
        if cats and c.get("category") not in cats:
            continue
        if args.only_in_scope and cid not in owner:
            continue
        if not args.again and "corroboration pass" in c.get("verification_note", ""):
            continue
        sel.append(cid)
    key = (lambda cid: owner.get(cid, "~none")) if args.group == "record" else (lambda cid: claims[cid].get("category", ""))
    sel.sort(key=lambda cid: (key(cid), cid))
    out = p.root / args.out
    n = args.batch_size
    for b in range(0, len(sel), n):
        d = out / f"batch-{b // n + 1:02d}"
        (d / "out").mkdir(parents=True, exist_ok=True)
        items = []
        for cid in sel[b:b + n]:
            c = claims[cid]
            items.append({"claim_id": cid, "record": owner.get(cid), "statement": c["statement"], "date": c.get("date", ""),
                          "location": c.get("location", ""), "actor": c.get("actor", ""), "grade": c["confidence"],
                          "sources": [{"publisher": s.get("publisher"), "url": s.get("url"), "originating_source": s.get("originating_source"),
                                       "source_type": s.get("source_type")} for s in p.usable_sources(c)]})
        (d / "input.json").write_text(json.dumps(items, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{len(sel)} claims selected of {len(claims)} usable; {(len(sel) + n - 1) // n} batches in {out}")


if __name__ == "__main__":
    main()
