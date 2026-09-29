# examples/toy

A synthetic investigation (invented river basin, invented bodies) that exercises every stage the scripts cover,
offline. Sources use `fixture://<name>` URLs, which `lib.fetch_text` resolves to `fixtures/<name>` in the project.

| Path | Stage |
|---|---|
| `project.json`, `DECISIONS.md` | 0 scope |
| `data/raw/r1, r2` | 2 research output (hand-written stand-ins for agent files) |
| `data/verdicts/r1, r2` | 4 verifier output. `r1/lower-basin` claim 3 is a deliberate drop (excerpt not on the page); `r1/upper-basin` claim 1 is a `correct` (a relay is one origin, not two) |
| `fixtures/*.html` | the "web pages" excerpts are matched against |
| `data/verified/` | **generated** by `promote.py` (the selftest regenerates it) |
| `data/records.json`, `entities.json`, `glossary.json` | 8 structure (records include an out-of-scope one and a weak one) |
| `report/sections/*.html`, `report/method.html` | 10 prose with `{{c:ID}}` markers and `{{STAT:KEY}}` |
| `analysis/analysis.json` | 12 analysis layer, with `{placeholder}` numbers filled by the build |
| `edition/edition.json` | 8/13 the chapter plan and edition labels |

Run everything: `bash scripts/selftest.sh`. Or by hand: see the README at the repo root.
