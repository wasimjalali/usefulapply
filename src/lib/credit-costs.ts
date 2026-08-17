export const CREDIT_COSTS = {
  FULL_APPLICATION: 2.0,
  GENERATION_AFTER_FIT: 1.5,
  FIT_ANALYSIS: 0.5,
  CV_OPTIMIZATION: 1,
  COVER_LETTER_REGEN: 0.5,
  EMAIL_REGEN: 0.5,
  FOLLOW_UP_REGEN: 0.5,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

export function getTotalCredits(credits: {
  monthly_credits: number;
  rollover_credits: number;
  addon_credits: number;
}): number {
  return credits.monthly_credits + credits.rollover_credits + credits.addon_credits;
}
