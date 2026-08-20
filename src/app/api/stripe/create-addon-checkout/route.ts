/**
 * Create Stripe Checkout Session for Add-on Credit Packs
 * One-time payment mode for purchasing additional credits
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, STRIPE_ADDON_PRICES, ADDON_CREDIT_MAP } from '@/lib/stripe';
import { getCurrentUser } from '@/auth/server';
import { BRAND } from '@/lib/brand';
import { getPostHogServer } from '@/lib/posthog-server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getProfile } from '@/db/repos/profiles';
import { findCreditsByUserId, updateUserCreditsRow } from '@/db/repos/credits';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const rateLimitResult = await checkRateLimit(`create-addon-checkout:${user.id}`, RATE_LIMITS['create-addon-checkout']);
    if (!rateLimitResult.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    const { packSize } = await req.json();
    const userId = user.id; // Use authenticated user ID, never trust client

    if (!packSize || typeof packSize !== 'string' || packSize.length > 64) {
      return NextResponse.json(
        { error: 'Invalid packSize' },
        { status: 400 }
      );
    }

    // Map pack size to price ID (new single pack + legacy sizes)
    const priceMap: Record<string, string> = {
      'credit pack': STRIPE_ADDON_PRICES.CREDIT_PACK,
      credit: STRIPE_ADDON_PRICES.CREDIT_PACK,
      medium: STRIPE_ADDON_PRICES.MEDIUM,
      large: STRIPE_ADDON_PRICES.LARGE,
    };

    const priceId = priceMap[packSize];

    if (!priceId) {
      return NextResponse.json(
        { error: 'Invalid pack size or price not configured' },
        { status: 400 }
      );
    }

    const creditsToAdd = ADDON_CREDIT_MAP[priceId];
    if (!creditsToAdd || creditsToAdd <= 0) {
      console.error('[Addon Checkout] No credit mapping for priceId:', priceId, 'packSize:', packSize);
      return NextResponse.json(
        { error: 'Credit pack configuration error' },
        { status: 500 }
      );
    }

    // Get user's email
    const profile = await getProfile(userId);

    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user has an active paid subscription
    const userCredits = await findCreditsByUserId(userId);

    if (!userCredits || userCredits.plan_tier === 'free') {
      return NextResponse.json(
        { error: 'Add-on credits are only available for Plus and Max subscribers' },
        { status: 403 }
      );
    }

    let customerId = userCredits.stripe_customer_id;

    // Create customer if doesn't exist
    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: profile.email,
        metadata: { userId },
      });
      customerId = customer.id;

      // Save customer ID so future checkouts reuse it
      try {
        await updateUserCreditsRow(userId, { stripe_customer_id: customerId });
      } catch (persistError) {
        console.error('[Addon Checkout] Failed to persist stripe_customer_id', {
          userId,
          customerId,
          error: persistError,
        });
      }
    }

    // Create one-time payment checkout session
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      allow_promotion_codes: true,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${BRAND.url}/dashboard?settings=usage&addon_success=true`,
      cancel_url: `${BRAND.url}/dashboard?settings=usage&addon_canceled=true`,
      metadata: {
        userId,
        type: 'addon_credits',
        packSize,
        creditsToAdd: creditsToAdd.toString(),
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    const posthog = getPostHogServer();
    posthog.captureException(error as Error, 'server_error', {
      endpoint: '/api/stripe/create-addon-checkout',
      method: 'POST',
    });
    await posthog.flush();
    console.error('[Addon Checkout] Session creation error:', error?.message || error, error?.type, error?.raw?.message);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
