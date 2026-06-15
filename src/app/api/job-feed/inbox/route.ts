import { NextRequest, NextResponse } from 'next/server';
import { canAccessJobFeed, canViewJobFeed } from '@/lib/job-feed/helpers';
import { getJobFeedTierLimits } from '@/lib/job-feed/constants';
import { listJobFeedInboxPageAdmin } from '@/lib/job-feed/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const MAX_PAGE_LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = checkRateLimit(`job-feed-inbox:${ip}`, RATE_LIMITS['job-feed-inbox']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet cover all tables here.
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

    if (profileError || !profile || !canViewJobFeed(profile.subscription_tier)) {
      return NextResponse.json({ error: 'Job Feed is not available for this account.' }, { status: 403 });
    }

    // Free users can only see up to their tier visibleCount (5) across the
    // inbox. Premium (plus/max) users paginate without a tier cap here.
    const isPremium = canAccessJobFeed(profile.subscription_tier);
    const tierLimits = getJobFeedTierLimits(profile.subscription_tier);

    const url = new URL(request.url);
    const offset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;
    const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? '10', 10) || 10;
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, limitRaw));

    const page = await listJobFeedInboxPageAdmin({
      userId: user.id,
      offset,
      limit,
    });

    if (!page) {
      return NextResponse.json({ items: [], totalCount: 0, hasMore: false, offset, limit });
    }

    // Cap free users to their visibleCount across all inbox pages so they
    // cannot paginate beyond what the tier allows even via direct API calls.
    const visibleCap = isPremium ? page.totalCount : tierLimits.visibleCount;
    const cappedItems = page.items.slice(0, Math.max(0, visibleCap - offset));
    const cappedTotal = Math.min(page.totalCount, visibleCap);
    const cappedHasMore = isPremium ? page.hasMore : offset + cappedItems.length < cappedTotal;

    return NextResponse.json({
      items: cappedItems,
      totalCount: cappedTotal,
      hasMore: cappedHasMore,
      offset,
      limit,
    });
  } catch (error) {
    console.error('[job-feed/inbox] error:', error);
    return NextResponse.json({ error: 'Failed to load job feed inbox.' }, { status: 500 });
  }
}
