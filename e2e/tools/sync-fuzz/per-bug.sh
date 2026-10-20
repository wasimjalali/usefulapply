#!/bin/sh
# Isolate one bug at a time and run it before the fix and after it.
#
#   sh e2e/tools/sync-fuzz/per-bug.sh [outdir] [seeds]
#   ONLY_DISCARD=1 sh e2e/tools/sync-fuzz/per-bug.sh     # just the discard bugs; keeps the older round2/new results as they are
#
# Each run uses only the operations that can reach that bug, so a failing seed there is that bug.
# Prints one line per run and writes, per bug, <outdir>/<bug>-<before>.txt and .json, where <before> is:
#
#   round2   the review-round-2 engine (e2e/tools/legacy), for the review round 3 bugs; the fix is "new"
#   before   the current engine broken on purpose by one mutation of mutations.py (the mutation's name is
#            printed at the top of the .txt and written into the .json as "mutation"); the fix is "after"
#
# The discard bugs of PR #159 (the "before" runs are mutations, run by `mutations.py --apply`):
#
#   discard-keeps-draft      Discard acknowledges like Restore and Copy, so the open editor keeps the discarded text
#   discard-unrelated-draft  Discard reaches every editor, so an unrelated open draft is reset (review finding 1)
#   discard-inflight-save    a save running when its draft is discarded reopens the draft, then saves it with no
#                            EditorStart (review finding 2)
#   discard-pr159            findings 1 and 2 together: the discard as f7c359a6 had it
#
# Exact commands for one "before" run, from the repo root (this is what the function below runs):
#
#   python3 e2e/tools/sync-fuzz/mutations.py --apply M-discard-scope -- \
#     npx tsx --tsconfig e2e/tools/tsconfig.sync-fuzz.json e2e/tools/sync-fuzz.ts --engine new --no-cases \
#     --seeds 2000 --only edit,save,poll,agent,tabWrite,editorOpen,type,editorSave,dismiss \
#     --out evals/results/2026-10-20-sync-fuzz/per-bug/discard-unrelated-draft-before.json
set -e
OUT="${1:-evals/results/2026-10-20-sync-fuzz/per-bug}"
SEEDS="${2:-2000}"
mkdir -p "$OUT"
BASE="edit,save,poll,agent,tabWrite"
FUZZ="npx tsx --tsconfig e2e/tools/tsconfig.sync-fuzz.json e2e/tools/sync-fuzz.ts"

report() {
  printf '%s: ' "$1"
  grep '^failing seeds' "$2" | cut -c1-120
}

# A run on an engine of its own (round2) or on the current one.
run() {
  bug="$1"; engine="$2"; only="$3"
  $FUZZ --engine "$engine" --no-cases --seeds "$SEEDS" --only "$only" --out "$OUT/$bug-$engine.json" > "$OUT/$bug-$engine.txt" 2>&1 || true
  report "$bug on $engine" "$OUT/$bug-$engine.txt"
}

# The current engine with one mutation applied (before), then unmodified (after).
run_mutation() {
  bug="$1"; mutation="$2"; only="$3"
  python3 e2e/tools/sync-fuzz/mutations.py --apply "$mutation" -- \
    $FUZZ --engine new --no-cases --seeds "$SEEDS" --only "$only" --out "$OUT/$bug-before.json" > "$OUT/$bug-before.txt" 2>&1 || true
  report "$bug before ($mutation)" "$OUT/$bug-before.txt"
  $FUZZ --engine new --no-cases --seeds "$SEEDS" --only "$only" --out "$OUT/$bug-after.json" > "$OUT/$bug-after.txt" 2>&1 || true
  report "$bug after" "$OUT/$bug-after.txt"
}

if [ "$ONLY_DISCARD" != "1" ]; then
  for engine in round2 new; do
    run workflow-complete-stale "$engine" "$BASE,workflow"
    run typing-during-save "$engine" "$BASE,editorOpen,type,editorSave"
    run restore-and-copy "$engine" "$BASE,restore,copy"
    run silent-requirements-write "$engine" "$BASE,silentRequirements"
  done
fi

EDITORS="$BASE,editorOpen,type,editorSave,dismiss"
run_mutation discard-keeps-draft M-discard-rebase "$EDITORS"
run_mutation discard-unrelated-draft M-discard-scope "$EDITORS"
run_mutation discard-inflight-save M-discard-inflight "$EDITORS"
run_mutation discard-pr159 M-pr159 "$EDITORS"
