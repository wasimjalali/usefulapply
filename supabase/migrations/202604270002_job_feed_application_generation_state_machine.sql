-- Durable Job Feed application-generation state machine.
-- Run after 202604270001_job_feed_production_readiness.sql.

create extension if not exists pgcrypto;

create table if not exists public.job_feed_application_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  canonical_job_id uuid not null references public.job_feed_canonical_jobs(id) on delete cascade,
  ranked_item_id uuid references public.job_feed_ranked_items(id) on delete set null,
  run_id uuid references public.job_feed_runs(id) on delete set null,
  application_session_id uuid not null references public.application_sessions(id) on delete cascade,
  status text not null default 'intent_created'
    check (status in ('intent_created', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired')),
  attempt integer not null default 1 check (attempt >= 1),
  lease_owner text,
  lease_expires_at timestamptz,
  last_heartbeat_at timestamptz,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}',
  intent_created_at timestamptz not null default now(),
  queued_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, canonical_job_id, application_session_id)
);

create table if not exists public.job_feed_application_generation_events (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.job_feed_application_generations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  from_status text,
  to_status text not null
    check (to_status in ('intent_created', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired')),
  attempt integer not null check (attempt >= 1),
  transition_reason text,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint job_feed_generation_events_from_status_check
    check (from_status is null or from_status in ('intent_created', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired'))
);

create index if not exists job_feed_app_generations_user_status_idx
  on public.job_feed_application_generations(user_id, status, updated_at desc);
create index if not exists job_feed_app_generations_session_idx
  on public.job_feed_application_generations(user_id, application_session_id);
create index if not exists job_feed_app_generations_job_idx
  on public.job_feed_application_generations(user_id, canonical_job_id);
create index if not exists job_feed_app_generations_stale_running_idx
  on public.job_feed_application_generations(status, lease_expires_at)
  where status in ('queued', 'running');
create index if not exists job_feed_app_generation_events_generation_idx
  on public.job_feed_application_generation_events(generation_id, created_at);

alter table public.job_feed_application_generations enable row level security;
alter table public.job_feed_application_generation_events enable row level security;

drop policy if exists "job_feed_application_generations_own_rows" on public.job_feed_application_generations;
create policy "job_feed_application_generations_own_rows"
  on public.job_feed_application_generations
  for select
  using (auth.uid() = user_id);

drop policy if exists "job_feed_application_generation_events_own_rows" on public.job_feed_application_generation_events;
create policy "job_feed_application_generation_events_own_rows"
  on public.job_feed_application_generation_events
  for select
  using (auth.uid() = user_id);
