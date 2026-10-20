'use client';

/**
 * The page's wiring of the sync engine (see session-sync-engine.ts for how an
 * open application stays in step with D1). This file only connects the engine
 * to the real server actions, the session store, the clock and the toast, and
 * owns the browser-only parts: the revision poll and the notice subscription.
 */

import {
  getSession as getStoredSession,
  saveApplicationEdits,
  getApplicationRevision,
} from '@/lib/supabase';
import type { StoredSessionRow } from '@/lib/session-row-mapping';
import { useSessionStore } from '@/store/useSessionStore';
import {
  createSyncEngine,
  REVISION_POLL_MS,
  type SyncNotice,
} from '@/lib/session-sync-engine';

export {
  CONFLICT_NOTICE,
  EDITOR_CONFLICT_NOTICE,
  SAVE_FAILED_NOTICE,
  RELOAD_FAILED_NOTICE,
  REVISION_POLL_MS,
  embedKitData,
  persistedColumns,
  editorSaveSucceeded,
  editorShouldClose,
  acknowledgementFor,
  acknowledgedStart,
  afterClosedEditorSave,
  staleEditorStart,
} from '@/lib/session-sync-engine';
export type {
  ApplyOptions,
  ApplyResult,
  ApplySource,
  ConflictAcknowledgement,
  ConflictEntry,
  EditorOutcome,
  EditorStart,
  SaveOutcome,
  SyncNotice,
} from '@/lib/session-sync-engine';

// ---------------------------------------------------------------------------
// Notices (the toast lives in React; the engine is plain TypeScript)
// ---------------------------------------------------------------------------

type NoticeListener = (notice: SyncNotice) => void;
const noticeListeners = new Set<NoticeListener>();

export function subscribeSyncNotices(listener: NoticeListener): () => void {
  noticeListeners.add(listener);
  return () => { noticeListeners.delete(listener); };
}

// ---------------------------------------------------------------------------
// The engine, on the real store and the real actions
// ---------------------------------------------------------------------------

const engine = createSyncEngine({
  actions: {
    getRow: async (sessionId, userId) => (await getStoredSession(sessionId, userId)) as StoredSessionRow | null,
    getRevision: (sessionId, userId) => getApplicationRevision(sessionId, userId),
    saveEdits: (sessionId, expectedRevision, patch, userId) =>
      saveApplicationEdits(sessionId, expectedRevision, patch, userId),
  },
  store: {
    getState: () => useSessionStore.getState(),
    setState: (updater) => useSessionStore.setState(updater as never),
  },
  notify: (notice) => noticeListeners.forEach((listener) => listener(notice)),
  clock: {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
});

export const setSyncUser = engine.setUser;
export const forgetSession = engine.forgetSession;
export const applyServerRow = engine.applyServerRow;
export const refreshFromServer = engine.refreshFromServer;
export const persistSessionEdits = engine.persistSessionEdits;
export const getEditorStart = engine.getEditorStart;
export const rebaseEditorStart = engine.rebaseEditorStart;
export const commitEditorSave = engine.commitEditorSave;
export const checkForRemoteChange = engine.checkForRemoteChange;
export const getConflictBuffer = engine.getConflictBuffer;
export const conflictText = engine.conflictText;
export const copyConflict = engine.copyConflict;
export const restoreConflict = engine.restoreConflict;
export const discardConflict = engine.discardConflict;
export const acknowledgeConflict = engine.acknowledgeConflict;
export const subscribeConflictAcknowledged = engine.subscribeConflictAcknowledged;

/** Poll the open application on focus and every `REVISION_POLL_MS`. Returns the stop function. */
export function startRevisionPolling(getOpenSessionId: () => string | null): () => void {
  const tick = () => {
    const id = getOpenSessionId();
    if (!id || typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void checkForRemoteChange(id);
  };
  const interval = window.setInterval(tick, REVISION_POLL_MS);
  window.addEventListener('focus', tick);
  document.addEventListener('visibilitychange', tick);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener('focus', tick);
    document.removeEventListener('visibilitychange', tick);
  };
}
