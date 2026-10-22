/**
 * Input budget for Claude Haiku 5.5 calls. Every request stays under the 100k-token price tier.
 *
 * Total input = input_tokens + cache_read + cache_creation (cached tokens count toward the tier).
 * Counting: a local estimate of ceil(chars / 1.8) over system + tools + messages. Below
 * COUNT_TOKENS_ABOVE it is trusted. Above it the exact number comes from messages.countTokens
 * (free, one extra round trip, only in this grey zone). 1.8 is the worst measured chars/token
 * (German CVs; English sits near 3.0, so the estimate over-counts English and the exact count
 * decides). See evals/results/2026-10-22-haiku-55-swap.md.
 *
 * Truncation never happens here. Call sites shrink their own input with visible markers; this module
 * only measures and refuses.
 */

/** Worst measured characters per token (German CVs 1.86 to 2.05). */
export const CHARS_PER_TOKEN = 1.8;
/** Above this local estimate, ask the API for the exact count. */
export const COUNT_TOKENS_ABOVE = 60_000;
/** callHaiku refuses to send a request whose total input is above this. Call sites target it too. */
export const INPUT_REFUSE_ABOVE = 90_000;
/** Hard ceiling. An exact total at or above it is over budget whatever the call site did. */
export const INPUT_HARD_LIMIT = 95_000;

/** ceil(chars / 1.8). */
export function estimateTokensFromChars(chars: number): number {
  if (!Number.isFinite(chars) || chars < 0) throw new Error(`estimateTokensFromChars: invalid length ${chars}`);
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

function serializedLength(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value === 'string') return value.length;
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error('estimateInputTokens: value is not JSON serializable');
  return json.length;
}

/** Local estimate for any JSON-serializable value (a block, a message, a tool result). */
export function estimateTokens(value: unknown): number {
  return estimateTokensFromChars(serializedLength(value));
}

export interface BudgetRequestParts {
  system?: unknown;
  tools?: unknown;
  messages: unknown;
}

/** Local estimate for a whole request: system + tools JSON + messages. */
export function estimateInputTokens(parts: BudgetRequestParts): number {
  return estimateTokensFromChars(
    serializedLength(parts.system) + serializedLength(parts.tools) + serializedLength(parts.messages),
  );
}

/**
 * The next tool-loop round, with no extra call: the previous round's exact total plus the estimate of
 * what was appended since (the assistant's rawContent and the tool results). Chat pre-checks with this
 * and compares to INPUT_REFUSE_ABOVE.
 */
export function projectNextInputTokens(previousInputTokensTotal: number, appended: unknown[]): number {
  if (!Number.isInteger(previousInputTokensTotal) || previousInputTokensTotal < 0) {
    throw new Error(`projectNextInputTokens: invalid previous total ${previousInputTokensTotal}`);
  }
  return previousInputTokensTotal + appended.reduce<number>((sum, block) => sum + estimateTokens(block), 0);
}

export function isOverRefuseLimit(totalTokens: number): boolean {
  return totalTokens > INPUT_REFUSE_ABOVE;
}

export function isOverHardLimit(totalTokens: number): boolean {
  return totalTokens >= INPUT_HARD_LIMIT;
}

export interface InputBudgetCheck {
  estimatedTokens: number;
  /** Set when the estimate was over COUNT_TOKENS_ABOVE and the API counted. */
  exactTokens: number | null;
  /** The number to compare to the limits: exact when counted, else the estimate. */
  totalTokens: number;
}

/**
 * Measure a request. `countExact` is only called when the estimate is over COUNT_TOKENS_ABOVE; a
 * failure there propagates (a budget that could not be checked must not read as "fine").
 */
export async function measureInputBudget(
  parts: BudgetRequestParts,
  countExact: () => Promise<number>,
): Promise<InputBudgetCheck> {
  const estimatedTokens = estimateInputTokens(parts);
  if (estimatedTokens <= COUNT_TOKENS_ABOVE) {
    return { estimatedTokens, exactTokens: null, totalTokens: estimatedTokens };
  }
  const exactTokens = await countExact();
  if (!Number.isInteger(exactTokens) || exactTokens < 0) {
    throw new Error(`count_tokens returned an invalid count: ${exactTokens}`);
  }
  return { estimatedTokens, exactTokens, totalTokens: exactTokens };
}
