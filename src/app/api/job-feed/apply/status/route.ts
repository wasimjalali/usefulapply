import { NextRequest, NextResponse } from 'next/server';
import { canViewJobFeed } from '@/lib/job-feed/helpers';
import { captureJobFeedActionRejected, captureJobFeedEvent } from '@/lib/job-feed/analytics';
import { updateJobFeedApplicationGenerationStatusAdmin } from '@/lib/job-feed/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import type { JobFeedGenerationStatus } from '@/lib/supabase/types';

export const runtime = 'nodejs';

const SUPPORTED_STATUSES = new Set<JobFeedGenerationStatus>(['running', 'succeeded', 'failed', 'cancelled']);

export async function POST(request: NextRequest) {
  let userId: string | null = null;
  let sessionId = '';
  let generationId = '';
  let status: JobFeedGenerationStatus | 'none' = 'none';
  let subscriptionTier: string | null = null;

  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet understand all Job Feed columns here.
    const typedSupabase = supabase as any;
    const { data: { user }, error: authError } = await typedSupabase.auth.getUser();

    if (authError || !user) {
      captureJobFeedActionRejected({
        route: 'apply/status',
        action: 'generation_status_update',
        reason: 'unauthenticated',
        status: 401,
      });
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    userId = user.id;

    const { allowed } = checkRateLimit(`job-feed-apply-status:${user.id}`, RATE_LIMITS['job-feed-apply-status']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
    }

    const { data: profile, error: profileError } = await typedSupabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();
    subscriptionTier = profile?.subscription_tier ?? null;

    if (profileError || !profile || !canViewJobFeed(profile.subscription_tier)) {
      captureJobFeedActionRejected({
        userId,
        route: 'apply/status',
        action: 'generation_status_update',
        reason: profileError ? 'profile_load_failed' : 'plan_not_allowed',
        status: 403,
        subscriptionTier,
      });
      return NextResponse.json({ error: 'Job Feed is not available for this account.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
    generationId = typeof body?.generationId === 'string' ? body.generationId.trim() : '';
    status = typeof body?.status === 'string' ? body.status.trim() as JobFeedGenerationStatus : 'none';
    const errorMessage = typeof body?.errorMessage === 'string' ? body.errorMessage.trim().slice(0, 1000) : null;

    if (!sessionId || sessionId.length > 100 || generationId.length > 100) {
      captureJobFeedActionRejected({
        userId,
        route: 'apply/status',
        action: 'generation_status_update',
        reason: !sessionId ? 'missing_session_id' : 'invalid_input_length',
        status: 400,
        subscriptionTier,
      });
      return NextResponse.json({ error: 'A session ID is required.' }, { status: 400 });
    }

    if (!SUPPORTED_STATUSES.has(status)) {
      captureJobFeedActionRejected({
        userId,
        route: 'apply/status',
        action: 'generation_status_update',
        reason: 'unsupported_generation_status',
        status: 400,
        subscriptionTier,
      });
      return NextResponse.json({ error: 'Unsupported generation status.' }, { status: 400 });
    }

    const result = await updateJobFeedApplicationGenerationStatusAdmin({
      userId: user.id,
      sessionId,
      generationId: generationId || null,
      status: status as Exclude<JobFeedGenerationStatus, 'none' | 'pending'>,
      errorMessage,
    });

    captureJobFeedEvent({
      distinctId: user.id,
      event: status === 'running' ? 'job_feed_generation_started' : `job_feed_generation_${status}`,
      properties: {
        session_id: sessionId,
        generation_id: result.generation.id,
        generation_attempt: result.generation.attempt,
        job_id: result.feedback?.canonical_job_id ?? null,
        feed_run_id: result.feedback?.latest_run_id ?? null,
        company: result.session.company,
        title: result.session.job_title,
        has_error: Boolean(errorMessage),
        subscription_tier: subscriptionTier,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('generation was not found')) {
      captureJobFeedActionRejected({
        userId,
        route: 'apply/status',
        action: 'generation_status_update',
        reason: 'generation_not_found',
        status: 404,
        subscriptionTier,
      });
      return NextResponse.json({ error: 'Application generation not found.' }, { status: 404 });
    }

    if (error instanceof Error && error.message.includes('session was not found')) {
      captureJobFeedActionRejected({
        userId,
        route: 'apply/status',
        action: 'generation_status_update',
        reason: 'session_not_found',
        status: 404,
        subscriptionTier,
      });
      return NextResponse.json({ error: 'Application session not found.' }, { status: 404 });
    }

    console.error('[job-feed/apply/status] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to update application generation status.' }, { status: 500 });
  }
}
