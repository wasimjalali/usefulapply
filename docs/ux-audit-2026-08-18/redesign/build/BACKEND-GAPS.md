# Backend gaps: UX and UI built, code behind it missing

**Rule for every batch session (1 to 5):** when you build a screen or a control that the design shows but the backend, route, prompt, schema or data does not support yet, do not invent a stand-in and do not quietly drop it. Build the UI honestly against what exists (true copy, real state) and **append an entry here** under the batch that found it. After all seven flows are built, this file is the work list for the backend pass. Keep entries short: what the UI shows, what is missing, where it lives, what it would take.

Format per entry:

```
### <short title>
- **UI today:** what the user sees and what the control does now
- **Missing:** the backend, prompt, route, schema or data that does not exist
- **Where:** files (UI) and the place the missing piece would go
- **Needs:** rough size and any decision Wasim has to make
```

**Every entry still open here now has a recommendation and, where one is
needed, a stated decision, in `BACKEND-DECISIONS.md` next to this file.** Read
that first: it groups the remaining work into what needs Wasim's call, what
does not, and what is blocked on something outside the code.

---

## Found in batch 1 (shell, guided line)

Nothing recorded. If the batch 1 session left something out, add it here.

## Found in batch 2 (Application Kit canvas)

### Rewrite instructions never reach the writer
- **UI today:** the user types "make the cover letter shorter, two paragraphs, keep the churn number", the chat prices it ("Rewriting the cover letter costs 0.5 credits (you have 2.5). It's a fresh draft, not an edit of this one."), one gold chip runs it, the stage and done line follow. The instruction itself is not sent.
- **Missing:** `/api/regenerate` takes `{ type, context }` only and `MasterContext` has no instruction field; the cover letter, email and follow-up prompts in `src/lib/agents/prompts/*` cannot take a user request. The K3 artboard shows the stage detail "Two paragraphs, churn result kept in the opening line", which needs the writer to honour and echo the request.
- **Where:** UI `src/components/ChatPanel.tsx` (`startRegenPrompt`, `confirmRegen`), client `src/lib/regenerate-client.ts` (`regenerateDocument`), route `src/app/api/regenerate/route.ts`, agent `src/lib/agents/unified-writer-agent.ts` + prompts.
- **Needs:** an `instruction` field on the regenerate payload and MasterContext, prompt blocks that apply it without breaking anti-hallucination rules, a stage detail line returned to the client. Medium. Decision: does an instructed rewrite cost the same 0.5?

### CV rewrite from the chat
- **UI today:** "rewrite my CV summary" gets a plain reply pointing at Edit on the CV tab or a fresh kit. No chip, no charge.
- **Missing:** no regenerate type for the CV. The only way to re-tailor the CV is the full kit run (2 credits, rewrites everything).
- **Where:** `src/lib/regenerate-client.ts` (`detectRegenTarget` returns `'cv'`), `src/components/ChatPanel.tsx` (`routeKitMessage`), route + agent as above.
- **Needs:** a `cv` regenerate type (structured `optimizedCVData` out, ATS analysis refreshed), a credit cost for it, the CV-only stage in the chat. Medium-large. Decision: price (the `CV_OPTIMIZATION: 1` constant exists in `src/lib/credit-costs.ts` but nothing charges it).

### Before/After pairs in the ATS view
- **UI today:** "What changed in your CV" shows one card per change with the reason line only. The design shows Before (struck) and After (sage) side by side.
- **Missing:** the writer returns `analysis.key_changes` as strings and an empty `changes` array (`unified-writer-agent.ts` sets `changes: []`), so there is no original snippet to strike through. The view already renders pairs when a change carries `original` and `updated`.
- **Where:** UI `src/components/kit/ATSChangesView.tsx`; data `src/lib/agents/unified-writer-agent.ts` (`generateOptimizedCVData`), `src/lib/agents/prompts/cv-prompt.ts` (analysis schema), `useAgentWorkflow.ts` (maps `changes`).
- **Needs:** the CV prompt to emit `changes: [{ section, before, after, reason }]` alongside `key_changes`, mapped into `generatedCV.changes`. Small prompt and schema change, plus a check it does not inflate output tokens much.

### Screening answers are unpriced and the cap is client-side
- **UI today:** a pasted screening question (or the "Answer screening questions" chip) answers from the CV on Plus and Max, free of credits, capped at 5 turns per application by the client (`screeningUsageCount`, persisted in `generated_cv._screeningUsageCount`).
- **Missing:** no server-side cap (the chat route's per-session limit counts client-supplied history) and no credit cost. Plan gate (403) is server-side and holds.
- **Where:** `src/components/ChatPanel.tsx` (`runScreening`, `SCREENING_TURN_CAP`), `src/app/api/chat/route.ts` (screening mode), `src/lib/credit-costs.ts`.
- **Needs:** decide whether screening costs credits (0.25 or 0.5 per turn?) or keeps a server-enforced per-application cap. Small once decided.

### Answers persist inside `generated_cv` JSON, not their own column
- **UI today:** the Answers tab survives reload and session switch. Data rides in `generated_cv._screeningAnswers` (same embed pattern as `_optimizedCVData`), read back in `useSupabaseSync.ts` and the Job Feed mapper.
- **Missing:** a proper column or table for screening answers, so the tracker and future exports can read them without unpacking the CV blob.
- **Where:** `src/hooks/useSupabaseSync.ts` (`embedKitData`), `src/components/job-feed/feed-session-mapper.ts` (`toStoreApplicationSession`, moved out of the retired JobFeedPanel in batch 3), `src/db/schema.ts`.
- **Needs:** D1 migration + repo + sync changes. Small. Decision: keep the embed for now or add the column when the tracker (flow 4) needs it.

### Download all ships loose files, not a zip
- **UI today:** one outlined Download all (and the chat's "Download the kit" chip) saves the tailored CV PDF, cover letter PDF and DOCX, both emails as TXT and the answers PDF one by one; the browser asks once to allow several downloads.
- **Missing:** no zip library declared in `package.json` (jszip is present only as a transitive dependency of docx).
- **Where:** `src/components/kit/KitExportHost.tsx`.
- **Needs:** decision on adding jszip (or using the transitive one explicitly); then a single `<Name>_<Company>_kit.zip`. Small.

### Cover letter "Updated just now" has no stored timestamp - CLOSED
- **Closed 20 August 2026.** `GeneratedCoverLetter` carries an optional `updatedAt`, stamped by the three paths that write a letter: generation, regeneration and a saved edit. It rides in the session JSON, so no schema change. The panel seeds its label from that stamp, so a reload still says when the letter changed, and past a day the label prints the date instead of "earlier".
- **No clock fallback.** `useSupabaseSync` replaces the current session with a freshly parsed row, so the letter object changes identity on every authenticated load with the same content. Falling back to the clock there would have invented "Updated just now" for every letter written before the stamp.
- **Only the cover letter.** `email`, `followUpEmail` and `optimizedCVData` have no toolbar that reports a time, so stamping them would be UI-less state.
- **Where:** `src/lib/types.ts`, `src/components/CoverLetterPanel.tsx`, `src/components/chat/useAgentWorkflow.ts`, `src/lib/regenerate-client.ts`.

### Unknown credit balance still shows the priced chip
- **UI today:** while `/api/credits/balance` is loading or failed, the rewrite chip renders priced; a short balance is caught by the server (402) and the chat says nothing was charged.
- **Missing:** a balance that is always known on the client (or a balance pushed with the session), so the control can be the upgrade path before the click every time.
- **Where:** `src/hooks/useCreditsBalance.ts`, `src/components/ChatPanel.tsx` (chips).
- **Needs:** decide on a loading state for priced chips or include the balance in the auth/profile payload. Small.

## Found in batch 3 (feed)

### The run reports no progress until it finishes
- **UI today:** J2 shows four named stages (Reading your profile, Planning your searches, Searching, Ranking against your CV) with a progress bar, and the canvas lists today's queries with their rationales. Stages 1 and 2 flip to done off real completions (the career-profile POST and the strategy POST return). Stage 3 stays active for the whole run and stages 3 and 4 both complete when the run does. The queries carry no per-query "N found".
- **Missing:** `/api/job-feed/run` is one synchronous POST that returns only when the whole workflow is done. `runJobFeedFoundationWorkflow` writes `search_plan`, `raw_jobs_fetched` and the counts into `job_feed_runs` only at completion, and `metadata.stage` is set to `phase_4_ranking` before ingestion even starts, so polling the run tells you nothing about where it is.
- **Where:** UI `src/components/job-feed/FeedConversation.tsx` (`buildStages`) and `src/components/job-feed/FeedCanvas.tsx` (`BuildingCanvas`); backend `src/app/api/job-feed/run/route.ts`, `src/lib/job-feed/server.ts` (`runJobFeedFoundationWorkflow`), `src/lib/job-feed/ingestion.ts`.
- **Needs:** per-query progress written as the run goes (a `metadata.progress` array of `{ query, status, found }` updated after each SerpAPI call, or an SSE endpoint like `/api/agent-v2`), plus a stage marker the client can read. Medium. Decision: incremental row writes on `job_feed_runs` versus a real stream.

### The design's "ten searches" is two on Plus and one on Free
- **UI today:** the conversation and the building canvas say the real number: "I ran 2 searches for you", "2 searches today, in priority order", and Edit feed's Searches pill lists today's queries plus "N more queries are in the plan. Each morning works down the list."
- **Missing:** nothing is broken, but the artboards (J2, J3, J6) were drawn against ten searches a day. `JOB_FEED_TIER_LIMITS` allows 2 SerpAPI calls on Plus, 4 on Max and 1 on Free because each call costs cash, while the strategy generator plans up to 10 queries.
- **Where:** `src/lib/job-feed/constants.ts` (`maxDailyQueries`), `src/lib/job-feed/search-strategy.ts` (plans 10).
- **Needs:** a product decision, not code. Either raise the daily query budget (real SerpAPI cost per call) or keep the copy honest as it is now. Small either way.

### Re-ranking by chat filters today's list, it does not re-rank it
- **UI today:** "only remote", "salary floor 150K", "no agencies", "drop Group PM" are parsed, saved to `job_feed_settings`, and applied as a filter over the list already on screen. The assistant says exactly that: "Remote only from now on. I've hidden 3 roles from today's list. Tomorrow's search uses it from the start."
- **Missing:** there is no re-rank endpoint. Ranking happens once inside the daily run (`rankJobFeedCandidates`), and `/api/job-feed/run` is capped at one manual run per local calendar day, so a saved change cannot re-order today's feed.
- **Where:** UI `src/components/job-feed/FeedConversation.tsx` (`applySteer`), `src/lib/job-feed/rerank-intent.ts`; backend `src/lib/job-feed/server.ts`, `src/lib/job-feed/workers-ai-ranking.ts`, `src/app/api/job-feed/run/route.ts`.
- **Needs:** a `POST /api/job-feed/rerank` that re-runs the ranker over the run's existing canonical jobs with the new settings and rewrites `job_feed_ranked_items` (no SerpAPI cost, only a Workers AI call). Medium. Decision: is a re-rank free, or does it count against the daily run?

### "Add Berlin" is understood but never saved - CLOSED
- **Closed 20 August 2026.** `countryForCity` in constants.ts reverses `JOB_FEED_CITY_SUGGESTIONS` (accent, casing and alias tolerant), and `normalizeJobFeedSettingsInput` adds the implied country when a city names one. An unknown city changes nothing, which is the honest fallback.
- **UI today:** `detectFeedIntent` recognises "add Berlin" and the assistant confirms "Berlin is in the search now." The city is added to `target_cities` on the settings payload.
- **Missing:** a city outside the saved `target_countries` is searched in the wrong market, and nothing maps a city name to a country. `JOB_FEED_CITY_SUGGESTIONS` in constants.ts is a per-country list, not a reverse index, and the settings route does not validate that a city belongs to a selected country.
- **Where:** `src/lib/job-feed/rerank-intent.ts`, `src/app/api/job-feed/settings/route.ts`, `src/lib/job-feed/constants.ts`.
- **Needs:** a city-to-country lookup (reverse `JOB_FEED_CITY_SUGGESTIONS` plus a fallback), and the settings route adding the country when a city implies one. Small.

### The free tier cannot say how many roles it is hiding
- **UI today:** J7's line reads "You're seeing your top 5 today. Plus shows every role that matched, searches more sources and lets you steer the feed." The artboard says "9 more roles matched today."
- **Missing:** the overview route caps both `jobs` and `jobsTotalCount` at the free tier's `visibleCount` before the client sees them, so the client cannot know the uncapped number.
- **Where:** `src/app/api/job-feed/overview/route.ts` (`visibleCap`, `totalCount`), UI `src/components/job-feed/FeedCanvas.tsx`.
- **Needs:** return the uncapped count as a separate field (e.g. `jobsMatchedCount`) while keeping the item list capped. Small.

### "Why it's a match" is empty on saved jobs - CLOSED
- **Closed by `62885ddc`.** `listSavedJobFeedItemsAdmin` joins `listRankedItemsByJobIds`, so a saved job carries its badge and its reason. A job with no ranked row still shows neither, by design.
- **UI today:** the job detail shows "Why it's a match" from `matchReason`, which this batch threaded through from `job_feed_ranked_items.reason`. The section is hidden when there is no reason.
- **Missing:** `listSavedJobFeedItemsAdmin` builds its items straight from the feedback rows and the canonical jobs, with no ranked-item join, so every job opened from the Saved tab has `matchReason: null`. The same is true for any job whose run has aged out of the 7-day window.
- **Where:** `src/lib/job-feed/server.ts` (`listSavedJobFeedItemsAdmin`, `toFeedItem`).
- **Needs:** join the most recent `job_feed_ranked_items` row per canonical job in the saved query. Small.

### Check fit from a card cannot price against the balance
- **UI today:** every card carries a gold "Check fit · 0.5" and the detail carries "Check fit · 0.5 credits" with "Skip the check, generate the kit (2 credits)". The price is on the control before the click, but a user who cannot afford it still sees the same control and only learns after the click (the chat then says what the server said, and nothing is charged).
- **Missing:** the feed does not read the credit balance, so a short balance cannot turn the control into the upgrade path the way `ChatPanel` does with `useCreditsBalance`. Doing it per card would also mean the balance drives 20 controls at once.
- **Where:** UI `src/components/job-feed/FeedJobCard.tsx`, `src/components/job-feed/FeedJobDetail.tsx`; existing pattern `src/hooks/useCreditsBalance.ts`, `src/components/ChatPanel.tsx`.
- **Needs:** decide whether the feed reads the balance (one fetch, gate all cards) or whether the price on the control plus a clean 402 is enough. Ties into the batch 2 gap "Unknown credit balance still shows the priced chip". Small once decided.

### No morning scheduler, and the old "Run today" control was retired
- **UI today:** the conversation offers "Build today's feed" when the latest run is not from today, and the copy no longer promises an overnight refresh. There is still no cron that searches while the user sleeps.
- **Missing:** a scheduled job-feed run (the specialist scope currently says on-click only). `wrangler.jsonc` has one live cron at `0 3 * * *` for cleanup + credit resets, not the feed.
- **Where:** UI `FeedConversation.tsx` (`build-today` chip); backend `src/cron/index.ts`, `src/app/api/job-feed/run/route.ts`.
- **Needs:** a product decision. A daily cron in the user's timezone, or keep on-click and leave the chip. Medium if we add the cron (SerpAPI cost per user per day).

### The feed conversation is not persisted anywhere
- **UI today:** the feed's opening message is derived from the overview on every load, so a reload always shows today's real feed. Anything the user typed or picked afterwards (the steering exchange) lives in `useFeedStore`, which is deliberately not persisted, and is gone after a reload.
- **Missing:** no store or table for feed conversation turns. Application conversations persist via `chat_messages`; the feed has no equivalent.
- **Where:** `src/store/useFeedStore.ts` (`thread`), `src/hooks/useSupabaseSync.ts`.
- **Needs:** a decision first. A daily feed arguably should reset each morning; if the exchange should survive a reload, it needs a table or a day-keyed localStorage entry. Small.


## Found in batch 4 (tracker + settings)

### Batch 4 (part A, tracker)

### Reminder windows are UTC, not the user's timezone - CLOSED
- **Closed 20 August 2026.** The sweep queries a three-day UTC window (the smallest that contains every zone's tomorrow, UTC-12 to UTC+14) and then judges each candidate in its owner's own timezone. Day arithmetic runs on the day key, so a DST shift cannot skip a day.
- **UI today:** the popover promises "I'll remind you the day before" and the daily cron (`0 8 * * *`) sends for interviews falling on tomorrow's **UTC** calendar day.
- **Missing:** `profiles.timezone` is now stored (General pane sets it) but the cron does not read it, so a user in UTC+13 can get "tomorrow" a few hours early or late.
- **Where:** `src/cron/tracker-reminders.ts` (`startOfUtcDay`), `src/db/repos/admin.ts` (`listInterviewReminderCandidates`).
- **Needs:** group candidates by `profiles.timezone` and compute the day boundary per group, or run the sweep hourly and pick users whose local time has just hit the send hour. Small.

### "Prep me for X" has no prep generation behind it
- **UI today:** the chip loads that application and opens its conversation with a line telling the user to ask there.
- **Missing:** there is no interview-prep generator. The kit agents write a CV, a cover letter and two emails, nothing that prepares someone for an interview.
- **Where:** `src/components/tracker/TrackerConversation.tsx` (`prepChip`); backend would be `src/lib/agents/**`.
- **Needs:** a prep prompt and a credit price, or the chip stays a hand-off. Medium, and it touches the agent prompts, which this batch was told not to change.

### Follow-up drafting from the tracker rides on the kit's session state
- **UI today:** the chip loads the application into the session store, then calls `regenerateDocument('follow-up')`, which reads `currentSession` and `currentCV`.
- **Missing:** there is no server-side "generate the follow-up for session X" call, so the flow depends on the client having that session and the user's CV in memory. If the CV store is empty the request returns `NO_CONTEXT` and the user is told to open the application.
- **Where:** `src/lib/regenerate-client.ts` (`buildContext`), `src/components/tracker/TrackerConversation.tsx`.
- **Needs:** a session-scoped regenerate endpoint that builds its own context server side. Medium.

### The tracker chat costs an LLM call on every message with no credit price
- **UI today:** every message in the tracker conversation calls `/api/tracker/chat`, which runs `general_chat` on Claude to parse intent. It is rate limited (the `chat` limit, keyed per user) but free.
- **Missing:** no credit deduction and no per-user daily ceiling, so the cost is unbounded per user.
- **Where:** `src/app/api/tracker/chat/route.ts`.
- **Needs:** a decision. Either it stays free like the kit chat (consistent, and the calls are small) or it gets a ceiling. Small.

### An Offer's respond-by date is stored but never mailed - CLOSED
- **Closed 20 August 2026.** `listOfferDeadlineCandidates` is its own query, because an offer deadline is always a date the user picked: there is no `created_at` fallback to derive and nothing to backfill. The sweep sends it with its own template, and the popover and the tracker conversation now promise the reminder for Offer.
- **No new column.** The claim reuses `follow_up_reminder_sent_at`. A row holds one status at a time, and `setTrackerStatus` clears the guard whenever `follow_up_due_at` moves, so a row that already had its follow-up chased still gets the offer email. The one case it skips is an Offer saved on the exact date the follow-up used, which is the guard doing its job.
- **No new toggle either.** It rides `notify_follow_up_due`, so Notifications now reads "A follow-up or offer deadline is due" rather than promising a switch that does not exist.
- **Bounded at 30 days.** Offer is terminal, so nobody moves a row out of it. Without a floor on the respond-by date a dead deadline stays a live candidate forever, and the day a user verifies their email or turns the toggle back on the whole backlog goes out at once, oldest first. Being late to answer an offer is worth a nudge; a month late means the offer is gone.
- **Entering or leaving Offer re-arms the guard.** The popover pins every non-interview date to 09:00 local, so a follow-up already chased and an offer due the same day serialise to the same string and the old guard swallowed the offer email while the popover promised it.
- **Where:** `src/db/repos/admin.ts`, `src/db/repos/sessions.ts`, `src/cron/tracker-reminders.ts`, `src/lib/email/templates/tracker-reminder.ts`, `src/components/tracker/TrackerCanvas.tsx`, `src/components/tracker/TrackerConversation.tsx`, `src/components/settings/NotificationsPane.tsx`.

### Applications that reached Applied before this batch get a NEXT date the cron cannot act on - CLOSED
- **Closed 20 August 2026.** No backfill. `listFollowUpReminderCandidates` also returns Applied rows with a null `follow_up_due_at`, and the sweep derives the date with the same `defaultFollowUpDue` the tracker shows the user, so the two cannot disagree.
- **UI today:** an Applied row with no stored `follow_up_due_at` still shows "Follow up by <date>" or "Follow up overdue", derived from `created_at` plus seven business days, and counts toward "N follow-ups due this week".
- **Missing:** the reminder sweep requires `follow_up_due_at is not null`, so those rows never trigger the email the Notifications toggle promises. No SQL backfill was written because `datetime()` returns a different string shape than the ISO values every other writer stores, which would break the date comparisons.
- **Where:** `src/components/tracker/tracker-status.ts` (`defaultFollowUpDue`), `src/db/repos/admin.ts` (`listFollowUpReminderCandidates`).
- **Needs:** either a TypeScript backfill script that writes proper ISO dates, or the same created_at fallback inside the candidate query. Small. Any status change on the row fixes it by itself.

### Deleting an account needs no re-authentication - CLOSED
- **Closed 20 August 2026.** Better Auth's `user.deleteUser` is enabled with `sendDeleteAccountVerification`, so the DELETE now asks for the deletion and mails a link. Only Better Auth's `/api/auth/delete-user/callback` deletes anything, and it only completes for the session that asked, so an attacker needs the mailbox and the browser. The link expires in 30 minutes, the same window the reset link uses.
- **Why not a password.** `auth.api.verifyPassword` exists and is a route-level change, but it only covers credential accounts. Google users have no credential row, and an email gate is uniform. Measured: 38 users, 2 `account` rows, both `credential`, because the migration imported users without passwords.
- **The wipe moved, not the order.** R2 prefixes then app data, both in the `beforeDelete` hook, which runs before the user row goes. A throw there aborts the deletion and the link can be used again.
- **A subscription now blocks the deletion.** Found during the review: nothing in this app cancels at Stripe, and `deleteAllUserData` drops both the `subscriptions` row and the `user_credits` row the webhook resolves customers through. A paying user who deleted their account kept being billed with no record left to reconcile against. The route refuses with a 409 while Stripe would charge again, and the settings row says so and points at Usage and Billing. A subscription already set to cancel at the period end does not block, because it is not billed again and making someone wait weeks to close their account is the wrong trade.
- **One rule, two callers.** `willBillAgain` in `src/lib/subscription-billing.ts`, used by the route and the pane, because two copies of a rule whose failure mode is charging a card that has no account would drift. The read is `getBillingSubscription`, not `getSubscription`, which filters to status 'active' and would miss a `past_due` subscription Stripe is still retrying.
- **Where:** `src/auth/server.ts`, `src/app/api/auth/delete-account/route.ts`, `src/app/api/auth/[...all]/route.ts`, `src/components/settings/GeneralPane.tsx`, `src/lib/email/templates/delete-account.ts`, `src/lib/subscription-billing.ts`, `src/db/repos/subscriptions.ts`, `src/db/actions.ts`.

### Batch 4 (part B, settings)

### Two-factor authentication: dropped, not deferred
- **Decision (Wasim, 19 Aug 2026):** we do not want 2FA at this stage. The row is not rendered anywhere in the settings modal and should stay out until there is a reason to build it, so the UI never advertises something that does not exist.
- **If it ever comes back:** Better Auth is created with no `plugins`, so it would need `better-auth/plugins/two-factor`, a `twoFactor` table and a TOTP enrolment flow.

### "Last changed 3 months ago" under Password has no source
- **UI today:** the Password row shows only "Change". The artboard's "Last changed ..." line is omitted rather than faked.
- **Missing:** nothing records when a password was last changed. Better Auth's `account` row has `updatedAt`, but it also moves for unrelated writes, so it is not a truthful answer.
- **Where:** UI `src/components/settings/GeneralPane.tsx`; backend a `password_changed_at` column on `profiles` written by the change-password path.
- **Needs:** one column and one write. Small.

### Timezone and date format are stored but nothing reads them - CLOSED
- **Closed 20 August 2026.** `src/lib/utils/format-date.ts` is the one formatter. It takes a `DatePrefs` (`timeZone` plus a `dmy` / `mdy` / `iso` order), falls back to the browser's own zone and `dmy` when there is no profile, and drops a stored zone the runtime does not know rather than throwing inside `Intl`. It is pure and dependency-free, so the Worker can use it too.
- **`useDatePrefs()`** reads the two columns off the profile for components.
- **Swapped:** the tracker rows and NEXT column, the tracker conversation opening, the feed conversation header, the feed's "last run" stamp, the feed profile "refreshed" date, the chat history list, the billing renewal date, and the cover letter's "Updated" label past a day.
- **Not swapped, deliberately:** `StatusPopover`'s day chips. Those pick a date in the browser's own calendar and store it with local getters, so printing them in a different zone would make the chip disagree with what it saves.
- **The day math moved too.** `deriveNextStep` and `countFollowUpsDueThisWeek` compared browser-local midnights while the label beside them printed in the saved zone, so a row could read "Follow up by 26 Aug" and be told it was overdue. Both now compare day keys in the saved zone, which is a no-op for a reader whose zone matches their browser.
- **The reminder sweep already reads the zone**, per the entry above.

### Two of the five notification toggles have no sending path
- **UI today:** Notifications persists all five toggles through `updateProfileAction`. `notify_follow_up_due` and `notify_interview_tomorrow` are live: the `0 8 * * *` sweep in `src/cron/tracker-reminders.ts` reads them and sends. `notify_marketing` gates a manual send.
- **Missing:** there is no "today's feed is ready" email and no "credits are about to run out" email, so those two toggles currently control nothing.
- **Where:** UI `src/components/settings/NotificationsPane.tsx`; backend `src/cron/index.ts`, the Cloudflare `EMAIL` binding and the templates under `src/lib/email/`.
- **Needs:** two templates plus a hook into the feed run and the credit deduction path. Medium.

### The new profile columns are not on the remote D1 yet
- **UI today:** the panes read the new columns defensively. A missing `notify_*` boolean falls back to its default and a missing `timezone` / `date_format` falls back to the detected zone and `dmy`, so nothing crashes before the migration runs.
- **Missing:** `migrations/d1/0005_tracker_dates_and_prefs.sql` has not been applied to the remote database. Until it is, a toggle writes and the write fails at the DB, and the pane shows "We could not save that."
- **Where:** `migrations/d1/0005_tracker_dates_and_prefs.sql`.
- **Needs:** run the migration on staging and production. Small, but it gates the whole Notifications pane.

### The usage breakdown leans on free-text transaction types
- **UI today:** "Used 9: three fit checks, two kits, one rewrite" is computed client side from `credit_transactions`, bucketing `fit_analysis` as a fit check, `full_application` / `generation_after_fit` as a kit and everything else as a rewrite. The window starts at `user_credits.last_reset_date`.
- **Missing:** `transaction_type` is a plain string (`action.toLowerCase()`), so a new credit action silently lands in the rewrite bucket. `last_reset_date` can also be null on old rows, in which case the whole transaction history counts as this month.
- **Where:** UI `src/components/settings/UsageBillingPane.tsx`; backend `src/db/repos/credits.ts` (`deductAmount`, `getCreditTransactions`).
- **Needs:** either a typed enum on the column or a small server-side summary endpoint that returns the month's buckets. Small.

### Stripe still returns to /subscription, which is now a redirect
- **UI today:** `/subscription` 308s to `/dashboard?settings=usage` and carries `success`, `addon_success`, `canceled` and `addon_canceled` through, so the Usage pane can poll while the webhook lands.
- **Missing:** the checkout and portal routes still hardcode `${BRAND.url}/subscription` as their success, cancel and return URL, so every payment return takes an extra hop.
- **Where:** `src/app/api/stripe/create-checkout/route.ts`, `create-addon-checkout/route.ts`, `create-portal/route.ts`.
- **Needs:** point the three URLs at `/dashboard?settings=usage`. Trivial, but it is a Stripe route, which this batch was told not to touch.

### CreditIndicator is dead UI that still links at the old routes - CLOSED
- **Was:** `CreditIndicator.tsx` was rendered nowhere but could not be deleted, because `LowCreditsModal` and `LowCreditsBanner` imported its `CREDIT_UPDATE_EVENT`.
- **Resolved in the post-batch sweep (pass 1, 19 August 2026):** all three components had zero inbound references and are deleted. The live event path was already elsewhere, `src/lib/utils/creditEvents.ts` plus `src/hooks/useCreditsBalance.ts`, so nothing had to move.

## Found in batch 5 (auth + marketing)

### The daily feed moment on the landing is still the mock
- **UI today:** moment 3 renders `/images/moments/daily-feed.webp`, which is a crop of the flow-7 artboard, not a screenshot of the built feed. The other three shots (hero kit, fit result, ATS what changed) are real captures of the built screens at 1440x900.
- **Missing:** the feed store is deliberately not persisted and the feed reads from the server, so a real capture needs a signed-in account with a completed feed run. Local seeding can't reach that state.
- **Where:** `src/app/page.tsx` (`MOMENTS[2]`, marked PLACEHOLDER), `public/images/moments/daily-feed.webp`.
- **Needs:** capture it during the end-to-end pass Wasim planned, then drop the WebP in at 1440x900 under 150 KB and remove the comment. Small, but it needs a real account. **Agreed with Wasim on 19 Aug 2026: placeholder stays until the end-to-end pass.**

### The reset link window - CLOSED
- **Was:** `resetPasswordTokenExpiresIn` was unset, so Better Auth 1.7 fell back to 3600 seconds while the flow-6 copy promised 30 minutes.
- **Resolved 19 Aug 2026 (Wasim asked for the fix):** `resetPasswordTokenExpiresIn: 60 * 30` is now set in `src/auth/server.ts`, and all three places that state the window say 30 minutes: the reset card, the expired-link card and the reset email template (`src/lib/email/templates/password-reset.ts`, which had also said "about an hour").

### Sign-up password floor - CLOSED
- **Was:** the UI said 8 characters while `/api/auth/signup` rejected under 6 and `minPasswordLength` was 6, so a 6-character password got through any client that skipped our form.
- **Resolved 19 Aug 2026 (Wasim asked for the fix):** `minPasswordLength: 8` in `src/auth/server.ts`, the signup route rejects under 8, and the guided line's inline sign-up card (`src/components/shell/GuidedLine.tsx`) was raised from 6 to 8 as well, so it can no longer submit a password the server will bounce.

### "We couldn't find that address" can't be shown on the reset form - CLOSED
- **UI today:** `/auth/forgot-password` shows inline errors for a malformed address and for rate limiting only. It never says the address is unknown.
- **Missing:** nothing. This is not a bug. `/api/auth/forgot-password` always returns success for a well-formed address so account existence can't be enumerated, and Better Auth 1.7 returns 200 for unknown emails too, so the client never learns whether the account exists.
- **Where:** `src/app/api/auth/forgot-password/route.ts`.
- **Resolved 19 Aug 2026:** the string is dropped from `flow-6-auth.md` note 3 and the code is unchanged. Nothing further to do.

### The landing height - CLOSED
- **Was:** 4,699 px at 1440 wide, 199 over F28's 4,500 target, because the real footer is 813 px against the artboard mock's ~532 and the real navy band is 463 against ~420.
- **Resolved 19 Aug 2026 (Wasim's call: the final band and the footer keep the old layout and design, so the trim comes from the new sections only):** the landing is now **4,495 px**. Hero 1052, moments 1437, founder 168, plans 504, all tightened on spacing only; the images stay at the doc's 1040 px hero and 680 px moments, and the final band (463) and footer (813) are byte-for-byte unchanged.

### "Priority generation" on Max - CLOSED
- **Was:** the Max card said "Priority generation" on the landing, in the settings modal and on `/pricing`, and it was the main line separating $79.99 from $19.99. The feature does not exist: `src/lib/models/**` and `src/lib/agents/**` have no reference to `plan_tier`, `planTier` or `subscription_tier` and there is no queue, so a Max generation runs the identical path and model as a Free one. The line came from the locked M1 artboard.
- **Resolved 19 Aug 2026 (Wasim: "that's a copy bug, correct the copy because we don't have such thing yet"):** replaced with **"Twice the feed search"**, which is true and verifiable: `JOB_FEED_TIER_LIMITS` gives Max `maxDailyQueries: 4` and `maxRawJobsPerRun: 40` against Plus's 2 and 20. The `/pricing` Max list drops the line entirely and keeps its existing, accurate "Feed searches 4 job titles across 4 countries".
- **Note for the flow-7 doc:** M1's Max card still shows "Priority generation". The artboard is now one line out of date against the build, on purpose.

### The plan clicked on the landing is dropped at sign-up
- **UI today:** a logged-out visitor clicking "Start with Plus" or "Go Max" goes to `/auth/signup?plan=plus|max`.
- **Missing:** nothing reads `?plan=`. A grep for `get('plan')` returns zero hits. After sign-up and verification the user lands on `/dashboard` on Free, and the purchase intent is gone. Pre-existing behaviour, but the new landing cards make it the main upgrade entry point.
- **Where:** `src/components/marketing/HomePricingButtons.tsx`, `src/app/auth/signup/page.tsx`.
- **Needs:** carry the tier through sign-up and open checkout after verification, or drop the param. Small, but it needs a decision about when checkout should fire.

### A failed verification resend still reports success - CLOSED
- **Closed 20 August 2026.** The `resendOnly` catch now splits unknown user from send failed. An unknown address still returns 200 so the endpoint cannot test whether an account exists. A real send failure returns 500. Better Auth 1.7 already does not throw for unknown or already-verified addresses, so the catch is the send-failure path; the unknown-user branch is the spec's split if that ever changes.
- **Where:** `src/app/api/auth/signup/route.ts`.

### The demo video is off the landing until it is re-recorded
- **UI today:** the hero shows the kit screenshot and no video. The old Tella embed was removed with the rest of the pre-redesign hero.
- **Missing:** the re-recorded demo. The old one still shows Karko AI branding (F24), so it could not be carried over.
- **Where:** it goes back under the hero product shot in `src/app/page.tsx`.
- **Needs:** the recording, then an embed. Flow 7 already schedules this for after the build.

---

## Found in the post-batch sweep (passes 1 and 2, 19 to 20 August 2026)

These came out of the dead-code pass and the bug hunt. Everything here was
deliberately left unfixed: each one needs a schema change, a product decision,
or UI the locked flow docs do not specify.

### Deleting an application is gone from the product - CLOSED
- **Closed 20 August 2026.** Single row, hard delete, plain confirm. Tracker hover trash opens `DeleteConfirm`. `deleteSession` now fails on a zero-row write. Chat and generation rows cascade. Feed feedback set-null.
- **Where:** `src/components/tracker/TrackerCanvas.tsx`, `src/components/tracker/DeleteConfirm.tsx`, `src/store/useTrackerStore.ts` `remove`, `src/db/repos/sessions.ts`.

### `loadSession` blanks the workspace when the tracker and the session store disagree - CLOSED
- **Closed 20 August 2026.** `loadSession` no longer blanks on a miss. `openStoredSession` fetches the D1 row, then loads chat. Tracker follow-up and prep wait for that open, so a miss cannot regenerate the previous kit.
- **Where:** `src/lib/open-session.ts`, `src/store/useSessionStore.ts`, tracker, sidebar, dashboard, ChatHistory.

### The tracker silently truncates at 300 applications
- **UI today:** the tracker lists applications and shows count pills.
- **Missing:** `listTrackerOverview` caps at `TRACKER_OVERVIEW_LIMIT = 300` and filters client-side. Past 300 the list is short and the pills understate, with no "showing the most recent 300" line. The route it replaced was server-paginated with a real `count(*)`.
- **Where:** `src/db/repos/sessions.ts`, `src/components/tracker/TrackerCanvas.tsx`.
- **Needs:** either a line of copy admitting the cap, or paging. Small. Not urgent at current volumes.

### Chat history loads for the 10 most recent applications only - CLOSED
- **Closed 20 August 2026.** The initial sweep no longer fetches the 10 newest. `openStoredSession` loads that session's messages. ChatHistory used to do this itself; it now calls the same helper. Measured: 432 of 467 chat rows sat outside those 10.
- **Where:** `src/lib/open-session.ts`, `src/hooks/useSupabaseSync.ts`.

### A saved job stops working after 7 days - CLOSED
- **Closed 20 August 2026.** Cleanup skips ranked rows whose feedback has `saved_at`. Unsaving nulls `saved_at`, so the next sweep can take them. The bookmark was save-only; it now toggles. Measured before the change: 1 saved job, 0 already past 7 days.
- **Where:** `src/db/repos/admin.ts` `deleteExpiredRankedItems`, `src/lib/job-feed/server.ts` `unsaved`, `src/app/api/job-feed/feedback/route.ts`, `src/components/job-feed/useFeedJobActions.ts`.

### Per-tier input caps on the feed are not shown anywhere
- **UI today:** Edit feed takes as many roles, countries and cities as the user types.
- **Missing:** `getJobFeedInputCaps` lost its caller when batch 3 retired the wizard cards. The run still slices to the tier limit, so a Free user's second country is dropped with no signal and settings look honoured when they are not.
- **Where:** `src/lib/job-feed/constants.ts` (the caps exist), `src/components/job-feed/FeedEditView.tsx` (the note would go in the Preferences pill).
- **Needs:** one line of copy per tier against `getJobFeedInputCaps(tier)`. Small, but the wording is not in the locked flow doc.

### Job-feed rate limits are keyed by client IP, before authentication - CLOSED
- **Closed 20 August 2026.** Two tiers now. Every job-feed handler runs a shared per-IP gate first, then authenticates, then applies its own limit keyed on the user id. The gate is one binding (`RATE_LIMIT_JOB_FEED_IP`, namespace 3131) at 600 a minute for the whole feed: it exists so an unauthenticated hammer cannot make every request pay a session lookup, not to price the route. Per-route ceilings are unchanged.
- **All fourteen handlers, not eleven.** `apply/generation`, `apply/status` and `career-profile` POST were already keyed on the user, but they had nothing in front of the session lookup, which is the other half of the problem.
- **Where:** `src/app/api/job-feed/**`, `src/lib/middleware/rateLimiter.ts` (`checkJobFeedIpGate`), `wrangler.jsonc`.

### `NEXT_PUBLIC_ENABLE_JOB_FEED_DEBUG` unlocks a forced feed run - CLOSED
- **Closed 20 August 2026.** The public flag is gone. `/api/job-feed/dev/run` checks header `x-job-feed-debug-secret` against server-only `JOB_FEED_DEBUG_SECRET` with a timing-safe compare. Unset or wrong, the route 404s. Not a `NODE_ENV` check, so a forced run against a deployed environment stays possible once the secret is set. The function was removed from `constants.ts` so it is no longer in the client bundle.
- **Where:** `src/app/api/job-feed/dev/run/route.ts`.

### Consent can be granted but never withdrawn - CLOSED
- **Closed 20 August 2026.** `POST /api/job-feed/consent/withdraw` is tier-agnostic (`canViewJobFeed`), so it does not live behind the plus/max gate on PUT settings. It clears `consent_accepted_at` and sets `enabled: false`. Idempotent. The conversation offers "Stop searching for me" when consent is on file.
- **The free run no longer invents the grant.** `getOrProvisionFreeJobFeedSettingsAdmin` requires `consentAccepted: true`. `POST /api/job-feed/run` reads `consent_accepted` from the body and the workflow throws `JOB_FEED_CONSENT_REQUIRED` (400) before it provisions or re-grants. A direct POST with no body does not record a consent the user never gave. `runFeed` only sends that field when consent is missing or the feed is off, so a later "Build today's feed" cannot undo a withdrawal. After withdraw, a free overview returns awaiting until they say yes again.
- **Where:** `src/app/api/job-feed/consent/withdraw/route.ts`, `src/lib/job-feed/server.ts`, `src/app/api/job-feed/run/route.ts`, `src/db/repos/jobFeed.ts` `withdrawConsent`.

### Free users are 403'd from their own career profile - CLOSED
- **Closed 20 August 2026.** GET `/api/job-feed/career-profile` and GET `/api/job-feed/search-strategy` now use `canViewJobFeed` via `requireJobFeedView`. POSTs stay paid (`canAccessJobFeed`). The free feed is CV-driven and builds that profile during its run, so the GETs have to be readable.
- **Where:** `src/app/api/job-feed/career-profile/route.ts`, `src/app/api/job-feed/search-strategy/route.ts`, `src/lib/job-feed/auth.ts` `requireJobFeedView`.

### `POST /api/job-feed/apply` does not check the credit balance - CLOSED
- **Closed 20 August 2026.** The client sends the same POST for the fit check (0.5) and the kit (2.0), so the mode now rides in the body and the route checks the cost that request will actually incur. It reads the balance through `checkCreditBalance` and never deducts, so no deduction logic moved. A finished kit reopens through this route and charges nothing, so that case skips the check. Anything else fails closed with a 402 that names the price and the balance.
- **The copy was wrong either way.** The 403 line said "Checking a fit needs an account with credits" when the route's only 403 is the plan gate. It says what it means now.
- **Measured before the change:** 16 generation rows on the remote database, and all five that are not succeeded belong to one free test account holding 1 credit. Nobody had hit it.
- **Where:** `src/app/api/job-feed/apply/route.ts`, `src/components/job-feed/feed-actions.ts`, `src/components/job-feed/feed-handoff.ts`.

### Extra SerpAPI passes have no budget of their own
- **UI today:** nothing visible.
- **Missing:** the sweep fixed the overrun by making the pagination and fallback passes draw from one shared per-tier budget. In practice the main plan usually fills that budget, so those two passes now rarely fire. Keeping them would need an explicit `maxExtraQueries` per tier.
- **Where:** `src/lib/job-feed/ingestion.ts`, `src/lib/job-feed/constants.ts`.
- **Needs:** Wasim's approval either way, since `constants.ts` requires explicit sign-off on anything that raises the daily query count. Up to three extra calls a day on Max.
