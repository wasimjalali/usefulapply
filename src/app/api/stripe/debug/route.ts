/**
 * Stripe Debug Endpoint
 * Tests Supabase connectivity and shows env var status
 * DELETE THIS FILE after debugging is complete
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');

  const envCheck = {
    STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_ID_PLUS: process.env.STRIPE_PRICE_ID_PLUS ? `${process.env.STRIPE_PRICE_ID_PLUS.substring(0, 10)}...` : 'MISSING',
    STRIPE_PRICE_ID_PRO: process.env.STRIPE_PRICE_ID_PRO ? `${process.env.STRIPE_PRICE_ID_PRO.substring(0, 10)}...` : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING',
  };

  const supabase = getSupabaseAdmin();
  const results: Record<string, any> = { envCheck };

  // Test subscriptions table access
  try {
    const { data, error, status } = await supabase
      .from('subscriptions')
      .select('id, user_id, tier, status')
      .limit(1);
    results.subscriptionsTable = { data, error, httpStatus: status };
  } catch (e: any) {
    results.subscriptionsTable = { error: e.message };
  }

  // Test user_credits table access
  if (userId) {
    try {
      const { data, error, status } = await supabase
        .from('user_credits')
        .select('user_id, plan_tier, monthly_credits, subscription_status, stripe_customer_id, stripe_subscription_id')
        .eq('user_id', userId)
        .single();
      results.userCredits = { data, error, httpStatus: status };
    } catch (e: any) {
      results.userCredits = { error: e.message };
    }

    // Also check subscriptions for this user
    try {
      const { data, error, status } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId);
      results.userSubscriptions = { data, error, httpStatus: status };
    } catch (e: any) {
      results.userSubscriptions = { error: e.message };
    }
  }

  return NextResponse.json(results, { status: 200 });
}
