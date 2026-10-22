/**
 * Lets the chat write an application's pending messages to D1 before it calls /api/chat.
 *
 * The client's chat sync (useSupabaseSync) is debounced by a second. The chat route stores the new turn at once and
 * reads the history in the order rows were written, so a message the client added just before the turn would
 * otherwise be written after it and show up in the model's history out of order. useSupabaseSync registers the
 * writer; without it (signed out, the hook not mounted) there is nothing to flush.
 */
type ChatSyncFlush = (sessionId: string, exceptMessageId: string | undefined) => Promise<void>;

let registered: ChatSyncFlush | null = null;

export function registerChatSyncFlush(flush: ChatSyncFlush | null): void {
  registered = flush;
}

/** Write the application's unsynced messages except `exceptMessageId` (the turn the route stores itself). */
export async function flushChatSync(sessionId: string, exceptMessageId: string | undefined): Promise<void> {
  if (registered) await registered(sessionId, exceptMessageId);
}
