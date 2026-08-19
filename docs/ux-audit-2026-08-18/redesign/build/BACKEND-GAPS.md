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

### Cover letter "Updated just now" has no stored timestamp
- **UI today:** the cover letter toolbar shows "<n> words", and "Updated just now · <n> words" only after the letter changed while the tab was open.
- **Missing:** per-document `updatedAt` on the session (`coverLetter`, `email`, `followUpEmail`, `optimizedCVData`), so a reload cannot say when the letter last changed.
- **Where:** `src/components/CoverLetterPanel.tsx`, `src/store/useSessionStore.ts`, `src/hooks/useSupabaseSync.ts`.
- **Needs:** timestamps written by the generation and regenerate paths, persisted in the session row (JSON fields carry it without a schema change). Small.

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

### "Add Berlin" is understood but never saved
- **UI today:** `detectFeedIntent` recognises "add Berlin" and the assistant confirms "Berlin is in the search now." The city is added to `target_cities` on the settings payload.
- **Missing:** a city outside the saved `target_countries` is searched in the wrong market, and nothing maps a city name to a country. `JOB_FEED_CITY_SUGGESTIONS` in constants.ts is a per-country list, not a reverse index, and the settings route does not validate that a city belongs to a selected country.
- **Where:** `src/lib/job-feed/rerank-intent.ts`, `src/app/api/job-feed/settings/route.ts`, `src/lib/job-feed/constants.ts`.
- **Needs:** a city-to-country lookup (reverse `JOB_FEED_CITY_SUGGESTIONS` plus a fallback), and the settings route adding the country when a city implies one. Small.

### The free tier cannot say how many roles it is hiding
- **UI today:** J7's line reads "You're seeing your top 5 today. Plus shows every role that matched, searches more sources and lets you steer the feed." The artboard says "9 more roles matched today."
- **Missing:** the overview route caps both `jobs` and `jobsTotalCount` at the free tier's `visibleCount` before the client sees them, so the client cannot know the uncapped number.
- **Where:** `src/app/api/job-feed/overview/route.ts` (`visibleCap`, `totalCount`), UI `src/components/job-feed/FeedCanvas.tsx`.
- **Needs:** return the uncapped count as a separate field (e.g. `jobsMatchedCount`) while keeping the item list capped. Small.

### "Why it's a match" is empty on saved jobs
- **UI today:** the job detail shows "Why it's a match" from `matchReason`, which this batch threaded through from `job_feed_ranked_items.reason`. The section is hidden when there is no reason.
- **Missing:** `listSavedJobFeedItemsAdmin` builds its items straight from the feedback rows and the canonical jobs, with no ranked-item join, so every job opened from the Saved tab has `matchReason: null`. The same is true for any job whose run has aged out of the 7-day window.
- **Where:** `src/lib/job-feed/server.ts` (`listSavedJobFeedItemsAdmin`, `toFeedItem`).
- **Needs:** join the most recent `job_feed_ranked_items` row per canonical job in the saved query. Small.

### Check fit from a card cannot price against the balance
- **UI today:** every card carries a gold "Check fit · 0.5" and the detail carries "Check fit · 0.5 credits" with "Skip the check, generate the kit (2 credits)". The price is on the control before the click, but a user who cannot afford it still sees the same control and only learns after the click (the chat then says what the server said, and nothing is charged).
- **Missing:** the feed does not read the credit balance, so a short balance cannot turn the control into the upgrade path the way `ChatPanel` does with `useCreditsBalance`. Doing it per card would also mean the balance drives 20 controls at once.
- **Where:** UI `src/components/job-feed/FeedJobCard.tsx`, `src/components/job-feed/FeedJobDetail.tsx`; existing pattern `src/hooks/useCreditsBalance.ts`, `src/components/ChatPanel.tsx`.
- **Needs:** decide whether the feed reads the balance (one fetch, gate all cards) or whether the price on the control plus a clean 402 is enough. Ties into the batch 2 gap "Unknown credit balance still shows the priced chip". Small once decided.

### The feed conversation is not persisted anywhere
- **UI today:** the feed's opening message is derived from the overview on every load, so a reload always shows today's real feed. Anything the user typed or picked afterwards (the steering exchange) lives in `useFeedStore`, which is deliberately not persisted, and is gone after a reload.
- **Missing:** no store or table for feed conversation turns. Application conversations persist via `chat_messages`; the feed has no equivalent.
- **Where:** `src/store/useFeedStore.ts` (`thread`), `src/hooks/useSupabaseSync.ts`.
- **Needs:** a decision first. A daily feed arguably should reset each morning; if the exchange should survive a reload, it needs a table or a day-keyed localStorage entry. Small.


## Found in batch 4 (tracker + settings)

_Add here._

## Found in batch 5 (auth + marketing)

_Add here._
