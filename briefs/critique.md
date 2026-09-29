# Independent design critique (once, after the first full build)

## Why
<<ORIGINAL_REQUEST>>

An edition has been built: one self-contained document with a cover, chapters, an evidence drawer, an
explorer, a register and dossiers. You have **not** seen the design brief's reasoning, only the brief itself
and the built page. Your job is to review it the way a first-time reader would, then rank what is wrong.

## Inputs
- `build/edition.html` (open it in a browser and take screenshots of each route at desktop width and at phone
  width, in light and dark mode).
- `edition/DESIGN_TEMPLATE.md` (or the project's `DESIGN.md`): the reader questions and the non-negotiable
  constraints. Judge the page against them.

## Method
1. **Reader journeys.** Play at least three: a journalist with five minutes ("what happened and who did it"),
   an investigator building a case on one named person, a returning user looking up one place. For each, say
   where the page delights and where the reader is lost, with a timestamp-like location (route, y-position).
2. **Integrity of the encodings. This is the highest-value pass.** For every visual mark, ask *does this
   overstate certainty?*
   - Are sizes proportional to the *reconciled* figure, or to the most extreme claim?
   - Is "no figure reported" distinguishable from "figures exist but weren't summarised"?
   - Are dates displayed at the precision the source has (a period is not a day)?
   - Do composite grades ("B–C") survive, or are they rounded up to the best letter?
   - Do captions claim anything the data does not?
3. **Legibility.** Fused text, unstyled blocks, clipped axes, overprinting marks, a legend that reads "Agrade A",
   contrast, tap targets, bidirectional text bugs (mixed left-to-right and right-to-left runs).
4. **Answering the brief.** The three jobs are: understand the situation, see who is responsible, explore the
   data. Which job fails? (In the worked example the "who" question was the one that did.)
5. **Rules.** Check the constraints: facts layer untouched, analysis labelled, no protected people named,
   names as in the data, the disclaimer shown.

## Output: `<<DIR>>/CRITIQUE.md`
1. **Verdict**: two paragraphs, naming the single biggest weakness.
2. **Reader journeys**: one paragraph each, with locations.
3. **Findings, ranked by impact** as F1, F2, …: *What* (with evidence and a location), *Why* (the cost to the
   reader or to the record's integrity), *Fix* (specific enough to implement without asking).
4. **Keep**: what is working and must not be lost in the refinement.

Do not edit the edition or any source file. Reply `done: <n findings>`.

## Then
Refine once against the critique, in ranked order. Do not loop. Integrity-of-encoding findings are bugs and are
always fixed; taste findings are the user's call.
