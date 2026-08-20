import { NextRequest, NextResponse } from 'next/server';
import { canViewJobFeed } from '@/lib/job-feed/helpers';
import {
  authorizeJobFeedJobActionAdmin,
  createOrReuseJobFeedApplicationGenerationAdmin,
  createJobFeedApplicationSessionAdmin,
  getJobFeedApplicationSessionAdmin,
  getJobFeedFeedbackAdmin,
  isJobFeedbackBlocked,
  recordJobFeedFeedbackAdmin,
  toJobFeedFeedbackState,
  transitionJobFeedApplicationGenerationAdmin,
} from '@/lib/job-feed/server';
import { captureJobFeedActionRejected, captureJobFeedEvent } from '@/lib/job-feed/analytics';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getPostHogServer } from '@/lib/posthog-server';
import { getCurrentUser } from '@/auth/server';
import { getProfile } from '@/db/repos/profiles';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let userId: string | null = null;
  let jobId = '';
  let runId = '';
  let subscriptionTier: string | null = null;

  try {
    const ip = getClientIP(request);
    const { allowed } = await checkRateLimit(`job-feed-apply:${ip}`, RATE_LIMITS['job-feed-apply']);
    if (!allowed) {
      captureJobFeedActionRejected({
        route: 'apply',
        action: 'apply_started',
        reason: 'rate_limited',
        status: 429,
      });
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const user = await getCurrentUser(request);

    if (!user) {
      captureJobFeedActionRejected({
        route: 'apply',
        action: 'apply_started',
        reason: 'unauthenticated',
        status: 401,
      });
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    userId = user.id;

    const profile = await getProfile(user.id);
    subscriptionTier = profile?.subscription_tier ?? null;

    // Intentionally canViewJobFeed (free + premium), NOT canAccessJobFeed. This
    // is a handoff that only creates a session + generation intent; it charges no
    // credits and exposes nothing premium-exclusive. The paywall is enforced
    // downstream in the agent flow. canViewJobFeed still denies unknown tiers.
    if (!profile || !canViewJobFeed(profile.subscription_tier)) {
      captureJobFeedActionRejected({
        userId,
        route: 'apply',
        action: 'apply_started',
        reason: !profile ? 'profile_load_failed' : 'plan_not_allowed',
        status: 403,
        subscriptionTier,
      });
      return NextResponse.json({ error: 'Job Feed is not available for this account.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    jobId = typeof body?.jobId === 'string' ? body.jobId.trim() : '';
    runId = typeof body?.runId === 'string' ? body.runId.trim() : '';

    if (!jobId || jobId.length > 100 || runId.length > 100) {
      captureJobFeedActionRejected({
        userId,
        route: 'apply',
        action: 'apply_started',
        reason: !jobId ? 'missing_job_id' : 'invalid_input_length',
        status: 400,
        subscriptionTier,
      });
      return NextResponse.json({ error: 'A job ID is required.' }, { status: 400 });
    }

    const authorizedItem = await authorizeJobFeedJobActionAdmin({
      userId: user.id,
      jobId,
      runId: runId || null,
    });
    if (!authorizedItem) {
      captureJobFeedActionRejected({
        userId,
        route: 'apply',
        action: 'apply_started',
        reason: 'ranked_feed_item_not_found',
        jobId,
        runId: runId || null,
        status: 404,
        subscriptionTier,
      });
      return NextResponse.json({ error: 'Job Feed item not found.' }, { status: 404 });
    }
    const { job, rankedItem } = authorizedItem;
    const validatedRunId = rankedItem.run_id;

    const existingFeedback = await getJobFeedFeedbackAdmin(user.id, jobId);
    // Check the terminal state before the first write. recordJobFeedFeedbackAdmin
    // throws for a blocked row further down, and by then an empty session and a
    // generation intent are already in the sidebar. A stale client (dismiss,
    // then Check fit from the still-open detail) hits exactly this.
    if (
      existingFeedback
      && isJobFeedbackBlocked(existingFeedback)
      && !existingFeedback.application_session_id
    ) {
      captureJobFeedActionRejected({
        userId,
        route: 'apply',
        action: 'apply_started',
        reason: 'feedback_terminal_state',
        jobId,
        runId: validatedRunId,
        status: 409,
        subscriptionTier,
      });
      return NextResponse.json({ error: 'This role has already moved on.' }, { status: 409 });
    }

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
      captureJobFeedEvent({
        distinctId: user.id,
        event: 'job_feed_apply_session_created',
        properties: {
          session_id: session.id,
          job_id: jobId,
          company: job.company,
          title: job.title,
          feed_run_id: validatedRunId,
          subscription_tier: subscriptionTier,
        },
      });
    }

    const generationIntent = await createOrReuseJobFeedApplicationGenerationAdmin({
      userId: user.id,
      jobId,
      rankedItem,
      applicationSessionId: session.id,
    });

    const feedback = await recordJobFeedFeedbackAdmin({
      userId: user.id,
      jobId,
      action: 'apply_started',
      latestRunId: validatedRunId,
      applicationSessionId: session.id,
    });
    if (generationIntent.generation.status === 'intent_created') {
      await transitionJobFeedApplicationGenerationAdmin({
        userId: user.id,
        sessionId: session.id,
        generationId: generationIntent.generation.id,
        status: 'intent_created',
        transitionReason: 'apply_intent_confirmed',
      });
    }
    session = await getJobFeedApplicationSessionAdmin({
      userId: user.id,
      sessionId: session.id,
    }) ?? session;

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
        session_id: session.id,
        generation_id: generationIntent.generation.id,
        generation_attempt: generationIntent.generation.attempt,
        retried: generationIntent.retried,
      },
    });

    return NextResponse.json({
      created,
      session,
      generation: generationIntent.generation,
      feedback: toJobFeedFeedbackState(feedback),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('terminal state')) {
      captureJobFeedEvent({
        distinctId: userId,
        event: 'job_feed_feedback_conflict',
        logLevel: 'warn',
        properties: {
          route: 'apply',
          action: 'apply_started',
          job_id: jobId || null,
          feed_run_id: runId || null,
          reason: 'terminal_state',
          status: 409,
          subscription_tier: subscriptionTier,
        },
      });
      return NextResponse.json({ error: 'This job feed item can no longer be changed.' }, { status: 409 });
    }

    console.error('[job-feed/apply] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to start the application handoff.' }, { status: 500 });
  }
}
