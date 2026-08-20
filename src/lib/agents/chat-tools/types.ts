/**
 * Chat tool registry types. One typed list of tools (name, JSON schema,
 * handler); the chat route passes the definitions to callWorkersAI and
 * executes handlers server-side when the model returns tool calls.
 *
 * Ownership: every handler re-derives the user from ChatToolContext.userId
 * (set from the authenticated session) and queries through src/db/repos/*,
 * which check ownership per query. Tool arguments never carry a user id.
 */

export type NavigateTarget = 'tracker' | 'documents' | 'billing' | 'job-feed';

/** What the client is told happened, so stores refresh without a reload. */
export type ExecutedEffect =
  | { type: 'navigate'; target: NavigateTarget }
  | { type: 'tracker_updated'; sessionId: string; status: string }
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
  /** Validated IANA zone; 'UTC' when the client sent none. */
  timeZone: string;
  /** The saved application the client is looking at, if any (UUID-validated by the route). */
  sessionId: string | null;
}

export interface ChatToolResult {
  /** Fed back to the model as the tool result. Small, factual, JSON-serializable. */
  data: unknown;
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
