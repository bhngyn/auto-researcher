# Red-team brief: try to disprove this claim

## Why
<<ORIGINAL_REQUEST>>

Every claim below already passed research and fact-checking. You are the **second pass**, and it is only for
**high-stakes claims**: any claim that names an actor as responsible, and any claim in these categories:
<<HIGH_STAKES_CATEGORIES>>. Overstating these does the most damage. Your task is to **disprove** each claim,
and failing that, to find the strongest true version of it.

## Input
`<<DIR>>/input.json`: a list of claims. Each has its statement, date, place, actor, grade, every source with
its excerpt, `originating_source` and the verifier's note.

## For each claim, try to find
1. **Attribution drift.** Does the statement name an actor or a person more firmly than the sources do? Is a
   "suspected/alleged/according to X" missing? Is the actor the source names the same as the one the
   statement uses?
2. **Namesakes and homonyms.** Same name, different person, place or unit.
3. **Relays presented as independent.** Two sources, one origin.
4. **Partisan-only support** presented as neutral.
5. **Time and place slippage.** The excerpt is about another date, another site or a period outside the window.
6. **Figures.** A figure from a different scope (a region-wide total, a cumulative count, combatants included).
7. **A better explanation** in the sources (a different actor blamed by a more direct source; an accident).
8. **Denials or counter-accounts** that the claim leaves out.

Use only the evidence in the input **plus** at most three fresh searches per claim, if the tool budget
allows. Do not use browser tools. `curl` only with `-m 60`.

## Output: `<<DIR>>/out/<claim_id>.json`
```json
{"claim_id": "…",
 "decision": "keep | amend | downgrade | reject",
 "amended_statement": "only for amend: the strongest version the sources support",
 "new_grade": "only for downgrade",
 "reason": "one or two sentences: what you tried, what you found",
 "evidence": [{"ref": "source index or URL", "quote": "exact words from the input"}]}
```
`keep` means you tried and could not weaken it, and it must say what you tried. Do not edit any project
file. When every file is written, reply only: `done: <n files>`.

A script (`apply_edits.py`) turns your decisions into a dry-run diff for the editor. Decisions that change a
grade or a named actor need the user's approval before they are applied.
