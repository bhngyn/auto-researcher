# Edition data contract

`scripts/build_edition.py` writes one JSON object, `D`, into `<script type="application/json" id="data">`.
`edition/core/app.js` reads it and nothing else. Layers (extra views) read the same `D`. Keep this file in step
with the builder: it is the only interface between the data side and the view side.

Keys are short only where the object is repeated thousands of times (claims, sources).

```jsonc
D = {
  "meta": {
    "title": "…", "subtitle": "…", "brand": "top-bar title", "tagline": "top-bar sub-line", "dek": "cover paragraph",
    "asof": "YYYY-MM-DD", "period": "A to B", "period_start": "YYYY-MM-DD", "period_end": "YYYY-MM-DD", "built": "YYYY-MM-DD",
    "contentWarning": "…"|"", "disclaimer": "naming is not a finding…"|"",
    "recordNoun": ["Event", "Events"], "entityNoun": ["Party", "Parties"]
  },

  "config": {
    "actors":  [{"id": "<value of record.actor>", "label": "short label", "cls": "a1|a2|a3|a4|grey"}],   // the ONE categorical colour
    "facets":  [{"key": "region|actor|category|grade", "label": "…"}],                                   // explorer facets
    "timeline": {"row": "place", "group": "region"},                                                     // chronicle rows and bands
    "regions": ["Upper Basin", "Lower Basin"],                                                           // band order
    "cover":   [{"label": "events in scope", "text": "4", "sub": "optional", "href": "#/records"}],      // computed, linked numbers
    "grades":  {"A": "meaning…", "B": "…", "C": "…"},
    "quantity": {"label": "people reported killed", "low": 0, "high": 0, "n": 0}                          // a floor, not an estimate
  },

  "chapters": [{"id": "upper-basin", "title": "…", "part": "By basin", "kind": "summary|narrative|…",
                "region": "Upper Basin"|undefined,
                "html": "VERBATIM prose. Claim markers are <sup class=\"cm\" data-c=\"id1,id2\"></sup>; record cards are <div class=\"incident\" id=\"rec-0001\" data-rec=\"REC-0001\"><h3>…</h3><p class=\"facts\">…</p><p>…</p></div>"}],

  "claims":  {"<id>": {"s": "statement", "g": "A|B|C", "d": "date", "l": "location", "a": "actor as the source names it",
                        "k": "category", "x": "figures line", "n": "notes", "io": 2 /*independent origins*/, "v": "confirmed|corrected",
                        "vn": "verification note", "os": "osint status", "ent": ["entities named"],
                        "src": [[sourceIndex, "verbatim excerpt", "fetch_status"], …]}},
  "sources": [{"p": "publisher", "t": "title", "te": "English title", "d": "date", "u": "url (may be fixture://…: not a link)",
               "ty": "source_type", "o": "originating source", "l": "language", "partisan": false}],

  "records": {"REC-0001": {
      "id": "…", "title": "…", "kind": "event|campaign", "parent": null, "children": [], "related": [],
      "card": {"chapter": "upper-basin", "anchor": "rec-0001"} | null,
      "in_scope": true, "weak": false, "actor": "<config.actors id>", "actor_line": "as attributed", "attribution": "stated|disputed|not_stated",
      "start": "YYYY-MM-DD"|null, "end": "…"|null, "when_text": "verbatim date text", "precision": "day|month|year",
      "place_text": "…", "place": "row label for the timeline", "region": "band", "lat": 12.3|null, "lon": 30.1|null, "geo_precision": "site|near|none",
      "categories": [{"type": "spill", "label": "Spill or release", "claims": ["id"]}],
      "card_grade": "B–C", "best_grade": "B", "grades": {"claimId": "B"}, "origins": 2,
      "figures": [{"claim": "id", "grade": "B", "text": "Monitor X: 7 killed", "killed_figures": [7]}],
      "toll": {"low": 7, "high": 9, "note": "…", "claims": [], "cover": true, "kind": "headline|figures"} | null,
      "actors_as_reported": [{"claim": "id", "text": "…"}],
      "links": [{"slug": "entity-slug", "name": "…", "unit": null, "level": "L1_direct|L2_area_command|L3_presence", "grade": "A", "partisan_only": false, "claims": []}],
      "victims": [{"name": "…", "status": "killed", "claim": "id"}],
      "counterclaims": [{"claim": "id", "text": "…"}], "claims": {"core": [], "context": []}, "notes": []}},

  "entities": {"slug": {"slug": "…", "name": "…", "type": "person|unit|org|place", "group": "…", "native": "…", "latin": [], "role": "…",
                         "summary": "HTML with markers", "bio": [{"h": "Career", "html": "…"}], "identifiers": [{"field": "", "value": "", "claims": []}],
                         "timeline": [{"date": "YYYY-MM", "text": "…", "claims": []}], "flags": [], "namesake_risk": "",
                         "records": [["REC-0001", "L1_direct", "A"]]}},

  "glossary": [{"term": "…", "native": "…", "variants": [], "type": "term|place|org|unit", "def": "…", "slug": null}],

  "an": {"findings": [{"id": "f1", "a": "key finding", "block": "q1"}],
         "blocks": [{"id": "q1", "q": "question", "a": "short answer (numbers already filled)",
                     "viz": {"type": "bars", "title": "", "caption": "", "rows": [{"label": "", "value": 3, "grade": "B"}]},
                     "care": ["read with care…"], "detail": "HTML with markers",
                     "tables": [{"title": "", "cols": [], "rows": [[]]}]}]},

  "method": "HTML with markers",
  "cited": {"claimId": ["r:REC-0001", "e:slug", "c:chapter-id", "a:block-id"]},     // reverse index: who cites this claim
  "stats": {"TOTAL": 9, "USABLE": 8, "REJECTED": 1, "GA": 2, "GB": 4, "GC": 2, "URLS": 11, "CORRECTED": 2, "SECONDPASS": 0, "PARTISAN": 1},
  "layers": {"<name>": /* any JSON from data/layers/<name>.json */}
}
```

## Routes (the core defines these; layers may add more)

| Route | View |
|---|---|
| `#/` | **Cover.** Title, dek, content warning, disclaimer, `config.cover` numbers (each a link), the grade/actor key, the **Chronicle** (place × time) and the key findings (chapter `kind:"summary"`) |
| `#/read/<chapter>` | A chapter: verbatim HTML; claim markers become grade glyphs opening the drawer; record cards are enhanced with a header strip and a link to the dossier |
| `#/records` | **Explorer**: facet bar (`config.facets`, plus in-scope / weak toggles and text filter), list, and a link to each dossier. State lives in the query string |
| `#/r/<REC>` | **Record dossier**: header strip, when/where, categories, figures per source (never merged), toll if any, actors as reported, links to entities, counter-claims, related/parent/children, the claims behind it, the card prose |
| `#/entities` | Roster with link counts |
| `#/e/<slug>` | **Entity dossier**: summary, identifiers, bio sections, dated timeline, linked records with link-strength glyph |
| `#/analysis` | Analysis chapter, visibly labelled: key findings, then per question: short answer → graphic → read with care → detail → collapsed tables |
| `#/evidence` | **Register**: every usable claim, filter by grade/category/text |
| `#/sources` | Publishers ranked by claims, with origin independence |
| `#/glossary` | Glossary, A–Z |
| `#/method` | `D.method`, the grade key, downloads (claims, records, entities, glossary as JSON; claims as CSV) |

## Non-negotiable behaviours

- **Evidence drawer** opens from any claim marker or `[data-claim]` element, without navigating. It shows statement,
  grade glyph and its meaning, date/place/actor/figures/notes/verification, independent origins, every source with its
  verbatim excerpt (`lang` set for non-Latin scripts), originating source, link (not for `fixture://`), and a "cited in…"
  list built from `D.cited`.
- **Grade glyph is a shape** (■ solid A, ◧ half B, □ open C, split square for a mixed grade such as "B–C"); colour is only for the actor.
- **Marks use a record's lowest grade**, never round up.
- **Dates keep their precision**: show `when_text`; never render a period as a day.
- **Tolls are ranges**: draw low and high (filled disc for low, ring for high); a record with no figure draws a tick, and a record
  whose `toll.kind == "figures"` is labelled "figures reported, not reconciled".
- **Out-of-scope** records are shown greyed and labelled, never hidden. **Weak** records carry a "weakly sourced" flag.
- **Search palette** (`/` or ⌘K): records, entities, chapters, glossary terms, claims (by text or ID).
- Works from `file://`, no network for data, no iframes; light and dark themes; usable at phone width; keyboard accessible.
- **Layers**: `edition/layers/*.js|css` from the project are appended after the core script/CSS. The core exposes
  `window.EDITION = {D, route(regex, fn), rail(section, label, href), glyph(g), esc, openClaims(ids), go(hash)}` for them.
