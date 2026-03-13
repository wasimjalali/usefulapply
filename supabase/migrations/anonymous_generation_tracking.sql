-- Anonymous Generation Tracking
-- Tracks anonymous (non-authenticated) users' free generation usage server-side
-- using hashed IP addresses (SHA-256) for privacy.
-- This prevents bypass via incognito mode, localStorage clearing, or direct API calls.

-- Create the table
CREATE TABLE IF NOT EXISTS anonymous_generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for fast lookups by ip_hash
CREATE INDEX IF NOT EXISTS idx_anonymous_generations_ip_hash ON anonymous_generations (ip_hash);

-- Enable RLS — only service role can read/write (no public access)
ALTER TABLE anonymous_generations ENABLE ROW LEVEL SECURITY;

-- No public policies — only service role (which bypasses RLS) can access this table.
-- This ensures anonymous users cannot read or tamper with tracking data.

-- Optional: auto-cleanup old records (older than 90 days) to prevent unbounded growth
-- Run this periodically via a Supabase cron job or manually:
-- DELETE FROM anonymous_generations WHERE generated_at < now() - INTERVAL '90 days';
