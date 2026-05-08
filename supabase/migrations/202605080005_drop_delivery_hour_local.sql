-- Job Feed Intelligence — Milestone D3
-- ----------------------------------------------------------------------------
-- Drop `delivery_hour_local` from `job_feed_settings`.
--
-- The legacy daily-delivery scheduler is gone. Karko now runs feeds in real
-- time when the user opens the panel, so the "deliver at hour X" preference
-- has no consumer left in the codebase. The column was carrying stale UI
-- state and showing up in the wizard as a confusing "when do you want it"
-- control with no behavioral effect.
--
-- The companion `user_timezone` column STAYS — we still need it to group
-- jobs by the user's local day in the 7-day inbox so yesterday's feed
-- doesn't bleed into today's view.
-- ----------------------------------------------------------------------------

alter table public.job_feed_settings
  drop column if exists delivery_hour_local;

-- Same column also lived as a settings_snapshot field on job_feed_runs.
-- Drop there too so historical reads don't depend on a value we no longer
-- compute.
alter table public.job_feed_runs
  drop column if exists delivery_hour_local;
