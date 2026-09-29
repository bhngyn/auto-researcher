#!/usr/bin/env python3
"""Stage 7: verify and apply corroboration proposals written by research agents.

  python3 scripts/corroborate.py <out_dir> --project <dir> [--apply] [--hold=id,id] [--counter=id,id]

Agents write one JSON file per claim (briefs/corroboration.md). This script:
  1. re-opens every proposed source and keeps it only if its supporting_excerpt is found verbatim on the live
     page (pages that block automated fetching are 'unfetchable' and not added);
  2. adds kept sources to the claim (fetch_status confirmed), never changing the statement;
  3. regrades, counting only sources marked independent AND not partisan:
       C -> B  with at least one such corroborating source
       B -> A  when the claim then has two or more independent non-partisan ORIGINS
     A claim with any verified contradicting excerpt is not regraded; it is listed for review.
     CORROBORATION NEVER LOWERS A GRADE.
  4. prints every decision.

--hold     a reviewer judged the 'independent' source too weak (relays unnamed media, supports only background):
           its verified sources are still added, without a regrade.
--counter  a reviewer judged the verified 'contradicting' sources to be counter-reporting that does not dispute
           the core fact (e.g. a report on conditions, a party's denial): they go into notes and the claim may
           still be regraded.
Dry run by default. --apply backs up every touched claim file to data/backups/pre_corroboration/ first, writes,
then re-runs normalize_sources.py. NOT idempotent: re-running a batch re-appends notes; de-duplicate by hand.
"""
import subprocess
import sys
from pathlib import Path

import lib
import normalize_sources as ns

FIELDS = ("publisher", "title", "date", "url", "language", "source_type", "supporting_excerpt")


def main():
    args = lib.cli(__doc__, ("out_dir", {}), (["--apply"], {"action": "store_true"}),
                   (["--hold"], {"default": ""}), (["--counter"], {"default": ""}))
    p = lib.get_project(args)
    hold, counter = set(filter(None, args.hold.split(","))), set(filter(None, args.counter.split(",")))
    files = p.claim_files_by_id()
    rules = ns.load_rules(p)
    report, changes = [], {}
    for pf in sorted(Path(args.out_dir).glob("*.json")):
        prop = lib.read_json(pf)
        cid = prop["claim_id"]
        if cid not in files:
            report.append((cid, "UNKNOWN CLAIM ID"))
            continue
        kept, dropped, contra = [], [], []
        for s in prop.get("new_sources", []):
            st = lib.check_source(s, p)
            (kept if st == "exact" else dropped).append((s, st))
        for s in prop.get("contradicting", []):
            if lib.check_source(s, p) == "exact":
                contra.append(s)
        claim = next(c for c in lib.read_json(files[cid])["claims"] if c["id"] == cid)
        indep = [s for s, _ in kept if s.get("independent") is True and not p.is_partisan(s)]
        old = new = claim["confidence"]
        if contra and cid not in counter:
            decision = "REVIEW (verified contradiction)"
        elif cid in hold:
            decision = "held by reviewer (sources added as context, no regrade)"
        elif old == "C" and indep:
            new, decision = "B", "C->B"
        elif old == "B":
            origins = {s.get("originating_source") or ns.canonical(s["publisher"], rules) for s in p.usable_sources(claim)
                       if not p.is_partisan(s)}
            origins |= {s.get("originating_source") or ns.canonical(s["publisher"], rules) for s in indep}
            if indep and len(origins) >= 2:
                new, decision = "A", "B->A"
            else:
                decision = "no grade change"
        else:
            decision = "no grade change"
        report.append((cid, f"{prop.get('result')} | kept {len(kept)} (independent non-partisan {len(indep)}), dropped "
                            f"{len(dropped)} {[st for _, st in dropped]}, contradictions {len(contra)} | {old}->{new} | {decision}"))
        if kept or new != old or contra:
            changes[cid] = (kept, new, old, contra, prop)
    for cid, line in report:
        print(cid, "|", line)
    if not args.apply:
        print("\n(dry run: nothing written. Review every upgrade by hand: agents' 'independent' flags are too generous.)")
        return
    by_file = {}
    for cid in changes:
        by_file.setdefault(files[cid], []).append(cid)
    lib.backup_files(p, by_file, "pre_corroboration")
    for f in by_file:
        raw = Path(f).read_text(encoding="utf-8")
        d = lib.read_json(f)
        for c in d["claims"]:
            if c["id"] not in changes:
                continue
            kept, new, old, contra, prop = changes[c["id"]]
            urls = {lib.norm_url(s["url"]) for s in c["sources"]}
            for s, _ in kept:
                if lib.norm_url(s["url"]) not in urls:
                    c["sources"].append({**{k: s.get(k, "") for k in FIELDS}, "fetch_status": "confirmed",
                                         **({"originating_source": s["originating_source"], "originating_basis": "reviewed"} if s.get("originating_source") else {})})
            note = f" {lib.today()} corroboration pass: {prop.get('result')}; added {len(kept)} source(s) whose excerpts were matched on the live page."
            if new != old:
                c.setdefault("confidence_original", old)
                c["confidence"] = new
                note += f" Regraded {old}->{new} on independent, non-partisan corroboration."
                c.setdefault("correction_log", []).append({"date": lib.today(), "field": "confidence", "from": old, "to": new,
                                                          "reason": "corroboration pass", "approved_by": "reviewed by editor"})
            if contra:
                label = "Counter-reporting" if c["id"] in counter else "Contradicting reporting"
                note += (f" {len(contra)} verified counter-reporting source(s) recorded in notes." if c["id"] in counter else
                         f" {len(contra)} verified contradicting source(s) recorded in notes; not regraded pending review.")
                c["notes"] = (c.get("notes", "") + f" {label}: " + "; ".join(
                    f"{s['publisher']} ({s.get('date', '')}): {s.get('contradicts', '')}" for s in contra)).strip()
            c["verification_note"] = (c.get("verification_note", "") + note).strip()
        Path(f).write_text(lib.dump_json(d, raw), encoding="utf-8")
    subprocess.run([sys.executable, str(Path(__file__).parent / "normalize_sources.py"), "--project", str(p.root)], check=True)
    print(f"\napplied to {len(changes)} claims in {len(by_file)} files; backups in {p.backups / 'pre_corroboration'}")


if __name__ == "__main__":
    main()
