/**
 * Create Stripe Customer Portal Session
 * Allows users to manage their subscription
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getPostHogServer } from '@/lib/posthog-server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

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
    const rateLimitResult = await checkRateLimit(`create-portal:${clientIP}`, RATE_LIMITS['create-portal']);
    if (!rateLimitResult.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    // Authentication: verify the caller is logged in
    const authSupabase = await createServerClient();
    const { data: { user }, error: authError } = await authSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!process.env.NEXT_PUBLIC_APP_URL) {
      console.error('[Portal] NEXT_PUBLIC_APP_URL is not set');
      return NextResponse.json({ error: 'App URL not configured' }, { status: 500 });
    }

    const supabase = getSupabaseAdmin();
    const userId = user.id; // Use authenticated user ID, never trust client

    // Get user's Stripe customer ID
    const { data: userCredits } = await supabase
      .from('user_credits')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (!userCredits?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 404 }
      );
    }

    // Create portal session
    const session = await getStripe().billingPortal.sessions.create({
      customer: userCredits.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscription`,
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
