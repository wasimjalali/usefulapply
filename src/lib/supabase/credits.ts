import { getSupabase } from './client';

// Get untyped supabase client for tables not in generated types
const getUntypedSupabase = () => getSupabase() as any;

// Allow passing a custom supabase client (for server-side usage)
let serverSupabaseClient: any = null;

export function setServerSupabaseClient(client: any) {
  serverSupabaseClient = client;
}

export function clearServerSupabaseClient() {
  serverSupabaseClient = null;
}

const getSupabaseClient = () => serverSupabaseClient || getUntypedSupabase();

// =====================================================
// TYPES
// =====================================================

export interface UserCredits {
  id: string;
  user_id: string;
  monthly_credits: number;
  rollover_credits: number;
  addon_credits: number;
  plan_tier: 'starter' | 'plus' | 'pro';
  last_reset_date: string;
  next_reset_date: string;
  created_at: string;
  updated_at: string;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  transaction_type: string;
  session_id?: string;
  description?: string;
  metadata?: Record<string, any>;
  balance_before: number;
  balance_after: number;
  created_at: string;
}

export interface SubscriptionPlan {
  id: string;
  tier: 'starter' | 'plus' | 'pro';
  name: string;
  description?: string;
  price_monthly: number;
  credits_monthly: number;
  rollover_months: number;
  max_rollover_credits: number;
  addon_enabled: boolean;
  stripe_product_id?: string;
  stripe_price_id_monthly?: string;
  active: boolean;
  display_order: number;
}

export interface AddonCreditPack {
  id: string;
  name: string;
  credits: number;
  price: number;
  discount_percent: number;
  stripe_product_id?: string;
  stripe_price_id?: string;
  active: boolean;
  display_order: number;
}

// =====================================================
// CREDIT COSTS
// =====================================================

export const CREDIT_COSTS = {
  FULL_APPLICATION: 2,      // CV + Cover Letter + Email
  CV_OPTIMIZATION: 1,       // CV only
  COVER_LETTER_REGEN: 1,    // Cover letter regeneration
  EMAIL_REGEN: 1,           // Email regeneration
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

// =====================================================
// SUBSCRIPTION PLANS
// =====================================================

/**
 * Get all active subscription plans
 */
export async function getSubscriptionPlans(): Promise<{ plans: SubscriptionPlan[]; error: Error | null }> {
  const supabase = getUntypedSupabase();

  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching subscription plans:', error);
    return { plans: [], error: new Error(error.message) };
  }

  return { plans: data as SubscriptionPlan[], error: null };
}

/**
 * Get a specific subscription plan by tier
 */
export async function getSubscriptionPlan(tier: string): Promise<{ plan: SubscriptionPlan | null; error: Error | null }> {
  const supabase = getUntypedSupabase();

  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('tier', tier)
    .eq('active', true)
    .single();

  if (error) {
    console.error('Error fetching subscription plan:', error);
    return { plan: null, error: new Error(error.message) };
  }

  return { plan: data as SubscriptionPlan, error: null };
}

// =====================================================
// ADD-ON CREDIT PACKS
// =====================================================

/**
 * Get all active add-on credit packs
 */
export async function getAddonCreditPacks(): Promise<{ packs: AddonCreditPack[]; error: Error | null }> {
  const supabase = getUntypedSupabase();

  const { data, error } = await supabase
    .from('addon_credit_packs')
    .select('*')
    .eq('active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching addon credit packs:', error);
    return { packs: [], error: new Error(error.message) };
  }

  return { packs: data as AddonCreditPack[], error: null };
}

// =====================================================
// USER CREDITS
// =====================================================

/**
 * Get user's credit balance
 */
export async function getUserCredits(userId: string): Promise<{ credits: UserCredits | null; error: Error | null }> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No credits record - initialize with starter plan
      return await initializeUserCredits(userId);
    }
    console.error('Error fetching user credits:', error);
    return { credits: null, error: new Error(error.message) };
  }

  return { credits: data as UserCredits, error: null };
}

/**
 * Initialize credits for new user (starter plan)
 */
async function initializeUserCredits(userId: string): Promise<{ credits: UserCredits | null; error: Error | null }> {
  const supabase = getSupabaseClient();

  const nextReset = new Date();
  nextReset.setMonth(nextReset.getMonth() + 1);

  const { data, error } = await supabase
    .from('user_credits')
    .insert({
      user_id: userId,
      monthly_credits: 10, // Starter plan credits (5 applications at 2 credits each)
      rollover_credits: 0,
      addon_credits: 0,
      plan_tier: 'starter',
      next_reset_date: nextReset.toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error initializing user credits:', error);
    return { credits: null, error: new Error(error.message) };
  }

  // Log the initial credit grant
  await logCreditTransaction(userId, 50, 'monthly_reset', {
    description: 'Initial starter plan credits',
    balanceBefore: 0,
    balanceAfter: 50,
  });

  return { credits: data as UserCredits, error: null };
}

/**
 * Get total credits (computed)
 */
export function getTotalCredits(credits: UserCredits): number {
  return credits.monthly_credits + credits.rollover_credits + credits.addon_credits;
}

/**
 * Check if user has enough credits for an action
 */
export async function hasEnoughCredits(userId: string, action: CreditAction): Promise<boolean> {
  const { credits, error } = await getUserCredits(userId);

  if (error || !credits) return false;

  const requiredCredits = CREDIT_COSTS[action];
  const totalCredits = getTotalCredits(credits);

  return totalCredits >= requiredCredits;
}

/**
 * Check credit balance and return details
 */
export async function checkCreditBalance(
  userId: string,
  action: CreditAction
): Promise<{
  hasEnough: boolean;
  required: number;
  available: number;
  planTier: string;
  error: Error | null;
}> {
  const { credits, error } = await getUserCredits(userId);

  if (error || !credits) {
    return {
      hasEnough: false,
      required: CREDIT_COSTS[action],
      available: 0,
      planTier: 'starter',
      error: error || new Error('Credits not found'),
    };
  }

  const required = CREDIT_COSTS[action];
  const available = getTotalCredits(credits);

  return {
    hasEnough: available >= required,
    required,
    available,
    planTier: credits.plan_tier,
    error: null,
  };
}

// =====================================================
// CREDIT DEDUCTION
// =====================================================

/**
 * Deduct credits from user balance
 * Order: monthly → rollover → addon
 */
export async function deductCredits(
  userId: string,
  action: CreditAction,
  options?: {
    sessionId?: string;
    description?: string;
  }
): Promise<{
  success: boolean;
  remainingCredits: number;
  error: Error | null;
}> {
  const supabase = getSupabaseClient();
  const amount = CREDIT_COSTS[action];

  // Get current credits
  const { credits, error: fetchError } = await getUserCredits(userId);
  if (fetchError || !credits) {
    return {
      success: false,
      remainingCredits: 0,
      error: fetchError || new Error('Credits not found'),
    };
  }

  const totalBefore = getTotalCredits(credits);

  // Check sufficient balance
  if (totalBefore < amount) {
    return {
      success: false,
      remainingCredits: totalBefore,
      error: new Error(`Insufficient credits. Required: ${amount}, Available: ${totalBefore}`),
    };
  }

  // Calculate new balances (deduct in order: monthly → rollover → addon)
  let remaining = amount;
  let newMonthly = credits.monthly_credits;
  let newRollover = credits.rollover_credits;
  let newAddon = credits.addon_credits;

  // Deduct from monthly first
  if (remaining > 0 && newMonthly > 0) {
    const deduct = Math.min(remaining, newMonthly);
    newMonthly -= deduct;
    remaining -= deduct;
  }

  // Then from rollover
  if (remaining > 0 && newRollover > 0) {
    const deduct = Math.min(remaining, newRollover);
    newRollover -= deduct;
    remaining -= deduct;
  }

  // Finally from addon
  if (remaining > 0 && newAddon > 0) {
    const deduct = Math.min(remaining, newAddon);
    newAddon -= deduct;
    remaining -= deduct;
  }

  // Update credits in database
  const { error: updateError } = await supabase
    .from('user_credits')
    .update({
      monthly_credits: newMonthly,
      rollover_credits: newRollover,
      addon_credits: newAddon,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('Error updating credits:', updateError);
    return {
      success: false,
      remainingCredits: totalBefore,
      error: new Error(updateError.message),
    };
  }

  const totalAfter = newMonthly + newRollover + newAddon;

  // Log transaction
  await logCreditTransaction(userId, -amount, action.toLowerCase(), {
    sessionId: options?.sessionId,
    description: options?.description || `${action} credit deduction`,
    balanceBefore: totalBefore,
    balanceAfter: totalAfter,
  });

  return {
    success: true,
    remainingCredits: totalAfter,
    error: null,
  };
}

// =====================================================
// CREDIT ADDITION
// =====================================================

/**
 * Add credits to user balance
 */
export async function addCredits(
  userId: string,
  amount: number,
  creditType: 'monthly' | 'rollover' | 'addon',
  transactionType: string,
  description?: string
): Promise<{
  success: boolean;
  newBalance: number;
  error: Error | null;
}> {
  const supabase = getUntypedSupabase();

  // Get current credits
  const { credits, error: fetchError } = await getUserCredits(userId);
  if (fetchError || !credits) {
    return {
      success: false,
      newBalance: 0,
      error: fetchError || new Error('Credits not found'),
    };
  }

  const totalBefore = getTotalCredits(credits);

  // Determine which field to update
  const updateField = creditType === 'monthly'
    ? 'monthly_credits'
    : creditType === 'rollover'
      ? 'rollover_credits'
      : 'addon_credits';

  const currentValue = creditType === 'monthly'
    ? credits.monthly_credits
    : creditType === 'rollover'
      ? credits.rollover_credits
      : credits.addon_credits;

  // Update credits
  const { error: updateError } = await supabase
    .from('user_credits')
    .update({
      [updateField]: currentValue + amount,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('Error adding credits:', updateError);
    return {
      success: false,
      newBalance: totalBefore,
      error: new Error(updateError.message),
    };
  }

  const totalAfter = totalBefore + amount;

  // Log transaction
  await logCreditTransaction(userId, amount, transactionType, {
    description: description || `${transactionType} credit addition`,
    balanceBefore: totalBefore,
    balanceAfter: totalAfter,
  });

  return {
    success: true,
    newBalance: totalAfter,
    error: null,
  };
}

// =====================================================
// PLAN MANAGEMENT
// =====================================================

/**
 * Upgrade user's plan
 */
export async function upgradePlan(
  userId: string,
  newTier: 'plus' | 'pro'
): Promise<{
  success: boolean;
  error: Error | null;
}> {
  const supabase = getUntypedSupabase();

  // Get the new plan details
  const { plan, error: planError } = await getSubscriptionPlan(newTier);
  if (planError || !plan) {
    return { success: false, error: planError || new Error('Plan not found') };
  }

  // Get current credits
  const { credits, error: creditsError } = await getUserCredits(userId);
  if (creditsError || !credits) {
    return { success: false, error: creditsError || new Error('Credits not found') };
  }

  const totalBefore = getTotalCredits(credits);

  // Calculate new credits (add the difference or full amount if upgrading)
  const creditsToAdd = plan.credits_monthly;

  // Update user credits with new plan
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

  // Log transaction
  await logCreditTransaction(userId, creditsToAdd, 'plan_upgrade', {
    description: `Upgraded to ${plan.name} plan`,
    balanceBefore: totalBefore,
    balanceAfter: totalBefore + creditsToAdd,
    metadata: { newTier, planName: plan.name },
  });

  return { success: true, error: null };
}

/**
 * Process monthly credit reset (called by cron/webhook)
 */
export async function processMonthlyReset(userId: string): Promise<{
  success: boolean;
  error: Error | null;
}> {
  const supabase = getUntypedSupabase();

  // Get current credits and plan
  const { credits, error: creditsError } = await getUserCredits(userId);
  if (creditsError || !credits) {
    return { success: false, error: creditsError || new Error('Credits not found') };
  }

  const { plan, error: planError } = await getSubscriptionPlan(credits.plan_tier);
  if (planError || !plan) {
    return { success: false, error: planError || new Error('Plan not found') };
  }

  const totalBefore = getTotalCredits(credits);

  // Calculate rollover (unused monthly credits)
  let newRollover = credits.rollover_credits + credits.monthly_credits;

  // Apply rollover limit
  if (plan.max_rollover_credits > 0) {
    newRollover = Math.min(newRollover, plan.max_rollover_credits);
  } else {
    newRollover = 0; // No rollover for starter
  }

  // Calculate next reset date
  const nextReset = new Date();
  nextReset.setMonth(nextReset.getMonth() + 1);

  // Update credits
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

  // Log transaction
  await logCreditTransaction(userId, plan.credits_monthly, 'monthly_reset', {
    description: `Monthly credit reset for ${plan.name} plan`,
    balanceBefore: totalBefore,
    balanceAfter: totalAfter,
    metadata: { rolloverApplied: newRollover },
  });

  return { success: true, error: null };
}

// =====================================================
// TRANSACTION LOGGING
// =====================================================

/**
 * Log a credit transaction
 */
async function logCreditTransaction(
  userId: string,
  amount: number,
  transactionType: string,
  options: {
    sessionId?: string;
    description?: string;
    balanceBefore: number;
    balanceAfter: number;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount,
    transaction_type: transactionType,
    session_id: options.sessionId,
    description: options.description,
    metadata: options.metadata || {},
    balance_before: options.balanceBefore,
    balance_after: options.balanceAfter,
  });

  if (error) {
    console.error('Error logging credit transaction:', error);
  }
}

/**
 * Get credit transaction history
 */
export async function getCreditTransactions(
  userId: string,
  limit: number = 50
): Promise<{ transactions: CreditTransaction[]; error: Error | null }> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching credit transactions:', error);
    return { transactions: [], error: new Error(error.message) };
  }

  return { transactions: data as CreditTransaction[], error: null };
}

// =====================================================
// ADD-ON PURCHASE
// =====================================================

/**
 * Process add-on credit purchase
 */
export async function processAddonPurchase(
  userId: string,
  packId: string
): Promise<{
  success: boolean;
  creditsAdded: number;
  error: Error | null;
}> {
  const supabase = getUntypedSupabase();

  // Get the pack details
  const { data: pack, error: packError } = await supabase
    .from('addon_credit_packs')
    .select('*')
    .eq('id', packId)
    .eq('active', true)
    .single();

  if (packError || !pack) {
    return { success: false, creditsAdded: 0, error: new Error('Pack not found') };
  }

  // Check if user is on a plan that allows add-ons
  const { credits, error: creditsError } = await getUserCredits(userId);
  if (creditsError || !credits) {
    return { success: false, creditsAdded: 0, error: creditsError || new Error('Credits not found') };
  }

  if (credits.plan_tier === 'starter') {
    return { success: false, creditsAdded: 0, error: new Error('Add-ons not available for Starter plan') };
  }

  // Add credits
  const { success, error } = await addCredits(
    userId,
    pack.credits,
    'addon',
    'addon_purchase',
    `Purchased ${pack.name} (${pack.credits} credits)`
  );

  if (!success) {
    return { success: false, creditsAdded: 0, error };
  }

  return { success: true, creditsAdded: pack.credits, error: null };
}
