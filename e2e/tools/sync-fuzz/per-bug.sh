#!/bin/sh
# Isolate each review round 3 bug and run it on the review-round-2 engine (before) and the current one (after).
#
#   sh e2e/tools/sync-fuzz/per-bug.sh [outdir] [seeds]
#
# Each run uses only the operations that can reach that bug, so a failing seed there is that bug.
# Writes <outdir>/<bug>-<engine>.txt and .json, and prints one line per run.
set -e
OUT="${1:-evals/results/2026-10-20-sync-fuzz/per-bug}"
SEEDS="${2:-2000}"
mkdir -p "$OUT"
BASE="edit,save,poll,agent,tabWrite"
run() {
  bug="$1"; engine="$2"; only="$3"
  npx tsx --tsconfig e2e/tools/tsconfig.sync-fuzz.json e2e/tools/sync-fuzz.ts \
    --engine "$engine" --no-cases --seeds "$SEEDS" --only "$only" --out "$OUT/$bug-$engine.json" > "$OUT/$bug-$engine.txt" 2>&1 || true
  printf '%s on %s: ' "$bug" "$engine"
  grep '^failing seeds' "$OUT/$bug-$engine.txt" | cut -c1-120
}
for engine in round2 new; do
  run workflow-complete-stale "$engine" "$BASE,workflow"
  run typing-during-save "$engine" "$BASE,editorOpen,type,editorSave"
  run restore-and-copy "$engine" "$BASE,restore,copy"
  run silent-requirements-write "$engine" "$BASE,silentRequirements"
done
# Discard must close the open editor: the engine without the discarded flag fails here, the current one does not.
run discard-then-save new "$BASE,editorOpen,type,editorSave,dismiss"
