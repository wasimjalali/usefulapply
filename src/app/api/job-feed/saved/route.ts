import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canAccessJobFeed } from '@/lib/job-feed/helpers';
import { listSavedJobFeedItemsAdmin } from '@/lib/job-feed/server';
import { getProfile } from '@/db/repos/profiles';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = await checkRateLimit(`job-feed-saved:${ip}`, RATE_LIMITS['job-feed-saved']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const profile = await getProfile(user.id);

    if (!profile) {
      console.error('[job-feed/saved] profile load error: profile not found');
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
