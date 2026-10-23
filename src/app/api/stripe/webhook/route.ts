/**
 * Stripe Webhook Handler
 * Processes Stripe events for subscription management
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, STRIPE_PRICES } from '@/lib/stripe';
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
import type { SubscriptionTier } from '@/db/types';

class PermanentWebhookError extends Error {}

const SUPPORTED_TIERS: SubscriptionTier[] = ['free', 'plus', 'max'];

function isSupportedTier(value: unknown): value is SubscriptionTier {
  return typeof value === 'string' && SUPPORTED_TIERS.includes(value as SubscriptionTier);
}

function stripeObjectId(value: string | { id: string } | null | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.id;
}

async function reportUnknownStripePrice(message: string, properties: Record<string, unknown>) {
  console.error(`[Stripe Webhook] ${message}`, properties);
  try {
    const posthog = getPostHogServer();
    posthog.captureException(new Error(message), 'server_error', {
      endpoint: '/api/stripe/webhook',
      ...properties,
    });
    await posthog.flush();
  } catch (error) {
    console.error('[Stripe Webhook] Failed to report unknown Stripe price:', error);
  }
}

/**
 * Keep profiles.subscription_tier in sync so AuthContext / PostHog
 * analytics always reflect the current plan.
 */
async function syncProfileTier(userId: string, tier: string, status: string) {
  const profileStatus = status === 'active' || status === 'trialing' || status === 'canceled'
    ? status
    : 'past_due';
  await setProfileSubscription(userId, tier, profileStatus);
  console.log(`[Stripe Webhook] Synced profiles.subscription_tier → ${tier} for ${userId}`);
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

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: unknown) {
    console.error('[Stripe Webhook] Signature verification FAILED:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log('[Stripe Webhook] Event verified:', event.type, 'id:', event.id);

  // Rows represent successfully processed events only. Stripe retries are normal.
  if (await hasWebhookEvent(event.id)) {
    console.log('[Stripe Webhook] Duplicate event, skipping:', event.id);
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

      case 'refund.created': {
        const refund = event.data.object;
        await handleRefundCreated(refund);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    const recorded = await insertWebhookEvent(event.id, event.type);
    return NextResponse.json({ received: true, duplicate: recorded === 'duplicate' });
  } catch (error) {
    const isPermanent = error instanceof PermanentWebhookError;
    const posthog = getPostHogServer();
    posthog.captureException(error as Error, 'server_error', {
      endpoint: '/api/stripe/webhook',
      method: 'POST',
    });
    await posthog.flush();
    console.error('Webhook handler error:', error);
    if (isPermanent) {
      return NextResponse.json({ received: true, ignored: true });
    }
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const customerId = stripeObjectId(session.customer);
  const type = session.metadata?.type;

  if (!userId) {
    throw new PermanentWebhookError('No userId in checkout session metadata');
  }

  // Handle add-on credit purchases (one-time payment)
  if (type === 'addon_credits') {
    const creditsToAdd = parseInt(session.metadata?.creditsToAdd || '0', 10);
    const packSize = session.metadata?.packSize || 'unknown';
    if (creditsToAdd <= 0) {
      throw new PermanentWebhookError('Invalid creditsToAdd in add-on checkout metadata');
    }

    // Version-guarded read-modify-write. Without the guard, a user spending
    // credits during this webhook would have their addon_credits silently
    // overwritten with a stale base. The ledger row rides in the same batch.
    const result = await applyAddonPurchase(userId, creditsToAdd, {
      idempotencyKey: `stripe-addon:${session.id}`,
      stripeCustomerId: customerId ?? null,
      description: `Purchased ${packSize} add-on pack (${creditsToAdd} credits)`,
      metadata: { packSize, stripeSessionId: session.id },
    });

    if (!result.success) {
      if (result.error?.message.includes('not found')) {
        throw new PermanentWebhookError(result.error.message);
      }
      throw result.error ?? new Error('Failed to add add-on credits');
    }

    console.log(`[Stripe Webhook] Added ${creditsToAdd} addon credits for user ${userId}`);
    return;
  }

  // Handle subscription checkout
  const subscriptionId = session.subscription;
  const planTier = session.metadata?.planTier || 'free';

  if (!isSupportedTier(planTier)) {
    throw new PermanentWebhookError(`Unsupported plan tier in checkout session ${session.id}`);
  }

  // Map plan tier to credits.
  let planCredits = 4;
  if (planTier === 'plus') planCredits = 50;
  else if (planTier === 'max') planCredits = 200;

  console.log(`[Stripe Webhook] checkout.session.completed: userId=${userId}, planTier=${planTier}, credits=${planCredits}`);

  // Also upsert into the subscriptions table so getSubscription() works
  // Retrieve the Stripe subscription object for period dates
  let periodStart: string | undefined;
  let periodEnd: string | undefined;
  let stripePriceId: string | undefined;
  let subscriptionStatus = 'incomplete';
  if (typeof subscriptionId !== 'string') {
    throw new PermanentWebhookError(`Checkout session ${session.id} has no subscription ID`);
  }
  try {
    const stripeSub = await getStripe().subscriptions.retrieve(subscriptionId);
    const subscriptionItem = stripeSub.items.data[0];
    subscriptionStatus = stripeSub.status;
    periodStart = subscriptionItem?.current_period_start
      ? new Date(subscriptionItem.current_period_start * 1000).toISOString()
      : undefined;
    periodEnd = subscriptionItem?.current_period_end
      ? new Date(subscriptionItem.current_period_end * 1000).toISOString()
      : undefined;
    stripePriceId = subscriptionItem?.price.id;
  } catch (e) {
    throw new Error(`Could not retrieve subscription ${subscriptionId}`, { cause: e });
  }

  const grantsCredits = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
  const change = await applyPlanChange(userId, {
    planTier,
    newPlanCredits: planCredits,
    subscriptionStatus,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: customerId,
    grantCredits: grantsCredits,
    currentPeriodEnd: periodEnd,
  });
  if (!change.success) {
    if (change.error?.message.includes('not found')) {
      throw new PermanentWebhookError(change.error.message);
    }
    throw change.error ?? new Error(`Failed to apply checkout plan for ${userId}`);
  }

  await upsertSubscriptionRow({
    userId,
    tier: planTier,
    status: subscriptionStatus,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripePriceId,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
  });

  // Keep profiles table in sync
  await syncProfileTier(userId, grantsCredits ? planTier : change.previousTier ?? 'free', subscriptionStatus);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = stripeObjectId(subscription.customer);
  if (!customerId) throw new PermanentWebhookError(`Subscription ${subscription.id} has no customer ID`);

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
  let planTier: SubscriptionTier;
  let newPlanCredits: number;

  if (priceId === process.env.STRIPE_PRICE_ID_PLUS) {
    planTier = 'plus';
    newPlanCredits = 50;
  } else if (priceId === process.env.STRIPE_PRICE_ID_MAX) {
    planTier = 'max';
    newPlanCredits = 200;
  } else {
    const unitAmount = subscription.items.data[0]?.price.unit_amount;
    await reportUnknownStripePrice('Unknown subscription price ID', {
      subscriptionId: subscription.id,
      priceId: priceId ?? null,
      unitAmount: unitAmount ?? null,
      status: subscription.status,
    });
    // Grants fail closed: an unknown price id never maps to a tier, even when
    // the amount matches a known plan. The amount fallback exists only on the
    // refund-removal side, where failing to act is the unsafe direction.
    if (subscription.status === 'active' || subscription.status === 'trialing') {
      throw new Error(`Active subscription ${subscription.id} has an unsupported price`);
    }
    throw new PermanentWebhookError(`Unsupported subscription price on ${subscription.id}`);
  }

  const subscriptionItem = subscription.items.data[0];
  const periodStart = subscriptionItem?.current_period_start
    ? new Date(subscriptionItem.current_period_start * 1000).toISOString()
    : undefined;
  const periodEnd = subscriptionItem?.current_period_end
    ? new Date(subscriptionItem.current_period_end * 1000).toISOString()
    : undefined;

  // Handle mid-cycle plan changes:
  // - Upgrade (e.g. Plus→Max): give full new plan credits (rewards upgrading)
  // - Downgrade (e.g. Max→Plus): cap at new plan limit so users can't gain credits
  const grantsCredits = subscription.status === 'active' || subscription.status === 'trialing';
  const change = await applyPlanChange(userCredits.user_id, {
    planTier,
    newPlanCredits,
    subscriptionStatus: subscription.status,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: customerId,
    grantCredits: grantsCredits,
    currentPeriodEnd: periodEnd,
  });

  if (!change.success) {
    // Do not write the new tier to subscriptions/profiles while user_credits
    // still holds the old plan; a partial sync would bill one tier and grant another.
    throw change.error ?? new Error('Failed to update subscription');
  } else {
    const creditChange = !grantsCredits
      ? 'credits unchanged until payment activates'
      : change.isSameTier
        ? 'same tier, credits unchanged'
        : change.isDowngrade
          ? 'downgrade, capped'
          : 'upgrade, full';
    console.log(`[Stripe Webhook] Plan change: ${change.previousTier}→${planTier}, credits: ${change.previousMonthly}→${change.monthlyCredits} (${creditChange})`);
  }

  // Sync subscriptions table
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
  await syncProfileTier(
    userCredits.user_id,
    grantsCredits ? planTier : change.previousTier ?? userCredits.plan_tier,
    subscription.status,
  );
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = stripeObjectId(subscription.customer);
  if (!customerId) throw new PermanentWebhookError(`Subscription ${subscription.id} has no customer ID`);

  // Get user by customer ID
  const userCredits = await findCreditsByStripeCustomer(customerId);

  if (!userCredits) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Downgrade once. A later retry must not refill credits already spent while
  // subscriptions or profiles synchronization was being retried.
  const cancellationAlreadyApplied = userCredits.plan_tier === 'free'
    && userCredits.subscription_status === 'canceled'
    && userCredits.stripe_subscription_id === null;
  if (!cancellationAlreadyApplied) {
    try {
      const updated = await updateUserCreditsRow(userCredits.user_id, {
        plan_tier: 'free',
        monthly_credits: 4,
        subscription_status: 'canceled',
        stripe_subscription_id: null,
      });
      if (!updated) throw new Error('Subscription cancellation matched no credit row');
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      throw error;
    }
  }

  // Sync subscriptions table
  await upsertSubscriptionRow({
    userId: userCredits.user_id,
    tier: 'free',
    status: 'canceled',
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
  });

  // Downgrade profiles table too. A failure must retry the event so the
  // pricing page doesn't keep treating a canceled user as paid.
  await syncProfileTier(userCredits.user_id, 'free', 'canceled');
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  if (invoice.billing_reason !== 'subscription_cycle') {
    console.log(`[Stripe Webhook] Skipping non-renewal invoice ${invoice.id}: ${invoice.billing_reason ?? 'unknown reason'}`);
    return;
  }

  const customerId = stripeObjectId(invoice.customer);
  if (!customerId) throw new PermanentWebhookError(`Invoice ${invoice.id} has no customer ID`);

  // Get user by customer ID. plan_tier is read once to decide baseCredits;
  // monthly_credits and rollover_credits are re-read inside the version-
  // guarded loop so a concurrent reservation between renewal trigger and
  // update doesn't get overwritten.
  const userRow = await findCreditsByStripeCustomer(customerId);

  if (!userRow) {
    console.error('User not found for customer:', customerId);
    return;
  }

  const baseCredits = userRow.plan_tier === 'plus' ? 50 : userRow.plan_tier === 'max' ? 200 : 4;
  const maxRollover = userRow.plan_tier === 'plus' ? 50 : userRow.plan_tier === 'max' ? 100 : 0;

  const result = await applyRenewalReset(userRow.user_id, {
    baseCredits,
    maxRollover,
    idempotencyKey: `stripe-renewal:${invoice.id}`,
  });

  if (!result.success) {
    throw result.error ?? new Error('Failed to reset credits');
  }

  console.log(`[Webhook] Renewal for ${userRow.user_id}: ${baseCredits} monthly, ${result.newRollover} rollover (was ${result.rolloverBefore} + ${result.monthlyBefore})`);
}

async function resolveRefundSource(charge: Stripe.Charge): Promise<{
  isSubscription: boolean;
  sourceCredits: number;
  source: string;
}> {
  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id;
  if (!paymentIntentId) throw new PermanentWebhookError(`Refunded charge ${charge.id} has no payment intent`);

  const checkoutSessions = await getStripe().checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
  const checkoutSession = checkoutSessions.data[0];
  if (checkoutSession?.metadata?.type === 'addon_credits') {
    const sourceCredits = Number.parseInt(checkoutSession.metadata.creditsToAdd ?? '0', 10);
    if (sourceCredits <= 0) {
      throw new PermanentWebhookError(`Add-on checkout ${checkoutSession.id} has invalid credit metadata`);
    }
    return { isSubscription: false, sourceCredits, source: `checkout:${checkoutSession.id}` };
  }

  const invoicePayments = await getStripe().invoicePayments.list({
    payment: { type: 'payment_intent', payment_intent: paymentIntentId },
    status: 'paid',
    limit: 1,
  });
  const invoicePayment = invoicePayments.data[0];
  if (!invoicePayment) throw new PermanentWebhookError(`No invoice payment found for refunded charge ${charge.id}`);
  const invoiceId = typeof invoicePayment.invoice === 'string'
    ? invoicePayment.invoice
    : invoicePayment.invoice.id;
  const invoice = await getStripe().invoices.retrieve(invoiceId);
  const pricedLines = invoice.lines.data
    .filter((line) => line.amount > 0)
    .map((line) => {
      const price = line.pricing?.price_details?.price;
      return { line, priceId: typeof price === 'string' ? price : price?.id };
    })
    .sort((a, b) => b.line.amount - a.line.amount);
  const knownPlanLine = pricedLines.find(
    (entry) => entry.priceId === STRIPE_PRICES.PLUS || entry.priceId === STRIPE_PRICES.MAX,
  );

  if (knownPlanLine?.priceId === STRIPE_PRICES.PLUS) {
    return { isSubscription: true, sourceCredits: 50, source: `invoice:${invoice.id}:plus` };
  }
  if (knownPlanLine?.priceId === STRIPE_PRICES.MAX) {
    return { isSubscription: true, sourceCredits: 200, source: `invoice:${invoice.id}:max` };
  }
  await reportUnknownStripePrice('Unknown refunded subscription price ID', {
    chargeId: charge.id,
    invoiceId: invoice.id,
    priceIds: pricedLines.map((entry) => entry.priceId ?? null),
    chargeAmount: charge.amount,
  });
  if (charge.amount === 1999) {
    return { isSubscription: true, sourceCredits: 50, source: `invoice:${invoice.id}:plus-amount-fallback` };
  }
  if (charge.amount === 7999) {
    return { isSubscription: true, sourceCredits: 200, source: `invoice:${invoice.id}:max-amount-fallback` };
  }
  throw new PermanentWebhookError(`No supported plan price found for refunded invoice ${invoice.id}`);
}

async function handleRefundCreated(refund: Stripe.Refund) {
  if (!refund.charge) throw new PermanentWebhookError(`Refund ${refund.id} has no charge`);
  const charge = typeof refund.charge === 'string'
    ? await getStripe().charges.retrieve(refund.charge)
    : refund.charge;
  await applyChargeRefund(charge, refund);
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const refunds = await getStripe().refunds.list({ charge: charge.id, limit: 1 });
  const latestRefund = refunds.data[0];
  if (!latestRefund) {
    throw new Error(`No refund found for refunded charge ${charge.id}`);
  }
  const currentCharge = await getStripe().charges.retrieve(charge.id);
  await applyChargeRefund(currentCharge, latestRefund);
}

async function applyChargeRefund(charge: Stripe.Charge, refund: Stripe.Refund) {
  const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;
  if (!customerId) throw new PermanentWebhookError(`Refunded charge ${charge.id} has no customer ID`);

  const userCredits = await findCreditsByStripeCustomer(customerId);
  if (!userCredits) {
    console.error(`[Stripe Webhook] No user credits for refunded charge ${charge.id}, customer ${customerId}`);
    throw new Error(`No user credits found for refunded charge ${charge.id}`);
  }

  const source = await resolveRefundSource(charge);
  const result = await applyRefundRemoval(userCredits.user_id, {
    chargeId: charge.id,
    refundId: refund.id,
    refundAmountCents: refund.amount,
    cumulativeRefundedAmountCents: charge.amount_refunded,
    totalAmountCents: charge.amount,
    sourceCredits: source.sourceCredits,
    isSubscription: source.isSubscription,
    description: source.isSubscription ? 'Stripe subscription refund' : 'Stripe add-on refund',
    metadata: {
      source: source.source,
      isFullRefund: charge.amount_refunded >= charge.amount,
    },
  });

  if (!result.success) throw result.error ?? new Error(`Failed to remove credits for refund on charge ${charge.id}`);
  console.log(`[Stripe Webhook] Refund reconciled for ${userCredits.user_id} from ${source.source}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = stripeObjectId(invoice.customer);
  if (!customerId) throw new PermanentWebhookError(`Invoice ${invoice.id} has no customer ID`);

  // Get user by customer ID
  const userCredits = await findCreditsByStripeCustomer(customerId);

  if (!userCredits) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Mark subscription as past due
  try {
    const updated = await updateUserCreditsRow(userCredits.user_id, { subscription_status: 'past_due' });
    if (!updated) throw new Error('Payment failure matched no credit row');
  } catch (error) {
    console.error('Failed to update payment status:', error);
    throw error;
  }
}
