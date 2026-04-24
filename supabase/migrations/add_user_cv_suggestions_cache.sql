-- Migration: Add user_cv_suggestions table
-- Purpose: Cache pre-computed job feed suggestions extracted from the user's primary CV.
--          Populated at CV upload time so "Take from my CV" loads instantly.
-- Date: 2026-04-24

CREATE TABLE IF NOT EXISTS user_cv_suggestions (
  user_id     uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  suggestion  jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: users may only read/write their own row
ALTER TABLE user_cv_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own cv suggestions"
  ON user_cv_suggestions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert their own cv suggestions"
  ON user_cv_suggestions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cv suggestions"
  ON user_cv_suggestions FOR UPDATE
  USING (auth.uid() = user_id);

COMMENT ON TABLE user_cv_suggestions IS 'Pre-computed job feed setting suggestions derived from the user''s primary CV. One row per user, replaced on each primary CV upload.';
