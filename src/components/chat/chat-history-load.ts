'use client';

import { create } from 'zustand';

/**
 * Whether a saved application's transcript is still on its way from D1, so ChatPanel can hold a loading state
 * instead of painting the empty conversation (the saved-job card or the welcome) and swapping the history in a
 * moment later. `sessionsLoaded` mirrors useSupabaseSync's first sessions load, which hydrates the open
 * application's chat before it finishes; `loading` covers an application opened after that (openStoredSession).
 */
interface ChatHistoryLoadState {
  sessionsLoaded: boolean;
  loading: Record<string, true>;
  setSessionsLoaded: (loaded: boolean) => void;
  setLoading: (sessionId: string, loading: boolean) => void;
}

export const useChatHistoryLoad = create<ChatHistoryLoadState>()((set) => ({
  sessionsLoaded: false,
  loading: {},
  setSessionsLoaded: (loaded) => set((state) => (state.sessionsLoaded === loaded ? state : { sessionsLoaded: loaded })),
  setLoading: (sessionId, loading) => set((state) => {
    if (Boolean(state.loading[sessionId]) === loading) return state;
    const next = { ...state.loading };
    if (loading) next[sessionId] = true;
    else delete next[sessionId];
    return { loading: next };
  }),
}));
