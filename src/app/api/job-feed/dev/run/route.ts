import { NextRequest, NextResponse } from 'next/server';
import { isJobFeedDebugModeEnabled } from '@/lib/job-feed/constants';
import { canAccessJobFeed } from '@/lib/job-feed/helpers';
import { runJobFeedFoundationWorkflow } from '@/lib/job-feed/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  if (!isJobFeedDebugModeEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  try {
    const ip = getClientIP(request);
    const { allowed } = checkRateLimit(`job-feed-dev-run:${ip}`, RATE_LIMITS['job-feed-dev-run']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const payload = await request.json().catch(() => ({}));
    const force = Boolean(payload?.force);
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

    const result = await runJobFeedFoundationWorkflow({
      userId: user.id,
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
