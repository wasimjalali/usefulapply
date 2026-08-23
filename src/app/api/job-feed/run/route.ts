import { NextRequest, NextResponse } from 'next/server';
import { canViewJobFeed, getLocalDateKey, getStartOfNextLocalDay, isValidTimeZone } from '@/lib/job-feed/helpers';
import {
  getJobFeedSettingsAdmin,
  getJobFeedRunDiagnostics,
  getLatestManualCompletedJobFeedRunAdmin,
  runJobFeedFoundationWorkflow,
} from '@/lib/job-feed/server';
import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import { getProfile } from '@/db/repos/profiles';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const ipAllowed = await checkJobFeedIpGate(request);
    if (!ipAllowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { allowed } = await checkRateLimit(`job-feed-run:${user.id}`, RATE_LIMITS['job-feed-run']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const profile = await getProfile(user.id);

    if (!profile || !canViewJobFeed(profile.subscription_tier)) {
      return NextResponse.json({ error: 'Job Feed is not available for this account.' }, { status: 403 });
    }

    let consentAccepted = false;
    try {
      const body = await request.json() as { consent_accepted?: unknown };
      consentAccepted = body?.consent_accepted === true;
    } catch {
      // Empty or non-JSON body is a missing assertion, not a parse bug.
    }

    const settings = await getJobFeedSettingsAdmin(user.id);
    const timeZone = settings?.user_timezone && isValidTimeZone(settings.user_timezone)
      ? settings.user_timezone
      : 'UTC';
    const now = new Date();
    const todayKey = getLocalDateKey(now, timeZone);

    // One run per calendar day in the user's persisted timezone, with UTC as
    // the fallback. Changing roles or countries doesn't bypass the daily gate.
    const latestManualRun = await getLatestManualCompletedJobFeedRunAdmin(user.id);
    const cooldown = getCalendarDayCooldown({
      latestManualLocalDate: latestManualRun?.local_date ?? null,
      latestManualTimeZone: latestManualRun?.local_timezone ?? null,
      latestManualCompletedAt: latestManualRun?.completed_at ?? latestManualRun?.created_at ?? null,
      todayKey,
      timeZone,
      now,
    });

    if (cooldown.blocked) {
      const diagnostics = getJobFeedRunDiagnostics(latestManualRun ?? null);
      return NextResponse.json({
        success: true,
        mode: 'direct',
        runId: latestManualRun?.id ?? null,
        status: latestManualRun?.status ?? null,
        localDate: latestManualRun?.local_date ?? null,
        created: false,
        skipped: true,
        cooldown: true,
        nextRunAt: cooldown.nextRunAt,
        remainingMs: cooldown.remainingMs,
        rawJobsFetched: latestManualRun?.raw_jobs_fetched ?? null,
        jobsAfterPrefilter: latestManualRun?.jobs_after_prefilter ?? null,
        rankedJobsCount: latestManualRun?.ranked_jobs_count ?? null,
        duplicateCount: diagnostics?.duplicateCount ?? null,
        rankingCandidateCount: diagnostics?.rankingCandidateCount ?? null,
        failedFetchCount: diagnostics?.failedFetchCount ?? null,
        resultSummary: latestManualRun?.result_summary ?? null,
        errorMessage: latestManualRun?.error_message ?? null,
      });
    }

    const result = await runJobFeedFoundationWorkflow({
      userId: user.id,
      requestExecutionId: crypto.randomUUID(),
      clientRequestId: request.headers.get('x-request-id'),
      triggerSource: 'manual_user',
      now,
      orchestrator: 'direct',
      consentAccepted,
    });

    const diagnostics = getJobFeedRunDiagnostics(result.run);
    const nextRunAt = result.run.local_date
      ? getStartOfNextLocalDay(now, result.run.local_timezone || timeZone).toISOString()
      : null;

    return NextResponse.json({
      success: true,
      mode: 'direct',
      runId: result.run.id,
      status: result.run.status,
      localDate: result.run.local_date,
      created: result.created,
      skipped: result.skipped,
      cooldown: false,
      nextRunAt,
      remainingMs: 0,
      rawJobsFetched: result.run.raw_jobs_fetched,
      jobsAfterPrefilter: result.run.jobs_after_prefilter,
      rankedJobsCount: result.run.ranked_jobs_count,
      duplicateCount: diagnostics?.duplicateCount ?? null,
      rankingCandidateCount: diagnostics?.rankingCandidateCount ?? null,
      failedFetchCount: diagnostics?.failedFetchCount ?? null,
      resultSummary: result.run.result_summary,
      errorMessage: result.run.error_message,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'JOB_FEED_CONSENT_REQUIRED') {
      return NextResponse.json({
        error: 'Please confirm I can search public job boards for you.',
      }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'JOB_FEED_INSUFFICIENT_CV') {
      return NextResponse.json({
        error: "We couldn't find enough roles or experience in your CV to build your feed. Add your recent roles or key skills to your CV, then try again.",
      }, { status: 422 });
    }
    console.error('[job-feed/run] error:', error);
    return NextResponse.json({
      error: 'Failed to run Job Feed.',
    }, { status: 500 });
  }
}

function getCalendarDayCooldown(params: {
  latestManualLocalDate: string | null;
  latestManualTimeZone: string | null;
  latestManualCompletedAt: string | null;
  todayKey: string;
  timeZone: string;
  now: Date;
}): { blocked: boolean; nextRunAt: string | null; remainingMs: number } {
  if (!params.latestManualLocalDate) {
    return { blocked: false, nextRunAt: null, remainingMs: 0 };
  }

  const completionDate = params.latestManualCompletedAt
    ? new Date(params.latestManualCompletedAt)
    : null;
  const blocksDuringTimezoneCutover = params.latestManualTimeZone !== params.timeZone
    && completionDate !== null
    && !Number.isNaN(completionDate.getTime())
    && getLocalDateKey(completionDate, params.timeZone) === params.todayKey;

  // A row already keyed to today locks normally. During a timezone cutover,
  // the latest completed run also locks when its completion instant falls on
  // today in the persisted timezone, even if its old local_date differs.
  if (params.latestManualLocalDate !== params.todayKey && !blocksDuringTimezoneCutover) {
    return { blocked: false, nextRunAt: null, remainingMs: 0 };
  }

  const nextRunAt = getStartOfNextLocalDay(params.now, params.timeZone);
  return {
    blocked: true,
    nextRunAt: nextRunAt.toISOString(),
    remainingMs: Math.max(0, nextRunAt.getTime() - params.now.getTime()),
  };
}
