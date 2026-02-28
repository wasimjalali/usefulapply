import { checkCreditBalance, deductCredits, CreditAction, CREDIT_COSTS } from '../supabase/credits';

export { CREDIT_COSTS };

export interface CreditCheckResult {
  success: boolean;
  error: string | null;
  remainingCredits: number;
  required: number;
  planTier: string;
  upgradeRequired: boolean;
}

/**
 * Check if user has enough credits and deduct if they do
 * Use this in API routes before processing requests
 */
export async function checkAndDeductCredits(
  userId: string,
  action: CreditAction,
  sessionId?: string,
  supabaseClient?: any
): Promise<CreditCheckResult> {
  // Check balance first
  const balanceCheck = await checkCreditBalance(userId, action, supabaseClient);

  if (balanceCheck.error) {
    return {
      success: false,
      error: balanceCheck.error.message,
      remainingCredits: 0,
      required: balanceCheck.required,
      planTier: 'free',
      upgradeRequired: true,
    };
  }

  if (!balanceCheck.hasEnough) {
    return {
      success: false,
      error: `Insufficient credits. Required: ${balanceCheck.required}, Available: ${balanceCheck.available}`,
      remainingCredits: balanceCheck.available,
      required: balanceCheck.required,
      planTier: balanceCheck.planTier,
      upgradeRequired: true,
    };
  }

  // Deduct credits
  const deductResult = await deductCredits(userId, action, {
    sessionId,
    description: `${action} credit deduction`,
    supabaseClient,
  });

  if (!deductResult.success) {
    return {
      success: false,
      error: deductResult.error?.message || 'Failed to deduct credits',
      remainingCredits: balanceCheck.available,
      required: balanceCheck.required,
      planTier: balanceCheck.planTier,
      upgradeRequired: false,
    };
  }

  return {
    success: true,
    error: null,
    remainingCredits: deductResult.remainingCredits,
    required: balanceCheck.required,
    planTier: balanceCheck.planTier,
    upgradeRequired: false,
  };
}

/**
 * Check credits without deducting (for UI display)
 */
export async function checkCreditsOnly(
  userId: string,
  action: CreditAction
): Promise<{
  canProceed: boolean;
  available: number;
  required: number;
  planTier: string;
}> {
  const balanceCheck = await checkCreditBalance(userId, action);

  return {
    canProceed: balanceCheck.hasEnough,
    available: balanceCheck.available,
    required: balanceCheck.required,
    planTier: balanceCheck.planTier,
  };
}

/**
 * Get credit cost for an action
 */
export function getCreditCost(action: CreditAction): number {
  return CREDIT_COSTS[action];
}

/**
 * Format credit error response for API
 */
export function formatCreditErrorResponse(result: CreditCheckResult) {
  return {
    error: result.error,
    code: 'INSUFFICIENT_CREDITS',
    details: {
      required: result.required,
      available: result.remainingCredits,
      planTier: result.planTier,
      upgradeRequired: result.upgradeRequired,
    },
    message: result.upgradeRequired
      ? `You need ${result.required} credits but only have ${result.remainingCredits}. Please upgrade your plan or purchase add-on credits.`
      : result.error,
  };
}
