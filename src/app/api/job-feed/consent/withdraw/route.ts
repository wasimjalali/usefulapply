import { NextRequest, NextResponse } from 'next/server';
import { checkJobFeedIpGate, checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import { FeedError } from '@/lib/services/feed/errors';
import { withdrawFeedConsent } from '@/lib/services/feed/settings';

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

    await withdrawFeedConsent(user.id);
    return NextResponse.json({ withdrawn: true });
  } catch (error) {
    if (error instanceof FeedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[job-feed/consent/withdraw] unexpected error:', error);
    return NextResponse.json({ error: 'Failed to withdraw feed consent.' }, { status: 500 });
  }
}
