-- Migration: anthropic_user_profiles
-- Purpose: map each user to their Anthropic user profile (`uprof_...`), so every model request made for that
--   user carries the `anthropic-user-profile-id` header and a safety enforcement action hits that one user, not
--   the whole organization (https://platform.claude.com/docs/en/manage-claude/user-profiles).
--   1. One row per user (user_id is the primary key). The profile is created lazily on the user's first model
--      call (src/lib/models/user-profiles.ts) with access_type `application` and reference_id = our user id.
--   2. POST /v1/user_profiles is not idempotent, so concurrent first calls can each create a profile. The insert is
--      ON CONFLICT DO NOTHING; the losing writer reads the winner's id and deletes its own profile at Anthropic.
--   3. profile_id is UNIQUE: one Anthropic profile never belongs to two users.
--   4. Account deletion deletes the profile at Anthropic, then this row (deleteUserProfileForAccount); deleteAllUserData
--      deletes it again with the user's other tables, and the cascade on profiles covers anything left.
-- Date: 2026-10-22
-- Rollback: DROP TABLE anthropic_user_profiles; (requests then go out without the header again). The profiles stay at
--   Anthropic: re-applying later creates a second profile per user unless the old ids are restored first, and needs
--   this migration's row removed from d1_migrations.
-- Blast radius: low. A new table that only the model layer reads; apply BEFORE deploying the code that reads it.

CREATE TABLE `anthropic_user_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `anthropic_user_profiles_profile_id_check` CHECK(substr(`profile_id`, 1, 6) = 'uprof_' AND length(`profile_id`) > 6)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `anthropic_user_profiles_profile_id_unique` ON `anthropic_user_profiles` (`profile_id`);
