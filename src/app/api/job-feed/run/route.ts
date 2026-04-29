import { NextRequest, NextResponse } from 'next/server';
import { canAccessJobFeed, getLocalDateKey } from '@/lib/job-feed/helpers';
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

    // Cooldown is measured from the user's last *manual* run only. Scheduled
    // or debug sweeps must never lock the button.
    const latestManualRun = await getLatestManualCompletedJobFeedRunAdmin(user.id);
    const cooldown = getManualRunCooldown(latestManualRun?.completed_at ?? null);
    if (cooldown.remainingMs > 0) {
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

    // If the existing same-day run came from a non-manual source, force a
    // rerun so the user gets a real manual run. The workflow's
    // reset-artifacts path handles this safely.
    const shouldForce = await shouldForceManualRerun(user.id);

    const result = await runJobFeedFoundationWorkflow({
      userId: user.id,
      triggerSource: 'manual_user',
      now: new Date(),
      force: shouldForce,
      orchestrator: 'direct',
    });

    const diagnostics = getJobFeedRunDiagnostics(result.run);

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

async function shouldForceManualRerun(userId: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet understand the newly added tables here.
  const admin = createAdminClient() as any;

  const { data: settings } = await admin
    .from('job_feed_settings')
    .select('user_timezone')
    .eq('user_id', userId)
    .maybeSingle();

  const timeZone = (settings as { user_timezone?: string } | null)?.user_timezone ?? 'UTC';
  const today = getLocalDateKey(new Date(), timeZone);

  const { data: existingRun } = await admin
    .from('job_feed_runs')
    .select('trigger_source, status')
    .eq('user_id', userId)
    .eq('local_date', today)
    .maybeSingle();

  if (!existingRun) return false;

  const row = existingRun as { trigger_source: string; status: string };
  const isManual = row.trigger_source === 'manual_user'
    || row.trigger_source === 'manual_debug'
    || row.trigger_source === 'manual_debug_force';

  // A completed non-manual run blocks the manual workflow via its
  // same-day idempotency check; force past it. A stale running run from
  // any source (crashed mid-run) also needs force-reset.
  if (row.status === 'completed' && !isManual) return true;
  if (row.status === 'running') return true;

  return false;
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
