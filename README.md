# auto-researcher

A reusable process for turning an open-ended research question into a **fact-checked, footnoted, single-file
evidence edition**: every sentence traces to a claim, every claim traces to a verbatim excerpt on a page someone
actually fetched, and every grade says how sure we are and why.

It was distilled from a large human-rights investigation (about 1,500 claims,
260 incident profiles, 13 chapters, five research rounds, an analysis layer, satellite work and a redesigned
single-file edition). That project is the worked example ([examples/worked-example.md](examples/worked-example.md)). Nothing
from its data ships here. What ships is the **method, the agent briefs, the guard-rail scripts and a minimal
edition engine**.

> **The rule that makes this work:** research decides the *structure* of the report; this repo fixes the
> *skeleton* — the stages, the evidence rules, the checks, and the archetype pages every edition gets.

## The pipeline

```
 0 SCOPE ──► 1 SCOUT ──► 2 RESEARCH ──► 3 CHECK ──► 4 VERIFY ──► 5 RED-TEAM
 interview   landscape   agents write   scripts     adversarial   try to disprove
 project.json  + tracks   raw/*.json    fetch every  agent, then   high-stakes
 DECISIONS.md             (rounds ↺)    excerpt      promote.py    claims
                                                                       │
   ┌───────────────────────────────────────────────────────────────────┘
   ▼
 6 ORIGINS ──► 7 CORROBORATE ──► 8 STRUCTURE ──► 9 DEEPEN ──► 10 DRAFT ──► 11 BUILD
 normalise     propose → dry     records, roster, per-record    sections     markers →
 sources;      run → review →    chapter plan     research      w/ {{c:ID}}  footnotes;
 independent   apply; never      (GATE: user      (↺ 3,4,7)     + skeptical  fail closed;
 origins       lowers a grade    reviews)                       review       number check
                                                                                │
   ┌────────────────────────────────────────────────────────────────────────────┘
   ▼
 12 ANALYSIS ──► 13 EDITION ──► 14 CRITIQUE ──► 15 POLISH ──► 16 UPDATE PASS ↺
 separate,       one file,      independent     layers,       integrate new
 labelled,       router,        agent reviews   ownership     findings into
 cites claim IDs evidence       screenshots;    splits        sections + analysis
                 drawer,        refine once
                 verbatim lock
```

`↺` marks stages that loop. The full description of each stage — inputs, outputs, who does the work (you, an
agent, a script), and the gate that lets you move on — is in [PROCESS.md](PROCESS.md).

## What is in the repo

| Path | What it is |
|---|---|
| [PROCESS.md](PROCESS.md) | The 17 stages, in order, with gates and loops |
| [OPERATIONS.md](OPERATIONS.md) | Hard-won operating rules: agent caps, budgets, backups, what breaks |
| [schema/](schema/) | Claim record, source record, grade rubric, record (event) profile, entity roster |
| [briefs/](briefs/) | Agent briefs as templates (`<<TOPIC>>`, `<<ACTORS>>`, …). Hard rules kept verbatim |
| [scripts/](scripts/) | Stdlib-only Python: scaffold, excerpt checker, promote, normalise, corroborate, apply-edits, prose apply, scout, build, checks |
| [edition/](edition/) | Design template (the skeleton), the data contract, and a minimal engine (`core/`) |
| [examples/](examples/) | `toy/`: a tiny synthetic investigation that builds end to end. `worked-example.md`: what the real one decided |
| `.claude/skills/auto-researcher/` | A Claude Code skill that drives the process from a fresh conversation |

## Start a new investigation

```bash
git clone <this repo> && cd auto-researcher

# 1. scaffold a project folder (renders the briefs with your topic)
python3 scripts/scaffold.py investigations/my-topic \
    --topic "Water contamination in the Foo River basin" \
    --period 2022-01-01/2026-06-30 --languages en,es

# 2. answer the scoping questions (briefs/00_scoping.md), edit investigations/my-topic/project.json,
#    and record every decision in investigations/my-topic/DECISIONS.md

# 3. work through PROCESS.md. In Claude Code, the skill does the orchestration:
#      /auto-researcher investigations/my-topic
```

Try the pipeline on the synthetic example first. It takes seconds and needs no network:

```bash
python3 scripts/build_report.py --project examples/toy      # resolves every {{c:ID}} marker, fails closed
python3 scripts/check_prose.py  --project examples/toy      # numbers in prose must appear in the cited claims
python3 scripts/build_edition.py --project examples/toy     # writes examples/toy/build/edition.html
python3 scripts/check_edition.py --project examples/toy     # verbatim lock + every reference resolves
```

Or run everything, plus negative tests that prove the checks fail closed, in one go: `bash scripts/selftest.sh`.

Open `examples/toy/build/edition.html`. It works from `file://` and makes no network calls.

## Ported, and documented-only

| Ported (runs, tested on the toy) | Documented only (described in PROCESS / examples, not ported) |
|---|---|
| scaffold, excerpt check, promote, normalise, corroborate, apply-edits, records check, prose prep/apply, link validation, scout, report + edition build and checks, the core edition engine | Satellite / fire-detection / imagery analysis, person photo cards, the bios and glossary generation pipelines, toll-reconciliation apply script, staged-claim promotion (`data/staged/` → `verified` when prose cites a claim; `promote.py` covers only the raw → verified step), social-media (X/Telegram) search, the layer views (order of battle, units, timeline, cards, improve), HTML encryption. Each is described where it fits, so a project can rebuild it |

## The five ideas to keep

1. **Claims are the only evidence.** A claim is one source's account of one thing, with a verbatim excerpt.
   Prose, tables, charts and dossiers all cite claim IDs. Nothing else is evidence.
2. **Agents propose, code applies.** Agents write files under their own output folder. A script validates,
   backs up, flags anything suspicious, then applies. Agents never edit shared data.
3. **Fail closed.** An unknown ID, a rejected claim, an unmatched excerpt, a number that is in no cited claim,
   a changed word in the verbatim-locked text: each stops the build. A green build means something.
4. **Say how sure you are, and say it the same way everywhere.** Grade A/B/C is a shape (■ ◧ □), not a colour, and
   is computed from *independent origins*, not from how many outlets repeated something.
5. **Conservative beats complete.** Narrow a claim rather than stretch it. Show discrepancies rather than pick a
   winner. Corroboration can raise a grade; it must never lower one. When a source blocks the fetch, the claim
   waits, it does not get a pass.

## Licence and data

Private. Investigations under `investigations/` are git-ignored: research data can be sensitive and large.
