# Research brief: <<TOPIC>>

## Why this exists
<<ORIGINAL_REQUEST>>

The result is a **fact-only, footnoted evidence edition**. It is an accountability-grade record, so a
hallucinated fact, a wrong name or a wrong figure does real harm. **Everything you write will be checked
mechanically.** Each quote is fetched and matched word for word, and a separate reviewer re-reads every claim.

## Scope and rules
- **Question:** <<QUESTION>>
- **Period:** <<PERIOD>>
- **In scope (investigate):** <<ACTORS_IN_SCOPE>>
- **Context only (record only when needed to explain an event or an attribution):** <<ACTORS_CONTEXT>>
- **Vocabulary:** <<VOCAB_RULE>>
- **Naming:** <<PROTECTED_RULES>>
- **Spelling of names:** <<SPELLING_RULE>>
- **Languages:** search in <<LANGUAGES>>. Use native-script place names and terms, not only transliterations.
- **Preferred sources (start here):** <<PREFERRED_SOURCES>>
- **Tools:** use only WebSearch and WebFetch<<LOCAL_HELPERS>>. **Do not use browser tools** (no Chrome extension,
  no browser pane). Any `curl` you run must carry a timeout: `curl -m 60 …`. Never leave a download running.
- **Write only** under `<<PROJECT_DIR>>/data/raw/<<ROUND>>/`. Do not edit any other file.

## Your input
<<UNIT_DESCRIPTION>>
(A research unit is a track, an entity, or a record. If it is a record, the input file lists what is already
known: its claims, its `already_cited_urls` and the `gaps` to fill.)

## What to research
Search in every project language. For each unit, look for:
1. **Independent corroboration.** A source that is not the originating source of any existing claim and is not
   merely citing it. Regulators, UN/NGO/monitor reports, wires and established outlets are most useful.
2. **Details.** The exact date, the exact place, quantities broken down by source, and **names of people
   killed** where the project's rules allow and a source prints them.
3. **Actor detail.** The unit, person or organisation **as a source names them**. Do not infer.
4. **Counter-claims.** Denials, and other attributions.
5. **Related events** at the same place and time that are not yet recorded. Record them as separate claims with
   `relation: "new_related_event"`.

Stop a unit after at least **8 distinct searches**, at least a third of them in a non-English project
language, or earlier if it is fully documented. Don't pad claims to look productive: an honest `none_found` is
valuable.

## Output: one file per unit
Write `<<PROJECT_DIR>>/data/raw/<<ROUND>>/<UNIT>.json`, as plain JSON:
```json
{
 "unit": "<UNIT>",
 "searches": [{"q": "…", "lang": "en", "useful": true}],
 "claims": [
  {
   "relation": "new | corroborates | adds_detail | contradicts | counterclaim | new_related_event",
   "category": "one of: <<CATEGORIES>>",
   "statement": "One or two sentences, fully attributed ('X reported that…'), with nothing the excerpts below don't say.",
   "date": "YYYY-MM-DD or YYYY-MM-DD/YYYY-MM-DD or YYYY-MM (add '(reported YYYY-MM-DD)' when only the report date is known)",
   "location": "Place (native script in brackets), admin area",
   "actor": "as the source attributes it",
   "figures": "per source, e.g. 'Monitor A: 7 killed incl. 2 children; Monitor B: 9'",
   "victims_named": [{"name": "exactly as printed", "status": "killed", "latin": "spelling or null", "native": "or null"}],
   "entities_named": ["people or organisations named, exactly as printed"],
   "sources": [{
     "publisher": "…", "title": "…", "title_en": "if not English", "date": "YYYY-MM-DD",
     "url": "https://…", "language": "en",
     "source_type": "media | local_monitor | UN | NGO | official | OSINT | partisan_<party>",
     "supporting_excerpt": "VERBATIM text copied from the page, in its original language: 10–60 words, and it must support every fact in the statement that this source is cited for",
     "excerpt_en": "your English translation, if the excerpt is not English",
     "originating_source": "who first reported it, if this outlet is relaying someone else"
   }],
   "proposed_grade": "A | B | C",
   "notes": "anything a reviewer must know: conflicts with existing claims, doubts, relays"
  }
 ],
 "gaps": [
  {"field": "independent_corroboration | figures | victim_names | actor_detail | exact_location | exact_date | counterclaims",
   "status": "found | none_found | not_researched",
   "searches": ["the queries you ran for it"]}
 ]
}
```

**How to get verbatim excerpts.** WebFetch passes each page through a model. Always ask it for *"the exact
verbatim text, character for character, of the paragraphs that mention <place/event>"*, and copy excerpts only
from that output. Never paraphrase inside `supporting_excerpt`.

If WebSearch or WebFetch returns a rate-limit, quota or budget error, **stop searching**. Mark every remaining
gap `not_researched` (never `none_found`), write your file, and say so in your reply.

## Rules for claims
- **Every fact in a statement must appear in a `supporting_excerpt`.** Copy excerpts exactly, keeping the
  page's own punctuation. Don't join separate sentences with "…". Code fetches each URL and rejects any
  excerpt it cannot find on the page.
- A URL must be one you actually opened with WebFetch, not a search-result snippet. If WebFetch failed but a
  snippet shows the text, set `"fetch_status": "snippet_only"` on that source.
- **One claim = one source's account of one event.** Two outlets that agree may share one claim; two that
  conflict need separate claims.
- **Grades** (your proposal only; the verifier decides): <<GRADE_RUBRIC>>
- Do not re-submit a source that an existing claim already cites. **Exception:** if an already-cited page names
  people **killed** and no existing claim lists those names, you may re-cite it in a names-only claim
  (`relation: adds_detail`).
- If a source gives only a weekday ("on Wednesday"), do not convert it to a date in `statement`. Write the
  weekday as the source does, put the computed date in `date` only, and add "date computed from weekday and
  publication date" to `notes`.
- Cite the **original** publisher (wire, monitor, regulator), not a site that republishes it. Use a syndicated
  copy only if the original cannot be fetched, and then set `originating_source` to the original.
- `"status": "not_researched"` for a gap you didn't get to. `none_found` means you searched and found
  nothing, and it **must** list the searches you ran.
- Never invent a source, URL, date, name or quote.

When your units are written, reply only: `done <units>: <n claims total>, <n units with none_found corroboration>`.
