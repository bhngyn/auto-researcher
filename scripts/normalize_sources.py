#!/usr/bin/env python3
"""Stage 6: add outlet-identity and origin fields to every source in data/verified*/.

  python3 scripts/normalize_sources.py --project <dir> [--dry-run]

Additive only. It never changes a claim's id, statement, verdict, confidence, or any source's
publisher/url/fetch_status. Per source it sets:
  publisher_canonical  one name per outlet (spelling variants collapse)
  originating_source   who the information came from, if the source attributes it to someone else
                       (a wire, a monitor, a party); else the outlet itself
  originating_basis    self | publisher_note ("(AFP)", "citing X") | excerpt_attribution (exactly one known
                       originator named in the excerpt/title) | ambiguous (several named; left as self)
Per claim it sets independent_origins: distinct originating_source values among usable sources.
Re-runnable. First run backs up data/verified*/ to data/backups/pre_normalize/.

Outlet knowledge lives in scripts/publishers.default.json plus <project>/config/publishers.json (checked
first). Grow the project file as the scout (scripts/scout.py --publishers) lists unrecognised names.
"""
import re
import sys
from collections import Counter
from pathlib import Path

import lib

NEW_SOURCE_FIELDS = {"publisher_canonical", "originating_source", "originating_basis"}


def load_rules(p):
    rules = lib.read_json(lib.REPO / "scripts" / "publishers.default.json")
    extra = p.root / "config" / "publishers.json"
    if extra.exists():
        e = lib.read_json(extra)
        for k in ("canon", "publisher_origin", "excerpt_origin"):
            rules[k] = e.get(k, []) + rules.get(k, [])
        rules["party_publishers"] = e.get("party_publishers", []) + rules.get("party_publishers", [])
    return rules


def canonical(pub, rules):
    low = pub.lower()
    for pat, name in rules["canon"]:
        if re.search(pat, low):
            return name
    s = re.split(r"\s*(?:\(|,| via | citing | — |, via)", pub)[0]  # drop qualifiers: "(AFP)", "via X", "citing X"
    s = re.sub(r"[؀-ۿ]+", "", s).strip(" -–—,")
    return s or pub


def origin(src, canon, rules):
    low = src.get("publisher", "").lower()
    for pat, name in rules["publisher_origin"]:
        if re.search(pat, low) and name != canon:
            return name, "publisher_note"
    found = set()
    # The excerpt is the evidence actually relied on, so its attribution wins; the headline only if the excerpt names no one.
    for text in (src.get("supporting_excerpt", ""), src.get("title", "") + " " + src.get("title_en", "")):
        found = {name for pat, name in rules["excerpt_origin"] if re.search(pat, text, re.I)} - {canon}
        if found:
            break
    if len(found) == 1:
        return found.pop(), "excerpt_attribution"
    if len(found) > 1:
        return canon, "ambiguous"
    return canon, "self"


def normalise_file(path, p, rules, stats, canon_n):
    raw = Path(path).read_text(encoding="utf-8")
    d = lib.read_json(path)
    before = lib.read_json(path)
    for c in d.get("claims", []):
        origins = set()
        for s in c.get("sources", []):
            cn = canonical(s.get("publisher", ""), rules)
            # keep a human/verifier-set origin: only recompute when the previous basis was machine-made
            if s.get("originating_basis") in (None, "self", "publisher_note", "excerpt_attribution", "ambiguous"):
                o, basis = origin(s, cn, rules)
                s["originating_source"], s["originating_basis"] = o, basis
            s["publisher_canonical"] = cn
            stats[s.get("originating_basis", "?")] += 1
            canon_n[cn] += 1
            if s.get("fetch_status", "confirmed") in p.good_fetch:
                origins.add(s.get("originating_source") or cn)
        c["independent_origins"] = len(origins)
    for a, b in zip(before.get("claims", []), d.get("claims", [])):  # guard: nothing but the new fields may differ
        for k in a:
            if k == "sources":
                for sa, sb in zip(a[k], b[k]):
                    assert all(sa[x] == sb[x] for x in sa if x not in NEW_SOURCE_FIELDS), (path, a["id"])
            elif k != "independent_origins":
                assert a[k] == b[k], (path, a["id"], k)
    return d, raw


def main():
    args = lib.cli(__doc__, (["--dry-run"], {"action": "store_true"}))
    p = lib.get_project(args)
    rules = load_rules(p)
    files = p.verified_files()
    if not args.dry_run:
        bk = p.backups / "pre_normalize"
        if bk.exists():
            print(f"keeping existing backup {bk} (it holds the pre-normalisation originals)")
        else:
            lib.backup_files(p, files, "pre_normalize")
    stats, canon_n = Counter(), Counter()
    for f in files:
        d, raw = normalise_file(f, p, rules, stats, canon_n)
        if not args.dry_run:
            Path(f).write_text(lib.dump_json(d, raw), encoding="utf-8")
    print(("DRY RUN " if args.dry_run else "") + f"{len(files)} files; basis {dict(stats)}; {len(canon_n)} canonical outlets")


if __name__ == "__main__":
    main()
