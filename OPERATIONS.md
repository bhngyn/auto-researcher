# Operating rules

Lessons from running the process for real. Most were paid for with an incident: a frozen machine, a hung
download, a claim that quietly drifted, a wasted 250k-token round.

## Agents

- **Cap concurrent agents machine-wide, not per session.** Launching several fan-outs at once froze the
  machine. The cap counts every agent across every session (subagents *and* workflow agents). Set it in
  `project.json → agent_cap` (default 4). Agree a split with any other session before launching; if the
  machine freezes, drop back down.
- **Tell agents the user's original request**, not just the task. An agent that only saw "ask the questions
  again" refused. Every brief opens with *who asked and why*.
- **No browser tools for research agents.** Use search and fetch tools plus one named local helper. One agent
  using a browser pane hung for five hours.
- **Every `curl` gets `-m 60`.** A download without a timeout leaves a hung process that ties up an agent slot
  for hours. Check for stragglers: `ps -Ao pid,etime,command | grep curl`.
- **Balance research against verification.** When finished-but-unverified files pass about a dozen, give free
  slots to verifiers.
- **Web-search budgets are shared** by every subagent in a session. Agents that hit the limit tend to write
  fake `none_found`. Require `not_researched` for unresearched gaps and `none_found` only with the queries
  listed.
- **Write only your own output.** Each agent writes to its own folder and edits nothing else.

## Structured output vs files

- Large or bulk structured returns fail: agents asked to return a big nested object, or a batch array, often
  never call the return tool (about a third fail for large nested schemas; nearly all for batch-of-N).
- For anything large, complex or bulk: **each agent `Write`s one plain-JSON file per item** and replies "done".
  Read the files back. Reserve schema returns for small flat objects.

## Propose, then apply

- **Agents propose, code applies.** Never let parallel agents mutate shared files. One agent owns one file.
  A deterministic script backs up, validates each proposal, flags suspicious changes (verdict flips, big
  content drops, grade changes), and applies.
- **Backups before every apply**, into `data/backups/<tag>/`. Never overwrite an existing backup: the first
  copy is the pre-change original.
- **Dry-run by default; `--apply` explicitly.** Scripts print what they *would* do.
- **Idempotence.** Re-running an apply must not duplicate notes or sources. If you can't make it idempotent,
  say so in the script's docstring and de-duplicate by hand after a re-run.
- **A scripted scout comes before agents.** A cheap deterministic pass catches the mechanical class of problem
  and scopes the risk. Then *adversarially verify detector hits before fixing*: default-skeptical, many hits
  are false positives (namesakes, spokespeople denying something, a place-name match that isn't the place).

## Evidence hygiene

- **Never sum per-claim figures.** They include combatants, area-wide totals and superseded counts. Reconcile
  per record, count a relayed figure once, and describe the cover number as a floor.
- **Dedupe URLs after normalising**: unquote twice, strip the scheme, `www.` and any `/en/`/`/ar/` language
  prefix. The same article under a differently encoded URL is one source.
- **Date honesty.** If a source gives only "on Wednesday", don't write the date in the statement. Put the
  computed date in `date` and note "computed from weekday and publication date". A period stays a period;
  never render "from mid-2025" as a specific day.
- **Cite the original publisher**, not a site that republishes it. Use the syndicated copy only if the
  original cannot be fetched, and set `originating_source`.
- **A failing fetch isn't always flakiness.** Inspect it: some sites 403 a bare user agent (retry with a
  browser UA), some are only reachable via an archive copy (store it as `archive_url`), some excerpts differ
  from the page by curly quotes.
- **Spelling is data.** Names use the spelling a source prints. Keep a mapping file
  (`data/name_spellings.json`); place labels come from your gazetteer's chosen token, never from a raw
  gazetteer dump. Agents never coin a transliteration; where only another script names someone, keep that
  script and set `latin: null`.
- **Corroboration never lowers a grade.** A weaker corroborating note is recorded, not averaged in.
- **A partisan claim is a claim by a party.** Never present it as established. Never let two partisan
  sources make an A.
- **Conflicting accounts stay visible.** Set them out neutrally with attribution rather than choosing one.
  Remove text only if unsupported or in breach of a rule (a weak record, a named survivor).

## Token discipline

- Prefer **refining and filling gaps** to large new fan-outs. A 30-agent round costs roughly 150–250k
  tokens; stop when yield is low and report the low yield as a finding.
- Prefer **deterministic scripts and one lean agent** to wide fan-outs. Do small analysis and UI work
  directly, without agents.
- **Always integrate at the end** (stage 16). Research that lives only in the database is not in the report.
- **Be proactive while agents run.** Don't end turns on "waiting for batch X" if there is independent work:
  build the next stage's scripts, review finished outputs, prepare briefs.

## Ownership when several sessions touch one investigation

- One session owns `data/verified*/`. Others announce and ask before editing claims.
- Only one session runs the build at a time (it writes shared outputs).
- Statement changes: tell every session that cites claims by ID (biographies, timelines, analysis).
- Analysis files keyed by an anchor or a title-derived ID break when a card is renamed: remap by claim
  overlap, then re-run the registry and the validators.
- After any content change by a peer: build, then check.

## Workflow-tool footguns

- Arguments may not reach the script when launched by path: read inputs from a file, or hard-code with a
  fallback (`(args && args.x) || DEFAULT`).
- A big workflow's completion `<result>` is truncated. Parse the full result from the task output file.
- Persist scratch data to an owner-only directory, never a world-readable temp dir.
- Build the task array before `parallel(...)`: a long `(await parallel(X.map(...)))` chain is easy to close
  with the wrong number of parentheses.

## Security and privacy

- Never put the user's email or any identity in a request header, URL or payload (one gazetteer request once
  carried it). Keep API keys in the user's home directory (`~/.<service>_key`), never in the repo.
- Investigations are git-ignored. Do not commit claims, sources, names of the dead or biographies to a shared
  remote without the user's say-so.
- Privacy scan before release: search every excerpt shown in the edition for protected names (survivors,
  detainees, minors). Keep a `redactions.json`; an empty file after a real scan is a valid result.
- A whole-document encryption step (a "lock" script) is a release option for sensitive editions; it is outside
  this kit.

## Design ownership rules of thumb

- Design first, then an independent critique, then refine once.
- Paragraphs must be short; split at marker-ended sentences.
- Any change to encodings (size, colour, glyph) is checked against "does this overstate certainty?".
- Chart/caption wording: short sentences, defined terms kept, one idea each.
- Mobile: check every layer at phone width; clipped tables and chronicle rows are common.
