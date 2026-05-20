/**
 * Server-only credit mutation functions.
 *
 * These functions write to `user_credits` and `credit_transactions` using
 * the Supabase service-role client, which bypasses RLS. They must never be
 * reachable from a client bundle: the browser anon key + the row-owner RLS
 * policies on user_credits would let a malicious authenticated user
 * self-credit. See migration 202605200002_codify_core_table_rls.sql for
 * the matching RLS posture and follow-up plan.
 *
 * The runtime guard below throws at module load if this file is ever
 * pulled into a client bundle.
 */

if (typeof window !== 'undefined') {
  throw new Error(
    "credits.server.ts must not be imported on the client. " +
    "Use src/lib/supabase/credits.ts for reads and import this file only " +
    "from server-side code (API routes, middleware, server actions, Inngest).",
  );
}

import { createAdminClient } from './admin';
import {
  getUserCredits,
  getTotalCredits,
  getSubscriptionPlan,
  logCreditTransaction,
} from './credits';
import type { AddonCreditPack } from './credits';

/**
 * Upgrade user's plan to Plus or Max.
 *
 * Adds the new tier's monthly credits to the user's existing balance and
 * updates plan_tier. Called from the Stripe webhook handler when a
 * subscription is created or upgraded.
 */
export async function upgradePlan(
  userId: string,
  newTier: 'plus' | 'max',
): Promise<{ success: boolean; error: Error | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const { plan, error: planError } = await getSubscriptionPlan(newTier);
  if (planError || !plan) {
    return { success: false, error: planError || new Error('Plan not found') };
  }

  const { credits, error: creditsError } = await getUserCredits(userId, supabase);
  if (creditsError || !credits) {
    return { success: false, error: creditsError || new Error('Credits not found') };
  }

  const totalBefore = getTotalCredits(credits);
  const creditsToAdd = plan.credits_monthly;

  const { error: updateError } = await supabase
    .from('user_credits')
    .update({
      plan_tier: newTier,
      monthly_credits: credits.monthly_credits + creditsToAdd,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('Error upgrading plan:', updateError);
    return { success: false, error: new Error(updateError.message) };
  }

  await logCreditTransaction(
    userId,
    creditsToAdd,
    'plan_upgrade',
    {
      description: `Upgraded to ${plan.name} plan`,
      balanceBefore: totalBefore,
      balanceAfter: totalBefore + creditsToAdd,
      metadata: { newTier, planName: plan.name },
    },
    supabase,
  );

  return { success: true, error: null };
}

/**
 * Process monthly credit reset.
 *
 * Sets monthly_credits to the plan's allowance, rolls over any unused
 * monthly_credits into rollover_credits (capped at plan.max_rollover_credits),
 * and bumps last_reset_date / next_reset_date. Called from the Stripe webhook
 * handler on invoice.payment_succeeded for subscription renewals, and from
 * the monthly reset cron.
 */
export async function processMonthlyReset(userId: string): Promise<{
  success: boolean;
  error: Error | null;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const { credits, error: creditsError } = await getUserCredits(userId, supabase);
  if (creditsError || !credits) {
    return { success: false, error: creditsError || new Error('Credits not found') };
  }

  const { plan, error: planError } = await getSubscriptionPlan(credits.plan_tier);
  if (planError || !plan) {
    return { success: false, error: planError || new Error('Plan not found') };
  }

  const totalBefore = getTotalCredits(credits);

  let newRollover = credits.rollover_credits + credits.monthly_credits;
  if (plan.max_rollover_credits > 0) {
    newRollover = Math.min(newRollover, plan.max_rollover_credits);
  } else {
    newRollover = 0;
  }

  const nextReset = new Date();
  nextReset.setMonth(nextReset.getMonth() + 1);

  const { error: updateError } = await supabase
    .from('user_credits')
    .update({
      monthly_credits: plan.credits_monthly,
      rollover_credits: newRollover,
      last_reset_date: new Date().toISOString(),
      next_reset_date: nextReset.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('Error processing monthly reset:', updateError);
    return { success: false, error: new Error(updateError.message) };
  }

  const totalAfter = plan.credits_monthly + newRollover + credits.addon_credits;

  await logCreditTransaction(
    userId,
    plan.credits_monthly,
    'monthly_reset',
    {
      description: `Monthly credit reset for ${plan.name} plan`,
      balanceBefore: totalBefore,
      balanceAfter: totalAfter,
      metadata: { rolloverApplied: newRollover },
    },
    supabase,
  );

  return { success: true, error: null };
}

/**
 * Process an addon credit-pack purchase.
 *
 * Looks up the pack, validates the user is on a plan that allows addons,
 * then credits the addon bucket via addCredits (which uses optimistic
 * concurrency). Called from the Stripe webhook handler on addon checkout.
 */
export async function processAddonPurchase(
  userId: string,
  packId: string,
): Promise<{ success: boolean; creditsAdded: number; error: Error | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const { data: pack, error: packError } = await supabase
    .from('addon_credit_packs')
    .select('*')
    .eq('id', packId)
    .eq('active', true)
    .single();

  if (packError || !pack) {
    return { success: false, creditsAdded: 0, error: new Error('Pack not found') };
  }

  const { credits, error: creditsError } = await getUserCredits(userId, supabase);
  if (creditsError || !credits) {
    return { success: false, creditsAdded: 0, error: creditsError || new Error('Credits not found') };
  }

  if (credits.plan_tier === 'free') {
    return { success: false, creditsAdded: 0, error: new Error('Add-ons not available for Free plan') };
  }

  // Import addCredits lazily to avoid a circular-import warning between
  // credits.server.ts and credits.ts at module-load time.
  const { addCredits } = await import('./credits');
  const typedPack = pack as AddonCreditPack;
  const { success, error } = await addCredits(
    userId,
    typedPack.credits,
    'addon',
    'addon_purchase',
    `Purchased ${typedPack.name} (${typedPack.credits} credits)`,
    supabase,
  );

  if (!success) {
    return { success: false, creditsAdded: 0, error };
  }

  return { success: true, creditsAdded: typedPack.credits, error: null };
}
