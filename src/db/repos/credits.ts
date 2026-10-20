import { and, asc, desc, eq, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
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
  code?: 'RESERVATION_IN_FLIGHT' | 'RESERVATION_SPENT' | 'SPEND_LIMIT_REACHED';
  /** With SPEND_LIMIT_REACHED: what this source has reserved or spent in the window, and its limit. */
  spendLimit?: { spent: number; limit: number };
}

/** A cap on what one source (today: MCP agents) may reserve inside a window. Counted from `credit_reservations.metadata.source`. */
export interface ReservationSpendLimit {
  source: string;
  limit: number;
  /** Start of the window, ISO. */
  since: string;
}

/** 00:00 UTC of the day `now` falls in. */
export function utcDayStart(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/** Credits a source has reserved (and not given back) or spent since `since`. */
export async function reservedSpendSince(userId: string, source: string, since: string): Promise<number> {
  const db = await getDb();
  const rows = await db.all<{ spent: number }>(sql`
    SELECT COALESCE(SUM(amount), 0) AS spent FROM credit_reservations
    WHERE user_id = ${userId} AND reserved_at >= ${since}
      AND status IN ('reserved', 'captured')
      AND json_extract(metadata, '$.source') = ${source}
  `);
  return Number(rows[0]?.spent ?? 0);
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
        OR EXISTS (
          SELECT 1
          FROM credit_reservations AS linked_continuation
          WHERE linked_continuation.id = json_extract(${creditReservations.metadata}, '$.continuation_reservation_id')
            AND linked_continuation.user_id = ${userId}
            AND linked_continuation.status = 'released'
        )
      )`,
    ))
    .limit(1);
  return rows.length > 0;
}

export async function claimFitContinuation(
  userId: string,
  contextId: string,
  requestId: string,
  reservationId: string,
): Promise<boolean> {
  const db = await getDb();
  const now = nowIso();
  const rows = await db
    .update(creditReservations)
    .set({
      metadata: sql`json_set(
        ${creditReservations.metadata},
        '$.continuation_request_id', ${requestId},
        '$.continuation_reservation_id', ${reservationId},
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
        OR EXISTS (
          SELECT 1
          FROM credit_reservations AS linked_continuation
          WHERE linked_continuation.id = json_extract(${creditReservations.metadata}, '$.continuation_reservation_id')
            AND linked_continuation.user_id = ${userId}
            AND linked_continuation.status = 'released'
        )
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
        '$.continuation_reservation_id',
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

/**
 * The statements that reserve credits, built to run in ONE `runBatch`:
 *
 *   A  conditional deduct: `WHERE version = <read> AND total >= amount`, which
 *      also bumps `user_credits.version`, so any other deduct that read the
 *      old version fails its WHERE and retries;
 *   G  (re-reserve only) an abort guard: if A deducted but the released
 *      reservation is no longer there to be reused, the batch errors and rolls
 *      back, deduct included;
 *   B  the reservation row, gated on `changes() > 0` (A deducted). A fresh
 *      reservation is an INSERT, so a racing creator of the same idempotency
 *      key makes the batch fail on the unique index and roll back, deduct
 *      included; a released one is flipped back to `reserved`;
 *   C  the ledger row, gated on B having written.
 *
 * The deduct, the reservation and the ledger row commit together or not at
 * all. A crash can no longer leave credits taken with no reservation to
 * release. Statement A matching no row (a concurrent deduct, a balance that
 * dropped) leaves the rest as no-ops and the caller re-reads and retries.
 */
export function buildReserveStatements(params: {
  userId: string;
  action: CreditAction;
  amount: number;
  /** Refuse the deduct (statement A matches nothing) while it would take this source's spend in the window over its limit. */
  spendLimit?: ReservationSpendLimit;
  credits: Pick<UserCredits, 'version'>;
  totalBefore: number;
  next: DeductionAllocation;
  reservationId: string;
  /** Set when a released reservation with this id is being reused instead of inserting a new row. */
  reuseReleasedId?: string;
  idempotencyKey: string;
  generationId: string | null;
  sessionId: string | null;
  ledgerSessionId: string | null;
  metadataJson: string;
  now: string;
}): SQL[] {
  const { userId, action, amount, next, now } = params;
  const totalAfter = next.monthly + next.rollover + next.addon;
  const statements: SQL[] = [
    sql`
      UPDATE user_credits
      SET monthly_credits = ${next.monthly},
          rollover_credits = ${next.rollover},
          addon_credits = ${next.addon},
          version = version + 1,
          updated_at = ${now}
      WHERE user_id = ${userId}
        AND version = ${params.credits.version}
        AND (monthly_credits + rollover_credits + addon_credits) >= ${amount}
        ${params.spendLimit
          ? sql`AND (
              SELECT COALESCE(SUM(amount), 0) FROM credit_reservations
              WHERE user_id = ${userId} AND reserved_at >= ${params.spendLimit.since}
                AND status IN ('reserved', 'captured')
                AND json_extract(metadata, '$.source') = ${params.spendLimit.source}
            ) + ${amount} <= ${params.spendLimit.limit}`
          : sql``}
    `,
  ];
  if (params.reuseReleasedId) {
    statements.push(sql`
      SELECT json(CASE
        WHEN (SELECT changes()) > 0 AND NOT EXISTS (
          SELECT 1 FROM credit_reservations
          WHERE id = ${params.reuseReleasedId} AND user_id = ${userId} AND status = 'released'
        ) THEN 'reservation no longer reusable' ELSE '{}' END)
    `);
    statements.push(sql`
      UPDATE credit_reservations
      SET generation_id = ${params.generationId}, session_id = ${params.sessionId},
          action = ${action.toLowerCase()}, amount = ${amount}, status = 'reserved',
          reserved_at = ${now}, captured_at = NULL, released_at = NULL, refunded_at = NULL,
          metadata = ${params.metadataJson}, updated_at = ${now}
      WHERE id = ${params.reuseReleasedId} AND user_id = ${userId} AND status = 'released'
        AND (SELECT changes()) > 0
    `);
  } else {
    statements.push(sql`
      INSERT INTO credit_reservations (
        id, user_id, generation_id, session_id, action, amount, status, reserved_at, idempotency_key, metadata, created_at, updated_at
      )
      SELECT ${params.reservationId}, ${userId}, ${params.generationId}, ${params.sessionId}, ${action.toLowerCase()}, ${amount},
             'reserved', ${now}, ${params.idempotencyKey}, ${params.metadataJson}, ${now}, ${now}
      WHERE (SELECT changes()) > 0
    `);
  }
  statements.push(sql`
    INSERT INTO credit_transactions (
      id, user_id, amount, transaction_type, transaction_kind, session_id, description, metadata, balance_before, balance_after, created_at
    )
    SELECT ${crypto.randomUUID()}, ${userId}, ${-amount}, ${action.toLowerCase()}, ${CREDIT_ACTION_KIND[action]}, ${params.ledgerSessionId},
           ${`Credit reservation for ${action}`}, ${JSON.stringify({ reservation_id: params.reuseReleasedId ?? params.reservationId })},
           ${params.totalBefore}, ${totalAfter}, ${now}
    WHERE (SELECT changes()) > 0
  `);
  return statements;
}

export async function reserveCredits(params: {
  userId: string;
  action: CreditAction;
  idempotencyKey: string;
  generationId?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
  /** Refuse the reservation when it would take this source over its limit in the window. Tags the reservation with the source. */
  spendLimit?: ReservationSpendLimit;
}): Promise<ReserveCreditResult> {
  const { userId, action, idempotencyKey, spendLimit } = params;
  const metadata = spendLimit ? { ...(params.metadata ?? {}), source: spendLimit.source } : (params.metadata ?? {});
  const amount = CREDIT_COSTS[action];
  const overLimit = async (): Promise<ReserveCreditResult | null> => {
    if (!spendLimit) return null;
    const spent = await reservedSpendSince(userId, spendLimit.source, spendLimit.since);
    if (spent + amount <= spendLimit.limit) return null;
    return {
      success: false,
      created: false,
      reservation: null,
      error: 'Daily spending limit reached',
      code: 'SPEND_LIMIT_REACHED',
      required: amount,
      spendLimit: { spent, limit: spendLimit.limit },
    };
  };
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
  let existing = await getReservationByKey(userId, idempotencyKey);
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

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_OCC_RETRIES; attempt++) {
    if (attempt > 0) {
      existing = await getReservationByKey(userId, idempotencyKey);
      if (existing && existing.status !== 'released') return replayResult(existing);
    }
    const { credits, error } = await getUserCredits(userId);
    if (error || !credits) {
      return { success: false, created: false, reservation: null, error: error?.message ?? 'Credits not found', available: 0, required: amount };
    }
    const totalBefore = getTotalCredits(credits);
    if (totalBefore < amount) {
      return {
        success: false,
        created: false,
        reservation: null,
        error: `Insufficient credits. Required: ${amount}, Available: ${totalBefore}`,
        available: totalBefore,
        required: amount,
      };
    }
    const limited = await overLimit();
    if (limited) return limited;
    const { next, remaining } = allocateDeduction(credits, amount);
    const id = crypto.randomUUID();
    const now = nowIso();
    const reservationMetadata = {
      ...metadata,
      reservation_attempt_id: id,
      remaining_after_reserve: next.monthly + next.rollover + next.addon,
      deducted_from: remaining,
    };
    const statements = buildReserveStatements({
      userId,
      action,
      amount,
      spendLimit,
      credits,
      totalBefore,
      next,
      reservationId: id,
      reuseReleasedId: existing?.status === 'released' ? existing.id : undefined,
      idempotencyKey,
      generationId: coerceUuidOrNull(params.generationId),
      sessionId: coerceUuidOrNull(params.sessionId),
      ledgerSessionId: params.sessionId ?? null,
      metadataJson: JSON.stringify(reservationMetadata),
      now,
    });

    let results;
    try {
      results = await runBatch(statements);
    } catch (batchError) {
      // The batch is atomic, so a failure means nothing was deducted. Look at
      // what is there before deciding what it was.
      const persisted = await getReservationByKey(userId, idempotencyKey);
      if (persisted && (persisted.metadata as Record<string, unknown>).reservation_attempt_id === id) {
        // The batch committed and only the response was lost: this call owns the held credits.
        return { success: true, created: true, reservation: persisted, error: null };
      }
      if (persisted && persisted.status !== 'released') {
        // Lost a race for this key (unique index, or the released row was reused first).
        return replayResult(persisted);
      }
      if (isUniqueViolation(batchError) || (persisted && existing?.status === 'released')) {
        lastError = batchError instanceof Error ? batchError : new Error(String(batchError));
        continue;
      }
      console.error('[credits] reservation batch failed, nothing was deducted:', batchError);
      return { success: false, created: false, reservation: null, error: 'Failed to create reservation', required: amount };
    }

    if (results[0].meta.changes > 0) {
      const reservation = await getReservationByKey(userId, idempotencyKey);
      return {
        success: Boolean(reservation),
        created: Boolean(reservation),
        reservation,
        error: reservation ? null : 'Failed to create reservation',
      };
    }
    // The deduct matched nothing: another deduct moved the version, or the
    // balance dropped under the amount. Re-read and try again.
    lastError = new Error('Credit reservation failed due to concurrent access. Please try again.');
    const raced = await getReservationByKey(userId, idempotencyKey);
    if (raced && raced.status !== 'released') return replayResult(raced);
  }
  throw lastError ?? new Error('Credit reservation failed due to concurrent access. Please try again.');
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

/** Where a reservation's credits came from. Without a recorded split they went to addon, like before. */
function reservationSplit(reservation: CreditReservation): DeductionAllocation {
  return extractDeductedFrom(reservation.metadata, reservation.amount)
    ?? { monthly: 0, rollover: 0, addon: reservation.amount };
}

const REFUND_BUCKETS = ['monthly', 'rollover', 'addon'] as const;
type RefundBucket = (typeof REFUND_BUCKETS)[number];

/**
 * The statements that put `split` back on the balance and write the ledger.
 *
 * They are built to run in ONE `runBatch` (a D1 transaction) straight after a
 * statement that claimed the right to refund. Each statement is gated on
 * `(SELECT changes()) > 0`, so when that claim matched no row (a lost race, a
 * replay) every following statement writes nothing. If any statement errors the
 * whole batch rolls back, claim included. That is the point: the reservation
 * state, the credit restore and the ledger rows commit together or not at all,
 * so a Worker dying between steps can no longer lose, or double, a refund.
 *
 * The ledger rows go in BEFORE the balance moves, each with a running
 * balance_before/balance_after read from user_credits inside the transaction,
 * so the trail always agrees with the balance it describes.
 *
 * The restore is one relative UPDATE (`col = col + n`) that also bumps
 * `user_credits.version`. That keeps the optimistic concurrency every deduct
 * relies on (a deduct holding the old version fails its WHERE and retries) and
 * means the restore itself never needs a retry loop.
 *
 * `claimGate` is the SQL fragment the FIRST ledger row waits on. The statement
 * that claimed the refund sits right before this one in the batch, so the
 * default is the chain gate; the reconciler passes a `NOT EXISTS (ledger row)`
 * gate instead because it has no claim statement.
 */
function buildRefundStatements(params: {
  userId: string;
  sessionId: string | null;
  split: DeductionAllocation;
  transactionType: string;
  describe: (bucket: RefundBucket) => string;
  metadata: (bucket: RefundBucket) => Record<string, unknown>;
  claimGate?: SQL;
  now: string;
}): SQL[] {
  const { userId, split, now } = params;
  const buckets = REFUND_BUCKETS.filter((bucket) => split[bucket] > 0);
  const statements: SQL[] = [];
  let priorTotal = 0;
  buckets.forEach((bucket, index) => {
    const amount = split[bucket];
    const gate = index === 0 && params.claimGate ? params.claimGate : sql`(SELECT changes()) > 0`;
    statements.push(sql`
      INSERT INTO credit_transactions (
        id, user_id, amount, transaction_type, transaction_kind, session_id, description, metadata, balance_before, balance_after, created_at
      )
      SELECT ${crypto.randomUUID()}, ${userId}, ${amount}, ${params.transactionType}, 'refund', ${params.sessionId},
             ${params.describe(bucket)}, ${JSON.stringify(params.metadata(bucket))},
             total_before + ${priorTotal}, total_before + ${priorTotal + amount}, ${now}
      FROM (
        SELECT monthly_credits + rollover_credits + addon_credits AS total_before
        FROM user_credits WHERE user_id = ${userId}
      )
      WHERE ${gate}
    `);
    priorTotal += amount;
  });
  if (buckets.length > 0) {
    statements.push(sql`
      UPDATE user_credits
      SET monthly_credits = monthly_credits + ${split.monthly},
          rollover_credits = rollover_credits + ${split.rollover},
          addon_credits = addon_credits + ${split.addon},
          version = version + 1,
          updated_at = ${now}
      WHERE user_id = ${userId} AND (SELECT changes()) > 0
    `);
  }
  return statements;
}

/** Same ledger row the old two-step release wrote, so reports and the reconciler agree on the shape. */
function releaseLedgerText(reservation: CreditReservation, reason?: string): string {
  return `Released reservation ${reservation.id}${reason ? `: ${reason}` : ''}`;
}

/**
 * The statements that release a reserved reservation: the status
 * compare-and-set, then the ledger rows and the balance restore. `chained`
 * says a statement earlier in the same batch gates this one (the claim then
 * also waits on `changes() > 0`); on its own it is gated only by the CAS.
 */
export function buildReleaseReservationStatements(
  reservation: CreditReservation,
  options: { reason?: string; chained?: boolean; now?: string } = {},
): SQL[] {
  const now = options.now ?? nowIso();
  const description = releaseLedgerText(reservation, options.reason);
  return [
    sql`
      UPDATE credit_reservations
      SET status = 'released', released_at = ${now}, updated_at = ${now}
      WHERE id = ${reservation.id} AND user_id = ${reservation.user_id} AND status = 'reserved'
        -- A reservation a live queued operation holds is that operation's to settle. Anyone else
        -- (a duplicate enqueue that adopted it, the stale sweeper) must not refund it from under it.
        AND NOT EXISTS (
          SELECT 1 FROM agent_operations o
          WHERE o.reservation_key = ${reservation.idempotency_key} AND o.status IN ('pending', 'running')
        )
        ${options.chained ? sql`AND (SELECT changes()) > 0` : sql``}
    `,
    ...buildRefundStatements({
      userId: reservation.user_id,
      sessionId: reservation.session_id,
      split: reservationSplit(reservation),
      transactionType: 'reservation_released',
      describe: () => description,
      metadata: (bucket) => ({ reservation_id: reservation.id, bucket }),
      now,
    }),
  ];
}

/** `reserved` to `captured`, the user got what they paid for. */
export function buildCaptureReservationStatement(
  reservation: Pick<CreditReservation, 'id' | 'user_id'>,
  options: { chained?: boolean; now?: string } = {},
): SQL {
  const now = options.now ?? nowIso();
  return sql`
    UPDATE credit_reservations
    SET status = 'captured', captured_at = ${now}, updated_at = ${now}
    WHERE id = ${reservation.id} AND user_id = ${reservation.user_id} AND status = 'reserved'
      ${options.chained ? sql`AND (SELECT changes()) > 0` : sql``}
  `;
}

export async function releaseReservation(params: {
  userId: string;
  idempotencyKey: string;
  reason?: string;
}): Promise<CaptureOrReleaseResult> {
  const { userId, idempotencyKey } = params;
  const existing = await getReservationByKey(userId, idempotencyKey);
  if (!existing) {
    return { success: false, reservation: null, error: 'Reservation not found' };
  }
  if (existing.status === 'released') {
    return { success: true, reservation: existing, error: null };
  }
  if (existing.status !== 'reserved') {
    return { success: false, reservation: existing, error: `Cannot transition from ${existing.status} to released` };
  }

  // One batch: the state transition (a compare-and-set on status, so only one
  // caller ever wins), the ledger rows and the balance restore.
  const results = await runBatch(buildReleaseReservationStatements(existing, { reason: params.reason }));
  const won = results[0].meta.changes > 0;
  const updated = await getReservationByKey(userId, idempotencyKey);
  if (!won) {
    // Lost the race. The winner issued the refund in its own batch.
    if (updated?.status === 'released') return { success: true, reservation: updated, error: null };
    return { success: false, reservation: updated, error: `Cannot transition from ${updated?.status ?? 'unknown'} to released` };
  }
  return { success: true, reservation: updated, error: null };
}

export interface PartialRefundResult {
  success: boolean;
  /** Credits this call put back. 0 when an earlier call already refunded. */
  refunded: number;
  alreadyRefunded: boolean;
  error: string | null;
}

/**
 * Give back part of a CAPTURED reservation, at most once per reservation.
 *
 * Used when a kit was delivered with some documents missing: the reservation
 * stays captured (the user got a kit) and the missing documents are refunded.
 * The once-only marker lives in the reservation's metadata, claimed with a
 * compare-and-set on `$.partial_refund_at IS NULL`. A second call, a retried
 * request or a race loses the CAS and refunds nothing.
 *
 * The amount is capped at what the reservation charged. Credits go back to
 * the buckets the reservation drew from, last-drawn first (addon, then
 * rollover, then monthly), which leaves the balance exactly as if only the
 * delivered part had been charged. A reservation without a recorded split is
 * refunded to addon, like releaseReservation.
 *
 * The marker claim, the ledger rows and the balance restore are one D1 batch
 * (see buildRefundStatements), so a crash can no longer land between the claim
 * and the credits. `reconcileCreditRefunds` still repairs rows an older
 * two-step run left half done.
 */
export interface PartialRefundPlan {
  /** What the caller asked for, capped at what the reservation charged. */
  amount: number;
  /** What the reservation's own buckets can actually give back. */
  paid: number;
  split: DeductionAllocation;
}

/** Last-drawn first: addon, then rollover, then monthly. */
export function planPartialRefund(reservation: CreditReservation, requested: number): PartialRefundPlan {
  const amount = Math.min(requested, reservation.amount);
  const drawn = reservationSplit(reservation);
  const split: DeductionAllocation = { monthly: 0, rollover: 0, addon: 0 };
  let remaining = amount;
  for (const bucket of ['addon', 'rollover', 'monthly'] as const) {
    const portion = Math.min(remaining, drawn[bucket]);
    split[bucket] = portion;
    remaining -= portion;
  }
  return { amount, paid: amount - remaining, split };
}

/**
 * The marker claim, the ledger rows and the balance restore of a partial
 * refund. `chained` gates the claim on the statement before it in the batch
 * (the capture, when a kit settles in one batch).
 */
export function buildPartialRefundStatements(
  reservation: CreditReservation,
  plan: PartialRefundPlan,
  reason: string,
  options: { chained?: boolean; now?: string } = {},
): SQL[] {
  const now = options.now ?? nowIso();
  const description = `Partial refund on reservation ${reservation.id}: ${reason}`;
  return [
    sql`
      UPDATE credit_reservations
      SET metadata = json_set(
            metadata,
            '$.partial_refund_at', ${now},
            '$.partial_refund_amount', ${plan.amount},
            '$.partial_refund_reason', ${reason},
            '$.partial_refund_paid', ${plan.paid}
          ),
          updated_at = ${now}
      WHERE id = ${reservation.id} AND user_id = ${reservation.user_id} AND status = 'captured'
        AND json_extract(metadata, '$.partial_refund_at') IS NULL
        ${options.chained ? sql`AND (SELECT changes()) > 0` : sql``}
    `,
    ...buildRefundStatements({
      userId: reservation.user_id,
      sessionId: reservation.session_id,
      split: plan.split,
      transactionType: 'reservation_partial_refund',
      describe: () => description,
      metadata: (bucket) => ({ reservation_id: reservation.id, bucket }),
      now,
    }),
  ];
}

export async function refundReservationPartially(params: {
  userId: string;
  idempotencyKey: string;
  amount: number;
  reason: string;
}): Promise<PartialRefundResult> {
  const { userId, idempotencyKey, reason } = params;
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    return { success: false, refunded: 0, alreadyRefunded: false, error: 'Refund amount must be positive' };
  }
  const reservation = await getReservationByKey(userId, idempotencyKey);
  if (!reservation) {
    return { success: false, refunded: 0, alreadyRefunded: false, error: 'Reservation not found' };
  }
  if (reservation.status !== 'captured') {
    return { success: false, refunded: 0, alreadyRefunded: false, error: `Cannot partially refund a ${reservation.status} reservation` };
  }
  const plan = planPartialRefund(reservation, params.amount);

  let results;
  try {
    results = await runBatch(buildPartialRefundStatements(reservation, plan, reason));
  } catch (error) {
    // The batch is atomic: nothing landed, the marker is not set, a retry can
    // still pay the whole refund. Report it instead of throwing into a request
    // that has already delivered the kit.
    console.error('[credits] partial refund batch failed, nothing was refunded:', reservation.id, error);
    return {
      success: false,
      refunded: 0,
      alreadyRefunded: false,
      error: error instanceof Error ? error.message : 'Partial refund failed',
    };
  }

  if (results[0].meta.changes === 0) {
    const current = await getReservationByKey(userId, idempotencyKey);
    const marker = current?.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata)
      ? (current.metadata as Record<string, unknown>).partial_refund_at
      : undefined;
    if (marker) return { success: true, refunded: 0, alreadyRefunded: true, error: null };
    return { success: false, refunded: 0, alreadyRefunded: false, error: 'Partial refund claim lost' };
  }
  // `paid` is less than `amount` only when the reservation drew less than the
  // caller asked to refund. The claim and the credits still landed together.
  return { success: true, refunded: plan.paid, alreadyRefunded: false, error: null };
}

/**
 * The reconciler only repairs refunds from this date on. Rows older than the
 * atomic release path were written by earlier code whose ledger wording this
 * module cannot vouch for, and "no ledger row found" on one of those must never
 * turn into a second refund. Anything older is an audit, not a sweep.
 */
const RECONCILE_REFUNDS_SINCE = '2026-10-20T00:00:00.000Z';

export interface ReconcileRefundsResult {
  /** Released reservations whose refund had never been written, now repaired. */
  releasedRepaired: number;
  /** Partial refunds that had claimed their marker but not paid in full, now completed. */
  partialRepaired: number;
  /** Rows that threw. They are retried by the next run. */
  failed: number;
}

/**
 * Repair refunds an interrupted run left half done.
 *
 * Since the release and partial-refund paths became single batches new rows
 * cannot end up half done, but rows from the old two-step code can: a
 * reservation marked `released` whose credits never came back, or a partial
 * refund whose marker was claimed before the credits moved. This finds them
 * and finishes the job.
 *
 * It is safe to run at any time and from several places at once. The repair
 * batch is gated on "no ledger row for this reservation yet" / on the paid
 * marker it is about to move, inside the same transaction as the credit
 * restore, so two runs, or a run racing a live release, refund at most once.
 */
export async function reconcileCreditRefunds(options: { limit?: number } = {}): Promise<ReconcileRefundsResult> {
  const limit = options.limit ?? 100;
  const db = await getDb();
  const result: ReconcileRefundsResult = { releasedRepaired: 0, partialRepaired: 0, failed: 0 };

  // 1. Released reservations with no refund ledger row.
  const released = await db
    .select()
    .from(creditReservations)
    .where(and(
      eq(creditReservations.status, 'released'),
      sql`${creditReservations.released_at} >= ${RECONCILE_REFUNDS_SINCE}`,
      sql`NOT EXISTS (
        SELECT 1 FROM credit_transactions t
        WHERE t.user_id = ${creditReservations.user_id}
          AND t.transaction_type = 'reservation_released'
          AND (json_extract(t.metadata, '$.reservation_id') = ${creditReservations.id}
            OR t.description LIKE 'Released reservation ' || ${creditReservations.id} || '%')
      )`,
    ))
    .orderBy(creditReservations.updated_at)
    .limit(limit) as CreditReservation[];

  for (const reservation of released) {
    try {
      const now = nowIso();
      const description = releaseLedgerText(reservation, 'refund repaired by reconciler');
      const batch = await runBatch(buildRefundStatements({
        userId: reservation.user_id,
        sessionId: reservation.session_id,
        split: reservationSplit(reservation),
        transactionType: 'reservation_released',
        describe: () => description,
        metadata: (bucket) => ({ reservation_id: reservation.id, bucket, repaired: true }),
        claimGate: sql`NOT EXISTS (
          SELECT 1 FROM credit_transactions t
          WHERE t.user_id = ${reservation.user_id}
            AND t.transaction_type = 'reservation_released'
            AND (json_extract(t.metadata, '$.reservation_id') = ${reservation.id}
              OR t.description LIKE ${`Released reservation ${reservation.id}%`})
        )`,
        now,
      }));
      if (batch[0] && batch[0].meta.changes > 0) result.releasedRepaired += 1;
    } catch (error) {
      result.failed += 1;
      console.error('[credits] could not repair released reservation refund:', reservation.id, error);
    }
  }

  // 2. Captured reservations whose partial refund claimed the marker but did
  //    not pay the whole amount.
  const partial = await db
    .select()
    .from(creditReservations)
    .where(and(
      eq(creditReservations.status, 'captured'),
      sql`json_extract(${creditReservations.metadata}, '$.partial_refund_at') >= ${RECONCILE_REFUNDS_SINCE}`,
      sql`COALESCE(json_extract(${creditReservations.metadata}, '$.partial_refund_paid'), -1)
          < json_extract(${creditReservations.metadata}, '$.partial_refund_amount')`,
    ))
    .orderBy(creditReservations.updated_at)
    .limit(limit) as CreditReservation[];

  for (const reservation of partial) {
    try {
      const meta = reservation.metadata as Record<string, unknown>;
      const owed = typeof meta.partial_refund_amount === 'number' ? meta.partial_refund_amount : 0;
      const recordedPaid = typeof meta.partial_refund_paid === 'number' ? meta.partial_refund_paid : null;
      // The ledger is the source of truth for what already reached the user.
      const ledger = await db
        .select({ total: sql<number>`COALESCE(SUM(${creditTransactions.amount}), 0)` })
        .from(creditTransactions)
        .where(and(
          eq(creditTransactions.user_id, reservation.user_id),
          eq(creditTransactions.transaction_type, 'reservation_partial_refund'),
          sql`(json_extract(${creditTransactions.metadata}, '$.reservation_id') = ${reservation.id}
            OR ${creditTransactions.description} LIKE ${`Partial refund on reservation ${reservation.id}%`})`,
        ));
      const ledgerPaid = Number(ledger[0]?.total ?? 0);
      const outstanding = Math.max(0, owed - Math.max(ledgerPaid, recordedPaid ?? 0));
      const drawn = reservationSplit(reservation);
      const split: DeductionAllocation = { monthly: 0, rollover: 0, addon: 0 };
      let remaining = outstanding;
      // Same last-drawn-first order as the live path.
      for (const bucket of ['addon', 'rollover', 'monthly'] as const) {
        const portion = Math.min(remaining, drawn[bucket]);
        split[bucket] = portion;
        remaining -= portion;
      }
      const now = nowIso();
      const description = `Partial refund on reservation ${reservation.id}: ${String(meta.partial_refund_reason ?? 'repaired by reconciler')}`;
      const batch = await runBatch([
        // Compare-and-set on the paid marker we read, so two repairs cannot both pay.
        sql`
          UPDATE credit_reservations
          SET metadata = json_set(metadata, '$.partial_refund_paid', ${owed}),
              updated_at = ${now}
          WHERE id = ${reservation.id} AND user_id = ${reservation.user_id} AND status = 'captured'
            AND COALESCE(json_extract(metadata, '$.partial_refund_paid'), -1) = ${recordedPaid ?? -1}
        `,
        ...buildRefundStatements({
          userId: reservation.user_id,
          sessionId: reservation.session_id,
          split,
          transactionType: 'reservation_partial_refund',
          describe: () => description,
          metadata: (bucket) => ({ reservation_id: reservation.id, bucket, repaired: true }),
          now,
        }),
      ]);
      if (batch[0] && batch[0].meta.changes > 0) result.partialRepaired += 1;
    } catch (error) {
      result.failed += 1;
      console.error('[credits] could not repair partial refund:', reservation.id, error);
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
    if (result.success) {
      released += 1;
      const metadata = row.metadata as Record<string, unknown>;
      const contextId = metadata.fit_context_id;
      const requestId = metadata.fit_continuation_request_id;
      if (
        row.action === 'generation_after_fit'
        && typeof contextId === 'string'
        && typeof requestId === 'string'
      ) {
        await releaseFitContinuationClaim(row.user_id, contextId, requestId);
      }
    }
  }
  return { released };
}
