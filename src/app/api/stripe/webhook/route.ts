/**
 * Stripe Webhook Handler
 * Processes Stripe events for subscription management
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getPostHogServer } from '@/lib/posthog-server';
import {
  applyAddonPurchase,
  applyPlanChange,
  applyRefundRemoval,
  applyRenewalReset,
  findCreditsByStripeCustomer,
  findCreditsByUserId,
  updateUserCreditsRow,
} from '@/db/repos/credits';
import { upsertSubscriptionByUser } from '@/db/repos/subscriptions';
import { hasWebhookEvent, insertWebhookEvent, setProfileSubscription } from '@/db/repos/admin';
import type { SubscriptionTier } from '@/lib/supabase/types';

const SUPPORTED_TIERS: SubscriptionTier[] = ['free', 'plus', 'max'];

function isSupportedTier(value: unknown): value is SubscriptionTier {
  return typeof value === 'string' && SUPPORTED_TIERS.includes(value as SubscriptionTier);
}

/**
 * Keep profiles.subscription_tier in sync so AuthContext / PostHog
 * analytics always reflect the current plan.
 */
async function syncProfileTier(userId: string, tier: string) {
  try {
    await setProfileSubscription(userId, tier, 'active');
    console.log(`[Stripe Webhook] Synced profiles.subscription_tier → ${tier} for ${userId}`);
  } catch (error) {
    console.error(`[Stripe Webhook] Failed to sync profiles.subscription_tier for ${userId}:`, error);
  }
}

/**
 * Upsert into the `subscriptions` table so the frontend getSubscription()
 * always has a row to read. Matches on user_id (one subscription row per
 * user), so a canceled row is reused instead of duplicated.
 */
async function upsertSubscriptionRow(opts: {
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
  // Map internal tier names to the supported subscription table tier values.
  const tierMap: Record<string, string> = { free: 'free', plus: 'plus', max: 'max' };
  const tier = tierMap[opts.tier] || opts.tier;

  try {
    const { created } = await upsertSubscriptionByUser({ ...opts, tier });
    console.log(
      `[Stripe Webhook] ${created ? 'Inserted' : 'Updated'} subscriptions row for user ${opts.userId} → ${tier}/${opts.status}`,
    );
  } catch (error) {
    console.error('[Stripe Webhook] Failed to upsert subscriptions row:', error);
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

  // Idempotency: skip events we've already processed (Stripe retries are normal)
  if (await hasWebhookEvent(event.id)) {
    console.log('[Stripe Webhook] Duplicate event, skipping:', event.id);
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Record event BEFORE processing to prevent race conditions with concurrent retries.
  // The insert is the authoritative dedupe step: when a concurrent retry has
  // already written the row, D1 raises a UNIQUE constraint failure, and we
  // bail out instead of silently proceeding past the duplicate check.
  let recorded: 'inserted' | 'duplicate';
  try {
    recorded = await insertWebhookEvent(event.id, event.type);
  } catch (insertError) {
    console.error('[Stripe Webhook] Failed to record event:', insertError);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  if (recorded === 'duplicate') {
    console.log('[Stripe Webhook] Concurrent retry won the race, treating as duplicate:', event.id);
    return NextResponse.json({ received: true, duplicate: true });
  }

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

    // Version-guarded read-modify-write. Without the guard, a user spending
    // credits during this webhook would have their addon_credits silently
    // overwritten with a stale base. The ledger row rides in the same batch.
    const result = await applyAddonPurchase(userId, creditsToAdd, {
      stripeCustomerId: customerId,
      description: `Purchased ${packSize} add-on pack (${creditsToAdd} credits)`,
      metadata: { packSize, stripeSessionId: session.id },
    });

    if (!result.success) {
      console.error('Failed to add addon credits:', result.error);
      return;
    }

    console.log(`[Stripe Webhook] Added ${creditsToAdd} addon credits for user ${userId}`);
    return;
  }

  // Handle subscription checkout
  const subscriptionId = session.subscription;
  const planTier = session.metadata?.planTier || 'free';

  if (!isSupportedTier(planTier)) {
    console.error('[Stripe Webhook] Unsupported planTier in checkout metadata:', planTier, 'session:', session.id);
    return;
  }

  // Map plan tier to credits.
  let planCredits = 4;
  if (planTier === 'plus') planCredits = 50;
  else if (planTier === 'max') planCredits = 200;

  console.log(`[Stripe Webhook] checkout.session.completed: userId=${userId}, planTier=${planTier}, credits=${planCredits}`);

  // Update user_credits with the new plan AND Stripe IDs in one shot.
  // This is the authoritative update. handleSubscriptionUpdate may have
  // already run (race condition) but we always overwrite here with the
  // correct values derived from the checkout session metadata.
  try {
    const updated = await updateUserCreditsRow(userId, {
      plan_tier: planTier,
      monthly_credits: planCredits,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_status: 'active',
    });

    if (!updated) {
      console.error('[Stripe Webhook] Failed to update user credits on checkout: no user_credits row for', userId);
    } else {
      console.log(`[Stripe Webhook] Successfully upgraded user ${userId} to ${planTier} (${planCredits} credits)`);
    }
  } catch (error) {
    console.error('[Stripe Webhook] Failed to update user credits on checkout:', error);
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

  await upsertSubscriptionRow({
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
  const customerId = subscription.customer;

  // Try to find user by stripe_customer_id first (handles renewals / updates
  // where the customer ID is already stored). For new subscriptions the
  // customer.subscription.created event fires BEFORE checkout.session.completed,
  // so stripe_customer_id may not be saved yet, so fall back to subscription metadata.
  let userCredits = await findCreditsByStripeCustomer(customerId);

  if (!userCredits) {
    // Fallback: look up by userId stored in subscription metadata
    const metaUserId = subscription.metadata?.userId;
    if (metaUserId) {
      console.log(`[Stripe Webhook] customer_id lookup missed, trying metadata userId: ${metaUserId}`);
      const creditsById = await findCreditsByUserId(metaUserId);

      if (creditsById) {
        userCredits = creditsById;
        // Persist the customer ID now so future lookups work
        try {
          await updateUserCreditsRow(metaUserId, { stripe_customer_id: customerId });
        } catch (error) {
          console.error('[Stripe Webhook] Failed to persist stripe_customer_id:', error);
        }
      }
    }
  }

  if (!userCredits) {
    console.error('[Stripe Webhook] User not found for customer:', customerId, '(subscription event will be handled by checkout.session.completed)');
    return;
  }

  // Determine plan tier from price ID (handle both old and new env var names)
  const priceId = subscription.items.data[0]?.price.id;
  let planTier: SubscriptionTier = 'free';
  let newPlanCredits = 4;

  if (priceId === process.env.STRIPE_PRICE_ID_PLUS) {
    planTier = 'plus';
    newPlanCredits = 50;
  } else if (priceId === process.env.STRIPE_PRICE_ID_MAX) {
    planTier = 'max';
    newPlanCredits = 200;
  }

  // Handle mid-cycle plan changes:
  // - Upgrade (e.g. Plus→Max): give full new plan credits (rewards upgrading)
  // - Downgrade (e.g. Max→Plus): cap at new plan limit so users can't gain credits
  const change = await applyPlanChange(userCredits.user_id, {
    planTier,
    newPlanCredits,
    subscriptionStatus: subscription.status,
    stripeSubscriptionId: subscription.id,
  });

  if (!change.success) {
    // Do not write the new tier to subscriptions/profiles while user_credits
    // still holds the old plan; a partial sync would bill one tier and grant another.
    console.error('Failed to update subscription:', change.error);
    return;
  } else {
    console.log(`[Stripe Webhook] Plan change: ${change.previousTier}→${planTier}, credits: ${change.previousMonthly}→${change.monthlyCredits}${change.isDowngrade ? ' (downgrade, capped)' : ' (upgrade, full)'}`);
  }

  // Sync subscriptions table
  const periodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000).toISOString()
    : undefined;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : undefined;

  await upsertSubscriptionRow({
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
  const customerId = subscription.customer;

  // Get user by customer ID
  const userCredits = await findCreditsByStripeCustomer(customerId);

  if (!userCredits) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Downgrade to free plan
  try {
    await updateUserCreditsRow(userCredits.user_id, {
      plan_tier: 'free',
      monthly_credits: 4,
      subscription_status: 'canceled',
      stripe_subscription_id: null,
    });
  } catch (error) {
    console.error('Failed to cancel subscription:', error);
  }

  // Sync subscriptions table
  await upsertSubscriptionRow({
    userId: userCredits.user_id,
    tier: 'free',
    status: 'canceled',
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
  });

  // Downgrade profiles table too
  try {
    await setProfileSubscription(userCredits.user_id, 'free', 'canceled');
  } catch (error) {
    console.error(`[Stripe Webhook] Failed to downgrade profiles row for ${userCredits.user_id}:`, error);
  }
}

async function handlePaymentSucceeded(invoice: any) {
  const customerId = invoice.customer;

  // Get user by customer ID. plan_tier is read once to decide baseCredits;
  // monthly_credits and rollover_credits are re-read inside the version-
  // guarded loop so a concurrent deductCredits between renewal trigger and
  // update doesn't get overwritten.
  const userRow = await findCreditsByStripeCustomer(customerId);

  if (!userRow) {
    console.error('User not found for customer:', customerId);
    return;
  }

  const baseCredits = userRow.plan_tier === 'plus' ? 50 : userRow.plan_tier === 'max' ? 200 : 4;
  const maxRollover = userRow.plan_tier === 'plus' ? 50 : userRow.plan_tier === 'max' ? 100 : 0;

  const result = await applyRenewalReset(userRow.user_id, { baseCredits, maxRollover });

  if (!result.success) {
    console.error('Failed to reset credits:', result.error);
    return;
  }

  console.log(`[Webhook] Renewal for ${userRow.user_id}: ${baseCredits} monthly, ${result.newRollover} rollover (was ${result.rolloverBefore} + ${result.monthlyBefore})`);
}

async function handleChargeRefunded(charge: any) {
  const customerId = charge.customer;

  if (!customerId) {
    console.error('[Stripe Webhook] No customer ID on refunded charge');
    return;
  }

  // Get user by customer ID. plan_tier is read only as a last-resort
  // fallback for unknown charge amounts; the refund itself is sized from
  // the charge's own amount so plan changes after the charge don't skew
  // the refund.
  const userCredits = await findCreditsByStripeCustomer(customerId);

  if (!userCredits) {
    console.error('[Stripe Webhook] User not found for refunded charge, customer:', customerId);
    return;
  }

  // charge.amount_refunded and charge.amount are both in cents.
  const refundedAmountCents = charge.amount_refunded;
  const totalAmountCents = charge.amount;
  const isSubscription = !!charge.invoice;

  let creditsToRemove = 0;
  let planCreditsSource: 'max_charge_amount' | 'plus_charge_amount' | 'plan_tier_fallback' | 'addon_price_map' | 'addon_per_credit_fallback';

  if (isSubscription) {
    // Source plan credits from the charge amount the user actually paid,
    // NOT from user_credits.plan_tier. plan_tier reflects the CURRENT
    // plan, which may have changed since the charge. Refunding 50
    // credits for a $79.99 Max charge (because the user has since
    // downgraded to Plus) under-removes; the inverse over-removes.
    let planCredits: number;
    if (totalAmountCents === 7999) {
      planCredits = 200;
      planCreditsSource = 'max_charge_amount';
    } else if (totalAmountCents === 1999) {
      planCredits = 50;
      planCreditsSource = 'plus_charge_amount';
    } else {
      console.warn(
        `[Stripe Webhook] Unknown subscription charge amount ${totalAmountCents} cents on charge ${charge.id}; ` +
        `falling back to current plan_tier ${userCredits.plan_tier}. Update the amount->credits map.`,
      );
      planCredits = userCredits.plan_tier === 'max' ? 200 : userCredits.plan_tier === 'plus' ? 50 : 4;
      planCreditsSource = 'plan_tier_fallback';
    }

    creditsToRemove = refundedAmountCents >= totalAmountCents
      ? planCredits
      : Math.round(planCredits * (refundedAmountCents / totalAmountCents));
  } else {
    // Add-on refund. Pack credits inferred from the original charge.
    // Current: 50 credits = $19.99; Legacy: 60 credits = $14.99, 120 credits = $29.99.
    if (totalAmountCents === 1999) {
      creditsToRemove = 50;
      planCreditsSource = 'addon_price_map';
    } else if (totalAmountCents === 1499) {
      creditsToRemove = 60;
      planCreditsSource = 'addon_price_map';
    } else if (totalAmountCents === 2999) {
      creditsToRemove = 120;
      planCreditsSource = 'addon_price_map';
    } else {
      creditsToRemove = Math.round(refundedAmountCents / 40);
      planCreditsSource = 'addon_per_credit_fallback';
    }

    if (refundedAmountCents < totalAmountCents) {
      const fullPackCredits = creditsToRemove;
      creditsToRemove = Math.round(fullPackCredits * (refundedAmountCents / totalAmountCents));
    }
  }

  // Version-guarded balance update with one retry. Without the guard, a
  // user spending credits at the moment a refund webhook lands would lose
  // or gain credits through last-writer-wins. The retry handles the rare
  // case where a concurrent deductCredits landed between read and update.
  const result = await applyRefundRemoval(userCredits.user_id, {
    creditsToRemove,
    isSubscription,
    description: isSubscription
      ? `Refund: removed ${creditsToRemove} subscription credits`
      : `Refund: removed ${creditsToRemove} add-on credits`,
    metadata: {
      chargeId: charge.id,
      refundedAmountCents,
      totalAmountCents,
      isFullRefund: refundedAmountCents >= totalAmountCents,
      planCreditsSource,
    },
  });

  if (!result.success) {
    console.error('[Stripe Webhook] Failed to remove credits on refund:', result.error);
    return;
  }

  console.log(`[Stripe Webhook] Refund: removed ${creditsToRemove} credits for user ${userCredits.user_id} (source: ${planCreditsSource})`);
}

async function handlePaymentFailed(invoice: any) {
  const customerId = invoice.customer;

  // Get user by customer ID
  const userCredits = await findCreditsByStripeCustomer(customerId);

  if (!userCredits) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Mark subscription as past due
  try {
    await updateUserCreditsRow(userCredits.user_id, { subscription_status: 'past_due' });
  } catch (error) {
    console.error('Failed to update payment status:', error);
  }
}
