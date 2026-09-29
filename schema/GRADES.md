# Evidence grades

The rubric is a project decision (stage 0), but these defaults worked and every script assumes them. Change
the wording in `project.json → grades`, not the logic.

| Grade | Glyph | Meaning |
|---|---|---|
| **A** | ■ solid | Two or more **independent** credible origins, *or* a documented investigation by a UN body or major NGO |
| **B** | ◧ half | One credible non-partisan origin, or a credible local source corroborated by other evidence (e.g. satellite imagery) |
| **C** | □ open | A single local, partisan, anonymous or unverified source. Recorded because it may assist further investigation, not because it is established |

Rules that the scripts enforce or the briefs require:

1. **Grade the claim on its own sources.** A claim is graded by its weakest necessary support, not by the best
   source that happens to sit beside it.
2. **Independence means independent origin.** Count `originating_source`, not outlets. An outlet quoting
   another outlet, a monitor's post, a wire, a party's statement or "activists on social media" shares that
   origin. Wikipedia is never independent. A source that confirms the event but not the figure, unit or named
   person corroborates only that part: split the claim or hold the regrade.
3. **Partisan never makes A.** Partisan sources (`source_type` starting `partisan`) are presented as claims by
   the party and cannot count toward independence for a regrade.
4. **Single-origin documented investigations may be A.** A UN body, court or major NGO report counts as
   documented even with one origin. This is a *user* decision recorded per project. (The worked example kept
   MSF, UN DPPA, Insecurity Insight, BBC Verify and Misbar single-origin reports at A.)
5. **Corroboration never lowers a grade.** It can move C→B (one independent non-partisan source) or B→A (two or
   more independent non-partisan origins). A verified contradiction is flagged for a human, not regraded.
6. **Regrades to a lower grade are user decisions**, made through `apply_edits.py` with an approval note.
7. **A record's grade is composite.** A record card can be "B–C" or "A (killings); C (attribution)". Marks
   use the **lowest** letter; never round up. Keep the qualifier in every tooltip.

## Shape, not colour

The grade is encoded by **shape** so it never depends on colour: **A ■ solid, B ◧ half, C □ open**, with a
fourth "mixed" state (a split square) for composite grades. Colour is reserved for the actor (the one
categorical encoding). The glyph appears on every claim marker in prose, on map and chart marks (fill level),
in tables, on cards, and in one legend on the cover.

## Verification vocabulary

`fetch_status` on a source:

| Status | Usable? | Meaning |
|---|---|---|
| `confirmed` | yes | The excerpt was found verbatim on the live page |
| `partially_supports` | yes | Found, but supports only part of what the claim says (the claim's `notes` say which) |
| `reviewer_confirmed` | project decision | The site blocks automated fetching; a verifier opened it another way and supplied the passage |
| `snippet_only` | no | Seen only in a search snippet |
| `unfetchable` / `not_found` | no | Cannot be verified: not relied on |

`verdict` on a claim: `confirmed` (as drafted), `corrected` (narrowed or fixed by the verifier), `rejected`
(no reachable source supports it; stays in the store, never cited).

## Link levels (analysis layer)

For attribution/responsibility links between an entity and a record:

| Level | Glyph | Meaning |
|---|---|---|
| `L1_direct` | ● | A claim says the entity **ordered, led, commanded the attacking force in, or was present at** this record |
| `L2_area_command` | ◑ | Claims show the entity **commanded the force or front that carried out** it, at that place and time; nothing ties them to the act itself |
| `L3_presence` | ○ | The entity is reported **in the area in that window**; no command role over the perpetrating force is established |
| `reject` | — | Not a real link (namesake, wrong time/place, a statement or denial only, opposing side) |

The link's grade is the weakest supporting claim's grade; flag `partisan_only` links. "Direct link" must not be
paraphrased as "directly responsible", because L1 includes presence at the event.
