-- =============================================================================
-- JOB FEED DIAGNOSTIC QUERIES
-- Run these in the Supabase SQL Editor to diagnose why the job feed isn't
-- producing results. Execute each section in order — each one narrows the
-- search.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CHECK YOUR USER PROFILE & SUBSCRIPTION TIER
-- The feed requires subscription_tier = 'plus' or 'max'.
-- Replace the email below with your own.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  p.id AS user_id,
  au.email,
  p.subscription_tier,
  CASE
    WHEN p.subscription_tier IN ('plus', 'max') THEN '✅ Tier OK'
    ELSE '❌ BLOCKED — tier must be plus or max, got: ' || COALESCE(p.subscription_tier, 'NULL')
  END AS tier_check
FROM profiles p
JOIN auth.users au ON au.id = p.id
WHERE au.email = 'wasim@karkoai.com';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CHECK JOB FEED SETTINGS
-- The feed needs: enabled=true, consent_accepted_at IS NOT NULL,
-- target_roles is non-empty, user_timezone is set.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  jfs.user_id,
  jfs.enabled,
  jfs.consent_accepted_at,
  jfs.user_timezone,
  jfs.delivery_hour_local,
  jfs.target_market,
  jfs.target_countries,
  jfs.target_cities,
  jfs.target_roles,
  jfs.adjacent_roles_enabled,
  jfs.adjacent_roles,
  jfs.preferred_locations,
  jfs.remote_preference,
  jfs.remote_preferences,
  jfs.salary_floor,
  jfs.seniority_target,
  jfs.seniority_targets,
  jfs.employment_types,
  jfs.work_authorization_status,
  jfs.aggressiveness,
  jfs.user_skills,
  jfs.languages,
  CASE WHEN jfs.enabled = true THEN '✅' ELSE '❌ Feed is disabled' END AS enabled_check,
  CASE WHEN jfs.consent_accepted_at IS NOT NULL THEN '✅' ELSE '❌ Consent not accepted' END AS consent_check,
  CASE WHEN array_length(jfs.target_roles, 1) > 0 THEN '✅ ' || array_length(jfs.target_roles, 1) || ' roles' ELSE '❌ No target roles' END AS roles_check,
  CASE WHEN jfs.user_timezone IS NOT NULL AND jfs.user_timezone != '' THEN '✅' ELSE '❌ No timezone' END AS tz_check
FROM job_feed_settings jfs
JOIN auth.users au ON au.id = jfs.user_id
WHERE au.email = 'wasim@karkoai.com';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CHECK DELIVERY HOUR vs CURRENT TIME
-- The cron fires every hour. The sweep only picks up users whose
-- delivery_hour_local matches the current hour in their timezone.
-- This tells you whether *right now* is (or was) the correct delivery window.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  jfs.user_id,
  jfs.user_timezone,
  jfs.delivery_hour_local,
  -- Current hour in the user's timezone
  EXTRACT(HOUR FROM NOW() AT TIME ZONE jfs.user_timezone)::int AS current_hour_in_tz,
  CASE
    WHEN EXTRACT(HOUR FROM NOW() AT TIME ZONE jfs.user_timezone)::int = jfs.delivery_hour_local
    THEN '✅ Current hour matches delivery_hour_local'
    ELSE '⏳ Not yet — delivery at ' || jfs.delivery_hour_local || ':00 local, currently ' ||
         EXTRACT(HOUR FROM NOW() AT TIME ZONE jfs.user_timezone)::int || ':00 local'
  END AS delivery_window_check,
  -- When is the next delivery in UTC?
  (
    CASE
      WHEN EXTRACT(HOUR FROM NOW() AT TIME ZONE jfs.user_timezone)::int < jfs.delivery_hour_local
      THEN (DATE_TRUNC('day', NOW() AT TIME ZONE jfs.user_timezone) + (jfs.delivery_hour_local || ' hours')::interval) AT TIME ZONE jfs.user_timezone
      ELSE (DATE_TRUNC('day', NOW() AT TIME ZONE jfs.user_timezone) + INTERVAL '1 day' + (jfs.delivery_hour_local || ' hours')::interval) AT TIME ZONE jfs.user_timezone
    END
  ) AS next_delivery_utc
FROM job_feed_settings jfs
JOIN auth.users au ON au.id = jfs.user_id
WHERE au.email = 'wasim@karkoai.com';


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CHECK ALL JOB FEED RUNS (most recent first)
-- Shows whether runs were created, completed, failed, or are stuck.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  r.id AS run_id,
  r.local_date,
  r.status,
  r.trigger_source,
  r.raw_jobs_fetched,
  r.jobs_after_prefilter,
  r.ranked_jobs_count,
  r.error_message,
  r.result_summary,
  r.created_at,
  r.started_at,
  r.completed_at,
  CASE
    WHEN r.status = 'completed' THEN '✅ Completed'
    WHEN r.status = 'running' AND r.started_at < NOW() - INTERVAL '10 minutes' THEN '❌ STUCK — running for > 10 min'
    WHEN r.status = 'running' THEN '⏳ In progress'
    WHEN r.status = 'failed' THEN '❌ Failed: ' || COALESCE(r.error_message, 'no message')
    WHEN r.status = 'queued' THEN '⏳ Queued'
    ELSE '❓ Status: ' || r.status
  END AS run_status_check
FROM job_feed_runs r
JOIN auth.users au ON au.id = r.user_id
WHERE au.email = 'wasim@karkoai.com'
ORDER BY r.created_at DESC
LIMIT 10;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CHECK TODAY'S RUN SPECIFICALLY
-- The workflow is idempotent per local_date. If a run exists for today
-- (in the user's timezone), a new one won't be created unless forced.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  r.id AS run_id,
  r.local_date,
  r.status,
  r.trigger_source,
  r.raw_jobs_fetched,
  r.jobs_after_prefilter,
  r.ranked_jobs_count,
  r.error_message,
  r.result_summary,
  r.metadata,
  r.created_at,
  r.started_at,
  r.completed_at
FROM job_feed_runs r
JOIN auth.users au ON au.id = r.user_id
WHERE au.email = 'wasim@karkoai.com'
  AND r.local_date = (
    NOW() AT TIME ZONE (
      SELECT jfs.user_timezone
      FROM job_feed_settings jfs
      WHERE jfs.user_id = r.user_id
    )
  )::date
LIMIT 1;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. CHECK RAW FETCHES (SerpAPI results)
-- Shows the SerpAPI calls for the most recent run and whether they succeeded.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  rf.id AS fetch_id,
  rf.run_id,
  rf.status,
  rf.query_text,
  rf.country_code,
  rf.language_code,
  rf.request_location,
  rf.fetched_jobs_count,
  rf.response_error,
  rf.fetched_at,
  rf.request_params
FROM job_feed_raw_fetches rf
WHERE rf.run_id = (
  SELECT r.id FROM job_feed_runs r
  JOIN auth.users au ON au.id = r.user_id
  WHERE au.email = 'wasim@karkoai.com'
  ORDER BY r.created_at DESC
  LIMIT 1
)
ORDER BY rf.fetched_at;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. CHECK CANONICAL JOBS (deduplicated job store)
-- Shows the most recently seen jobs. If this is empty, ingestion failed.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  cj.id,
  cj.title,
  cj.company,
  cj.location_text,
  cj.work_mode,
  cj.employment_type,
  cj.salary_text,
  cj.freshness_days,
  cj.apply_url,
  cj.first_seen_at,
  cj.last_seen_at,
  cj.times_seen
FROM job_feed_canonical_jobs cj
WHERE cj.last_raw_fetch_id IN (
  SELECT rf.id FROM job_feed_raw_fetches rf
  WHERE rf.run_id = (
    SELECT r.id FROM job_feed_runs r
    JOIN auth.users au ON au.id = r.user_id
    WHERE au.email = 'wasim@karkoai.com'
    ORDER BY r.created_at DESC
    LIMIT 1
  )
)
ORDER BY cj.freshness_days ASC NULLS LAST, cj.last_seen_at DESC
LIMIT 20;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. CHECK RANKED ITEMS (final shortlisted jobs shown in feed)
-- If this is empty but canonical_jobs exist, ranking failed or filtered all.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  ri.id,
  ri.canonical_job_id,
  ri.rank_position,
  ri.fit_label,
  ri.ranking_source,
  ri.reason,
  ri.deterministic_score,
  cj.title,
  cj.company,
  cj.location_text,
  cj.work_mode
FROM job_feed_ranked_items ri
JOIN job_feed_canonical_jobs cj ON cj.id = ri.canonical_job_id
WHERE ri.run_id = (
  SELECT r.id FROM job_feed_runs r
  JOIN auth.users au ON au.id = r.user_id
  WHERE au.email = 'wasim@karkoai.com'
  ORDER BY r.created_at DESC
  LIMIT 1
)
ORDER BY ri.rank_position ASC;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. CHECK RUN METADATA (detailed diagnostics)
-- Contains the full pipeline breakdown: ranking status, candidate counts,
-- failed fetches, ranking model info, etc.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  r.id AS run_id,
  r.status,
  r.metadata->>'stage' AS stage,
  r.metadata->>'orchestrator' AS orchestrator,
  r.metadata->>'workflow_status' AS workflow_status,
  r.metadata->>'ranking_status' AS ranking_status,
  r.metadata->>'ranking_error' AS ranking_error,
  (r.metadata->>'canonical_jobs_count')::int AS canonical_jobs_count,
  (r.metadata->>'prefilter_survivors_count')::int AS prefilter_survivors_count,
  (r.metadata->>'ranking_candidate_count')::int AS ranking_candidate_count,
  (r.metadata->>'duplicate_count')::int AS duplicate_count,
  r.metadata->'ranking_model' AS ranking_model_info,
  r.metadata->'failed_fetches' AS failed_fetches,
  r.metadata->'prefilter_rejections_by_reason' AS prefilter_rejections,
  r.metadata->>'ranked_items_materialized' AS ranked_items_materialized
FROM job_feed_runs r
JOIN auth.users au ON au.id = r.user_id
WHERE au.email = 'wasim@karkoai.com'
ORDER BY r.created_at DESC
LIMIT 3;


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. CHECK FEEDBACK (user interactions with feed items)
-- Shows saved, dismissed, opened, applied actions.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  f.id,
  f.canonical_job_id,
  cj.title,
  cj.company,
  f.opened_at,
  f.saved_at,
  f.dismissed_at,
  f.applied_at,
  f.application_session_id,
  f.created_at
FROM job_feed_feedback f
JOIN job_feed_canonical_jobs cj ON cj.id = f.canonical_job_id
JOIN auth.users au ON au.id = f.user_id
WHERE au.email = 'wasim@karkoai.com'
ORDER BY f.created_at DESC
LIMIT 20;


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. ALL-IN-ONE HEALTH CHECK
-- A single query that checks every prerequisite and reports what's blocking.
-- ─────────────────────────────────────────────────────────────────────────────

WITH user_info AS (
  SELECT au.id AS user_id, au.email
  FROM auth.users au
  WHERE au.email = 'wasim@karkoai.com'
),
profile_info AS (
  SELECT p.id, p.subscription_tier
  FROM profiles p
  JOIN user_info ui ON ui.user_id = p.id
),
settings_info AS (
  SELECT jfs.*
  FROM job_feed_settings jfs
  JOIN user_info ui ON ui.user_id = jfs.user_id
),
latest_run AS (
  SELECT r.*
  FROM job_feed_runs r
  JOIN user_info ui ON ui.user_id = r.user_id
  ORDER BY r.created_at DESC
  LIMIT 1
),
latest_completed_run AS (
  SELECT r.*
  FROM job_feed_runs r
  JOIN user_info ui ON ui.user_id = r.user_id
  WHERE r.status = 'completed'
  ORDER BY r.created_at DESC
  LIMIT 1
),
ranked_count AS (
  SELECT COUNT(*) AS cnt
  FROM job_feed_ranked_items ri
  JOIN latest_completed_run lcr ON lcr.id = ri.run_id
)
SELECT
  '1. Profile' AS check_name,
  CASE
    WHEN pi.subscription_tier IN ('plus', 'max') THEN '✅ ' || pi.subscription_tier
    WHEN pi.subscription_tier IS NULL THEN '❌ No profile found'
    ELSE '❌ Tier = ' || pi.subscription_tier || ' (need plus or max)'
  END AS result
FROM profile_info pi

UNION ALL

SELECT
  '2. Settings exist',
  CASE WHEN si.user_id IS NOT NULL THEN '✅ Found' ELSE '❌ No settings row' END
FROM user_info ui
LEFT JOIN settings_info si ON si.user_id = ui.user_id

UNION ALL

SELECT
  '3. Feed enabled',
  CASE WHEN si.enabled = true THEN '✅ Enabled' ELSE '❌ Disabled' END
FROM settings_info si

UNION ALL

SELECT
  '4. Consent accepted',
  CASE WHEN si.consent_accepted_at IS NOT NULL THEN '✅ ' || si.consent_accepted_at::text ELSE '❌ NULL' END
FROM settings_info si

UNION ALL

SELECT
  '5. Target roles',
  CASE
    WHEN array_length(si.target_roles, 1) > 0 THEN '✅ ' || array_to_string(si.target_roles, ', ')
    ELSE '❌ No roles configured'
  END
FROM settings_info si

UNION ALL

SELECT
  '6. Timezone',
  '✅ ' || si.user_timezone || ' | delivery at ' || si.delivery_hour_local || ':00 local'
FROM settings_info si

UNION ALL

SELECT
  '7. Current local hour',
  EXTRACT(HOUR FROM NOW() AT TIME ZONE si.user_timezone)::text || ':00 ' ||
  CASE
    WHEN EXTRACT(HOUR FROM NOW() AT TIME ZONE si.user_timezone)::int = si.delivery_hour_local
    THEN '✅ (matches delivery hour!)'
    ELSE '⏳ (delivery at ' || si.delivery_hour_local || ':00)'
  END
FROM settings_info si

UNION ALL

SELECT
  '8. Latest run',
  CASE
    WHEN lr.id IS NULL THEN '❌ No runs found — feed has never executed'
    ELSE lr.status || ' | ' || lr.local_date || ' | trigger: ' || lr.trigger_source ||
         ' | fetched: ' || COALESCE(lr.raw_jobs_fetched::text, '?') ||
         ' | ranked: ' || COALESCE(lr.ranked_jobs_count::text, '?')
  END
FROM user_info ui
LEFT JOIN latest_run lr ON true

UNION ALL

SELECT
  '9. Latest run error',
  CASE
    WHEN lr.id IS NULL THEN '—'
    WHEN lr.error_message IS NOT NULL THEN '❌ ' || lr.error_message
    ELSE '✅ No error'
  END
FROM user_info ui
LEFT JOIN latest_run lr ON true

UNION ALL

SELECT
  '10. Ranked items visible',
  CASE
    WHEN rc.cnt > 0 THEN '✅ ' || rc.cnt || ' ranked items'
    WHEN lcr.id IS NOT NULL THEN '❌ 0 ranked items in latest completed run'
    ELSE '— No completed runs'
  END
FROM user_info ui
LEFT JOIN latest_completed_run lcr ON true
LEFT JOIN ranked_count rc ON true

ORDER BY check_name;


-- ─────────────────────────────────────────────────────────────────────────────
-- 12. RESET A STUCK/FAILED RUN (use with caution)
-- If a run is stuck in 'running' or 'queued' status, this marks it as failed
-- so the next scheduled run can proceed.
-- Uncomment and set the run_id to use.
-- ─────────────────────────────────────────────────────────────────────────────

/*
UPDATE job_feed_runs
SET
  status = 'failed',
  completed_at = NOW(),
  error_message = 'Manually reset via diagnostic SQL — run appeared stuck.'
WHERE id = '<PASTE_RUN_ID_HERE>'
  AND status IN ('running', 'queued');
*/


-- ─────────────────────────────────────────────────────────────────────────────
-- 13. FORCE-DELETE TODAY'S RUN (to allow re-triggering)
-- The workflow is idempotent per local_date. If you want to re-trigger,
-- you need to either use force=true via the dev endpoint, or delete the run.
-- Uncomment to use.
-- ─────────────────────────────────────────────────────────────────────────────

/*
-- First, find today's run:
SELECT r.id, r.local_date, r.status
FROM job_feed_runs r
JOIN auth.users au ON au.id = r.user_id
WHERE au.email = 'wasim@karkoai.com'
  AND r.local_date = (
    NOW() AT TIME ZONE (SELECT user_timezone FROM job_feed_settings WHERE user_id = r.user_id)
  )::date;

-- Then delete its artifacts and the run itself:
-- DELETE FROM job_feed_ranked_items WHERE run_id = '<RUN_ID>';
-- DELETE FROM job_feed_raw_fetches WHERE run_id = '<RUN_ID>';
-- DELETE FROM job_feed_runs WHERE id = '<RUN_ID>';
*/
