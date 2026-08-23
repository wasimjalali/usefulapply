ALTER TABLE `application_sessions` ADD `screening_turns_used` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `application_sessions` ADD `prep_turns_used` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `credit_transactions` ADD `transaction_kind` text;