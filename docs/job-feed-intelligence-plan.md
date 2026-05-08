# Job Feed Intelligence Plan

> Plan for making the Daily Job Feed pipeline materially smarter. Based on a code audit of `src/lib/job-feed/**`, `src/app/api/parse-cv/**`, and `src/app/api/job-feed/**` performed on 2026-05-08.
>
> **Scope:** AI-generated semantic profile (A), intelligent keyword strategy (B), query construction & API parameter optimization (C), settings UX rework (D).
>
> **Sequencing:** A → B → C → D. A is the foundation everything else reads from. D ships last; backward compatibility for current paid users is **not** a concern (small user base; they can re-run setup).

---

## 1. Current state (the problem)

### 1.1 CV parsing (literal-only)
- `src/app/api/parse-cv/route.ts:34` — `POST /api/parse-cv`.
- `src/app/api/parse-cv/route.ts:555` — `parseWithAI` calls Claude with system prompt: *"You are a precise CV parser. Extract factual information only. Do not infer or fabricate."*
- Output: `StructuredCV` (`src/lib/types/cv-schema.ts`). Persisted in `documents.structured_data` (jsonb) where `type='primary_cv'`.
- **No semantic synthesis happens here, by design** (this is correct for the CV writer / fit assessment / cover letter / email agents to prevent hallucination).

### 1.2 CV → job-feed bridge (deterministic, brittle)
- `src/lib/job-feed/cv-suggestions.ts:19` — `extractJobFeedSuggestionsFromCV()`. Pure regex + lookup. Not AI.
- `target_roles`: `cv.personal.currentTitle` + `cv.experience[0].position`, split on `|`/`/`/`&`/etc., looked up against a hardcoded `ROLE_VARIANTS` map (~50 titles, line 135).
- `target_countries`: hardcoded country alias table (line 73).
- `user_skills`: flat dedupe of every category, capped at 50.
- `seniority_target`: regex on title, fallback to total experience years.
- Cached in `user_cv_suggestions` table (`supabase/migrations/202604270001_job_feed_production_readiness.sql:244`) as a single jsonb `suggestion` blob.

### 1.3 Settings + persistence
- `src/components/job-feed/JobFeedPanel.tsx:1706` — `JobFeedOnboardingWizard`, four steps. Auto-prefills empty fields once via `/api/job-feed/settings/suggest`.
- `src/app/api/job-feed/settings/route.ts:43` — `PUT` writes to `job_feed_settings`.
- **Dead settings:** `adjacent_roles_enabled` is hardcoded to `false` on every save (line 119). `aggressiveness` is stored but the search planner never reads it — it only appears in `query_context` metadata and inside the LLM ranker payload, where the prompt does not branch on it.

### 1.4 Search plan & SerpAPI
- `src/lib/job-feed/ingestion.ts:47` — `buildJobFeedSearchPlan()`. Iterates `target_roles × target_countries`, capped at `maxDailyQueries` (Plus: 2; Max: 4 — `constants.ts:33`).
- `plan.push({ query: role, ... })` (line 81) — **the role string IS the SerpAPI `q` parameter, verbatim, with no skill blending, no synonyms, no localization**.
- `src/lib/job-feed/serpapi.ts:242` — `buildSerpApiSearchParams`. Sets `engine`, `q`, `gl`, `google_domain`, `hl`, `location`. Accepts `filters` (the `uds` filter chip) and `nextPageToken`, but `ingestion.ts:238` always passes `request_filters: []` and never paginates.
- Calls run sequentially in a `for` loop (`ingestion.ts:203`), not in parallel.

### 1.5 Prefilter & ranking
- `src/lib/job-feed/prefilter.ts:33` — hard-rejects only on three explicit constraints (employment-type mismatch, max-salary below floor, sponsorship language).
- `src/lib/job-feed/openai-ranking.ts:152` — `rankWithOpenAI()`. Azure gpt-4.1-mini. The `userProfile` block sent to the model (line 274) is just settings + skills + `yearsExperience` (the only AI-inferred signal in the whole pipeline, computed deterministically at `cv-suggestions.ts:250`).

### 1.6 Where the pipeline is naive or lossy
- No point in the pipeline asks "given this CV, what is this person actually qualified for and what should we search for."
- Title-only queries: a Python-strong "Data Engineer" candidate gets identical SerpAPI calls as a Scala-strong one.
- 2–4 query budget consumed entirely on `role × country`. No long-tail or skill-blended query.
- `uds` filter chips unused (no `date_posted=week` bias on freshness).
- Non-English markets get the user's English title verbatim as `q`, despite `hl` being the local language.
- `aggressiveness` and `adjacent_roles_enabled` are dead UI surface area.

---

## 2. Plan A — AI-generated semantic career profile

### 2.1 What changes
After CV parse, run a **second AI synthesis pass** on the already-saved `StructuredCV` JSON (no PDF re-tokenization). Output is a structured "career profile" persisted in a **new table** that only the job feed pipeline reads.

### 2.2 Key constraint (anti-hallucination boundary)
- The CV writer, fit-assessment, cover letter, and email agents **must not** read the new profile table. They keep reading `documents.structured_data` (the literal `StructuredCV`). This preserves the existing anti-hallucination guarantee for application kit generation.
- The career profile is read **only** by:
  - The job feed search planner (`buildJobFeedSearchPlan`)
  - The keyword strategy generator (Plan B)
  - The LLM ranker (`rankWithOpenAI`)

### 2.3 Profile schema (jsonb)
```ts
interface CareerProfile {
  version: 1;
  generatedAt: string; // ISO timestamp
  sourceDocumentId: string; // primary_cv document id used to generate this
  sourceDocumentUpdatedAt: string;

  // Inferred canonical job titles, market-normalized, ranked by recency-and-fit.
  inferredTitles: Array<{
    canonical: string; // e.g. "Senior Frontend Engineer"
    confidence: 'high' | 'medium' | 'low';
    rationale: string; // short explanation pointing to evidence in the CV
  }>;

  // Function/discipline (engineering, product, design, growth, sales, ops, ...).
  function: string;

  // Inferred seniority with rationale.
  seniority: {
    level: 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'staff' | 'principal' | 'manager' | 'director' | 'vp';
    confidence: 'high' | 'medium' | 'low';
    rationale: string;
  };

  yearsTotal: number; // total professional years
  yearsInFunction: number; // years in current function

  // Primary skill clusters: the things the candidate is genuinely strong in.
  primarySkillClusters: Array<{
    name: string; // e.g. "modern web frontend"
    skills: string[]; // canonical skill names
    evidenceStrength: 'strong' | 'moderate' | 'mentioned';
  }>;
  secondarySkillClusters: Array<{
    name: string;
    skills: string[];
    evidenceStrength: 'strong' | 'moderate' | 'mentioned';
  }>;

  // Industry domains the candidate has actually worked in.
  industryDomains: string[]; // e.g. ["fintech", "consumer-saas"]

  // Tools / stack / cloud / environment.
  toolsEnvironment: string[];

  // Working languages (distinct from spoken languages — what they ship in).
  workingLanguages: string[];

  // Free-text narrative the ranker can use as a soft prior.
  narrative: string; // ~3-5 sentences

  // Negative signals — what the candidate is clearly NOT looking for.
  // (e.g. "Sales Engineer", "DevOps", "QA") — derived from absence of evidence
  // plus the candidate's apparent trajectory.
  negativeSignals: string[];
}
```

### 2.4 Storage
- New Supabase table: `user_career_profiles`.
- Columns: `user_id` (PK, FK → `profiles.id`, on delete cascade), `profile` (jsonb), `version` (int, default 1), `source_document_id` (uuid, FK → `documents.id` nullable), `source_document_updated_at` (timestamptz), `created_at`, `updated_at`.
- RLS: `auth.uid() = user_id` for all operations.
- One row per user. Upsert on `user_id`.
- Migration filename: `add_user_career_profiles.sql` (use existing migrations dir convention).

### 2.5 Generation trigger
1. **First time:** when a paid user opens the job feed wizard for the first time, OR when the `cv-suggestions` cache is regenerated, fire-and-forget call to a new `POST /api/job-feed/career-profile/generate`.
2. **CV change:** when the `cvNewerThanCache` banner already triggers in `JobFeedOnboardingWizard.useEffect` (`JobFeedPanel.tsx:1796`), also invalidate the profile and regenerate.
3. **Manual refresh:** "Refresh from my CV" button regenerates both suggestion AND profile.
4. **Plan gate:** only `plus` and `max` users get the AI profile. Free users keep using `extractJobFeedSuggestionsFromCV` (deterministic). Reuses existing `canAccessJobFeed` helper.

### 2.6 Implementation
- New file: `src/lib/job-feed/career-profile.ts` — `generateCareerProfile(cv: StructuredCV): Promise<CareerProfile>`.
- Uses Anthropic Claude (Bedrock in prod, direct API in dev — same provider config as parse-cv).
- Model: Claude Sonnet 4.6. Reasoning is the work; small Haiku-class models will fail at the synthesis quality bar.
- Temperature: 0.4 (some inferential leeway; not zero).
- `max_tokens`: 2500.
- Prompt caching: the system prompt is identical across all users → cache prefix.
- New API route: `src/app/api/job-feed/career-profile/route.ts` (`POST` to generate, `GET` to fetch existing). Auth + paid-tier gate + rate limit.
- Update `JobFeedOnboardingWizard` to call the generator on first open for paid users.
- Update `rankWithOpenAI` to accept the profile and include it in the `userProfile` block sent to the ranker (replacing or augmenting today's `userSkills` / `yearsExperience`).

### 2.7 Synthesis prompt outline
```
You are a career-profile synthesizer for an AI job-search assistant.
Given a candidate's structured CV, infer a concise structured profile that
will be used to (1) generate effective job-search keywords and (2) rank
candidate jobs against this person.

ANTI-HALLUCINATION RULES:
- Every cluster, title, and signal must trace to evidence in the CV
  (an experience bullet, a skill, an education entry, a project).
- If a signal is weak, mark its confidence as "low" — do NOT omit honesty.
- If a CV is too thin to support a confident inference, return the field
  with confidence: "low" and a rationale that says so.
- Do not invent companies, skills, dates, or accomplishments.

[full schema spec ...]
[expected JSON output ...]
```

---

## 3. Plan B — Intelligent keyword strategy

### 3.1 What changes
A **second AI pass** that takes the career profile + the user's `target_countries` and produces a `SearchStrategy`: short-tail queries (recall), long-tail queries (precision via skill blending), localized variants per market, and negative terms.

### 3.2 Strategy schema
```ts
interface SearchStrategy {
  version: 1;
  generatedAt: string;
  sourceProfileGeneratedAt: string;

  queries: Array<{
    type: 'short_tail' | 'long_tail' | 'localized';
    query: string; // raw SerpAPI q value
    targetCountry: string; // ISO alpha-2
    rationale: string; // for debugging + UX preview
    expectedRecall: 'high' | 'medium' | 'low';
    fallbackTo: string | null; // index into queries[] to retry with on zero results
  }>;

  negativeTerms: string[]; // for client-side reranking (downweight matches)
}
```

### 3.3 Localization
Per-country query localization handled inside the strategy generator:
- `de` / `at` / `ch (de)` → "Software Engineer" → "Softwareentwickler"
- `fr` / `be (fr)` → "Software Engineer" → "Ingénieur Logiciel"
- `es` → "Ingeniero de Software"
- `it` → "Ingegnere del Software"
- `nl` → "Softwareontwikkelaar"
- The model must output the localized query, not English fallbacks, when the target country is non-English.

### 3.4 Storage
- New table: `user_search_strategies` (or jsonb column on `user_career_profiles`).
- Decision: **separate table**, keyed by `(user_id, settings_hash)` so a strategy is regenerated when settings change (different countries → different localization).
- Columns: `user_id` (FK), `settings_hash` (text), `strategy` (jsonb), `created_at`, `updated_at`.
- Migration: `add_user_search_strategies.sql`.

### 3.5 Generation trigger
- On first feed run after profile generation.
- On settings change that affects `target_countries`, `target_roles`, or `seniority_targets`.
- On profile regeneration.
- TTL: invalidate after 30 days even if nothing changed (markets shift).

### 3.6 Implementation
- New file: `src/lib/job-feed/search-strategy.ts` — `generateSearchStrategy(profile: CareerProfile, settings: JobFeedSettings): Promise<SearchStrategy>`.
- Model: Claude Sonnet 4.6 (same reasoning bar as the profile).
- Replaces `buildJobFeedSearchPlan`'s naive role × country expansion with a strategy-aware planner: pull `queries` from the strategy, rank by `expectedRecall`, fit them inside the daily query budget, mix one short-tail + one long-tail per country (Max tier), short-tail only on Plus tier.
- Negative terms applied client-side as a deterministic rerank score adjustment in `prepareJobFeedRankingCandidates` (`prefilter.ts:83`).
- **Fallback chain (mandatory):** any long-tail query returning zero results auto-retries with its `fallbackTo` query in the same run, before consuming budget on the next country. Without this, recommendation B alone risks degrading the feed for atypical users.

---

## 4. Plan C — Query construction & API parameter optimization

### 4.1 Parallelize SerpAPI calls
- Today: `for (const planItem of searchPlan)` (`ingestion.ts:203`) → sequential.
- Change: `Promise.all` over the plan (or a `Promise.allSettled` to keep partial results when one query fails).
- Watch for: SerpAPI rate-limit headers; cap concurrency at 4 (matches Max tier max queries).

### 4.2 `uds` filter chip for freshness
- Pass `uds=` value for `date_posted=week` on at least one query per run.
- The `uds` codes are returned dynamically in the SerpAPI `filters` array; not hardcoded. First run can fetch unfiltered, parse the returned filter group ("Date posted"), find the chip whose label matches "Past week" / "Past 3 days", store its `uds` token in a small cache table `serpapi_filter_tokens` keyed by `(country_code, filter_name)` so we don't re-discover it on every run.
- Skip this for low-volume markets where filtering would empty the result set (e.g. `nz`, `ie`).

### 4.3 Pagination on thin results
- After the first SerpAPI page, if `jobs_results.length < 10` AND total budget not exhausted, call `nextPageToken` once.
- Hard cap: at most 1 extra page per query. Pagination is paid; opportunistic only.

### 4.4 Don't add a deterministic pre-rerank
- The audit recommended this and we are skipping it. Current ranker (gpt-4.1-mini, prefilter scoring already feeds it `deterministicScore`) is sufficient. Adding a second deterministic stage creates two scoring paths that can disagree, costing debug time without clear payoff.

---

## 5. Plan D — Settings UX rework (last)

### 5.1 New flow
- Step 1 (new): "Confirm your search profile" — read-only chips for inferred titles, seniority, primary skill clusters, function, working languages. Each chip is editable on click.
- Step 2 (new): "Where & when" — `target_countries`, `target_cities`, `remote_preferences`, `delivery_hour_local`, `user_timezone`. (User-controlled constraints only.)
- Step 3 (new): "Filters" — `salary_floor`, `employment_types`, `work_authorization_status`. (Hard constraints.)
- Step 4 (new): "How we'll search" — preview of the AI-generated keyword strategy. User can veto a long-tail query they don't want associated with their search.

### 5.2 Removals
- **Delete `aggressiveness`** from UI, settings input, DB column, and ranker payload. It does nothing today.
- **Delete `adjacent_roles_enabled` and `adjacent_roles`** from UI, settings input, DB column. The PUT route hardcodes `enabled=false` so this surface is misleading.
- Migration: `drop_dead_job_feed_settings.sql`. **This is breaking** but small user base + paid users can re-run setup.

### 5.3 What user still controls manually
- `target_countries`, `target_cities`
- `remote_preferences`
- `salary_floor`
- `employment_types`
- `work_authorization_status`
- `delivery_hour_local`, `user_timezone`
- (Editable but AI-defaulted: `target_roles`, `user_skills`, `seniority_target`, `languages`)

---

## 6. Cost & token analysis

### 6.1 Plan A (career profile)
- Trigger frequency: ~once per CV upload + one per master-CV change. For an active paid user, ~1–3 times per month.
- Input tokens: ~2,500 (a typical `StructuredCV` JSON is ~6–10 KB).
- Output tokens: ~1,500 (the profile schema).
- Sonnet 4.6 via Bedrock: ~$0.003 input + ~$0.022 output ≈ **~$0.025 per generation**.
- Prompt caching: the static system prompt (~1,500 tokens) hits cache → reduces effective input cost. Cached at 0.1× rate = saves ~$0.001 per call after first.
- **Monthly impact at 1,000 paid users × 2 generations = ~$50/month.** Negligible.

### 6.2 Plan B (search strategy)
- Trigger frequency: on profile regen + on settings change to countries/roles/seniority. ~2–4 times per month per active user.
- Input tokens: ~1,200 (profile + settings).
- Output tokens: ~800.
- ~$0.002 per generation.
- **Monthly impact at 1,000 paid users × 4 generations = ~$8/month.** Negligible.

### 6.3 Plan C
- No new model calls. Possible cost change: opportunistic pagination adds at most one extra SerpAPI request per thin-result query. Estimate +10–20% of base SerpAPI cost in worst case.
- Net token impact: zero.

### 6.4 Plan D
- No model calls.

### 6.5 Latency
- Plan A adds ~3–5s to first wizard open for paid users. Mitigation: trigger in background after CV upload (before user reaches the wizard). Treat the cached profile as the fast path.
- Plan B adds ~2–3s to first feed run after a settings change. Mitigation: pre-generate when settings save completes; show the user the strategy preview while they wait (Step 4 of the new wizard).
- Plan C: parallelization **reduces** ingestion latency by ~3× (4 sequential calls @ 2s each → 4 parallel @ 2s).

### 6.6 Quality > cost trade-off (per CLAUDE.md)
The product priority is **quality > speed > cost**. All four plans together add ~$60/month at 1,000 paid users — well below the threshold where cost should override feature quality. Proceed.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Synthesis pass leaks invented facts into application kit (CV writer, cover letter) | New table is read-only by job feed surface area. Add a TypeScript-level boundary: `CareerProfile` type lives in `src/lib/job-feed/career-profile.ts` and is never imported by `src/lib/agents/**`. Lint rule or grep guard in CI optional. |
| Long-tail queries return zero results | Mandatory `fallbackTo` short-tail in same run. Tracked in run diagnostics. |
| Localization produces unsearchable strings | Keep an English fallback in the strategy. Telemetry: log zero-result queries by country to catch bad localizations. |
| Profile regeneration on every CV save creates expensive churn | `source_document_updated_at` check before regeneration; skip if unchanged. |
| Paid-tier divergence (free users get worse feed) | Free users still get the deterministic suggestion path. The job feed itself is paid-only, so no free-user regression. |
| Removing `aggressiveness` and `adjacent_roles` is breaking | Small user base, paid users can re-run setup. Drop columns in the same migration that ships the new wizard. |

---

## 8. Sequencing & milestones

### Milestone A1 — Profile schema + table
1. Write migration `add_user_career_profiles.sql` (table + RLS).
2. Add TypeScript types in `src/lib/job-feed/career-profile.ts` (`CareerProfile` interface).
3. **Confirm migration with user before running.** (Per CLAUDE.md schema rule.)

### Milestone A2 — Synthesis function
1. Implement `generateCareerProfile(cv: StructuredCV): Promise<CareerProfile>` using Claude Sonnet 4.6 + Bedrock.
2. Anti-hallucination prompt with explicit "every signal traces to evidence" rule.
3. Unit-test against 3–5 real CVs (atypical titles, composite roles, junior, senior, non-English).

### Milestone A3 — API route + trigger
1. New route `src/app/api/job-feed/career-profile/route.ts` (`GET`, `POST`).
2. Wire into `JobFeedOnboardingWizard`: fire-and-forget on first open for paid users.
3. Wire into `cvNewerThanCache` flow in the wizard: invalidate + regenerate.
4. Wire into `rankWithOpenAI`: send profile to Azure ranker.

### Milestone B1 — Search strategy generator
1. Migration `add_user_search_strategies.sql`. **Confirm before running.**
2. Implement `generateSearchStrategy(profile, settings)` in `src/lib/job-feed/search-strategy.ts`.
3. Prompt with localization rules per country.

### Milestone B2 — Replace search planner
1. Update `buildJobFeedSearchPlan` to read from `user_search_strategies` instead of `target_roles × target_countries`.
2. Implement `fallbackTo` chain on zero-result long-tail queries.
3. Settings-change invalidation hook.

### Milestone C1 — Parallelize SerpAPI
1. Convert the `for` loop in `ingestion.ts:203` to `Promise.allSettled`.
2. Cap concurrency at 4.

### Milestone C2 — `uds` freshness filter
1. New table `serpapi_filter_tokens`. **Confirm migration before running.**
2. First-pass discovery: parse SerpAPI `filters` array, find the "Past week" chip, cache its `uds` token by country.
3. Pass `filters: [token]` on at least one query per run.

### Milestone C3 — Opportunistic pagination
1. After first page, if `< 10` results and budget left, call `nextPageToken` once.
2. Hard cap: 1 extra page per query.

### Milestone D — Wizard rework
1. New 4-step wizard (`Confirm profile`, `Where & when`, `Filters`, `How we'll search`).
2. Migration `drop_dead_job_feed_settings.sql` (drop `aggressiveness`, `adjacent_roles_enabled`, `adjacent_roles`). **Confirm migration before running.**
3. Strip the dead fields from `JobFeedSettingsInput`, `helpers.ts` normalizer, `openai-ranking.ts` userProfile.

---

## 9. Open questions to revisit during implementation

- Should the career profile be exposed to the user (read-only "your profile" panel on the dashboard)? Probably yes — builds trust in the AI's read of the CV. Defer until after Milestone A3.
- Should free users get a slimmer profile (Haiku 4.5 instead of Sonnet 4.6) or stick with the deterministic path? Defer until A is shipped and we can measure quality.
- Should we A/B test the new search planner against the old one for the first week? Worth doing — compare `feedback.applied` rate by ranking source.

---

*Last updated: 2026-05-08. Owner: job-feed-specialist agent + Wasim.*

---

## 10. Implementation status (2026-05-08)

| Milestone | Status | Notes |
|-----------|--------|-------|
| A1 — Career profile schema + table | shipped | `supabase/migrations/202605080001_add_user_career_profiles.sql`. RLS via `auth.uid() = user_id`. |
| A2 — Synthesis function + prompt | shipped | `src/lib/job-feed/career-profile-synthesis.ts`. Sonnet 4.6 + jsonMode + cacheable system block. Strict evidence-tracing rules in prompt. |
| A3 — API route + wizard trigger + ranker integration | shipped | `src/app/api/job-feed/career-profile/route.ts` (GET + POST). Wizard fires-and-forgets POST on first open and on "Refresh from my CV" with `force: true`. `getUserCareerProfileAdmin` in `server.ts`; ranker now reads `inferredProfile` block. |
| B1 — Search strategy table + generator | shipped | `supabase/migrations/202605080002_add_user_search_strategies.sql`. `src/lib/job-feed/search-strategy.ts`. Per-country localization (DE/FR/ES/IT/NL/PT/PL). `computeSettingsHash` keys cache by material settings. |
| B2 — Strategy-aware planner + fallback chain | shipped | `buildJobFeedSearchPlanFromStrategy` selects queries; `loadOrGenerateSearchStrategyAdmin` resolves cache vs. regen. Fallback pass triggers on zero-result long-tails (capped by `JOB_FEED_FALLBACK_BUDGET = 1`). |
| C1 — Parallelize SerpAPI calls | shipped | Main pass uses `Promise.allSettled`. Per-call cap via `Math.ceil(maxRawJobs / planSize)` so over-fetch is impossible. Fallback + pagination passes stay sequential because they depend on main-pass results. |
| C2 — `uds` freshness filter chip | shipped | `supabase/migrations/202605080003_add_serpapi_filter_tokens.sql`. `src/lib/job-feed/filter-tokens.ts`. Discovery on every response, application on subsequent runs. Skips low-volume markets (`FILTER_CHIP_DISABLED_MARKETS`). |
| C3 — Opportunistic pagination | shipped | After main pass, page-2 retries fire when `mainCount > 0 && mainCount < 5` (`JOB_FEED_THIN_RESULT_THRESHOLD`). Capped by `JOB_FEED_PAGINATION_BUDGET = 2`. Pagination preserves the same filter the page-1 call used. |
| D1 — Drop dead settings fields | shipped | `supabase/migrations/202605080004_drop_dead_job_feed_settings.sql` drops `aggressiveness`, `adjacent_roles_enabled`, `adjacent_roles`. Removed across `helpers.ts`, `constants.ts`, `types.ts`, `JobFeedPanel.tsx`, `preview-utils.ts`, `openai-ranking.ts`, `ingestion.ts`, settings API route. `JobFeedSearchPlanItem.isAdjacentRole` also dropped (was always false). |
| D2 — Wizard rework | deferred | Mechanical work done; UI redesign of 4-step wizard (Confirm profile / Where & when / Filters / How we'll search) deserves its own focused design pass. Strategy preview will need a new `GET /api/job-feed/search-strategy` endpoint to feed Step 4. |

### Migrations to run (in order)

The user runs these manually in Supabase SQL Editor.

```
202605080001_add_user_career_profiles.sql        # ✅ already run
202605080002_add_user_search_strategies.sql      # pending
202605080003_add_serpapi_filter_tokens.sql       # pending
202605080004_drop_dead_job_feed_settings.sql     # pending
```

### Anti-hallucination boundary check

Verified at end of A+B+C+D1: `CareerProfile` and `SearchStrategy` types live in `src/lib/job-feed/`. Neither is imported from `src/lib/agents/**`. Application-kit generation (CV writer, fit assessment, cover letter, email) reads only `documents.structured_data`.

### What's left for D2

The new 4-step wizard requires:

1. **Step 1 — Confirm your search profile.** Fetch profile from `GET /api/job-feed/career-profile`, render inferred titles, seniority, primary skill clusters, function, working languages as editable chips. Each chip writes back to the profile via a `PATCH /api/job-feed/career-profile/edit-titles` style endpoint (or simpler: directly to the profile row's `inferred_titles` field, regenerating the strategy on edit).
2. **Step 2 — Where & when.** Restructure existing fields: `target_countries`, `target_cities`, `remote_preferences`, `delivery_hour_local`, `user_timezone`. Most of this already exists in the current wizard; just regroup.
3. **Step 3 — Filters.** `salary_floor`, `employment_types`, `work_authorization_status`. Mostly extracted from the existing wizard.
4. **Step 4 — How we'll search.** New `GET /api/job-feed/search-strategy` endpoint returning the cached strategy. Render queries[] grouped by country, with a per-query veto button that drops the query from the strategy and triggers a regeneration.

Suggested next step: run the remaining 3 migrations, smoke-test end-to-end with a real paid account (CV upload → wizard open → first feed run shows the new strategy in `result_summary`), then design D2 with the karko-ui-designer agent.

