/**
 * Input budget for Claude Haiku 5.5 calls. Every request stays under the 100k-token price tier.
 *
 * Total input = input_tokens + cache_read + cache_creation (cached tokens count toward the tier).
 * Counting: a local estimate over system + tools + messages: ceil(chars / 1.8) for Latin, Greek and Cyrillic
 * text, digits and punctuation, and one token per character for every other script (Chinese, Japanese, Korean,
 * Thai, Arabic and so on, which tokenize at about one character per token or worse). Below
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

/** ceil(chars / 1.8). For text that may hold CJK or Thai, use estimateTokens, which counts those characters apart. */
export function estimateTokensFromChars(chars: number): number {
  if (!Number.isFinite(chars) || chars < 0) throw new Error(`estimateTokensFromChars: invalid length ${chars}`);
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

// Letters of any script except Latin, Greek and Cyrillic. Script=Common (digits, punctuation, spaces, symbols)
// and Inherited (combining marks) stay with the 1.8 rate: they sit inside Latin text.
const WIDE_SCRIPT_CHAR = /[^\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Common}\p{Script=Inherited}]/gu;

interface TextSize {
  /** UTF-16 units that count at CHARS_PER_TOKEN. */
  narrowUnits: number;
  /** Code points of other scripts, one token each. */
  wideChars: number;
}

function sizeOf(value: unknown): TextSize {
  if (value === undefined) return { narrowUnits: 0, wideChars: 0 };
  let text: string;
  if (typeof value === 'string') text = value;
  else {
    const json = JSON.stringify(value);
    if (json === undefined) throw new Error('estimateInputTokens: value is not JSON serializable');
    text = json;
  }
  let wideChars = 0;
  let wideUnits = 0;
  for (const match of text.matchAll(WIDE_SCRIPT_CHAR)) {
    wideChars += 1;
    wideUnits += match[0].length;
  }
  return { narrowUnits: text.length - wideUnits, wideChars };
}

function estimateFromSizes(...sizes: TextSize[]): number {
  const narrow = sizes.reduce((sum, size) => sum + size.narrowUnits, 0);
  const wide = sizes.reduce((sum, size) => sum + size.wideChars, 0);
  return estimateTokensFromChars(narrow) + wide;
}

/** Local estimate for any JSON-serializable value (a block, a message, a tool result). */
export function estimateTokens(value: unknown): number {
  return estimateFromSizes(sizeOf(value));
}

export interface BudgetRequestParts {
  system?: unknown;
  tools?: unknown;
  messages: unknown;
}

/** Local estimate for a whole request: system + tools JSON + messages. */
export function estimateInputTokens(parts: BudgetRequestParts): number {
  return estimateFromSizes(sizeOf(parts.system), sizeOf(parts.tools), sizeOf(parts.messages));
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
