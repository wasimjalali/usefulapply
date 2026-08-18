import { and, desc, eq, sql } from 'drizzle-orm';
import { isUniqueViolation, runBatch, getDb, nowIso } from '../client';
import { addonCreditPacks, creditReservations, creditTransactions, subscriptionPlans, userCredits } from '../schema';
import type { SubscriptionTier } from '@/lib/supabase/types';
import { CREDIT_COSTS, getTotalCredits, type CreditAction } from '@/lib/credit-costs';

export { CREDIT_COSTS, getTotalCredits, type CreditAction };

// credit_reservations.session_id / generation_id carry FKs to
// application_sessions / job_feed_application_generations. Client sessions use
// `session-${Date.now()}` until synced, so any non-UUID value must become null
// before insert or D1 rejects the row after credits were already deducted.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function coerceUuidOrNull(value: string | null | undefined): string | null {
  return value && UUID_RE.test(value) ? value : null;
}

export interface UserCredits {
  id: string;
  user_id: string;
  monthly_credits: number;
  rollover_credits: number;
  addon_credits: number;
  plan_tier: SubscriptionTier;
  last_reset_date: string | null;
  next_reset_date: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  transaction_type: string;
  session_id?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
  balance_before: number;
  balance_after: number;
  created_at: string;
}

export interface SubscriptionPlan {
  id: string;
  tier: SubscriptionTier;
  name: string;
  description?: string | null;
  price_monthly: number;
  credits_monthly: number;
  rollover_months: number;
  max_rollover_credits: number;
  addon_enabled: boolean;
  stripe_product_id?: string | null;
  stripe_price_id_monthly?: string | null;
  active: boolean;
  display_order: number;
}

export interface AddonCreditPack {
  id: string;
  name: string;
  credits: number;
  price: number;
  discount_percent: number;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  active: boolean;
  display_order: number;
}

export interface DeductionAllocation {
  monthly: number;
  rollover: number;
  addon: number;
}

const NO_DEDUCTION: DeductionAllocation = { monthly: 0, rollover: 0, addon: 0 };
const MAX_OCC_RETRIES = 3;

export async function getSubscriptionPlans(): Promise<{ plans: SubscriptionPlan[]; error: Error | null }> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.active, true))
    .orderBy(subscriptionPlans.display_order);
  return { plans: rows as SubscriptionPlan[], error: null };
}

export async function getSubscriptionPlan(tier: string): Promise<{ plan: SubscriptionPlan | null; error: Error | null }> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(subscriptionPlans)
    .where(and(eq(subscriptionPlans.tier, tier), eq(subscriptionPlans.active, true)))
    .limit(1);
  return { plan: (rows[0] as SubscriptionPlan | undefined) ?? null, error: rows[0] ? null : new Error('Plan not found') };
}

export async function getAddonCreditPacks(): Promise<{ packs: AddonCreditPack[]; error: Error | null }> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(addonCreditPacks)
    .where(eq(addonCreditPacks.active, true))
    .orderBy(addonCreditPacks.display_order);
  return { packs: rows as AddonCreditPack[], error: null };
}

export async function getUserCredits(userId: string): Promise<{ credits: UserCredits | null; error: Error | null }> {
  const db = await getDb();
  const rows = await db.select().from(userCredits).where(eq(userCredits.user_id, userId)).limit(1);
  if (rows[0]) {
    return { credits: rows[0] as UserCredits, error: null };
  }
  return initializeUserCredits(userId);
}

/**
 * Port of Postgres `initialize_user_credits`. Called from signup paths now
 * and from the Better Auth `user.create.after` hook in Task 5.2.
 */
export async function initializeUserCredits(userId: string): Promise<{ credits: UserCredits | null; error: Error | null }> {
  const db = await getDb();
  const nextReset = new Date();
  nextReset.setMonth(nextReset.getMonth() + 1);
  const now = nowIso();
  let inserted = false;
  try {
    // onConflictDoNothing + returning: only the caller that actually created the
    // row logs the welcome ledger entry. Concurrent first reads (balance +
    // credit check on first login) used to both log it.
    const created = await db
      .insert(userCredits)
      .values({
        user_id: userId,
        monthly_credits: 4,
        rollover_credits: 0,
        addon_credits: 0,
        plan_tier: 'free',
        next_reset_date: nextReset.toISOString(),
        version: 0,
        created_at: now,
        updated_at: now,
      })
      .onConflictDoNothing({ target: userCredits.user_id })
      .returning({ user_id: userCredits.user_id });
    inserted = created.length > 0;
  } catch (insertError) {
    if (!isUniqueViolation(insertError)) throw insertError;
  }

  const rows = await db.select().from(userCredits).where(eq(userCredits.user_id, userId)).limit(1);
  if (!rows[0]) {
    return { credits: null, error: new Error('Credits row disappeared after upsert') };
  }
  const credits = rows[0] as UserCredits;
  if (inserted) {
    await insertTransaction(userId, 4, 'monthly_reset', {
      description: 'Initial free plan credits',
      balanceBefore: 0,
      balanceAfter: 4,
    });
  }
  return { credits, error: null };
}

export async function hasEnoughCredits(userId: string, action: CreditAction): Promise<boolean> {
  const { credits, error } = await getUserCredits(userId);
  if (error || !credits) return false;
  return getTotalCredits(credits) >= CREDIT_COSTS[action];
}

export async function checkCreditBalance(
  userId: string,
  action: CreditAction,
): Promise<{
  hasEnough: boolean;
  required: number;
  available: number;
  planTier: string;
  error: Error | null;
}> {
  const { credits, error } = await getUserCredits(userId);
  const required = CREDIT_COSTS[action];
  if (error || !credits) {
    return { hasEnough: false, required, available: 0, planTier: 'free', error: error || new Error('Credits not found') };
  }
  const available = getTotalCredits(credits);
  return { hasEnough: available >= required, required, available, planTier: credits.plan_tier, error: null };
}

function allocateDeduction(credits: UserCredits, amount: number): { next: DeductionAllocation; remaining: DeductionAllocation } {
  let remaining = amount;
  let monthly = credits.monthly_credits;
  let rollover = credits.rollover_credits;
  let addon = credits.addon_credits;
  if (remaining > 0 && monthly > 0) {
    const d = Math.min(remaining, monthly);
    monthly -= d;
    remaining -= d;
  }
  if (remaining > 0 && rollover > 0) {
    const d = Math.min(remaining, rollover);
    rollover -= d;
    remaining -= d;
  }
  if (remaining > 0 && addon > 0) {
    const d = Math.min(remaining, addon);
    addon -= d;
    remaining -= d;
  }
  return {
    next: { monthly, rollover, addon },
    remaining: {
      monthly: credits.monthly_credits - monthly,
      rollover: credits.rollover_credits - rollover,
      addon: credits.addon_credits - addon,
    },
  };
}

/**
 * Optimistic-concurrency deduct. Conditional UPDATE on version + total
 * balance, batched with the ledger insert. Retries 3 times, then throws.
 */
export async function deductCredits(
  userId: string,
  action: CreditAction,
  options?: { sessionId?: string; description?: string },
): Promise<{
  success: boolean;
  remainingCredits: number;
  deductedFrom: DeductionAllocation;
  error: Error | null;
}> {
  const amount = CREDIT_COSTS[action];
  return deductAmount(userId, amount, action.toLowerCase(), options);
}

export async function deductAmount(
  userId: string,
  amount: number,
  reason: string,
  options?: { sessionId?: string; description?: string },
): Promise<{
  success: boolean;
  remainingCredits: number;
  deductedFrom: DeductionAllocation;
  error: Error | null;
}> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_OCC_RETRIES; attempt++) {
    const { credits, error } = await getUserCredits(userId);
    if (error || !credits) {
      return { success: false, remainingCredits: 0, deductedFrom: NO_DEDUCTION, error: error || new Error('Credits not found') };
    }
    const totalBefore = getTotalCredits(credits);
    if (totalBefore < amount) {
      return {
        success: false,
        remainingCredits: totalBefore,
        deductedFrom: NO_DEDUCTION,
        error: new Error(`Insufficient credits. Required: ${amount}, Available: ${totalBefore}`),
      };
    }
    const { next, remaining } = allocateDeduction(credits, amount);
    const totalAfter = next.monthly + next.rollover + next.addon;
    const now = nowIso();
    const txId = crypto.randomUUID();

    const [updateResult] = await runBatch([
      sql`
        UPDATE user_credits
        SET monthly_credits = ${next.monthly},
            rollover_credits = ${next.rollover},
            addon_credits = ${next.addon},
            version = version + 1,
            updated_at = ${now}
        WHERE user_id = ${userId}
          AND version = ${credits.version}
          AND (monthly_credits + rollover_credits + addon_credits) >= ${amount}
      `,
      sql`
        INSERT INTO credit_transactions (
          id, user_id, amount, transaction_type, session_id, description, metadata, balance_before, balance_after, created_at
        )
        SELECT ${txId}, ${userId}, ${-amount}, ${reason}, ${options?.sessionId ?? null},
               ${options?.description ?? `${reason} credit deduction`}, '{}', ${totalBefore}, ${totalAfter}, ${now}
        WHERE (SELECT changes()) > 0
      `,
    ]);

    const changes = updateResult.meta.changes;
    if (changes > 0) {
      return { success: true, remainingCredits: totalAfter, deductedFrom: remaining, error: null };
    }
    lastError = new Error('Credit deduction failed due to concurrent access. Please try again.');
  }
  throw lastError ?? new Error('Credit deduction failed due to concurrent access. Please try again.');
}

export async function addCredits(
  userId: string,
  amount: number,
  creditType: 'monthly' | 'rollover' | 'addon',
  transactionType: string,
  description?: string,
): Promise<{ success: boolean; newBalance: number; error: Error | null }> {
  const column =
    creditType === 'monthly' ? 'monthly_credits' : creditType === 'rollover' ? 'rollover_credits' : 'addon_credits';
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_OCC_RETRIES; attempt++) {
    const { credits, error } = await getUserCredits(userId);
    if (error || !credits) {
      return { success: false, newBalance: 0, error: error || new Error('Credits not found') };
    }
    const totalBefore = getTotalCredits(credits);
    const current =
      creditType === 'monthly' ? credits.monthly_credits : creditType === 'rollover' ? credits.rollover_credits : credits.addon_credits;
    const now = nowIso();
    const txId = crypto.randomUUID();

    const [updateResult] = await runBatch([
      sql`
        UPDATE user_credits
        SET ${sql.raw(column)} = ${current + amount},
            version = version + 1,
            updated_at = ${now}
        WHERE user_id = ${userId}
          AND version = ${credits.version}
      `,
      sql`
        INSERT INTO credit_transactions (
          id, user_id, amount, transaction_type, session_id, description, metadata, balance_before, balance_after, created_at
        )
        SELECT ${txId}, ${userId}, ${amount}, ${transactionType}, NULL,
               ${description ?? `${transactionType} credit addition`}, '{}', ${totalBefore}, ${totalBefore + amount}, ${now}
        WHERE (SELECT changes()) > 0
      `,
    ]);

    const changes = updateResult.meta.changes;
    if (changes > 0) {
      return { success: true, newBalance: totalBefore + amount, error: null };
    }
    lastError = new Error('Credit addition failed due to concurrent access');
  }
  return { success: false, newBalance: 0, error: lastError };
}

export async function logCreditTransaction(
  userId: string,
  amount: number,
  transactionType: string,
  options: {
    sessionId?: string;
    description?: string;
    balanceBefore: number;
    balanceAfter: number;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await insertTransaction(userId, amount, transactionType, options);
}

async function insertTransaction(
  userId: string,
  amount: number,
  transactionType: string,
  options: {
    sessionId?: string;
    description?: string;
    balanceBefore: number;
    balanceAfter: number;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const db = await getDb();
  await db.insert(creditTransactions).values({
    user_id: userId,
    amount,
    transaction_type: transactionType,
    session_id: options.sessionId ?? null,
    description: options.description ?? null,
    metadata: (options.metadata ?? {}) as Record<string, never>,
    balance_before: options.balanceBefore,
    balance_after: options.balanceAfter,
    created_at: nowIso(),
  });
}

export async function getCreditTransactions(
  userId: string,
  limit: number = 50,
): Promise<{ transactions: CreditTransaction[]; error: Error | null }> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.user_id, userId))
    .orderBy(desc(creditTransactions.created_at))
    .limit(limit);
  return { transactions: rows as CreditTransaction[], error: null };
}

export async function upgradePlan(
  userId: string,
  newTier: 'plus' | 'max',
): Promise<{ success: boolean; error: Error | null }> {
  const { plan, error: planError } = await getSubscriptionPlan(newTier);
  if (planError || !plan) {
    return { success: false, error: planError || new Error('Plan not found') };
  }
  const { credits, error: creditsError } = await getUserCredits(userId);
  if (creditsError || !credits) {
    return { success: false, error: creditsError || new Error('Credits not found') };
  }
  const now = nowIso();
  const [result] = await runBatch([
    sql`
      UPDATE user_credits
      SET plan_tier = ${newTier},
          monthly_credits = ${credits.monthly_credits + plan.credits_monthly},
          version = version + 1,
          updated_at = ${now}
      WHERE user_id = ${userId}
        AND version = ${credits.version}
    `,
  ]);
  const changes = result.meta.changes;
  if (changes === 0) {
    return { success: false, error: new Error('Plan upgrade failed due to concurrent access') };
  }
  await insertTransaction(userId, plan.credits_monthly, 'plan_upgrade', {
    description: `Upgraded to ${plan.name} plan`,
    balanceBefore: getTotalCredits(credits),
    balanceAfter: getTotalCredits(credits) + plan.credits_monthly,
    metadata: { newTier, planName: plan.name },
  });
  return { success: true, error: null };
}

export async function processMonthlyReset(userId: string): Promise<{ success: boolean; error: Error | null }> {
  const { credits, error: creditsError } = await getUserCredits(userId);
  if (creditsError || !credits) {
    return { success: false, error: creditsError || new Error('Credits not found') };
  }
  const { plan, error: planError } = await getSubscriptionPlan(credits.plan_tier);
  if (planError || !plan) {
    return { success: false, error: planError || new Error('Plan not found') };
  }
  let newRollover = credits.rollover_credits + credits.monthly_credits;
  if (plan.max_rollover_credits > 0) {
    newRollover = Math.min(newRollover, plan.max_rollover_credits);
  } else {
    newRollover = 0;
  }
  const nextReset = new Date();
  nextReset.setMonth(nextReset.getMonth() + 1);
  const now = nowIso();
  const [result] = await runBatch([
    sql`
      UPDATE user_credits
      SET monthly_credits = ${plan.credits_monthly},
          rollover_credits = ${newRollover},
          last_reset_date = ${now},
          next_reset_date = ${nextReset.toISOString()},
          version = version + 1,
          updated_at = ${now}
      WHERE user_id = ${userId}
        AND version = ${credits.version}
    `,
  ]);
  const changes = result.meta.changes;
  if (changes === 0) {
    return { success: false, error: new Error('Monthly reset failed due to concurrent access') };
  }
  const totalAfter = plan.credits_monthly + newRollover + credits.addon_credits;
  await insertTransaction(userId, plan.credits_monthly, 'monthly_reset', {
    description: `Monthly credit reset for ${plan.name} plan`,
    balanceBefore: getTotalCredits(credits),
    balanceAfter: totalAfter,
    metadata: { rolloverApplied: newRollover },
  });
  return { success: true, error: null };
}

export async function processAddonPurchase(
  userId: string,
  packId: string,
): Promise<{ success: boolean; creditsAdded: number; error: Error | null }> {
  const db = await getDb();
  const packs = await db
    .select()
    .from(addonCreditPacks)
    .where(and(eq(addonCreditPacks.id, packId), eq(addonCreditPacks.active, true)))
    .limit(1);
  const pack = packs[0];
  if (!pack) {
    return { success: false, creditsAdded: 0, error: new Error('Pack not found') };
  }
  const { credits, error: creditsError } = await getUserCredits(userId);
  if (creditsError || !credits) {
    return { success: false, creditsAdded: 0, error: creditsError || new Error('Credits not found') };
  }
  if (credits.plan_tier === 'free') {
    return { success: false, creditsAdded: 0, error: new Error('Add-ons not available for Free plan') };
  }
  const { success, error } = await addCredits(
    userId,
    pack.credits,
    'addon',
    'addon_purchase',
    `Purchased ${pack.name} (${pack.credits} credits)`,
  );
  if (!success) {
    return { success: false, creditsAdded: 0, error };
  }
  return { success: true, creditsAdded: pack.credits, error: null };
}

export async function updateUserCreditsRow(
  userId: string,
  patch: Partial<Pick<UserCredits,
    | 'monthly_credits'
    | 'rollover_credits'
    | 'addon_credits'
    | 'plan_tier'
    | 'stripe_customer_id'
    | 'stripe_subscription_id'
    | 'subscription_status'
    | 'last_reset_date'
    | 'next_reset_date'
  >>,
): Promise<UserCredits | null> {
  const db = await getDb();
  await db
    .update(userCredits)
    .set({ ...patch, updated_at: nowIso(), version: sql`version + 1` })
    .where(eq(userCredits.user_id, userId));
  const rows = await db.select().from(userCredits).where(eq(userCredits.user_id, userId)).limit(1);
  return (rows[0] as UserCredits | undefined) ?? null;
}

export async function findCreditsByStripeCustomer(customerId: string): Promise<UserCredits | null> {
  const db = await getDb();
  const rows = await db.select().from(userCredits).where(eq(userCredits.stripe_customer_id, customerId)).limit(1);
  return (rows[0] as UserCredits | undefined) ?? null;
}

export async function findCreditsByStripeSubscription(subscriptionId: string): Promise<UserCredits | null> {
  const db = await getDb();
  const rows = await db.select().from(userCredits).where(eq(userCredits.stripe_subscription_id, subscriptionId)).limit(1);
  return (rows[0] as UserCredits | undefined) ?? null;
}

/**
 * Raw read that never auto-initializes. The Stripe webhook must fail loud
 * when a user_credits row is missing rather than silently creating a free
 * plan row mid-payment, which is what getUserCredits() would do.
 */
export async function findCreditsByUserId(userId: string): Promise<UserCredits | null> {
  const db = await getDb();
  const rows = await db.select().from(userCredits).where(eq(userCredits.user_id, userId)).limit(1);
  return (rows[0] as UserCredits | undefined) ?? null;
}

/**
 * Two attempts, matching the old Postgres CAS-with-one-retry loops in the
 * Stripe webhook. The guard moved from column equality to the version
 * column, which covers every bucket at once.
 */
const WEBHOOK_OCC_ATTEMPTS = 5;

function occChanges(result: unknown): number {
  return Number((result as { meta?: { changes?: number } }).meta?.changes ?? 0);
}

/**
 * Stripe webhook: credit an add-on pack and persist the Stripe customer id,
 * with the ledger row written in the same D1 batch.
 */
export async function applyAddonPurchase(
  userId: string,
  creditsToAdd: number,
  options: {
    stripeCustomerId: string | null;
    description: string;
    metadata: Record<string, unknown>;
  },
): Promise<{ success: boolean; totalBefore: number; totalAfter: number; error: Error | null }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < WEBHOOK_OCC_ATTEMPTS; attempt++) {
    const credits = await findCreditsByUserId(userId);
    if (!credits) {
      return { success: false, totalBefore: 0, totalAfter: 0, error: new Error('User credits row not found for addon purchase') };
    }
    const totalBefore = getTotalCredits(credits);
    const totalAfter = totalBefore + creditsToAdd;
    const now = nowIso();
    const txId = crypto.randomUUID();

    const [updateResult] = await runBatch([
      sql`
        UPDATE user_credits
        SET addon_credits = ${credits.addon_credits + creditsToAdd},
            stripe_customer_id = COALESCE(${options.stripeCustomerId ?? null}, stripe_customer_id),
            version = version + 1,
            updated_at = ${now}
        WHERE user_id = ${userId}
          AND version = ${credits.version}
      `,
      sql`
        INSERT INTO credit_transactions (
          id, user_id, amount, transaction_type, session_id, description, metadata, balance_before, balance_after, created_at
        )
        SELECT ${txId}, ${userId}, ${creditsToAdd}, 'addon_purchase', NULL,
               ${options.description}, ${JSON.stringify(options.metadata)}, ${totalBefore}, ${totalAfter}, ${now}
        WHERE (SELECT changes()) > 0
      `,
    ]);

    if (occChanges(updateResult) > 0) {
      return { success: true, totalBefore, totalAfter, error: null };
    }
    lastError = new Error('Addon credit update failed due to concurrent access');
  }

  return { success: false, totalBefore: 0, totalAfter: 0, error: lastError };
}

/**
 * Stripe webhook: mid-cycle plan change. Upgrades grant the full new plan
 * allowance, downgrades cap the current monthly balance at the new plan
 * limit so a user cannot gain credits by downgrading.
 */
export async function applyPlanChange(
  userId: string,
  options: {
    planTier: SubscriptionTier;
    newPlanCredits: number;
    subscriptionStatus: string;
    stripeSubscriptionId: string;
  },
): Promise<{
  success: boolean;
  previousTier: SubscriptionTier | null;
  previousMonthly: number;
  monthlyCredits: number;
  isDowngrade: boolean;
  error: Error | null;
}> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < WEBHOOK_OCC_ATTEMPTS; attempt++) {
    const credits = await findCreditsByUserId(userId);
    if (!credits) {
      return {
        success: false,
        previousTier: null,
        previousMonthly: 0,
        monthlyCredits: 0,
        isDowngrade: false,
        error: new Error('User credits row not found for plan change'),
      };
    }
    const oldPlanCredits = credits.plan_tier === 'max' ? 200 : credits.plan_tier === 'plus' ? 50 : 4;
    const isDowngrade = options.newPlanCredits < oldPlanCredits;
    const monthlyCredits = isDowngrade
      ? Math.min(credits.monthly_credits, options.newPlanCredits)
      : options.newPlanCredits;
    const now = nowIso();
    const db = await getDb();

    const result = await db.run(sql`
      UPDATE user_credits
      SET plan_tier = ${options.planTier},
          monthly_credits = ${monthlyCredits},
          subscription_status = ${options.subscriptionStatus},
          stripe_subscription_id = ${options.stripeSubscriptionId},
          version = version + 1,
          updated_at = ${now}
      WHERE user_id = ${userId}
        AND version = ${credits.version}
    `);

    if (occChanges(result) > 0) {
      return {
        success: true,
        previousTier: credits.plan_tier,
        previousMonthly: credits.monthly_credits,
        monthlyCredits,
        isDowngrade,
        error: null,
      };
    }
    lastError = new Error('Plan change failed due to concurrent access');
  }

  return { success: false, previousTier: null, previousMonthly: 0, monthlyCredits: 0, isDowngrade: false, error: lastError };
}

/**
 * Stripe webhook: monthly renewal on invoice.payment_succeeded. Unused
 * monthly credits roll over up to the plan cap, then the monthly bucket is
 * refilled. No ledger row, matching the Postgres path.
 */
export async function applyRenewalReset(
  userId: string,
  options: { baseCredits: number; maxRollover: number },
): Promise<{
  success: boolean;
  monthlyBefore: number;
  rolloverBefore: number;
  newRollover: number;
  error: Error | null;
}> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < WEBHOOK_OCC_ATTEMPTS; attempt++) {
    const credits = await findCreditsByUserId(userId);
    if (!credits) {
      return { success: false, monthlyBefore: 0, rolloverBefore: 0, newRollover: 0, error: new Error('User credits row not found during renewal') };
    }
    const monthlyBefore = credits.monthly_credits;
    const rolloverBefore = credits.rollover_credits;
    const newRollover = Math.min(rolloverBefore + monthlyBefore, options.maxRollover);
    const now = new Date();
    const nowStr = now.toISOString();
    const nextReset = new Date(now);
    nextReset.setMonth(nextReset.getMonth() + 1);
    const db = await getDb();

    const result = await db.run(sql`
      UPDATE user_credits
      SET monthly_credits = ${options.baseCredits},
          rollover_credits = ${newRollover},
          subscription_status = 'active',
          last_reset_date = ${nowStr},
          next_reset_date = ${nextReset.toISOString()},
          version = version + 1,
          updated_at = ${nowStr}
      WHERE user_id = ${userId}
        AND version = ${credits.version}
    `);

    if (occChanges(result) > 0) {
      return { success: true, monthlyBefore, rolloverBefore, newRollover, error: null };
    }
    lastError = new Error('Renewal reset failed due to concurrent access');
  }

  return { success: false, monthlyBefore: 0, rolloverBefore: 0, newRollover: 0, error: lastError };
}

/**
 * Stripe webhook: remove credits on charge.refunded. Subscription refunds
 * drain monthly then rollover and leave add-on credits alone; add-on
 * refunds only touch the add-on bucket. Ledger row is in the same batch.
 */
export async function applyRefundRemoval(
  userId: string,
  options: {
    creditsToRemove: number;
    isSubscription: boolean;
    description: string;
    metadata: Record<string, unknown>;
  },
): Promise<{ success: boolean; totalBefore: number; totalAfter: number; error: Error | null }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < WEBHOOK_OCC_ATTEMPTS; attempt++) {
    const credits = await findCreditsByUserId(userId);
    if (!credits) {
      return { success: false, totalBefore: 0, totalAfter: 0, error: new Error('User credits row disappeared during refund') };
    }
    const totalBefore = getTotalCredits(credits);

    let newMonthly = credits.monthly_credits;
    let newRollover = credits.rollover_credits;
    let newAddon = credits.addon_credits;

    if (options.isSubscription) {
      let remaining = options.creditsToRemove;
      const monthlyDeduct = Math.min(remaining, newMonthly);
      newMonthly -= monthlyDeduct;
      remaining -= monthlyDeduct;
      if (remaining > 0) {
        newRollover -= Math.min(remaining, newRollover);
      }
    } else {
      newAddon = Math.max(0, newAddon - options.creditsToRemove);
    }

    const totalAfter = newMonthly + newRollover + newAddon;
    const now = nowIso();
    const txId = crypto.randomUUID();

    const [updateResult] = await runBatch([
      sql`
        UPDATE user_credits
        SET monthly_credits = ${newMonthly},
            rollover_credits = ${newRollover},
            addon_credits = ${newAddon},
            version = version + 1,
            updated_at = ${now}
        WHERE user_id = ${userId}
          AND version = ${credits.version}
      `,
      sql`
        INSERT INTO credit_transactions (
          id, user_id, amount, transaction_type, session_id, description, metadata, balance_before, balance_after, created_at
        )
        SELECT ${txId}, ${userId}, ${totalAfter - totalBefore}, 'refund', NULL,
               ${options.description}, ${JSON.stringify(options.metadata)}, ${totalBefore}, ${totalAfter}, ${now}
        WHERE (SELECT changes()) > 0
      `,
    ]);

    if (occChanges(updateResult) > 0) {
      return { success: true, totalBefore, totalAfter, error: null };
    }
    lastError = new Error('Refund credit removal failed due to concurrent access');
  }

  return { success: false, totalBefore: 0, totalAfter: 0, error: lastError };
}

export type CreditReservationStatus = 'reserved' | 'captured' | 'released' | 'refunded';

export interface CreditReservation {
  id: string;
  user_id: string;
  generation_id: string | null;
  session_id: string | null;
  action: string;
  amount: number;
  status: CreditReservationStatus;
  reserved_at: string;
  captured_at: string | null;
  released_at: string | null;
  refunded_at: string | null;
  idempotency_key: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ReserveCreditResult {
  success: boolean;
  reservation: CreditReservation | null;
  error: string | null;
  available?: number;
  required?: number;
}

export interface CaptureOrReleaseResult {
  success: boolean;
  reservation: CreditReservation | null;
  error: string | null;
}

function extractDeductedFrom(
  metadata: CreditReservation['metadata'],
  amount: number,
): DeductionAllocation | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).deducted_from;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const split = raw as Record<string, unknown>;
  const monthly = typeof split.monthly === 'number' ? split.monthly : 0;
  const rollover = typeof split.rollover === 'number' ? split.rollover : 0;
  const addon = typeof split.addon === 'number' ? split.addon : 0;
  if (Math.abs(monthly + rollover + addon - amount) > 1e-9) return null;
  return { monthly, rollover, addon };
}

export async function getReservationByKey(userId: string, idempotencyKey: string): Promise<CreditReservation | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(creditReservations)
    .where(and(eq(creditReservations.idempotency_key, idempotencyKey), eq(creditReservations.user_id, userId)))
    .limit(1);
  return (rows[0] as CreditReservation | undefined) ?? null;
}

export async function reserveCredits(params: {
  userId: string;
  action: CreditAction;
  idempotencyKey: string;
  generationId?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ReserveCreditResult> {
  const { userId, action, idempotencyKey, metadata = {} } = params;
  const amount = CREDIT_COSTS[action];
  const existing = await getReservationByKey(userId, idempotencyKey);
  if (existing) {
    return { success: true, reservation: existing, error: null };
  }

  const deductResult = await deductCredits(userId, action, {
    sessionId: params.sessionId ?? undefined,
    description: `Credit reservation for ${action}`,
  });
  if (!deductResult.success) {
    return {
      success: false,
      reservation: null,
      error: deductResult.error?.message ?? 'Deduction failed',
      available: deductResult.remainingCredits,
      required: amount,
    };
  }

  const refundDeduction = async (reason: string, description: string) => {
    const { deductedFrom } = deductResult;
    if (deductedFrom.monthly > 0) await addCredits(userId, deductedFrom.monthly, 'monthly', reason, description);
    if (deductedFrom.rollover > 0) await addCredits(userId, deductedFrom.rollover, 'rollover', reason, description);
    if (deductedFrom.addon > 0) await addCredits(userId, deductedFrom.addon, 'addon', reason, description);
  };

  const db = await getDb();
  const now = nowIso();
  const id = crypto.randomUUID();
  try {
    await db.insert(creditReservations).values({
      id,
      user_id: userId,
      generation_id: coerceUuidOrNull(params.generationId),
      session_id: coerceUuidOrNull(params.sessionId),
      action: action.toLowerCase(),
      amount,
      status: 'reserved',
      reserved_at: now,
      idempotency_key: idempotencyKey,
      metadata: {
        ...metadata,
        remaining_after_reserve: deductResult.remainingCredits,
        deducted_from: deductResult.deductedFrom,
      } as unknown as Record<string, never>,
      created_at: now,
      updated_at: now,
    });
  } catch (insertError) {
    if (isUniqueViolation(insertError)) {
      // Lost the idempotency race: the winner holds the reservation, refund this deduction.
      const winner = await getReservationByKey(userId, idempotencyKey);
      if (winner) {
        await refundDeduction('reservation_duplicate_refund', `Duplicate reservation refund for ${idempotencyKey}`);
        return { success: true, reservation: winner, error: null };
      }
    }
    // Any other failure: verify before refunding. D1 may have written the row
    // and dropped the response; refunding then would create a free reservation.
    const existing = await getReservationByKey(userId, idempotencyKey);
    if (existing) {
      return { success: true, reservation: existing, error: null };
    }
    await refundDeduction('reservation_failed_refund', `Failed reservation refund for ${idempotencyKey}`);
    return { success: false, reservation: null, error: 'Failed to create reservation' };
  }

  const reservation = await getReservationByKey(userId, idempotencyKey);
  return { success: true, reservation, error: reservation ? null : 'Failed to create reservation' };
}

async function transitionReservation(params: {
  userId: string;
  idempotencyKey: string;
  fromStatus: CreditReservationStatus;
  toStatus: CreditReservationStatus;
  timestampField: 'captured_at' | 'released_at' | 'refunded_at';
}): Promise<CaptureOrReleaseResult & { transitioned: boolean }> {
  const { userId, idempotencyKey, fromStatus, toStatus, timestampField } = params;
  const existing = await getReservationByKey(userId, idempotencyKey);
  if (!existing) {
    return { success: false, reservation: null, error: 'Reservation not found', transitioned: false };
  }
  if (existing.status === toStatus) {
    return { success: true, reservation: existing, error: null, transitioned: false };
  }
  if (existing.status !== fromStatus) {
    return { success: false, reservation: existing, error: `Cannot transition from ${existing.status} to ${toStatus}`, transitioned: false };
  }
  const db = await getDb();
  const now = nowIso();
  // CAS on status: a lost race (0 rows) must report transitioned=false so
  // callers (releaseReservation) never refund twice.
  const changed = await db
    .update(creditReservations)
    .set({ status: toStatus, [timestampField]: now, updated_at: now })
    .where(and(eq(creditReservations.id, existing.id), eq(creditReservations.user_id, userId), eq(creditReservations.status, fromStatus)))
    .returning({ id: creditReservations.id });
  const updated = await getReservationByKey(userId, idempotencyKey);
  if (changed.length === 0) {
    if (updated?.status === toStatus) {
      return { success: true, reservation: updated, error: null, transitioned: false };
    }
    return { success: false, reservation: updated, error: `Cannot transition from ${updated?.status ?? 'unknown'} to ${toStatus}`, transitioned: false };
  }
  return { success: true, reservation: updated, error: null, transitioned: true };
}

export async function captureReservation(params: {
  userId: string;
  idempotencyKey: string;
}): Promise<CaptureOrReleaseResult> {
  return transitionReservation({
    ...params,
    fromStatus: 'reserved',
    toStatus: 'captured',
    timestampField: 'captured_at',
  });
}

export async function releaseReservation(params: {
  userId: string;
  idempotencyKey: string;
  reason?: string;
}): Promise<CaptureOrReleaseResult> {
  const result = await transitionReservation({
    userId: params.userId,
    idempotencyKey: params.idempotencyKey,
    fromStatus: 'reserved',
    toStatus: 'released',
    timestampField: 'released_at',
  });
  if (result.transitioned && result.reservation) {
    const reservation = result.reservation;
    const reason = 'reservation_released';
    const description = `Released reservation ${reservation.id}${params.reason ? `: ${params.reason}` : ''}`;
    const split = extractDeductedFrom(reservation.metadata, reservation.amount);
    if (split) {
      if (split.monthly > 0) await addCredits(reservation.user_id, split.monthly, 'monthly', reason, description);
      if (split.rollover > 0) await addCredits(reservation.user_id, split.rollover, 'rollover', reason, description);
      if (split.addon > 0) await addCredits(reservation.user_id, split.addon, 'addon', reason, description);
    } else {
      await addCredits(reservation.user_id, reservation.amount, 'addon', reason, description);
    }
  }
  return result;
}

export async function findActiveReservation(params: {
  userId: string;
  generationId?: string | null;
  sessionId?: string | null;
  idempotencyKey?: string | null;
}): Promise<CreditReservation | null> {
  const db = await getDb();
  if (params.idempotencyKey) {
    return getReservationByKey(params.userId, params.idempotencyKey);
  }
  if (params.generationId) {
    const rows = await db
      .select()
      .from(creditReservations)
      .where(and(
        eq(creditReservations.generation_id, params.generationId),
        eq(creditReservations.user_id, params.userId),
        eq(creditReservations.status, 'reserved'),
      ))
      .limit(1);
    return (rows[0] as CreditReservation | undefined) ?? null;
  }
  if (params.sessionId) {
    const rows = await db
      .select()
      .from(creditReservations)
      .where(and(
        eq(creditReservations.session_id, params.sessionId),
        eq(creditReservations.user_id, params.userId),
        eq(creditReservations.status, 'reserved'),
      ))
      .orderBy(desc(creditReservations.created_at))
      .limit(1);
    return (rows[0] as CreditReservation | undefined) ?? null;
  }
  return null;
}

export async function releaseStaleReservations(params?: {
  maxAgeMs?: number;
  limit?: number;
}): Promise<{ released: number }> {
  const { listStaleReservations } = await import('./admin');
  const maxAgeMs = params?.maxAgeMs ?? 30 * 60 * 1000;
  const limit = params?.limit ?? 50;
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const rows = await listStaleReservations(cutoff, limit);
  let released = 0;
  for (const row of rows) {
    const result = await releaseReservation({
      userId: row.user_id,
      idempotencyKey: row.idempotency_key,
      reason: 'stale_reservation_reconciler',
    });
    if (result.success) released += 1;
  }
  return { released };
}
