-- Job Feed: multi-select preferences
--
-- Goal: allow users to select multiple seniority levels, multiple work modes,
-- and multiple countries + specific cities for their daily feed. This is an
-- ADDITIVE migration — the existing scalar columns remain in place so any
-- in-flight reads/writes keep working while the app switches over.
--
-- Rollout order:
--   1. Add new array columns (nullable) with CHECK constraints.
--   2. Backfill from legacy scalar columns.
--   3. Application code starts writing to BOTH old and new columns.
--   4. Reads prefer new columns, falling back to the scalar when NULL.
--   5. A future migration can drop the legacy columns once confirmed unused.

-- 1. New array columns -------------------------------------------------------

ALTER TABLE public.job_feed_settings
  ADD COLUMN IF NOT EXISTS seniority_targets TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
  ADD COLUMN IF NOT EXISTS remote_preferences TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
  ADD COLUMN IF NOT EXISTS target_countries TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
  ADD COLUMN IF NOT EXISTS target_cities TEXT[] DEFAULT '{}'::TEXT[] NOT NULL;

COMMENT ON COLUMN public.job_feed_settings.seniority_targets IS
  'Multi-select seniority levels the user is open to. Replaces singular seniority_target.';
COMMENT ON COLUMN public.job_feed_settings.remote_preferences IS
  'Multi-select work modes the user is open to (remote, hybrid, onsite). Replaces singular remote_preference.';
COMMENT ON COLUMN public.job_feed_settings.target_countries IS
  'ISO alpha-2 country codes the feed should search. Replaces enum-based target_market.';
COMMENT ON COLUMN public.job_feed_settings.target_cities IS
  'Optional specific cities (free-text) the feed should prioritize within target_countries.';

-- 2. CHECK constraints on new array columns ---------------------------------
-- Using subquery CHECKs via array_position avoids per-row validation overhead
-- and keeps the allowed values auditable in one place.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'job_feed_settings_seniority_targets_check'
  ) THEN
    ALTER TABLE public.job_feed_settings
      ADD CONSTRAINT job_feed_settings_seniority_targets_check
      CHECK (
        seniority_targets <@ ARRAY[
          'intern', 'junior', 'mid', 'senior', 'lead', 'staff', 'manager'
        ]::TEXT[]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'job_feed_settings_remote_preferences_check'
  ) THEN
    ALTER TABLE public.job_feed_settings
      ADD CONSTRAINT job_feed_settings_remote_preferences_check
      CHECK (
        remote_preferences <@ ARRAY[
          'remote_only', 'remote_first', 'hybrid', 'onsite', 'flexible'
        ]::TEXT[]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'job_feed_settings_target_countries_check'
  ) THEN
    ALTER TABLE public.job_feed_settings
      ADD CONSTRAINT job_feed_settings_target_countries_check
      CHECK (array_length(target_countries, 1) IS NULL OR array_length(target_countries, 1) <= 12);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'job_feed_settings_target_cities_check'
  ) THEN
    ALTER TABLE public.job_feed_settings
      ADD CONSTRAINT job_feed_settings_target_cities_check
      CHECK (array_length(target_cities, 1) IS NULL OR array_length(target_cities, 1) <= 20);
  END IF;
END
$$;

-- 3. Backfill new arrays from existing scalar columns ------------------------

-- seniority_targets: wrap single seniority_target as a one-element array
UPDATE public.job_feed_settings
   SET seniority_targets = ARRAY[seniority_target]::TEXT[]
 WHERE seniority_target IS NOT NULL
   AND (seniority_targets IS NULL OR cardinality(seniority_targets) = 0);

-- remote_preferences: wrap single remote_preference as a one-element array.
-- "flexible" expands to [remote_first, hybrid, onsite] to preserve intent.
UPDATE public.job_feed_settings
   SET remote_preferences = CASE
     WHEN remote_preference = 'flexible'
       THEN ARRAY['remote_first', 'hybrid', 'onsite']::TEXT[]
     ELSE ARRAY[remote_preference]::TEXT[]
   END
 WHERE (remote_preferences IS NULL OR cardinality(remote_preferences) = 0);

-- target_countries: map market enum -> ISO codes
UPDATE public.job_feed_settings
   SET target_countries = CASE target_market
     WHEN 'us' THEN ARRAY['us']::TEXT[]
     WHEN 'canada' THEN ARRAY['ca']::TEXT[]
     WHEN 'us_canada' THEN ARRAY['us', 'ca']::TEXT[]
     ELSE ARRAY['us']::TEXT[]
   END
 WHERE (target_countries IS NULL OR cardinality(target_countries) = 0);

-- target_cities: start empty; users fill this via onboarding
UPDATE public.job_feed_settings
   SET target_cities = '{}'::TEXT[]
 WHERE target_cities IS NULL;

-- 4. Indexes to keep array membership lookups fast ---------------------------

CREATE INDEX IF NOT EXISTS idx_job_feed_settings_target_countries
  ON public.job_feed_settings USING GIN (target_countries);

CREATE INDEX IF NOT EXISTS idx_job_feed_settings_seniority_targets
  ON public.job_feed_settings USING GIN (seniority_targets);
