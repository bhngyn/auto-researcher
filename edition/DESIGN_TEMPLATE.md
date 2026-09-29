# Edition design template

The skeleton the edition always has. **Research decides which chapters exist and how many; this file decides
the rules every edition follows.** Copy it into a project as `edition/DESIGN.md` and fill the bracketed parts
once the research has shaped the structure (stage 8).

Output: one self-contained HTML file. One document, one design system, one router, one data store, one
evidence drawer. No iframes. No network calls for data. Works from `file://`.

## 0. Constraints (non-negotiable)

- **Facts layer untouched.** Section prose (`report/sections/*.html`) is rendered *verbatim*. The renderer can split
  paragraphs, reorder, collapse and annotate; it never rewrites. Any connective text the edition adds is either
  *structural* ("4 events, Feb 2024–Jul 2025", computed at build time) or *navigational*. The edition adds no
  new factual sentence. `check_edition.py` enforces this by comparing text.
- **Analysis stays visibly separate.** Own chapter, distinct marginal rule, a label: "Analysis: an inference from
  the claims, not a finding."
- Every claim marker resolves to a usable claim. Rejected claims are never shown. Weak records are shown with the
  "weakly sourced" flag. Out-of-scope records are shown greyed and labelled, never hidden.
- **Protected people are never named.** The dead appear only where the record already names them.
- Names are shown exactly as in the data. No spelling is coined.
- The content warning (if any) and "being named is not a finding of responsibility" are shown prominently.
- Glossary and named entities stay separate, cross-linked by `slug`.
- Records are keyed on stable IDs. Card anchors are only a way to join prose to the database.

## 1. Reader questions → where they are answered

Fill this table from the user's question. The worked example's version:

| Question | Answer surface |
|---|---|
| What happened, where and when? | **Cover**: the Chronicle (place × time) and the map, linked |
| How bad, and how sure are we? | Figures shown as ranges, never a single number; a grade glyph on every mark |
| Who is responsible? | **Responsibility** chapters: force structure → named entities → records, with link strength |
| What is the pattern? | **Analysis**: one question per block |
| Show me the evidence | The **drawer**, from anywhere: claim → statement, grade, origins, sources, excerpts, "cited in…" |
| Let me work with it | **Explorer**, **Entities**, **Register**, **Glossary**, **Data** downloads |

## 2. Two universal encodings

1. **Grade = shape**, so it never depends on colour: **A ■ solid**, **B ◧ half**, **C □ open**, plus a split
   square for a mixed grade ("B–C"). Used on markers in prose, map and chart marks (fill level), tables, cards,
   and shown in one legend on the cover. Marks use a record's **lowest** grade; the qualifier stays in the tooltip.
2. **Actor = colour**, the one categorical colour. 3–5 hues validated pairwise in both modes, plus grey for
   "not attributed / disputed" and a dashed grey for out-of-scope. Nothing else is coloured for decoration.

Link strength (responsibility layer): **L1 direct ●, L2 area command ◑, L3 presence ○**.

## 3. Aesthetic: "the documentary ledger"

Sober, archival, precise: a fine-press atlas. Paper-and-ink palette (warm paper `#f6f2ea` light, smoked ink
`#16140f` dark). A text serif for prose (optical-size cut, 18/1.6), a condensed sans for data labels and UI
with tabular numerals, a mono for claim IDs, and a script-appropriate font for non-Latin text (`lang`
attribute set). Ornament: only ruled margins and hairlines. Motion: one staggered reveal on the cover and
smooth scrubbing on the chronicle. Offline fallbacks for every web font.

## 4. Layout

3-column grid on wide screens: **nav rail** (left, collapsible) · **text column** (≤ 68ch) · **margin column**
(sidenotes, mini-graphics, 280px). The **drawer** slides over from the right (420px) and never navigates away.
Below 1100px margin notes collapse to tap-to-expand inline markers; below 720px the rail becomes a top sheet.
A persistent top bar: title, **Search (⌘K or `/`)** over records, entities, chapters, glossary and claims,
theme toggle, grade/actor key popover.

## 5. Chapter archetypes: research picks which exist

This is the skeleton. A real edition uses the archetypes the evidence supports, in an order that answers the
reader's questions. Do not hard-code thirteen sections because the worked example had thirteen.

| Archetype | Always? | When to include it, and how many |
|---|---|---|
| **Cover / overview** | always | One. Title, dek, computed linked numbers, the key, chronicle, key findings (the summary chapter, verbatim, each finding with a small strip of its records) |
| **Summary of findings** | always | One chapter, `kind: summary`. Feeds the cover |
| **Background / context** | usually | 1–3: the setting and timeline; the structure of the actors (order of battle, org chart, supply chain); the stakes. Include one if the reader cannot follow the record without it |
| **Segment chapters** | when a partition yields groups | One per group of a partition that the research shows matters: by region, by period, by actor. Each opens with a mini chronicle and a locator map of its own records. Choose the partition with `scripts/scout.py --partition <field>`: it becomes chapters when it yields **3–8 groups with about 8+ records each**. Fewer → a single chapter with sub-headings |
| **Thematic pattern chapters** | when a category recurs across segments | One per cross-cutting category with about 8+ records (a type of harm, a mechanism). Thin categories fold into one "other patterns" chapter |
| **Responsibility / actors** | when entities are named | Force structure → attribution matrix (rows = entities with ≥1 link, columns = records in time order, cells = link glyph, opacity by grade, hatched if partisan-only; beneath it the records with **no** named link: the attribution gap, made visible) → entity dossiers |
| **Responses / accountability** | when institutions responded | 1: what bodies did, said, sanctioned |
| **Analysis** | when the user wants inference | One chapter, labelled. One question per block: short answer → graphic → read with care → full prose → collapsed data |
| **Explorer** | always | Facet bar + list + brushed timeline/map; state in the URL |
| **Record dossier** | always | Header strip, where/when, categories, figures per source, toll table, actors as reported, links, victims (if allowed), counter-claims, related, sources grouped by origin, card prose, research notes |
| **Entity dossier** | when entities exist | Summary, identifiers, bio by section, dated timeline on the same axis as the chronicle, linked records, every claim that names them, glossary link |
| **Register** | always | Every usable claim, faceted; plus **Sources**: publishers ranked by claims supported, with origin independence |
| **Glossary** | when terms/places recur in another language | en ↔ source language, grouped by type |
| **Method and data** | always | Method, grade key, downloads (JSON/CSV) |
| **Coverage / unknowns** | recommended | "What remains unknown", computed from the data and the method's limitations; coverage against the benchmark |
| **Extra layers** | optional | Timeline, order-of-battle, unit pages, satellite/external-data page, coverage page: layers, see LAYERS.md |

### Choosing the structure: a worked rule

1. Read the counts (`scout.py --partition region|actor|period|category`).
2. Take the partition whose groups are most nearly equal in size and least overlapping → segment chapters.
3. Take the categories that recur *across* those segments → thematic chapters.
4. Add background only for what a first-time reader must know to follow a card.
5. Add responsibility only if `records.json → links` has real content.
6. Show the user the plan with counts and a reason per chapter. Get sign-off before drafting.

## 6. The chronicle (signature graphic)

After Marey's train schedule. x = time. y = places, grouped in bands (`config.regions`), rows ordered by record
count, plus an "elsewhere in <band>" row. Each record is a mark on its row:

- fill = actor colour; grade = fill level; size = reconciled toll (area ∝ √count, a size key shown; no
  minimum-size fudge), drawn as **range rings**: filled disc for the low, hairline ring for the high; a record
  with no figure is a **tick**; a record with unreconciled figures is a dotted ring at the minimum;
- spans are drawn as spans, with a faded start when the start is approximate; a start before the window is
  clamped with a left-edge arrow ("← from Aug 2023");
- **control changes** or other regime changes are a thin coloured segment on the row showing who held it from when;
- the top few records get direct labels; hover shows a card; click opens the dossier;
- brushing: hover a row → the map lights the place; drag a time window → the map filters.

## 7. The evidence drawer and linkage

A **reverse index** is built at build time: claim → records, entities, chapters and analysis blocks that cite it.
The drawer shows a claim's statement, grade + meaning, date/place/actor/figures, independent origins, sources
with verbatim excerpts, verification note and "cited in…" chips. Hover cards for entity names, records and
places. Every entity has a stable route, so any view can be deep-linked and Back works.

## 8. Integrity of the encodings: the checklist

The first independent critique of the worked example found these. Design against them from the start:

- [ ] Size follows the *reconciled* figure, not the most extreme claim; "none reported" is distinguishable from "not reconciled".
- [ ] Dates are shown at the source's precision; a sort key never shows as a date.
- [ ] Mixed grades survive: a split glyph, qualifier in the tooltip, facet matches "contains C" not "starts with".
- [ ] Captions claim only what the data shows ("small marks mean no figure was reported" must be true).
- [ ] The Analysis surface is native, not injected legacy HTML: no fused text, no default-grey buttons, no clipped axes.
- [ ] Every entity and place has somewhere to land. Spelling drift across the edition is resolved through one gazetteer.
- [ ] Bidirectional text is isolated (`<bdi>` or `dir="auto"`) wherever a native-script name sits in Latin text.

## 9. Independent critique, then refine once

Design first → build → an independent agent critiques screenshots (`briefs/critique.md`) → refine once against
the ranked findings → polish. Record the critique in `edition/CRITIQUE.md`.
