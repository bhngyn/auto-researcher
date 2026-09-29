# Stage 0: scoping questions

Not an agent brief. This is the interview you (the orchestrating session) run with the user before anything is
researched. Ask them with a structured-question tool, up to four at a time, offering a recommended default
first. Record every answer, with the date and the reason, in `DECISIONS.md`. The answers populate
`project.json` (see `schema/project.example.json`).

These questions decided the shape of the worked example. They are expensive to change once claims exist.

## A. The question

1. **What is the question, in one sentence?** Fact-only ("what do open sources document about …") or
   explanatory ("why …")? *Default: fact-only first; analysis is a separate, labelled layer added later.*
2. **Who is the audience?** Investigators and lawyers, journalists, policy readers, the public? This sets
   register, how much Arabic/other-script text is shown, and how heavy the method section is.
3. **Which deliverable?** *Default: one self-contained HTML edition (works from disk), with JSON/CSV data
   downloads. Print version optional.*

## B. Boundaries

4. **Time window.** Start, end, and the "as of" date that will be printed on the cover.
5. **Geography or domain.** Where is the edge? What counts as in and out?
6. **Actors.** Whose conduct is investigated (*in scope*)? Whose appears only where needed for context or
   attribution (*context only*)? Say in the method that omission of the second group is **not** a finding.
7. **Which events are out of scope even inside the window?** (Disputed attribution? Unattributed? A different
   category of harm?) The worked example moved "attribution disputed" and "unattributed" out of scope.

## C. The evidence bar

8. **Grade rubric.** Accept the defaults in `schema/GRADES.md`, or change them. Which institutions' single-origin
   reports count as *documented* (grade A)?
9. **Partisan sources.** Usable as "party X says …" only. Confirm.
10. **Social media and OSINT.** Evidence, or only a lead to the outlet that relayed it? Archive copies
    required? *Default: leads; a claim may cite a post only in the database, never in the report text.*
11. **Fetch rule.** Must every excerpt be matched on the live page by script? May a verifier vouch for pages
    that block fetchers (`reviewer_confirmed`)? *Default: script match required; reviewer_confirmed off until
    the user opts in.*
12. **Languages.** Research in every language the sources use. Which? Which outlets/monitors are essential?

## D. Naming, protection and vocabulary

13. **Who may never be named?** *Default: survivors of sexual violence or torture, living detainees or
    abductees, minors.* Are witnesses protected too?
14. **Who may be named?** *Default: the dead, where a cited source names them, spelled as that source prints;
    officials and alleged perpetrators, with the "naming is not a finding" disclaimer.*
15. **Vocabulary.** Descriptive categories only, or legal/technical labels allowed when attributed?
16. **Spelling.** House spelling (UK/US), and the transliteration rule.

## E. Budgets and working style

17. **Agent cap** (machine-wide) and **web-search budget**. Both are shared across sessions and subagents.
18. **How much spend is tolerable per round**, and the stop rule for low-yield rounds.
19. **Which decisions do you want to make yourself?** *Default: scope, grade changes, chapter plan, named-actor
    changes. Everything else is delegated: resolve conservatively and report.*
20. **Sessions and ownership.** Will several sessions work on this? Who owns the claim store, the builder, the
    stylesheet?

## Output

- `project.json` filled in and validated (`python3 scripts/scaffold.py --check <dir>`).
- `DECISIONS.md`: one dated entry per answer.
- A one-paragraph **charter** at the top of `DECISIONS.md`, in the user's own words where possible. This is the
  text you paste at the top of every agent brief as "who asked and why". Agents that only see a task, without
  the request, have refused or drifted.
