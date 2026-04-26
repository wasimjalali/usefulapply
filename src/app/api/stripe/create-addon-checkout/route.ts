/**
 * Create Stripe Checkout Session for Add-on Credit Packs
 * One-time payment mode for purchasing additional credits
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, STRIPE_ADDON_PRICES, ADDON_CREDIT_MAP } from '@/lib/stripe';
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
    const rateLimitResult = checkRateLimit(`create-addon-checkout:${clientIP}`, { limit: 5, windowMs: 60_000 });
    if (!rateLimitResult.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    // Authentication: verify the caller is logged in
    const authSupabase = await createServerClient();
    const { data: { user }, error: authError } = await authSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { packSize } = await req.json();
    const userId = user.id; // Use authenticated user ID, never trust client

    if (!packSize) {
      return NextResponse.json(
        { error: 'Missing packSize' },
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

    const creditsToAdd = ADDON_CREDIT_MAP[priceId] || 0;

    // Get user's email
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user has an active paid subscription
    const { data: userCredits } = await supabase
      .from('user_credits')
      .select('stripe_customer_id, plan_tier')
      .eq('user_id', userId)
      .single();

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

      // Save customer ID
      await supabase
        .from('user_credits')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', userId);
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
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscription?addon_success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscription?addon_canceled=true`,
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
