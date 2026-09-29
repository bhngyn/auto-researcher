#!/usr/bin/env python3
"""A cheap, deterministic scout. Run it BEFORE spending agents; it scopes the risk and aims the next round.

  python3 scripts/scout.py --project <dir>                      coverage report (default)
  python3 scripts/scout.py --project <dir> --partition FIELD    counts by a field, to choose chapters (stage 8)
  python3 scripts/scout.py --project <dir> --publishers         outlets not in the canon; single-origin share
  python3 scripts/scout.py --project <dir> --dupes              claims sharing a normalised URL (likely duplicates)
  python3 scripts/scout.py --project <dir> --unattached         usable claims in no record, with the nearest record by place/date

FIELD is one of: category, grade, actor, region, month, source_type, language, or a claim key (e.g. location).
For records-based partitions use rec:region, rec:actor, rec:category, rec:month, rec:grade.
Every detector hit is a LEAD, not a finding: adversarially verify before fixing (namesakes, spokespeople
denying something, place-name matches that are not the place).
"""
import collections
import re
import sys

import lib
import normalize_sources as ns


def month(c):
    m = re.match(r"(\d{4})-(\d{2})", str(c.get("date", "")))
    return f"{m.group(1)}-{m.group(2)}" if m else (str(c.get("date", ""))[:4] or "undated")


def bar(n, mx, width=30):
    return "#" * max(1 if n else 0, round(width * n / mx)) if mx else ""


def table(counter, title):
    print(f"\n== {title} ({sum(counter.values())})")
    mx = max(counter.values(), default=0)
    for k, v in sorted(counter.items(), key=lambda kv: (-kv[1], str(kv[0]))):
        print(f"  {str(k)[:38]:<38} {v:>5}  {bar(v, mx)}")


def main():
    args = lib.cli(__doc__, (["--partition"], {}), (["--publishers"], {"action": "store_true"}),
                   (["--dupes"], {"action": "store_true"}), (["--unattached"], {"action": "store_true"}))
    p = lib.get_project(args)
    claims = {k: c for k, c in p.load_claims().items() if c.get("verdict") != "rejected"}
    if args.partition:
        f = args.partition
        if f.startswith("rec:"):
            recs = lib.read_json(p.data / "records.json")["records"]
            get = {"region": lambda r: r["where"].get("region", "?"), "actor": lambda r: r["scope"].get("actor_group", "?"),
                   "category": lambda r: (r["categories"][0]["type"] if r.get("categories") else "?"),
                   "month": lambda r: (r["when"].get("start") or "undated")[:7], "grade": lambda r: r.get("evidence", {}).get("best_claim_grade", "?")}[f[4:]]
            table(collections.Counter(get(r) for r in recs if r.get("scope", {}).get("in_scope", True)), f"in-scope records by {f[4:]}")
            print("\n  Rule of thumb: a partition becomes chapters when it yields 3-8 groups of about 8+ records; thinner groups fold into a thematic chapter.")
            return
        getc = {"category": lambda c: c.get("category", "?"), "grade": lambda c: c.get("confidence", "?"), "actor": lambda c: c.get("actor") or "(none)",
                "month": month, "source_type": lambda c: (p.usable_sources(c) or [{}])[0].get("source_type", "?"),
                "language": lambda c: (p.usable_sources(c) or [{}])[0].get("language", "?")}.get(f, lambda c: str(c.get(f, "?")))
        table(collections.Counter(getc(c) for c in claims.values()), f"claims by {f}")
        return
    if args.publishers:
        rules = ns.load_rules(p)
        known = {n for _, n in rules["canon"]}
        unk = collections.Counter()
        origins = collections.Counter()
        for c in claims.values():
            us = p.usable_sources(c)
            for s in us:
                cn = ns.canonical(s.get("publisher", ""), rules)
                if cn not in known:
                    unk[cn] += 1
            origins[c.get("independent_origins", len(us))] += 1
        table(unk, "outlets not in the canon (add patterns to config/publishers.json)")
        table(origins, "claims by independent origins (1 = single-origin)")
        return
    if args.dupes:
        by = collections.defaultdict(list)
        for cid, c in claims.items():
            for s in c.get("sources", []):
                by[lib.norm_url(s.get("url", ""))].append(cid)
        n = 0
        for u, ids in sorted(by.items()):
            ids = sorted(set(ids))
            if u and len(ids) > 1:
                n += 1
                print(f"{u}\n    {', '.join(ids)}")
        print(f"\n{n} normalised URLs are shared by more than one claim (a shared page is fine if the claims are about different things)")
        return
    if args.unattached:
        rp = p.data / "records.json"
        recs = lib.read_json(rp)["records"] if rp.exists() else []
        have = set()
        import check_records as cr
        for r in recs:
            have |= cr.rec_claim_ids(r)
        for cid, c in sorted(claims.items()):
            if cid in have:
                continue
            d = (re.match(r"\d{4}-\d{2}(?:-\d{2})?", str(c.get("date", ""))) or [None])[0]
            near = [r["id"] for r in recs if d and (r["when"].get("start") or "")[:7] == d[:7]
                    and (r["where"].get("place", "") or "~").lower() in c.get("location", "").lower()]
            print(f"{cid}  {c.get('date', '')}  {c.get('location', '')[:40]}  ->  {', '.join(near) or 'NO NEAR RECORD (new record? weak?)'}")
        return
    # default: coverage report
    print(f"{len(claims)} usable claims")
    table(collections.Counter(c.get("confidence", "?") for c in claims.values()), "grade")
    table(collections.Counter(c.get("category", "?") for c in claims.values()), "category")
    months = collections.Counter(month(c) for c in claims.values())
    table(dict(sorted(months.items())), "claims by month  (thin months = candidate gap rounds; compare with your external benchmark)")
    per = p.cfg.get("period", {})
    if per.get("start") and per.get("end"):
        s, e = per["start"][:7], per["end"][:7]
        y, m = int(s[:4]), int(s[5:7])
        empty = []
        while f"{y}-{m:02d}" <= e:
            if f"{y}-{m:02d}" not in months:
                empty.append(f"{y}-{m:02d}")
            m += 1
            if m > 12:
                y, m = y + 1, 1
        print(f"\nmonths in the window with NO claims: {', '.join(empty) or 'none'}")
    single = sum(1 for c in claims.values() if (c.get("independent_origins") or 0) <= 1)
    print(f"\nsingle-origin claims: {single} of {len(claims)} ({100 * single // max(1, len(claims))}%): corroboration candidates (stage 7)")
    part = sum(1 for c in claims.values() if any(p.is_partisan(s) for s in p.usable_sources(c)))
    print(f"claims with a partisan source: {part}")
    print(f"claims naming no actor: {sum(1 for c in claims.values() if not c.get('actor'))}")


if __name__ == "__main__":
    main()
