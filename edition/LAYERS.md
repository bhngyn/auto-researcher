# Layers: extra views on top of the core edition

The core edition (`edition/core/`) has the archetype pages every edition needs. Anything topic-specific
(a timeline, an order of battle, unit pages, a satellite or external-data page, a coverage page, per-chapter
toggles) is a **layer**: a `layer.js` + `layer.css` pair plus a short `.md` in the *project's* `edition/layers/`.

`build_edition.py` inlines `edition/layers/*.js` after `app.js`, and `*.css` after `style.css`, in file-name order.
A layer's data goes in `data/layers/<name>.json`, which the builder exposes as `D.layers.<name>`;
`check_edition.py` scans it for claim / record / entity references and fails if any is dangling.

## The API a layer gets

```js
const {D, route, rail, glyph, esc, openClaims, go, $, $$} = window.EDITION;
route(/^\/timeline$/, (m, q) => { $("#view").innerHTML = `…`; });   // core routes match first
rail("Explore", "Timeline", "#/timeline");                          // append a rail entry under a section
```

## Rules that kept several sessions from breaking each other

1. **Move, never rebuild.** A layer that reorganises the rail moves existing nodes; it never re-creates them.
   A layer that *adds* rail entries must load before the layer that reorganises the rail (name files `10-…`,
   `20-…`).
2. **Every layer has an `.md`** listing the helpers and selectors it depends on (the worked example's
   `POLISH.md` did this). Check it before renaming anything in `app.js`.
3. **No new factual sentences.** A layer may compute and display; text it adds is structural or navigational.
   Chart strings follow the plain-label rule (short sentences, one idea each, defined terms kept).
4. **Ownership split, in writing.** Who owns `style.css`, who owns the builder and checker, who may make
   announced surgical edits to `app.js`.
5. **Check phone width.** Clipped tables and chronicle rows are the usual mobile bug.
6. **A layer's data references stable IDs** (`REC-####`, entity slugs, claim IDs), never titles or anchors.

## Layers the worked example built (as a menu of ideas)

| Layer | Idea |
|---|---|
| Timeline | All records in date order with control-change markers; sticky month headers |
| Order of battle | Lanes, not a hierarchy; lines only where a claim sources the relationship; a check for chapter drift |
| Units | Unit profiles with a delta pipeline (proposed changes reviewed before they change a page) |
| Responsibility hub | Attribution pages behind one hub with a tab strip per topic |
| Cards | State chapters with a "Timeline / By type" toggle; cards are *moved*, never cloned |
| Improve | Key-findings box per chapter, "what remains unknown" computed from the data + method, per-region counts reconciled everywhere |
| Satellite / external data | Its own page and data file, labelled analysis; no cited statement in the facts layer rests on it |
| Coverage | Evidence base vs an external benchmark by month and region; states where thinness is the reporting's |
