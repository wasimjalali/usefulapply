/**
 * Stripe Webhook Handler
 * Processes Stripe events for subscription management
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import { getPostHogServer } from '@/lib/posthog-server';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Keep profiles.subscription_tier in sync so AuthContext / PostHog
 * analytics always reflect the current plan.
 */
async function syncProfileTier(userId: string, tier: string) {
  const supabase = getSupabaseAdmin();
  // Map to the profiles table CHECK constraint values
  // profiles uses 'free'|'pro'|'enterprise' but we also need 'starter'|'plus'
  const { error } = await supabase
    .from('profiles')
    .update({
      subscription_tier: tier,
      subscription_status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error(`[Stripe Webhook] Failed to sync profiles.subscription_tier for ${userId}:`, error);
  } else {
    console.log(`[Stripe Webhook] Synced profiles.subscription_tier → ${tier} for ${userId}`);
  }
}

/**
 * Upsert into the `subscriptions` table so the frontend getSubscription()
 * always has a row to read. Uses user_id as the conflict key (only one
 * active subscription per user via the unique partial index).
 */
async function upsertSubscription(opts: {
  userId: string;
  tier: string;
  status: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}) {
  const supabase = getSupabaseAdmin();

  // Map internal tier names to the subscriptions table tier values
  const tierMap: Record<string, string> = { free: 'free', starter: 'free', plus: 'plus', max: 'max', pro: 'max' };
  const tier = tierMap[opts.tier] || opts.tier;

  // Try to find existing subscription for this user
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', opts.userId)
    .limit(1)
    .single();

  if (existing) {
    // Update existing row
    const { error } = await supabase
      .from('subscriptions')
      .update({
        tier,
        status: opts.status,
        stripe_customer_id: opts.stripeCustomerId,
        stripe_subscription_id: opts.stripeSubscriptionId,
        stripe_price_id: opts.stripePriceId,
        current_period_start: opts.currentPeriodStart,
        current_period_end: opts.currentPeriodEnd,
        cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) {
      console.error('[Stripe Webhook] Failed to update subscriptions row:', error);
    } else {
      console.log(`[Stripe Webhook] Updated subscriptions row for user ${opts.userId} → ${tier}/${opts.status}`);
    }
  } else {
    // Insert new row
    const { error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: opts.userId,
        tier,
        status: opts.status,
        stripe_customer_id: opts.stripeCustomerId,
        stripe_subscription_id: opts.stripeSubscriptionId,
        stripe_price_id: opts.stripePriceId,
        current_period_start: opts.currentPeriodStart,
        current_period_end: opts.currentPeriodEnd,
        cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
      });

    if (error) {
      console.error('[Stripe Webhook] Failed to insert subscriptions row:', error);
    } else {
      console.log(`[Stripe Webhook] Inserted subscriptions row for user ${opts.userId} → ${tier}/${opts.status}`);
    }
  }
}

export async function POST(req: NextRequest) {

  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    console.error('[Stripe Webhook] No stripe-signature header');
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('[Stripe Webhook] Signature verification FAILED:', err?.message || err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log('[Stripe Webhook] Event verified:', event.type, 'id:', event.id);

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
    const posthog = getPostHogServer();
    posthog.captureException(error as Error, 'server_error', {
      endpoint: '/api/stripe/webhook',
      method: 'POST',
    });
    await posthog.flush();
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
  const planTier = session.metadata?.planTier || 'starter';

  // Map plan tier to credits (handle both old and new tier names)
  let planCredits = 10;
  if (planTier === 'plus') planCredits = 100;
  else if (planTier === 'max' || planTier === 'pro') planCredits = 200;

  console.log(`[Stripe Webhook] checkout.session.completed: userId=${userId}, planTier=${planTier}, credits=${planCredits}`);

  // Update user_credits with the new plan AND Stripe IDs in one shot.
  // This is the authoritative update — handleSubscriptionUpdate may have
  // already run (race condition) but we always overwrite here with the
  // correct values derived from the checkout session metadata.
  const { error } = await supabase
    .from('user_credits')
    .update({
      plan_tier: planTier,
      monthly_credits: planCredits,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('[Stripe Webhook] Failed to update user credits on checkout:', error);
  } else {
    console.log(`[Stripe Webhook] Successfully upgraded user ${userId} to ${planTier} (${planCredits} credits)`);
  }

  // Also upsert into the subscriptions table so getSubscription() works
  // Retrieve the Stripe subscription object for period dates
  let periodStart: string | undefined;
  let periodEnd: string | undefined;
  let stripePriceId: string | undefined;
  try {
    const stripeSub = await getStripe().subscriptions.retrieve(subscriptionId) as any;
    periodStart = stripeSub.current_period_start
      ? new Date(stripeSub.current_period_start * 1000).toISOString()
      : undefined;
    periodEnd = stripeSub.current_period_end
      ? new Date(stripeSub.current_period_end * 1000).toISOString()
      : undefined;
    stripePriceId = stripeSub.items?.data?.[0]?.price?.id;
  } catch (e) {
    console.warn('[Stripe Webhook] Could not retrieve subscription details for subscriptions table:', e);
  }

  await upsertSubscription({
    userId,
    tier: planTier,
    status: 'active',
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripePriceId,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
  });

  // Keep profiles table in sync
  await syncProfileTier(userId, planTier);
}

async function handleSubscriptionUpdate(subscription: any) {
  const supabase = getSupabaseAdmin();
  const customerId = subscription.customer;

  // Try to find user by stripe_customer_id first (handles renewals / updates
  // where the customer ID is already stored). For new subscriptions the
  // customer.subscription.created event fires BEFORE checkout.session.completed,
  // so stripe_customer_id may not be saved yet — fall back to subscription metadata.
  let { data: userCredits } = await supabase
    .from('user_credits')
    .select('user_id, plan_tier, monthly_credits')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!userCredits) {
    // Fallback: look up by userId stored in subscription metadata
    const metaUserId = subscription.metadata?.userId;
    if (metaUserId) {
      console.log(`[Stripe Webhook] customer_id lookup missed, trying metadata userId: ${metaUserId}`);
      const { data: creditsById } = await supabase
        .from('user_credits')
        .select('user_id, plan_tier, monthly_credits')
        .eq('user_id', metaUserId)
        .single();

      if (creditsById) {
        userCredits = creditsById;
        // Persist the customer ID now so future lookups work
        await supabase
          .from('user_credits')
          .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
          .eq('user_id', metaUserId);
      }
    }
  }

  if (!userCredits) {
    console.error('[Stripe Webhook] User not found for customer:', customerId, '(subscription event will be handled by checkout.session.completed)');
    return;
  }

  // Determine plan tier from price ID (handle both old and new env var names)
  const priceId = subscription.items.data[0]?.price.id;
  let planTier = 'free';
  let newPlanCredits = 10;

  if (priceId === process.env.STRIPE_PRICE_ID_PLUS) {
    planTier = 'plus';
    newPlanCredits = 100;
  } else if (priceId === process.env.STRIPE_PRICE_ID_MAX || priceId === process.env.STRIPE_PRICE_ID_PRO) {
    planTier = 'max';
    newPlanCredits = 200;
  }

  // Handle mid-cycle plan changes:
  // - Upgrade (e.g. Plus→Max): give full new plan credits (rewards upgrading)
  // - Downgrade (e.g. Max→Plus): cap at new plan limit so users can't gain credits
  const oldPlanCredits = (userCredits.plan_tier === 'max' || userCredits.plan_tier === 'pro') ? 200 : userCredits.plan_tier === 'plus' ? 100 : 10;
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

  // Sync subscriptions table
  let periodStart: string | undefined;
  let periodEnd: string | undefined;
  try {
    periodStart = subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000).toISOString()
      : undefined;
    periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : undefined;
  } catch { /* ignore */ }

  await upsertSubscription({
    userId: userCredits.user_id,
    tier: planTier,
    status: subscription.status,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });

  // Keep profiles table in sync
  await syncProfileTier(userCredits.user_id, planTier);
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

  // Downgrade to free plan
  const { error } = await supabase
    .from('user_credits')
    .update({
      plan_tier: 'free',
      monthly_credits: 10,
      subscription_status: 'canceled',
      stripe_subscription_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userCredits.user_id);

  if (error) {
    console.error('Failed to cancel subscription:', error);
  }

  // Sync subscriptions table
  await upsertSubscription({
    userId: userCredits.user_id,
    tier: 'free',
    status: 'canceled',
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
  });

  // Downgrade profiles table too
  const supabaseForProfile = getSupabaseAdmin();
  await supabaseForProfile
    .from('profiles')
    .update({
      subscription_tier: 'free',
      subscription_status: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userCredits.user_id);
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
  const baseCredits = userCredits.plan_tier === 'plus' ? 100 : (userCredits.plan_tier === 'max' || userCredits.plan_tier === 'pro') ? 200 : 10;

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
    const planCredits = (userCredits.plan_tier === 'max' || userCredits.plan_tier === 'pro') ? 200 : userCredits.plan_tier === 'plus' ? 100 : 10;

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
    // Map refund amount to credit count
    // New: 40 credits = $19.99; Legacy: 60 credits = $14.99, 120 credits = $29.99
    // Use the charge amount to determine which pack was purchased
    if (totalAmountCents === 1999) {
      creditsToRemove = 40;
    } else if (totalAmountCents === 1499) {
      creditsToRemove = 60;
    } else if (totalAmountCents === 2999) {
      creditsToRemove = 120;
    } else {
      // Fallback: proportional based on $0.50/credit
      creditsToRemove = Math.round(refundedAmountCents / 50);
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
