#!/usr/bin/env python3
"""Stage 3: mechanical check of a research round, before any verifier agent sees it.

  python3 scripts/check_raw.py <round> --project <dir> [--unit NAME]

For each data/raw/<round>/<unit>.json it fetches every source URL and matches supporting_excerpt against the
live page (whitespace, diacritic and quote-style tolerant, nothing else). Writes data/checks/<round>/<unit>.json:

  quotes[]  {claim, source, url, status}  status: exact | not_found | no_quote | fetch_failed | snippet_only
  flags[]   figures in a statement that appear in no excerpt; a source URL already cited by an existing claim
            (normalised); an empty none_found gap; a claim with no sources
  errors[]  structural problems (missing fields)
"""
import sys
from pathlib import Path

import lib


def main():
    args = lib.cli(__doc__, ("round", {}), (["--unit"], {"default": None}))
    p = lib.get_project(args)
    raw_dir = p.data / "raw" / args.round
    if not raw_dir.exists():
        sys.exit(f"no {raw_dir}")
    out_dir = p.data / "checks" / args.round
    out_dir.mkdir(parents=True, exist_ok=True)
    existing = {}
    for c in p.load_claims().values():
        for s in c.get("sources", []):
            existing[lib.norm_url(s.get("url", ""))] = c["id"]
    totals = {}
    for f in sorted(raw_dir.glob("*.json")):
        if args.unit and f.stem != args.unit:
            continue
        d = lib.read_json(f)
        quotes, flags, errors = [], [], []
        for ci, c in enumerate(d.get("claims", [])):
            if not c.get("statement"):
                errors.append(f"claim {ci}: no statement")
            if not c.get("sources"):
                flags.append(f"claim {ci}: no sources")
            ex_text = " ".join(s.get("supporting_excerpt", "") for s in c.get("sources", []))
            ex_nums = lib.numbers(ex_text)
            miss = sorted(n for n in lib.numbers(c.get("statement", "") + " " + c.get("figures", ""))
                          if n not in ex_nums and not (len(n) == 4 and n.startswith("20")))
            if miss:
                flags.append(f"claim {ci}: figures {miss} are in the statement but in no excerpt")
            for si, s in enumerate(c.get("sources", [])):
                status = lib.check_source(s, p)
                quotes.append({"claim": ci, "source": si, "url": s.get("url", ""), "status": status})
                prior = existing.get(lib.norm_url(s.get("url", "")))
                if prior and c.get("relation") != "adds_detail":
                    flags.append(f"claim {ci} source {si}: URL already cited by existing claim {prior}")
        for g in d.get("gaps", []):
            if g.get("status") == "none_found" and not g.get("searches"):
                flags.append(f"gap {g.get('field')}: none_found without the searches listed (use not_researched)")
        (out_dir / f.name).write_text(lib.dump_json({"unit": d.get("unit", f.stem), "quotes": quotes,
                                                     "flags": flags, "errors": errors}), encoding="utf-8")
        for q in quotes:
            totals[q["status"]] = totals.get(q["status"], 0) + 1
        print(f"{f.stem}: {len(d.get('claims', []))} claims, {len(quotes)} sources, {len(flags)} flags, {len(errors)} errors")
    print("excerpt status totals:", totals)


if __name__ == "__main__":
    main()
