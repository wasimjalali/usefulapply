-- Job Feed Intelligence — Milestone B1
-- ----------------------------------------------------------------------------
-- AI-generated search strategy. Reads `user_career_profiles` + the user's
-- current `job_feed_settings` and emits a structured plan of SerpAPI queries
-- (short-tail recall, long-tail precision, localized variants), with a
-- `fallbackTo` index per query so a zero-result long-tail can retry against
-- its short-tail counterpart in the same run.
--
-- Keyed by (user_id, settings_hash) so a strategy is automatically
-- regenerated when settings change in a way that affects search shape (new
-- countries, new roles, new seniority).
--
-- HARD RULE — read by the job-feed pipeline only. Same boundary as
-- `user_career_profiles`: NEVER imported from `src/lib/agents/**`.
-- ----------------------------------------------------------------------------

create table if not exists public.user_search_strategies (
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- Hash of the settings inputs that materially affect search shape. When
  -- the user changes target_countries / target_roles / seniority_targets we
  -- regenerate against the new hash; legacy rows stay queryable for a
  -- short window so an in-flight feed run still has a strategy to read.
  settings_hash text not null,

  -- Full strategy payload validated in TypeScript
  -- (src/lib/job-feed/search-strategy.ts -> SearchStrategy interface).
  strategy jsonb not null default '{}'::jsonb,

  -- Schema version for breaking-change migrations on the strategy shape.
  version integer not null default 1,

  -- Profile that was used to synthesize this strategy. Lets us recompute
  -- when the profile is regenerated even if settings_hash matches.
  source_profile_generated_at timestamptz,

  -- Provider/model used for synthesis (telemetry + cost tracking).
  model_provider text,
  model_name text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, settings_hash)
);

-- updated_at auto-bump on row update.
create or replace function public.user_search_strategies_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_search_strategies_set_updated_at on public.user_search_strategies;
create trigger user_search_strategies_set_updated_at
  before update on public.user_search_strategies
  for each row
  execute function public.user_search_strategies_set_updated_at();

-- Index for the "latest strategy across hashes" lookup used by the planner
-- when it needs to fall back to a slightly stale strategy after a settings
-- change but before the new one is generated.
create index if not exists user_search_strategies_user_updated_idx
  on public.user_search_strategies(user_id, updated_at desc);

-- RLS: users can only read/write their own rows. Same pattern as
-- user_career_profiles + user_cv_suggestions.
alter table public.user_search_strategies enable row level security;

drop policy if exists "user_search_strategies_own_rows" on public.user_search_strategies;
create policy "user_search_strategies_own_rows"
  on public.user_search_strategies
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
