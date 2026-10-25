/**
 * Record a feed feedback action (save, unsave, dismiss, rate): the body of
 * POST /api/job-feed/feedback, shared with the MCP `give_job_feedback` tool.
 *
 * The route keeps the IP gate, the sign-in check and the per-user rate limit; everything from the
 * profile load on lives here, in the same order, with the same analytics and the same messages.
 */

import { getProfile } from '@/db/repos/profiles';
import { captureJobFeedActionRejected, captureJobFeedEvent } from '@/lib/job-feed/analytics';
import { canAccessJobFeed, canViewJobFeed } from '@/lib/job-feed/helpers';
import {
  authorizeJobFeedJobActionAdmin,
  getJobFeedFeedbackAdmin,
  recordJobFeedFeedbackAdmin,
  toJobFeedFeedbackState,
} from '@/lib/job-feed/server';
import type { JobFeedItemFeedbackState } from '@/lib/job-feed/types';
import { getPostHogServer } from '@/lib/posthog-server';
import { FeedError } from './errors';

// 'rated_helpful' / 'rated_not_relevant' capture the user's match-quality
// signal from the details modal so the ranker can learn from it.
export const SUPPORTED_FEEDBACK_ACTIONS = new Set(['opened', 'saved', 'unsaved', 'dismissed', 'rated_helpful', 'rated_not_relevant']);
// Bookmarking and "I opened this" are part of viewing the feed. Ratings and
// dismiss stay on Plus/Max because they train the ranker.
const VIEW_ACTIONS = new Set(['opened', 'saved', 'unsaved']);

export type FeedbackActionValue = 'opened' | 'saved' | 'unsaved' | 'dismissed' | 'rated_helpful' | 'rated_not_relevant';

export async function recordFeedFeedback(params: {
  userId: string;
  /** The parsed request body (or the tool's arguments). Read defensively: anything may be missing or mistyped. */
  body: Record<string, unknown>;
  /** The `route` property on rejection events: 'feedback' for the web route. */
  analyticsRoute: string;
  /** Added to the success event when set. The web route leaves it out. */
  source?: string;
}): Promise<JobFeedItemFeedbackState> {
  const { userId, body, analyticsRoute: route } = params;
  let jobId = '';
  let action = '';
  let runId = '';
  let subscriptionTier: string | null = null;

  try {
    const profile = await getProfile(userId);
    subscriptionTier = profile?.subscription_tier ?? null;

    if (!profile) {
      captureJobFeedActionRejected({
        userId,
        route,
        action: 'unknown',
        reason: 'profile_load_failed',
        status: 500,
        subscriptionTier,
      });
      throw new FeedError(500, 'Failed to record job feed feedback.', 'profile_missing');
    }

    jobId = typeof body?.jobId === 'string' ? body.jobId.trim() : '';
    action = typeof body?.action === 'string' ? body.action.trim() : '';
    runId = typeof body?.runId === 'string' ? body.runId.trim() : '';

    if (!jobId || jobId.length > 100 || action.length > 64 || runId.length > 100) {
      captureJobFeedActionRejected({
        userId,
        route,
        action: action || 'unknown',
        reason: !jobId ? 'missing_job_id' : 'invalid_input_length',
        status: 400,
        subscriptionTier,
      });
      throw new FeedError(400, 'A job ID is required.', 'invalid_input');
    }

    if (!SUPPORTED_FEEDBACK_ACTIONS.has(action)) {
      captureJobFeedActionRejected({
        userId,
        route,
        action: action || 'unknown',
        reason: 'unsupported_action',
        jobId,
        runId: runId || null,
        status: 400,
        subscriptionTier,
      });
      throw new FeedError(400, 'Unsupported feedback action.', 'invalid_input');
    }

    const allowedOnPlan = VIEW_ACTIONS.has(action)
      ? canViewJobFeed(profile.subscription_tier)
      : canAccessJobFeed(profile.subscription_tier);
    if (!allowedOnPlan) {
      captureJobFeedActionRejected({
        userId,
        route,
        action,
        reason: 'plan_not_allowed',
        status: 403,
        subscriptionTier,
      });
      throw new FeedError(403, 'Job Feed is not available for this account.', 'plan_not_allowed');
    }

    const authorizedItem = await authorizeJobFeedJobActionAdmin({
      userId,
      jobId,
      runId: runId || null,
    });
    if (!authorizedItem) {
      captureJobFeedActionRejected({
        userId,
        route,
        action,
        reason: 'ranked_feed_item_not_found',
        jobId,
        runId: runId || null,
        status: 404,
        subscriptionTier,
      });
      throw new FeedError(404, 'That job is not in this feed. It may be older than 7 days, or your feed settings leave it out.', 'not_found');
    }
    const { job, rankedItem } = authorizedItem;
    const validatedRunId = rankedItem.run_id;

    const feedback = await recordJobFeedFeedbackAdmin({
      userId,
      jobId,
      action: action as FeedbackActionValue,
      latestRunId: validatedRunId,
    });

    const posthog = getPostHogServer();
    posthog.capture({
      distinctId: userId,
      event: 'job_feed_feedback',
      properties: {
        action,
        job_id: jobId,
        company: job.company,
        title: job.title,
        feed_run_id: validatedRunId,
        ...(params.source ? { source: params.source } : {}),
      },
    });

    return toJobFeedFeedbackState(feedback);
  } catch (error) {
    if (!(error instanceof FeedError) && error instanceof Error && error.message.includes('terminal state')) {
      captureJobFeedEvent({
        distinctId: userId,
        event: 'job_feed_feedback_conflict',
        logLevel: 'warn',
        properties: {
          route,
          action,
          job_id: jobId || null,
          feed_run_id: runId || null,
          reason: 'terminal_state',
          status: 409,
          subscription_tier: subscriptionTier,
        },
      });
      throw await terminalStateError(userId, jobId);
    }
    throw error;
  }
}

/**
 * Why a job's feedback can no longer change, from its feedback row: the kit was made (an application),
 * it was dismissed, or it was rated not relevant. Each of those ends the job in the feed.
 */
async function terminalStateError(userId: string, jobId: string): Promise<FeedError> {
  const feedback = await getJobFeedFeedbackAdmin(userId, jobId);
  const metadata = (feedback?.metadata ?? null) as Record<string, unknown> | null;
  if (feedback?.applied_at || feedback?.generation_status === 'succeeded') {
    return new FeedError(409, 'This job already has an application kit, so it left the feed. It is in the tracker.', 'already_applied');
  }
  if (feedback?.dismissed_at) {
    return new FeedError(409, 'This job was dismissed, so it left the feed for good.', 'dismissed');
  }
  if (metadata && typeof metadata === 'object' && metadata.match_rating === 'not_relevant') {
    return new FeedError(409, 'This job was rated not relevant, so it left the feed for good.', 'rated_not_relevant');
  }
  return new FeedError(409, 'This job can no longer be changed.', 'terminal_state');
}
