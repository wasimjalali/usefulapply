'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Where ChatPanel draws "Earlier messages summarized", per application: the id of the last message the chat model
 * now sees only as a summary. The chat route returns it with every reply on a saved application (null before the
 * first compaction); the transcript itself stays complete. Kept in localStorage so a reload still shows it.
 */
interface ChatCompactionMarkerState {
  bySession: Record<string, string | null>;
  setMarker: (sessionId: string, messageId: string | null) => void;
}

export const useChatCompactionMarker = create<ChatCompactionMarkerState>()(
  persist(
    (set) => ({
      bySession: {},
      setMarker: (sessionId, messageId) => set((state) => (
        state.bySession[sessionId] === messageId ? state : { bySession: { ...state.bySession, [sessionId]: messageId } }
      )),
    }),
    { name: 'chat-compaction-marker', storage: createJSONStorage(() => localStorage) },
  ),
);
