-- Job Feed Intelligence — Milestone D1
-- ----------------------------------------------------------------------------
-- Drop dead columns from `job_feed_settings`. These columns were stored but
-- never read by the search planner / ranker:
--
--   * aggressiveness          — UI control existed but the planner ignored
--                               it; only logged in query_context metadata.
--   * adjacent_roles_enabled  — hardcoded to FALSE on every PUT in the
--                               settings API, so the toggle was decorative.
--   * adjacent_roles          — populated by the form but never consumed by
--                               the planner; the toggle above gated reads
--                               that didn't exist.
--
-- This is a breaking change at the API surface for the legacy settings
-- payload, but the user base is tiny and any current paid user can re-run
-- the wizard without losing meaningful state. New ingestion intelligence
-- (career profile + search strategy + uds filter) replaces what these
-- dead fields were claiming to express.
-- ----------------------------------------------------------------------------

alter table public.job_feed_settings
  drop column if exists aggressiveness,
  drop column if exists adjacent_roles_enabled,
  drop column if exists adjacent_roles;
