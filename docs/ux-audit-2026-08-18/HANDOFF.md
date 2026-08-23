# Handoff: fix the 31 audit bugs

**Written:** 18 August 2026, end of the UX audit session.
**For:** the next Claude Code session on this repo.
**Read this first, then `bugs.md`.**

---

## Your mission, in order

1. Fix every defect in `docs/ux-audit-2026-08-18/bugs.md` (B1 to B31), one at a time.
2. Verify each fix actually works. Not "the code looks right", but the behaviour is corrected.
3. Commit and push to a branch.
4. Open a PR, get it green, merge.
5. Deploy to staging on Cloudflare and confirm the fixes are live.
6. **Only then** come back to Wasim about the UX redesign.

Do **not** start UX or design work in this session. That is a separate conversation, deliberately sequenced after the bugs.

---

## Where things stand

- Current branch: `rebrand/usefulapply`. Recent history is the Karko AI to Useful Apply rebrand plus the Cloudflare migration, all done and deployed to staging.
- `docs/ux-audit-2026-08-18/` is **untracked**. It contains 108 screenshots and five documents. Commit it as part of your first commit so the evidence lives with the fixes.
- Nothing from the audit has been fixed. No code was changed during the audit.

## The documents

| File | Use it for |
|---|---|
| `bugs.md` | **Your worklist.** 31 defects, P0 to P3, each with repro, evidence and confirmed cause |
| `friction-log.md` | 34 UX findings. Context only, not your job this session |
| `flow-map.md` | How the product actually behaves end to end. Useful when a bug needs context |
| `README.md` | Capture conditions and folder guide |
| `job-description.md` | The job ad used for every generation run, if you need to reproduce |

---

## Start here: B1 is the one that matters

**The monthly credit reset has never run.** This is a live revenue bug, not a staging artefact.

- `processMonthlyReset()` exists at `src/db/repos/credits.ts:450` and is re-exported from `src/lib/supabase/credits.server.ts:9`. **Nothing calls it.**
- Every cron trigger in `wrangler.jsonc:321-328` is commented out, so `crons` is an empty array.
- On staging: 29 of 38 users overdue, oldest `next_reset_date` 2026-03-01. Twenty-seven free users stranded at a minimum of 0 credits. **Two Max subscribers at $79.99/month have received nothing since March.**

Two parts to the fix:
1. Re-enable a daily cron and reset every user whose `next_reset_date` has passed, or do it lazily on credit read. Decide with Wasim which, since a lazy reset changes read-path behaviour.
2. **Backfill the 29 overdue accounts.** Talk to Wasim before running it, and about whether the two Max customers need a goodwill credit or refund.

This touches billing logic, which the repo rules flag as confirm-first. Do not change it silently.

---

## How to work through the rest

Suggested grouping, cheapest correct order:

**Group 1, the "product lies to the user" set.** B2 stale credit header, B3 phantom generation message, B4 tracker defaults to Applied, B9 feed dedupe, B31 blocked action marks "Application started". These are the ones destroying trust and most are small.

**Group 2, copy and routing.** B5 Smart Job Feed availability copy (Wasim has confirmed the gate is correct and the copy is wrong: free includes a top-5 daily feed, say so), B6 subscription "Monthly:" showing balance instead of allowance, B7 marketing header ignores the session, B8 `/login` and `/signup` 404, B20 auth page titles, B22 landing page still shows Karko AI screenshots, B24 "1 credits", B27 "Saas".

**Group 3, feed and CV surfaces.** B10 no guard rail on direct generate, B11 intermittent German headings, B12 blank template previews, B13 Edit feed has no exit, B14 popover swallows tab clicks, B15 stale elapsed timer, B16 setup prompt over an existing feed, B17 setup lands on a stale feed, B23 company name mismatch, B30 live buttons with no CV.

**Group 4, small.** B18 tracker count mismatch, B19 duplicate rows, B21 /features blank scroll, B25 em dashes in generated output, B26 Recent Applications shows company only, B28 sticky header overlap, B29 truncated panel title.

**Watch out on B11.** It is **intermittent**. The same PDF produced German headings once and correct English headings later. Reproduce several times before declaring it fixed.

---

## Repo rules you must follow

From `CLAUDE.md` and the global rules:

- **Never commit or push to `main`.** Branch off, PR in. A hook blocks direct pushes.
- Conventional commits: `fix:` / `feat:` / `chore:` / `refactor:`. Branch name `fix/audit-bugs` or similar.
- `npx tsc --noEmit` must be **zero errors** before any task is done. TypeScript errors break the Cloudflare build.
- `npm run lint` when touching components, hooks or API routes.
- `npm` only. No bun, yarn or pnpm.
- **Confirm with Wasim before:** touching Stripe or credit logic (B1 and B6 qualify), any schema change, any migration, deleting files, installing packages.
- Surgical edits. Fix the bug, do not refactor around it.
- No em dashes in any user-facing string. This includes B25, which is about generated model output, so the fix belongs in the prompt rules under `src/lib/agents/prompts/`.
- Ask Wasim to run `/code-review` before the PR. He has to type it; you cannot invoke it. Given B1 touches billing, ask for `high` or `max`.
- Billing and auth changes trigger the adversarial review in the global rules. Run it.

---

## Environment facts you will need

**Staging:** https://usefulapply.com (this is the deployed Worker, not a separate preview).

**Database:** Cloudflare D1, `usefulapply-db`, uuid `8cd7059e-4f0b-429b-aace-e379756707e1`. Wrangler is authenticated and works:

```
npx wrangler d1 execute usefulapply-db --remote --json --command "SELECT ..."
```

**Deploy to staging:** `npm run deploy:cf` (`opennextjs-cloudflare build && opennextjs-cloudflare deploy`). Preview locally with `npm run preview`.

**Test accounts** (Wasim's, passwords saved in his Chrome, you cannot type them):

| Email | Tier | user_id |
|---|---|---|
| wasim100ai@gmail.com | free | `1f2b251c-6c87-4fc0-aa0b-953219b78b0a` |
| wasimjalali2004@gmail.com | max | `2b229497-e05a-4434-8d7f-b595db2494bf` |

Chrome autofills whichever account signed in most recently and the autofill dropdown is not reachable through automation. **To switch accounts you must ask Wasim to sign in.** Plan your verification order around that so you only ask once per account.

**Test CV:** `~/Downloads/Alex_Morgan_CV.pdf`. The Chrome extension will not upload from `~/Downloads`; copy it into the session scratchpad first, then upload.

**Viewport used for all audit screenshots:** 1441x902 CSS. Chrome page zoom is at 90% on this machine, so `resize_window` to 1309x942 produces that viewport. Match it if you take comparison shots.

---

## State left behind by the audit

Nothing is broken, but so you are not surprised:

- **MAX account:** 178 credits, down from 184. Six credits spent on four generations. Its `job_feed_settings` row was deleted to capture the first-run wizard and then **restored exactly** and verified. Restore script was at `<session scratchpad>/restore_job_feed_settings.sql`; the original values are also recorded as a comment in `bugs.md` under "Data changes made during this audit".
- **Free account:** 0.5 credits, CV present and parsed. Its CV was removed and re-uploaded during the audit to capture the no-CV state.
- Both accounts have one job feed run from 18 August and new tracker rows.
- Nothing else was written to the database.

---

## What "done" looks like

- Every bug in `bugs.md` is either fixed, or explicitly listed as deferred with a reason Wasim has agreed to.
- `npx tsc --noEmit` clean, lint clean.
- Each fix verified against the repro in `bugs.md`, not just against the code.
- The 29 overdue credit accounts backfilled, with Wasim's sign-off.
- Committed, pushed, PR merged, staging deployed, fixes confirmed live.

Then, and only then, open the UX conversation using `friction-log.md` and `flow-map.md`.
