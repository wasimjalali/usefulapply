/**
 * Chat tool registry types. One typed list of tools (name, JSON schema,
 * handler); the chat route passes the definitions to callHaiku and
 * executes handlers server-side when the model returns tool calls.
 *
 * Ownership: every handler re-derives the user from ChatToolContext.userId
 * (set from the authenticated session) and queries through src/db/repos/*,
 * which check ownership per query. Tool arguments never carry a user id.
 */

import type { TailoredCV } from '@/lib/cv-structure/types';

export type NavigateTarget = 'tracker' | 'documents' | 'billing' | 'job-feed';

/** What the client is told happened, so stores refresh without a reload. */
export type ExecutedEffect =
  | { type: 'navigate'; target: NavigateTarget }
  | { type: 'tracker_updated'; sessionId: string; status: string }
  | { type: 'set_cv_template'; templateId: string }
  /**
   * The whole new CV object, computed server-side and shipped ready to apply.
   *
   * The server ships the result rather than an operation for the client to
   * replay, so there is exactly one resolution point: the object the reply
   * describes is byte-identically the object that gets written, and several
   * operations in one turn compose on the server's working copy instead of
   * racing on the client's. `baseDigest` is the digest of the CV the server
   * started from, so the client can refuse if a canvas edit landed meanwhile.
   */
  | { type: 'cv_structure_updated'; sessionId: string; cv: TailoredCV; baseDigest: string }
  | { type: 'propose_application' }
  | { type: 'feed_settings_updated' }
  | { type: 'run_feed' }
  | { type: 'feed_item_updated'; jobId: string; action: 'saved' | 'dismissed' }
  | { type: 'refresh_credits' };

/** A quick-action chip rendered under the reply (same shape the chat already uses). */
export interface ChatActionChip {
  label: string;
  action: string;
  icon: string;
}

export interface ChatToolContext {
  /** From the authenticated session, never from the request body. */
  userId: string;
  /** The user's own message this turn. Row-touching writes are gated on it naming the target. */
  userMessage: string;
  /**
   * The message looks pasted (a job ad, not a typed instruction), so naming a
   * company in it is not the user vouching for that target. Row-touching
   * writes refuse when this is set.
   */
  userMessagePasted: boolean;
  /** Validated IANA zone; 'UTC' when the client sent none. */
  timeZone: string;
  /** The saved application the client is looking at, if any (UUID-validated by the route). */
  sessionId: string | null;
  /**
   * The tailored CV the canvas is showing right now, sent by the client and
   * shape-checked by the route. Null when there is none.
   *
   * This is the first client-supplied CONTENT in this context, so: it is not a
   * trust escalation. `useSupabaseSync` already writes whatever the store holds
   * straight into D1, so a client sending a forged CV here is only editing its
   * own document, which it can already do directly through the canvas. The
   * handler deliberately does NOT read the CV from D1 instead: `getSession`
   * returns what the 2-second debounced sync last wrote, so a user who saves a
   * canvas edit and immediately asks the chat to reorder would have that edit
   * silently reverted by a D1-derived write. The store is the source of truth
   * and D1 is downstream of it.
   *
   * What the tools guarantee is narrower than trust, and it is the part that
   * matters: THE MODEL CANNOT WRITE CONTENT. The operations only permute,
   * delete and pick from a closed enum, and the conservation check in
   * cv-structure/validate.ts proves it on every edit.
   */
  tailoredCV: TailoredCV | null;
  /**
   * Read-before-edit, enforced mechanically rather than by prompt.
   * `get_cv_outline` sets this; every edit tool refuses while it is false.
   *
   * Mutable scratch on a request-scoped object. The route builds one
   * toolContext per request and passes the same object to every call, so this
   * cannot leak between users in a Worker isolate the way a module-level Map
   * would.
   */
  cvOutlineRead: boolean;
  /**
   * The working copy each successful edit mutates, so a second operation in the
   * same turn sees current handles and the operations compose into one final
   * object rather than two edits racing from the same base.
   */
  cvWorking: TailoredCV | null;
  /**
   * The template the canvas is rendering, validated against the catalog by the
   * route, null when the client sent none or an id we do not know.
   *
   * The templates render every skill group and every skill, so an edit to the
   * object is an edit to the page. The id still tells the chat which template
   * the user is looking at.
   */
  cvTemplateId: string | null;
}

/**
 * The most a serialized tool result may weigh. Results are re-sent on every
 * later round of the loop, and four of them a round has to fit the 100k input
 * budget with the history beside them. Handlers that return lists shorten them
 * with fitListsToBudget; executeChatTool refuses anything still over.
 */
export const MAX_TOOL_RESULT_CHARS = 15_000;

/**
 * Shorten the named list fields of a tool result until it serializes within
 * the cap. Whole items drop from the end (every list here is newest or
 * strongest first), so the JSON stays valid and nothing is cut mid-value. A
 * result that had to shrink carries `truncated: true` and, per list, how many
 * items are shown out of how many there are, so the model can say it's partial.
 *
 * A result whose lists are empty and is still over the cap comes back as it is:
 * executeChatTool refuses it loudly rather than this guessing what else to cut.
 */
export function fitListsToBudget(
  data: Record<string, unknown>,
  listKeys: string[],
  maxChars: number = MAX_TOOL_RESULT_CHARS,
): Record<string, unknown> {
  const size = (value: unknown) => JSON.stringify(value).length;
  if (size(data) <= maxChars) return data;

  const lists = new Map<string, unknown[]>();
  const totals = new Map<string, number>();
  for (const key of listKeys) {
    const value = data[key];
    if (!Array.isArray(value)) throw new Error(`fitListsToBudget: ${key} is not a list`);
    lists.set(key, value);
    totals.set(key, value.length);
  }

  const build = () => {
    const truncatedLists: Record<string, { shown: number; total: number }> = {};
    for (const [key, list] of lists) {
      const total = totals.get(key) as number;
      if (list.length < total) truncatedLists[key] = { shown: list.length, total };
    }
    return { ...data, ...Object.fromEntries(lists), truncated: true as const, truncated_lists: truncatedLists };
  };

  let out = build();
  while (size(out) > maxChars) {
    let longestKey: string | null = null;
    let longestSize = 0;
    for (const [key, list] of lists) {
      if (list.length === 0) continue;
      const listSize = size(list);
      if (listSize > longestSize) {
        longestKey = key;
        longestSize = listSize;
      }
    }
    if (longestKey === null) break;
    const list = lists.get(longestKey) as unknown[];
    // Drop roughly the overflow's share of the list in one step, at least one item.
    const overflow = size(out) - maxChars;
    const drop = Math.max(1, Math.ceil((list.length * overflow) / longestSize));
    lists.set(longestKey, list.slice(0, Math.max(0, list.length - drop)));
    out = build();
  }
  return out;
}

export interface ChatToolResult {
  /** Fed back to the model as the tool result. Small, factual, JSON-serializable, at most MAX_TOOL_RESULT_CHARS serialized. */
  data: unknown;
  /** The handler threw. The route must surface this rather than trust a generic model fallback. */
  failed?: true;
  /**
   * The result was over MAX_TOOL_RESULT_CHARS and was replaced by a short error. Not a failure: the
   * handler ran and its effects stand, so the route tells the user to ask about one thing at a time.
   */
  oversized?: true;
  executed?: ExecutedEffect[];
  /** Confirm chips for destructive proposals; the click is the second, confirming request. */
  actions?: ChatActionChip[];
}

export interface ChatTool {
  name: string;
  description: string;
  /** JSON schema for the arguments object. */
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>, ctx: ChatToolContext) => Promise<ChatToolResult>;
}
