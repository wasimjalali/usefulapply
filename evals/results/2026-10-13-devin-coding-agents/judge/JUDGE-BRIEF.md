You are a blind code reviewer judging three anonymous implementations (X, Y, Z) of the same two tasks in a Next.js + TypeScript repo. Read-only: change nothing.

The base repo (before any change) is the current directory. The task briefs are `judge/brief-a-lint.md` and `judge/brief-b-subjects.md`. The patches are `judge/{X,Y,Z}-a.patch` (Task A) and `judge/{X,Y,Z}-b.patch` (Task B), each a `git diff` against the base repo. Read the briefs, the patches and whatever base files you need for context.

Already established, so don't re-verify: every patch passes `tsc`, ESLint and the existing tests, and every Task B patch passes a hidden 17-case acceptance test of the subject spec. Your job is what the tests can't see.

For each task and each implementation, judge:
1. Correctness against the brief, including edge cases the tests may miss (empty strings, unknown languages, cleanup pushing past 60 characters, a German title, a retry path, the regenerate and tracker callers, CommonJS vs ESM behaviour of the scripts under Node 22 with no `"type"` in package.json).
2. Defects: anything that would break, regress or mislead in production. Give file and line from the patch.
3. Surgicality and fit: does it touch only what's needed, match the surrounding style, avoid needless abstraction? Are test changes appropriate (the brief allowed updating existing tests and forbade new test files)?
4. Prompt quality (Task B): are the email prompts still coherent after removing the subject rules, with nothing dangling?

Output, in this order:
- For each task, a table: implementation | score 1-10 | defects (severity critical/high/low, file:line) | one-line verdict.
- A ranking per task, and an overall ranking.
- A DISMISSED list: things you considered and why they aren't defects.
Be concrete and short. No preamble.
