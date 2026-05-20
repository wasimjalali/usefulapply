-- Document job_feed_canonical_jobs as service-role-only by design.
--
-- The table has RLS enabled (from 202604270001_job_feed_production_readiness.sql:318)
-- with zero policies, which denies all access to non-service-role clients.
-- This is intentional: every read and write happens server-side via the
-- service-role client (src/lib/job-feed/ingestion.ts, server.ts, cleanup.ts).
-- No client component or browser-side caller touches this table.
--
-- This migration only updates the table comment to document the intent,
-- so future readers (and audits) don't mistake the missing policies for a
-- forgotten lock-down step. Matches the pattern already used by
-- public.webhook_events.

COMMENT ON TABLE public.job_feed_canonical_jobs IS
  'Normalized canonical jobs reused across fetches, feeds, and ranking/apply flows. Service-role only by design — RLS is enabled with no policies, so non-service-role clients are denied all access. All access happens server-side in src/lib/job-feed/{ingestion,server,cleanup}.ts.';
