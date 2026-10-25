-- Migration: settings_revision_floor
-- Purpose: migration 0017 gave every existing job_feed_settings row revision 0, but 0 now means "no settings yet":
--   update_feed_settings accepts revision 0 for an account with no row (a first save starts at revision 1). A
--   row still at 0 would let an agent that never read the settings patch it. Every row at 0 moves to 1.
-- Date: 2026-10-26
-- Rollback: none needed; a later write moves the revision on anyway.
-- Blast radius: low. One column of job_feed_settings; no row is added or removed.

UPDATE `job_feed_settings` SET `revision` = 1 WHERE `revision` = 0;
