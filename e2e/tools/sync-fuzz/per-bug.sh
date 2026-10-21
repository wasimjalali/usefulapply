#!/bin/sh
# Isolate one bug at a time and run it before the fix and after it.
#
#   sh e2e/tools/sync-fuzz/per-bug.sh [outdir] [seeds]
#   ONLY_DISCARD=1 sh e2e/tools/sync-fuzz/per-bug.sh <outdir>   # just the discard bugs
#   ONLY_R3=1 sh e2e/tools/sync-fuzz/per-bug.sh <outdir>        # just the review round 3 bugs of PR #159
#
# Results are never overwritten: a run whose .txt or .json already exists stops the script before it starts,
# so give a new outdir for a new run. A run that crashes (no summary line, or an exit code other than 0 = no
# failing seed and 1 = failing seeds) prints CRASHED, and the script exits 1 at the end.
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
# The review round 3 bugs of PR #159 (ONLY_R3=1; "before" is again a mutation of mutations.py):
#
#   r3-h1-snapshot-scope     an acknowledgement moves the producing editor's whole snapshot, so the email panel's
#                            follow-up snapshot moves with the email (H1)
#   r3-h2-merge-lineage      an entry a merge makes names no editor and reaches every editor of its group, so a
#                            Discard resets a newer draft (H2)
#   r3-h3-lineage            Restore and Copy reach every editor of the group, whatever its lineage (H3)
#   r3-moved-only            an editor conflict sets aside only the groups that moved, so the email panel's other
#                            typed document is kept nowhere and Cancel loses it (the round 3 I1 seeds)
#   r3-store-draft           a draft the store already holds (a Restore whose save failed) still counts as stale, so
#                            its conflict entry holds no text and acknowledging it rebases the editor
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

CRASHED=0

# Never write over an earlier result.
fresh() {
  for file in "$1.txt" "$1.json"; do
    if [ -e "$file" ]; then
      echo "per-bug.sh: $file already exists; refusing to overwrite it. Give a new outdir." >&2
      exit 2
    fi
  done
}

# $1 label, $2 the run's .txt, $3 its exit code. 0 and 1 are the fuzz's own answers; anything else is a crash.
report() {
  summary=$(grep '^failing seeds' "$2" | cut -c1-120 || true)
  if [ -z "$summary" ] || [ "$3" -gt 1 ]; then
    CRASHED=1
    echo "$1: CRASHED (exit $3), see $2:"
    tail -n 5 "$2" | sed 's/^/    /'
  else
    echo "$1: $summary"
  fi
}

# A run on an engine of its own (round2) or on the current one.
run() {
  bug="$1"; engine="$2"; only="$3"
  fresh "$OUT/$bug-$engine"
  status=0
  $FUZZ --engine "$engine" --no-cases --seeds "$SEEDS" --only "$only" --out "$OUT/$bug-$engine.json" > "$OUT/$bug-$engine.txt" 2>&1 || status=$?
  report "$bug on $engine" "$OUT/$bug-$engine.txt" "$status"
}

# The current engine with one mutation applied (before), then unmodified (after).
run_mutation() {
  bug="$1"; mutation="$2"; only="$3"
  fresh "$OUT/$bug-before"
  fresh "$OUT/$bug-after"
  status=0
  python3 e2e/tools/sync-fuzz/mutations.py --apply "$mutation" -- \
    $FUZZ --engine new --no-cases --seeds "$SEEDS" --only "$only" --out "$OUT/$bug-before.json" > "$OUT/$bug-before.txt" 2>&1 || status=$?
  report "$bug before ($mutation)" "$OUT/$bug-before.txt" "$status"
  status=0
  $FUZZ --engine new --no-cases --seeds "$SEEDS" --only "$only" --out "$OUT/$bug-after.json" > "$OUT/$bug-after.txt" 2>&1 || status=$?
  report "$bug after" "$OUT/$bug-after.txt" "$status"
}

EDITORS="$BASE,editorOpen,type,editorSave"

if [ "$ONLY_R3" = "1" ]; then
  run_mutation r3-h1-snapshot-scope M-r3-H1 "$EDITORS,restore,copy"
  run_mutation r3-h2-merge-lineage M-r3-H2 "$EDITORS,dismiss"
  run_mutation r3-h3-lineage M-r3-H3 "$EDITORS,restore,copy"
  run_mutation r3-moved-only M-r3-moved-only "$EDITORS,cancel"
  run_mutation r3-store-draft M-r3-store-draft "$EDITORS,restore,copy"
  exit "$CRASHED"
fi

if [ "$ONLY_DISCARD" != "1" ]; then
  for engine in round2 new; do
    run workflow-complete-stale "$engine" "$BASE,workflow"
    run typing-during-save "$engine" "$BASE,editorOpen,type,editorSave"
    run restore-and-copy "$engine" "$BASE,restore,copy"
    run silent-requirements-write "$engine" "$BASE,silentRequirements"
  done
fi

run_mutation discard-keeps-draft M-discard-rebase "$EDITORS,dismiss"
run_mutation discard-unrelated-draft M-discard-scope "$EDITORS,dismiss"
run_mutation discard-inflight-save M-discard-inflight "$EDITORS,dismiss"
run_mutation discard-pr159 M-pr159 "$EDITORS,dismiss"
exit "$CRASHED"
