import { NextRequest, NextResponse } from 'next/server';
import { isJobFeedDebugModeEnabled } from '@/lib/job-feed/constants';
import { canAccessJobFeed } from '@/lib/job-feed/helpers';
import { dispatchJobFeedUserRun } from '@/lib/job-feed/orchestration';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!isJobFeedDebugModeEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  try {
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

    const result = await dispatchJobFeedUserRun({
      userId: user.id,
      triggerSource: force ? 'manual_debug_force' : 'manual_debug',
      force,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run the feed backend workflow.' },
      { status: 500 }
    );
  }
}
