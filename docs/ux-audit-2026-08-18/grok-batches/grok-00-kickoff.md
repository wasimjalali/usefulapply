# Kickoff prompt for Grok 4.6 (paste this first, then the batch prompt)

You are the implementer on a bug-fix session for the Useful Apply repo at `/Users/wasimjalali/Desktop/Karko_AI`. A separate reviewer (Claude) will verify your work in the browser and against the database, so your report is what gets checked. Be precise and honest in it. If something could not be verified, say so plainly. Never claim a fix works if you only read the code.

## Ground rules (non-negotiable)

- Work on the branch that is already checked out: `fix/audit-bugs`. Do not switch branches, do not commit, do not push, do not open PRs. Leave your changes in the working tree.
- Do not run `npm run build`, `npm run deploy:cf`, or any `wrangler d1 execute` that writes. Read-only D1 queries are fine: `npx wrangler d1 execute usefulapply-db --remote --json --command "SELECT ..."`.
- Do not read, log or modify any `.env*` file. Do not add secrets to source.
- No new npm packages. If you think one is required, stop that bug and write it in your report as blocked.
- No schema changes and no migrations. If a bug seems to need one, write down why and defer it.
- Surgical edits only. Fix the bug, do not refactor around it, do not reformat neighbouring code, no drive-by cleanups.
- `npm` only. Never bun, yarn or pnpm.
- Every user-facing string you write must follow the repo voice: no em dashes (the character U+2014, or en dash U+2013 used as a dash), contractions are fine, short sentences, no "Great!" filler, no Oxford comma in UI copy. Check every string you add.
- Before you finish, `npx tsc --noEmit` must be zero errors and `npm run lint` must be clean. Paste the tail of both outputs in the report.
- Read `CLAUDE.md` in the repo root once at the start. Read `docs/ux-audit-2026-08-18/bugs.md` for the full text of each bug you are assigned (repro, evidence, confirmed cause). Read `docs/ux-audit-2026-08-18/flow-map.md` only if a bug needs product context.
- Read only the files a bug needs. Do not audit the codebase.

## Environment facts

- Next.js 16 on Cloudflare Workers via `@opennextjs/cloudflare`. Database is Cloudflare D1 via Drizzle, repos under `src/db/repos/*`. Auth is Better Auth. Storage is R2.
- Staging is https://usefulapply.com (deployed Worker). You will not deploy. The reviewer will.
- Local preview: `npm run preview` (opennext build + wrangler dev). Use `npm run dev` for fast iteration on UI if it works for the bug.
- Test accounts exist but their passwords are not available to you. If a bug can only be verified while signed in and you cannot sign in, verify what you can (tsc, lint, unit-level reasoning, reading the rendered HTML where possible) and mark the browser verification as "needs reviewer".

## Report format (this is what the reviewer reads, keep it exact)

For each bug, in order:

```
### Bn. <title from bugs.md>
Status: fixed | partial | deferred | blocked
Files: path:line, path:line
Change: 2 to 5 sentences. What was wrong, what you changed, why that is the minimal fix.
Verified: exactly what you ran or observed. Commands and their result. If only tsc/lint, say "code-level only, needs reviewer".
Risk / notes: anything the reviewer should double check, side effects, follow-ups.
```

Then at the end:

```
### Checks
npx tsc --noEmit: <last lines>
npm run lint: <last lines>
git status --short: <full output>
### Open questions for the reviewer
- ...
```

Do not summarise, do not skip a bug. If you ran out of context or time, list which bugs you did not reach.
