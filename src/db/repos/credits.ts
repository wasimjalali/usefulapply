import { and, asc, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { isUniqueViolation, runBatch, getDb, nowIso } from '../client';
import { addonCreditPacks, creditReservations, creditTransactions, subscriptionPlans, userCredits } from '../schema';
import type { SubscriptionTier } from '@/lib/supabase/types';
import {
  CREDIT_ACTION_KIND,
  CREDIT_COSTS,
  getTotalCredits,
  type CreditAction,
  type CreditTransactionKind,
} from '@/lib/credit-costs';

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
  /** Null on rows written before the column existed. Read it through `creditTransactionKind`. */
  transaction_kind: string | null;
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
 * Port of Postgres `initialize_user_credits`. Called from the Better Auth
 * `user.create.after` hook (after getOrCreateProfile) and from getUserCredits.
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
    await insertTransaction(userId, 4, 'monthly_reset', 'grant', {
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
  return deductAmount(userId, amount, action.toLowerCase(), CREDIT_ACTION_KIND[action], options);
}

export async function deductAmount(
  userId: string,
  amount: number,
  reason: string,
  kind: CreditTransactionKind,
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
          id, user_id, amount, transaction_type, transaction_kind, session_id, description, metadata, balance_before, balance_after, created_at
        )
        SELECT ${txId}, ${userId}, ${-amount}, ${reason}, ${kind}, ${options?.sessionId ?? null},
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
  kind: CreditTransactionKind,
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
          id, user_id, amount, transaction_type, transaction_kind, session_id, description, metadata, balance_before, balance_after, created_at
        )
        SELECT ${txId}, ${userId}, ${amount}, ${transactionType}, ${kind}, NULL,
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
  kind: CreditTransactionKind,
  options: {
    sessionId?: string;
    description?: string;
    balanceBefore: number;
    balanceAfter: number;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await insertTransaction(userId, amount, transactionType, kind, options);
}

async function insertTransaction(
  userId: string,
  amount: number,
  transactionType: string,
  kind: CreditTransactionKind,
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
    transaction_kind: kind,
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
  await insertTransaction(userId, plan.credits_monthly, 'plan_upgrade', 'grant', {
    description: `Upgraded to ${plan.name} plan`,
    balanceBefore: getTotalCredits(credits),
    balanceAfter: getTotalCredits(credits) + plan.credits_monthly,
    metadata: { newTier, planName: plan.name },
  });
  return { success: true, error: null };
}

export async function processMonthlyReset(
  userId: string,
  options?: { dueBefore: string },
): Promise<{ success: boolean; error: Error | null }> {
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
  // Plans without rollover (free) can carry a support grant above the
  // allowance. A reset must never take credits away, so keep the higher value.
  const newMonthly = plan.max_rollover_credits > 0
    ? plan.credits_monthly
    : Math.max(credits.monthly_credits, plan.credits_monthly);
  const nextReset = new Date();
  nextReset.setMonth(nextReset.getMonth() + 1);
  const now = nowIso();
  const totalBefore = getTotalCredits(credits);
  const totalAfter = newMonthly + newRollover + credits.addon_credits;
  const txId = crypto.randomUUID();
  const metadata = JSON.stringify({ rolloverApplied: newRollover });
  // Balance update and ledger row land in one batch, as deductCredits does,
  // so a reset can never exist without its transaction row.
  const [result] = await runBatch([
    sql`
      UPDATE user_credits
      SET monthly_credits = ${newMonthly},
          rollover_credits = ${newRollover},
          last_reset_date = ${now},
          next_reset_date = ${nextReset.toISOString()},
          version = version + 1,
          updated_at = ${now}
      WHERE user_id = ${userId}
        AND version = ${credits.version}
        AND plan_tier = ${credits.plan_tier}
        ${options?.dueBefore ? sql`AND next_reset_date < ${options.dueBefore}` : sql``}
    `,
    sql`
      INSERT INTO credit_transactions (
        id, user_id, amount, transaction_type, transaction_kind, session_id, description, metadata, balance_before, balance_after, created_at
      )
      SELECT ${txId}, ${userId}, ${totalAfter - totalBefore}, 'monthly_reset', 'grant', NULL,
             ${`Monthly credit reset for ${plan.name} plan`}, ${metadata}, ${totalBefore}, ${totalAfter}, ${now}
      WHERE (SELECT changes()) > 0
    `,
  ]);
  const changes = result.meta.changes;
  if (changes === 0) {
    return { success: false, error: new Error('Monthly reset failed due to concurrent access') };
  }
  return { success: true, error: null };
}

/**
 * Daily fallback sweep. Free rows reset when due. Active paid rows reset only
 * after a three-day grace period so a delayed renewal webhook remains primary.
 */
export async function processOverdueMonthlyResets(options: {
  limit: number;
}): Promise<{ attempted: number; succeeded: number; failed: number; errors: string[] }> {
  const db = await getDb();
  const now = nowIso();
  const paidGraceCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db
    .select({ user_id: userCredits.user_id, plan_tier: userCredits.plan_tier })
    .from(userCredits)
    .where(and(
      or(
        and(
          eq(userCredits.plan_tier, 'free'),
          or(lt(userCredits.next_reset_date, now), isNull(userCredits.next_reset_date)),
        ),
        and(
          or(eq(userCredits.plan_tier, 'plus'), eq(userCredits.plan_tier, 'max')),
          eq(userCredits.subscription_status, 'active'),
          lt(userCredits.next_reset_date, paidGraceCutoff),
        ),
      ),
    ))
    .orderBy(asc(userCredits.next_reset_date))
    .limit(options.limit);

  const errors: string[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    // One user's failure must not stop the rest of the sweep.
    try {
      const result = await processMonthlyReset(
        row.user_id,
        row.plan_tier === 'free' ? undefined : { dueBefore: paidGraceCutoff },
      );
      if (result.success) {
        succeeded += 1;
      } else {
        failed += 1;
        errors.push(`${row.user_id}: ${result.error?.message ?? 'Monthly reset failed'}`);
      }
    } catch (error) {
      failed += 1;
      errors.push(`${row.user_id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { attempted: rows.length, succeeded, failed, errors };
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
    'grant',
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
    idempotencyKey: string;
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
    const txId = options.idempotencyKey;

    const [updateResult] = await runBatch([
      sql`
        UPDATE user_credits
        SET addon_credits = ${credits.addon_credits + creditsToAdd},
            stripe_customer_id = COALESCE(${options.stripeCustomerId ?? null}, stripe_customer_id),
            version = version + 1,
            updated_at = ${now}
        WHERE user_id = ${userId}
          AND version = ${credits.version}
          AND NOT EXISTS (SELECT 1 FROM credit_transactions WHERE id = ${txId})
      `,
      sql`
        INSERT INTO credit_transactions (
          id, user_id, amount, transaction_type, transaction_kind, session_id, description, metadata, balance_before, balance_after, created_at
        )
        SELECT ${txId}, ${userId}, ${creditsToAdd}, 'addon_purchase', 'grant', NULL,
               ${options.description}, ${JSON.stringify(options.metadata)}, ${totalBefore}, ${totalAfter}, ${now}
        WHERE (SELECT changes()) > 0
      `,
    ]);

    if (occChanges(updateResult) > 0) {
      return { success: true, totalBefore, totalAfter, error: null };
    }
    const db = await getDb();
    const existingTransaction = await db
      .select({ id: creditTransactions.id })
      .from(creditTransactions)
      .where(eq(creditTransactions.id, txId))
      .limit(1);
    if (existingTransaction[0]) {
      return { success: true, totalBefore, totalAfter: totalBefore, error: null };
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
    stripeCustomerId?: string;
    grantCredits?: boolean;
    currentPeriodEnd?: string;
  },
): Promise<{
  success: boolean;
  previousTier: SubscriptionTier | null;
  previousMonthly: number;
  monthlyCredits: number;
  isDowngrade: boolean;
  isSameTier: boolean;
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
        isSameTier: false,
        error: new Error('User credits row not found for plan change'),
      };
    }
    const oldPlanCredits = credits.plan_tier === 'max' ? 200 : credits.plan_tier === 'plus' ? 50 : 4;
    const isDowngrade = options.newPlanCredits < oldPlanCredits;
    const isSameTier = options.planTier === credits.plan_tier;
    const grantCredits = options.grantCredits !== false;
    const monthlyCredits = !grantCredits || isSameTier
      ? credits.monthly_credits
      : isDowngrade
        ? Math.min(credits.monthly_credits, options.newPlanCredits)
        : options.newPlanCredits;
    const nextTier = grantCredits ? options.planTier : credits.plan_tier;
    const now = nowIso();
    const creditDelta = monthlyCredits - credits.monthly_credits;
    const totalBefore = getTotalCredits(credits);
    const totalAfter = totalBefore + creditDelta;
    const transactionId = crypto.randomUUID();

    const [result] = await runBatch([
      sql`
        UPDATE user_credits
        SET plan_tier = ${nextTier},
            monthly_credits = ${monthlyCredits},
            subscription_status = ${options.subscriptionStatus},
            stripe_subscription_id = ${options.stripeSubscriptionId},
            stripe_customer_id = COALESCE(${options.stripeCustomerId ?? null}, stripe_customer_id),
            next_reset_date = COALESCE(${options.currentPeriodEnd ?? null}, next_reset_date),
            version = version + 1,
            updated_at = ${now}
        WHERE user_id = ${userId}
          AND version = ${credits.version}
      `,
      sql`
        INSERT INTO credit_transactions (
          id, user_id, amount, transaction_type, transaction_kind, session_id, description, metadata, balance_before, balance_after, created_at
        )
        SELECT ${transactionId}, ${userId}, ${creditDelta}, 'plan_upgrade', 'grant', NULL,
               ${`Plan changed from ${credits.plan_tier} to ${nextTier}`},
               ${JSON.stringify({ previousTier: credits.plan_tier, nextTier, stripeSubscriptionId: options.stripeSubscriptionId })},
               ${totalBefore}, ${totalAfter}, ${now}
        WHERE (SELECT changes()) > 0
          AND ${creditDelta} != 0
      `,
    ]);

    if (occChanges(result) > 0) {
      return {
        success: true,
        previousTier: credits.plan_tier,
        previousMonthly: credits.monthly_credits,
        monthlyCredits,
        isDowngrade,
        isSameTier,
        error: null,
      };
    }
    lastError = new Error('Plan change failed due to concurrent access');
  }

  return { success: false, previousTier: null, previousMonthly: 0, monthlyCredits: 0, isDowngrade: false, isSameTier: false, error: lastError };
}

/**
 * Stripe webhook: monthly renewal on invoice.payment_succeeded. Unused
 * monthly credits roll over up to the plan cap, then the monthly bucket is
 * refilled. No ledger row, matching the Postgres path.
 */
export async function applyRenewalReset(
  userId: string,
  options: { baseCredits: number; maxRollover: number; idempotencyKey: string },
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
    const totalBefore = getTotalCredits(credits);
    const totalAfter = options.baseCredits + newRollover + credits.addon_credits;
    const [result] = await runBatch([
      sql`
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
          AND NOT EXISTS (SELECT 1 FROM credit_transactions WHERE id = ${options.idempotencyKey})
      `,
      sql`
        INSERT INTO credit_transactions (
          id, user_id, amount, transaction_type, transaction_kind, session_id, description, metadata, balance_before, balance_after, created_at
        )
        SELECT ${options.idempotencyKey}, ${userId}, ${totalAfter - totalBefore}, 'monthly_reset', 'grant', NULL,
               'Stripe subscription renewal', ${JSON.stringify({ stripeInvoiceId: options.idempotencyKey.replace(/^stripe-renewal:/, '') })},
               ${totalBefore}, ${totalAfter}, ${nowStr}
        WHERE (SELECT changes()) > 0
      `,
    ]);

    if (occChanges(result) > 0) {
      return { success: true, monthlyBefore, rolloverBefore, newRollover, error: null };
    }
    const db = await getDb();
    const existingTransaction = await db
      .select({ id: creditTransactions.id })
      .from(creditTransactions)
      .where(eq(creditTransactions.id, options.idempotencyKey))
      .limit(1);
    if (existingTransaction[0]) {
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
    chargeId: string;
    refundId: string;
    refundAmountCents?: number;
    cumulativeRefundedAmountCents: number;
    totalAmountCents: number;
    sourceCredits: number;
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
    const transactionId = `stripe-refund:${options.refundId}`;
    const db = await getDb();
    const existingRows = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.id, transactionId))
      .limit(1);
    if (existingRows[0]) {
      return { success: true, totalBefore, totalAfter: totalBefore, error: null };
    }

    const chargeTransactions = await db
      .select()
      .from(creditTransactions)
      .where(and(
        eq(creditTransactions.user_id, userId),
        eq(creditTransactions.transaction_type, 'refund'),
        sql`json_extract(${creditTransactions.metadata}, '$.chargeId') = ${options.chargeId}`,
      ));
    const processedRefundCents = chargeTransactions.reduce((highest, row) => {
      const metadata = (row as CreditTransaction).metadata ?? {};
      const cumulativeAmount = typeof metadata.chargeRefundedAmountCents === 'number'
        ? metadata.chargeRefundedAmountCents
        : typeof metadata.refundedAmountCents === 'number'
          ? metadata.refundedAmountCents
          : 0;
      return Math.max(highest, cumulativeAmount);
    }, 0);
    const refundAmountCents = options.refundAmountCents
      ?? Math.max(0, options.cumulativeRefundedAmountCents - processedRefundCents);
    const nextRefundedCents = Math.max(
      0,
      Math.min(options.totalAmountCents, options.cumulativeRefundedAmountCents),
    );
    const previousTargetCredits = processedRefundCents >= options.totalAmountCents
      ? options.sourceCredits
      : Math.round(options.sourceCredits * (processedRefundCents / options.totalAmountCents));
    const nextTargetCredits = nextRefundedCents >= options.totalAmountCents
      ? options.sourceCredits
      : Math.round(options.sourceCredits * (nextRefundedCents / options.totalAmountCents));
    const creditsToRemove = Math.max(0, nextTargetCredits - previousTargetCredits);

    let newMonthly = credits.monthly_credits;
    let newRollover = credits.rollover_credits;
    let newAddon = credits.addon_credits;

    if (options.isSubscription) {
      let remaining = creditsToRemove;
      const monthlyDeduct = Math.min(remaining, newMonthly);
      newMonthly -= monthlyDeduct;
      remaining -= monthlyDeduct;
      if (remaining > 0) {
        newRollover -= Math.min(remaining, newRollover);
      }
    } else {
      newAddon = Math.max(0, newAddon - creditsToRemove);
    }

    const totalAfter = newMonthly + newRollover + newAddon;
    const now = nowIso();
    const creditsRemoved = totalBefore - totalAfter;
    const nextMetadata = {
      ...options.metadata,
      chargeId: options.chargeId,
      refundId: options.refundId,
      refundAmountCents,
      chargeRefundedAmountCents: nextRefundedCents,
      totalAmountCents: options.totalAmountCents,
      sourceCredits: options.sourceCredits,
      creditsScheduledForRemoval: creditsToRemove,
      creditsRemoved,
      unrecoveredCredits: Math.max(0, creditsToRemove - creditsRemoved),
    };

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
          id, user_id, amount, transaction_type, transaction_kind, session_id, description, metadata, balance_before, balance_after, created_at
        )
        SELECT ${transactionId}, ${userId}, ${-creditsRemoved}, 'refund', 'refund', NULL,
               ${options.description}, ${JSON.stringify(nextMetadata)}, ${totalBefore}, ${totalAfter}, ${now}
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
  created: boolean;
  reservation: CreditReservation | null;
  error: string | null;
  available?: number;
  required?: number;
  /**
   * Set when the failure is a replayed idempotency key rather than an empty
   * balance. Callers that surface a balance message can branch on it; the
   * ones that do not still fail closed, which is the half that matters.
   */
  code?: 'RESERVATION_IN_FLIGHT' | 'RESERVATION_SPENT';
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

export async function hasCapturedFitReservation(userId: string, contextId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: creditReservations.id })
    .from(creditReservations)
    .where(and(
      eq(creditReservations.user_id, userId),
      eq(creditReservations.action, 'fit_analysis'),
      eq(creditReservations.status, 'captured'),
      sql`json_extract(${creditReservations.metadata}, '$.context_id') = ${contextId}`,
    ))
    .limit(1);
  return rows.length > 0;
}

export async function canUseFitContinuation(
  userId: string,
  contextId: string,
  requestId: string,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: creditReservations.id })
    .from(creditReservations)
    .where(and(
      eq(creditReservations.user_id, userId),
      eq(creditReservations.action, 'fit_analysis'),
      eq(creditReservations.status, 'captured'),
      sql`json_extract(${creditReservations.metadata}, '$.context_id') = ${contextId}`,
      sql`(
        json_extract(${creditReservations.metadata}, '$.continuation_request_id') IS NULL
        OR json_extract(${creditReservations.metadata}, '$.continuation_request_id') = ${requestId}
      )`,
    ))
    .limit(1);
  return rows.length > 0;
}

export async function claimFitContinuation(
  userId: string,
  contextId: string,
  requestId: string,
): Promise<boolean> {
  const db = await getDb();
  const now = nowIso();
  const rows = await db
    .update(creditReservations)
    .set({
      metadata: sql`json_set(
        ${creditReservations.metadata},
        '$.continuation_request_id', ${requestId},
        '$.continuation_used_at', ${now}
      )` as never,
      updated_at: now,
    })
    .where(and(
      eq(creditReservations.user_id, userId),
      eq(creditReservations.action, 'fit_analysis'),
      eq(creditReservations.status, 'captured'),
      sql`json_extract(${creditReservations.metadata}, '$.context_id') = ${contextId}`,
      sql`(
        json_extract(${creditReservations.metadata}, '$.continuation_request_id') IS NULL
        OR json_extract(${creditReservations.metadata}, '$.continuation_request_id') = ${requestId}
      )`,
    ))
    .returning({ id: creditReservations.id });
  return rows.length > 0;
}

export async function releaseFitContinuationClaim(
  userId: string,
  contextId: string,
  requestId: string,
): Promise<void> {
  const db = await getDb();
  await db
    .update(creditReservations)
    .set({
      metadata: sql`json_remove(
        ${creditReservations.metadata},
        '$.continuation_request_id',
        '$.continuation_used_at'
      )` as never,
      updated_at: nowIso(),
    })
    .where(and(
      eq(creditReservations.user_id, userId),
      eq(creditReservations.action, 'fit_analysis'),
      eq(creditReservations.status, 'captured'),
      sql`json_extract(${creditReservations.metadata}, '$.context_id') = ${contextId}`,
      sql`json_extract(${creditReservations.metadata}, '$.continuation_request_id') = ${requestId}`,
    ));
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
  const replayResult = (reservation: CreditReservation): ReserveCreditResult => ({
    success: false,
    created: false,
    reservation,
    error: reservation.status === 'reserved'
      ? 'This request is already in progress'
      : 'This request already completed',
    code: reservation.status === 'reserved' ? 'RESERVATION_IN_FLIGHT' : 'RESERVATION_SPENT',
    required: amount,
  });
  const existing = await getReservationByKey(userId, idempotencyKey);
  if (existing && existing.status !== 'released') {
    // Only a reservation still in flight dedupes. That is what the idempotency
    // key is for: a retried fetch, or a double-fired click, reuses the credits
    // already held rather than deducting twice.
    //
    // A key whose reservation has been captured is SPENT, and
    // treating it as a fresh success was a way to buy generations for nothing:
    // the key rides in on the client's own `x-request-id` header, so replaying
    // a spent id ran the model again, returned the document, and never moved
    // the balance. Every paid path built on this helper was affected.
    //
    // A released reservation did not produce output and may be reserved again
    // below. Captured and refunded keys remain terminal.
    return replayResult(existing);
  }

  const deductResult = await deductCredits(userId, action, {
    sessionId: params.sessionId ?? undefined,
    description: `Credit reservation for ${action}`,
  });
  if (!deductResult.success) {
    return {
      success: false,
      created: false,
      reservation: null,
      error: deductResult.error?.message ?? 'Deduction failed',
      available: deductResult.remainingCredits,
      required: amount,
    };
  }

  const refundDeduction = async (reason: string, description: string) => {
    const { deductedFrom } = deductResult;
    if (deductedFrom.monthly > 0) await addCredits(userId, deductedFrom.monthly, 'monthly', reason, 'refund', description);
    if (deductedFrom.rollover > 0) await addCredits(userId, deductedFrom.rollover, 'rollover', reason, 'refund', description);
    if (deductedFrom.addon > 0) await addCredits(userId, deductedFrom.addon, 'addon', reason, 'refund', description);
  };

  const db = await getDb();
  const now = nowIso();
  const id = crypto.randomUUID();
  const reservationMetadata = {
    ...metadata,
    reservation_attempt_id: id,
    remaining_after_reserve: deductResult.remainingCredits,
    deducted_from: deductResult.deductedFrom,
  } as unknown as Record<string, never>;

  if (existing?.status === 'released') {
    try {
      const rows = await db
        .update(creditReservations)
        .set({
          generation_id: coerceUuidOrNull(params.generationId),
          session_id: coerceUuidOrNull(params.sessionId),
          action: action.toLowerCase(),
          amount,
          status: 'reserved',
          reserved_at: now,
          captured_at: null,
          released_at: null,
          refunded_at: null,
          metadata: reservationMetadata,
          updated_at: now,
        })
        .where(and(
          eq(creditReservations.id, existing.id),
          eq(creditReservations.user_id, userId),
          eq(creditReservations.status, 'released'),
        ))
        .returning();
      if (rows[0]) {
        return { success: true, created: true, reservation: rows[0] as CreditReservation, error: null };
      }
    } catch {
      const verified = await getReservationByKey(userId, idempotencyKey);
      if (
        verified?.status === 'reserved'
        && (verified.metadata as Record<string, unknown>).reservation_attempt_id === id
      ) {
        return { success: true, created: true, reservation: verified, error: null };
      }
    }

    const winner = await getReservationByKey(userId, idempotencyKey);
    await refundDeduction('reservation_retry_race_refund', `Reservation retry race refund for ${idempotencyKey}`);
    return winner
      ? replayResult(winner)
      : { success: false, created: false, reservation: null, error: 'Failed to recreate reservation' };
  }

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
      metadata: reservationMetadata,
      created_at: now,
      updated_at: now,
    });
  } catch (insertError) {
    // Verify before refunding. If this exact row committed and D1 dropped the
    // response, this call owns the held credits and can proceed.
    const persisted = await getReservationByKey(userId, idempotencyKey);
    if (persisted?.id === id) {
      return { success: true, created: true, reservation: persisted, error: null };
    }
    if (persisted) {
      await refundDeduction('reservation_duplicate_refund', `Duplicate reservation refund for ${idempotencyKey}`);
      return replayResult(persisted);
    }
    console.error('[credits] reservation insert failed:', insertError);
    await refundDeduction('reservation_failed_refund', `Failed reservation refund for ${idempotencyKey}`);
    return { success: false, created: false, reservation: null, error: 'Failed to create reservation' };
  }

  const reservation = await getReservationByKey(userId, idempotencyKey);
  return {
    success: Boolean(reservation),
    created: Boolean(reservation),
    reservation,
    error: reservation ? null : 'Failed to create reservation',
  };
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
      if (split.monthly > 0) await addCredits(reservation.user_id, split.monthly, 'monthly', reason, 'refund', description);
      if (split.rollover > 0) await addCredits(reservation.user_id, split.rollover, 'rollover', reason, 'refund', description);
      if (split.addon > 0) await addCredits(reservation.user_id, split.addon, 'addon', reason, 'refund', description);
    } else {
      await addCredits(reservation.user_id, reservation.amount, 'addon', reason, 'refund', description);
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
