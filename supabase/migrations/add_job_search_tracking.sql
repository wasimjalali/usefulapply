-- ============================================================
-- Job Search Tracking for Job Board Feature
-- Adds columns to track monthly job search usage per user
-- ============================================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

BEGIN;

-- Add job search tracking columns to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_searches_used INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS job_searches_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add CHECK constraint to ensure non-negative values
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_job_searches_used_check
  CHECK (job_searches_used >= 0);

-- Create index for efficient queries on reset timestamp
CREATE INDEX IF NOT EXISTS idx_profiles_job_searches_reset_at
  ON public.profiles (job_searches_reset_at);

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.job_searches_used IS 'Number of job searches used in current billing period';
COMMENT ON COLUMN public.profiles.job_searches_reset_at IS 'Timestamp when job_searches_used was last reset (monthly)';

COMMIT;
