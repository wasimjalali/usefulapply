PRAGMA defer_foreign_keys = true;--> statement-breakpoint
CREATE TABLE `__new_application_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_title` text,
	`company` text,
	`job_description` text NOT NULL,
	`job_url` text,
	`match_score` integer,
	`matching_skills` text NOT NULL,
	`missing_skills` text NOT NULL,
	`suggestions` text NOT NULL,
	`requirements` text,
	`gaps` text,
	`generated_cv` text,
	`cover_letter` text,
	`email` text,
	`company_research` text,
	`company_address` text,
	`company_contact_person` text,
	`cv_edits` text NOT NULL,
	`optimized_pdf_path` text,
	`optimized_cv_text` text,
	`email_subject` text,
	`email_body` text,
	`selected_template` text DEFAULT 'premium-ats' NOT NULL,
	`status` text DEFAULT 'drafted' NOT NULL,
	`cover_letter_language` text DEFAULT 'en' NOT NULL,
	`fit_assessment` text,
	`generation_completed` integer DEFAULT false NOT NULL,
	`generation_status` text DEFAULT 'none' NOT NULL,
	`generation_error` text,
	`generation_started_at` text,
	`generation_completed_at` text,
	`generation_failed_at` text,
	`generation_cancelled_at` text,
	`follow_up_email` text,
	`generated_artifacts` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "application_sessions_status_check" CHECK("__new_application_sessions"."status" in ('drafted', 'applied', 'interview', 'rejected', 'accepted', 'follow_up')),
	CONSTRAINT "application_sessions_generation_status_check" CHECK("__new_application_sessions"."generation_status" in ('none', 'pending', 'running', 'succeeded', 'failed', 'cancelled'))
);
--> statement-breakpoint
INSERT INTO `__new_application_sessions`("id", "user_id", "job_title", "company", "job_description", "job_url", "match_score", "matching_skills", "missing_skills", "suggestions", "requirements", "gaps", "generated_cv", "cover_letter", "email", "company_research", "company_address", "company_contact_person", "cv_edits", "optimized_pdf_path", "optimized_cv_text", "email_subject", "email_body", "selected_template", "status", "cover_letter_language", "fit_assessment", "generation_completed", "generation_status", "generation_error", "generation_started_at", "generation_completed_at", "generation_failed_at", "generation_cancelled_at", "follow_up_email", "generated_artifacts", "created_at", "updated_at") SELECT "id", "user_id", "job_title", "company", "job_description", "job_url", "match_score", "matching_skills", "missing_skills", "suggestions", "requirements", "gaps", "generated_cv", "cover_letter", "email", "company_research", "company_address", "company_contact_person", "cv_edits", "optimized_pdf_path", "optimized_cv_text", "email_subject", "email_body", "selected_template", "status", "cover_letter_language", "fit_assessment", "generation_completed", "generation_status", "generation_error", "generation_started_at", "generation_completed_at", "generation_failed_at", "generation_cancelled_at", "follow_up_email", "generated_artifacts", "created_at", "updated_at" FROM `application_sessions`;--> statement-breakpoint
-- Child tables reference application_sessions with ON DELETE CASCADE / SET NULL,
-- and job_feed_application_generation_events / credit_reservations.generation_id
-- hang off job_feed_application_generations in turn. DROP TABLE runs an implicit
-- DELETE that fires those actions even with deferred FK checks, so back every
-- affected row up first and restore after the swap.
CREATE TABLE `__bk_chat_messages` AS SELECT * FROM `chat_messages`;--> statement-breakpoint
CREATE TABLE `__bk_job_feed_application_generations` AS SELECT * FROM `job_feed_application_generations`;--> statement-breakpoint
CREATE TABLE `__bk_job_feed_feedback_links` AS SELECT `id`, `application_session_id` FROM `job_feed_feedback` WHERE `application_session_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__bk_credit_reservation_links` AS SELECT `id`, `session_id` FROM `credit_reservations` WHERE `session_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__bk_job_feed_application_generation_events` AS SELECT * FROM `job_feed_application_generation_events`;--> statement-breakpoint
CREATE TABLE `__bk_credit_reservation_generation_links` AS SELECT `id`, `generation_id` FROM `credit_reservations` WHERE `generation_id` IS NOT NULL;--> statement-breakpoint
DROP TABLE `application_sessions`;--> statement-breakpoint
ALTER TABLE `__new_application_sessions` RENAME TO `application_sessions`;--> statement-breakpoint
CREATE INDEX `application_sessions_user_created_idx` ON `application_sessions` (`user_id`,`created_at`);--> statement-breakpoint
INSERT INTO `chat_messages` SELECT * FROM `__bk_chat_messages`;--> statement-breakpoint
INSERT INTO `job_feed_application_generations` SELECT * FROM `__bk_job_feed_application_generations`;--> statement-breakpoint
INSERT INTO `job_feed_application_generation_events` SELECT * FROM `__bk_job_feed_application_generation_events`;--> statement-breakpoint
UPDATE `job_feed_feedback` SET `application_session_id` = (SELECT `application_session_id` FROM `__bk_job_feed_feedback_links` b WHERE b.`id` = `job_feed_feedback`.`id`) WHERE `id` IN (SELECT `id` FROM `__bk_job_feed_feedback_links`);--> statement-breakpoint
UPDATE `credit_reservations` SET `session_id` = (SELECT `session_id` FROM `__bk_credit_reservation_links` b WHERE b.`id` = `credit_reservations`.`id`) WHERE `id` IN (SELECT `id` FROM `__bk_credit_reservation_links`);--> statement-breakpoint
UPDATE `credit_reservations` SET `generation_id` = (SELECT `generation_id` FROM `__bk_credit_reservation_generation_links` b WHERE b.`id` = `credit_reservations`.`id`) WHERE `id` IN (SELECT `id` FROM `__bk_credit_reservation_generation_links`);--> statement-breakpoint
DROP TABLE `__bk_chat_messages`;--> statement-breakpoint
DROP TABLE `__bk_job_feed_application_generations`;--> statement-breakpoint
DROP TABLE `__bk_job_feed_feedback_links`;--> statement-breakpoint
DROP TABLE `__bk_credit_reservation_links`;--> statement-breakpoint
DROP TABLE `__bk_job_feed_application_generation_events`;--> statement-breakpoint
DROP TABLE `__bk_credit_reservation_generation_links`;
