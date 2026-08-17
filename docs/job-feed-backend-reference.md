# Job Feed Backend Reference

Last updated: 2026-04-24

This document explains the Job Feed backend system — what each piece does, how the flow works end-to-end, and what's needed to get it running.

---

## How It Works (The Big Picture)

The Job Feed runs **automatically in the background** once a day for each premium user. Here's the simplified flow:

1. **Every hour**, the system wakes up and checks: "Which users should get their feed right now?" (based on their chosen delivery time and timezone)
2. For each user who is due, it **searches for jobs** matching their preferences
3. It **filters out bad matches** (wrong location, wrong seniority, wrong salary, etc.)
4. It **ranks the survivors** using AI to find the best fits
5. It **saves the top 5-10 jobs** as the user's daily feed
6. The user opens Useful Apply and **sees their personalized job feed** ready to go

No manual searching needed — Useful Apply does the work overnight.

---

## The Pipeline (Step by Step)

### Step 1 — Settings (What the user wants)

**File:** `src/lib/job-feed/helpers.ts` + `src/app/api/job-feed/settings/route.ts`

The user configures their preferences once:
- Target roles (e.g., "Software Engineer", "Full Stack Engineer")
- Optional adjacent roles (e.g., "Frontend Developer")
- Preferred locations (e.g., "New York, NY", "Remote (US)")
- Remote preference (remote only, remote first, hybrid, onsite, flexible)
- Salary floor (minimum acceptable salary)
- Seniority target (junior, mid, senior, lead, staff, manager)
- Employment types (full-time, part-time, contract, etc.)
- Work authorization status (authorized, needs sponsorship, open to both)
- Market (US, Canada, or both) 
- Delivery hour (what time to generate the feed, in their timezone)
- Aggressiveness (strict = exact matches only, balanced = default, broad = cast a wider net)

### Step 2 — Scheduling (When to run)

**File:** `src/inngest/job-feed.ts` + `src/lib/job-feed/orchestration.ts`

An **hourly cron job** (via Inngest) triggers a "sweep" that:
1. Loads all users whose delivery hour matches the current hour in their timezone
2. Dispatches one background job per user
3. Runs data cleanup for old records

This means if a user sets delivery at 8 AM EST, the system triggers their feed run when it's 8 AM in their timezone.

**Inngest is the scheduler.** It handles retries, concurrency, and failure recovery. You need an Inngest account and the webhook pointed at `/api/inngest`.

### Step 3 — Ingestion (Finding jobs)

**File:** `src/lib/job-feed/ingestion.ts` + `src/lib/job-feed/serpapi.ts`

For each user run:
1. Builds a **search plan** from their settings — up to **4 queries** (target roles × countries)
2. Calls **SerpAPI** (Google Jobs scraper) for each query
3. Fetches up to **40 raw jobs total** across all queries
4. **Normalizes** each job (extracts salary, work mode, freshness, etc.)
5. **Deduplicates** jobs by a canonical key (same job posted on multiple boards = 1 entry)
6. **Upserts** into the `job_feed_canonical_jobs` table (a shared pool across all users)

The raw API responses are also saved for debugging (redacted after 14 days).

### Step 4 — Prefiltering (Removing bad matches)

**File:** `src/lib/job-feed/prefilter.ts`

The prefilter runs through all canonical jobs from the ingestion step and **rejects** jobs that clearly don't match:
- Wrong employment type (e.g., user wants full-time, job is internship)
- Wrong remote/location fit (e.g., user wants remote only, job is onsite)
- Salary below the user's floor
- "No sponsorship" when user needs sponsorship
- Seniority too far off (e.g., user is mid-level, job is for VP)

**Survivors get scored** (0-60+ points) based on:
- Role alignment (exact match = 28 pts, partial = less)
- Freshness (posted today = 15 pts, 1 week ago = 9 pts)
- Remote alignment (matches preference = 6-8 pts)
- Salary match (above floor = 5 pts)
- Location match (4 pts)

The **top 15 survivors** (hard cap) move to ranking.

### Step 5 — Ranking (AI picks the best)

**File:** `src/lib/job-feed/ranking.ts`

The shortlisted **up to 15 jobs** are sent to an LLM for intelligent ranking:
- The LLM sees the user's full profile + each job's details + the deterministic score
- It returns a decision for each job: **strong**, **good**, or **skip**
- Strong jobs lead the feed, good jobs fill it out, skipped jobs are dropped
- Maximum **10 jobs** can be surfaced

**If the LLM fails** (API error, invalid response, no credentials), the system falls back to **deterministic ranking** — the prefilter scores become the final ranks. The feed still works, just without the AI judgment layer.

**Current state:** The ranking currently routes through the main Claude Sonnet model. This is over-powered and expensive for this task. See "What Needs to Be Done" below.

### Step 6 — Feedback & Apply (User actions)

**File:** `src/lib/job-feed/server.ts` + `src/app/api/job-feed/feedback/route.ts` + `src/app/api/job-feed/apply/route.ts`

When the user interacts with their feed:
- **Opened** — user clicked to view job details
- **Saved** — user bookmarked the job
- **Dismissed** — user swiped away / not interested
- **Applied** — user clicked "Apply with Useful Apply" → creates an application session and hands off to the existing Useful Apply application workflow (CV optimization, cover letter, etc.)

### Step 7 — Cleanup (Data hygiene)

**File:** `src/lib/job-feed/cleanup.ts`

Runs once per hourly sweep:
- **After 14 days:** Redacts raw API response payloads (saves storage, keeps metadata)
- **After 30 days:** Compacts run metadata (strips large arrays, keeps diagnostic counts)

---

## The Numbers

| Stage | Count | What |
|-------|-------|------|
| Search queries per run | Up to 4 | Target roles × countries |
| Raw jobs fetched | Up to 40 | From SerpAPI across all queries |
| Prefilter survivors | Varies | Depends on how well jobs match settings |
| Shortlist to LLM | Up to 15 | Top scoring survivors (hard cap) |
| Final feed shown | 5-10 | After LLM ranking (max 10, default 5) |

---

## Database Tables (4 migrations)

| Table | Purpose |
|-------|---------|
| `job_feed_settings` | User preferences (roles, locations, salary, etc.) |
| `job_feed_runs` | One row per daily run — tracks status, timing, metadata |
| `job_feed_raw_fetches` | Raw SerpAPI responses per query (redacted after 14 days) |
| `job_feed_canonical_jobs` | Deduplicated global job pool (shared across users) |
| `job_feed_ranked_items` | Ranked jobs per run (the actual feed the user sees) |
| `job_feed_feedback` | User actions per job (opened, saved, dismissed, applied) |

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/job-feed/settings` | Read user's feed settings |
| PUT | `/api/job-feed/settings` | Save/update feed settings |
| GET | `/api/job-feed/overview` | Full feed state (settings + latest run + jobs) |
| POST | `/api/job-feed/feedback` | Record feedback (opened/saved/dismissed) |
| POST | `/api/job-feed/apply` | Start "Apply with Useful Apply" handoff |
| POST | `/api/job-feed/dev/run` | Manual trigger (debug mode only) |
| POST | `/api/job-feed/internal/scheduler` | Internal cron endpoint (secret-protected) |

All endpoints now have **rate limiting** and **generic error messages** (fixed in this session).

---

## Backend Files

| File | Purpose |
|------|---------|
| `src/lib/job-feed/types.ts` | TypeScript type definitions for the whole system |
| `src/lib/job-feed/constants.ts` | Configuration values (caps, limits, options, defaults) |
| `src/lib/job-feed/helpers.ts` | Validation, normalization, state machine |
| `src/lib/job-feed/serpapi.ts` | SerpAPI client, job normalization, salary parsing |
| `src/lib/job-feed/ingestion.ts` | Search plan building, fetching, deduplication, upsert |
| `src/lib/job-feed/prefilter.ts` | Filter bad matches, score survivors, prepare shortlist |
| `src/lib/job-feed/ranking.ts` | LLM ranking with deterministic fallback |
| `src/lib/job-feed/orchestration.ts` | Inngest event dispatching |
| `src/lib/job-feed/cleanup.ts` | Data retention (redact old payloads, compact metadata) |
| `src/lib/job-feed/server.ts` | Core workflow, data access, feed materialization |
| `src/inngest/job-feed.ts` | Inngest function definitions (cron, sweep, per-user run) |
| `src/inngest/client.ts` | Inngest client + event type definitions |

---

## Environment Variables Required

```
# Required — job search provider
SERPAPI_API_KEY=your_serpapi_key

# Required — protects the internal scheduler endpoint
JOB_FEED_INTERNAL_SECRET=any_random_secret_string

# Required — Inngest for background scheduling
INNGEST_EVENT_KEY=your_inngest_event_key
INNGEST_SIGNING_KEY=your_inngest_signing_key

# Required — LLM for ranking (currently uses main Claude model, will switch to OpenAI)
OPENAI_API_KEY=your_openai_key  # (not yet wired — see "What Needs to Be Done")
```

---

## What's Complete

- Settings CRUD with full validation
- Inngest hourly cron + per-user dispatch
- SerpAPI ingestion + canonical job deduplication
- Deterministic prefiltering + scoring
- LLM ranking with deterministic fallback
- Ranked items materialization
- Feedback tracking (opened/saved/dismissed/applied)
- Apply handoff to Useful Apply application sessions
- Data cleanup (14-day payload redaction, 30-day metadata compaction)
- All SQL migrations
- Rate limiting on all API routes (added this session)
- Generic error messages on all API routes (fixed this session)
- Inngest maxDuration increased to 300s (fixed this session)

## What Needs to Be Done

### 1. Switch ranking LLM to GPT-4.1 Mini

**Current state:** The ranking step calls `callModel({ task: 'fit_assessment', ... })` which routes through the main Claude Sonnet 4.6 model — the same model used for CV generation. This is too expensive for ranking 15 job cards.

**What's needed:**
- Add an OpenAI client (or use the existing model abstraction) to call **GPT-4.1 Mini** specifically for the `fit_assessment` task in the job feed ranking
- The ranking prompt is simple JSON in / JSON out — GPT-4.1 Mini handles this well
- Wire `OPENAI_API_KEY` env var
- Update `ranking.ts` to use the new OpenAI path instead of `callModel()`

### 2. Enable OpenAI Batch API for overnight processing

**Current state:** Ranking runs in real-time (synchronous LLM call during the workflow).

**What's needed:**
- Since feeds are generated overnight (not real-time), we can use the **OpenAI Batch API** which gives **50% cost savings**
- Submit ranking requests as batch jobs, poll for results, then materialize the feed
- This changes the workflow from "run everything in one pass" to "submit batch, wait, then finalize"
- The Inngest step function architecture already supports this (can add a wait/poll step)

### 3. Inngest setup

To get the background scheduling working, you need:
1. An Inngest account (free tier covers this)
2. Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in `.env.local`
3. Point the Inngest webhook to `https://your-domain.com/api/inngest`
4. The hourly cron will start automatically once Inngest is connected

---

## Architecture Assessment

**Not over-engineered.** The 10 backend files each have a single clear responsibility. The multi-phase pipeline (ingest → prefilter → rank → materialize) is the minimum viable architecture for a feed that runs in the background.

**Good decisions:**
- Deterministic fallback when LLM fails — feed always works
- Canonical job deduplication — same job on multiple boards counts once
- Idempotency per user per day — safe to retry without duplicating runs
- Data cleanup with retention policies — storage stays manageable
- Inngest step functions — retries and failure recovery built in

**One thing to watch:** `server.ts` at 1,100 lines is the largest file. It could be split into `data-access.ts` + `workflow.ts` if it grows further, but it's fine for now.
