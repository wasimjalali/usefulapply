#!/bin/bash
S=/private/tmp/claude-501/-Users-wasimjalali-Desktop-Useful-Apply/b1c03b7f-7cd4-4ef9-88f2-82a54991f33f/scratchpad/eval
L=$1; cd /Users/wasimjalali/Desktop/Useful_Apply/.claude/worktrees/eval-b-$L
TSC=$(npx tsc --noEmit 2>&1 | grep -c "error TS")
EXIST=$(node --import tsx --test src/lib/agents/unified-writer-agent.email-validation.test.ts 2>&1 | grep -E "^# (pass|fail)" | tr '\n' ' ')
LINT=$(npx eslint $(git diff --name-only) 2>&1 | grep -E "^✖" || echo "clean")
cp $S/hidden-subjects.test.ts src/lib/agents/zz-hidden.test.ts
node --import tsx --test src/lib/agents/zz-hidden.test.ts > $S/runs/b-$L/hidden.txt 2>&1
rm src/lib/agents/zz-hidden.test.ts
HID=$(grep -E "^# (pass|fail)" $S/runs/b-$L/hidden.txt | tr '\n' ' ')
FAILED=$(grep -E "^not ok" $S/runs/b-$L/hidden.txt | sed 's/not ok [0-9]* - //' | cut -c1-40 | tr '\n' ';')
echo "{\"label\":\"$L\",\"tsc_errors\":$TSC,\"existing_tests\":\"$EXIST\",\"lint_touched\":\"$LINT\",\"hidden\":\"$HID\",\"hidden_failed\":\"$FAILED\",\"files\":\"$(git diff --name-only | tr '\n' ' ')\"}"
