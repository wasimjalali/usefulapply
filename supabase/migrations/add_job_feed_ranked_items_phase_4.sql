-- ============================================================
-- Daily Feed Phase 4 - Ranked Feed Items
-- Adds durable ranked feed rows materialized from the shortlist
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_feed_ranked_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.job_feed_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  canonical_job_id UUID NOT NULL REFERENCES public.job_feed_canonical_jobs(id) ON DELETE CASCADE,
  rank_position SMALLINT NOT NULL,
  fit_label TEXT NOT NULL,
  ranking_source TEXT NOT NULL DEFAULT 'deterministic',
  reason TEXT,
  deterministic_score INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT job_feed_ranked_items_run_job_unique UNIQUE (run_id, canonical_job_id),
  CONSTRAINT job_feed_ranked_items_run_rank_unique UNIQUE (run_id, rank_position),
  CONSTRAINT job_feed_ranked_items_rank_check CHECK (rank_position >= 1),
  CONSTRAINT job_feed_ranked_items_fit_label_check CHECK (fit_label IN ('strong', 'good')),
  CONSTRAINT job_feed_ranked_items_source_check CHECK (ranking_source IN ('deterministic', 'llm')),
  CONSTRAINT job_feed_ranked_items_deterministic_score_check CHECK (deterministic_score >= 0)
);

CREATE INDEX IF NOT EXISTS idx_job_feed_ranked_items_run_rank
  ON public.job_feed_ranked_items (run_id, rank_position ASC);

CREATE INDEX IF NOT EXISTS idx_job_feed_ranked_items_user_created_at
  ON public.job_feed_ranked_items (user_id, created_at DESC);

COMMENT ON TABLE public.job_feed_ranked_items IS 'Materialized ranked feed items for a completed daily feed run.';
COMMENT ON COLUMN public.job_feed_ranked_items.rank_position IS 'The visible order for the surfaced feed items within a run.';
COMMENT ON COLUMN public.job_feed_ranked_items.ranking_source IS 'Whether the final fit label came from deterministic fallback logic or the LLM ranking pass.';

ALTER TABLE public.job_feed_ranked_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own job feed ranked items" ON public.job_feed_ranked_items;
CREATE POLICY "Users can view own job feed ranked items"
  ON public.job_feed_ranked_items FOR SELECT
  USING (auth.uid() = user_id);

COMMIT;
