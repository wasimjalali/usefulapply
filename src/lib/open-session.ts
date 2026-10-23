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

function applyChat(sessionId: string, chatMessages: ChatMessage[]) {
  // Do not go through updateCurrentSession: that stamps updatedAt and the
  // sync effect would write the whole row back to D1 just because chat loaded.
  const store = useSessionStore.getState();
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

  // The divider marker is cosmetic: a failed read is logged and shows no divider, it never keeps the chat from loading.
  const [messages, compactedThrough] = await Promise.all([
    getChatMessages(sessionId),
    getChatCompactionMarker(sessionId).catch((error: unknown) => {
      console.error('[openStoredSession] Chat divider marker did not load:', error);
      return undefined;
    }),
  ]);
  if (generation !== openGeneration) return;
  if (useSessionStore.getState().currentSession?.id !== sessionId) return;
  hydratedChatIds.add(sessionId);
  // The chat divider on a device that never saw the turn that compacted (the route returns it with every reply too).
  // A failed read keeps the marker this browser already has.
  if (compactedThrough !== undefined) useChatCompactionMarker.getState().setMarker(sessionId, compactedThrough);
  if (!messages || messages.length === 0) return;
  applyChat(sessionId, mapChatRowsToStore(messages));
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
