-- Add user-controlled exclusion terms to job_feed_settings.
--
-- These are titles, companies, or keywords the user explicitly never wants
-- surfaced in their daily feed. Unlike the AI-mirrored fields (target_roles,
-- user_skills, etc.), this is pure user input: the AI cannot infer what someone
-- wants to avoid. The ranker treats matches as near-hard negatives.
--
-- Mirrors the user_skills column shape (text[] not null default '{}') so empty
-- is the natural default for existing rows and no backfill is needed.

alter table public.job_feed_settings
  add column if not exists excluded_terms text[] not null default '{}';

comment on column public.job_feed_settings.excluded_terms is
  'User-specified titles/companies/keywords to exclude from the feed. Honored strongly by the LLM ranker as near-hard negatives.';
