-- Drop the Azure Batch API columns from job_feed_runs. Job Feed is
-- real-time on-click only after the 2026-04-30 refactor; nothing in the
-- codebase reads these columns anymore and zero rows carry batch data.
--
-- Also drops the two partial indexes that referenced them, and the
-- ranking_mode CHECK since the whole column is going away.
--
-- Run in Supabase SQL Editor. Non-destructive for user data (verified:
-- 0 rows have batch_id or batch_status set). Reversible by re-adding
-- the columns in a new migration if ever needed.

begin;

drop index if exists public.job_feed_runs_batch_pending_idx;
drop index if exists public.job_feed_runs_batch_id_idx;

alter table public.job_feed_runs
  drop constraint if exists job_feed_runs_ranking_mode_check;

alter table public.job_feed_runs
  drop column if exists batch_id,
  drop column if exists batch_input_file_id,
  drop column if exists batch_output_file_id,
  drop column if exists batch_status,
  drop column if exists batch_submitted_at,
  drop column if exists batch_completed_at,
  drop column if exists ranking_mode;

commit;
