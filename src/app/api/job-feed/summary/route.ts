import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canViewJobFeed } from '@/lib/job-feed/helpers';
import { requireJobFeedAccess } from '@/lib/job-feed/auth';
import { getProfile, updateProfile } from '@/db/repos/profiles';
import { listLatestJobFeedItemsAdmin } from '@/lib/job-feed/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

export const runtime = 'nodejs';

// Lightweight companion to /api/job-feed/overview. Used by the dashboard nav
// bar to render the new-jobs badge + first-open popup without having to load
// the full overview (which includes settings, diagnostics, apply metadata).
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = await checkRateLimit(`job-feed-overview:${ip}`, RATE_LIMITS['job-feed-overview']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ canAccess: false, latestRunDate: null, jobCount: 0, unprocessedCount: 0 }, { status: 200 });
    }

    const profile = await getProfile(user.id);

    const canAccess = canViewJobFeed(profile?.subscription_tier ?? null);
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
      lastSeenRunDate: profile?.job_feed_last_seen_run_date ?? null,
    });
  } catch (error) {
    console.error('[job-feed/summary] unexpected error:', error);
    return NextResponse.json({ canAccess: false, latestRunDate: null, jobCount: 0, unprocessedCount: 0 }, { status: 200 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = await checkRateLimit(`job-feed-overview:${ip}`, RATE_LIMITS['job-feed-overview']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const access = await requireJobFeedAccess(supabase, user);
    if (!access.ok) {
      return NextResponse.json({ canAccess: false, error: access.error }, { status: access.status });
    }

    const body = await request.json();
    const date = typeof body?.lastSeenRunDate === 'string' ? body.lastSeenRunDate.trim() : null;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format.' }, { status: 400 });
    }

    try {
      await updateProfile(user.id, { job_feed_last_seen_run_date: date });
    } catch (updateError) {
      console.error('[job-feed/summary] PATCH update error:', updateError instanceof Error ? updateError.message : updateError);
      return NextResponse.json({ error: 'Failed to update.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[job-feed/summary] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update.' }, { status: 500 });
  }
}
