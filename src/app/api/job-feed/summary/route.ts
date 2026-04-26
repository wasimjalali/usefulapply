import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canAccessJobFeed } from '@/lib/job-feed/helpers';
import { listLatestJobFeedItemsAdmin } from '@/lib/job-feed/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

export const runtime = 'nodejs';

// Lightweight companion to /api/job-feed/overview. Used by the dashboard nav
// bar to render the new-jobs badge + first-open popup without having to load
// the full overview (which includes settings, diagnostics, apply metadata).
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = checkRateLimit(`job-feed-overview:${ip}`, RATE_LIMITS['job-feed-overview']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet understand the newly added tables here.
    const typedSupabase = supabase as any;
    const { data: { user }, error: authError } = await typedSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ canAccess: false, latestRunDate: null, jobCount: 0, unprocessedCount: 0 }, { status: 200 });
    }

    const { data: profile } = await typedSupabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();

    const canAccess = canAccessJobFeed(profile?.subscription_tier ?? null);
    if (!canAccess) {
      return NextResponse.json({ canAccess: false, latestRunDate: null, jobCount: 0, unprocessedCount: 0 });
    }

    const { run, items } = await listLatestJobFeedItemsAdmin({ userId: user.id });

    // Unprocessed = jobs in today's feed the user has not acted on yet.
    // Save, apply, dismiss, and "not relevant" ratings each clear the job from
    // the unprocessed pool so the badge counts down as the user works through
    // the feed. (applied / dismissed / rated_not_relevant already drop the
    // item from `items`, so we only need to subtract saved here.)
    const unprocessedCount = items.filter((item) => !item.feedback.savedAt).length;

    return NextResponse.json({
      canAccess: true,
      latestRunDate: run?.local_date ?? null,
      jobCount: items.length,
      unprocessedCount,
    });
  } catch (error) {
    console.error('[job-feed/summary] unexpected error:', error);
    return NextResponse.json({ canAccess: false, latestRunDate: null, jobCount: 0, unprocessedCount: 0 }, { status: 200 });
  }
}
