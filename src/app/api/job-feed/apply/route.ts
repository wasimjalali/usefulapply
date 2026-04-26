import { NextRequest, NextResponse } from 'next/server';
import { canAccessJobFeed } from '@/lib/job-feed/helpers';
import {
  authorizeJobFeedJobActionAdmin,
  createJobFeedApplicationSessionAdmin,
  getJobFeedApplicationSessionAdmin,
  getJobFeedFeedbackAdmin,
  recordJobFeedFeedbackAdmin,
  toJobFeedFeedbackState,
} from '@/lib/job-feed/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getPostHogServer } from '@/lib/posthog-server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = checkRateLimit(`job-feed-apply:${ip}`, RATE_LIMITS['job-feed-apply']);
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
    const runId = typeof body?.runId === 'string' ? body.runId.trim() : '';

    if (!jobId) {
      return NextResponse.json({ error: 'A job ID is required.' }, { status: 400 });
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

    const existingFeedback = await getJobFeedFeedbackAdmin(user.id, jobId);
    let session = existingFeedback?.application_session_id
      ? await getJobFeedApplicationSessionAdmin({
          userId: user.id,
          sessionId: existingFeedback.application_session_id,
        })
      : null;
    let created = false;

    if (!session) {
      session = await createJobFeedApplicationSessionAdmin({
        userId: user.id,
        job,
      });
      created = true;
    }

    const feedback = await recordJobFeedFeedbackAdmin({
      userId: user.id,
      jobId,
      action: 'apply_started',
      latestRunId: validatedRunId,
      applicationSessionId: session.id,
    });

    const posthog = getPostHogServer();
    posthog.capture({
      distinctId: user.id,
      event: 'job_feed_applied',
      properties: {
        job_id: jobId,
        company: job.company,
        title: job.title,
        feed_run_id: validatedRunId,
        session_created: created,
      },
    });

    return NextResponse.json({
      created,
      session,
      feedback: toJobFeedFeedbackState(feedback),
    });
  } catch (error) {
    console.error('[job-feed/apply] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to start the application handoff.' }, { status: 500 });
  }
}
