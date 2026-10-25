-- Migration: feed_settings_revision
-- Purpose: optimistic concurrency for job feed settings. A settings form left open in the web app saved its stale
--   copy over a change an agent had just made through the MCP, with no warning. Every write now moves `revision`
--   up by one (src/db/repos/jobFeed.ts), and the web save and update_feed_settings send the revision they read;
--   a save based on an older one is refused with a clear message instead of applied.
-- Date: 2026-10-25
-- Rollback: ALTER TABLE job_feed_settings DROP COLUMN revision; (saves then go back to last write wins).
-- Blast radius: low. One new column with a default; every existing row starts at 0. Apply BEFORE deploying the
--   code that reads it.

ALTER TABLE `job_feed_settings` ADD `revision` integer DEFAULT 0 NOT NULL;
