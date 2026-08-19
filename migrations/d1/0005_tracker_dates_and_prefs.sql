ALTER TABLE `application_sessions` ADD `interview_at` text;--> statement-breakpoint
ALTER TABLE `application_sessions` ADD `follow_up_due_at` text;--> statement-breakpoint
ALTER TABLE `application_sessions` ADD `interview_reminder_sent_at` text;--> statement-breakpoint
ALTER TABLE `application_sessions` ADD `follow_up_reminder_sent_at` text;--> statement-breakpoint
CREATE INDEX `application_sessions_interview_reminder_idx` ON `application_sessions` (`interview_at`) WHERE interview_reminder_sent_at is null and interview_at is not null;--> statement-breakpoint
CREATE INDEX `application_sessions_follow_up_reminder_idx` ON `application_sessions` (`follow_up_due_at`) WHERE follow_up_reminder_sent_at is null and follow_up_due_at is not null;--> statement-breakpoint
ALTER TABLE `profiles` ADD `notify_feed_ready` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `notify_follow_up_due` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `notify_interview_tomorrow` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `notify_credits_low` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `hide_rejected` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `timezone` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `date_format` text;