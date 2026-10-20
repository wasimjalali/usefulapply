-- Migration: application revision counter and the agent_operations table
-- Purpose: PR 2 of the agent integration plan (docs/agent-integration/PLAN.md, 3.3 and 3.4).
--   1. application_sessions.revision is bumped by every write to an application's
--      content. A writer that loaded revision N writes `WHERE revision = N`, so a stale
--      tab or a background generation can no longer silently overwrite a newer write.
--   2. agent_operations is the job table behind queued generation: one row per
--      idempotent request, carrying the credit reservation key and a lease for the
--      Queue consumer (same lease pattern as job_feed_application_generations).
-- Date: 2026-10-20
-- Rollback: additive only. DROP TABLE agent_operations; then ALTER TABLE application_sessions
--   DROP COLUMN revision; (SQLite 3.35+, D1 supports it). Nothing else reads either yet.
-- Blast radius: low. ADD COLUMN with a constant default is metadata-only in SQLite, no table
--   rebuild, no backfill. Existing rows start at revision 0.

ALTER TABLE `application_sessions` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE `agent_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text,
	`kind` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`input_hash` text NOT NULL,
	`input` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result_ref` text,
	`reservation_key` text,
	`lease_owner` text,
	`lease_expires_at` text,
	`attempt` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `application_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `agent_operations_status_check` CHECK(`status` in ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT `agent_operations_attempt_check` CHECK(`attempt` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_operations_idempotency_uidx` ON `agent_operations` (`user_id`,`kind`,`idempotency_key`);--> statement-breakpoint
-- At most one live operation per identical request, whatever idempotency key the client sent.
CREATE UNIQUE INDEX `agent_operations_active_input_uidx` ON `agent_operations` (`user_id`,`kind`,`input_hash`) WHERE `status` in ('pending', 'running');--> statement-breakpoint
CREATE INDEX `agent_operations_user_status_idx` ON `agent_operations` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `agent_operations_status_updated_idx` ON `agent_operations` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `agent_operations_session_idx` ON `agent_operations` (`session_id`);--> statement-breakpoint
-- The reservation release and the stale sweeper ask "does a live operation hold this reservation?".
CREATE INDEX `agent_operations_reservation_idx` ON `agent_operations` (`reservation_key`);
