# Post-batch sweep: handoff

**Written 20 August 2026.** Branch `rebrand/usefulapply`. Staging is
https://usefulapply.com, last deployed version `7c3b2261` plus the alignment
fix in the commit that carries this file.

This covers passes 1 and 2 of the sweep in `BUILD-PLAN.md`. Pass 3, the
backend gaps, has not started.

---

## What landed

Eight commits, all on `rebrand/usefulapply`, none on `main`.

| Commit | What |
|---|---|
| `07fb9bd5` | `chore:` dead UI, CSS and images |
| `4cff60ae` | `chore:` dead routes, dead exports, obsolete props |
| `f12e72bf` | `fix:` session sync overwrote the tracker status; guided line centred |
| `62885ddc` | `fix:` the job feed bug pass, plus the deferred work recorded in BACKEND-GAPS.md |
| `8d19de4a` | `fix:` the tracker crashed the app; the dashboard lost its first click |
| `c1e007aa` | `fix:` one collapse control; conversation stays a reading column |
| `ddf01ac3` | `fix:` no divider when the canvas is folded |
| `d28728bc` | `fix:` kit view pushed the page up; cards cap, not the panel |
| `94091f67` | `fix:` the off-screen CV renderer pushed the whole app off the top |

### Pass 1, dead code

Deleted, each after a grep that returned zero references:

- `src/components/ui/LowCreditsModal.tsx`, `LowCreditsBanner.tsx`,
  `PortalTooltip.tsx`, `CreditIndicator.tsx` (the last kept alive only by the
  first two importing a duplicate `CREDIT_UPDATE_EVENT`; the live path was
  already `src/lib/utils/creditEvents.ts` + `useCreditsBalance.ts`)
- `src/components/marketing/TrustpilotReviews.tsx` and its only dependency
  `AnimatedBackground.tsx`
- `src/store/index.ts`, an unused barrel
- `/api/generate-pdf` and its `RATE_LIMIT_GENERATE_PDF` binding: a pdf-lib
  renderer with no caller in the entire git history. **`pdf-lib` is now an
  unused dependency, left in package.json for Wasim to decide.**
- `/api/auth/recovery-status` + `src/lib/auth/recovery-cookie.ts`, a dead pair
- `src/lib/utils/cv-transformers.ts`, orphaned once `/api/agent-v2` stopped
  importing four helpers it never called
- `listTrackerApplicationsAction` / `listTrackerApplications`, replaced by
  `listTrackerOverviewAction` in batch 4
- `trackRegenError`, `isLoadingDocs`, `resetAll`, `StaggerChildren`,
  `isPdfGenerating`, the `AgentProgressV2` props no caller passed, and the
  three legacy `notify_*` fields in `USER_EDITABLE_PROFILE_FIELDS`
- 37 CSS rule blocks and 32 `@keyframes` in globals.css (1032 lines to 572)
- 20 orphaned assets in public/
- ~20 job-feed symbols, each judged individually as dead rather than
  dropped-caller

**Kept, and why:** the `/settings`, `/profile`, `/account`, `/notifications`
and `/subscription` route stubs. They are batch 4's deliberate 301s and all
five were verified to land on the right settings pane. `/subscription` is also
where Stripe returns. `/documents` is still linked from three places.

### Pass 2, bugs fixed

Confirmed on staging before and after:

1. **The tracker crashed the whole app.** React #185, maximum update depth.
   Two zustand selectors ended in `.filter()`, so every read returned a new
   array and the `useSyncExternalStore` snapshot never settled.
2. **The dashboard threw a hydration error and ate the first click.** React
   #418 on every load; the first click on the sidebar did nothing.
3. **Clicking a Kit ready application pushed the whole app off the top.**
   `KitExportHost` renders the CV off-screen with `position: absolute`, which
   kept 1513px inside the shell's scroll box; the first focus scrolled it.
4. **Tracker status changes were silently reverted in D1** by the session sync.
5. **The job feed pass**, `62885ddc`: SerpAPI spend exceeded the documented
   per-tier budget on every tier; the daily cooldown query filtered on a
   `trigger_source` nothing writes, so both the cooldown and the first-setup
   force were unreachable; one bad job id threw away the whole LLM ranking;
   saved jobs lost their match badge and reason; checking fit un-saved a job;
   plus ~15 medium and low fixes.
6. **Shell layout**: two collapse controls with different jobs, the
   conversation running to 1192px when the canvas is folded, a stray divider.

---

## Verification state

- `npx tsc --noEmit`: **0 errors**.
- `npm run lint`: **72 errors, 61 warnings**, against a **73 / 89** baseline.
  Below baseline on both counts; no new error or warning in any file touched.
- Public flows walked at 1440x900 with a clean console: landing, pricing,
  auth pages, the anonymous guided line, and all five retired routes.
- Signed-in flows walked on staging on the **Free** account: shell, feed
  conversation and canvas, job detail, Saved, tracker table and conversation,
  settings modal (all three panes), kit canvas with the CV tab.
  Console clean after the deploy.

---

## What is left

### 1. The adversarial review on `62885ddc` — do this first

Three passes were started (security, logic and races, data integrity) and all
three died on session limits before reporting. That commit changes D1 queries,
the saved-list authorization join, a cron that compacts historical rows, and
the SerpAPI spend path. **It must not go near `main` unreviewed.** Also run
`/code-review` at `high` on the branch; only Wasim can invoke it.

### 2. Bugs found on staging and not fixed

Found while walking, none of them fixed, all reproducible on the Free account:

1. **A feed card's summary can be a bare heading.** The Glint Tech Solutions
   card's whole summary reads "About The Role", because the summary takes the
   ad's opening text without skipping headings.
2. **Job ad list items render as run-on text.** In the detail view:
   "$190,000 – $250,000 base salaryCompetitive equity packageFully covered
   Medical, Dental, and Vision insurance401(k) with company match…". A list
   is being flattened without separators in `job-ad-text.tsx`.
3. **The salary chip is missing** on that same card while the detail clearly
   states the range, because the salary sits inside a run-on paragraph.
4. **Pluralisation copy bug** in the feed conversation: "These role is from
   your last search." Should read "This role is…" when the count is one.
5. **A duplicate application.** "Machine Learning Reply GmbH — Agentic AI
   Software Engineer" appears twice in the sidebar and twice in the tracker,
   same title, same 52% match. Two sessions exist for one job. Worth checking
   against the orphan-session path in `/api/job-feed/apply`.
6. **The tracker's opening line under-reports.** "Four follow-ups overdue
   (Ellucian, Revalize)" while the table shows four overdue rows.
7. **The settings modal opens for signed-out visitors** who hit `/settings`
   directly: it shows "Sign out" and a credit balance for nobody.
8. **The feed header and the sidebar badge disagree.** Header says "5 roles",
   sidebar says 4, because the header count shrinks as the user acts.
9. **The composer and the message cards were 6px out of alignment.** Fixed in
   the commit carrying this file; verify it on the next deploy.

### 3. Pass 3, the backend gaps

`BACKEND-GAPS.md` now carries 11 new entries from this sweep on top of what the
batches left. Every one needs either a schema change or a decision from Wasim.
The ones that block real users: a saved job stops working after 7 days, and
deleting an application is gone from the product entirely (batch 4 dropped the
only delete path, server chain intact and orphaned).

### 4. Not yet pushed to a PR

The branch is committed and pushed. No PR has been opened, and nothing has
been merged to `main`.

---

## Kickoff prompt for the next session

> You are continuing the post-batch sweep of the Useful Apply UX redesign on
> branch `rebrand/usefulapply`. `main` is off limits. Staging is
> https://usefulapply.com and is already deployed from this branch.
>
> Read `docs/ux-audit-2026-08-18/redesign/build/SWEEP-HANDOFF.md` first, then
> `BACKEND-GAPS.md`. Both are current as of 20 August 2026.
>
> Do these in order.
>
> **1. Adversarially review commit `62885ddc`.** It is the job-feed bug pass
> and it has never been reviewed; three attempts died on session limits. Run
> up to three parallel `opus` agents with distinct lenses (security and
> authorization, logic and race conditions, data integrity) against
> `git show 62885ddc`. Pay particular attention to: the new
> `listRankedItemsByJobIds` join and its D1 parameter chunking, the narrowed
> "blocked" filter on the saved list, the shared SerpAPI call budget in
> `ingestion.ts`, the revived cooldown query, the 60% coverage floor in the
> ranker, and the retention-compaction helpers moved from `cleanup.ts` into
> `db/repos/admin.ts`. Fix anything critical or high before doing anything
> else. Then ask Wasim to run `/code-review` at `high`; you cannot invoke it.
>
> **2. Fix the eight open bugs** listed under "Bugs found on staging and not
> fixed" in the handoff. Items 1, 2 and 3 are all the same weakness in
> `src/components/job-feed/job-ad-text.tsx` and the card summary builder, so
> do them together. Item 5, the duplicate application, needs investigating
> before fixing; use the `debugger` agent.
>
> **3. Then start Pass 3**, the backend gaps, working `BACKEND-GAPS.md` top to
> bottom and landing only the entries marked Small. Anything needing a schema
> change or a product decision goes to Wasim, it does not get guessed.
>
> Rules: surgical edits only, npm only, no new packages. Do not touch Stripe
> webhook or credit-deduction logic, D1 schema or migrations, Better Auth
> config, or `src/lib/agents/**` prompts without asking. Copy rules on any
> user-facing string: no em dashes, contractions, short sentences, no filler,
> "X, Y and Z".
>
> Before calling anything done: `npx tsc --noEmit` must be 0, and
> `npm run lint` must not exceed 72 errors and 61 warnings. Then deploy with
> `NEXT_PUBLIC_SITE_URL=https://usefulapply.com NEXT_PUBLIC_SITE_STAGE=staging npm run deploy:cf`
> and verify on staging in the browser. Wasim keeps a Free account and a Max
> account signed in; the Claude in Chrome tools reach them. Test both tiers,
> and test anonymously without an account too.
>
> Commit in logical chunks with conventional commits and push to
> `rebrand/usefulapply`. Do not open a PR or merge to `main` until step 1 is
> green.
