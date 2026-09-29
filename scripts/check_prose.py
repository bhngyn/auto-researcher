#!/usr/bin/env python3
"""Stage 11: deterministic prose checks on report sections (and method.html).

  python3 scripts/check_prose.py --project <dir>

1. Numbers: every number in a cited sentence must appear in the text of the claims that sentence cites
   (statement, figures, date, location, notes, actor, excerpts). Catches invented or drifted figures.
2. Uncited text: flags a tail of 8+ word sentences with digits that follow the last marker of a file.

A list's numbers are credited to the marker that closes its "...:" lead-in. Known false positives (date lines,
grade labels, a name with a digit) belong in project.json -> "prose_check_ignore": ["substring", ...]; any new
flag is a bug in the prose until proven otherwise. Exit code 1 if flags exceed project.json
"prose_check_baseline" (default 0).
"""
import html
import re
import sys
from pathlib import Path

import lib


def number_flags(text, C, ignore=()):
    """Yield (bad_numbers, cited_ids, sentence) for every marker segment whose sentence has a number that no cited claim states.
    `text` is tag-stripped, unescaped prose with {{c:ID}} markers still in it."""
    pos, lead_ids = 0, []
    for m in lib.MARKER.finditer(text):
        seg = text[pos:m.start()]
        pos = m.end()
        ids = [i.strip() for i in m.group(1).split(",")]
        cover = ids + [i for i in lead_ids if i not in ids]
        lead_ids = ids if seg.rstrip().endswith(":") else []
        ctext = " ".join(lib.claim_text(C[i]) for i in cover if i in C)
        cnums = lib.numbers(ctext)
        sent = re.split(r"(?<=[.!?])\s+(?=[A-Z\u201c\"(])", seg.strip())
        last = sent[-1] if sent else seg
        bad = [n for n in lib.numbers(last) if n not in cnums and not (len(n) == 4 and n.startswith("20") and n in ctext)]
        bad = [n for n in bad if not (n in {"1", "2", "3"} and re.search(rf"\b{n}(st|nd|rd|th)\b", last))]
        if bad and not any(s in last for s in ignore):
            yield bad, cover, last
    return


def main():
    args = lib.cli(__doc__)
    p = lib.get_project(args)
    C = p.load_claims()
    ignore = p.cfg.get("prose_check_ignore", [])
    files = sorted(p.sections.glob("*.html")) + [p.report / "method.html", p.report / "front.html"]
    flagged = 0
    for f in files:
        if not f.exists():
            continue
        raw = f.read_text(encoding="utf-8")
        text = html.unescape(re.sub(r"<[^>]+>", " ", raw))
        for bad, cover, last in number_flags(text, C, ignore):
            flagged += 1
            print(f"NUM {f.name}: {bad} not in {cover}\n    ...{last.strip()[-260:]}")
        last_end = 0
        for m in lib.MARKER.finditer(text):
            last_end = m.end()
        for s in re.split(r"(?<=[.!?])\s+", text[last_end:]):
            if len(s.split()) >= 8 and re.search(r"\d", s) and not any(i in s for i in ignore):
                flagged += 1
                print(f"UNCITED-TAIL {f.name}: {s.strip()[:200]}")
    base = int(p.cfg.get("prose_check_baseline", 0))
    print(f"\n{flagged} items flagged (baseline {base})")
    sys.exit(1 if flagged > base else 0)


if __name__ == "__main__":
    main()
