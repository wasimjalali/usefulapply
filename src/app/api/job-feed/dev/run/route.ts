import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { canAccessJobFeed } from '@/lib/job-feed/helpers';
import { runJobFeedFoundationWorkflow } from '@/lib/job-feed/server';
import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import { getProfile } from '@/db/repos/profiles';

export const runtime = 'nodejs';
export const maxDuration = 120;

const DEBUG_SECRET_HEADER = 'x-job-feed-debug-secret';

function isJobFeedDebugSecretValid(presented: string | null): boolean {
  const secret = process.env.JOB_FEED_DEBUG_SECRET;
  if (!secret || !presented) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(presented);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export async function POST(request: NextRequest) {
  if (!isJobFeedDebugSecretValid(request.headers.get(DEBUG_SECRET_HEADER))) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  try {
    const ipAllowed = await checkJobFeedIpGate(request);
    if (!ipAllowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const payload = await request.json().catch(() => ({}));
    const force = Boolean(payload?.force);
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { allowed } = await checkRateLimit(`job-feed-dev-run:${user.id}`, RATE_LIMITS['job-feed-dev-run']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const profile = await getProfile(user.id);

    if (!profile || !canAccessJobFeed(profile.subscription_tier)) {
      return NextResponse.json({ error: 'Job Feed is not available for this account.' }, { status: 403 });
    }

    const result = await runJobFeedFoundationWorkflow({
      userId: user.id,
      requestExecutionId: crypto.randomUUID(),
      clientRequestId: request.headers.get('x-request-id'),
      triggerSource: force ? 'manual_debug_force' : 'manual_debug',
      now: new Date(),
      force,
      orchestrator: 'direct',
    });

    return NextResponse.json({
      mode: 'direct',
      success: true,
      runId: result.run.id,
      status: result.run.status,
      created: result.created,
      skipped: result.skipped,
      forced: result.forced ?? false,
      rawJobsFetched: result.run.raw_jobs_fetched,
      jobsAfterPrefilter: result.run.jobs_after_prefilter,
      rankedJobsCount: result.run.ranked_jobs_count,
      resultSummary: result.run.result_summary,
      errorMessage: result.run.error_message,
    });
  } catch (error) {
    console.error('[job-feed/dev/run] error:', error);
    return NextResponse.json({ error: 'Workflow failed.' }, { status: 500 });
  }
}
