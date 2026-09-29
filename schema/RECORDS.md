# Records, entities, glossary, analysis: the derived layer

Claims (`schema/claim.schema.json`) are the evidence. Everything below is *organisation of* claims, built at
stage 8 onward. Every field in these files that states something cites claim IDs, and
`scripts/check_records.py` fails closed on an unknown or rejected ID.

## `data/records.json`: event / case / incident profiles

A **record** is one thing that happened (or one case, one instrument, one facility, whatever your unit of
analysis is). The worked example used *incident*. Records exist so that prose cards, database rows, map marks
and analysis all join on one **stable ID** (`REC-0001`) instead of on titles or anchors.

```jsonc
{"records": [{
  "id": "REC-0001",                       // never reused; renamed cards keep aliases
  "aliases": ["old-anchor-id"],           // anchors or title-derived IDs that used to point here
  "title": "Shelling of the market (Town A, 3 March 2025)",
  "kind": "event",                        // event | campaign (a parent whose children are dated events)
  "parent": null, "children": [], "related": [], "same_as": [],   // same_as folds a duplicate card in
  "card": {"chapter": "north", "anchor": "rec-0001"},             // where the prose card lives; null if none
  "scope": {"in_scope": true, "actor_group": "Group A",           // the ONE categorical encoding (colour)
            "actor_line": "Group A, per Monitor X", "attribution": "stated"},   // stated | disputed | not_stated
  "when":  {"start": "2025-03-03", "end": "2025-03-03", "text": "3 March 2025", "precision": "day"},
  "where": {"text": "Town A market", "region": "North", "place": "Town A", "lat": 12.3, "lon": 30.1, "precision": "site"},
  "categories": [{"type": "shelling", "label": "Shelling", "claims": ["r1-track-001"]}],
  "evidence": {"card_grade": "B–C", "best_claim_grade": "B", "claim_grades": {"r1-track-001": "B"},
               "distinct_nonpartisan_origins": 2},
  "figures": [{"claim": "r1-track-001", "grade": "B", "text": "Monitor X: 7 killed", "killed_figures": [7]}],
  "headline_toll": {"low": 7, "high": 9, "note": "reconciled; see tolls", "claims": ["…"], "cover": true},
  "actors_as_reported": [{"claim": "r1-track-001", "text": "Group A (per Monitor X)"}],
  "links": [{"slug": "person-a", "name": "Person A", "unit": "Unit 1", "level": "L2_area_command",
             "grade": "B", "partisan_only": false, "claims": ["…"]}],
  "victims_named": [{"name": "as printed", "status": "killed", "claim": "…"}],   // only if project.json allows
  "counterclaims": [{"claim": "…", "text": "Group A denied…"}],
  "claims": {"core": ["…"], "context": ["…"]},
  "weak": false,                          // best claim grade is C: database-only unless significant
  "notes": [], "research": {"summary": ""}
}]}
```

Rules:

- **Derived fields are derived.** `evidence.*`, `weak`, and `in_scope` are recomputed by
  `check_records.py --derive` from the claims and from `scope.attribution`. Curated fields are `parent`,
  `children`, `related`, `same_as`, the claim lists, `links`, and `headline_toll`.
- **Descriptive categories only** (unless the project chose otherwise). No "possible war crime" labels unless
  quoted and attributed.
- **Records with `origin: "db"` are never retired** by a re-derivation; only card-derived ones are.
- **Scope decisions are explicit.** Disputed or unattributed records are out of scope by default; a review that
  sets attribution decides `in_scope`. Record the decision in `DECISIONS.md`.
- **Quantities.** `headline_toll` is the reconciled low/high for the record. `cover:false` keeps a doubtful
  toll (party-only, civilian status in doubt) off the cover sum. Records with figures but no toll need a
  written reason (`notes` or an `_open_reasons` file). Group `parent`/`children` and overlapping records so
  each death (or unit) is counted once.
- **Weak records.** Not carded unless significant; always in the database and the explorer, flagged.

## `data/entities.json`: the roster

People, units, organisations, and places worth a page.

```jsonc
{"entities": [{
  "slug": "person-a", "name": "Person A", "type": "person",   // person | unit | org | place
  "group": "Group A", "native": "…", "latin": ["Person A", "P. Aa"],   // source-attested spellings only
  "role": "Commander, Unit 1", "summary": "One paragraph with {{c:ID}} markers.",
  "identifiers": [{"field": "Rank", "value": "Brigadier", "claims": ["…"]}],
  "bio": [{"h": "Career", "html": "<p>… {{c:ID}}</p>"}],
  "timeline": [{"date": "2025-03", "text": "…", "claims": ["…"]}],
  "flags": ["Sanctioned by X on 2026-02-19 (see claim)"],       // each backed by a claim
  "namesake_risk": "Not to be confused with …"
}]}
```

- Naming is **not** a finding of responsibility; the edition says so prominently.
- A link between an entity and a record is stored on the **record** (`links`), so the roster can be rebuilt
  without touching link judgements.
- Keep a `name_spellings.json`: `{canonical: {variants:[], sources:[claim ids]}}`; the checker rejects a
  spelling not attested by a cited claim.

## `data/glossary.json`

`[{"term": "…", "native": "…", "variants": [], "type": "place|term|org|unit", "def": "…", "slug": null}]`.
Glossary and named individuals stay separate but are cross-linked through `slug`.

## `analysis/analysis.json`: the analysis layer

Analysis is inference and is labelled as such. Each block answers one question:

```jsonc
{"findings": [{"id": "f1", "a": "One-sentence key finding.", "block": "q1"}],
 "blocks": [{
   "id": "q1", "q": "Does abuse rise after a change of control?",
   "a": "Short answer, with {computed_number} placeholders filled by the build.",
   "viz": {"type": "bars", "title": "…", "caption": "What one mark is. How to read it. Caveat.",
           "rows": [{"label": "Town A", "value": 39, "grade": "B"}]},
   "care": ["Read with care: what the data cannot show."],
   "detail": "<p>Full prose, every sentence with {{c:ID}}.</p>",
   "tables": [{"title": "Data", "cols": ["Town", "Before", "After"], "rows": [["Town A", 4, 39]]}]
 }]}
```

Layout is fixed: **short answer → graphic → read with care → full prose → collapsed data tables**. The
build prints any `{placeholder}` left unfilled. Anything richer than `bars` and `tables` is a layer.

## `project.json`

See `schema/project.example.json`. Created by `scripts/scaffold.py` and refined at stage 0. It carries the
topic, period, actors, categories, evidence rules, protected categories, house style, budgets and the chapter
list (once stage 8 decides it).
