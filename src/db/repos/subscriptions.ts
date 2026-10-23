import { and, desc, eq } from 'drizzle-orm';
import { getDb, nowIso } from '../client';
import { connectedAccounts, subscriptions, userCredits } from '../schema';
import type { SubscriptionTier } from '@/db/types';
import type { BillingSubscriptionLike } from '@/lib/subscription-billing';

export interface ConnectedAccount {
  id: string;
  user_id: string;
  provider: 'google' | 'linkedin' | 'github';
  provider_user_id: string;
  provider_email?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  tier: SubscriptionTier;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_price_id?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end: boolean;
  applications_used: number;
  applications_limit: number;
  created_at: string;
  updated_at: string;
}

export async function getConnectedAccounts(userId: string): Promise<ConnectedAccount[]> {
  const db = await getDb();
  const rows = await db.select().from(connectedAccounts).where(eq(connectedAccounts.user_id, userId));
  return rows as ConnectedAccount[];
}

export async function disconnectAccount(
  userId: string,
  provider: 'google' | 'linkedin' | 'github',
): Promise<{ error: Error | null }> {
  const db = await getDb();
  await db
    .delete(connectedAccounts)
    .where(and(eq(connectedAccounts.user_id, userId), eq(connectedAccounts.provider, provider)));
  return { error: null };
}

export async function getSubscription(userId: string): Promise<Subscription | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.user_id, userId), eq(subscriptions.status, 'active')))
    .limit(1);
  return (rows[0] as Subscription | undefined) ?? null;
}

/**
 * The user's Stripe subscription whatever its status, for the billing wall in
 * front of account deletion. Deliberately not `getSubscription`, which filters
 * to status 'active' and would hide a past_due subscription Stripe is still
 * retrying. Falls back to user_credits when there is no subscriptions row,
 * because the webhook writes both and they can drift.
 */
export async function getBillingSubscription(userId: string): Promise<BillingSubscriptionLike | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.user_id, userId))
    .orderBy(desc(subscriptions.updated_at))
    .limit(1);
  const row = rows[0] as Subscription | undefined;
  if (row) {
    return {
      status: row.status,
      stripe_subscription_id: row.stripe_subscription_id ?? null,
      cancel_at_period_end: row.cancel_at_period_end,
    };
  }

  const credits = await db
    .select({
      status: userCredits.subscription_status,
      stripeSubscriptionId: userCredits.stripe_subscription_id,
    })
    .from(userCredits)
    .where(eq(userCredits.user_id, userId))
    .limit(1);
  const creditsRow = credits[0];
  if (!creditsRow?.stripeSubscriptionId) return null;
  // user_credits has no cancel_at_period_end column, so a scheduled cancel is
  // invisible here. It only matters when the subscriptions row is missing.
  return {
    status: creditsRow.status,
    stripe_subscription_id: creditsRow.stripeSubscriptionId,
    cancel_at_period_end: false,
  };
}

export async function createFreeSubscription(
  userId: string,
): Promise<{ subscription: Subscription | null; error: Error | null }> {
  const db = await getDb();
  const now = nowIso();
  const id = crypto.randomUUID();
  await db.insert(subscriptions).values({
    id,
    user_id: userId,
    tier: 'free',
    status: 'active',
    applications_used: 0,
    applications_limit: 5,
    created_at: now,
    updated_at: now,
  });
  const subscription = await getSubscription(userId);
  return { subscription, error: subscription ? null : new Error('Failed to create subscription') };
}

export async function upsertSubscription(
  userId: string,
  values: Partial<Subscription> & { tier: SubscriptionTier },
): Promise<Subscription | null> {
  const db = await getDb();
  const existing = await getSubscription(userId);
  const now = nowIso();
  if (existing) {
    await db
      .update(subscriptions)
      .set({ ...values, updated_at: now })
      .where(and(eq(subscriptions.id, existing.id), eq(subscriptions.user_id, userId)));
    return getSubscription(userId);
  }
  const id = crypto.randomUUID();
  await db.insert(subscriptions).values({
    id,
    user_id: userId,
    status: values.status ?? 'active',
    ...values,
    created_at: now,
    updated_at: now,
  });
  return getSubscription(userId);
}

/**
 * Stripe webhook upsert. Matches the user's existing subscription row
 * regardless of status, which is what the old Supabase path did (it
 * selected on user_id only). getSubscription() filters to active, so a
 * canceled row would otherwise be duplicated instead of reused.
 * Undefined fields are left untouched, same as the PostgREST update.
 */
export async function upsertSubscriptionByUser(opts: {
  userId: string;
  tier: string;
  status: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}): Promise<{ created: boolean }> {
  const db = await getDb();
  const now = nowIso();
  const values = {
    tier: opts.tier,
    status: opts.status,
    stripe_customer_id: opts.stripeCustomerId,
    stripe_subscription_id: opts.stripeSubscriptionId,
    stripe_price_id: opts.stripePriceId,
    current_period_start: opts.currentPeriodStart,
    current_period_end: opts.currentPeriodEnd,
    cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
  };

  const existing = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.user_id, opts.userId))
    .orderBy(subscriptions.created_at)
    .limit(1);

  if (existing[0]) {
    await db
      .update(subscriptions)
      .set({ ...values, updated_at: now })
      .where(and(eq(subscriptions.id, existing[0].id), eq(subscriptions.user_id, opts.userId)));
    return { created: false };
  }

  await db.insert(subscriptions).values({
    id: crypto.randomUUID(),
    user_id: opts.userId,
    ...values,
    created_at: now,
    updated_at: now,
  });
  return { created: true };
}

export async function canCreateApplication(userId: string): Promise<boolean> {
  const subscription = await getSubscription(userId);
  if (!subscription) return true;
  if (subscription.tier === 'plus' || subscription.tier === 'max') return true;
  return subscription.applications_used < subscription.applications_limit;
}
