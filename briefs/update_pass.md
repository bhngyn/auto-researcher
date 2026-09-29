# Update-pass brief (stage 16): integrate new findings into a section

## Why
<<ORIGINAL_REQUEST>>

New research has landed in the evidence base since this section was written. The user asked to **update the
document throughout** so that the text reflects the latest findings. You propose edits; a skeptical reviewer
checks them; a script applies them. Do not edit any report file yourself and do not use web or browser tools.

**The priority is accuracy.** Be conservative: where things are hard to determine from open sources, narrow or
caveat the text rather than add to it. Do not reach. Highlight discrepancies: don't hide them, and don't
overstate.

## Input
`<<DIR>>/in/<section>.json`:
- `section_html`: the current section, with its `{{c:ID}}` markers.
- `new_claims`: verified claims added or changed since the section was written, each with `relation` and the
  cards or paragraphs it plausibly belongs to.
- `changed_claims`: claims whose statement, grade or verdict changed (with the `correction_log`), and the
  sentences that cite them.
- `records`: the record profiles for cards in this section (grades, figures, links, counterclaims).
- `open_notes`: review notes to resolve, if any.

## Do
1. **Stale sentences.** For each `changed_claims` entry, does the citing sentence still say what the claim
   now says? Fix, narrow or remove.
2. **New facts.** Add **only** what is new and belongs in this section, in the house style of the section
   (see the prose brief), each sentence ending in its marker.
3. **Discrepancies.** Where sources now conflict, set out both accounts neutrally, attributed.
4. **Grades and facts lines.** Propose a facts-line change only via `facts_grade`, with the reason.
5. **Open notes.** Resolve each conservatively and say what you did.

## Output: `<<DIR>>/out/<section>.json`
```json
{"section": "…",
 "edits": [{"op": "replace | insert_after | remove", "anchor": "text of the sentence (verbatim) or the card id",
            "html": "<p>… {{c:ID}}</p>", "reason": "…"}],
 "notes_resolved": [{"note": "…", "action": "what you did"}],
 "flags": ["anything the editor must decide"]}
```
Hard rules (checked by code): cite only IDs from your input; every number must appear in a cited claim; keep
every sentence ending in a marker; never name a protected person; never add a fact no claim states.

Reply `done <section>: <n edits>`.
