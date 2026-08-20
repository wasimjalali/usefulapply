# Post-batch sweep: handoff

**Updated 20 August 2026.** Branch `rebrand/usefulapply`. Staging is
https://usefulapply.com, deployed from this branch at version `33cf7c8d`.

Passes 1 and 2 are done. The adversarial review on `62885ddc` is done. Pass 3
has started.

---

## What landed

Eighteen commits, all on `rebrand/usefulapply`, none on `main`. No PR.

| Commit | What |
|---|---|
| `07fb9bd5` | `chore:` dead UI, CSS and images |
| `4cff60ae` | `chore:` dead routes, dead exports, obsolete props |
| `f12e72bf` | `fix:` session sync overwrote the tracker status; guided line centred |
| `62885ddc` | `fix:` the job feed bug pass, plus the deferred work in BACKEND-GAPS.md |
| `8d19de4a` | `fix:` the tracker crashed the app; the dashboard lost its first click |
| `c1e007aa` | `fix:` one collapse control; conversation stays a reading column |
| `ddf01ac3` | `fix:` no divider when the canvas is folded |
| `d28728bc` | `fix:` kit view pushed the page up; cards cap, not the panel |
| `94091f67` | `fix:` the off-screen CV renderer pushed the whole app off the top |
| `2aaf3fc9` | `docs:` handoff, kickoff prompt and BUILD-PLAN status |
| `830a8ef6` | `fix:` the adversarial review findings on the bug pass |
| `c6db3306` | `fix:` job ads read as ads again, not as one run-on blob |
| `86d3d75f` | `fix:` three copy and state bugs found walking staging |
| `c483a857` | `fix:` pass 3 lands the first four Small backend gaps |
| `1c15d7ea` | `docs:` the handoff carries the review, the bug list and pass 3 |
| `96929936` | `docs:` plain hyphens on the CLOSED markers |
| `04655cf9` | `fix:` the follow-up backfill would have mailed five months of history |
| `eeaa935d` | `fix:` the rest of the code-review findings |
| `abbda859` | `fix:` New application did nothing from the feed or the tracker |

Passes 1 and 2 are described in the git history of the first nine commits. What
follows is what this session added.

---

## The adversarial review on `62885ddc` is done

Three `opus` agents ran in parallel against `git show 62885ddc`: security and
authorization, logic and race conditions, data integrity. Every finding was
checked against the code before anything was changed; two did not survive that
check and are recorded below as refuted.

**Seven high findings. Five fixed in `830a8ef6`:**

1. **A rerun that ranked nothing wiped the feed.**
   `persistJobFeedRankedItemsForRunAdmin` deleted by `run_id` and only then
   returned early on an empty list. The delete and the inserts are now one
   batch in `replaceRankedItemsForRun`, and an empty ranking leaves the
   previous one alone and reports what survived.
2. **Two requests could run the whole workflow twice.**
   `createJobFeedRunForToday` swallowed the unique-index violation and returned
   the winner's row, but the completed and running guards had already run
   against nothing. It now reports that it lost the race and the guards run
   again over the row that won.
3. **A bad rank counted as ranker coverage.** `seenJobIds` took the job before
   the rank was validated, so a model returning every candidate with an
   unusable rank scored full coverage and handed back an empty ranking, which
   read as a successful run with no roles.
4. **A dismissed job could be applied to.** The apply route and
   `recordJobFeedFeedbackAdmin` each carried their own version of "blocked but
   it already has a session" and disagreed. Both now read
   `canReuseBlockedFeedbackSession`.
5. **Three lows worth the keystrokes:** the retention compaction dropped
   `orchestrator` from its copy list; the compaction pass now takes 200 rows at
   a time, because the first pass after a version bump would otherwise rewrite
   the whole backlog in one invocation and blow the subrequest cap; and the
   SerpAPI error body was redacted for the log line but not for the copy stored
   in D1.

**Two high findings NOT fixed, because both need a decision from Wasim:**

- **The shared SerpAPI budget leaves nothing for the extra passes.**
  `extraCallsRemaining = max(0, dailyCallBudget - mainPlanLength)`, and the
  plan is `strategy.queries.slice(0, maxQueries)`, so the plan almost always
  fills the budget exactly and the remainder is zero. Both the pagination pass
  and the fallback pass are therefore unreachable on every tier, along with
  `JOB_FEED_FALLBACK_BUDGET`, `JOB_FEED_PAGINATION_BUDGET` and the `fallbackTo`
  half of the strategy prompt. The bite: a Free user gets one query, and if it
  returns nothing there is no rescue and the day is empty. Fixing it means
  either reserving a call inside the tier budget (one fewer main query) or
  deleting the two passes. That is a spend decision, and `constants.ts` says
  the daily query count needs explicit sign-off.
- **The daily cooldown has no escape hatch.** `firstSetupAfterRun` requires
  `settings.created_at > latestManualRun.completed_at`, but settings are always
  provisioned before a run row exists (free users at `server.ts:1192`, premium
  users throw without settings) and `upsertSettings` preserves `created_at`.
  The flag can never be true, so a user who edits their roles or countries is
  locked out until local midnight with the bypass unreachable. Reopening the
  window costs a SerpAPI run, so it is Wasim's call.

**Refuted, and worth recording so nobody re-raises them:**

- The saved-list join is correctly scoped. `listRankedItemsByJobIds` filters on
  `user_id`, its only caller derives ids from the caller's own feedback rows,
  and `chunk(jobIds, D1_MAX_PARAMS - 1)` reserves the hundredth bound parameter
  for `user_id`. No cross-tenant read.
- The apply route's double-POST does not produce the duplicate applications
  seen on staging. See below.

**`/code-review` at `high` has now run**, and its findings are below.

---

## What `/code-review` at `high` found

Nine findings against `2aaf3fc9..HEAD`, every one of them in code this session
wrote. All nine are fixed, in `04655cf9` and `eeaa935d`.

**One had a deadline.** The follow-up backfill had no lower bound, so
"created more than seven days ago" matched every Applied row ever written and
the derived date made all of them overdue. Measured against the real database:
97 rows across 15 verified users, oldest from 3 March, all queued to send on
the 08:00 UTC sweep. Deployed the bound at 07:33 UTC, 27 minutes ahead of it.
The same query now returns 6 rows across 4 users, which is what the feature is
for. A stored date is still chased however old it is, because the user saw that
date. A derived one is capped at 30 days, because inferring a chase for
something that came due in March is noise.

**The compaction batch stalled instead of draining.** The limit went on a query
with nothing excluding rows an earlier pass had compacted, so every night
refetched the same 200, skipped them all and returned 0. Row 201 onward would
never have been compacted.

**The interview window let in interviews that had already happened.** They can
never be anyone's tomorrow, so they could never be sent or stamped, and they
sat at the head of the oldest-first batch. Past 200 rows they would have pushed
real reminders off the end permanently. The lower bound is now `now`.

**The glued-list rule that guessed is gone.** It split on a word running into a
capital, guarded by a hand-written list of words that carry an inner capital on
purpose, which could never be complete: HealthTech, FullStack, SalesForce and
Python3 all slipped through, and a false split also discarded the provider's
clean sections. Measured before removing it: across 41 real ads, 61 lines split
and not one needed this rule. Deleting it left the output identical.

**Four smaller ones:** the card summary only stopped at a bullet when a block
began with one; the salary reader gave up after the first figure, and once it
kept looking it needed pay context to tell a range from a tuition allowance; a
city made its country un-removable because the implication ran on every save
rather than only on newly added cities; and the raced run path did not clear
artifacts before reusing a stale row. Plus a docstring that claimed the
reminder email and the tracker can never disagree, when they can by a day.

---

## The eight staging bugs

| # | Bug | State |
|---|---|---|
| 1 | Card summary was a bare heading | Fixed, `c6db3306` |
| 2 | Job ad lists rendered as run-on text | Fixed, `c6db3306` |
| 3 | Salary chip missing | Fixed, `c6db3306` |
| 4 | "These role is from your last search." | Fixed, `86d3d75f` |
| 5 | Duplicate "Machine Learning Reply" application | **Not a bug** |
| 6 | Tracker opening line under-reported | Fixed, `86d3d75f` |
| 7 | Settings modal opened for signed-out visitors | Fixed, `86d3d75f` |
| 8 | Feed header and sidebar badge disagree | **Wasim's call** |
| 9 | Composer alignment | Verified on staging |
| 10 | New application did nothing from the feed | Fixed, `abbda859` |

### 10 was reported by Wasim mid-session

Clicking "New application" while the feed canvas was open appeared to do
nothing. It was not doing nothing: the button ticks a counter that ChatPanel
watches, ChatPanel is mounted-but-hidden behind the feed rather than unmounted,
so the reset genuinely ran and the workspace was fresh. Nothing switched the
view back, so the user kept looking at the feed. The tick now returns to the
application view, which also covers the tracker's copy of the same button.

### 1, 2 and 3 were one weakness

Google Jobs strips list markup and hands back the items glued together, and it
opens plenty of ads with a bare heading. `splitGluedAdText` puts the separators
back: the provider's own highlight items are exact and go first, and they only
count where the separator is genuinely missing, which keeps an ad's opening
paragraph a paragraph. Two boundary rules cover what the items miss, and the
risky one (a word glued onto a capital) only runs on a long line, only where
several appear, and never inside a word that carries a capital on purpose.
Checked over 40 real ads: 57 lines split, no word cut in half, six salaries
recovered, no summary left empty.

### 5 is not a bug

The `debugger` agent traced it to the real rows. The two
`application_sessions` were written seven minutes apart on 2026-04-01, one in
Apply Directly mode and one in Analyze First mode, five weeks before the job
feed existed. The generated CV, cover letter and follow-up all differ between
them, so it cannot be one write duplicated, and both read models are
single-table with no joins. A whole-table scan found eight duplicate
`(user, title, company)` groups and not one sub-second pair, so the concurrency
hypothesis has never fired in production.

Left open deliberately: whether generating twice for the same job should reuse
the existing entry is a product question, not a regression. It would live at
`src/hooks/useSupabaseSync.ts:466-484` and would silently overwrite the earlier
CV and cover letter, so it needs a decision on replace-versus-version first.

### 8 is Wasim's call

The two numbers measure different things and both are right. The canvas header
counts roles in the list; the sidebar badge is `unprocessedCount`, which
`summary/route.ts:41` defines as roles the user has not **saved**. `hasPending`
is `unprocessedCount > 0` and does not depend on the run being seen, so the
badge sits next to Jobs permanently and disagrees with the header the moment
the user saves anything. No filter definition removes the disagreement: it
needs a decision on what the badge should count, or whether the header should
stop competing with it.

---

## Pass 3: four Small gaps landed

Working `BACKEND-GAPS.md` top to bottom, taking only entries marked Small that
need no schema change and no decision.

- **"Add Berlin" now carries its country.** `countryForCity` reverses
  `JOB_FEED_CITY_SUGGESTIONS` and tolerates accents, casing and the obvious
  short forms. An unrecognised city changes nothing.
- **Reminder emails land on the right day.** The sweep queries a three-day UTC
  window, the smallest that contains every zone's tomorrow, then judges each
  candidate in its owner's own timezone. Day arithmetic runs on the day key, so
  a DST shift cannot skip a day.
- **Applied rows from before `follow_up_due_at` existed get their reminder.**
  No backfill, which would have written a different date shape from every other
  writer. The query returns those rows and the sweep derives the date with the
  same `defaultFollowUpDue` the tracker shows the user.
- **"Why it's a match" on saved jobs** was already closed by `62885ddc`. The
  entry was stale and is now marked closed.

The rest of `BACKEND-GAPS.md` is untouched. Every remaining entry needs a
schema change, a product decision, an npm package, a Stripe route, an auth
change or a prompt change, all of which this sweep was told to leave alone.

---

## Verification state

- `npx tsc --noEmit`: **0 errors**. Note it needs more than the default Node
  heap on this machine and OOMs without it, on a clean `HEAD` too, so this is
  pre-existing and not from these commits. Run it as
  `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`.
- `npm run lint`: **72 errors, 61 warnings**, unchanged, against a 73 / 89
  baseline.
- Deployed to staging as `0102d48f` and walked on the **Free** account: feed
  conversation and canvas, the Glint job detail (headings, clean bullet lists,
  prose still prose, salary chip), the tracker table and conversation, the
  settings modal on `/settings`. Console clean, no React errors.
- Checked anonymously over HTTP: `/`, `/pricing`, `/login`, `/signup` and all
  five retired routes return 200 and land on the right settings pane.

### Not verified

- **The Max account.** Only one Chrome browser is connected and it holds the
  Free account. Reaching the Max account needs a sign-in, which is Wasim's to
  do.
- **The settings modal signed out.** Verifying it needs a signed-out session,
  and the only way there from here is signing Wasim out of his own. The
  signed-in half was verified (the modal still opens on `/settings` and the
  URL is rewritten). One click each way from Wasim closes both.

---

## What is left

**Four decisions, all Wasim's.** Two are spend, two are product. Nothing else
in the sweep is blocked on anything but these.

1. **The shared SerpAPI budget.** Reserve a call inside the tier budget, which
   costs one main query, or delete the two unreachable passes. Today a Free
   user gets one query and no rescue if it returns nothing.
2. **The daily cooldown bypass.** `firstSetupAfterRun` can never be true, so
   editing roles or countries locks the user out until local midnight.
   Reopening the window costs a SerpAPI run.
3. **What the sidebar badge counts** (bug 8). It counts roles the user has not
   saved, so it disagrees with the canvas header the moment they save one.
4. **Whether a repeat generation for the same job reuses its entry** (bug 5).
   Today it writes a second one. Reusing would overwrite the earlier CV and
   cover letter, so it needs a call on replace versus version.

**Three Pass 3 entries are landable now**, no decision needed: the cover letter
`updatedAt` timestamps, the Offer respond-by email, and the shared date
formatter for the stored timezone and date format. Everything else in
`BACKEND-GAPS.md` needs a schema change, a decision, an npm package, a Stripe
route, an auth change or a prompt change.

**Two things Wasim has to verify himself:** the Max account, and the settings
modal signed out. One click each.

No PR has been opened and nothing has been merged to `main`.

---

## Kickoff prompt for the next session

> You are continuing the post-batch sweep of the Useful Apply UX redesign on
> branch `rebrand/usefulapply`. `main` is off limits: no PR, no merge. Staging
> is https://usefulapply.com, deployed from this branch at version `33cf7c8d`.
>
> Read `docs/ux-audit-2026-08-18/redesign/build/SWEEP-HANDOFF.md` first, then
> `BACKEND-GAPS.md` in the same directory. Both are current as of 20 August
> 2026. Passes 1 and 2 are done, the adversarial review on `62885ddc` is done,
> `/code-review` at `high` has run and all nine of its findings are fixed.
> Nineteen commits, none on `main`.
>
> **1. Confirm the reminder sweep behaved.** The 08:00 UTC cron on 20 August
> was the first to run with the follow-up backfill. Before that deploy it would
> have mailed 97 rows across 15 users going back to 3 March; the bound cut it
> to 6 rows across 4 users. Verify what actually went out, read only:
>
> ```
> npx wrangler d1 execute usefulapply-db --remote --json --command "SELECT count(*) AS sent, count(DISTINCT user_id) AS users, min(created_at) AS oldest_app FROM application_sessions WHERE follow_up_reminder_sent_at >= '2026-08-20T00:00:00Z'"
> ```
>
> Expect a single-digit count and no application older than about 30 days. If
> it is larger, or anything from March went out, stop and tell Wasim before
> doing anything else. Never run INSERT, UPDATE or DELETE against the remote
> database.
>
> **2. Ask Wasim the four open decisions** before touching the code they gate.
> They are listed under "What is left" in the handoff with the tradeoff for
> each: the shared SerpAPI budget, the unreachable cooldown bypass, what the
> sidebar badge counts, and whether a repeat generation reuses its entry. Do
> not guess any of them. Ask once, together, and carry on with step 3 while
> waiting.
>
> **3. Continue Pass 3.** Only three entries are landable without a decision,
> so do these and stop: the cover letter `updatedAt` timestamps (batch 2), the
> Offer respond-by email (batch 4 part A), and the shared date formatter that
> reads the stored timezone and date format (batch 4 part B). Mark each closed
> in `BACKEND-GAPS.md` as you land it. Everything else needs a schema change, a
> decision, an npm package, a Stripe route, an auth change or a prompt change,
> and goes to Wasim instead.
>
> **4. Two checks only Wasim can do:** the Max account, and the settings modal
> while signed out. Only one Chrome browser is connected and it holds the Free
> account, so do not sign him out to get there. Ask him to click both.
>
> Rules: surgical edits only, npm only, no new packages. Do not touch Stripe
> webhook or credit-deduction logic, D1 schema or migrations, Better Auth
> config, or `src/lib/agents/**` prompts without asking. Copy rules on any
> user-facing string, and in docs and commit messages too: no em dashes,
> contractions, short sentences, no filler, "X, Y and Z".
>
> Before calling anything done: `npx tsc --noEmit` must be 0 errors, and
> `npm run lint` must not exceed 72 errors and 61 warnings. Note tsc OOMs on
> the default Node heap on this machine, on a clean `HEAD` too, so run it as
> `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`. Then deploy with
> `NEXT_PUBLIC_SITE_URL=https://usefulapply.com NEXT_PUBLIC_SITE_STAGE=staging npm run deploy:cf`
> and verify on staging in the browser on the Free account.
>
> Two habits from this session that paid off, keep them. Check every agent
> finding against the code before acting on it: three of the twenty raised so
> far did not survive that check. And measure heuristics against the real
> database instead of reasoning about them, which is how both the 97-row email
> blast and the useless glued-list rule were caught.
>
> Commit in logical chunks with conventional commits and push to
> `rebrand/usefulapply`.
