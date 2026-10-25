-- Migration: feed_run_slots
-- Purpose: more than one feed run a day. A run was unique per user and local day, so a second run that day could
--   only replace the first one's ranking. `run_slot` numbers the runs of one day (0 for the first, which every
--   existing row is), and uniqueness moves to (user, day, slot). How many slots a plan gets is
--   JOB_FEED_TIER_LIMITS.runsPerDay (src/lib/job-feed/constants.ts).
-- Date: 2026-10-25
-- Rollback: only while every day has a single run (SELECT user_id, local_date FROM job_feed_runs GROUP BY 1, 2
--   HAVING COUNT(*) > 1 returns nothing): DROP INDEX job_feed_runs_user_local_date_slot_uidx; CREATE UNIQUE INDEX
--   job_feed_runs_user_local_date_uidx ON job_feed_runs (user_id, local_date); ALTER TABLE job_feed_runs DROP COLUMN
--   run_slot;
-- Blast radius: medium. The index swap runs in one migration; existing rows keep their dates and get slot 0, so the
--   new unique index holds for them. Apply BEFORE deploying the code that writes slots.

ALTER TABLE `job_feed_runs` ADD `run_slot` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS `job_feed_runs_user_local_date_uidx`;
--> statement-breakpoint
CREATE UNIQUE INDEX `job_feed_runs_user_local_date_slot_uidx` ON `job_feed_runs` (`user_id`,`local_date`,`run_slot`);
