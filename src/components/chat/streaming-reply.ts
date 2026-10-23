'use client';

import { create } from 'zustand';

/**
 * The chat reply being written (a streamed /api/chat turn), drawn by ChatPanel after the transcript. It is not a
 * transcript message: the sync never sees it, so a half-written reply can never reach D1. The finished reply replaces
 * it with one store update each (useAgentWorkflow's handleReply), which React renders together, so the bubble never
 * shows twice. Every call names its turn, so a turn that ends late never touches the next one's bubble.
 */
export interface StreamingReply {
  turnId: string;
  /** The application the turn started in: the bubble shows only there. */
  sessionId: string | null;
  /**
   * That application's createdAt. A local `session-` conversation keeps it when it gets its saved id, so the bubble
   * still finds it then, and never shows in a different application.
   */
  sessionCreatedAt: string | null;
  text: string;
  /** What a tool round is doing ("Checking your applications"), until the next text arrives. */
  status: string | null;
  startedAt: string;
}

interface StreamingReplyState {
  reply: StreamingReply | null;
  /** A new turn: replaces any other, returns its id. */
  start: (sessionId: string | null, sessionCreatedAt: string | null) => string;
  append: (turnId: string, text: string) => void;
  setStatus: (turnId: string, status: string | null) => void;
  clearTurn: (turnId: string) => void;
}

let turnCounter = 0;

export const useStreamingReply = create<StreamingReplyState>()((set, get) => ({
  reply: null,
  start: (sessionId, sessionCreatedAt) => {
    turnCounter += 1;
    const turnId = `${Date.now().toString(36)}-${turnCounter}`;
    set({ reply: { turnId, sessionId, sessionCreatedAt, text: '', status: null, startedAt: new Date().toISOString() } });
    return turnId;
  },
  append: (turnId, text) => {
    const reply = get().reply;
    if (reply?.turnId === turnId) set({ reply: { ...reply, text: reply.text + text, status: null } });
  },
  setStatus: (turnId, status) => {
    const reply = get().reply;
    if (reply?.turnId === turnId) set({ reply: { ...reply, status } });
  },
  clearTurn: (turnId) => {
    if (get().reply?.turnId === turnId) set({ reply: null });
  },
}));
