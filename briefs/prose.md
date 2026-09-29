# Prose brief: write verified research into the report

## Why
<<ORIGINAL_REQUEST>>

Research claims have been fetched, quote-checked and verified. You are drafting report text that cites them.
**You write proposals only; a script applies them and then runs the report's own checks.** Do not edit any
report file yourself, and do not use web or browser tools.

## House style (study the existing cards in your section file before writing)
- A card is `<div class="incident" data-rec="REC-0001">`, then `<h3>Title (Place, date)</h3>`, then
  `<p class="facts">date · place · actor as attributed · Grade X{{c:IDs}}</p>`, then one or more narrative
  `<p>` elements.
- **Every sentence ends with a claim marker** `{{c:ID}}` or `{{c:ID1,ID2}}`, citing only claims that state
  everything in that sentence. The build fails on an unknown ID, and `check_prose.py` flags any number that is
  not in the cited claims.
- Every fact is attributed: "Outlet X reported that…", "Monitor Y said…". Never state an allegation as fact.
  Partisan sources (parties to the matter) are named as parties.
- <<VOCAB_RULE>>
- Figures are given **per source**, never merged: "Monitor Y said 11 were killed; Outlet X's sources said 14."
- <<PROTECTED_RULES>>
- <<SPELLING_RULE>> Spell names exactly as in the cited claim; `data/name_spellings.json` is the reference.
- <<HOUSE_STYLE>>

## Your task
Your input file `<<DIR>>/in/<batch>.json` lists items of two kinds:
1. **`extend`**: an existing card, with its current HTML and the new verified claims for it (`new_claims`, each
   with a `relation`). Write **1–4 sentences** that add only what is new: a second source, a figure from
   another source, the exact place or date, the unit named, a denial. If a new claim **contradicts** the card,
   write a neutral sentence setting out both accounts. If nothing new is worth adding (it only repeats the
   card), return no paragraphs and give a reason.
2. **`new_card`**: a record with no card yet, with all its claims. Write a full card in the house style, and
   give `after_card_title`: the exact title, copied from `page_cards`, of the card it should follow in date
   order on its page.

## Output: `<<DIR>>/out/<REC>.json`
```json
{"rec": "REC-0123", "kind": "extend | new_card",
 "paragraphs": ["<p>… sentence.{{c:r2-track-001}} … sentence.{{c:r2-track-002,r1-track-013}}</p>"],
 "card_html": "<div class=\"incident\">…</div>   (new_card only)",
 "after_card_title": "exact title from page_cards (new_card only)", "page": "chapter id (new_card only)",
 "facts_grade": "only if the card's grade label should change, e.g. 'A' or 'A–B', with the reason in note",
 "note": "anything the editor should know", "skip_reason": "if you add nothing"}
```
Cite only claim IDs given in your input (`allowed_ids`).

Hard rules, all checked by code:
- **New cards:** the `<h3>` text must be **exactly** the item's `title` (you may add a native-script place name
  in `<span lang="xx">…</span>`, which is ignored when matching). If the title reads badly, keep it and say so
  in `note`.
- **Numbers:** every number you write must appear in a claim you cite for that sentence.
- **Foreign-script text:** any you write must be copied from a cited claim.
- **Names:** every person or place you name must appear in a cited claim or in the existing card. Never name a
  protected person.
- **Facts line:** do NOT change an existing card's facts line (actor line, grade) except by `facts_grade`. For
  cards whose attribution is contested by new research, write a neutral sentence setting out what each source
  says, and leave the attribution itself unchanged.
- **Placement:** extensions go at the end of the card. Start with a short linking phrase if needed ("Further
  reporting:" is fine).

Reply `done <batch>: <n extend>, <n new cards>, <n skipped>`.
