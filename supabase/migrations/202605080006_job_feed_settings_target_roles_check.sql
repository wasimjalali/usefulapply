-- Enforce non-empty target_roles in job_feed_settings.
-- Bug fix: BUG-11 -- minimal preferences flow could persist empty target_roles
-- when the AI career profile mirror failed at save time.
--
-- target_roles is text[] (not jsonb) so the array length predicate uses
-- cardinality(). NOT VALID lets the constraint apply to new/updated rows
-- without an immediate full-table scan; validate in a follow-up step
-- after any legacy empty-array rows have been cleaned.

ALTER TABLE job_feed_settings
  ADD CONSTRAINT job_feed_settings_target_roles_nonempty
  CHECK (target_roles IS NOT NULL AND cardinality(target_roles) > 0)
  NOT VALID;

-- Run AFTER cleaning any existing rows with empty target_roles:
-- ALTER TABLE job_feed_settings VALIDATE CONSTRAINT job_feed_settings_target_roles_nonempty;
