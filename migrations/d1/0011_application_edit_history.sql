-- Migration: application_edit_history and agent_operations.result
-- Purpose: PR 5 of the agent integration plan (docs/agent-integration/PLAN.md, 3.5 and the undo_last_edit tool).
--   1. application_edit_history keeps the last 10 prior versions of an application's tailored CV and of each
--      document (cover letter, application email, follow-up email), so undo_last_edit can restore one.
--      One row = the value of the changed columns just BEFORE an edit, tagged with the revision it was at.
--      Rows are written in the same D1 batch as the edit, so a history row never exists for a write that lost.
--      A cron pass deletes rows older than 30 days.
--   2. agent_operations.result holds the JSON result of an operation that runs inline in the tool call
--      (fit analysis, a document regenerate, a section rewrite), so a retry under the same idempotency key
--      returns the first result instead of charging again. Queued kit generations keep using result_ref.
-- Date: 2026-10-21
-- Rollback: additive only. DROP TABLE application_edit_history; ALTER TABLE agent_operations DROP COLUMN result;
-- Blast radius: low. A new table nothing reads yet, and a nullable column with no default (metadata-only in SQLite).

CREATE TABLE `application_edit_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`edit_group` text NOT NULL,
	`revision` integer NOT NULL,
	`prior_value` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `application_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `application_edit_history_group_check` CHECK(`edit_group` in ('cv', 'cover_letter', 'email', 'follow_up_email')),
	CONSTRAINT `application_edit_history_revision_check` CHECK(`revision` >= 0)
);
--> statement-breakpoint
CREATE INDEX `application_edit_history_lookup_idx` ON `application_edit_history` (`user_id`,`session_id`,`edit_group`,`created_at`);--> statement-breakpoint
CREATE INDEX `application_edit_history_created_idx` ON `application_edit_history` (`created_at`);--> statement-breakpoint
ALTER TABLE `agent_operations` ADD `result` text;
