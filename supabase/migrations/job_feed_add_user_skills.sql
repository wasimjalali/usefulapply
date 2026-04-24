-- Migration: Add user_skills column to job_feed_settings
-- Purpose: Store the user's skill list for skills-aware pipeline scoring and LLM ranking
-- Date: 2026-04-24

-- Add user_skills column (defaults to empty array for existing rows)
ALTER TABLE job_feed_settings
ADD COLUMN IF NOT EXISTS user_skills text[] NOT NULL DEFAULT '{}';

-- Add a comment for documentation
COMMENT ON COLUMN job_feed_settings.user_skills IS 'User skills for pipeline scoring and LLM ranking. Populated from CV or entered manually.';
