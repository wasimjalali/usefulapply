import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canAccessJobFeed } from '@/lib/job-feed/helpers';
import { listSavedJobFeedItemsAdmin } from '@/lib/job-feed/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = checkRateLimit(`job-feed-saved:${ip}`, RATE_LIMITS['job-feed-saved']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

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

    if (profileError || !profile) {
      console.error('[job-feed/saved] profile load error:', profileError?.message);
      return NextResponse.json({ error: 'Failed to load saved jobs.' }, { status: 500 });
    }

    if (!canAccessJobFeed(profile.subscription_tier)) {
      return NextResponse.json({ jobs: [] });
    }

    const jobs = await listSavedJobFeedItemsAdmin({ userId: user.id });

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('[job-feed/saved] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to load saved jobs.' }, { status: 500 });
  }
}
