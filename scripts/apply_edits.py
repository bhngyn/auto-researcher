#!/usr/bin/env python3
"""Stage 7b: apply edits to existing claims: propose -> dry run -> flagged changes -> --apply.

  python3 scripts/apply_edits.py edits.json --project <dir> [--apply]

edits.json is a list (red-team decisions, wording fixes, regrades, verifier corrections all use it):
  [{"claim_id": "r1-track-004",
    "set": {"statement": "...", "confidence": "B", "actor": "..."},     # fields to change
    "reason": "why (goes into correction_log and verification_note)",
    "approved_by": "user 2026-09-24"}]                                   # required for flagged edits

Guards:
  * never changes id or sources (use corroborate.py for sources);
  * FLAGGED (need approved_by): any change to confidence, verdict, actor, entities_named; a statement that
    shrinks by more than 30 %; numbers added to or removed from a statement;
  * a claim with verdict 'rejected' is never edited (rejected stays rejected, and keeps its ID);
  * dry run by default, and prints old -> new for every field.
--apply backs up each touched claim file (never overwriting an existing backup), writes, appends a
correction_log entry (date, field, from, to, reason, approved_by), preserves confidence_original the first
time a grade changes, then re-runs normalize_sources.py. Tell every session that cites these claim IDs (bios,
analysis, prose) when a statement changes.
"""
import subprocess
import sys
from pathlib import Path

import lib

ALWAYS_FLAG = {"confidence", "verdict", "actor", "entities_named"}
FORBIDDEN = {"id", "sources"}


def main():
    args = lib.cli(__doc__, ("edits", {}), (["--apply"], {"action": "store_true"}))
    p = lib.get_project(args)
    edits = lib.read_json(args.edits)
    files = p.claim_files_by_id()
    claims = p.load_claims()
    problems, plan = [], []
    for e in edits:
        cid = e.get("claim_id")
        c = claims.get(cid)
        if not c:
            problems.append(f"{cid}: unknown claim")
            continue
        if c.get("verdict") == "rejected":
            problems.append(f"{cid}: rejected claims are never edited")
            continue
        flags = []
        for k, new in e.get("set", {}).items():
            if k in FORBIDDEN:
                problems.append(f"{cid}: field {k} may not be edited here")
                continue
            old = c.get(k)
            if old == new:
                continue
            if k in ALWAYS_FLAG:
                flags.append(f"{k} changes")
            if k == "statement":
                if len(new) < 0.7 * len(old):
                    flags.append("statement shrinks by more than 30%")
                added, removed = lib.numbers(new) - lib.numbers(old), lib.numbers(old) - lib.numbers(new)
                if added or removed:
                    flags.append(f"numbers change (+{sorted(added)} -{sorted(removed)})")
            plan.append((cid, k, old, new, e))
        if flags and not e.get("approved_by"):
            problems.append(f"{cid}: FLAGGED ({'; '.join(flags)}) but no approved_by")
        if not e.get("reason"):
            problems.append(f"{cid}: no reason")
        if flags:
            print(f"FLAG {cid}: {'; '.join(flags)}  [approved_by: {e.get('approved_by') or 'MISSING'}]")
    for cid, k, old, new, e in plan:
        print(f"{cid} {k}:\n    - {str(old)[:200]}\n    + {str(new)[:200]}\n    ({e.get('reason', '')})")
    for pr in problems:
        print("PROBLEM", pr)
    print(f"\n{len(plan)} field changes, {len(problems)} problems")
    if not args.apply:
        print("(dry run: nothing written)")
        return
    if problems:
        sys.exit("refusing to apply with problems")
    touched = {files[cid] for cid, *_ in plan}
    lib.backup_files(p, touched, f"pre_edits_{lib.stamp()}")
    for f in touched:
        raw = Path(f).read_text(encoding="utf-8")
        d = lib.read_json(f)
        for c in d["claims"]:
            for cid, k, old, new, e in plan:
                if c["id"] != cid:
                    continue
                if k == "confidence":
                    c.setdefault("confidence_original", old)
                c[k] = new
                c.setdefault("correction_log", []).append({"date": lib.today(), "field": k, "from": old, "to": new,
                                                          "reason": e.get("reason", ""), "approved_by": e.get("approved_by", "")})
                c["verification_note"] = (c.get("verification_note", "") + f" {lib.today()}: {k} edited: {e.get('reason', '')}").strip()
        Path(f).write_text(lib.dump_json(d, raw), encoding="utf-8")
    subprocess.run([sys.executable, str(Path(__file__).parent / "normalize_sources.py"), "--project", str(p.root)], check=True)
    print(f"applied {len(plan)} changes to {len(touched)} files")


if __name__ == "__main__":
    main()
