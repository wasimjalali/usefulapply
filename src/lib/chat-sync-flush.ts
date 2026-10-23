/**
 * Lets the chat write an application's pending messages to D1 before it calls /api/chat.
 *
 * The client's chat sync (useSupabaseSync) is debounced by a second. The chat route stores the new turn at once and
 * reads the history in the order rows were written, so a message the client added just before the turn would
 * otherwise be written after it and show up in the model's history out of order. useSupabaseSync registers the
 * writer; without it (signed out, the hook not mounted) there is nothing to flush.
 */
/** Resolves true when every pending message was written, false when one failed. */
type ChatSyncFlush = (sessionId: string, exceptMessageId: string | undefined) => Promise<boolean>;

let registered: ChatSyncFlush | null = null;

export function registerChatSyncFlush(flush: ChatSyncFlush | null): void {
  registered = flush;
}

/** How long a turn waits for the flush. Past it, the caller decides whether the turn can go (useAgentWorkflow). */
const FLUSH_TIMEOUT_MS = 3_000;

/**
 * Write the application's unsynced messages except `exceptMessageId` (the turn the route stores itself).
 * 'failed' means a write was refused: the route would answer without that message (a pasted ad the next question is
 * about), so the caller holds the turn. 'timeout' means the writes are still going: the caller holds the turn only
 * when one of the pending messages is the user's own (a reply the route stored itself is already in D1).
 */
export async function flushChatSync(sessionId: string, exceptMessageId: string | undefined): Promise<'ok' | 'failed' | 'timeout'> {
  if (!registered) return 'ok';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), FLUSH_TIMEOUT_MS); });
  try {
    const outcome = await Promise.race([
      registered(sessionId, exceptMessageId).then((written) => (written ? 'ok' as const : 'failed' as const)),
      timedOut,
    ]);
    if (outcome === 'timeout') console.error(`[chat] pending messages for ${sessionId} not written within ${FLUSH_TIMEOUT_MS} ms`);
    if (outcome === 'failed') console.error(`[chat] a pending message for ${sessionId} could not be written; holding the turn`);
    return outcome;
  } finally {
    clearTimeout(timer);
  }
}
