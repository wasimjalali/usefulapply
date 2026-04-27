-- Job Feed DB-first architecture: settings snapshot, credit reservations,
-- notifications outbox, schema fixes, and missing triggers/indexes.
-- Run after 202604270002_job_feed_application_generation_state_machine.sql.

-- =====================================================
-- 1. Settings snapshot on job_feed_runs
-- =====================================================

alter table public.job_feed_runs
  add column if not exists settings_snapshot jsonb;

comment on column public.job_feed_runs.settings_snapshot is
  'Immutable copy of job_feed_settings at the time this run was created. '
  'UI should display run-specific labels from this snapshot, not current settings.';

-- =====================================================
-- 2. Credit reservations table
-- =====================================================

create table if not exists public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  generation_id uuid references public.job_feed_application_generations(id) on delete set null,
  session_id uuid references public.application_sessions(id) on delete set null,
  action text not null,
  amount numeric not null check (amount > 0),
  status text not null default 'reserved'
    check (status in ('reserved', 'captured', 'released', 'refunded')),
  reserved_at timestamptz not null default now(),
  captured_at timestamptz,
  released_at timestamptz,
  refunded_at timestamptz,
  idempotency_key text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index if not exists credit_reservations_user_status_idx
  on public.credit_reservations(user_id, status);
create index if not exists credit_reservations_generation_idx
  on public.credit_reservations(generation_id)
  where generation_id is not null;
create index if not exists credit_reservations_session_idx
  on public.credit_reservations(session_id)
  where session_id is not null;

alter table public.credit_reservations enable row level security;

drop policy if exists "credit_reservations_own_rows_select" on public.credit_reservations;
create policy "credit_reservations_own_rows_select"
  on public.credit_reservations
  for select
  using (auth.uid() = user_id);

-- Writes happen through service role only (server-side credit flow).

-- =====================================================
-- 3. User notifications outbox
-- =====================================================

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'feed_ready',
      'feed_empty',
      'feed_thin',
      'feed_failed',
      'new_jobs_available',
      'job_saved',
      'job_dismissed',
      'generation_started',
      'generation_succeeded',
      'generation_failed',
      'generation_cancelled',
      'generation_expired',
      'retry_available'
    )),
  title text not null,
  body text,
  payload jsonb not null default '{}',
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_unread_idx
  on public.user_notifications(user_id, created_at desc)
  where read_at is null and dismissed_at is null;
create index if not exists user_notifications_user_created_idx
  on public.user_notifications(user_id, created_at desc);

alter table public.user_notifications enable row level security;

drop policy if exists "user_notifications_own_rows" on public.user_notifications;
create policy "user_notifications_own_rows"
  on public.user_notifications
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =====================================================
-- 4. Missing updated_at trigger on job_feed_application_generations
-- =====================================================

create or replace trigger update_job_feed_application_generations_updated_at
  before update on public.job_feed_application_generations
  for each row
  execute function update_updated_at();

-- =====================================================
-- 5. Missing updated_at trigger on credit_reservations
-- =====================================================

create or replace trigger update_credit_reservations_updated_at
  before update on public.credit_reservations
  for each row
  execute function update_updated_at();

-- =====================================================
-- 6. Fix ranking_mode NOT NULL (currently nullable in live DB)
-- =====================================================

update public.job_feed_runs
  set ranking_mode = 'sync'
  where ranking_mode is null;

alter table public.job_feed_runs
  alter column ranking_mode set not null;

-- =====================================================
-- 7. Fix credit_transactions.created_at NOT NULL
-- =====================================================

update public.credit_transactions
  set created_at = now()
  where created_at is null;

alter table public.credit_transactions
  alter column created_at set not null;

-- =====================================================
-- 8. Drop duplicate indexes (safe — the primary unique/index remains)
-- =====================================================

-- job_feed_feedback: keep job_feed_feedback_user_job_uidx, drop the duplicate constraint
alter table public.job_feed_feedback
  drop constraint if exists job_feed_feedback_user_job_unique;

-- job_feed_ranked_items: keep job_feed_ranked_items_run_rank_idx, drop duplicate
drop index if exists public.idx_job_feed_ranked_items_run_rank;

-- job_feed_canonical_jobs: keep job_feed_canonical_jobs_last_seen_idx, drop duplicate
drop index if exists public.idx_job_feed_canonical_jobs_last_seen_at;

-- =====================================================
-- 9. Add job_feed_last_seen_run_date to profiles for cross-device badge sync
-- =====================================================

alter table public.profiles
  add column if not exists job_feed_last_seen_run_date date;

-- =====================================================
-- 10. Cascade user_notifications on account deletion
-- (already handled by ON DELETE CASCADE on user_id FK)
-- Cascade credit_reservations on account deletion
-- (already handled by ON DELETE CASCADE on user_id FK)
-- =====================================================

-- =====================================================
-- 11. Add generated artifacts JSONB column to application_sessions
-- for server-side persistence of generation output
-- =====================================================

alter table public.application_sessions
  add column if not exists generated_artifacts jsonb;

comment on column public.application_sessions.generated_artifacts is
  'Server-persisted generation output (CV, cover letter, email, follow-up). '
  'Written by agent-v2 route before marking generation succeeded. '
  'The browser-side useSupabaseSync also writes individual columns for '
  'backward compatibility, but this column is the authoritative server copy.';
