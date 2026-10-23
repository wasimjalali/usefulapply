/**
 * On-demand compaction for the main chat (plan 2.3, P0 item 8 in evals/results/2026-10-22-haiku-55-swap.md).
 *
 * Before a chat turn is sent, the route projects its input: system + tools + history + the new message, estimated
 * at 1.8 chars/token (token-budget.ts), plus a reserve for the tool rounds the turn may run. Over
 * COMPACT_ABOVE_TOKENS it sends one compaction request first (`compaction: { type: 'summarize', instructions }`,
 * beta compact-2026-09-04), which returns one signed `compaction` block and nothing else. The turn then goes out as
 * [block, kept messages, new message]. 75k, not the 93k refuse line, because the compaction request itself carries everything
 * before the kept messages and must stay under the 100k price tier too.
 *
 * Usage of a compaction response is only in `usage.iterations` (top-level counts are 0); usageRecordsOf
 * (anthropic.ts) sums iterations, so the ledger and the PostHog cost include it.
 *
 * Every request that carries a block needs the beta header (P0: a 400 without it), the compaction request included.
 */
import type Anthropic from '@anthropic-ai/sdk';

export const COMPACTION_BETA = 'compact-2026-09-04';
/** Projected input above which the turn compacts first. */
export const COMPACT_ABOVE_TOKENS = 75_000;
/** Headroom for the tool rounds a turn may run (results are capped at 15k chars each). */
export const COMPACTION_RESERVE_TOKENS = 15_000;
/** Messages kept verbatim after the block: this many, or one more (see splitForCompaction). */
export const KEEP_RECENT_MESSAGES = 4;
/**
 * Output cap of the compaction request. The summary is capped at 600 words (about 2,500 tokens of German) in its
 * instructions; the rest is thinking, which counts toward max_tokens. The live check (2026-10-23) used 5.8k tokens
 * out for a 1.4k-char summary, so 12k (non-streamed, under STREAM_ABOVE_MAX_TOKENS). Hitting it is a failure.
 */
export const COMPACTION_MAX_TOKENS = 12_000;

/** A compaction block as the API returns it, validated before it is stored or sent back. */
export type CompactionBlock = Anthropic.Beta.BetaCompactionBlockParam & { type: 'compaction'; content: string };

/**
 * The stored block, checked. The API treats a block with null content as a failed compaction (a no-op), so one is
 * never stored and never counts. Anything else that is not a compaction block with text is refused: a row the code
 * does not understand must not be sent to the API as if it were.
 */
export function asCompactionBlock(value: unknown): CompactionBlock | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const block = value as Record<string, unknown>;
  if (block.type !== 'compaction') return null;
  if (typeof block.content !== 'string' || !block.content.trim()) return null;
  return value as CompactionBlock;
}

/** True when any message carries a compaction block, so the request needs the beta header. */
export function carriesCompactionBlock(messages: Anthropic.Beta.BetaMessageParam[]): boolean {
  return messages.some((message) => Array.isArray(message.content)
    && message.content.some((block) => (block as { type?: string }).type === 'compaction'));
}

/**
 * Where to cut a history of `length` messages: everything before the returned index is compacted, the rest is kept
 * verbatim. Four are kept, or five when that lets the kept part start on an assistant message, so the compacted range
 * ends on a user turn (the shape P0 verified; a range ending on an assistant turn reads as a prefill). Usually no
 * more than five: the kept turns ride in every later request until the next compaction. The range always ends on a
 * user turn; returns null when there is none to end on.
 */
export function splitForCompaction(roles: Array<'user' | 'assistant'>): number | null {
  let cut = roles.length - KEEP_RECENT_MESSAGES;
  if (roles[cut] !== 'assistant' && cut - 1 > 0 && roles[cut - 1] === 'assistant') cut -= 1;
  // Two assistant messages in a row (a workflow notice after a reply) can still leave the range on an assistant turn:
  // step back to the last user turn, keeping a little more verbatim instead.
  while (cut > 0 && roles[cut - 1] !== 'user') cut -= 1;
  return cut > 0 ? cut : null;
}

/**
 * Why a summary may not be used, or null. The checks are structural, the parts of CHAT_COMPACTION_INSTRUCTIONS a
 * slip in would weaken the << >> rules on every later turn: every << closed by a >> before the next one opens, no
 * line that reads as a prompt heading, nothing shaped like the app's own state message.
 */
export function summaryFormatProblem(content: string): string | null {
  let open = false;
  for (let i = 0; i < content.length - 1; i += 1) {
    const pair = content.slice(i, i + 2);
    if (pair === '<<') {
      if (open) return 'nested <<';
      open = true;
      i += 1;
    } else if (pair === '>>') {
      if (!open) return 'stray >>';
      open = false;
      i += 1;
    }
  }
  if (open) return 'unclosed <<';
  // A markdown heading, not a "#1" in prose. Then anything that opens a line like the app's state message, in any
  // case and behind markdown marks ("#Current state", "**Current state**", "Today: ..."), while the same words
  // mid-sentence stay prose.
  if (content.split('\n').some((line) => /^\s*#{1,6}\s/.test(line))) return 'heading line';
  if (/^[\s#*>_-]*(current state\b|today\s*:|latest message\s*:|earlier message\s*:)/im.test(content)) return 'state-shaped text';
  return null;
}
