/**
 * Create Stripe Checkout Session
 * Initiates subscription checkout flow
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, STRIPE_PRICES } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    // Validate env vars early
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('[Checkout] STRIPE_SECRET_KEY is not set');
      return NextResponse.json({ error: 'Stripe not configured (missing secret key)' }, { status: 500 });
    }
    if (!process.env.NEXT_PUBLIC_APP_URL) {
      console.error('[Checkout] NEXT_PUBLIC_APP_URL is not set');
      return NextResponse.json({ error: 'App URL not configured' }, { status: 500 });
    }

    const supabase = getSupabaseAdmin();
    const { userId, planTier } = await req.json();

    if (!userId || !planTier) {
      return NextResponse.json(
        { error: 'Missing userId or planTier' },
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
    const priceId = planTier === 'plus' ? STRIPE_PRICES.PLUS : STRIPE_PRICES.PRO;
    console.log('[Checkout] Plan:', planTier, 'Price ID:', priceId);

    if (!priceId) {
      console.error('[Checkout] Price ID is empty for plan:', planTier, 'PLUS:', STRIPE_PRICES.PLUS, 'PRO:', STRIPE_PRICES.PRO);
      return NextResponse.json(
        { error: `Price not configured for ${planTier} plan. Check STRIPE_PRICE_ID_${planTier.toUpperCase()} env var.` },
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

    // Create customer if doesn't exist
    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: profile.email,
        metadata: {
          userId,
        },
      });
      customerId = customer.id;
    }

    // Create checkout session
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?canceled=true`,
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
    console.error('[Checkout] Session creation error:', error?.message || error, error?.type, error?.raw?.message);
    return NextResponse.json(
      { error: error?.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
