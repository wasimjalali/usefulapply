/**
 * Create Stripe Checkout Session
 * Initiates subscription checkout flow
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, STRIPE_PRICES } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getPostHogServer } from '@/lib/posthog-server';
import { checkRateLimit, getClientIP } from '@/lib/middleware/rateLimiter';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const clientIP = getClientIP(req);
    const rateLimitResult = checkRateLimit(`create-checkout:${clientIP}`, { limit: 5, windowMs: 60_000 });
    if (!rateLimitResult.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    // Authentication: verify the caller is logged in
    const authSupabase = await createServerClient();
    const { data: { user }, error: authError } = await authSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Validate env vars early
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('[Checkout] STRIPE_SECRET_KEY is not set');
      return NextResponse.json({ error: 'Payment system not configured' }, { status: 500 });
    }
    if (!process.env.NEXT_PUBLIC_APP_URL) {
      console.error('[Checkout] NEXT_PUBLIC_APP_URL is not set');
      return NextResponse.json({ error: 'App URL not configured' }, { status: 500 });
    }

    const supabase = getSupabaseAdmin();
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
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    if (!profile) {
      console.error('[Checkout] User not found:', userId, profileError);
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
    const { data: userCredits } = await supabase
      .from('user_credits')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

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

      const { error: persistError } = await supabase
        .from('user_credits')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', userId);

      if (persistError) {
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
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscription?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscription?canceled=true`,
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
  } catch (error: any) {
    const posthog = getPostHogServer();
    posthog.captureException(error as Error, 'server_error', {
      endpoint: '/api/stripe/create-checkout',
      method: 'POST',
    });
    await posthog.flush();
    console.error('[Checkout] Session creation error:', error?.message || error, error?.type, error?.raw?.message);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
