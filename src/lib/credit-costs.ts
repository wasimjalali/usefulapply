export const CREDIT_COSTS = {
  FULL_APPLICATION: 2.0,
  GENERATION_AFTER_FIT: 1.5,
  FIT_ANALYSIS: 0.5,
  CV_OPTIMIZATION: 1,
  COVER_LETTER_REGEN: 0.5,
  EMAIL_REGEN: 0.5,
  FOLLOW_UP_REGEN: 0.5,
  /** One section of an already-tailored CV. Priced with the other single-document rewrites, approved 2026-08-21. */
  CV_SECTION_REWRITE: 0.5,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

/**
 * The bucket a ledger row belongs to, written into
 * `credit_transactions.transaction_kind` at insert.
 *
 * `transaction_type` stays free text and keeps naming the exact action. This
 * set is closed, so the usage breakdown reads a value the writer chose rather
 * than guessing from a string it has never seen. Adding a credit action means
 * adding it to CREDIT_ACTION_KIND below, which the compiler insists on.
 */
export const CREDIT_TRANSACTION_KINDS = ['fit', 'kit', 'rewrite', 'grant', 'refund'] as const;
export type CreditTransactionKind = (typeof CREDIT_TRANSACTION_KINDS)[number];

export const CREDIT_ACTION_KIND: Record<CreditAction, CreditTransactionKind> = {
  FULL_APPLICATION: 'kit',
  GENERATION_AFTER_FIT: 'kit',
  FIT_ANALYSIS: 'fit',
  CV_OPTIMIZATION: 'rewrite',
  COVER_LETTER_REGEN: 'rewrite',
  EMAIL_REGEN: 'rewrite',
  FOLLOW_UP_REGEN: 'rewrite',
  CV_SECTION_REWRITE: 'rewrite',
};

/**
 * Rows written before the column existed carry a null kind, so they are read
 * back through the free-text type. Measured on the live ledger: 643 rows across
 * nine types, one of them `full_generation`, a retired name for a kit that the
 * old else-branch counted as a rewrite.
 */
const LEGACY_TYPE_KIND: Record<string, CreditTransactionKind> = {
  fit_analysis: 'fit',
  full_application: 'kit',
  generation_after_fit: 'kit',
  full_generation: 'kit',
  cv_optimization: 'rewrite',
  cover_letter_regen: 'rewrite',
  email_regen: 'rewrite',
  follow_up_regen: 'rewrite',
  monthly_reset: 'grant',
  plan_upgrade: 'grant',
  addon_purchase: 'grant',
  refund: 'refund',
};

function isCreditTransactionKind(value: unknown): value is CreditTransactionKind {
  return typeof value === 'string' && (CREDIT_TRANSACTION_KINDS as readonly string[]).includes(value);
}

/**
 * The kind of one ledger row. Prefers the stored kind, falls back to the type
 * for older rows, and returns null when neither is recognised so a caller can
 * leave an unknown row out of a count instead of inventing a bucket for it.
 */
export function creditTransactionKind(row: {
  transaction_kind?: string | null;
  transaction_type?: string | null;
}): CreditTransactionKind | null {
  if (isCreditTransactionKind(row.transaction_kind)) return row.transaction_kind;
  const legacy = row.transaction_type ? LEGACY_TYPE_KIND[row.transaction_type] : undefined;
  return legacy ?? null;
}

export function getTotalCredits(credits: {
  monthly_credits: number;
  rollover_credits: number;
  addon_credits: number;
}): number {
  return credits.monthly_credits + credits.rollover_credits + credits.addon_credits;
}
