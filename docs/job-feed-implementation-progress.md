# Job Feed Backend Improvements — Implementation Progress

Started: 2026-04-24

## Phase 1 — Data Foundation (CV → Settings + Skills)
- [x] Add `user_skills` column to `job_feed_settings` (migration)
- [x] Create `extractJobFeedSuggestionsFromCV()` → `GET /api/job-feed/settings/suggest`
- [x] Update `normalizeJobFeedSettingsInput` for `user_skills`
- [x] Update settings PUT to persist `user_skills`
- [x] Add `JobFeedSettingsSuggestion` type

## Phase 2 — Skills-Aware Pipeline
- [x] Add `skillOverlapScore` to prefilter scoring (up to 12 points)
- [x] Overhaul ranking system prompt (priority: skills > role > location > seniority > salary > freshness)
- [x] Pass `user_skills` through ranking prompt (`userProfile.userSkills`)
- [x] Add `skillOverlapScore` to score breakdown type

## Phase 3 — Plan-Based Feed & Pipeline Limits
- [x] Remove all `pro` plan references (constants.ts, settings route)
- [x] Add `JOB_FEED_TIER_LIMITS` (plus: 2q/20raw/10cap/5vis, max: 4q/40raw/15cap/10vis)
- [x] Update ingestion to accept `maxQueries` + `maxRawJobs` params
- [x] Update prefilter to accept `hardCap` param
- [x] Update ranking with `visibleCap` param (prompt + validation + slicing)
- [x] Wire tier limits through `runJobFeedFoundationWorkflow`
- [x] Add `feedCap` to `JobFeedOverviewResponse`
- [x] Update overview API route to include `feedCap`

## Phase 4 — Azure OpenAI Migration
- [x] Switch `openai-ranking.ts` from `OpenAI` to `AzureOpenAI` client
- [x] Delete `batch-ranking.ts` (removed batch mode — real-time only via Azure)
- [x] Simplify Inngest `job-feed.ts` (removed polling loop, single-step workflow)
- [x] Remove batch functions from `server.ts`
- [x] Remove `useBatchRanking` from Inngest client types
- [x] Update `hasOpenAICredentials` for Azure env vars

## Phase 5 — PostHog Analytics + UX
- [x] Add `job_feed_feedback` PostHog event (feedback route)
- [x] Add `job_feed_applied` PostHog event (apply route)
- [x] Add aggressiveness descriptions to constants (Strict/Balanced/Broad tooltips)

## Phase 6 — Frontend Changes
- [ ] Settings page: "Take from my CV" button + skill editing (uses `GET /api/job-feed/settings/suggest`)
- [ ] Aggressiveness tooltip/description display (data ready in constants)
- [ ] Feed cap awareness in UI (data ready in overview response)

## Final
- [x] SQL migration file created (`supabase/migrations/job_feed_add_user_skills.sql`)
- [x] TypeScript verification — `npx tsc --noEmit` = 0 errors
- [x] ESLint verification — 0 errors (1 expected unused-var warning)

## Ranking model (superseded 19 Aug 2026)
Azure OpenAI was retired. Ranking runs on Workers AI via the `AI` binding
(`src/lib/job-feed/workers-ai-ranking.ts`). Models are wrangler vars:
`JOB_FEED_RANKING_MODEL` (default `@cf/openai/gpt-oss-120b`) and
`JOB_FEED_RANKING_FALLBACK_MODEL` (default `@cf/deepseek-ai/deepseek-v4-flash-0731`),
then deterministic ordering. No API key needed.

## Files Changed
| File | Change |
|------|--------|
| `src/lib/supabase/types.ts` | Added `user_skills: string[]` to job_feed_settings |
| `src/lib/job-feed/types.ts` | Added `user_skills`, `JobFeedSettingsSuggestion`, `feedCap`, `skillOverlapScore` |
| `src/lib/job-feed/constants.ts` | Removed `pro`, added tier limits, aggressiveness descriptions |
| `src/lib/job-feed/helpers.ts` | Added `user_skills` to defaults, normalization, input creation |
| `src/lib/job-feed/prefilter.ts` | Added `skillOverlapScore`, configurable `hardCap` |
| `src/lib/job-feed/openai-ranking.ts` | Azure client, new skills-first system prompt, `visibleCap` |
| `src/lib/job-feed/ranking.ts` | Pass-through `visibleCap` |
| `src/lib/job-feed/ingestion.ts` | Configurable `maxQueries` + `maxRawJobs` |
| `src/lib/job-feed/server.ts` | Tier lookup, removed batch functions, tier-aware pipeline |
| `src/inngest/client.ts` | Removed `useBatchRanking` |
| `src/inngest/job-feed.ts` | Simplified to single-step (no batch polling) |
| `src/app/api/job-feed/settings/route.ts` | Persist `user_skills`, removed `pro` |
| `src/app/api/job-feed/settings/suggest/route.ts` | **NEW** — CV-based settings suggestions |
| `src/app/api/job-feed/overview/route.ts` | Added `feedCap` to response |
| `src/app/api/job-feed/feedback/route.ts` | PostHog `job_feed_feedback` event |
| `src/app/api/job-feed/apply/route.ts` | PostHog `job_feed_applied` event |
| `src/components/job-feed/preview-utils.ts` | Added `feedCap` + `user_skills` to mocks |
| `src/lib/job-feed/batch-ranking.ts` | **DELETED** |
| `supabase/migrations/job_feed_add_user_skills.sql` | **NEW** |
