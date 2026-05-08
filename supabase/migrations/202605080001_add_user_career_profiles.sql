-- Job Feed Intelligence — Milestone A1
-- ----------------------------------------------------------------------------
-- AI-generated semantic career profile, scoped to the Job Feed pipeline only.
--
-- This table is the second-pass synthesis of a user's StructuredCV. Unlike
-- `documents.structured_data` (which is a literal extraction used by the CV
-- writer / fit assessment / cover letter / email agents), this profile MAY
-- contain inferred signals (canonical titles, skill clusters, function,
-- domain, narrative summary, negative signals).
--
-- HARD RULE — NEVER read this table from `src/lib/agents/**`. Application-kit
-- generation must remain strictly grounded in the literal CV to avoid
-- hallucinated facts in user-facing CVs and cover letters. This profile is
-- read ONLY by:
--   * src/lib/job-feed/career-profile.ts (writes)
--   * src/lib/job-feed/search-strategy.ts (reads, generates queries)
--   * src/lib/job-feed/openai-ranking.ts (reads, ranks candidate jobs)
--
-- One row per user. Regenerated when the source primary_cv document changes.
-- Free-tier users do not get a row (deterministic suggestion path stays).
-- ----------------------------------------------------------------------------

create table if not exists public.user_career_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,

  -- Full profile payload. Schema validated in TypeScript
  -- (src/lib/job-feed/career-profile.ts -> CareerProfile interface).
  -- Stored as jsonb so we can iterate on the shape without a migration
  -- per field; `version` tracks breaking schema changes.
  profile jsonb not null default '{}'::jsonb,

  -- Schema version. Bump in code when the CareerProfile interface gains a
  -- breaking change so we can regenerate stale rows lazily.
  version integer not null default 1,

  -- The primary_cv document this profile was synthesized from. Allows us
  -- to skip regeneration when the source hasn't changed, and to invalidate
  -- when it has.
  source_document_id uuid references public.documents(id) on delete set null,
  source_document_updated_at timestamptz,

  -- Provider/model used for synthesis (for telemetry + cost tracking).
  model_provider text,
  model_name text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at auto-bump on row update.
create or replace function public.user_career_profiles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_career_profiles_set_updated_at on public.user_career_profiles;
create trigger user_career_profiles_set_updated_at
  before update on public.user_career_profiles
  for each row
  execute function public.user_career_profiles_set_updated_at();

-- Lookup index for the regeneration-skip check (compare source updated_at).
create index if not exists user_career_profiles_source_doc_idx
  on public.user_career_profiles(source_document_id);

-- RLS: users can only read/write their own row. Same pattern as
-- user_cv_suggestions and user_job_preferences.
alter table public.user_career_profiles enable row level security;

drop policy if exists "user_career_profiles_own_rows" on public.user_career_profiles;
create policy "user_career_profiles_own_rows"
  on public.user_career_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
