#!/usr/bin/env python3
"""Stage 11: resolve every {{c:ID}} marker and write the linear (print / archival) report.

  python3 scripts/build_report.py --project <dir>      ->  <dir>/build/report.html

The narrative (report/sections/*.html, report/method.html, report/front.html) cites evidence ONLY through markers
like {{c:r1-track-003}} or {{c:r1-track-003,r2-track-012}}. Each marker resolves against the fact-checked claim
files and becomes a numbered footnote listing the claim's confirmed sources. FAILS CLOSED:
  * unknown claim id            * rejected claim cited            * claim with no usable source cited
{{STAT:KEY}} placeholders are filled from the data (TOTAL USABLE REJECTED GA GB GC URLS CORRECTED SECONDPASS PARTISAN
and LANG_<code>). This module is also imported by build_edition.py.
"""
import collections
import html
import sys
from pathlib import Path

import lib

esc = html.escape

CSS = """
:root{color-scheme:light dark;--bg:#f6f2ea;--ink:#1d1a15;--rule:#cfc7b8}
@media (prefers-color-scheme:dark){:root{--bg:#16140f;--ink:#ece6da;--rule:#3a352b}}
body{background:var(--bg);color:var(--ink);font:18px/1.6 Georgia,serif;max-width:46rem;margin:0 auto;padding:2rem 1rem}
h1,h2,h3{line-height:1.2} sup.fn a{text-decoration:none} .grade{font:600 .75em system-ui;padding:0 .3em;border:1px solid}
.notes li{font:14px/1.45 system-ui;margin:.5rem 0} .cid{font-family:ui-monospace,monospace;font-size:.8em;opacity:.7}
table{border-collapse:collapse;font:14px system-ui} td,th{border-top:1px solid var(--rule);padding:.3rem .5rem;text-align:left;vertical-align:top}
"""


def chapters(p):
    """Chapter list from edition/edition.json, else every section file in name order."""
    cfg = p.root / "edition" / "edition.json"
    if cfg.exists():
        return lib.read_json(cfg).get("chapters", [])
    return [{"id": f.stem, "title": f.stem.replace("-", " ").title(), "part": "Report"} for f in sorted(p.sections.glob("*.html"))]


def stats(p, claims):
    usable = [c for c in claims.values() if c.get("verdict") != "rejected"]
    g = collections.Counter(c.get("confidence") for c in usable)
    srcs = [s for c in usable for s in p.usable_sources(c)]
    st = {"TOTAL": len(claims), "USABLE": len(usable), "REJECTED": len(claims) - len(usable),
          "GA": g["A"], "GB": g["B"], "GC": g["C"], "URLS": len({s.get("url") for s in srcs}),
          "CORRECTED": sum(1 for c in usable if c.get("verdict") == "corrected"),
          "SECONDPASS": sum(1 for c in usable if c.get("secondpass")),
          "PARTISAN": sum(1 for s in srcs if p.is_partisan(s))}
    for lang, n in collections.Counter(s.get("language", "en") for s in srcs).items():
        st[f"LANG_{lang}"] = n
    return st


def fill_stats(text, st):
    import re
    return re.sub(r"\{\{STAT:([A-Za-z_]+)\}\}", lambda m: f"{st[m.group(1)]:,}" if m.group(1) in st else m.group(0), text)


def validate_markers(p, text, claims, where="", errors=None):
    """Append an error for every marker id that is unknown, rejected or unsourced. Returns cited ids."""
    errors = errors if errors is not None else []
    cited = []
    for m in lib.MARKER.finditer(text):
        for i in [x.strip() for x in m.group(1).split(",") if x.strip()]:
            cited.append(i)
            if i not in claims:
                errors.append(f"{where}unknown claim {i}")
            elif claims[i].get("verdict") == "rejected":
                errors.append(f"{where}rejected claim cited {i}")
            elif not p.usable_sources(claims[i]):
                errors.append(f"{where}claim with no confirmed source cited {i}")
    return cited


def fmt_source(s):
    title = s.get("title", "")
    if s.get("title_en") and s["title_en"] != title:
        title = f"{title} [{s['title_en']}]"
    parts = [esc(s.get("publisher", "")), f"“{esc(title)}”"]
    if s.get("date"):
        parts.append(esc(s["date"]))
    url = s.get("url", "")
    link = f'<a href="{esc(url)}" rel="noopener">{esc(url)}</a>' if url and not url.startswith("fixture://") else esc(url)
    return ", ".join(x for x in parts if x) + (f". {link}" if link else "")


def footnote_html(p, ids, claims):
    out = []
    for cid in ids:
        c = claims[cid]
        out.append(f'<span class="grade">{esc(c.get("confidence", "?"))}</span> '
                   + "; ".join(fmt_source(s) for s in p.usable_sources(c)) + f' <span class="cid">[{esc(cid)}]</span>')
    return " — ".join(out)


def main():
    args = lib.cli(__doc__)
    p = lib.get_project(args)
    claims = p.load_claims()
    st = stats(p, claims)
    chs = chapters(p)
    parts = []
    front = p.report / "front.html"
    parts.append(front.read_text(encoding="utf-8") if front.exists()
                 else f"<h1>{esc(p.cfg['title'])}</h1><p>{esc(p.cfg.get('subtitle', ''))}</p>")
    method = p.report / "method.html"
    if method.exists():
        parts.append(method.read_text(encoding="utf-8"))
    for ch in chs:
        f = p.sections / f"{ch['id']}.html"
        if f.exists():
            parts.append(f'<section id="sec-{esc(ch["id"])}">' + f.read_text(encoding="utf-8") + "</section>")
        else:
            print(f"WARN missing section {ch['id']}", file=sys.stderr)
    body = fill_stats("\n".join(parts), st)
    errors = []
    cited_all = set(validate_markers(p, body, claims, errors=errors))
    fn_index, fns = {}, []

    def repl(m):
        ids = [i.strip() for i in m.group(1).split(",") if i.strip()]
        key = tuple(ids)
        if key not in fn_index:
            fns.append(key)
            fn_index[key] = len(fns)
        n = fn_index[key]
        return f'<sup class="fn" id="r{n}-{m.start()}"><a href="#fn{n}">{n}</a></sup>'

    rendered = lib.MARKER.sub(repl, body)
    if errors:
        sys.exit("BUILD FAILED:\n  " + "\n  ".join(sorted(set(errors))))
    notes = "\n".join(f'<li id="fn{i}">{footnote_html(p, k, claims)}</li>' for i, k in enumerate(fns, 1))
    usable = [c for c in claims.values() if c.get("verdict") != "rejected"]
    rows = "\n".join(f'<tr><td class="cid">{"● " if c["id"] in cited_all else ""}{esc(c["id"])}</td><td>{esc(str(c.get("date", "")))}</td>'
                     f'<td>{esc(c["statement"])}</td><td>{esc(c.get("confidence", "?"))}</td></tr>'
                     for c in sorted(usable, key=lambda c: str(c.get("date", ""))))
    out = (f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
           f'<title>{esc(p.cfg["title"])}</title><style>{CSS}</style><body>{rendered}'
           f'<h2 id="notes">Notes</h2><ol class="notes">{notes}</ol>'
           f'<h2 id="register">Evidence register</h2><p>Claims cited in the text are marked ●.</p>'
           f'<table><tr><th>ID</th><th>Date</th><th>Claim</th><th>Grade</th></tr>{rows}</table></body></html>')
    p.build.mkdir(exist_ok=True)
    (p.build / "report.html").write_text(out, encoding="utf-8")
    uncited = sorted(c["id"] for c in usable if c["id"] not in cited_all)
    print(f"OK: {len(fns)} footnotes, {len(cited_all)} distinct claims cited of {len(usable)} usable ({len(claims)} total) -> {p.build / 'report.html'}")
    if uncited:
        print(f"Uncited usable claims ({len(uncited)}): {', '.join(uncited)}")


if __name__ == "__main__":
    main()
