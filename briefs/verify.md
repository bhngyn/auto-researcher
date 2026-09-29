# Verification brief (adversarial, default-skeptical)

## Why
<<ORIGINAL_REQUEST>>

Research agents wrote `data/raw/<<ROUND>>/<UNIT>.json` following the research brief. **You are the verification
pass: assume every claim may be invented, overstated or misattributed until you have checked it.** A wrong
figure, name or attribution in an accountability record does real harm.

## Inputs
- `data/raw/<<ROUND>>/<UNIT>.json`: the draft claims.
- `data/checks/<<ROUND>>/<UNIT>.json`: automatic results. `quotes[]` has a `status` per (claim, source):
  - `exact`: the script found the excerpt on the page. You must **still** check that the excerpt supports the
    statement, is about **this** event (same place and date, not a namesake or an earlier event), and gives
    the same figures.
  - `fuzzy` / `not_found` / `no_quote`: re-open the URL yourself (WebFetch asking for the exact verbatim
    paragraph, or `curl -m 60 -sL -A "Mozilla/5.0" <url>`). If the page does not say it, that source **fails**.
  - `fetch_failed`: the site blocks the script. Check it with WebFetch. Your judgement decides, but you must
    supply the verbatim passage in `replacement_quotes`.
  - `snippet_only`: never enough on its own. Try to open the page. If you cannot, the source fails.
  - `flags[]` and `errors[]`: figures missing from excerpts, possible protected names, re-submitted URLs, empty
    `none_found`. Resolve every one.
- For a record-level unit, `data/checks/…/in/<UNIT>.json` holds the record as already known, with its existing
  claims and `already_cited_urls`.

## Check each claim
1. **Support.** Every fact in `statement`, `date`, `figures`, `actor` and `victims_named` must be stated by a
   surviving source. Narrow the claim (`correct`) to what the sources say, or `drop` it.
2. **Same event.** Does it match the unit's place and date window? If it is a different event, set `relation`
   to `new_related_event`, or drop it if it is out of scope.
3. **Attribution.** Allegations stay attributed ("X said…"). A source's certainty must not be upgraded. The
   actor is as the source names it, never inferred.
4. **Independence.** Is the source a relay of an origin already cited ("according to Outlet Q", "citing
   Monitor M")? Set `originating_source` correctly and decide whether it is independent of every origin in the
   existing claims.
5. **Grade.** <<GRADE_RUBRIC>> Grade the claim on its own sources.
6. **Privacy.** <<PROTECTED_RULES>> Names must be spelled exactly as the source prints them.
7. **Vocabulary.** <<VOCAB_RULE>>

## Tools
WebFetch, WebSearch, `curl -m 60 …` via Bash (**always with a timeout**; never leave a download running),
Read/Grep. **Never use browser tools.** Edit nothing except your own output files.

## Output: `data/verdicts/<<ROUND>>/<UNIT>.json`
```json
{"unit": "<UNIT>",
 "claims": {
  "0": {"verdict": "keep | correct | drop",
        "statement": "corrected statement (only if correct)", "date": "…", "figures": "…", "actor": "…",
        "victims_named": [], "relation": "…", "category": "…",
        "failed_sources": [1], "replacement_quotes": {"0": "verbatim passage you saw on the page"},
        "independent_of_existing": true, "originating_source": {"0": "…"},
        "grade": "A | B | C", "note": "caveat worth showing readers (optional)", "reason": "why (for the editor)"}
 },
 "gaps_ok": true, "gaps_note": "whether none_found entries look honest (enough searches, other languages included)",
 "summary": "n kept / n corrected / n dropped; notable problems"}
```
Rules enforced by `scripts/promote.py` after you:
- A `not_found` or `no_quote` source cannot be rescued by `keep`. It survives only with a `replacement_quotes`
  passage, which the script re-checks against the page.
- A claim whose sources all fail must be `drop`.
- A `correct` must be supportable by the surviving sources alone.
- When in doubt, narrow or drop.

Cover **every** claim index in the draft. Reply only: `done <UNIT>: K kept, C corrected, D dropped` (one line
per unit).
