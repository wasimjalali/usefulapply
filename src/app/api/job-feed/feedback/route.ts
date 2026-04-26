import { NextRequest, NextResponse } from 'next/server';
import { canAccessJobFeed } from '@/lib/job-feed/helpers';
import {
  authorizeJobFeedJobActionAdmin,
  recordJobFeedFeedbackAdmin,
  toJobFeedFeedbackState,
} from '@/lib/job-feed/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getPostHogServer } from '@/lib/posthog-server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// 'rated_helpful' / 'rated_not_relevant' capture the user's match-quality
// signal from the details modal so the ranker can learn from it.
const SUPPORTED_ACTIONS = new Set(['opened', 'saved', 'dismissed', 'rated_helpful', 'rated_not_relevant']);

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = checkRateLimit(`job-feed-feedback:${ip}`, RATE_LIMITS['job-feed-feedback']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet understand all of the newly added tables here.
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

    const body = await request.json();
    const jobId = typeof body?.jobId === 'string' ? body.jobId.trim() : '';
    const action = typeof body?.action === 'string' ? body.action.trim() : '';
    const runId = typeof body?.runId === 'string' ? body.runId.trim() : '';

    if (!jobId) {
      return NextResponse.json({ error: 'A job ID is required.' }, { status: 400 });
    }

    if (!SUPPORTED_ACTIONS.has(action)) {
      return NextResponse.json({ error: 'Unsupported feedback action.' }, { status: 400 });
    }

    const authorizedItem = await authorizeJobFeedJobActionAdmin({
      userId: user.id,
      jobId,
      runId: runId || null,
    });
    if (!authorizedItem) {
      return NextResponse.json({ error: 'Job Feed item not found.' }, { status: 404 });
    }
    const { job, rankedItem } = authorizedItem;
    const validatedRunId = rankedItem.run_id;

    const feedback = await recordJobFeedFeedbackAdmin({
      userId: user.id,
      jobId,
      action: action as 'opened' | 'saved' | 'dismissed' | 'rated_helpful' | 'rated_not_relevant',
      latestRunId: validatedRunId,
    });

    const posthog = getPostHogServer();
    posthog.capture({
      distinctId: user.id,
      event: 'job_feed_feedback',
      properties: {
        action,
        job_id: jobId,
        company: job.company,
        title: job.title,
        feed_run_id: validatedRunId,
      },
    });

    return NextResponse.json({
      feedback: toJobFeedFeedbackState(feedback),
    });
  } catch (error) {
    console.error('[job-feed/feedback] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to record job feed feedback.' }, { status: 500 });
  }
}
