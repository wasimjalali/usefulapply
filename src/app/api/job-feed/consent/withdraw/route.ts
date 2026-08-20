import { NextRequest, NextResponse } from 'next/server';
import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import { canViewJobFeed } from '@/lib/job-feed/helpers';
import { getProfile } from '@/db/repos/profiles';
import { withdrawConsent } from '@/db/repos/jobFeed';

export const runtime = 'nodejs';

/**
 * Tier-agnostic consent withdrawal. GDPR does not care about the plan, so this
 * cannot live behind the plus/max gate on PUT /api/job-feed/settings.
 *
 * Clears consent_accepted_at and sets enabled: false. Idempotent.
 */
export async function POST(request: NextRequest) {
  try {
    const ipAllowed = await checkJobFeedIpGate(request);
    if (!ipAllowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { allowed } = await checkRateLimit(`job-feed-consent-withdraw:${user.id}`, RATE_LIMITS['job-feed-settings']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const profile = await getProfile(user.id);
    if (!profile) {
      return NextResponse.json({ error: 'Failed to load profile.' }, { status: 500 });
    }

    if (!canViewJobFeed(profile.subscription_tier)) {
      return NextResponse.json({ error: 'Job Feed is not available for this account.' }, { status: 403 });
    }

    await withdrawConsent(user.id);
    return NextResponse.json({ withdrawn: true });
  } catch (error) {
    console.error('[job-feed/consent/withdraw] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to withdraw feed consent.' }, { status: 500 });
  }
}
