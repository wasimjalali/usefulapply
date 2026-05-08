-- Enforce non-empty target_roles in job_feed_settings.
-- Bug fix: BUG-11 -- minimal preferences flow could persist empty target_roles
-- when the AI career profile mirror failed at save time.

ALTER TABLE job_feed_settings
  ADD CONSTRAINT job_feed_settings_target_roles_nonempty
  CHECK (jsonb_array_length(target_roles) > 0)
  NOT VALID;

-- Run AFTER cleaning any existing rows with empty target_roles:
-- ALTER TABLE job_feed_settings VALIDATE CONSTRAINT job_feed_settings_target_roles_nonempty;
