# Quantity reconciliation (propose, then verify): <<QUANTITY_NAME>> per record

## Why
<<ORIGINAL_REQUEST>>

The cover reports one headline figure (for example "people reported killed") and every record reports its own.
Summing per-claim figures is wrong: they mix combatants with civilians, area-wide and cumulative totals,
superseded counts, and the same figure relayed by several outlets. This pass reconciles the figures **per
record**, and records the lowest and highest record-specific count. The result is a **floor, not an
estimate**.

## Proposer brief
Input: `<<DIR>>/packets/<REC>.json`. It holds the record, every claim with figures (statement, figures line,
grade, sources, `originating_source`), and the record's parent/children.

Decide, for the record:
- `low` and `high`: the lowest and highest **record-specific** count of <<QUANTITY_NAME>> that credible claims
  support. Exclude: combatants (unless the project counts them), area-wide or cumulative totals, counts
  superseded by a fuller count from the same origin. Count a figure relayed by several outlets **once**.
- `cover`: `true` if the low figure may go into the cover sum; `false` if its only source is a party to the
  matter, or if the civilian status or attribution is in doubt (say why).
- `claims`: the claim IDs behind `low` and `high`.
- `note`: one sentence a reader can follow ("Monitor Y: 11; Outlet X: 14, relaying Monitor Y").
- If there is no defensible record-specific figure, `low` and `high` are `null` and `open_reason` says why.
- Never average, never round, never infer a figure that no claim states.

Write `<<DIR>>/proposals/<REC>.json`:
```json
{"record": "…", "low": 11, "high": 14, "cover": true, "claims": ["…"], "note": "…", "open_reason": null}
```

## Verifier brief (a different agent; default-skeptical)
Read the packet and the proposal. Check every number against the cited claims; check the exclusions (was a
combatant, an area total or a relayed duplicate counted?); check that `cover:false` is justified when the only
source is partisan. Write `<<DIR>>/verified/<REC>.json` with `verdict: accept | revise | reject`, the revised
proposal if `revise`, and a `reason`. Revisions may only narrow.

## Apply (script)
A checker confirms every cited claim exists and states the figure. Hand decisions go in
`tolls/overrides.json`; its `_nocover` list keeps partisan-only or doubtful figures off the cover sum; its
`_open_reasons` map explains records that have figures but no reconciled value. The cover sum groups
parent/child and flagged-overlap records so each unit is counted once, and reports three buckets of
"not tallied": *open* (a figure exists, `cover:false`), *reviewed* (no figure, a written reason), *unreviewed*
(figures but no reason: a build warning). A new record with figures needs a reconciled value or a reason.
