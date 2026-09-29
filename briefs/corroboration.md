# Corroboration brief (batch <<N>>)

## Who asked and why
<<ORIGINAL_REQUEST>>

Many claims in this evidence base rest on a single originating source (a monitor, a local group, a party, one
outlet) and are graded C or B. Your job is to find **independent** corroboration, or contradiction, so the
grades can be reviewed honestly. You propose; a script verifies and applies.

## Input
`<<DIR>>/input.json`: a list of claims, each with its text, date, place, alleged actor, current grade and
current sources (publisher, URL, originating source).

## What to do for EACH claim
1. Search the open web in **<<LANGUAGES>>** (use native-script place names) for reporting of the **same
   event**: same place, same date window, same kind of harm. Good places to look: <<PREFERRED_SOURCES>>.
2. **Independence rule (strict).** A source corroborates only if its information does not come from the same
   originator as the current sources.
   - An outlet quoting the same statement, the same monitor's post, or republishing the same article is **not**
     independent. Record it as `same_origin`.
   - Also **not** independent: an outlet that says "according to media / activists / social media" without
     its own source, and Wikipedia.
   - A source that confirms the event but not the claim's specific figure, actor or named person corroborates
     **only that part**. Set `result` to `partially_corroborated` and say exactly which part in `supports`.
     (Reviewers overturn many "independent" flags for these reasons. Be strict.)
   - Independent = its own reporters or witnesses, a different monitor, an official or NGO investigation,
     satellite or other physical analysis, or a party with its own account.
3. **Open every page you cite** (WebFetch). Copy a **verbatim** excerpt (original language, exact characters,
   no paraphrase, no ellipses inside) that supports the specific detail: place, date, actor, figure. If you
   cannot open a page, do not cite it.
4. Also record anything that **contradicts** the claim (a different actor, date or figure, or a denial), with a
   verbatim excerpt.
5. Do not change the claim text. Do not edit any project file.

## Output: one file per claim
Write `<<DIR>>/out/<claim_id>.json` (plain JSON, UTF-8) with exactly:
```json
{
  "claim_id": "...",
  "result": "corroborated | partially_corroborated | same_origin_only | none_found | contradicted",
  "new_sources": [
    {"publisher": "...", "title": "...", "date": "YYYY-MM-DD", "url": "...", "language": "en",
     "source_type": "media|local_monitor|UN|NGO|official|OSINT|partisan_<party>",
     "supporting_excerpt": "verbatim text from the page",
     "supports": "which details of the claim this supports (place/date/actor/figure)",
     "originating_source": "who the information comes from",
     "independent": true,
     "independence_reason": "why this is (or is not) independent of the current sources"}
  ],
  "contradicting": [ {"same fields as above": "…", "contradicts": "what it contradicts"} ],
  "notes": "short: what you searched, what differs (e.g. a figure differs), anything uncertain"
}
```
Include `same_origin` finds in `new_sources` with `"independent": false`: they are useful context.

## Rules
- Facts only. Never invent a source, URL, date or quote. If nothing is found, say `none_found`.
- <<PROTECTED_RULES>> (Sources may name protected people inside a verbatim excerpt; do not repeat their names
  elsewhere, including in `notes`.)
- **Do not use browser tools.** Use WebSearch and WebFetch only; `curl` only with `-m 60`.
- Budget: about 3–6 searches per claim. Stop when the event is clearly covered or clearly absent. If a tool
  budget error appears, stop and mark the rest `not_researched` in `notes`.
- When all files are written, reply with just: `done: <n files written>`.

## What happens next (for the orchestrator)
`python3 scripts/corroborate.py <<DIR>>/out` is a dry run: it re-opens each proposed source and keeps it only
if its excerpt is found on the live page. **Review every upgrade by hand** before `--apply`. Grade rules: C→B
needs one independent non-partisan source; B→A needs two or more independent non-partisan origins; any
verified contradiction is flagged, not regraded; corroboration never lowers a grade.
