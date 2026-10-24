-- Migration: drop dead tables and columns
-- Purpose: remove leftovers that no code reads or writes any more (code removed in 504c8bff).
--   Tables: connected_accounts (OAuth links live in Better Auth's `account`), profile_photos (the CV photo is the
--   avatar since PR #123), user_cv_suggestions (the CV-suggestion feed flow is gone), user_notifications (never shown).
--   Columns: addon_credit_packs.discount_percent; profiles.notify_tips / notify_updates / notify_weekly /
--   notify_marketing / notify_credits_low / job_searches_used / job_searches_reset_at;
--   application_sessions.prep_turns_used; subscriptions.canceled_at / trial_start / trial_end / applications_used /
--   applications_limit.
--   No dropped column is in an index, CHECK, UNIQUE, PK, FK, partial-index predicate, trigger or view (checked
--   against sqlite_master after 0001-0014), so each is a plain DROP COLUMN, no table rebuild. No table has a foreign
--   key into the four dropped tables, so DROP TABLE cascades nowhere and PRAGMA defer_foreign_keys is not needed.
--   Their indexes (connected_accounts_user_provider_uidx, profile_photos_user_idx, user_notifications_user_created_idx)
--   and CHECKs go with the tables.
-- Date: 2026-10-24
-- Rollback: destructive. Data in these tables and columns is gone; restore from D1 Time Travel
--   (`npx wrangler d1 time-travel restore usefulapply-db --timestamp=<before apply>`) if it is needed. To bring the
--   shape back without data: re-run the matching CREATE TABLE / CREATE INDEX from 0001_init.sql and
--   `ALTER TABLE ... ADD` each column with its old type and DEFAULT (job_searches_reset_at needs a DEFAULT to be
--   re-added as NOT NULL), and revert the code (old code selects these columns by name).
-- Blast radius: medium. Destructive but on unused data. Deploy the code that no longer names these columns FIRST
--   (`npm run deploy:cf`), then apply this migration right after: old code selects every schema column by name,
--   so applying this before the deploy breaks every profiles / subscriptions / application_sessions /
--   addon_credit_packs query.

DROP TABLE IF EXISTS `connected_accounts`;
--> statement-breakpoint
DROP TABLE IF EXISTS `profile_photos`;
--> statement-breakpoint
DROP TABLE IF EXISTS `user_cv_suggestions`;
--> statement-breakpoint
DROP TABLE IF EXISTS `user_notifications`;
--> statement-breakpoint
ALTER TABLE `addon_credit_packs` DROP COLUMN `discount_percent`;
--> statement-breakpoint
ALTER TABLE `profiles` DROP COLUMN `notify_tips`;
--> statement-breakpoint
ALTER TABLE `profiles` DROP COLUMN `notify_updates`;
--> statement-breakpoint
ALTER TABLE `profiles` DROP COLUMN `notify_weekly`;
--> statement-breakpoint
ALTER TABLE `profiles` DROP COLUMN `notify_marketing`;
--> statement-breakpoint
ALTER TABLE `profiles` DROP COLUMN `notify_credits_low`;
--> statement-breakpoint
ALTER TABLE `profiles` DROP COLUMN `job_searches_used`;
--> statement-breakpoint
ALTER TABLE `profiles` DROP COLUMN `job_searches_reset_at`;
--> statement-breakpoint
ALTER TABLE `application_sessions` DROP COLUMN `prep_turns_used`;
--> statement-breakpoint
ALTER TABLE `subscriptions` DROP COLUMN `canceled_at`;
--> statement-breakpoint
ALTER TABLE `subscriptions` DROP COLUMN `trial_start`;
--> statement-breakpoint
ALTER TABLE `subscriptions` DROP COLUMN `trial_end`;
--> statement-breakpoint
ALTER TABLE `subscriptions` DROP COLUMN `applications_used`;
--> statement-breakpoint
ALTER TABLE `subscriptions` DROP COLUMN `applications_limit`;
