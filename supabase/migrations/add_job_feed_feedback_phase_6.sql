-- ============================================================
-- Daily Feed Phase 6 - Apply Handoff & Feedback
-- Adds durable feedback state plus application-session linkage
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_feed_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  canonical_job_id UUID NOT NULL REFERENCES public.job_feed_canonical_jobs(id) ON DELETE CASCADE,
  latest_run_id UUID REFERENCES public.job_feed_runs(id) ON DELETE SET NULL,
  application_session_id UUID REFERENCES public.application_sessions(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ,
  saved_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT job_feed_feedback_user_job_unique UNIQUE (user_id, canonical_job_id),
  CONSTRAINT job_feed_feedback_has_signal_check CHECK (
    opened_at IS NOT NULL
    OR saved_at IS NOT NULL
    OR dismissed_at IS NOT NULL
    OR applied_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_job_feed_feedback_user_updated_at
  ON public.job_feed_feedback (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_feed_feedback_user_dismissed_at
  ON public.job_feed_feedback (user_id, dismissed_at)
  WHERE dismissed_at IS NOT NULL;

COMMENT ON TABLE public.job_feed_feedback IS 'Per-user feedback state for surfaced feed jobs, including apply handoff linkage.';
COMMENT ON COLUMN public.job_feed_feedback.latest_run_id IS 'The completed feed run that surfaced this job when the feedback was recorded.';
COMMENT ON COLUMN public.job_feed_feedback.application_session_id IS 'The Karko application session created from Apply with Karko AI for this job, when present.';

ALTER TABLE public.job_feed_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own job feed feedback" ON public.job_feed_feedback;
CREATE POLICY "Users can view own job feed feedback"
  ON public.job_feed_feedback FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own job feed feedback" ON public.job_feed_feedback;
CREATE POLICY "Users can insert own job feed feedback"
  ON public.job_feed_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own job feed feedback" ON public.job_feed_feedback;
CREATE POLICY "Users can update own job feed feedback"
  ON public.job_feed_feedback FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_job_feed_feedback_updated_at ON public.job_feed_feedback;
CREATE TRIGGER update_job_feed_feedback_updated_at
  BEFORE UPDATE ON public.job_feed_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMIT;
