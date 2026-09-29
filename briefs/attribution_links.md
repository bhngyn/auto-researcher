# Attribution / responsibility link review (batch <<N>>)

## Who asked and why
<<ORIGINAL_REQUEST>>

The facts layer is finished. The user asked for an **analysis layer**, starting with **attribution links**: for
each record, which named person or unit can be linked to it, and how strong each link is. This is an
analytical assessment published separately from the facts. It will be read by investigators, so an
overstated link does real harm to a real person, and an honest "no link established" is a good result.

## Input
`<<DIR>>/input.json` is a list of records. Each has the card title, date line, place, actor line, the full text
of every claim cited in the card, and **candidate** entities found by a keyword script:
- `named`: claims in the card whose text mentions the entity;
- `nearby_claims`: other claims placing the entity at the same place within ±<<WINDOW_DAYS>> days;
- `nearby_timeline`: events from the entity's verified biography timeline (same place, ±<<WINDOW_DAYS>> days).

The script is crude. Many candidates are false (namesakes, a spokesperson denying something, a sanctions
notice, a place-name match that is not the same place). **Treat every candidate sceptically.**

## Link levels (use exactly these)
- `L1_direct`: a claim says this entity **ordered, led, commanded the attacking force in, or was present at**
  this record. The claim must say so of this record, not of the area generally.
- `L2_area_command`: claims or timeline events show the entity **commanded the force or front that carried
  out** the record, at that place and time, but nothing ties them to the act itself.
- `L3_presence`: the entity is reported **in the area in that window**, with no command role over the
  perpetrating force established.
- `reject`: not a real link (namesake, different time or place, a statement or denial only, sanctions text
  with no link to this record, or the entity belongs to the opposing side).

Grade each link by the **weakest** of its supporting claims (A/B/C as given in the input). Note when the only
source is partisan.

## Rules
- Use only the evidence in `input.json`. **Do not search the web and do not use browser tools.** This is a
  reading-and-judgment task.
- Every link must cite the claim IDs (and/or `timeline:<slug>:<index>`) that support it, and quote the **exact
  words** (copied from the input text) that establish the role, place and time. A validator checks each quote
  verbatim.
- **Never upgrade.** "Group A forces attacked X" plus "Y is a Group A commander" does **not** make Y L2. L2
  needs evidence that Y commanded *that* force or front, at that place and time.
- You may add a **unit** link with the same levels if a claim names the unit as the actor.
- <<PROTECTED_RULES>>
- Do not edit any project file. Write only your output files.
- A corroboration that adds a weaker note must never lower a link's grade: keep the A evidence and note the
  corroboration in `reasoning`.

## Output: one file per record
Write `<<DIR>>/out/<record_id>.json` (plain JSON, UTF-8):
```json
{
  "record": "<record id>",
  "links": [
    {"slug": "<roster slug or null for a unit>", "name": "...", "unit": "... or null",
     "level": "L1_direct | L2_area_command | L3_presence | reject",
     "grade": "A | B | C", "partisan_only": false,
     "evidence": [{"ref": "<claim id or timeline:slug:i>", "quote": "exact words from the input"}],
     "reasoning": "one or two sentences: what the evidence shows and what it does not"}
  ],
  "unlinked_note": "if no L1/L2 link: what the evidence says about the actor (e.g. 'Group A, no commander named')"
}
```
Include `reject` entries for every candidate you reject (with a short reason), so the review is auditable.
When every file is written, reply with just: `done: <n files written>`.

## Then (orchestrator)
`scripts/` validate each quote against its claim; the highest batch number per record supersedes earlier
ones; results are copied into `records.json → links`. Re-run the validator after any change to a bio
timeline, because `timeline:<slug>:<i>` refs are index-based.
