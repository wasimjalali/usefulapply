import { NextRequest, NextResponse } from 'next/server';
import { canAccessJobFeed } from '@/lib/job-feed/helpers';
import { updateJobFeedApplicationGenerationStatusAdmin } from '@/lib/job-feed/server';
import { getPostHogServer } from '@/lib/posthog-server';
import { createClient } from '@/lib/supabase/server';
import type { JobFeedGenerationStatus } from '@/lib/supabase/types';

export const runtime = 'nodejs';

const SUPPORTED_STATUSES = new Set<JobFeedGenerationStatus>(['running', 'succeeded', 'failed', 'cancelled']);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet understand all Job Feed columns here.
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
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
    const status = typeof body?.status === 'string' ? body.status.trim() as JobFeedGenerationStatus : 'none';
    const errorMessage = typeof body?.errorMessage === 'string' ? body.errorMessage.trim().slice(0, 1000) : null;

    if (!sessionId) {
      return NextResponse.json({ error: 'A session ID is required.' }, { status: 400 });
    }

    if (!SUPPORTED_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Unsupported generation status.' }, { status: 400 });
    }

    await updateJobFeedApplicationGenerationStatusAdmin({
      userId: user.id,
      sessionId,
      status: status as Exclude<JobFeedGenerationStatus, 'none' | 'pending'>,
      errorMessage,
    });

    getPostHogServer().capture({
      distinctId: user.id,
      event: `job_feed_generation_${status}`,
      properties: {
        session_id: sessionId,
        has_error: Boolean(errorMessage),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[job-feed/apply/status] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to update application generation status.' }, { status: 500 });
  }
}
