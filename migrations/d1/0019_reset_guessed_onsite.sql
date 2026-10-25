-- Migration: reset_guessed_onsite
-- Purpose: feed jobs stored before this release were labelled 'onsite' whenever the ad named a city and no remote or
--   hybrid word (src/lib/job-feed/serpapi.ts inferWorkMode), so most hybrid ads read as onsite. The feed now enforces
--   work mode against the settings (src/lib/job-feed/settings-filters.ts), and a guessed 'onsite' would hide those
--   jobs. Every 'onsite' becomes 'unknown', which the feed never filters out; the next ranking reads the mode in the
--   ad and stores it again.
-- Date: 2026-10-26
-- Rollback: none needed. The old values were a guess; a later ranking writes the mode it reads.
-- Blast radius: low. One column of job_feed_canonical_jobs for rows labelled 'onsite'; no row is added or removed.

UPDATE `job_feed_canonical_jobs` SET `work_mode` = 'unknown' WHERE `work_mode` = 'onsite';
