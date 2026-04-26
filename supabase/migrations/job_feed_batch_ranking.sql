-- Azure OpenAI Batch API columns on job_feed_runs.
-- Scheduled runs can be ranked via the Batch API (50% discount, 24h SLA)
-- instead of the synchronous path. We persist the batch identifier and
-- status on the run row so a separate poller can reconcile completed
-- batches back into ranked_items / run metadata.

ALTER TABLE public.job_feed_runs
  ADD COLUMN IF NOT EXISTS ranking_mode text
    CHECK (ranking_mode IN ('sync', 'batch'))
    DEFAULT 'sync',
  ADD COLUMN IF NOT EXISTS batch_id text,
  ADD COLUMN IF NOT EXISTS batch_input_file_id text,
  ADD COLUMN IF NOT EXISTS batch_output_file_id text,
  ADD COLUMN IF NOT EXISTS batch_status text,
  ADD COLUMN IF NOT EXISTS batch_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS batch_completed_at timestamptz;

-- Look up runs awaiting batch reconciliation.
CREATE INDEX IF NOT EXISTS job_feed_runs_batch_pending_idx
  ON public.job_feed_runs (batch_status)
  WHERE ranking_mode = 'batch'
    AND batch_status IS DISTINCT FROM 'completed'
    AND batch_status IS DISTINCT FROM 'failed'
    AND batch_status IS DISTINCT FROM 'cancelled'
    AND batch_status IS DISTINCT FROM 'expired';

COMMENT ON COLUMN public.job_feed_runs.ranking_mode IS
  'sync = direct Azure OpenAI call (manual force-reruns). batch = submitted via Batch API (scheduled overnight).';

COMMENT ON COLUMN public.job_feed_runs.batch_id IS
  'Azure OpenAI batch.id when ranking_mode=batch. Used by the reconciler to fetch results.';

COMMENT ON COLUMN public.job_feed_runs.batch_status IS
  'validating | in_progress | finalizing | completed | failed | expired | cancelling | cancelled (Azure OpenAI batch states).';
