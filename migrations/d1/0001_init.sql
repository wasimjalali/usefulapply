CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`full_name` text,
	`phone` text,
	`location` text,
	`avatar_url` text,
	`linkedin_url` text,
	`github_url` text,
	`portfolio_url` text,
	`website_url` text,
	`date_of_birth` text,
	`nationality` text,
	`subscription_tier` text DEFAULT 'free' NOT NULL,
	`subscription_status` text DEFAULT 'active' NOT NULL,
	`notify_tips` integer DEFAULT true NOT NULL,
	`notify_updates` integer DEFAULT true NOT NULL,
	`notify_weekly` integer DEFAULT true NOT NULL,
	`notify_marketing` integer DEFAULT false NOT NULL,
	`job_searches_used` integer DEFAULT 0 NOT NULL,
	`job_searches_reset_at` text NOT NULL,
	`job_feed_last_seen_run_date` text,
	`welcome_sent_at` text,
	`last_confirmation_resend_at` text,
	`confirmation_resend_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "profiles_subscription_tier_supported_check" CHECK("profiles"."subscription_tier" in ('free', 'plus', 'max')),
	CONSTRAINT "profiles_subscription_status_check" CHECK("profiles"."subscription_status" in ('active', 'canceled', 'past_due', 'trialing'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_email_uidx` ON `profiles` (`email`);
--> statement-breakpoint
CREATE TABLE `subscription_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`tier` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price_monthly` real DEFAULT 0 NOT NULL,
	`credits_monthly` real DEFAULT 0 NOT NULL,
	`rollover_months` integer DEFAULT 0 NOT NULL,
	`max_rollover_credits` real DEFAULT 0 NOT NULL,
	`addon_enabled` integer DEFAULT false NOT NULL,
	`stripe_product_id` text,
	`stripe_price_id_monthly` text,
	`active` integer DEFAULT true NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "subscription_plans_tier_supported_check" CHECK("subscription_plans"."tier" in ('free', 'plus', 'max'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_plans_tier_uidx` ON `subscription_plans` (`tier`);
--> statement-breakpoint
CREATE TABLE `addon_credit_packs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`credits` real NOT NULL,
	`price` real NOT NULL,
	`discount_percent` real DEFAULT 0 NOT NULL,
	`stripe_product_id` text,
	`stripe_price_id` text,
	`active` integer DEFAULT true NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `serpapi_filter_tokens` (
	`country_code` text NOT NULL,
	`filter_name` text NOT NULL,
	`option_label` text NOT NULL,
	`uds_token` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serpapi_filter_tokens_pk` ON `serpapi_filter_tokens` (`country_code`,`filter_name`,`option_label`);
--> statement-breakpoint
CREATE INDEX `serpapi_filter_tokens_country_filter_idx` ON `serpapi_filter_tokens` (`country_code`,`filter_name`);
--> statement-breakpoint
CREATE TABLE `anonymous_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`ip_hash` text NOT NULL,
	`generated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `anonymous_generations_ip_hash_idx` ON `anonymous_generations` (`ip_hash`);
--> statement-breakpoint
CREATE TABLE `contact_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`subject` text NOT NULL,
	`message` text NOT NULL,
	`submitted_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_credits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`monthly_credits` real DEFAULT 0 NOT NULL,
	`rollover_credits` real DEFAULT 0 NOT NULL,
	`addon_credits` real DEFAULT 0 NOT NULL,
	`plan_tier` text DEFAULT 'free' NOT NULL,
	`last_reset_date` text,
	`next_reset_date` text,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`subscription_status` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_credits_plan_tier_supported_check" CHECK("user_credits"."plan_tier" in ('free', 'plus', 'max'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_credits_user_id_uidx` ON `user_credits` (`user_id`);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`file_name` text NOT NULL,
	`file_type` text NOT NULL,
	`file_size` integer,
	`storage_path` text,
	`raw_text` text,
	`sections` text NOT NULL,
	`all_skills` text NOT NULL,
	`all_experiences` text NOT NULL,
	`all_education` text NOT NULL,
	`structured_data` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "documents_type_check" CHECK("documents"."type" in ('primary_cv', 'master_cv')),
	CONSTRAINT "documents_file_type_check" CHECK("documents"."file_type" in ('pdf', 'docx', 'txt'))
);
--> statement-breakpoint
CREATE INDEX `documents_user_type_idx` ON `documents` (`user_id`,`type`);
--> statement-breakpoint
CREATE TABLE `application_sessions` (
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
	`status` text DEFAULT 'applied' NOT NULL,
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
	CONSTRAINT "application_sessions_status_check" CHECK("application_sessions"."status" in ('applied', 'interview', 'rejected', 'accepted', 'follow_up')),
	CONSTRAINT "application_sessions_generation_status_check" CHECK("application_sessions"."generation_status" in ('none', 'pending', 'running', 'succeeded', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `application_sessions_user_created_idx` ON `application_sessions` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`actions` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `application_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chat_messages_role_check" CHECK("chat_messages"."role" in ('user', 'assistant', 'system'))
);
--> statement-breakpoint
CREATE INDEX `chat_messages_session_idx` ON `chat_messages` (`session_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `chat_messages_user_idx` ON `chat_messages` (`user_id`);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tier` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`stripe_price_id` text,
	`current_period_start` text,
	`current_period_end` text,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`canceled_at` text,
	`trial_start` text,
	`trial_end` text,
	`applications_used` integer DEFAULT 0 NOT NULL,
	`applications_limit` integer DEFAULT 5 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "subscriptions_tier_supported_check" CHECK("subscriptions"."tier" in ('free', 'plus', 'max')),
	CONSTRAINT "subscriptions_status_check" CHECK("subscriptions"."status" in ('active', 'canceled', 'past_due', 'trialing', 'incomplete'))
);
--> statement-breakpoint
CREATE INDEX `subscriptions_user_idx` ON `subscriptions` (`user_id`);
--> statement-breakpoint
CREATE TABLE `connected_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`provider_email` text,
	`access_token` text,
	`refresh_token` text,
	`token_expires_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "connected_accounts_provider_check" CHECK("connected_accounts"."provider" in ('google', 'linkedin', 'github'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connected_accounts_user_provider_uidx` ON `connected_accounts` (`user_id`,`provider`);
--> statement-breakpoint
CREATE TABLE `credit_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`amount` real NOT NULL,
	`transaction_type` text NOT NULL,
	`session_id` text,
	`description` text,
	`metadata` text NOT NULL,
	`balance_before` real NOT NULL,
	`balance_after` real NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `credit_transactions_user_created_idx` ON `credit_transactions` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `message_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text,
	`message_id` text NOT NULL,
	`feedback_type` text NOT NULL,
	`feedback_text` text,
	`message_content` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "message_feedback_type_check" CHECK("message_feedback"."feedback_type" in ('positive', 'negative'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_feedback_user_message_uidx` ON `message_feedback` (`user_id`,`message_id`);
--> statement-breakpoint
CREATE INDEX `message_feedback_session_idx` ON `message_feedback` (`user_id`,`session_id`);
--> statement-breakpoint
CREATE TABLE `profile_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`file_name` text NOT NULL,
	`storage_path` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `profile_photos_user_idx` ON `profile_photos` (`user_id`);
--> statement-breakpoint
CREATE TABLE `user_cv_suggestions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`suggestion` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_job_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`salary_floor` integer,
	`remote_preference` text,
	`employment_types` text NOT NULL,
	`target_roles` text NOT NULL,
	`user_skills` text NOT NULL,
	`target_market` text,
	`seniority_target` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_job_preferences_remote_check" CHECK("user_job_preferences"."remote_preference" is null or "user_job_preferences"."remote_preference" in ('remote_only', 'remote_first', 'hybrid', 'onsite', 'flexible')),
	CONSTRAINT "user_job_preferences_market_check" CHECK("user_job_preferences"."target_market" is null or "user_job_preferences"."target_market" in ('us', 'canada', 'us_canada')),
	CONSTRAINT "user_job_preferences_seniority_check" CHECK("user_job_preferences"."seniority_target" is null or "user_job_preferences"."seniority_target" in ('intern', 'junior', 'mid', 'senior', 'lead', 'staff', 'manager'))
);
--> statement-breakpoint
CREATE TABLE `user_career_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`profile` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`source_document_id` text,
	`source_document_updated_at` text,
	`model_provider` text,
	`model_name` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `user_career_profiles_source_doc_idx` ON `user_career_profiles` (`source_document_id`);
--> statement-breakpoint
CREATE TABLE `user_search_strategies` (
	`user_id` text NOT NULL,
	`settings_hash` text NOT NULL,
	`strategy` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`source_profile_generated_at` text,
	`model_provider` text,
	`model_name` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_search_strategies_pk` ON `user_search_strategies` (`user_id`,`settings_hash`);
--> statement-breakpoint
CREATE INDEX `user_search_strategies_user_updated_idx` ON `user_search_strategies` (`user_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `user_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`payload` text NOT NULL,
	`read_at` text,
	`dismissed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_notifications_event_type_check" CHECK("user_notifications"."event_type" in (
        'feed_ready', 'feed_empty', 'feed_thin', 'feed_failed', 'new_jobs_available',
        'job_saved', 'job_dismissed', 'generation_started', 'generation_succeeded',
        'generation_failed', 'generation_cancelled', 'generation_expired', 'retry_available'
      ))
);
--> statement-breakpoint
CREATE INDEX `user_notifications_user_created_idx` ON `user_notifications` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `job_feed_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`consent_accepted_at` text,
	`user_timezone` text DEFAULT 'America/New_York' NOT NULL,
	`target_market` text DEFAULT 'us_canada' NOT NULL,
	`target_countries` text NOT NULL,
	`target_cities` text NOT NULL,
	`target_roles` text NOT NULL,
	`preferred_locations` text NOT NULL,
	`remote_preference` text DEFAULT 'flexible' NOT NULL,
	`remote_preferences` text NOT NULL,
	`salary_floor` integer,
	`languages` text NOT NULL,
	`seniority_target` text,
	`seniority_targets` text NOT NULL,
	`employment_types` text NOT NULL,
	`work_authorization_status` text,
	`user_skills` text NOT NULL,
	`excluded_terms` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "job_feed_settings_target_market_check" CHECK("job_feed_settings"."target_market" in ('us', 'canada', 'us_canada')),
	CONSTRAINT "job_feed_settings_remote_preference_check" CHECK("job_feed_settings"."remote_preference" in ('remote_only', 'remote_first', 'hybrid', 'onsite', 'flexible')),
	CONSTRAINT "job_feed_settings_seniority_target_check" CHECK("job_feed_settings"."seniority_target" is null or "job_feed_settings"."seniority_target" in ('intern', 'junior', 'mid', 'senior', 'lead', 'staff', 'manager')),
	CONSTRAINT "job_feed_settings_work_auth_check" CHECK("job_feed_settings"."work_authorization_status" is null or "job_feed_settings"."work_authorization_status" in ('authorized', 'needs_sponsorship', 'open_to_both')),
	CONSTRAINT "job_feed_settings_salary_floor_check" CHECK("job_feed_settings"."salary_floor" is null or "job_feed_settings"."salary_floor" >= 0),
	CONSTRAINT "job_feed_settings_target_roles_check" CHECK(json_array_length("job_feed_settings"."target_roles") > 0),
	CONSTRAINT "job_feed_settings_target_countries_check" CHECK(json_array_length("job_feed_settings"."target_countries") > 0),
	CONSTRAINT "job_feed_settings_remote_preferences_check" CHECK(json_array_length("job_feed_settings"."remote_preferences") > 0),
	CONSTRAINT "job_feed_settings_employment_types_check" CHECK(json_array_length("job_feed_settings"."employment_types") > 0)
);
--> statement-breakpoint
CREATE TABLE `job_feed_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`local_date` text NOT NULL,
	`local_timezone` text NOT NULL,
	`trigger_source` text DEFAULT 'scheduled' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`idempotency_key` text NOT NULL,
	`started_at` text,
	`completed_at` text,
	`error_message` text,
	`result_summary` text,
	`raw_jobs_fetched` integer DEFAULT 0 NOT NULL,
	`jobs_after_prefilter` integer DEFAULT 0 NOT NULL,
	`ranked_jobs_count` integer DEFAULT 0 NOT NULL,
	`settings_snapshot` text,
	`metadata` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "job_feed_runs_status_check" CHECK("job_feed_runs"."status" in ('queued', 'running', 'completed', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_feed_runs_user_local_date_uidx` ON `job_feed_runs` (`user_id`,`local_date`);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_feed_runs_idempotency_uidx` ON `job_feed_runs` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `job_feed_runs_user_created_idx` ON `job_feed_runs` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `job_feed_raw_fetches` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`user_id` text NOT NULL,
	`provider` text DEFAULT 'serpapi' NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`query_text` text NOT NULL,
	`market` text NOT NULL,
	`country_code` text,
	`language_code` text,
	`request_location` text,
	`request_filters` text NOT NULL,
	`page_number` integer DEFAULT 1 NOT NULL,
	`query_context` text NOT NULL,
	`request_params` text NOT NULL,
	`response_payload` text NOT NULL,
	`response_error` text,
	`fetched_jobs_count` integer DEFAULT 0 NOT NULL,
	`next_page_token` text,
	`fetched_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `job_feed_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "job_feed_raw_fetches_status_check" CHECK("job_feed_raw_fetches"."status" in ('completed', 'no_results', 'failed')),
	CONSTRAINT "job_feed_raw_fetches_market_check" CHECK("job_feed_raw_fetches"."market" in ('us', 'canada', 'us_canada'))
);
--> statement-breakpoint
CREATE INDEX `job_feed_raw_fetches_run_idx` ON `job_feed_raw_fetches` (`run_id`);
--> statement-breakpoint
CREATE TABLE `job_feed_canonical_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_key` text NOT NULL,
	`source_provider` text DEFAULT 'serpapi' NOT NULL,
	`source_job_id` text,
	`title` text NOT NULL,
	`title_normalized` text NOT NULL,
	`company` text NOT NULL,
	`company_normalized` text NOT NULL,
	`location_text` text,
	`location_normalized` text,
	`work_mode` text DEFAULT 'unknown' NOT NULL,
	`employment_type` text,
	`salary_text` text,
	`salary_min` integer,
	`salary_max` integer,
	`salary_currency` text,
	`description` text,
	`apply_url` text,
	`source_url` text,
	`posted_at_text` text,
	`freshness_days` integer,
	`source_identifiers` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`last_raw_fetch_id` text,
	`times_seen` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`last_raw_fetch_id`) REFERENCES `job_feed_raw_fetches`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "job_feed_canonical_jobs_work_mode_check" CHECK("job_feed_canonical_jobs"."work_mode" in ('remote', 'hybrid', 'onsite', 'unknown')),
	CONSTRAINT "job_feed_canonical_jobs_employment_type_check" CHECK("job_feed_canonical_jobs"."employment_type" is null or "job_feed_canonical_jobs"."employment_type" in ('full_time', 'part_time', 'contract', 'internship', 'temporary'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_feed_canonical_jobs_key_uidx` ON `job_feed_canonical_jobs` (`canonical_key`);
--> statement-breakpoint
CREATE INDEX `job_feed_canonical_jobs_last_seen_idx` ON `job_feed_canonical_jobs` (`last_seen_at`);
--> statement-breakpoint
CREATE TABLE `job_feed_ranked_items` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`user_id` text NOT NULL,
	`canonical_job_id` text NOT NULL,
	`rank_position` integer NOT NULL,
	`fit_label` text NOT NULL,
	`ranking_source` text DEFAULT 'deterministic' NOT NULL,
	`reason` text,
	`deterministic_score` integer DEFAULT 0 NOT NULL,
	`metadata` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `job_feed_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`canonical_job_id`) REFERENCES `job_feed_canonical_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "job_feed_ranked_items_fit_label_check" CHECK("job_feed_ranked_items"."fit_label" in ('strong', 'good')),
	CONSTRAINT "job_feed_ranked_items_ranking_source_check" CHECK("job_feed_ranked_items"."ranking_source" in ('deterministic', 'llm'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_feed_ranked_items_run_job_uidx` ON `job_feed_ranked_items` (`run_id`,`canonical_job_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_feed_ranked_items_run_rank_uidx` ON `job_feed_ranked_items` (`run_id`,`rank_position`);
--> statement-breakpoint
CREATE INDEX `job_feed_ranked_items_user_job_idx` ON `job_feed_ranked_items` (`user_id`,`canonical_job_id`);
--> statement-breakpoint
CREATE TABLE `job_feed_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`canonical_job_id` text NOT NULL,
	`latest_run_id` text,
	`application_session_id` text,
	`opened_at` text,
	`saved_at` text,
	`dismissed_at` text,
	`apply_started_at` text,
	`applied_at` text,
	`generation_status` text DEFAULT 'none' NOT NULL,
	`generation_error` text,
	`generation_started_at` text,
	`generation_completed_at` text,
	`generation_failed_at` text,
	`generation_cancelled_at` text,
	`metadata` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`canonical_job_id`) REFERENCES `job_feed_canonical_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`latest_run_id`) REFERENCES `job_feed_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`application_session_id`) REFERENCES `application_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "job_feed_feedback_generation_status_check" CHECK("job_feed_feedback"."generation_status" in ('none', 'pending', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "job_feed_feedback_has_signal_check" CHECK("job_feed_feedback"."opened_at" is not null
        or "job_feed_feedback"."saved_at" is not null
        or "job_feed_feedback"."dismissed_at" is not null
        or "job_feed_feedback"."apply_started_at" is not null
        or "job_feed_feedback"."applied_at" is not null
        or "job_feed_feedback"."generation_status" <> 'none'
        or "job_feed_feedback"."metadata" != '{}')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_feed_feedback_user_job_uidx` ON `job_feed_feedback` (`user_id`,`canonical_job_id`);
--> statement-breakpoint
CREATE INDEX `job_feed_feedback_user_session_idx` ON `job_feed_feedback` (`user_id`,`application_session_id`);
--> statement-breakpoint
CREATE TABLE `job_feed_application_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`canonical_job_id` text NOT NULL,
	`ranked_item_id` text,
	`run_id` text,
	`application_session_id` text NOT NULL,
	`status` text DEFAULT 'intent_created' NOT NULL,
	`attempt` integer DEFAULT 1 NOT NULL,
	`lease_owner` text,
	`lease_expires_at` text,
	`last_heartbeat_at` text,
	`error_code` text,
	`error_message` text,
	`metadata` text NOT NULL,
	`intent_created_at` text NOT NULL,
	`queued_at` text,
	`started_at` text,
	`completed_at` text,
	`failed_at` text,
	`cancelled_at` text,
	`expired_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`canonical_job_id`) REFERENCES `job_feed_canonical_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ranked_item_id`) REFERENCES `job_feed_ranked_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`run_id`) REFERENCES `job_feed_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`application_session_id`) REFERENCES `application_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "job_feed_app_generations_status_check" CHECK("job_feed_application_generations"."status" in ('intent_created', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired')),
	CONSTRAINT "job_feed_app_generations_attempt_check" CHECK("job_feed_application_generations"."attempt" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_feed_app_generations_user_job_session_uidx` ON `job_feed_application_generations` (`user_id`,`canonical_job_id`,`application_session_id`);
--> statement-breakpoint
CREATE INDEX `job_feed_app_generations_user_status_idx` ON `job_feed_application_generations` (`user_id`,`status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `job_feed_app_generations_session_idx` ON `job_feed_application_generations` (`user_id`,`application_session_id`);
--> statement-breakpoint
CREATE INDEX `job_feed_app_generations_job_idx` ON `job_feed_application_generations` (`user_id`,`canonical_job_id`);
--> statement-breakpoint
CREATE TABLE `job_feed_application_generation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`generation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`attempt` integer NOT NULL,
	`transition_reason` text,
	`error_code` text,
	`error_message` text,
	`metadata` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`generation_id`) REFERENCES `job_feed_application_generations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "job_feed_generation_events_from_status_check" CHECK("job_feed_application_generation_events"."from_status" is null or "job_feed_application_generation_events"."from_status" in ('intent_created', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired')),
	CONSTRAINT "job_feed_generation_events_to_status_check" CHECK("job_feed_application_generation_events"."to_status" in ('intent_created', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired')),
	CONSTRAINT "job_feed_generation_events_attempt_check" CHECK("job_feed_application_generation_events"."attempt" >= 1)
);
--> statement-breakpoint
CREATE INDEX `job_feed_app_generation_events_generation_idx` ON `job_feed_application_generation_events` (`generation_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `credit_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`generation_id` text,
	`session_id` text,
	`action` text NOT NULL,
	`amount` real NOT NULL,
	`status` text DEFAULT 'reserved' NOT NULL,
	`reserved_at` text NOT NULL,
	`captured_at` text,
	`released_at` text,
	`refunded_at` text,
	`idempotency_key` text NOT NULL,
	`metadata` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_id`) REFERENCES `job_feed_application_generations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`session_id`) REFERENCES `application_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "credit_reservations_amount_check" CHECK("credit_reservations"."amount" > 0),
	CONSTRAINT "credit_reservations_status_check" CHECK("credit_reservations"."status" in ('reserved', 'captured', 'released', 'refunded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_reservations_idempotency_uidx` ON `credit_reservations` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `credit_reservations_user_status_idx` ON `credit_reservations` (`user_id`,`status`);
--> statement-breakpoint
CREATE INDEX `credit_reservations_generation_idx` ON `credit_reservations` (`generation_id`);
--> statement-breakpoint
CREATE INDEX `credit_reservations_session_idx` ON `credit_reservations` (`session_id`);
--> statement-breakpoint
INSERT INTO subscription_plans (id, tier, name, description, price_monthly, credits_monthly, rollover_months, max_rollover_credits, addon_enabled, active, display_order, created_at, updated_at)
VALUES
  ('plan_free', 'free', 'Free', 'Free plan', 0, 4, 0, 0, 0, 1, 0, '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z'),
  ('plan_plus', 'plus', 'Plus', 'Plus plan', 19.99, 50, 0, 50, 1, 1, 1, '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z'),
  ('plan_max', 'max', 'Max', 'Max plan', 79.99, 200, 0, 100, 1, 1, 2, '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z');

INSERT INTO addon_credit_packs (id, name, credits, price, discount_percent, active, display_order, created_at)
VALUES
  ('pack_credit', 'Credit Pack', 50, 19.99, 0, 1, 0, '2026-08-17T00:00:00.000Z');
