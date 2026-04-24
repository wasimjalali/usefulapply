-- ============================================================
-- Daily Feed Foundations (Phases 0-2)
-- Adds persistent feed settings and operational run tracking
-- ============================================================

BEGIN;

-- Shared updated_at trigger helper
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- job_feed_settings
-- One row per user describing feed preferences and consent
-- ============================================================

CREATE TABLE IF NOT EXISTS public.job_feed_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  consent_accepted_at TIMESTAMPTZ,
  user_timezone TEXT NOT NULL DEFAULT 'UTC',
  delivery_hour_local SMALLINT NOT NULL DEFAULT 8,
  target_market TEXT NOT NULL DEFAULT 'us_canada',
  target_roles TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  adjacent_roles_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  adjacent_roles TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  preferred_locations TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  remote_preference TEXT NOT NULL DEFAULT 'flexible',
  salary_floor INTEGER,
  languages TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  seniority_target TEXT,
  employment_types TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  work_authorization_status TEXT,
  aggressiveness TEXT NOT NULL DEFAULT 'balanced',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT job_feed_settings_delivery_hour_check CHECK (delivery_hour_local BETWEEN 0 AND 23),
  CONSTRAINT job_feed_settings_target_market_check CHECK (target_market IN ('us', 'canada', 'us_canada')),
  CONSTRAINT job_feed_settings_remote_preference_check CHECK (remote_preference IN ('remote_only', 'remote_first', 'hybrid', 'onsite', 'flexible')),
  CONSTRAINT job_feed_settings_seniority_target_check CHECK (seniority_target IS NULL OR seniority_target IN ('intern', 'junior', 'mid', 'senior', 'lead', 'staff', 'manager')),
  CONSTRAINT job_feed_settings_work_auth_check CHECK (work_authorization_status IS NULL OR work_authorization_status IN ('authorized', 'needs_sponsorship', 'open_to_both')),
  CONSTRAINT job_feed_settings_aggressiveness_check CHECK (aggressiveness IN ('strict', 'balanced', 'broad')),
  CONSTRAINT job_feed_settings_salary_floor_check CHECK (salary_floor IS NULL OR salary_floor >= 0),
  CONSTRAINT job_feed_settings_employment_types_check CHECK (
    employment_types <@ ARRAY['full_time', 'part_time', 'contract', 'internship', 'temporary']::TEXT[]
  )
);

CREATE INDEX IF NOT EXISTS idx_job_feed_settings_enabled
  ON public.job_feed_settings (enabled);

COMMENT ON TABLE public.job_feed_settings IS 'Per-user settings for the autonomous daily job feed.';
COMMENT ON COLUMN public.job_feed_settings.delivery_hour_local IS 'Hour of day in the user timezone when Karko should prepare the feed.';
COMMENT ON COLUMN public.job_feed_settings.target_market IS 'Launch markets for v1: us, canada, or both.';
COMMENT ON COLUMN public.job_feed_settings.aggressiveness IS 'How broad the search should be for related roles and looser matches.';

ALTER TABLE public.job_feed_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own job feed settings" ON public.job_feed_settings;
CREATE POLICY "Users can view own job feed settings"
  ON public.job_feed_settings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own job feed settings" ON public.job_feed_settings;
CREATE POLICY "Users can insert own job feed settings"
  ON public.job_feed_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own job feed settings" ON public.job_feed_settings;
CREATE POLICY "Users can update own job feed settings"
  ON public.job_feed_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_job_feed_settings_updated_at ON public.job_feed_settings;
CREATE TRIGGER update_job_feed_settings_updated_at
  BEFORE UPDATE ON public.job_feed_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- job_feed_runs
-- Operational source of truth for background feed generation
-- ============================================================

CREATE TABLE IF NOT EXISTS public.job_feed_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  local_date DATE NOT NULL,
  local_timezone TEXT NOT NULL,
  delivery_hour_local SMALLINT NOT NULL,
  trigger_source TEXT NOT NULL DEFAULT 'scheduled',
  status TEXT NOT NULL DEFAULT 'queued',
  idempotency_key TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  result_summary TEXT,
  raw_jobs_fetched INTEGER NOT NULL DEFAULT 0,
  jobs_after_prefilter INTEGER NOT NULL DEFAULT 0,
  ranked_jobs_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT job_feed_runs_status_check CHECK (status IN ('queued', 'running', 'completed', 'failed', 'skipped')),
  CONSTRAINT job_feed_runs_delivery_hour_check CHECK (delivery_hour_local BETWEEN 0 AND 23),
  CONSTRAINT job_feed_runs_counts_check CHECK (
    raw_jobs_fetched >= 0 AND jobs_after_prefilter >= 0 AND ranked_jobs_count >= 0
  ),
  CONSTRAINT job_feed_runs_user_date_unique UNIQUE (user_id, local_date),
  CONSTRAINT job_feed_runs_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_job_feed_runs_user_created_at
  ON public.job_feed_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_feed_runs_status_created_at
  ON public.job_feed_runs (status, created_at DESC);

COMMENT ON TABLE public.job_feed_runs IS 'Per-user daily feed generation runs with operational status and idempotency.';
COMMENT ON COLUMN public.job_feed_runs.idempotency_key IS 'Stable per-user-per-local-date key for safe retries.';
COMMENT ON COLUMN public.job_feed_runs.metadata IS 'Operational metadata for debugging and future pipeline stages.';

ALTER TABLE public.job_feed_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own job feed runs" ON public.job_feed_runs;
CREATE POLICY "Users can view own job feed runs"
  ON public.job_feed_runs FOR SELECT
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_job_feed_runs_updated_at ON public.job_feed_runs;
CREATE TRIGGER update_job_feed_runs_updated_at
  BEFORE UPDATE ON public.job_feed_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMIT;
