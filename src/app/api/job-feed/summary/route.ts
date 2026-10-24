import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/auth/server';
import { canViewJobFeed } from '@/lib/job-feed/helpers';
import { getProfile, updateProfile } from '@/db/repos/profiles';
import { listLatestJobFeedItemsAdmin } from '@/lib/job-feed/server';
import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

export const runtime = 'nodejs';

// Lightweight companion to /api/job-feed/overview. Used by the dashboard nav
// bar to render the new-jobs badge + first-open popup without having to load
// the full overview (which includes settings, diagnostics, apply metadata).
export async function GET(request: NextRequest) {
  try {
    const ipAllowed = await checkJobFeedIpGate(request);
    if (!ipAllowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ canAccess: false, latestRunDate: null, jobCount: 0, lastSeenRunDate: null }, { status: 200 });
    }

    const { allowed } = await checkRateLimit(`job-feed-summary:${user.id}`, RATE_LIMITS['job-feed-summary']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const profile = await getProfile(user.id);

    const canAccess = canViewJobFeed(profile?.subscription_tier ?? null);
    if (!canAccess) {
      return NextResponse.json({ canAccess: false, latestRunDate: null, jobCount: 0, lastSeenRunDate: null });
    }

    const { run, items } = await listLatestJobFeedItemsAdmin({ userId: user.id });

    return NextResponse.json({
      canAccess: true,
      latestRunDate: run?.local_date ?? null,
      jobCount: items.length,
      lastSeenRunDate: profile?.job_feed_last_seen_run_date ?? null,
    });
  } catch (error) {
    console.error('[job-feed/summary] unexpected error:', error);
    return NextResponse.json({ canAccess: false, latestRunDate: null, jobCount: 0, lastSeenRunDate: null }, { status: 200 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ipAllowed = await checkJobFeedIpGate(request);
    if (!ipAllowed) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
    }

    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { allowed } = await checkRateLimit(`job-feed-summary:${user.id}`, RATE_LIMITS['job-feed-summary']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
    }

    // Match GET, which is free-tier. Gating this on the paid plans meant a free
    // user got a badge from GET and then a 403 here, so their last-seen date
    // was never written and the badge never cleared.
    const profile = await getProfile(user.id);
    if (!profile) {
      return NextResponse.json({ error: 'Failed to update.' }, { status: 500 });
    }
    if (!canViewJobFeed(profile.subscription_tier)) {
      return NextResponse.json({ canAccess: false, error: 'Job Feed is not available for this account.' }, { status: 403 });
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
