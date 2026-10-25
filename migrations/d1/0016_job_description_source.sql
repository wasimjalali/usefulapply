-- Migration: job_description_source
-- Purpose: record where a feed job's description came from and whether it is the whole ad.
--   1. description_source: 'serp' (Google Jobs' copy through SerpAPI, the only source until now) or
--      'employer_page' (the JobPosting description read from the apply or employer page, src/lib/job-feed/posting-page.ts).
--      A later SerpAPI sighting never replaces an employer-page text.
--   2. description_complete: 1 when the stored text is the whole ad, 0 when it is a snippet or cut off, NULL for rows
--      written before this migration (readers then judge the text itself).
-- Date: 2026-10-25
-- Rollback: ALTER TABLE job_feed_canonical_jobs DROP COLUMN description_complete; then the same for
--   description_source. The descriptions themselves stay.
-- Blast radius: low. Two new nullable columns with no rewrite of existing rows; apply BEFORE deploying the code that
--   writes them.

ALTER TABLE `job_feed_canonical_jobs` ADD `description_source` text DEFAULT 'serp' NOT NULL;
--> statement-breakpoint
ALTER TABLE `job_feed_canonical_jobs` ADD `description_complete` integer;
