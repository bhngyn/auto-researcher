# Worked example: a large human-rights investigation

The process in this repo was distilled from this investigation. It is a **pointer, not data**: none of its
claims, names, biographies or imagery are in this repo. What follows is what the process decided and produced
when it met a real question, so that a new investigation can see how research shaped structure.

## The request and the scope decisions (stage 0)

A fact-only human-rights investigation, in footnoted HTML, of the conduct of one armed group and its allies across
a conflict-affected region. Decisions, made by structured questions:

| Question | Decision |
|---|---|
| Time | A fixed start date to the "as of" date on the cover (rolled forward as the work continued) |
| Actors | The main group and its allies; the opposing state forces only as context or for attribution |
| Evidence | Tiered sourcing, including OSINT and social media; every claim graded A/B/C with a verification status |
| Naming | Perpetrators and commanders named, with sanctions status; the dead named where a source names them; survivors of sexual violence or torture and living detainees never named |
| Vocabulary | Descriptive categories only: no "possible war crime" labels unless quoted and attributed |
| Analysis | Separate, labelled layer, added after the facts layer |
| Search budget | Unlimited for research ("search as much as you need"), later tempered by a token-efficiency rule |

Later decisions worth copying as *types* of decision: a single-origin report by a major institution counts as
"documented" (grade A); "attribution disputed" and "unattributed" incidents are out of scope; significant weakly
sourced incidents get body-text cards with their evidence limits stated; sites that block fetchers are allowed
through a verifier's passage (`reviewer_confirmed`) but stated in the limitations; the cover figure is a floor.

## What the research produced

- **Six research rounds:** English sweep of UN/NGO/media/OSINT; non-English sweep including partisan and local
  monitoring sources; three gap rounds each aimed by a scout report; an incident-profile round that researched
  every incident card individually; then targeted passes (unit attribution, thin-month sweeps through outlet
  APIs, social-media rounds).
- **About 1,500 usable claims**, a handful rejected. Most rounds ended early on low yield: the fifth round found few new
  incidents, and the unit-attribution pass turned 16 draft claims into 7 survivors because open sources rarely
  name the unit behind a specific abuse. Those low yields were reported as findings.
- **A corroboration pass** on single-origin B/C claims: grades moved on independent, non-partisan sources only;
  about a third of the agents' "independent" flags were overturned on review.
- **An incident database:** about 260 profiles (200+ with cards), parent campaigns with dated children, 30-odd
  flagged weakly sourced, tolls reconciled per incident into a floor (a "people reported killed" figure with a
  stated minimum and maximum) rather than summed from claims.
- **A roster** of named commanders and units with source-attested spellings, photos and ID tables where
  verified, and **attribution links** (direct / area command / presence) for about 140 incident–person pairs,
  each backed by a verbatim quote.
- **Analysis:** command responsibility; patterns (abuse before/after changes of control, drones by target,
  sieges, targeting of communities); fire-detection and archived-imagery checks on burning claims; satellite
  work (radar, optical, night lights); coverage against an external conflict-event benchmark.

## The structure the research chose (stage 8)

Thirteen prose chapters, not because thirteen is a rule but because the evidence supported them:

| Part | Chapters | Why |
|---|---|---|
| Overview | Summary of findings | Always |
| Background | Why the region matters (stakes); military context and timeline; structure and chain of command | A reader cannot follow an incident card without them |
| The regions | One chapter per region | Geography was the partition that gave three near-equal groups of incidents |
| Patterns of abuse | Sexual violence and torture; strikes, sieges and attacks on aid; children, ethnic targeting and displacement | Categories that recur across all the regions, each with enough incidents |
| Responsibility | Units and commanders linked to atrocities; named individuals | Named links existed |
| Accountability | Responses | Institutions had responded |

Around them: cover with computed numbers and the chronicle, explorer, incident and person dossiers, evidence
register and sources, bilingual glossary, method and data, and **layers** added by separate sessions:
timeline, order of battle, unit pages, responsibility hub with three topics, regional-chapter cards toggling
"Timeline" and "By type of attack", key-findings boxes, a "what remains unknown" page, a coverage page and a
satellite page.

## Things that went wrong (each became a rule in OPERATIONS.md)

- Four fan-outs at once froze the machine → machine-wide agent cap.
- A research agent hung five hours in a browser pane; agents' `curl` without a timeout left hung downloads.
- The shared web-search budget ran out mid-round and agents wrote fake `none_found`.
- Agents' large structured returns failed about a third of the time → agents write files.
- A re-run apply script re-appended the same notes → idempotence rule.
- A backup file in the claims folder silently overrode live claims → the loader skips backup-named files.
- A cover tally mixed three kinds of "not tallied" incidents and misled the user → three buckets.
- The first design critique found encodings that overstated certainty (toll sizes, dates, mixed grades) → the
  integrity checklist in `edition/DESIGN_TEMPLATE.md`.
- Renaming a card changed its title-derived ID and broke analysis files keyed on it → stable record IDs.

## Mapping to this repo's field names

| Worked example | This repo |
|---|---|
| `perpetrator` | `actor` |
| `casualties` | `figures` |
| `people_named` | `entities_named` |
| `incident` (INC-####), `incidents.json`, "registry" | `record` (REC-####), `records.json` |
| `perp_group` | `scope.actor_group` |
| `violations` | `categories` |
| `command_links` (L1/L2/L3) | `links` |
| `headline_toll` | `headline_toll` (unchanged) |
| people / bios / glossary | `entities.json` / `bio` / `glossary.json` |
| `edition/` layers (`cards.js`, `orbat.js`, `resp.js`, …) | `edition/layers/*.js` (see `edition/LAYERS.md`) |
