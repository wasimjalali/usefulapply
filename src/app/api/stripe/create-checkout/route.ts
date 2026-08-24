/**
 * Create Stripe Checkout Session
 * Initiates subscription checkout flow
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, STRIPE_PRICES } from '@/lib/stripe';
import { getCurrentUser } from '@/auth/server';
import { BRAND } from '@/lib/brand';
import { getPostHogServer } from '@/lib/posthog-server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getProfile } from '@/db/repos/profiles';
import { getUserCredits, updateUserCreditsRow } from '@/db/repos/credits';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const rateLimitResult = await checkRateLimit(`create-checkout:${user.id}`, RATE_LIMITS['create-checkout']);
    if (!rateLimitResult.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    // Validate env vars early
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('[Checkout] STRIPE_SECRET_KEY is not set');
      return NextResponse.json({ error: 'Payment system not configured' }, { status: 500 });
    }
    const { planTier } = await req.json();
    const userId = user.id; // Use authenticated user ID, never trust client

    if (!planTier) {
      return NextResponse.json(
        { error: 'Missing planTier' },
        { status: 400 }
      );
    }

    // Only allow known plan tiers — reject unknown values to prevent billing errors
    const allowedTiers = ['plus', 'max'] as const;
    if (!allowedTiers.includes(planTier)) {
      return NextResponse.json(
        { error: 'Invalid plan selected.' },
        { status: 400 }
      );
    }

    // Get user's email
    const profile = await getProfile(userId);

    if (!profile) {
      console.error('[Checkout] User not found:', userId);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get price ID for plan
    const priceId = planTier === 'plus' ? STRIPE_PRICES.PLUS : STRIPE_PRICES.MAX;
    console.log('[Checkout] Plan:', planTier, 'Price ID:', priceId);

    if (!priceId) {
      console.error('[Checkout] Price ID is empty for plan:', planTier, 'PLUS:', STRIPE_PRICES.PLUS, 'MAX:', STRIPE_PRICES.MAX);
      return NextResponse.json(
        { error: 'Selected plan is not available' },
        { status: 400 }
      );
    }

    // Check if user already has a Stripe customer ID
    const { credits: userCredits, error: creditsError } = await getUserCredits(userId);

    if (creditsError) {
      console.error('[Checkout] Failed to load user credits:', userId, creditsError.message);
      return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
    }

    if (
      userCredits?.stripe_subscription_id
      && ['active', 'trialing', 'past_due'].includes(userCredits.subscription_status ?? '')
    ) {
      return NextResponse.json(
        { error: 'Manage your current subscription in billing settings.' },
        { status: 409 },
      );
    }

    let customerId = userCredits?.stripe_customer_id;

    // Create customer if doesn't exist, then persist so future checkouts reuse it
    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: profile.email,
        metadata: {
          userId,
        },
      });
      customerId = customer.id;

      try {
        await updateUserCreditsRow(userId, { stripe_customer_id: customerId });
      } catch (persistError) {
        console.error('[Checkout] Failed to persist stripe_customer_id', {
          userId,
          customerId,
          error: persistError,
        });
      }
    }

    // Create checkout session
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      allow_promotion_codes: true,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${BRAND.url}/dashboard?settings=usage&session_id={CHECKOUT_SESSION_ID}&success=true&plan=${planTier}`,
      cancel_url: `${BRAND.url}/dashboard?settings=usage&canceled=true`,
      metadata: {
        userId,
        planTier,
      },
      subscription_data: {
        metadata: {
          userId,
          planTier,
        },
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: unknown) {
    const stripeError = error as { message?: string; type?: string; raw?: { message?: string } };
    const posthog = getPostHogServer();
    posthog.captureException(error instanceof Error ? error : new Error('Checkout session creation failed'), 'server_error', {
      endpoint: '/api/stripe/create-checkout',
      method: 'POST',
    });
    await posthog.flush();
    console.error('[Checkout] Session creation error:', stripeError.message || error, stripeError.type, stripeError.raw?.message);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
