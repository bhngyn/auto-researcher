# auto-researcher

A process kit for fact-checked, footnoted evidence editions. Read `README.md` for the pipeline and `PROCESS.md` for the
stages. This file is the short list of rules for working *in this repo*.

## Rules

- **Outputs are build products; never edit them by hand.** `build/report.html` and `build/edition.html` (in an
  investigation folder) are written by `scripts/build_report.py` and `scripts/build_edition.py`. Edit the sources
  (`report/sections/*.html`, `report/method.html`, `analysis/analysis.json`, `data/...`, `edition/edition.json`),
  then rebuild and run the checks. **The checks must PASS**:
  ```bash
  python3 scripts/build_report.py  --project <dir>
  python3 scripts/check_prose.py   --project <dir>
  python3 scripts/check_records.py --project <dir>
  python3 scripts/build_edition.py --project <dir>
  python3 scripts/check_edition.py --project <dir>
  ```
- **Claims are the only evidence.** Never cite anything else. Never edit `data/verified*/` by hand: use `promote.py`,
  `corroborate.py` or `apply_edits.py` (dry run first, `--apply` explicitly, backups are automatic).
- **Agents propose, scripts apply.** Agents write only to their own output folder.
- **Investigations live in `investigations/` and are git-ignored.** Never commit research data. `examples/toy` is
  synthetic and is the only investigation in git.
- **No personal data in the repo.** No emails, no API keys (keys live in `~/.<service>_key`), no real biographies.
- **Stdlib-only Python.** No third-party dependencies in `scripts/`. `edition/core` is vanilla JS with no network.
- Known gaps in edition/core: map has no basemap; no in-page chapter contents list.
- Keep `edition/DATA_CONTRACT.md` and `scripts/build_edition.py` in step; it is the interface to `app.js`.
- Briefs use `<<PLACEHOLDER>>` (not `{{...}}`, which is the claim-marker syntax). `<<ROUND>> <<UNIT>> <<UNIT_DESCRIPTION>> <<DIR>> <<N>>`
  are filled at launch; the rest by `scaffold.py --render`.

## Testing the kit

```bash
bash scripts/selftest.sh     # runs the whole pipeline on a scratch copy of examples/toy; no network
```

## Working style (from the user)

- Accuracy over reach: be conservative; surface discrepancies, never hide or overstate.
- Be proactive while agents run; don't idle.
- Use tokens smartly: refine and fill gaps rather than launch huge rounds; stop low-yield rounds.
- Agent cap is machine-wide (`project.json → budgets.agent_cap`; see `OPERATIONS.md`).
