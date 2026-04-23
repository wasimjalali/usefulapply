-- ============================================================
-- Daily Feed Phase 3 - Job Ingestion & Canonical Jobs
-- Adds durable raw fetch storage plus normalized canonical jobs
-- ============================================================

BEGIN;

-- ============================================================
-- job_feed_raw_fetches
-- Immutable provider fetch records per run/query
-- ============================================================

CREATE TABLE IF NOT EXISTS public.job_feed_raw_fetches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.job_feed_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'serpapi',
  status TEXT NOT NULL DEFAULT 'completed',
  query_text TEXT NOT NULL,
  market TEXT NOT NULL,
  country_code TEXT,
  language_code TEXT,
  request_location TEXT,
  request_filters TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  page_number SMALLINT NOT NULL DEFAULT 1,
  query_context JSONB NOT NULL DEFAULT '{}'::JSONB,
  request_params JSONB NOT NULL DEFAULT '{}'::JSONB,
  response_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  response_error TEXT,
  fetched_jobs_count INTEGER NOT NULL DEFAULT 0,
  next_page_token TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT job_feed_raw_fetches_status_check CHECK (status IN ('completed', 'no_results', 'failed')),
  CONSTRAINT job_feed_raw_fetches_market_check CHECK (market IN ('us', 'canada', 'us_canada')),
  CONSTRAINT job_feed_raw_fetches_page_number_check CHECK (page_number >= 1),
  CONSTRAINT job_feed_raw_fetches_counts_check CHECK (fetched_jobs_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_job_feed_raw_fetches_run_fetched_at
  ON public.job_feed_raw_fetches (run_id, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_feed_raw_fetches_user_fetched_at
  ON public.job_feed_raw_fetches (user_id, fetched_at DESC);

COMMENT ON TABLE public.job_feed_raw_fetches IS 'Raw provider fetch payloads for each daily feed run query.';
COMMENT ON COLUMN public.job_feed_raw_fetches.query_context IS 'Query metadata such as target role, adjacent-role flag, and delivery market.';
COMMENT ON COLUMN public.job_feed_raw_fetches.request_params IS 'Sanitized provider request parameters without secrets.';
COMMENT ON COLUMN public.job_feed_raw_fetches.response_payload IS 'Original provider JSON payload for later debugging and re-normalization.';

ALTER TABLE public.job_feed_raw_fetches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own job feed raw fetches" ON public.job_feed_raw_fetches;
CREATE POLICY "Users can view own job feed raw fetches"
  ON public.job_feed_raw_fetches FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- job_feed_canonical_jobs
-- Global normalized jobs deduped across fetches
-- ============================================================

CREATE TABLE IF NOT EXISTS public.job_feed_canonical_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_key TEXT NOT NULL UNIQUE,
  source_provider TEXT NOT NULL DEFAULT 'serpapi',
  source_job_id TEXT,
  title TEXT NOT NULL,
  title_normalized TEXT NOT NULL,
  company TEXT NOT NULL,
  company_normalized TEXT NOT NULL,
  location_text TEXT,
  location_normalized TEXT,
  work_mode TEXT NOT NULL DEFAULT 'unknown',
  employment_type TEXT,
  salary_text TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT,
  description TEXT,
  apply_url TEXT,
  source_url TEXT,
  posted_at_text TEXT,
  freshness_days INTEGER,
  source_identifiers JSONB NOT NULL DEFAULT '{}'::JSONB,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_raw_fetch_id UUID REFERENCES public.job_feed_raw_fetches(id) ON DELETE SET NULL,
  times_seen INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT job_feed_canonical_jobs_work_mode_check CHECK (work_mode IN ('remote', 'hybrid', 'onsite', 'unknown')),
  CONSTRAINT job_feed_canonical_jobs_employment_type_check CHECK (
    employment_type IS NULL OR employment_type IN ('full_time', 'part_time', 'contract', 'internship', 'temporary')
  ),
  CONSTRAINT job_feed_canonical_jobs_times_seen_check CHECK (times_seen >= 1),
  CONSTRAINT job_feed_canonical_jobs_freshness_days_check CHECK (freshness_days IS NULL OR freshness_days >= 0),
  CONSTRAINT job_feed_canonical_jobs_salary_check CHECK (
    (salary_min IS NULL OR salary_min >= 0)
    AND (salary_max IS NULL OR salary_max >= 0)
    AND (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max)
  )
);

CREATE INDEX IF NOT EXISTS idx_job_feed_canonical_jobs_last_seen_at
  ON public.job_feed_canonical_jobs (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_feed_canonical_jobs_title_company
  ON public.job_feed_canonical_jobs (title_normalized, company_normalized);

CREATE INDEX IF NOT EXISTS idx_job_feed_canonical_jobs_source_job
  ON public.job_feed_canonical_jobs (source_provider, source_job_id);

COMMENT ON TABLE public.job_feed_canonical_jobs IS 'Normalized canonical jobs reused across fetches, feeds, and future ranking/apply flows.';
COMMENT ON COLUMN public.job_feed_canonical_jobs.canonical_key IS 'Practical dedupe key combining normalized identity signals such as title, company, and apply URL.';
COMMENT ON COLUMN public.job_feed_canonical_jobs.source_identifiers IS 'Provider-specific metadata such as source job id, apply options, and share links.';

ALTER TABLE public.job_feed_canonical_jobs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_job_feed_canonical_jobs_updated_at ON public.job_feed_canonical_jobs;
CREATE TRIGGER update_job_feed_canonical_jobs_updated_at
  BEFORE UPDATE ON public.job_feed_canonical_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMIT;
