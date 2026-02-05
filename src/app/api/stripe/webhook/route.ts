/**
 * Stripe Webhook Handler
 * Processes Stripe events for subscription management
 */

import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log('[Stripe Webhook]', event.type);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutCompleted(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        await handlePaymentSucceeded(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: any) {
  const userId = session.metadata?.userId;
  const customerId = session.customer;
  const subscriptionId = session.subscription;

  if (!userId) {
    console.error('No userId in session metadata');
    return;
  }

  // Update user with Stripe customer ID
  const { error } = await supabase
    .from('user_credits')
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to update user credits:', error);
  }
}

async function handleSubscriptionUpdate(subscription: any) {
  const customerId = subscription.customer;

  // Get user by customer ID
  const { data: userCredits } = await supabase
    .from('user_credits')
    .select('user_id, plan_tier')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!userCredits) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Determine plan tier from price ID
  const priceId = subscription.items.data[0]?.price.id;
  let planTier = 'starter';
  let monthlyCredits = 10;

  if (priceId === process.env.STRIPE_PRICE_ID_PLUS) {
    planTier = 'plus';
    monthlyCredits = 160;
  } else if (priceId === process.env.STRIPE_PRICE_ID_PRO) {
    planTier = 'pro';
    monthlyCredits = 300;
  }

  // Update subscription
  const { error } = await supabase
    .from('user_credits')
    .update({
      plan_tier: planTier,
      monthly_credits: monthlyCredits,
      subscription_status: subscription.status,
      stripe_subscription_id: subscription.id,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userCredits.user_id);

  if (error) {
    console.error('Failed to update subscription:', error);
  }
}

async function handleSubscriptionDeleted(subscription: any) {
  const customerId = subscription.customer;

  // Get user by customer ID
  const { data: userCredits } = await supabase
    .from('user_credits')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!userCredits) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Downgrade to starter plan
  const { error } = await supabase
    .from('user_credits')
    .update({
      plan_tier: 'starter',
      monthly_credits: 10,
      subscription_status: 'canceled',
      stripe_subscription_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userCredits.user_id);

  if (error) {
    console.error('Failed to cancel subscription:', error);
  }
}

async function handlePaymentSucceeded(invoice: any) {
  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;

  // Get user by customer ID
  const { data: userCredits } = await supabase
    .from('user_credits')
    .select('user_id, plan_tier, monthly_credits')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!userCredits) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Reset monthly credits on successful payment
  const baseCredits = userCredits.plan_tier === 'plus' ? 160 : userCredits.plan_tier === 'pro' ? 300 : 10;

  const { error } = await supabase
    .from('user_credits')
    .update({
      monthly_credits: baseCredits,
      subscription_status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userCredits.user_id);

  if (error) {
    console.error('Failed to reset credits:', error);
  }
}

async function handlePaymentFailed(invoice: any) {
  const customerId = invoice.customer;

  // Get user by customer ID
  const { data: userCredits } = await supabase
    .from('user_credits')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!userCredits) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Mark subscription as past due
  const { error } = await supabase
    .from('user_credits')
    .update({
      subscription_status: 'past_due',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userCredits.user_id);

  if (error) {
    console.error('Failed to update payment status:', error);
  }
}
