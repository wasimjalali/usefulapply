-- Migration: chat_compactions
-- Purpose: chat Phase 2 (server-owned history and on-demand compaction, ~/.hermes/plans/useful-apply/haiku-plan.md 2.3).
--   /api/chat builds the model's history for a saved application from chat_messages. When that history would
--   take a turn over about 75k input tokens, the route compacts everything before the last few messages into
--   one signed `compaction` block (Anthropic API, beta compact-2026-09-04) and stores it here. Later turns send
--   the block, then the messages after covers_through_message_id. One row per application, replaced on every
--   re-compaction. The client never sees or sends the block.
--   - block: the compaction block exactly as the API returned it (JSON), sent back verbatim (the signature covers it).
--   - covers_through_message_id: the chat_messages id of the last message the block summarizes. No foreign key:
--     clearing a chat deletes those rows, and the route treats a block whose message is gone as stale.
--   - input_tokens: the compaction request's total input, for cost review.
-- Date: 2026-10-22
-- Rollback: additive only. DROP TABLE chat_compactions; (chat then sends the full history again)
-- Blast radius: low. A new table only the chat route reads and writes. Rows go with their application
--   (ON DELETE CASCADE from application_sessions) and with the account (cascade from profiles, and
--   deleteAllUserData deletes by user_id).

CREATE TABLE `chat_compactions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`block` text NOT NULL,
	`covers_through_message_id` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `application_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `chat_compactions_input_tokens_check` CHECK(`input_tokens` >= 0)
);
--> statement-breakpoint
CREATE INDEX `chat_compactions_user_idx` ON `chat_compactions` (`user_id`);
