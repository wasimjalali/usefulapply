-- Migration: Add user_job_preferences table
-- Purpose: Store work preferences (salary floor, remote preference, work mode, target roles, skills)
--          pulled from job feed settings. Used for cover letter generation context.
-- Date: 2026-04-24

CREATE TABLE IF NOT EXISTS user_job_preferences (
  user_id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  salary_floor      integer     NULL,
  remote_preference text        NULL CHECK (remote_preference IN ('remote_only', 'remote_first', 'hybrid', 'onsite', 'flexible')),
  employment_types  text[]      NOT NULL DEFAULT '{}',
  target_roles      text[]      NOT NULL DEFAULT '{}',
  user_skills       text[]      NOT NULL DEFAULT '{}',
  target_market     text        NULL CHECK (target_market IN ('us', 'canada', 'us_canada')),
  seniority_target  text        NULL CHECK (seniority_target IN ('intern', 'junior', 'mid', 'senior', 'lead', 'staff', 'manager')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_job_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own job preferences"
  ON user_job_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert their own job preferences"
  ON user_job_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own job preferences"
  ON user_job_preferences FOR UPDATE
  USING (auth.uid() = user_id);

COMMENT ON TABLE user_job_preferences IS 'User job preferences derived from job feed settings. Synced whenever job feed settings are saved. Used for cover letter generation context (salary expectations, remote preference, etc.).';
