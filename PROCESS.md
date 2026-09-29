# The process, stage by stage

Each stage lists **who** does the work (`you` = the orchestrating Claude session, `agent` = a subagent,
`script` = deterministic code, `user` = the human), what it **reads and writes**, and the **gate** that lets you
move on. `↺` marks a loop.

Folder names below are relative to an investigation folder (`investigations/<slug>/`, created by
`scripts/scaffold.py`). Conventions: `data/raw/` = agent drafts, `data/verified/` = claims that survived
checking (the *only* evidence store), `data/backups/` = timestamped copies made before every apply.

```
<slug>/
  project.json            scope, actors, evidence bar, protected categories, house style, budgets
  DECISIONS.md            every user decision, dated, with the reason
  briefs/                 briefs rendered for this project (from ../../briefs)
  data/raw/<round>/       one file per research unit (agent output)
  data/checks/<round>/    excerpt-check results (script output)
  data/verdicts/<round>/  verifier-agent output (one file per unit)
  data/verified/          claim files. IDs are stable forever
  data/secondpass/        red-team decisions
  data/records.json       stable-ID event/incident profiles          (stage 8)
  data/entities.json      roster of people, units, organisations     (stage 8)
  data/glossary.json      terms, in the source languages too
  data/backups/           <tag>/… copies, never overwritten
  report/sections/*.html  the facts layer: prose with {{c:ID}} markers
  report/method.html      scope, sources, grading, limitations (also with markers and {{STAT:KEY}})
  analysis/               analysis inputs and prose (kept apart from the facts layer)
  edition/                per-project layers (optional) and edition.json
  build/                  outputs: never edited by hand
```

---

## 0. Scope (interview) — you + user · GATE

Ask, don't assume. Use `briefs/00_scoping.md`: it is the list of questions that decided the shape of the
worked example. Ask them with a structured question tool, four at a time, and record each answer in
`DECISIONS.md` with the date. The answers become `project.json`.

The questions that matter most, because they are expensive to change later:

- **The question and the audience.** "What do open sources document about X between A and B?" is a fact-only
  brief. "Why did X happen?" is an analysis brief. Facts and analysis are built as separate layers, so decide
  which you owe first.
- **Time window** and **geography/domain boundary**.
- **In-scope actors** versus **context-only actors**. Whose conduct is investigated, and whose appears only
  where needed to explain an event? (Absence of the second group must be explained in the method, not left to
  be read as a finding.)
- **Evidence bar.** How are claims graded? Are partisan sources usable? (Yes, but only ever as "party X says".)
  Is social media evidence, or only a lead to outlets that relayed it?
- **Protected categories and naming rules.** Who may be named, who never may (default: never name survivors of
  sexual violence or torture, detainees or minors; name the dead only where a cited source names them).
- **Vocabulary rule.** Descriptive categories only, or legal/technical labels allowed when attributed?
- **Languages and preferred sources.** Research in every language the sources use, not just the audience's.
- **Budgets.** Agent cap (machine-wide), web-search budget, tolerable token spend, stop rules.
- **Deliverable.** A single-file edition (default), plus which extras (data downloads, print version).

Gate: `project.json` validates (`scripts/scaffold.py --check`), `DECISIONS.md` has the answers.

## 1. Scout the landscape — you (or one lean agent)

Cheap and early. Do a small number of searches yourself, in every project language, to learn: who the outlets
and monitors are, which of them block fetchers (and whether they have an API), what the dominant events,
actors and places are, what the external benchmark is (a dataset or monitor you can later compare coverage
against), and what is out of reach.

Output: `data/landscape.md` (a page) and a **track list**: the research units for round 1. Tracks split the
question along the axes that will later become chapters: by geography, by actor, by theme, by language, by
source type. Prefer 6–12 tracks. Each track gets one raw file.

Gate: the track list is written down. You do not need user sign-off unless the tracks change scope.

## 2. Research rounds — agents ↺

Use `briefs/research.md`. One agent per track (respect the agent cap: see [OPERATIONS.md](OPERATIONS.md)).
Agents write `data/raw/<round>/<unit>.json`, one file per unit, and reply with one line.

Rounds, in the order the worked example used:

| Round | Purpose | Notes |
|---|---|---|
| R1 | Sweep in the audience's language: UN/NGO/official/media/OSINT | Broad, by track |
| R2 | Sweep in the sources' own languages, including partisan and local monitors | Finds what R1 cannot see |
| R3, R4… | **Gap rounds**, each aimed by a scout report (stage 1 tools: `scripts/scout.py`) | Thin months, thin places, thin actors, coverage vs external benchmark |
| Deepen | One agent per *record* (stage 9) | After structure exists |

**Stop rule.** Stop a round early when its yield is low, and say so in the method as a finding ("most thin
months were thin in the reporting too"). A round of 30 agents that yields a handful of new claims is a bad
trade. Prefer a deterministic sweep (an outlet's API, a search URL you can script) to a wide fan-out.

**The tool budget is shared.** Web-search limits are per session and shared by all subagents. Tell agents to
mark a gap `not_researched` (never `none_found`) if they hit a limit.

## 3. Mechanical check — script

`scripts/check_raw.py <round>` fetches every URL and matches each `supporting_excerpt` against the live page
(whitespace-, diacritic- and quote-style-tolerant; nothing else). It writes `data/checks/<round>/<unit>.json`
with a per-source status: `exact`, `fuzzy`, `not_found`, `no_quote`, `fetch_failed`, `snippet_only`, plus flags:
numbers in a statement that appear in no excerpt, possible protected names, a URL an existing claim already
cites (normalised), an empty `none_found`.

This runs *before* a verifier agent sees the file, so the agent spends its judgement where the script can't.

## 4. Verification — agent, then script · GATE

Use `briefs/verify.md`. A **separate**, default-skeptical agent reads each raw file plus its check results and
writes a verdict per claim: `keep | correct | drop`. It checks support, same-event, attribution, independence,
grade, privacy and vocabulary. Its rules are enforced by `scripts/promote.py`:

- a `not_found`/`no_quote` source cannot be rescued by `keep`; it survives only with a `replacement_quote`
  which the script re-checks against the page;
- a claim whose sources all fail must be `drop`;
- a `correct` must be supportable by the surviving sources alone;
- when in doubt, narrow or drop.

`promote.py` assigns permanent IDs (`<round>-<unit>-NNN`), writes `data/verified/<round>.json`, and records
`verdict`, `verification_note`, and `correction_log`. Rejected claims stay in the store with
`verdict: "rejected"` so an ID is never reused, and the build refuses to cite them.

Some sites block fetchers. A verifier may open the page another way and supply the verbatim passage; those
sources carry `fetch_status: "reviewer_confirmed"`. That is a **user decision** (it loosens the evidence rule),
so put it in `DECISIONS.md` and state it in the method's limitations.

Gate: promote reports zero errors; every raw claim has a verdict.

## 5. Red-team second pass — agent, then script

For **high-stakes claims** (any claim naming an actor as responsible, and any claim of the categories you
flagged as serious in `project.json → high_stakes_categories`), run a second agent (`briefs/redteam.md`)
whose task is to *disprove* the claim. Output: `data/secondpass/<batch>.json` with
`decision: keep | amend | downgrade | reject` and a reason. `scripts/apply_edits.py` applies them (stage 7b).

In the worked example this pass mostly adjusted *how strongly conduct was attributed to named individuals*,
which is exactly where overstatement does the most damage.

## 6. Source origins — script

`scripts/normalize_sources.py` adds per-source `publisher_canonical`, `originating_source`,
`originating_basis`, and per-claim `independent_origins`. Additive, asserts nothing else changed, re-runnable.

**Use `independent_origins`, not the count of outlets, to judge grade A.** Five outlets quoting one monitor's
post is one origin. Keep your project's publisher-canon file (`config/publishers.json`) growing as the scout
finds unrecognised names. Re-run after every change to claims.

Output includes `data/regrade_candidates.json`: claims whose grade now looks too high. Those are **user
decisions**, not automatic downgrades.

## 7. Corroboration — agent → script → you → script ↺

For the claims graded B or C that rest on a single origin (`scripts/corroboration_inputs.py` lists them, grouped
by record or theme), run `briefs/corroboration.md` agents. Each writes `out/<claim_id>.json` (a proposal). Then:

1. `scripts/corroborate.py <out_dir>` — **dry run**: re-opens every proposed source, keeps it only if its
   excerpt is found on the live page, and prints the regrade it *would* make.
2. **You review every upgrade by hand.** Agents' "independent" flags are too generous: sources that say
   "according to local media", that confirm the event but not the figure, or that relay the same
   originator. Use `--hold=id` (add the sources, no regrade) and `--counter=id` (a verified source that
   contradicts is really counter-reporting) to correct them.
3. `scripts/corroborate.py <out_dir> --apply` — backs up, writes, re-runs normalise.

Rules of the rubric: C→B needs one independent, non-partisan source. B→A needs two or more independent
non-partisan *origins*. Any verified contradiction is flagged for review, not regraded.
**Corroboration never lowers a grade.** If a corroborating source adds a weaker note, keep the A evidence
and record the note.

## 7b. Corrections — you propose, script applies

Every edit to an existing claim (wording fix, regrade, narrowed statement, red-team amendment) goes through
`scripts/apply_edits.py`: an edit file → dry run → flagged changes (grade change, verdict flip, statement
shrunk by more than 30 %, numbers added or removed) listed for review → `--apply` (backup, `correction_log`
entry, `confidence_original` preserved). Edits that change a grade or a named actor need a user approval
recorded in `DECISIONS.md`.

## 8. Decide the structure — you + user · GATE

This is where **research determines the report**. Do not start with a table of contents. Start with what
the evidence contains.

1. **Build the records registry** (`data/records.json`): one profile per event/incident/case, with a stable ID
   (`REC-0001`). Cards in the prose and rows in the database join through it. Parents (campaigns) and
   children (dated events) are separate records. Everything in a profile cites claim IDs.
   `scripts/scout.py --unattached` proposes the nearest record for every unattached claim, and `--dupes` flags
   likely duplicates. **You review the proposals**; an agent may triage them but an adversarial verifier must
   confirm. `scripts/check_records.py --derive` recomputes grades, `weak` and `in_scope` from the claims.
2. **Build the entity roster** (`data/entities.json`): people, units, organisations, places worth a page,
   with source-attested spellings, identifiers, and a link level to each record (see
   `briefs/attribution_links.md`).
3. **Read the counts** with `scripts/scout.py --partition <field>` for candidate fields (region, actor,
   period, category, grade). Then choose chapters using `edition/DESIGN_TEMPLATE.md §Chapter archetypes`.
   The guide is a set of rules, not a fixed table of contents: a partition becomes chapters when it yields
   3–8 groups of at least ~8 records; a thin category folds into a thematic chapter; a period that dominates
   the evidence earns a timeline chapter.
4. **Show the user the chapter plan** with counts and the reason for each chapter. Get sign-off.

Gate: `records.json` passes `scripts/check_records.py` (exit 0); `edition/edition.json` lists the chapters; the user
has approved the plan. Record it in `DECISIONS.md`.

**Weak records.** A record whose best claim is grade C (single anonymous/partisan/unverified) stays in the
database, flagged "weakly sourced". Decide with the user whether significant weak records get body-text cards
(the worked example: yes, if reported killings, an attack on aid/health/shelter, a siege, or a group
abduction, with their evidence limits stated; the rest database-only). State the rule in the method.

## 9. Deepen — agent ↺ (through 3, 4, 7)

Per-record research (`briefs/research.md` with the record as the unit): independent corroboration, exact
place and date, per-source tolls, names of the dead where published, perpetrator detail *as a source names
it*, counter-claims, related events. Output goes through stages 3 and 4 like everything else; new claims are
**staged** (`data/staged/`) and promoted into `data/verified/` only when a piece of prose cites them.

Then:

- **Reconcile quantities.** One agent proposes a per-record low/high count and a second verifies
  (`briefs/quantities.md`); the accepted values are written into `records.json → headline_toll`
  (`check_records.py` validates them; `build_edition.py` computes the cover floor with parent/child counted once). Rules: never sum per-claim figures (they mix combatants, area-wide totals and superseded counts);
  count a figure relayed by several outlets once; group parent/child and overlapping records so each unit is
  counted once; the cover figure is a floor, not an estimate. Every record with figures either has a
  reconciled value or a written reason it does not.
- **Social-media pilot (optional).** Search each thin record on social platforms, keep posts as leads;
  claims citing a post stay in the database, the report text cites only the outlets those posts led to.

Stop rule as in stage 2.

## 10. Draft the prose — agent proposes, skeptic reviews, script applies

The facts layer lives in `report/sections/<chapter>.html`. House style (`briefs/prose.md`):

- every sentence ends in a `{{c:ID}}` or `{{c:ID1,ID2}}` marker that cites *only* claims that state everything
  in that sentence;
- every fact is attributed ("Group A reported that…"), allegations are never stated as fact, partisan sources
  are named as parties;
- tolls and figures are given per source, never merged;
- short sentences, one spelling convention, no adjectives the sources don't use;
- a record card: `<div class="incident" data-rec="REC-0001">`, heading, a `facts` line (date · place · actor as
  attributed · grade), then narrative paragraphs.

Flow: `scripts/prose_prep.py` builds per-section inputs (existing card HTML, new claims, `allowed_ids`) →
drafting agents write `prose/out/<REC>.json` proposals (extend an existing card, or a new card) → **skeptical
review agents** (`briefs/prose_review.md`) return `accept | revise | reject` and may only *remove or narrow*,
never add → `scripts/apply_prose.py --validate` then `--apply` (idempotent, backs up).

Some sections need no agent: an executive summary and the method are short and written by you from the counts.

## 11. Build and check the facts layer — script · GATE

```bash
python3 scripts/build_report.py --project <slug>     # markers → footnotes; fails on unknown/rejected/unsourced
python3 scripts/check_prose.py  --project <slug>     # numbers must appear in the cited claims
```

`build_report.py` resolves every `{{c:ID}}` marker; an unknown ID, a rejected claim, or a claim with no
confirmed source is a hard error. `{{STAT:KEY}}` placeholders (counts, grade totals) are filled from the data.
`check_prose.py` flags numbers not found in the cited claims and long uncited sentences. Keep a short list of
*known* false positives (date lines, list lead-ins) in `project.json → prose_check_ignore` and treat any new
flag as a bug in the prose until proven otherwise.

Gate: build passes; the flag count is at or below the known baseline.

## 12. Analysis layer — you (+ agents for judgement calls) · GATE

Analysis is **inference from claims**, kept visibly apart from the facts layer (its own chapter, marginal rule
and label). Every analytical statement cites claim IDs. Typical analyses, each optional and each decided by the
research:

- **Attribution / responsibility links** (`briefs/attribution_links.md`): for each record, which named
  person or unit can be linked and how strongly (L1 direct, L2 area command, L3 presence, reject). Graded by
  the weakest supporting claim. A quote from the claim must appear verbatim (`scripts/` validates).
- **Patterns**: monthly by type, before/after a change of control, targeting of groups, sieges/closures,
  attribution by time.
- **External data** (remote sensing, official statistics, a benchmark dataset): tested against records.
  Labelled analysis, not evidence; no cited statement in the facts layer rests on it.
- **Coverage vs benchmark**: where the evidence base is thin, and whether the thinness is the reporting's or
  the research's.

Layout per question: **short answer → graphic → "read with care" → full prose → collapsed data tables.**
Short answers are stored with placeholders filled from computed numbers; the build prints any left unfilled.
The analysis must be understandable by someone who reads only the short answers.

## 13. Build the edition — script · GATE

`scripts/build_edition.py --project <slug>` assembles one self-contained HTML file: one router, one data
store, one evidence drawer, no iframes, no network for data, works from `file://`. Its constraints
(`edition/DESIGN_TEMPLATE.md §0`): the facts layer is **verbatim-locked**; every marker resolves; analysis is
labelled; protected people are never named; names are shown as in the data.

`scripts/check_edition.py` **fails closed**: section text must equal `report/sections/*.html` verbatim
(markers removed), every claim/record/entity link must resolve, no rejected claim may appear, and the
inventory the design promises must be complete.

Gate: build and check both PASS. The edition file is a **build product**: never edit it by hand. Edit sources
and rebuild.

## 14. Independent design critique — agent · once

Before polishing, an independent agent (`briefs/critique.md`) reviews screenshots of the built edition against
the design's reader questions and writes ranked findings. The worked example's first critique found the
highest-value class of problem: **integrity leaks in the encodings** (sizes that overstate the largest claim,
"no figure" shown for records that had figures, dates rendered as more precise than the source, mixed grades
rounded up to the best letter). Treat those as bugs. Refine once against the critique; do not loop.

## 15. Polish and layers — you + design session

Extra views (a timeline, an order of battle, unit or entity pages, a satellite page, a coverage page) are
**layers**: a `layer.js` + `layer.css` pair inlined at a hook, plus an `.md` that documents the helpers and
selectors it depends on. A layer may *move* existing rail nodes, never rebuild them, so ordering conflicts
are localised. A new layer that adds rail entries must load before the layer that reorganises the rail.

When two sessions work on the edition, agree the **ownership split** in writing (who owns `style.css`, who
owns the builder and checker, who may make announced surgical edits to `app.js`).

Chart text (titles, legends, captions) must read plainly: short sentences, one idea each; keep the defined
terms and simplify around them; a caption says what one mark is, how to read colour and size, the caveat,
then "Click … to …".

## 16. Update pass ↺ — agents propose, skeptics review, script applies

Whenever new research lands (stages 2–9), finish by **integrating**: update every section, the analysis prose
and the narrative to reflect it, then rebuild and check. Do not leave new findings only in the database.

Order that avoids stale numbers: claims → normalise → insights/analysis → sections → method → build → check.
Section agents propose edits, skeptical reviewers check them, a script applies them, with backups. Where a
claim is corrected, its `correction_log` records why. Prose that referred to bio timelines by index must be
re-mapped when a timeline changes.

Resolving open review notes uses the accuracy rule: **be conservative; if things are hard to determine from
open sources, narrow the text, don't reach.** Highlight discrepancies; don't hide them and don't overstate.

---

## Where the loops are

```
2 research ─► 3 check ─► 4 verify ─► (promote) ─┐
   ▲                                             ├─► 6 origins ─► 7 corroborate ─► 7b corrections
   └──── gap rounds (scout) ◄─────────────────── ┘                    │
                                                                       ▼
 9 deepen ─► (3,4,7 again) ─► 10 draft ─► 11 build ─► 12 analysis ─► 13 edition ─► 16 update ─┐
                                                                                              │
                                  new research at any time ───────────────────────────────────┘
```

## User gates, summarised

| Stage | Decision the user owns |
|---|---|
| 0 | Scope, evidence bar, naming rules, budgets |
| 4 | Loosening the fetch rule (`reviewer_confirmed`) |
| 6 | Regrading claims whose origins turned out not to be independent |
| 7b | Any grade change or change to a named actor |
| 8 | The chapter plan; what counts as a "weak" record and where it appears |
| 9 | Which figures go on the cover and how the floor is defined |
| 12 | Whether analysis is published and how it is worded |
| 14 | Which critique findings to act on |

Everything else is delegated: resolve it conservatively and report what you did, not a list of questions.
