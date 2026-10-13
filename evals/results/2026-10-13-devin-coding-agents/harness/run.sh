#!/bin/bash
# usage: run.sh <task a|b> <label opus|sonnet|argon> <devin model>
S=/private/tmp/claude-501/-Users-wasimjalali-Desktop-Useful-Apply/b1c03b7f-7cd4-4ef9-88f2-82a54991f33f/scratchpad/eval
T=$1; L=$2; M=$3
BRIEF=$S/brief-a-lint.md; [ "$T" = b ] && BRIEF=$S/brief-b-subjects.md
WT=/Users/wasimjalali/Desktop/Useful_Apply/.claude/worktrees/eval-$T-$L
OUT=$S/runs/$T-$L
mkdir -p $OUT
cd $WT || exit 1
START=$(python3 -c 'import time;print(time.time())')
devin --model "$M" --permission-mode accept-edits --respect-workspace-trust false --export "$OUT/export.json" --prompt-file "$BRIEF" -p > "$OUT/stdout.txt" 2> "$OUT/stderr.txt"
CODE=$?
END=$(python3 -c 'import time;print(time.time())')
echo "{\"task\":\"$T\",\"label\":\"$L\",\"model\":\"$M\",\"exit\":$CODE,\"start\":$START,\"end\":$END}" > "$OUT/timing.json"
git add -N . ; git diff > "$OUT/diff.patch"; git status --short > "$OUT/status.txt"
