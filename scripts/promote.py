#!/usr/bin/env python3
"""Stage 4: turn raw claims + verifier verdicts into verified claims with permanent IDs.

  python3 scripts/promote.py <round> --project <dir> [--apply] [--unit NAME]

Reads   data/raw/<round>/<unit>.json        (research agent)
        data/verdicts/<round>/<unit>.json   (verifier agent: keep | correct | drop per claim index)
Writes  data/verified/<round>.json          claims with ids <round>-<unit>-NNN   (only with --apply)

Rules enforced here (the verifier's `keep` cannot override them):
  * a not_found / no_quote source is dropped unless the verdict gives a replacement_quote that this script
    re-checks against the page (then fetch_status becomes reviewer_confirmed only if the page cannot be fetched
    at all AND the project allows it; otherwise the quote must match the live page);
  * a claim whose sources all fail must be a drop;
  * `correct` must leave at least one usable source;
  * every raw claim needs a verdict (a missing one is an error, never a silent keep);
  * IDs are never reused: a rerun keeps existing IDs and refuses to change a claim already promoted
    unless it is identical.
Dry run by default: prints what it would write.
"""
import sys

import lib

CORRECTABLE = ("statement", "date", "figures", "actor", "victims_named", "category", "location", "entities_named")


def main():
    args = lib.cli(__doc__, ("round", {}), (["--apply"], {"action": "store_true"}), (["--unit"], {"default": None}))
    p = lib.get_project(args)
    raw_dir, vd_dir = p.data / "raw" / args.round, p.data / "verdicts" / args.round
    chk_dir = p.data / "checks" / args.round
    allow_rc = "reviewer_confirmed" in p.good_fetch
    out_path = p.data / "verified" / f"{args.round}.json"
    existing = lib.read_json(out_path) if out_path.exists() else {"track": args.round, "claims": []}
    have = {c["id"]: c for c in existing["claims"]}
    new, errors = [], []
    stats = {"keep": 0, "correct": 0, "drop": 0}
    for f in sorted(raw_dir.glob("*.json")):
        if args.unit and f.stem != args.unit:
            continue
        raw = lib.read_json(f)
        unit = raw.get("unit", f.stem)
        vf, cf = vd_dir / f.name, chk_dir / f.name
        if not vf.exists():
            errors.append(f"{unit}: no verdict file")
            continue
        verdicts = lib.read_json(vf).get("claims", {})
        checks = {(q["claim"], q["source"]): q["status"] for q in (lib.read_json(cf).get("quotes", []) if cf.exists() else [])}
        for ci, c in enumerate(raw.get("claims", [])):
            cid = f"{args.round}-{unit}-{ci + 1:03d}"
            v = verdicts.get(str(ci))
            if not v:
                errors.append(f"{cid}: no verdict for claim index {ci}")
                continue
            kind = v.get("verdict")
            if kind not in ("keep", "correct", "drop"):
                errors.append(f"{cid}: bad verdict {kind!r}")
                continue
            failed = set(v.get("failed_sources", []))
            repl = {int(k): q for k, q in (v.get("replacement_quotes") or {}).items()}
            srcs, why_dropped = [], []
            for si, s in enumerate(c.get("sources", [])):
                s = dict(s)
                st = checks.get((ci, si)) or lib.check_source(s, p)
                if si in failed:
                    why_dropped.append(f"source {si}: verifier failed it")
                    continue
                if st in ("not_found", "no_quote", "fetch_failed", "snippet_only"):
                    q = repl.get(si)
                    if not q:
                        why_dropped.append(f"source {si}: {st}, no replacement quote")
                        continue
                    text, _ = lib.fetch_text(s.get("url", ""), p)
                    if text and lib.excerpt_found(q, text):
                        s["supporting_excerpt"], s["fetch_status"] = q, "confirmed"
                    elif not text and allow_rc:
                        s["supporting_excerpt"], s["fetch_status"] = q, "reviewer_confirmed"
                    else:
                        why_dropped.append(f"source {si}: replacement quote not found on the page")
                        continue
                else:
                    s["fetch_status"] = "partially_supports" if st == "exact" and s.get("fetch_status") == "partially_supports" else "confirmed"
                srcs.append(s)
            if kind != "drop" and not srcs:
                errors.append(f"{cid}: verdict {kind} but no source survives ({'; '.join(why_dropped)}): must be a drop")
                kind = "drop"
            stats[kind] += 1
            claim = {k: c[k] for k in c if k not in ("relation", "proposed_grade", "sources")}
            claim["relation"] = v.get("relation") or c.get("relation", "new")
            if kind == "correct":
                for k in CORRECTABLE:
                    if k in v and v[k] not in (None, ""):
                        claim[k] = v[k]
            for si, o in (v.get("originating_source") or {}).items():
                if int(si) < len(srcs):
                    srcs[int(si)]["originating_source"], srcs[int(si)]["originating_basis"] = o, "verifier"
            claim.update({"id": cid, "sources": srcs,
                          "confidence": v.get("grade") or c.get("proposed_grade") or "C",
                          "verdict": "rejected" if kind == "drop" else ("corrected" if kind == "correct" else "confirmed"),
                          "verification_note": " ".join(x for x in [v.get("reason", ""), v.get("note", "")] if x)
                                               + (f" Dropped sources: {'; '.join(why_dropped)}." if why_dropped else "")})
            if kind == "drop":
                claim["sources"] = srcs or [{"publisher": "", "url": "", "supporting_excerpt": "", "fetch_status": "not_found"}]
            if cid in have:
                if have[cid] != claim and have[cid].get("statement") != claim.get("statement"):
                    errors.append(f"{cid}: already promoted with a different statement; edit through apply_edits.py")
                continue
            new.append(claim)
    for e in errors:
        print("ERROR", e)
    print(f"{len(new)} new claims ({stats}); {len(errors)} errors")
    if not args.apply:
        print("(dry run: nothing written)")
        return
    if errors:
        sys.exit("refusing to write with errors; fix the verdicts (or the raw file) and rerun")
    (p.data / "verified").mkdir(parents=True, exist_ok=True)
    existing["claims"] += new
    existing.setdefault("summary", f"round {args.round}")
    out_path.write_text(lib.dump_json(existing), encoding="utf-8")
    print(f"wrote {out_path}; now run normalize_sources.py")


if __name__ == "__main__":
    main()
