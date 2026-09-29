# Landscape scout (stage 1, one lean agent or you)

## Why
<<ORIGINAL_REQUEST>>

Before any research round, learn the terrain cheaply, so that the tracks you launch are the right ones and
the sources you point agents at are real. **Budget: about 25 searches and fetches in total.** This is not a
research round: do not write claims.

## Find out
1. **Sources.** Which outlets, monitors, official bodies and NGOs cover <<TOPIC>>, in <<LANGUAGES>>? For each,
   note: language, whether it blocks fetchers (403/429/JS-only), whether it has an API or feed you can script
   (a WordPress `/wp-json/` endpoint is common), and whether it is a party to the matter.
2. **Shape.** The dominant events, actors, places and dates between <<PERIOD>>. Where does the reporting
   cluster, and where is it silent?
3. **Benchmark.** Is there an external dataset or monitor (an event database, a statistics office) you could
   later compare coverage against? Note how to access it and its licence.
4. **Vocabulary.** Terms in each language that searches should use: place names in native script, the local
   words for the events, actor names and aliases.
5. **Limits.** What cannot be reached (closed regions, paywalls, no internet coverage)? Write it down: it
   goes in the method's limitations.
6. **Tracks.** Propose 6–12 research tracks that split the question along the axes the report will need:
   geography, actor, theme, language, source type. For each: one sentence, the best 3 starting sources,
   the search terms.

## Output: `<<PROJECT_DIR>>/data/landscape.md`
A page: sources table, shape, benchmark, vocabulary, limits, proposed tracks. Reply `done: <n tracks>`.
Do not use browser tools. Any `curl` carries `-m 60`.
