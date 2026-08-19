import { NextRequest, NextResponse } from 'next/server';
import { canAccessJobFeed, canViewJobFeed } from '@/lib/job-feed/helpers';
import {
  authorizeJobFeedJobActionAdmin,
  recordJobFeedFeedbackAdmin,
  toJobFeedFeedbackState,
} from '@/lib/job-feed/server';
import { captureJobFeedActionRejected, captureJobFeedEvent } from '@/lib/job-feed/analytics';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getPostHogServer } from '@/lib/posthog-server';
import { getCurrentUser } from '@/auth/server';
import { getProfile } from '@/db/repos/profiles';

export const runtime = 'nodejs';

// 'rated_helpful' / 'rated_not_relevant' capture the user's match-quality
// signal from the details modal so the ranker can learn from it.
const SUPPORTED_ACTIONS = new Set(['opened', 'saved', 'dismissed', 'rated_helpful', 'rated_not_relevant']);
// Bookmarking and "I opened this" are part of viewing the feed. Ratings and
// dismiss stay on Plus/Max because they train the ranker.
const VIEW_ACTIONS = new Set(['opened', 'saved']);

export async function POST(request: NextRequest) {
  let userId: string | null = null;
  let jobId = '';
  let action = '';
  let runId = '';
  let subscriptionTier: string | null = null;

  try {
    const ip = getClientIP(request);
    const { allowed } = await checkRateLimit(`job-feed-feedback:${ip}`, RATE_LIMITS['job-feed-feedback']);
    if (!allowed) {
      captureJobFeedActionRejected({
        route: 'feedback',
        action: 'unknown',
        reason: 'rate_limited',
        status: 429,
      });
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const user = await getCurrentUser(request);

    if (!user) {
      captureJobFeedActionRejected({
        route: 'feedback',
        action: 'unknown',
        reason: 'unauthenticated',
        status: 401,
      });
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    userId = user.id;

    const profile = await getProfile(user.id);
    subscriptionTier = profile?.subscription_tier ?? null;

    if (!profile) {
      captureJobFeedActionRejected({
        userId,
        route: 'feedback',
        action: 'unknown',
        reason: 'profile_load_failed',
        status: 500,
        subscriptionTier,
      });
      return NextResponse.json({ error: 'Failed to record job feed feedback.' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    jobId = typeof body?.jobId === 'string' ? body.jobId.trim() : '';
    action = typeof body?.action === 'string' ? body.action.trim() : '';
    runId = typeof body?.runId === 'string' ? body.runId.trim() : '';

    if (!jobId || jobId.length > 100 || action.length > 64 || runId.length > 100) {
      captureJobFeedActionRejected({
        userId,
        route: 'feedback',
        action: action || 'unknown',
        reason: !jobId ? 'missing_job_id' : 'invalid_input_length',
        status: 400,
        subscriptionTier,
      });
      return NextResponse.json({ error: 'A job ID is required.' }, { status: 400 });
    }

    if (!SUPPORTED_ACTIONS.has(action)) {
      captureJobFeedActionRejected({
        userId,
        route: 'feedback',
        action: action || 'unknown',
        reason: 'unsupported_action',
        jobId,
        runId: runId || null,
        status: 400,
        subscriptionTier,
      });
      return NextResponse.json({ error: 'Unsupported feedback action.' }, { status: 400 });
    }

    const allowedOnPlan = VIEW_ACTIONS.has(action)
      ? canViewJobFeed(profile.subscription_tier)
      : canAccessJobFeed(profile.subscription_tier);
    if (!allowedOnPlan) {
      captureJobFeedActionRejected({
        userId,
        route: 'feedback',
        action,
        reason: 'plan_not_allowed',
        status: 403,
        subscriptionTier,
      });
      return NextResponse.json({ error: 'Job Feed is not available for this account.' }, { status: 403 });
    }

    const authorizedItem = await authorizeJobFeedJobActionAdmin({
      userId: user.id,
      jobId,
      runId: runId || null,
    });
    if (!authorizedItem) {
      captureJobFeedActionRejected({
        userId,
        route: 'feedback',
        action,
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
    if (error instanceof Error && error.message.includes('terminal state')) {
      captureJobFeedEvent({
        distinctId: userId,
        event: 'job_feed_feedback_conflict',
        logLevel: 'warn',
        properties: {
          route: 'feedback',
          action,
          job_id: jobId || null,
          feed_run_id: runId || null,
          reason: 'terminal_state',
          status: 409,
          subscription_tier: subscriptionTier,
        },
      });
      return NextResponse.json({ error: 'This job feed item can no longer be changed.' }, { status: 409 });
    }

    console.error('[job-feed/feedback] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to record job feed feedback.' }, { status: 500 });
  }
}
