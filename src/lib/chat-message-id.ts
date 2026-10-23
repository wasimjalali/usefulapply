/**
 * Ids of chat messages that the client and the server both write.
 *
 * The client names every message it adds (`msg-<time>-<random>`, useSessionStore.addChatMessage) and the chat
 * route names the replies it stores (`msg-<uuid>`). Both write the same row under that id, idempotently: the
 * route stores the user's turn and the reply before the client's debounced sync gets to them, and the sync then
 * finds the row already there. Without a shared id the two would be two rows, and the server-owned history the
 * route reads would show every turn twice.
 */
const CHAT_MESSAGE_ID_RE = /^msg-[A-Za-z0-9-]{1,80}$/;

export function isChatMessageId(value: unknown): value is string {
  return typeof value === 'string' && CHAT_MESSAGE_ID_RE.test(value);
}

/** A server-side id in the same format, for the reply the route stores. */
export function newChatMessageId(): string {
  return `msg-${crypto.randomUUID()}`;
}
