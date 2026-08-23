/**
 * Create Stripe Customer Portal Session
 * Allows users to manage their subscription
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getCurrentUser } from '@/auth/server';
import { BRAND } from '@/lib/brand';
import { getPostHogServer } from '@/lib/posthog-server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { findCreditsByUserId } from '@/db/repos/credits';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const rateLimitResult = await checkRateLimit(`create-portal:${user.id}`, RATE_LIMITS['create-portal']);
    if (!rateLimitResult.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    const userId = user.id; // Use authenticated user ID, never trust client

    // Get user's Stripe customer ID
    const userCredits = await findCreditsByUserId(userId);

    if (!userCredits?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 404 }
      );
    }

    // Create portal session
    const session = await getStripe().billingPortal.sessions.create({
      customer: userCredits.stripe_customer_id,
      return_url: `${BRAND.url}/dashboard?settings=usage`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const posthog = getPostHogServer();
    posthog.captureException(error as Error, 'server_error', {
      endpoint: '/api/stripe/create-portal',
      method: 'POST',
    });
    await posthog.flush();
    console.error('Portal session creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    );
  }
}
