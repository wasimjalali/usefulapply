-- Job Feed production-readiness foundation.
-- Run this after the existing core app schema is present.

create extension if not exists pgcrypto;

-- Normalize legacy plan values before enforcing the active plan model.
update public.profiles
set subscription_tier = case
  when subscription_tier = 'starter' then 'free'
  when subscription_tier in ('pro', 'enterprise') then 'max'
  else subscription_tier
end
where subscription_tier in ('starter', 'pro', 'enterprise');

update public.subscriptions
set tier = case
  when tier = 'starter' then 'free'
  when tier in ('pro', 'enterprise') then 'max'
  else tier
end
where tier in ('starter', 'pro', 'enterprise');

update public.user_credits
set plan_tier = case
  when plan_tier = 'starter' then 'free'
  when plan_tier = 'pro' then 'max'
  else plan_tier
end
where plan_tier in ('starter', 'pro');

update public.subscription_plans
set tier = case
  when tier = 'starter' then 'free'
  when tier = 'pro' then 'max'
  else tier
end
where tier in ('starter', 'pro');

alter table if exists public.profiles
  drop constraint if exists profiles_subscription_tier_supported_check;
alter table if exists public.profiles
  add constraint profiles_subscription_tier_supported_check
  check (subscription_tier in ('free', 'plus', 'max'));

alter table if exists public.subscriptions
  drop constraint if exists subscriptions_tier_supported_check;
alter table if exists public.subscriptions
  add constraint subscriptions_tier_supported_check
  check (tier in ('free', 'plus', 'max'));

alter table if exists public.user_credits
  drop constraint if exists user_credits_plan_tier_supported_check;
alter table if exists public.user_credits
  add constraint user_credits_plan_tier_supported_check
  check (plan_tier in ('free', 'plus', 'max'));

alter table if exists public.subscription_plans
  drop constraint if exists subscription_plans_tier_supported_check;
alter table if exists public.subscription_plans
  add constraint subscription_plans_tier_supported_check
  check (tier in ('free', 'plus', 'max'));

create table if not exists public.job_feed_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  consent_accepted_at timestamptz,
  user_timezone text not null default 'America/New_York',
  delivery_hour_local integer not null default 9 check (delivery_hour_local between 0 and 23),
  target_market text not null default 'us_canada' check (target_market in ('us', 'canada', 'us_canada')),
  target_countries text[] not null default array['us', 'ca'],
  target_cities text[] not null default '{}',
  target_roles text[] not null default '{}',
  adjacent_roles_enabled boolean not null default true,
  adjacent_roles text[] not null default '{}',
  preferred_locations text[] not null default '{}',
  remote_preference text not null default 'flexible'
    check (remote_preference in ('remote_only', 'remote_first', 'hybrid', 'onsite', 'flexible')),
  remote_preferences text[] not null default array['flexible'],
  salary_floor integer,
  languages text[] not null default array['English'],
  seniority_target text
    check (seniority_target is null or seniority_target in ('intern', 'junior', 'mid', 'senior', 'lead', 'staff', 'manager')),
  seniority_targets text[] not null default '{}',
  employment_types text[] not null default array['full_time'],
  work_authorization_status text
    check (work_authorization_status is null or work_authorization_status in ('authorized', 'needs_sponsorship', 'open_to_both')),
  aggressiveness text not null default 'balanced' check (aggressiveness in ('strict', 'balanced', 'broad')),
  user_skills text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_feed_settings_salary_floor_check check (salary_floor is null or salary_floor >= 0),
  constraint job_feed_settings_target_roles_check check (cardinality(target_roles) > 0),
  constraint job_feed_settings_target_countries_check check (cardinality(target_countries) > 0),
  constraint job_feed_settings_remote_preferences_check check (cardinality(remote_preferences) > 0),
  constraint job_feed_settings_employment_types_check check (cardinality(employment_types) > 0)
);

create table if not exists public.job_feed_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  local_timezone text not null,
  delivery_hour_local integer not null check (delivery_hour_local between 0 and 23),
  trigger_source text not null default 'scheduled',
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'skipped')),
  idempotency_key text not null,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  result_summary text,
  raw_jobs_fetched integer not null default 0,
  jobs_after_prefilter integer not null default 0,
  ranked_jobs_count integer not null default 0,
  ranking_mode text not null default 'sync' check (ranking_mode in ('sync', 'batch')),
  batch_id text,
  batch_input_file_id text,
  batch_status text,
  batch_submitted_at timestamptz,
  batch_completed_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date),
  unique (idempotency_key)
);

alter table if exists public.job_feed_runs
  add column if not exists ranking_mode text not null default 'sync',
  add column if not exists batch_id text,
  add column if not exists batch_input_file_id text,
  add column if not exists batch_status text,
  add column if not exists batch_submitted_at timestamptz,
  add column if not exists batch_completed_at timestamptz;

alter table if exists public.job_feed_runs
  drop constraint if exists job_feed_runs_ranking_mode_check;
alter table if exists public.job_feed_runs
  add constraint job_feed_runs_ranking_mode_check
  check (ranking_mode in ('sync', 'batch'));

create table if not exists public.job_feed_raw_fetches (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.job_feed_runs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'serpapi',
  status text not null default 'completed' check (status in ('completed', 'no_results', 'failed')),
  query_text text not null,
  market text not null check (market in ('us', 'canada', 'us_canada')),
  country_code text,
  language_code text,
  request_location text,
  request_filters text[] not null default '{}',
  page_number integer not null default 1,
  query_context jsonb not null default '{}',
  request_params jsonb not null default '{}',
  response_payload jsonb not null default '{}',
  response_error text,
  fetched_jobs_count integer not null default 0,
  next_page_token text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.job_feed_canonical_jobs (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  source_provider text not null default 'serpapi',
  source_job_id text,
  title text not null,
  title_normalized text not null,
  company text not null,
  company_normalized text not null,
  location_text text,
  location_normalized text,
  work_mode text not null default 'unknown' check (work_mode in ('remote', 'hybrid', 'onsite', 'unknown')),
  employment_type text check (employment_type is null or employment_type in ('full_time', 'part_time', 'contract', 'internship', 'temporary')),
  salary_text text,
  salary_min integer,
  salary_max integer,
  salary_currency text,
  description text,
  apply_url text,
  source_url text,
  posted_at_text text,
  freshness_days integer,
  source_identifiers jsonb not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_raw_fetch_id uuid references public.job_feed_raw_fetches(id) on delete set null,
  times_seen integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_feed_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  canonical_job_id uuid not null references public.job_feed_canonical_jobs(id) on delete cascade,
  latest_run_id uuid references public.job_feed_runs(id) on delete set null,
  application_session_id uuid references public.application_sessions(id) on delete set null,
  opened_at timestamptz,
  saved_at timestamptz,
  dismissed_at timestamptz,
  apply_started_at timestamptz,
  applied_at timestamptz,
  generation_status text not null default 'none'
    check (generation_status in ('none', 'pending', 'running', 'succeeded', 'failed', 'cancelled')),
  generation_error text,
  generation_started_at timestamptz,
  generation_completed_at timestamptz,
  generation_failed_at timestamptz,
  generation_cancelled_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, canonical_job_id),
  constraint job_feed_feedback_has_signal_check check (
    opened_at is not null
    or saved_at is not null
    or dismissed_at is not null
    or apply_started_at is not null
    or applied_at is not null
    or generation_status <> 'none'
    or metadata <> '{}'::jsonb
  )
);

create table if not exists public.job_feed_ranked_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.job_feed_runs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  canonical_job_id uuid not null references public.job_feed_canonical_jobs(id) on delete cascade,
  rank_position integer not null,
  fit_label text not null check (fit_label in ('strong', 'good')),
  ranking_source text not null default 'deterministic' check (ranking_source in ('deterministic', 'llm')),
  reason text,
  deterministic_score integer not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (run_id, canonical_job_id),
  unique (run_id, rank_position)
);

create table if not exists public.user_cv_suggestions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  suggestion jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_job_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  salary_floor integer,
  remote_preference text
    check (remote_preference is null or remote_preference in ('remote_only', 'remote_first', 'hybrid', 'onsite', 'flexible')),
  employment_types text[] not null default '{}',
  target_roles text[] not null default '{}',
  user_skills text[] not null default '{}',
  target_market text check (target_market is null or target_market in ('us', 'canada', 'us_canada')),
  seniority_target text
    check (seniority_target is null or seniority_target in ('intern', 'junior', 'mid', 'senior', 'lead', 'staff', 'manager')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.job_feed_feedback
  add column if not exists apply_started_at timestamptz,
  add column if not exists generation_status text not null default 'none',
  add column if not exists generation_error text,
  add column if not exists generation_started_at timestamptz,
  add column if not exists generation_completed_at timestamptz,
  add column if not exists generation_failed_at timestamptz,
  add column if not exists generation_cancelled_at timestamptz;

alter table if exists public.application_sessions
  add column if not exists generation_status text not null default 'none',
  add column if not exists generation_error text,
  add column if not exists generation_started_at timestamptz,
  add column if not exists generation_completed_at timestamptz,
  add column if not exists generation_failed_at timestamptz,
  add column if not exists generation_cancelled_at timestamptz;

alter table if exists public.application_sessions
  drop constraint if exists application_sessions_generation_status_check;
alter table if exists public.application_sessions
  add constraint application_sessions_generation_status_check
  check (generation_status in ('none', 'pending', 'running', 'succeeded', 'failed', 'cancelled'));

alter table if exists public.job_feed_feedback
  drop constraint if exists job_feed_feedback_generation_status_check;
alter table if exists public.job_feed_feedback
  add constraint job_feed_feedback_generation_status_check
  check (generation_status in ('none', 'pending', 'running', 'succeeded', 'failed', 'cancelled'));

create unique index if not exists job_feed_feedback_user_job_uidx
  on public.job_feed_feedback(user_id, canonical_job_id);
create index if not exists job_feed_feedback_user_session_idx
  on public.job_feed_feedback(user_id, application_session_id);
create index if not exists job_feed_ranked_items_user_job_idx
  on public.job_feed_ranked_items(user_id, canonical_job_id);
create index if not exists job_feed_ranked_items_run_rank_idx
  on public.job_feed_ranked_items(run_id, rank_position);
create index if not exists job_feed_runs_user_created_idx
  on public.job_feed_runs(user_id, created_at desc);
create index if not exists job_feed_runs_batch_id_idx
  on public.job_feed_runs(batch_id)
  where batch_id is not null;
create index if not exists job_feed_raw_fetches_run_idx
  on public.job_feed_raw_fetches(run_id);
create index if not exists job_feed_canonical_jobs_last_seen_idx
  on public.job_feed_canonical_jobs(last_seen_at desc);

alter table public.job_feed_settings enable row level security;
alter table public.job_feed_runs enable row level security;
alter table public.job_feed_raw_fetches enable row level security;
alter table public.job_feed_feedback enable row level security;
alter table public.job_feed_ranked_items enable row level security;
alter table public.job_feed_canonical_jobs enable row level security;
alter table public.user_cv_suggestions enable row level security;
alter table public.user_job_preferences enable row level security;

drop policy if exists "job_feed_settings_own_rows" on public.job_feed_settings;
create policy "job_feed_settings_own_rows"
  on public.job_feed_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "job_feed_runs_own_rows" on public.job_feed_runs;
create policy "job_feed_runs_own_rows"
  on public.job_feed_runs
  for select
  using (auth.uid() = user_id);

drop policy if exists "job_feed_raw_fetches_own_rows" on public.job_feed_raw_fetches;
create policy "job_feed_raw_fetches_own_rows"
  on public.job_feed_raw_fetches
  for select
  using (auth.uid() = user_id);

drop policy if exists "job_feed_feedback_own_rows" on public.job_feed_feedback;
create policy "job_feed_feedback_own_rows"
  on public.job_feed_feedback
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "job_feed_ranked_items_own_rows" on public.job_feed_ranked_items;
create policy "job_feed_ranked_items_own_rows"
  on public.job_feed_ranked_items
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_cv_suggestions_own_rows" on public.user_cv_suggestions;
create policy "user_cv_suggestions_own_rows"
  on public.user_cv_suggestions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_job_preferences_own_rows" on public.user_job_preferences;
create policy "user_job_preferences_own_rows"
  on public.user_job_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
