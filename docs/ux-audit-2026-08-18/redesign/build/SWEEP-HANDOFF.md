# Post-batch sweep: handoff

**Updated 20 August 2026, second session.** Branch `rebrand/usefulapply`.
Staging is https://usefulapply.com, deployed from this branch at version
`0c759553`.

Passes 1 and 2 are done. Both adversarial reviews are done. Pass 3 landed its
three unblocked entries and all four open decisions now have answers.

---

## What landed

Twenty-four commits, all on `rebrand/usefulapply`, none on `main`. No PR.

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
| `d2c6133d` | `docs:` kickoff prompt for the next session |
| `9dffa2b8` | `feat:` the saved timezone and date format now reach every date |
| `79e80e7d` | `feat:` the cover letter says when it was last written |
| `30671ae0` | `feat:` an Offer's respond-by date now gets its reminder |
| `04695c95` | `fix:` the adversarial review findings on the three Pass 3 features |
| `ed091d7b` | `fix:` the feed is real time, so the code and the copy say so |

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
- Deployed to staging as `0c759553` and walked on the **Max** account: the
  settings modal (General, Notifications), the tracker table and conversation,
  the feed conversation and canvas, and an existing application's cover letter.
  Console clean, no React errors.
- Checked anonymously over HTTP: `/` and `/pricing` return 200, `/login` and
  `/signup` redirect.

### Both "only Wasim can do" checks are now done

The browser turned out to hold the **Max** account, not the Free one, so both
open checks closed without a sign-in. The settings modal opens on `/settings`
and rewrites the URL to `/dashboard`, the panes render, and Timezone reads
`Europe/Berlin` with the date format on `20 Aug 2026`, which is what the
formatter then uses everywhere.

### What the walk confirmed, feature by feature

- **Notifications** reads "A follow-up or offer deadline is due".
- **The tracker** prints "Follow up by 27 Aug" in the saved order, and the
  overdue rows agree with the header count, which is the zone-aware day math.
- **The feed header** reads "Thursday 20 August", through the shared formatter.
- **The cover letter** on an existing application shows "193 words" with no
  "Updated" prefix. That is the fix working: the letter predates the stamp, so
  there is nothing truthful to say, where before the review fix it would have
  claimed "Updated just now" on every reload.

---

## One deployment problem worth knowing

The bare landing URL is served with `cache-control: s-maxage=31536000`, so the
CDN kept the old HTML after the deploy. `https://usefulapply.com/` still showed
"Roles picked for you every morning" while the same URL with a cache-busting
query showed the new line. The build artifact is correct and the Worker is
correct; the edge copy is stale. **A static copy change needs a Cloudflare
cache purge to reach visitors.** Nothing in the app is affected, because the
signed-in routes are dynamic.

---

## What is left

**All four decisions are answered.** Two are already built, two are not.

1. **The shared SerpAPI budget: raise the Free budget.** Give Free two calls a
   day so a main query and a rescue both fit. **Not built.** It touches
   `JOB_FEED_MAX_DAILY_QUERIES` and the tier limits in `constants.ts`, which
   the file says needs explicit sign-off, and it costs real money per Free user.
2. **The daily cooldown: no bypass. Built** in `ed091d7b`. The feed is real
   time and user-started, one run per 24 hours, and a settings edit costs no
   extra SerpAPI call: it applies to the next run. The dead `firstSetupAfterRun`
   branch is gone and the limit is now stated before the click, not after it.
3. **The sidebar badge: unseen runs only.** Wasim asked for the expert call and
   this is it. The badge should mean "there is a feed you have not opened", so
   it clears when the feed is opened and never competes with the canvas header.
   **Not built.** Today the sidebar says "18 new roles for you" while the canvas
   says "5 roles", which is the disagreement, and the conversation on the same
   screen says the roles are from the last search rather than today.
4. **A repeat generation reuses its entry and overwrites it. Not built.** It
   would live at `src/hooks/useSupabaseSync.ts:466-484`.

### Also open

- **`notify_feed_ready` controls nothing and now never can.** The toggle says
  "Today's feed is ready", but the user starts the run themselves and watches
  it, so there is no moment to mail. It should either come out of Notifications
  or be repurposed. This is a UI decision, so it was left alone.
- **The stored follow-up date is still chased however old it is.** That was a
  deliberate call last session, so the review finding against it was recorded
  rather than reversed. The offer date is bounded at 30 days, so the two are
  now asymmetric on purpose.
- **The sweep carries three batches of 200 in one invocation**, up from two,
  and offers run last so they are the ones a truncated run would drop. Nowhere
  near reachable at current volume: the offer query matches zero rows today.
- **The ranking system prompt still opens with "Every morning you evaluate…"**
  (`workers-ai-ranking.ts:86`). Factually stale under real time, but it is a
  model prompt, so changing it can shift ranking behaviour. Left alone.

No PR has been opened and nothing has been merged to `main`.

---

## Kickoff prompt for the next session

> You are continuing the post-batch sweep of the Useful Apply UX redesign on
> branch `rebrand/usefulapply`. `main` is off limits: no PR, no merge. Staging
> is https://usefulapply.com, deployed from this branch at version `0c759553`.
>
> Read `docs/ux-audit-2026-08-18/redesign/build/SWEEP-HANDOFF.md` first, then
> `BACKEND-GAPS.md` in the same directory. Both are current as of 20 August
> 2026. Passes 1 and 2 are done, both adversarial reviews are done, Pass 3
> landed its three unblocked entries and all four open decisions are answered.
> Twenty-four commits, none on `main`.
>
> **1. Build the three answered decisions that are not built yet.** They are
> listed under "What is left" in the handoff.
>
> - **The sidebar badge counts unseen runs.** It should mean "there is a feed
>   you have not opened", clear when the feed is opened, and stop competing
>   with the canvas header. Today the sidebar says "18 new roles for you" while
>   the canvas says "5 roles". Start at `summary/route.ts:41`, where
>   `unprocessedCount` is defined as roles the user has not saved.
> - **A repeat generation for the same job reuses its entry and overwrites it.**
>   `src/hooks/useSupabaseSync.ts:466-484`. Confirm with Wasim what the user
>   sees when it happens before you write the overwrite.
> - **Raise the Free SerpAPI budget to two calls a day**, so a main query and a
>   rescue both fit. This one spends money and `constants.ts` says the daily
>   query count needs explicit sign-off, so confirm the number with Wasim
>   first, then check the fallback pass is actually reachable afterwards.
>
> **2. Ask Wasim about `notify_feed_ready`.** The toggle says "Today's feed is
> ready" and controls nothing. Under real time the user starts the run and
> watches it, so there is no moment to mail. It comes out of Notifications or
> it gets repurposed, and that is his call.
>
> **3. The landing page needs a Cloudflare cache purge.** The bare URL is
> served with `s-maxage=31536000`, so the copy fix deployed in `ed091d7b` is
> live in the Worker but the edge is still serving the old HTML. Ask Wasim to
> purge, then confirm `https://usefulapply.com/` reads "Roles picked for you,
> whenever you ask" without a cache-busting query.
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
> and verify on staging in the browser. Note the deploy hit a Cloudflare
> `Authentication error [code: 10000]` on the secrets endpoint once and worked
> on a straight retry of `npx opennextjs-cloudflare deploy`, which also skips
> the rebuild.
>
> Three habits from these two sessions that paid off, keep them. Check every
> agent finding against the code before acting on it: five of the twenty-eight
> raised so far did not survive that check. Measure heuristics against the real
> database instead of reasoning about them, which is how the 97-row email
> blast, the useless glued-list rule and the unbounded offer query were all
> caught. And check the clock before trusting a cron result: the first run of
> this session read zero sent rows because the 08:00 UTC sweep had not fired
> yet.
>
> Commit in logical chunks with conventional commits and push to
> `rebrand/usefulapply`.
