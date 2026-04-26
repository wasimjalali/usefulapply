-- Supporting indexes for the user-exclusion pipeline:
-- the feed-ranker now filters out canonical jobs where the user has
-- applied, dismissed, or rated 'not_relevant' BEFORE ranking. These
-- indexes keep that filter cheap as the feedback table grows.
--
-- Partial index on applied_at mirrors the existing partial index on
-- dismissed_at so both halves of the `.or(applied_at.not.is.null,
-- dismissed_at.not.is.null)` predicate are index-covered.
CREATE INDEX IF NOT EXISTS idx_job_feed_feedback_user_applied_at
  ON public.job_feed_feedback (user_id, applied_at)
  WHERE applied_at IS NOT NULL;

-- GIN index on metadata so .contains({ match_rating: 'not_relevant' })
-- lookups use an index instead of a sequential scan. Metadata holds
-- sparse JSONB, which GIN handles well at this scale.
CREATE INDEX IF NOT EXISTS idx_job_feed_feedback_metadata_gin
  ON public.job_feed_feedback USING GIN (metadata);
