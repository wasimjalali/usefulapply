/**
 * Stripe Webhook Handler
 * Processes Stripe events for subscription management
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event;

  try {
    event = getStripe().webhooks.constructEvent(
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

      case 'charge.refunded': {
        const charge = event.data.object;
        await handleChargeRefunded(charge);
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
  const supabase = getSupabaseAdmin();
  const userId = session.metadata?.userId;
  const customerId = session.customer;
  const type = session.metadata?.type;

  if (!userId) {
    console.error('No userId in session metadata');
    return;
  }

  // Handle add-on credit purchases (one-time payment)
  if (type === 'addon_credits') {
    const creditsToAdd = parseInt(session.metadata?.creditsToAdd || '0', 10);
    const packSize = session.metadata?.packSize || 'unknown';
    if (creditsToAdd <= 0) {
      console.error('Invalid creditsToAdd in addon checkout:', session.metadata);
      return;
    }

    // Get current credits for balance tracking
    const { data: currentCredits } = await supabase
      .from('user_credits')
      .select('monthly_credits, rollover_credits, addon_credits')
      .eq('user_id', userId)
      .single();

    const addonBefore = currentCredits?.addon_credits || 0;
    const totalBefore = (currentCredits?.monthly_credits || 0) + (currentCredits?.rollover_credits || 0) + addonBefore;
    const newAddonCredits = addonBefore + creditsToAdd;
    const totalAfter = totalBefore + creditsToAdd;

    const { error } = await supabase
      .from('user_credits')
      .update({
        addon_credits: newAddonCredits,
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to add addon credits:', error);
    } else {
      // Log the credit transaction
      await supabase.from('credit_transactions').insert({
        user_id: userId,
        amount: creditsToAdd,
        transaction_type: 'addon_purchase',
        description: `Purchased ${packSize} add-on pack (${creditsToAdd} credits)`,
        metadata: { packSize, stripeSessionId: session.id },
        balance_before: totalBefore,
        balance_after: totalAfter,
      });
      console.log(`[Stripe Webhook] Added ${creditsToAdd} addon credits for user ${userId}`);
    }
    return;
  }

  // Handle subscription checkout
  const subscriptionId = session.subscription;

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
  const supabase = getSupabaseAdmin();
  const customerId = subscription.customer;

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

  // Determine plan tier from price ID
  const priceId = subscription.items.data[0]?.price.id;
  let planTier = 'starter';
  let newPlanCredits = 40;

  if (priceId === process.env.STRIPE_PRICE_ID_PLUS) {
    planTier = 'plus';
    newPlanCredits = 120;
  } else if (priceId === process.env.STRIPE_PRICE_ID_PRO) {
    planTier = 'pro';
    newPlanCredits = 240;
  }

  // Handle mid-cycle plan changes:
  // - Upgrade (e.g. Plus→Pro): give full new plan credits (rewards upgrading)
  // - Downgrade (e.g. Pro→Plus): cap at new plan limit so users can't gain credits
  const oldPlanCredits = userCredits.plan_tier === 'pro' ? 240 : userCredits.plan_tier === 'plus' ? 120 : 40;
  const isDowngrade = newPlanCredits < oldPlanCredits;
  const monthlyCredits = isDowngrade
    ? Math.min(userCredits.monthly_credits, newPlanCredits)
    : newPlanCredits;

  console.log(`[Stripe Webhook] Plan change: ${userCredits.plan_tier}→${planTier}, credits: ${userCredits.monthly_credits}→${monthlyCredits}${isDowngrade ? ' (downgrade, capped)' : ' (upgrade, full)'}`);

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
  const supabase = getSupabaseAdmin();
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
      monthly_credits: 40,
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
  const supabase = getSupabaseAdmin();
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
  const baseCredits = userCredits.plan_tier === 'plus' ? 120 : userCredits.plan_tier === 'pro' ? 240 : 40;

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

async function handleChargeRefunded(charge: any) {
  const supabase = getSupabaseAdmin();
  const customerId = charge.customer;

  if (!customerId) {
    console.error('[Stripe Webhook] No customer ID on refunded charge');
    return;
  }

  // Get user by customer ID
  const { data: userCredits } = await supabase
    .from('user_credits')
    .select('user_id, monthly_credits, rollover_credits, addon_credits, plan_tier')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!userCredits) {
    console.error('[Stripe Webhook] User not found for refunded charge, customer:', customerId);
    return;
  }

  // Determine how many credits to remove based on the refund amount
  // charge.amount_refunded is in cents
  const refundedAmountCents = charge.amount_refunded;
  const totalAmountCents = charge.amount;

  // Check if this was a subscription payment or add-on purchase
  // by looking at the charge metadata or invoice
  const isSubscription = !!charge.invoice;

  let creditsToRemove = 0;

  if (isSubscription) {
    // Subscription refund: remove the plan's monthly credits
    const planCredits = userCredits.plan_tier === 'pro' ? 240 : userCredits.plan_tier === 'plus' ? 120 : 40;

    if (refundedAmountCents >= totalAmountCents) {
      // Full refund — remove all plan credits
      creditsToRemove = planCredits;
    } else {
      // Partial refund — remove proportional credits
      creditsToRemove = Math.round(planCredits * (refundedAmountCents / totalAmountCents));
    }

    // Deduct from monthly credits first, then rollover
    let remaining = creditsToRemove;
    let newMonthly = userCredits.monthly_credits;
    let newRollover = userCredits.rollover_credits;

    const monthlyDeduct = Math.min(remaining, newMonthly);
    newMonthly -= monthlyDeduct;
    remaining -= monthlyDeduct;

    if (remaining > 0) {
      const rolloverDeduct = Math.min(remaining, newRollover);
      newRollover -= rolloverDeduct;
      remaining -= rolloverDeduct;
    }

    const totalBefore = userCredits.monthly_credits + userCredits.rollover_credits + userCredits.addon_credits;
    const totalAfter = newMonthly + newRollover + userCredits.addon_credits;

    const { error } = await supabase
      .from('user_credits')
      .update({
        monthly_credits: newMonthly,
        rollover_credits: newRollover,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userCredits.user_id);

    if (error) {
      console.error('[Stripe Webhook] Failed to remove credits on refund:', error);
    } else {
      await supabase.from('credit_transactions').insert({
        user_id: userCredits.user_id,
        amount: -creditsToRemove,
        transaction_type: 'refund',
        description: `Refund: removed ${creditsToRemove} subscription credits`,
        metadata: { chargeId: charge.id, refundedAmountCents, isFullRefund: refundedAmountCents >= totalAmountCents },
        balance_before: totalBefore,
        balance_after: totalAfter,
      });
      console.log(`[Stripe Webhook] Refund: removed ${creditsToRemove} credits for user ${userCredits.user_id}`);
    }
  } else {
    // Add-on refund: remove from addon_credits
    // Map refund amount to credit count (both packs are $0.25/credit)
    // 60 credits = $14.99, 120 credits = $29.99
    // Use the charge amount to determine which pack was purchased
    if (totalAmountCents === 1499) {
      creditsToRemove = 60;
    } else if (totalAmountCents === 2999) {
      creditsToRemove = 120;
    } else {
      // Fallback: proportional based on $0.25/credit
      creditsToRemove = Math.round(refundedAmountCents / 25);
    }

    // For partial refunds, scale proportionally
    if (refundedAmountCents < totalAmountCents) {
      const fullPackCredits = creditsToRemove;
      creditsToRemove = Math.round(fullPackCredits * (refundedAmountCents / totalAmountCents));
    }

    const newAddon = Math.max(0, userCredits.addon_credits - creditsToRemove);
    const totalBefore = userCredits.monthly_credits + userCredits.rollover_credits + userCredits.addon_credits;
    const totalAfter = userCredits.monthly_credits + userCredits.rollover_credits + newAddon;

    const { error } = await supabase
      .from('user_credits')
      .update({
        addon_credits: newAddon,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userCredits.user_id);

    if (error) {
      console.error('[Stripe Webhook] Failed to remove addon credits on refund:', error);
    } else {
      await supabase.from('credit_transactions').insert({
        user_id: userCredits.user_id,
        amount: -creditsToRemove,
        transaction_type: 'refund',
        description: `Refund: removed ${creditsToRemove} add-on credits`,
        metadata: { chargeId: charge.id, refundedAmountCents, totalAmountCents },
        balance_before: totalBefore,
        balance_after: totalAfter,
      });
      console.log(`[Stripe Webhook] Refund: removed ${creditsToRemove} addon credits for user ${userCredits.user_id}`);
    }
  }
}

async function handlePaymentFailed(invoice: any) {
  const supabase = getSupabaseAdmin();
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
