-- Migration: profile_feed_runs_per_day
-- Purpose: an account-level override of the job feed's completed runs a day. NULL (every existing and new row)
--   keeps the plan's runsPerDay (JOB_FEED_TIER_LIMITS). Each run still searches the plan's maxMainQueries plus
--   its reserve. Set by hand, for one account at a time:
--   UPDATE profiles SET job_feed_runs_per_day = 4 WHERE id = '<user id>';
-- Date: 2026-10-26
-- Rollback: ALTER TABLE profiles DROP COLUMN job_feed_runs_per_day; every account goes back to its plan's runs.
-- Blast radius: low. One nullable column with no default; no row is rewritten. Apply BEFORE deploying the code
--   that reads it.

ALTER TABLE `profiles` ADD `job_feed_runs_per_day` integer;
