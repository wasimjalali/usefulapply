'use client';

/**
 * Open an application that may not be in the session store yet.
 *
 * Tracker rows and the sidebar can appear before useSupabaseSync has filled
 * `sessions`, and loadSession used to blank the kit on a miss. The row is in
 * D1. Fetch it. Chat messages load here too, so an older application is not
 * stuck with the ten-newest sweep.
 */

import {
  getSession as getStoredSession,
  getChatCompactionMarker,
  getChatMessages,
} from '@/lib/supabase';
import { useChatCompactionMarker } from '@/components/chat/compaction-marker';
import { useChatHistoryLoad } from '@/components/chat/chat-history-load';
import {
  useSessionStore,
  type ChatMessage,
} from '@/store/useSessionStore';
import {
  mapChatRowsToStore,
  type StoredSessionRow,
} from '@/lib/session-row-mapping';
import { applyServerRow } from '@/lib/session-sync';

export { mapChatRowsToStore, mapSessionRowToStore, readKitDocumentErrors, type StoredSessionRow } from '@/lib/session-row-mapping';

let openGeneration = 0;
const hydratedChatIds = new Set<string>();

function applyChat(sessionId: string, serverMessages: ChatMessage[]) {
  // Do not go through updateCurrentSession: that stamps updatedAt and the
  // sync effect would write the whole row back to D1 just because chat loaded.
  const store = useSessionStore.getState();
  // A message this browser added that has not reached D1 yet (its sync write is pending or failed) stays: replacing
  // the transcript wholesale would drop it from the screen, and the sync would then never write it.
  const local = (store.currentSession?.id === sessionId
    ? store.currentSession
    : store.sessions.find((session) => session.id === sessionId))?.chatMessages ?? [];
  const serverIds = new Set(serverMessages.map((message) => message.id));
  const pending = local.filter((message) => message.id.startsWith('msg-') && !message.stored && !serverIds.has(message.id));
  const chatMessages = pending.length === 0
    ? serverMessages
    : [...serverMessages, ...pending].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  useSessionStore.setState({
    currentSession: store.currentSession?.id === sessionId
      ? { ...store.currentSession, chatMessages }
      : store.currentSession,
    sessions: store.sessions.map((session) =>
      session.id === sessionId ? { ...session, chatMessages } : session,
    ),
  });
}

export async function hydrateChatIfEmpty(sessionId: string, generation = openGeneration): Promise<void> {
  if (sessionId.startsWith('session-')) return;
  if (hydratedChatIds.has(sessionId)) return;

  // ChatPanel holds a loading state while this runs, instead of the empty conversation (chat-history-load.ts).
  const { setLoading, setFailed } = useChatHistoryLoad.getState();
  setLoading(sessionId, true);
  setFailed(sessionId, false);
  let messages: Awaited<ReturnType<typeof getChatMessages>>;
  let compactedThrough: string | null | undefined;
  try {
    // The divider marker is cosmetic: a failed read is logged and shows no divider, it never keeps the chat from loading.
    [messages, compactedThrough] = await Promise.all([
      getChatMessages(sessionId),
      getChatCompactionMarker(sessionId).catch((error: unknown) => {
        console.error('[openStoredSession] Chat divider marker did not load:', error);
        return undefined;
      }),
    ]);
  } catch (error) {
    // Only the newest load speaks for the application: an older one that fails after a newer one started does not.
    if (generation === openGeneration) setFailed(sessionId, true);
    throw error;
  } finally {
    setLoading(sessionId, false);
  }
  if (generation !== openGeneration) return;
  if (useSessionStore.getState().currentSession?.id !== sessionId) return;
  hydratedChatIds.add(sessionId);
  // The chat divider on a device that never saw the turn that compacted (the route returns it with every reply too).
  // A failed read keeps the marker this browser already has.
  if (compactedThrough !== undefined) useChatCompactionMarker.getState().setMarker(sessionId, compactedThrough);
  // Applied even when the server holds none: the transcript on screen may be this browser's cached copy, and the
  // server's (empty) one replaces it, keeping only messages this browser has not written yet (applyChat).
  applyChat(sessionId, mapChatRowsToStore(messages ?? []));
}

/** Whether this page load has the application's transcript from D1 (the background chat sync waits for it). */
export function isChatHydrated(sessionId: string): boolean {
  return hydratedChatIds.has(sessionId);
}

/**
 * Put this application on screen. Fetches from D1 when the store does not
 * have it. Never clears currentSession on a miss: that used to blank the kit.
 */
export async function openStoredSession(sessionId: string): Promise<boolean> {
  const generation = ++openGeneration;
  const store = useSessionStore.getState();
  const inStore = store.sessions.find((session) => session.id === sessionId)
    ?? (store.currentSession?.id === sessionId ? store.currentSession : null);

  if (inStore) {
    store.loadSession(sessionId);
    await hydrateChatIfEmpty(sessionId, generation).catch((err) => {
      console.error('[openStoredSession] Chat did not load:', err);
    });
    return useSessionStore.getState().currentSession?.id === sessionId;
  }

  if (sessionId.startsWith('session-')) {
    store.loadSession(sessionId);
    return useSessionStore.getState().currentSession?.id === sessionId;
  }

  let row;
  try {
    row = await getStoredSession(sessionId);
  } catch (err) {
    console.error('[openStoredSession] Session did not load:', err);
    return false;
  }
  if (generation !== openGeneration) return false;
  if (!row) return false;

  // The one door for server content: registers the baseline and lists the application.
  const applied = await applyServerRow(sessionId, row as StoredSessionRow, 'open', { placement: 'upsert' });
  if (generation !== openGeneration) return false;
  if (!applied.session) return false;
  useSessionStore.getState().loadSession(sessionId);
  await hydrateChatIfEmpty(sessionId, generation).catch((err) => {
    console.error('[openStoredSession] Chat did not load:', err);
  });
  return useSessionStore.getState().currentSession?.id === sessionId;
}
