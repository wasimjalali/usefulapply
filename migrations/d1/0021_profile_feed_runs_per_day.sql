-- Migration: profile_feed_runs_per_day
-- Purpose: an account-level override of the job feed's completed runs a day. NULL (every existing and new row)
--   keeps the plan's runsPerDay (JOB_FEED_TIER_LIMITS). Each run still searches the plan's maxMainQueries plus
--   its reserve, and the search list grows to hold a slice for every run. Set by hand, for one account at a time:
--   UPDATE profiles SET job_feed_runs_per_day = 4 WHERE id = '<user id>';
--   A whole number of 1 or more (the CHECK refuses anything else); 1 means one run a day, not none. The
--   override outlives a plan change: a downgraded account keeps its runs a day, each with its new plan's
--   searches, until the column is set back to NULL.
-- Date: 2026-10-26
-- Rollback: deploy the code before this migration FIRST (every profile read selects the column and fails without
--   it), then ALTER TABLE profiles DROP COLUMN job_feed_runs_per_day; every account goes back to its plan's runs.
-- Blast radius: low. One nullable column with no default; no row is rewritten. Apply BEFORE deploying the code
--   that reads it: that code fails every profile read while the column is missing.

ALTER TABLE `profiles` ADD `job_feed_runs_per_day` integer CHECK (`job_feed_runs_per_day` IS NULL OR (typeof(`job_feed_runs_per_day`) = 'integer' AND `job_feed_runs_per_day` >= 1));
