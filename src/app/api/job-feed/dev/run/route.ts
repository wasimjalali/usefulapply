import { NextResponse } from 'next/server';
import { isJobFeedDebugModeEnabled } from '@/lib/job-feed/constants';
import { canAccessJobFeed } from '@/lib/job-feed/helpers';
import { runJobFeedFoundationWorkflow } from '@/lib/job-feed/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST() {
  if (!isJobFeedDebugModeEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  try {
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

    const workflow = await runJobFeedFoundationWorkflow({
      userId: user.id,
      triggerSource: 'manual_debug',
    });

    return NextResponse.json(workflow);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run the feed backend workflow.' },
      { status: 500 }
    );
  }
}
