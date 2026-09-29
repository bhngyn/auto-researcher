# Prose review (adversarial; no web)

## Why this exists
<<ORIGINAL_REQUEST>>

The fact-only report is getting new text drafted from verified research. **Default to skepticism.** A sentence
that overstates its source, merges figures, drops an attribution or names a protected person would damage an
accountability report.

## Inputs
- Proposals: `<<DIR>>/out/<REC>.json` (`paragraphs` or `card_html`, plus `note`).
- The item's input, with its claims: search `<<DIR>>/in/*.json` for `"rec": "<REC>"`. For `extend` items this
  includes `new_claims`, `allowed_ids` and `card_html`; for `new_card` items it includes `claims`.
- Full claim records by ID: `grep -l '"<id>"' <<PROJECT_DIR>>/data/verified*/*.json` (staged claims are in
  `<<PROJECT_DIR>>/data/staged/claims.json`).

## Check every sentence
1. **Support.** Every fact is stated by the statement or figures of the claim(s) cited at the end of that
   sentence. Nothing is added: no inference, no computed numbers, no adjectives the claims don't use.
2. **Attribution.** Allegations stay attributed ("X reported/said…"), and partisan sources are identified as
   parties.
3. **Figures.** Each source's figure is kept separate; never merge or average.
4. **Names.** Only people the project's rules allow. <<PROTECTED_RULES>>
5. **Vocabulary.** <<VOCAB_RULE>>
6. **Card integrity.** Don't repeat what the card already says; don't contradict it without saying so
   neutrally. Keep extensions to about 4 sentences and cut the least important facts. Respect decisions in
   `DECISIONS.md` (for example, weak records stay out of the body text).
7. **New cards.** The `<h3>` must equal the registry title (the item's `title`), and the card needs a facts
   line with a grade that matches the best cited claim.

## Output: `<<DIR>>/review/<REC>.json`
```json
{"rec": "REC-0123", "verdict": "accept | revise | reject",
 "paragraphs": ["… only when revising an extension: the full corrected list"],
 "card_html": "… only when revising a new card",
 "reason": "what you changed or why you rejected it (for the editor)"}
```
- Revisions may only **remove or narrow** text, or fix attribution or wording. **Never add facts.**
- Keep every sentence ending in its `{{c:…}}` marker, and cite only IDs in the item's `allowed_ids`.

Reply `done: A accept, R revise, X reject`.
