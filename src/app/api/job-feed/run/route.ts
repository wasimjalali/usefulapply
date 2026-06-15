import { NextRequest, NextResponse } from 'next/server';
import { canViewJobFeed, getLocalDateKey, getStartOfNextLocalDay } from '@/lib/job-feed/helpers';
import {
  getJobFeedRunDiagnostics,
  getLatestManualCompletedJobFeedRunAdmin,
  runJobFeedFoundationWorkflow,
} from '@/lib/job-feed/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = checkRateLimit(`job-feed-run:${ip}`, RATE_LIMITS['job-feed-run']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet understand the newly added tables here.
    const typedSupabase = supabase as any;
    const { data: { user }, error: authError } = await typedSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await typedSupabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || !canViewJobFeed(profile.subscription_tier)) {
      return NextResponse.json({ error: 'Job Feed is not available for this account.' }, { status: 403 });
    }

    const userTimeZone = await getUserTimeZone(user.id);
    const now = new Date();
    const todayKey = getLocalDateKey(now, userTimeZone);

    // One manual run per local calendar day. If today already has a
    // completed manual run, the next window opens at local midnight.
    const latestManualRun = await getLatestManualCompletedJobFeedRunAdmin(user.id);
    const cooldown = getCalendarDayCooldown({
      latestManualLocalDate: latestManualRun?.local_date ?? null,
      todayKey,
      now,
      timeZone: userTimeZone,
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
      triggerSource: 'manual_user',
      now,
      // No need to force here any more. Scheduler is gone, so an
      // existing-same-day row can only be a stale manual run; the
      // workflow handles that via its stale-running recovery path.
      force: false,
      orchestrator: 'direct',
    });

    const diagnostics = getJobFeedRunDiagnostics(result.run);
    const nextRunAt = result.run.local_date
      ? getStartOfNextLocalDay(new Date(`${result.run.local_date}T12:00:00Z`), userTimeZone).toISOString()
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
    console.error('[job-feed/run] error:', error);
    return NextResponse.json({
      error: 'Failed to run Job Feed.',
    }, { status: 500 });
  }
}

async function getUserTimeZone(userId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet cover these tables.
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from('job_feed_settings')
    .select('user_timezone')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { user_timezone?: string } | null)?.user_timezone || 'UTC';
}

function getCalendarDayCooldown(params: {
  latestManualLocalDate: string | null;
  todayKey: string;
  now: Date;
  timeZone: string;
}): { blocked: boolean; nextRunAt: string | null; remainingMs: number } {
  if (!params.latestManualLocalDate) {
    return { blocked: false, nextRunAt: null, remainingMs: 0 };
  }

  // Only today's manual run locks. Past-day rows are just history.
  if (params.latestManualLocalDate !== params.todayKey) {
    return { blocked: false, nextRunAt: null, remainingMs: 0 };
  }

  const nextRunAt = getStartOfNextLocalDay(params.now, params.timeZone);
  return {
    blocked: true,
    nextRunAt: nextRunAt.toISOString(),
    remainingMs: Math.max(0, nextRunAt.getTime() - params.now.getTime()),
  };
}
