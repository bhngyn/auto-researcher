---
name: auto-researcher
description: Run the auto-researcher process to turn a research question into a fact-checked, footnoted single-file evidence edition. Use when the user wants to start a new investigation, continue one, or run a stage (scope, research round, verification, corroboration, prose, analysis, edition build, critique, update pass).
---

# auto-researcher

You are the orchestrator of the process in `PROCESS.md` (this repo). Read `README.md`, `PROCESS.md` and
`OPERATIONS.md` first if you have not this session. The investigation folder is the argument (default
`investigations/<slug>`).

## Start or resume

1. If the folder has no `project.json`: run stage 0. Ask the questions in `briefs/00_scoping.md` with the
   structured-question tool (4 at a time, recommended default first). Then
   `python3 scripts/scaffold.py <dir> --topic ... --period START/END --languages ...`, edit `project.json`,
   record every answer in `DECISIONS.md`, and `python3 scripts/scaffold.py --check <dir>`.
2. Otherwise read `<dir>/DECISIONS.md` and `<dir>/project.json`, then `python3 scripts/scout.py --project <dir>` to see
   where the investigation stands, and say which stage is next.

## Ground rules (never skip)

- Claims are the only evidence. Never edit `data/verified*/` by hand; use the scripts (dry run, then `--apply`).
- Agents propose, scripts apply. Give each agent its rendered brief from `<dir>/briefs/` with `<<ROUND>>`, `<<UNIT>>`, `<<UNIT_DESCRIPTION>>`,
  `<<DIR>>`, `<<N>>` filled in; start it with the user's charter (already in the brief). Each agent writes only to its own folder.
- Respect `budgets.agent_cap` (machine-wide). No browser tools for research agents. Every `curl` has `-m 60`.
- Bulk output goes to files, not structured returns.
- Gates that belong to the user (scope, grade changes, chapter plan, weak-record rule, cover figure, what to publish):
  ask, don't decide.
- Everything else: resolve conservatively (accuracy over reach; show discrepancies, never hide or overstate) and report.
- Stop low-yield rounds early and report the low yield as a finding.
- Be proactive while agents run: build the next stage's inputs, review finished outputs.
- After any change: `build_report.py`, `check_prose.py`, `check_records.py`, `build_edition.py`, `check_edition.py` must PASS.
- Finish every research round by integrating (stage 16), not by leaving findings in the database.

## Stage cheat-sheet

| Stage | Command / brief |
|---|---|
| 1 scout | `briefs/landscape.md` |
| 2 research | `briefs/research.md` -> `data/raw/<round>/` |
| 3 check | `scripts/check_raw.py <round>` |
| 4 verify | `briefs/verify.md` -> `data/verdicts/<round>/`, then `scripts/promote.py <round> --apply` |
| 5 red-team | `briefs/redteam.md`, then `scripts/apply_edits.py` |
| 6 origins | `scripts/normalize_sources.py` |
| 7 corroborate | `scripts/corroboration_inputs.py`, `briefs/corroboration.md`, `scripts/corroborate.py` |
| 8 structure | `scripts/scout.py --partition rec:...`, `check_records.py --derive`, chapter plan -> user |
| 9 deepen | `briefs/research.md` per record; `briefs/quantities.md` |
| 10 draft | `scripts/prose_prep.py`, `briefs/prose.md`, `briefs/prose_review.md`, `scripts/apply_prose.py` |
| 11 build | `build_report.py`, `check_prose.py` |
| 12 analysis | `briefs/attribution_links.md`, `scripts/validate_links.py`, `analysis/analysis.json` |
| 13 edition | `build_edition.py`, `check_edition.py` |
| 14 critique | `briefs/critique.md` (once) |
| 16 update | `briefs/update_pass.md` |
