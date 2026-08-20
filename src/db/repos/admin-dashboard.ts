import 'server-only';

import { sql } from 'drizzle-orm';
import { requireAdminAccess } from '@/lib/admin/access';
import { adminRangeStart, type AdminRangeDays } from '@/lib/admin/range';
import { getDb } from '../client';

type CountRow = { value: number };

function countOf(rows: CountRow[]): number {
  const value = rows[0]?.value;
  if (typeof value !== 'number') throw new Error('Admin aggregate query returned no count');
  return value;
}

function maskedEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return 'Invalid email';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export type AdminTrendPoint = { day: string; value: number };
export type AdminCoverage = 'unavailable' | 'partial' | 'complete';

function coverageForRange(trackingStartedAt: string | null, rangeStart: string): AdminCoverage {
  if (!trackingStartedAt) return 'unavailable';
  return trackingStartedAt <= rangeStart ? 'complete' : 'partial';
}

export async function getAdminOverview(days: AdminRangeDays) {
  await requireAdminAccess();
  const db = await getDb();
  const start = adminRangeStart(days);
  const startMs = Date.parse(start);

  const [
    accounts,
    verified,
    signups,
    sessionStarts,
    applications,
    completedKits,
    activePaid,
    failedGenerations,
    accountTrend,
    applicationTrend,
    journey,
    recentFailures,
    authTracking,
  ] = await Promise.all([
    db.all<CountRow>(sql`select count(*) as value from user`),
    db.all<CountRow>(sql`select count(*) as value from user where email_verified = 1`),
    db.all<CountRow>(sql`select count(*) as value from admin_auth_events where event_type = 'signup' and occurred_at >= ${start}`),
    db.all<CountRow>(sql`select count(*) as value from admin_auth_events where event_type = 'session_started' and occurred_at >= ${start}`),
    db.all<CountRow>(sql`select count(*) as value from application_sessions where created_at >= ${start}`),
    db.all<CountRow>(sql`select count(*) as value from application_sessions where generation_status = 'succeeded' and generation_completed_at >= ${start}`),
    db.all<CountRow>(sql`select count(distinct user_id) as value from subscriptions where tier in ('plus', 'max') and status in ('active', 'trialing')`),
    db.all<CountRow>(sql`select count(*) as value from application_sessions where generation_status = 'failed' and generation_failed_at >= ${start}`),
    db.all<AdminTrendPoint>(sql`
      select strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') as day, count(*) as value
      from user
      where created_at >= ${startMs}
      group by day
      order by day
    `),
    db.all<AdminTrendPoint>(sql`
      select substr(created_at, 1, 10) as day, count(*) as value
      from application_sessions
      where created_at >= ${start}
      group by day
      order by day
    `),
    db.all<{
      workspaces: number;
      generated: number;
      applied: number;
      interviews: number;
      accepted: number;
    }>(sql`
      select
        count(*) as workspaces,
        sum(case when generation_status = 'succeeded' then 1 else 0 end) as generated,
        sum(case when status <> 'drafted' then 1 else 0 end) as applied,
        sum(case when status in ('interview', 'accepted') then 1 else 0 end) as interviews,
        sum(case when status = 'accepted' then 1 else 0 end) as accepted
      from application_sessions
    `),
    db.all<{ id: string; kind: string; label: string; occurredAt: string }>(sql`
      select id, 'Application' as kind, coalesce(job_title, 'Untitled role') as label,
        coalesce(generation_failed_at, updated_at) as occurredAt
      from application_sessions
      where generation_status = 'failed'
      union all
      select id, 'Job feed' as kind, 'Feed run failed' as label,
        coalesce(completed_at, updated_at) as occurredAt
      from job_feed_runs
      where status = 'failed'
      order by occurredAt desc
      limit 8
    `),
    db.all<{ trackingStartedAt: string }>(sql`
      select tracking_started_at as trackingStartedAt
      from admin_metric_sources
      where source = 'auth'
      limit 1
    `),
  ]);

  const journeyRow = journey[0];

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      accounts: countOf(accounts),
      verified: countOf(verified),
      signups: countOf(signups),
      sessionStarts: countOf(sessionStarts),
      applications: countOf(applications),
      completedKits: countOf(completedKits),
      activePaid: countOf(activePaid),
      failedGenerations: countOf(failedGenerations),
    },
    accountTrend,
    applicationTrend,
    journey: {
      workspaces: journeyRow?.workspaces ?? 0,
      generated: journeyRow?.generated ?? 0,
      applied: journeyRow?.applied ?? 0,
      interviews: journeyRow?.interviews ?? 0,
      accepted: journeyRow?.accepted ?? 0,
    },
    recentFailures,
    authCoverage: coverageForRange(authTracking[0]?.trackingStartedAt ?? null, start),
    authTrackingStartedAt: authTracking[0]?.trackingStartedAt ?? null,
  };
}

export async function getAdminUsers(days: AdminRangeDays) {
  await requireAdminAccess();
  const db = await getDb();
  const start = adminRangeStart(days);
  const startMs = Date.parse(start);

  const [accounts, created, verified, signupEvents, sessionStarts, distinctSignedIn, authTracking, recent] = await Promise.all([
    db.all<CountRow>(sql`select count(*) as value from user`),
    db.all<CountRow>(sql`select count(*) as value from user where created_at >= ${startMs}`),
    db.all<CountRow>(sql`select count(*) as value from user where email_verified = 1`),
    db.all<CountRow>(sql`select count(*) as value from admin_auth_events where event_type = 'signup' and occurred_at >= ${start}`),
    db.all<CountRow>(sql`select count(*) as value from admin_auth_events where event_type = 'session_started' and occurred_at >= ${start}`),
    db.all<CountRow>(sql`select count(distinct subject_hash) as value from admin_auth_events where event_type = 'session_started' and occurred_at >= ${start}`),
    db.all<{ firstEventAt: string | null }>(sql`
      select tracking_started_at as firstEventAt
      from admin_metric_sources
      where source = 'auth'
      limit 1
    `),
    db.all<{
      id: string;
      email: string;
      emailVerified: number;
      createdAt: number;
      tier: string | null;
      credits: number | null;
      applications: number;
    }>(sql`
      select u.id, u.email, u.email_verified as emailVerified, u.created_at as createdAt,
        p.subscription_tier as tier,
        coalesce(uc.monthly_credits + uc.rollover_credits + uc.addon_credits, 0) as credits,
        count(a.id) as applications
      from user u
      left join profiles p on p.id = u.id
      left join user_credits uc on uc.user_id = u.id
      left join application_sessions a on a.user_id = u.id
      group by u.id, u.email, u.email_verified, u.created_at, p.subscription_tier,
        uc.monthly_credits, uc.rollover_credits, uc.addon_credits
      order by u.created_at desc
      limit 50
    `),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      accounts: countOf(accounts),
      created: countOf(created),
      verified: countOf(verified),
      signups: countOf(signupEvents),
      sessionStarts: countOf(sessionStarts),
      distinctSignedIn: countOf(distinctSignedIn),
    },
    trackingStartedAt: authTracking[0]?.firstEventAt ?? null,
    coverage: coverageForRange(authTracking[0]?.firstEventAt ?? null, start),
    recent: recent.map((row) => ({ ...row, email: maskedEmail(row.email) })),
  };
}

export async function getAdminApplications(days: AdminRangeDays) {
  await requireAdminAccess();
  const db = await getDb();
  const start = adminRangeStart(days);

  const [created, succeeded, failed, applied, statusCounts, recent] = await Promise.all([
    db.all<CountRow>(sql`select count(*) as value from application_sessions where created_at >= ${start}`),
    db.all<CountRow>(sql`select count(*) as value from application_sessions where generation_status = 'succeeded' and generation_completed_at >= ${start}`),
    db.all<CountRow>(sql`select count(*) as value from application_sessions where generation_status = 'failed' and generation_failed_at >= ${start}`),
    db.all<CountRow>(sql`select count(*) as value from application_sessions where status <> 'drafted' and updated_at >= ${start}`),
    db.all<{ status: string; value: number }>(sql`
      select status, count(*) as value
      from application_sessions
      group by status
      order by value desc
    `),
    db.all<{
      id: string;
      jobTitle: string | null;
      company: string | null;
      status: string;
      generationStatus: string;
      matchScore: number | null;
      createdAt: string;
    }>(sql`
      select id, job_title as jobTitle, company, status, generation_status as generationStatus,
        match_score as matchScore, created_at as createdAt
      from application_sessions
      order by created_at desc
      limit 50
    `),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      created: countOf(created),
      succeeded: countOf(succeeded),
      failed: countOf(failed),
      applied: countOf(applied),
    },
    statusCounts,
    recent,
  };
}

export async function getAdminAiUsage(days: AdminRangeDays) {
  await requireAdminAccess();
  const db = await getDb();
  const start = adminRangeStart(days);
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const [summary, providers, features, models, tracking] = await Promise.all([
    db.all<{
      responses: number;
      failures: number;
      reported: number;
      missingUsage: number;
      staleStarted: number;
      inputTokens: number | null;
      outputTokens: number | null;
      cacheReadTokens: number | null;
      cacheWriteTokens: number | null;
      totalTokens: number | null;
    }>(sql`
      select
        coalesce(sum(case when status = 'response_received' then 1 else 0 end), 0) as responses,
        coalesce(sum(case when status = 'failed' then 1 else 0 end), 0) as failures,
        coalesce(sum(case when status = 'response_received' and usage_reported = 1 then 1 else 0 end), 0) as reported,
        coalesce(sum(case when status = 'response_received' and usage_reported = 0 then 1 else 0 end), 0) as missingUsage,
        coalesce(sum(case when status = 'started' and started_at < ${staleBefore} then 1 else 0 end), 0) as staleStarted,
        sum(case when status = 'response_received' and usage_reported = 1 then input_tokens end) as inputTokens,
        sum(case when status = 'response_received' and usage_reported = 1 then output_tokens end) as outputTokens,
        sum(case when status = 'response_received' and usage_reported = 1 then cache_read_input_tokens end) as cacheReadTokens,
        sum(case when status = 'response_received' and usage_reported = 1 then cache_write_input_tokens end) as cacheWriteTokens,
        sum(case when status = 'response_received' and usage_reported = 1 then coalesce(provider_total_tokens, input_tokens + output_tokens) end) as totalTokens
      from llm_generations
      where started_at >= ${start}
    `),
    db.all<{ provider: string; calls: number; tokens: number | null }>(sql`
      select provider, count(*) as calls, sum(coalesce(provider_total_tokens, input_tokens + output_tokens)) as tokens
      from llm_generations
      where started_at >= ${start} and status = 'response_received' and usage_reported = 1
      group by provider
      order by tokens desc
    `),
    db.all<{ feature: string; calls: number; tokens: number | null }>(sql`
      select feature, count(*) as calls, sum(coalesce(provider_total_tokens, input_tokens + output_tokens)) as tokens
      from llm_generations
      where started_at >= ${start} and status = 'response_received' and usage_reported = 1
      group by feature
      order by tokens desc
    `),
    db.all<{ model: string; provider: string; calls: number; tokens: number | null }>(sql`
      select model, provider, count(*) as calls, sum(coalesce(provider_total_tokens, input_tokens + output_tokens)) as tokens
      from llm_generations
      where started_at >= ${start} and status = 'response_received' and usage_reported = 1
      group by model, provider
      order by tokens desc
    `),
    db.all<{ firstStartedAt: string | null }>(sql`
      select tracking_started_at as firstStartedAt
      from admin_metric_sources
      where source = 'llm'
      limit 1
    `),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    summary: summary[0] ?? {
      responses: 0,
      failures: 0,
      reported: 0,
      missingUsage: 0,
      staleStarted: 0,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      totalTokens: null,
    },
    providers,
    features,
    models,
    trackingStartedAt: tracking[0]?.firstStartedAt ?? null,
    coverage: coverageForRange(tracking[0]?.firstStartedAt ?? null, start),
  };
}

export async function getAdminBilling(days: AdminRangeDays) {
  await requireAdminAccess();
  const db = await getDb();
  const start = adminRangeStart(days);

  const [activePaid, pastDue, balances, spent, plans, activity] = await Promise.all([
    db.all<CountRow>(sql`select count(distinct user_id) as value from subscriptions where tier in ('plus', 'max') and status in ('active', 'trialing')`),
    db.all<CountRow>(sql`select count(distinct user_id) as value from subscriptions where status = 'past_due'`),
    db.all<{ monthly: number | null; rollover: number | null; addon: number | null }>(sql`
      select sum(monthly_credits) as monthly, sum(rollover_credits) as rollover, sum(addon_credits) as addon
      from user_credits
    `),
    db.all<{ value: number | null }>(sql`
      select sum(abs(amount)) as value
      from credit_transactions
      where amount < 0
        and created_at >= ${start}
        and (
          transaction_kind in ('fit', 'kit', 'rewrite')
          or (
            transaction_kind is null
            and transaction_type in (
              'fit_analysis', 'full_application', 'generation_after_fit', 'full_generation',
              'cv_optimization', 'cover_letter_regen', 'email_regen', 'follow_up_regen'
            )
          )
        )
    `),
    db.all<{ tier: string; status: string; value: number }>(sql`
      select tier, status, count(distinct user_id) as value
      from subscriptions
      group by tier, status
      order by tier, status
    `),
    db.all<{ id: string; kind: string; amount: number; createdAt: string }>(sql`
      select id, coalesce(transaction_kind, transaction_type) as kind, amount, created_at as createdAt
      from credit_transactions
      order by created_at desc
      limit 50
    `),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      activePaid: countOf(activePaid),
      pastDue: countOf(pastDue),
      monthlyCredits: balances[0]?.monthly ?? 0,
      rolloverCredits: balances[0]?.rollover ?? 0,
      addonCredits: balances[0]?.addon ?? 0,
      spentCredits: spent[0]?.value ?? 0,
    },
    plans,
    activity,
  };
}

export async function getAdminOperations(days: AdminRangeDays) {
  await requireAdminAccess();
  const db = await getDb();
  const start = adminRangeStart(days);
  const stuckBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const staleLlmBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const [feedRuns, failedFeedRuns, stuckFeedRuns, appFailures, llmFailures, staleLlm, recentFeedRuns, llmTracking, recentLlmFailures] = await Promise.all([
    db.all<CountRow>(sql`select count(*) as value from job_feed_runs where created_at >= ${start}`),
    db.all<CountRow>(sql`select count(*) as value from job_feed_runs where status = 'failed' and created_at >= ${start}`),
    db.all<CountRow>(sql`select count(*) as value from job_feed_runs where status in ('queued', 'running') and updated_at < ${stuckBefore}`),
    db.all<CountRow>(sql`select count(*) as value from application_sessions where generation_status = 'failed' and generation_failed_at >= ${start}`),
    db.all<CountRow>(sql`select count(*) as value from llm_generations where status = 'failed' and started_at >= ${start}`),
    db.all<CountRow>(sql`select count(*) as value from llm_generations where status = 'started' and started_at < ${staleLlmBefore}`),
    db.all<{
      id: string;
      status: string;
      triggerSource: string;
      rawJobs: number;
      rankedJobs: number;
      createdAt: string;
    }>(sql`
      select id, status, trigger_source as triggerSource, raw_jobs_fetched as rawJobs,
        ranked_jobs_count as rankedJobs, created_at as createdAt
      from job_feed_runs
      order by created_at desc
      limit 30
    `),
    db.all<{ trackingStartedAt: string }>(sql`
      select tracking_started_at as trackingStartedAt
      from admin_metric_sources
      where source = 'llm'
      limit 1
    `),
    db.all<{
      id: string;
      feature: string;
      operation: string;
      provider: string;
      model: string;
      errorKind: string | null;
      occurredAt: string;
    }>(sql`
      select id, feature, operation, provider, model, error_kind as errorKind, failed_at as occurredAt
      from llm_generations
      where status = 'failed'
      order by failed_at desc
      limit 30
    `),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      feedRuns: countOf(feedRuns),
      failedFeedRuns: countOf(failedFeedRuns),
      stuckFeedRuns: countOf(stuckFeedRuns),
      appFailures: countOf(appFailures),
      llmFailures: countOf(llmFailures),
      staleLlm: countOf(staleLlm),
    },
    recentFeedRuns,
    recentLlmFailures,
    llmCoverage: coverageForRange(llmTracking[0]?.trackingStartedAt ?? null, start),
    llmTrackingStartedAt: llmTracking[0]?.trackingStartedAt ?? null,
  };
}
