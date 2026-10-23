'use client';

import { create } from 'zustand';

/**
 * Whether a saved application's transcript is still on its way from D1, so ChatPanel can hold a loading state
 * instead of painting the empty conversation (the saved-job card or the welcome) and swapping the history in a
 * moment later. `sessionsLoaded` mirrors useSupabaseSync's first sessions load, which hydrates the open
 * application's chat before it finishes; `loading` covers an application opened after that (openStoredSession);
 * `failed` holds an application whose transcript did not load, so the panel says so and offers a retry instead of
 * the empty conversation (which would invite a paid fit on an application that has a whole history).
 */
interface ChatHistoryLoadState {
  sessionsLoaded: boolean;
  loading: Record<string, true>;
  failed: Record<string, true>;
  setSessionsLoaded: (loaded: boolean) => void;
  setLoading: (sessionId: string, loading: boolean) => void;
  setFailed: (sessionId: string, failed: boolean) => void;
}

export const useChatHistoryLoad = create<ChatHistoryLoadState>()((set) => ({
  sessionsLoaded: false,
  loading: {},
  failed: {},
  setSessionsLoaded: (loaded) => set((state) => (state.sessionsLoaded === loaded ? state : { sessionsLoaded: loaded })),
  setLoading: (sessionId, loading) => set((state) => {
    if (Boolean(state.loading[sessionId]) === loading) return state;
    const next = { ...state.loading };
    if (loading) next[sessionId] = true;
    else delete next[sessionId];
    return { loading: next };
  }),
  setFailed: (sessionId, failed) => set((state) => {
    if (Boolean(state.failed[sessionId]) === failed) return state;
    const next = { ...state.failed };
    if (failed) next[sessionId] = true;
    else delete next[sessionId];
    return { failed: next };
  }),
}));
