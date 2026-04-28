import { NextRequest, NextResponse } from 'next/server';
import { canAccessJobFeed } from '@/lib/job-feed/helpers';
import { getLatestCompletedJobFeedRunAdmin, runJobFeedFoundationWorkflow } from '@/lib/job-feed/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MANUAL_RUN_COOLDOWN_MS = 24 * 60 * 60 * 1000;

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

    if (profileError || !profile || !canAccessJobFeed(profile.subscription_tier)) {
      return NextResponse.json({ error: 'Job Feed is not available for this account.' }, { status: 403 });
    }

    const latestCompletedRun = await getLatestCompletedJobFeedRunAdmin(user.id);
    const cooldown = getManualRunCooldown(latestCompletedRun?.completed_at ?? null);
    if (cooldown.remainingMs > 0) {
      return NextResponse.json({
        success: true,
        mode: 'direct',
        runId: latestCompletedRun?.id ?? null,
        status: latestCompletedRun?.status ?? null,
        localDate: latestCompletedRun?.local_date ?? null,
        created: false,
        skipped: true,
        cooldown: true,
        nextRunAt: cooldown.nextRunAt,
        remainingMs: cooldown.remainingMs,
        rawJobsFetched: latestCompletedRun?.raw_jobs_fetched ?? null,
        jobsAfterPrefilter: latestCompletedRun?.jobs_after_prefilter ?? null,
        rankedJobsCount: latestCompletedRun?.ranked_jobs_count ?? null,
        resultSummary: latestCompletedRun?.result_summary ?? null,
        errorMessage: latestCompletedRun?.error_message ?? null,
      });
    }

    const result = await runJobFeedFoundationWorkflow({
      userId: user.id,
      triggerSource: 'manual_user',
      now: new Date(),
      force: false,
      orchestrator: 'direct',
    });

    return NextResponse.json({
      success: true,
      mode: 'direct',
      runId: result.run.id,
      status: result.run.status,
      localDate: result.run.local_date,
      created: result.created,
      skipped: result.skipped,
      cooldown: false,
      nextRunAt: getNextRunAt(result.run.completed_at),
      remainingMs: 0,
      rawJobsFetched: result.run.raw_jobs_fetched,
      jobsAfterPrefilter: result.run.jobs_after_prefilter,
      rankedJobsCount: result.run.ranked_jobs_count,
      resultSummary: result.run.result_summary,
      errorMessage: result.run.error_message,
    });
  } catch (error) {
    console.error('[job-feed/run] error:', error);
    return NextResponse.json({
      error: 'Failed to run Job Feed.',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

function getManualRunCooldown(completedAt: string | null): { remainingMs: number; nextRunAt: string | null } {
  if (!completedAt) {
    return { remainingMs: 0, nextRunAt: null };
  }

  const completedTime = Date.parse(completedAt);
  if (Number.isNaN(completedTime)) {
    return { remainingMs: 0, nextRunAt: null };
  }

  const nextRunTime = completedTime + MANUAL_RUN_COOLDOWN_MS;
  return {
    remainingMs: Math.max(0, nextRunTime - Date.now()),
    nextRunAt: new Date(nextRunTime).toISOString(),
  };
}

function getNextRunAt(completedAt: string | null): string | null {
  if (!completedAt) {
    return null;
  }

  const completedTime = Date.parse(completedAt);
  if (Number.isNaN(completedTime)) {
    return null;
  }

  return new Date(completedTime + MANUAL_RUN_COOLDOWN_MS).toISOString();
}
