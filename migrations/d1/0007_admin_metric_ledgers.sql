CREATE TABLE `admin_auth_events` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`subject_hash` text NOT NULL,
	`event_type` text NOT NULL,
	`occurred_at` text NOT NULL,
	CONSTRAINT `admin_auth_events_type_check` CHECK(`event_type` in ('signup', 'session_started'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_auth_events_source_uidx` ON `admin_auth_events` (`source_id`);--> statement-breakpoint
CREATE INDEX `admin_auth_events_type_time_idx` ON `admin_auth_events` (`event_type`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `admin_auth_events_subject_time_idx` ON `admin_auth_events` (`subject_hash`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `admin_metric_sources` (
	`source` text PRIMARY KEY NOT NULL,
	`tracking_started_at` text NOT NULL,
	CONSTRAINT `admin_metric_sources_source_check` CHECK(`source` in ('auth', 'llm'))
);
--> statement-breakpoint
INSERT INTO `admin_metric_sources` (`source`, `tracking_started_at`)
VALUES ('auth', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	('llm', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
--> statement-breakpoint
CREATE TABLE `llm_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`request_execution_id` text NOT NULL,
	`client_request_id` text,
	`parent_generation_id` text,
	`user_id` text,
	`anonymous_subject_hash` text,
	`application_session_id` text,
	`job_feed_run_id` text,
	`route` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`feature` text NOT NULL,
	`operation` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`response_received_at` text,
	`failed_at` text,
	`latency_ms` integer,
	`attempt_count` integer DEFAULT 1 NOT NULL,
	`error_kind` text,
	`http_status` integer,
	`provider_request_id` text,
	`usage_reported` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`cache_read_input_tokens` integer,
	`cache_write_input_tokens` integer,
	`provider_total_tokens` integer,
	`provider_usage` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`parent_generation_id`) REFERENCES `llm_generations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`application_session_id`) REFERENCES `application_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`job_feed_run_id`) REFERENCES `job_feed_runs`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `llm_generations_provider_check` CHECK(`provider` in ('anthropic', 'bedrock', 'digitalocean', 'workers-ai')),
	CONSTRAINT `llm_generations_status_check` CHECK(`status` in ('started', 'response_received', 'failed')),
	CONSTRAINT `llm_generations_usage_reported_check` CHECK(`usage_reported` in (0, 1)),
	CONSTRAINT `llm_generations_tokens_check` CHECK(
		(`input_tokens` is null or `input_tokens` >= 0)
		and (`output_tokens` is null or `output_tokens` >= 0)
		and (`cache_read_input_tokens` is null or `cache_read_input_tokens` >= 0)
		and (`cache_write_input_tokens` is null or `cache_write_input_tokens` >= 0)
		and (`provider_total_tokens` is null or `provider_total_tokens` >= 0)
	),
	CONSTRAINT `llm_generations_latency_check` CHECK(`latency_ms` is null or `latency_ms` >= 0),
	CONSTRAINT `llm_generations_attempt_check` CHECK(`attempt_count` >= 1),
	CONSTRAINT `llm_generations_usage_state_check` CHECK(
		`usage_reported` = 0 or (
			`status` = 'response_received'
			and (`provider_total_tokens` is not null or (`input_tokens` is not null and `output_tokens` is not null))
		)
	),
	CONSTRAINT `llm_generations_lifecycle_check` CHECK(
		(`status` = 'started' and `response_received_at` is null and `failed_at` is null)
		or (`status` = 'response_received' and `response_received_at` is not null and `failed_at` is null)
		or (`status` = 'failed' and `failed_at` is not null and `response_received_at` is null)
	)
);
--> statement-breakpoint
CREATE INDEX `llm_generations_status_time_idx` ON `llm_generations` (`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `llm_generations_user_time_idx` ON `llm_generations` (`user_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `llm_generations_feature_operation_time_idx` ON `llm_generations` (`feature`,`operation`,`started_at`);--> statement-breakpoint
CREATE INDEX `llm_generations_request_execution_idx` ON `llm_generations` (`request_execution_id`);--> statement-breakpoint
CREATE INDEX `llm_generations_job_feed_run_idx` ON `llm_generations` (`job_feed_run_id`);
