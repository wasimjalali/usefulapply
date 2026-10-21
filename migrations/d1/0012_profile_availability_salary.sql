-- Migration: profiles.availability, availability_note, salary_expectation, availability_asked_at
-- Purpose: the applicant's own start date and salary expectation, so the kit writers never invent them
--   (live tests on 2026-10-21 found "I can start as soon as we agree on a date" and "no notice period" in
--   documents whose CVs said neither). Asked once in onboarding / before the first kit, editable in Settings.
--   1. availability: a language-neutral choice; NULL means not given.
--   2. availability_note: free text, at most 200 characters, required in the product when availability is 'other'.
--   3. salary_expectation: free text, at most 120 characters; NULL means salary is never mentioned.
--   4. availability_asked_at: stamped by the server whenever an update touches any of the three, so a skip
--      (availability saved as NULL) still records that the user was asked.
-- Date: 2026-10-21
-- Rollback: additive only. ALTER TABLE profiles DROP COLUMN availability; (and the other three)
-- Blast radius: low. Four nullable columns with no default (metadata-only in SQLite); old code ignores them.
--   Apply BEFORE deploying the code that selects them (Drizzle selects every column by name).

ALTER TABLE `profiles` ADD `availability` text CHECK (`availability` IS NULL OR `availability` IN ('immediately', '2_weeks', '1_month', '3_months', 'other'));
--> statement-breakpoint
ALTER TABLE `profiles` ADD `availability_note` text;
--> statement-breakpoint
ALTER TABLE `profiles` ADD `salary_expectation` text;
--> statement-breakpoint
ALTER TABLE `profiles` ADD `availability_asked_at` text;
