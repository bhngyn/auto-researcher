#!/usr/bin/env bash
# Runs the whole pipeline on a scratch copy of examples/toy. No network (sources are fixture:// pages).
# Exit code 0 only if every stage passes. Usage: bash scripts/selftest.sh
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R "$REPO/examples/toy" "$TMP/toy"
rm -rf "$TMP/toy/data/verified" "$TMP/toy/data/backups" "$TMP/toy/build"   # rebuild the claim store from raw + verdicts
P="--project $TMP/toy"
S="python3 $REPO/scripts"
step() { printf '\n=== %s\n' "$1"; }

step "scaffold --check";        $S/scaffold.py --check "$TMP/toy" 2>&1 | tail -1
for r in r1 r2; do
  step "check_raw $r";          $S/check_raw.py $r $P | tail -3
  step "promote $r";            $S/promote.py $r $P --apply | tail -2
done
step "normalize_sources";       $S/normalize_sources.py $P | tail -1
step "check_records --derive";  $S/check_records.py $P --derive
step "scout";                   $S/scout.py $P | head -8
step "build_report";            $S/build_report.py $P
step "check_prose";             $S/check_prose.py $P
step "build_edition";           $S/build_edition.py $P
step "check_edition";           $S/check_edition.py $P

# ---- negative tests: each of these MUST fail. A green build has to mean something.
expect_fail() { if "$@" >/dev/null 2>&1; then echo "EXPECTED FAILURE DID NOT HAPPEN: $*"; exit 1; else echo "ok (failed as required): ${*: -3:1}"; fi; }
cp -R "$TMP/toy" "$TMP/neg"
step "negative: unknown claim marker";  sed -i.bak 's/{{c:r1-upper-basin-002}}/{{c:nope-001}}/' "$TMP/neg/report/sections/upper-basin.html"
expect_fail python3 $REPO/scripts/build_edition.py --project $TMP/neg
step "negative: rejected claim cited";  sed -i.bak 's/{{c:nope-001}}/{{c:r1-lower-basin-004}}/' "$TMP/neg/report/sections/upper-basin.html"
expect_fail python3 $REPO/scripts/build_report.py --project $TMP/neg
step "negative: invented number";       sed -i.bak 's/{{c:r1-lower-basin-004}}/{{c:r1-upper-basin-002}}/; s/about 2,300 dead fish/about 9,999 dead fish/' "$TMP/neg/report/sections/upper-basin.html"
expect_fail python3 $REPO/scripts/check_prose.py --project $TMP/neg
step "negative: tampered edition text"; cp "$TMP/toy/build/edition.html" "$TMP/neg/build/edition.html" 2>/dev/null || { mkdir -p "$TMP/neg/build"; cp "$TMP/toy/build/edition.html" "$TMP/neg/build/edition.html"; }
sed -i.bak 's/about 2,300 dead fish/about 3,300 dead fish/' "$TMP/neg/build/edition.html"
cp "$TMP/toy/report/sections/upper-basin.html" "$TMP/neg/report/sections/upper-basin.html"
expect_fail python3 $REPO/scripts/check_edition.py --project $TMP/neg
printf '\nSELFTEST PASSED\n'
