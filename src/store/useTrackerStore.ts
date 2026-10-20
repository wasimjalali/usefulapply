'use client';

import { create } from 'zustand';
import { deleteSessionAction, listTrackerOverviewAction, setTrackerStatusAction, updateProfileAction } from '@/db/actions';
import { useSessionStore } from '@/store/useSessionStore';
import { adoptServerWrite, CONFLICT_NOTICE } from '@/lib/session-sync';
import type { TrackerApplicationRow } from '@/db/repos/sessions';
import {
  addBusinessDays,
  toIso,
  toTrackerStatus,
  type TrackerStatus,
} from '@/components/tracker/tracker-status';

export interface TrackerMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  chips?: TrackerChip[];
}

export interface TrackerChip {
  id: string;
  label: string;
  /** The gold chip is the one thing worth doing next. One per message. */
  primary?: boolean;
  action: TrackerChipAction;
}

export type TrackerChipAction =
  | { kind: 'follow_up'; sessionId: string }
  | { kind: 'prep'; sessionId: string }
  | { kind: 'hide_rejected' }
  | { kind: 'show_rejected' };

interface TrackerState {
  rows: TrackerApplicationRow[];
  loading: boolean;
  /** The conversation waits for the first fetch before it opens. */
  loadedOnce: boolean;
  error: string | null;
  search: string;
  statusFilter: TrackerStatus | 'all';
  hideRejected: boolean;
  messages: TrackerMessage[];
  thinking: boolean;

  load: (userId: string) => Promise<void>;
  setSearch: (search: string) => void;
  setStatusFilter: (status: TrackerStatus | 'all') => void;
  setHideRejected: (userId: string, hidden: boolean) => Promise<void>;
  hydrateHideRejected: (hidden: boolean) => void;
  applyStatus: (
    userId: string,
    sessionId: string,
    next: { status: TrackerStatus; interviewAt?: string | null; followUpDueAt?: string | null },
  ) => Promise<void>;
  remove: (userId: string, sessionId: string) => Promise<void>;
  addMessage: (message: TrackerMessage) => void;
  setThinking: (thinking: boolean) => void;
  reset: () => void;
}

let messageSeq = 0;
let loadGeneration = 0;
export function trackerMessageId(prefix: string): string {
  messageSeq += 1;
  return `${prefix}-${messageSeq}`;
}

/**
 * A status change decides its own dates: Applied gets a follow-up window, the
 * dated statuses keep what the popover collected, and Rejected clears
 * everything so NEXT can go quiet.
 */
export function datesForStatus(
  status: TrackerStatus,
  picked: { interviewAt?: string | null; followUpDueAt?: string | null } = {},
  now: Date = new Date(),
): { interviewAt: string | null; followUpDueAt: string | null } {
  switch (status) {
    case 'applied':
      return {
        interviewAt: null,
        followUpDueAt: picked.followUpDueAt ?? toIso(addBusinessDays(now, 7)),
      };
    case 'interview':
      return { interviewAt: picked.interviewAt ?? null, followUpDueAt: null };
    case 'follow_up':
    case 'accepted':
      return { interviewAt: null, followUpDueAt: picked.followUpDueAt ?? null };
    case 'drafted':
    case 'rejected':
      return { interviewAt: null, followUpDueAt: null };
  }
}

export const useTrackerStore = create<TrackerState>((set, get) => ({
  rows: [],
  loading: false,
  loadedOnce: false,
  error: null,
  search: '',
  statusFilter: 'all',
  hideRejected: false,
  messages: [],
  thinking: false,

  load: async (userId) => {
    const generation = ++loadGeneration;
    set({ loading: true, error: null });
    try {
      const rows = await listTrackerOverviewAction(userId);
      if (generation !== loadGeneration) return;
      set({ rows, loading: false, loadedOnce: true });
    } catch {
      if (generation !== loadGeneration) return;
      set({ loading: false, error: 'Your applications did not load. Refresh and try again.' });
    }
  },

  setSearch: (search) => set({ search }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  hydrateHideRejected: (hidden) => set({ hideRejected: hidden }),

  setHideRejected: async (userId, hidden) => {
    const previous = get().hideRejected;
    set({ hideRejected: hidden });
    try {
      await updateProfileAction(userId, { hide_rejected: hidden });
    } catch {
      set({ hideRejected: previous, error: 'That filter did not save. Try again.' });
    }
  },

  applyStatus: async (userId, sessionId, next) => {
    const before = get().rows.find((row) => row.id === sessionId) ?? null;
    // Re-picking the status a row already has must not wipe the date it
    // already carries; moving to a different status starts clean.
    const sameStatus = before ? toTrackerStatus(before.status) === next.status : false;
    const dates = datesForStatus(next.status, {
      interviewAt: next.interviewAt ?? (sameStatus ? before?.interview_at ?? null : null),
      followUpDueAt: next.followUpDueAt ?? (sameStatus ? before?.follow_up_due_at ?? null : null),
    });
    // The row moves first: the popover closes on a change the user can see.
    set((state) => ({
      rows: state.rows.map((row) =>
        row.id === sessionId
          ? {
              ...row,
              status: next.status,
              interview_at: dates.interviewAt,
              follow_up_due_at: dates.followUpDueAt,
            }
          : row,
      ),
    }));
    // The status change is conditional on the revision this browser last saw.
    // The row's own number can lag behind the user's edits in this same
    // browser (the tracker does not reload on every save), so the open
    // session's revision counts too and the higher one stands.
    const sessionState = useSessionStore.getState();
    const known = sessionState.sessions.find((session) => session.id === sessionId)
      ?? (sessionState.currentSession?.id === sessionId ? sessionState.currentSession : null);
    const expectedRevision = before || known
      ? Math.max(before?.revision ?? 0, known?.revision ?? 0)
      : undefined;
    try {
      const result = await setTrackerStatusAction(userId, sessionId, {
        status: next.status,
        interviewAt: dates.interviewAt,
        followUpDueAt: dates.followUpDueAt,
      }, expectedRevision);
      if (!result.ok) {
        if (result.reason === 'conflict') {
          set({ error: CONFLICT_NOTICE });
          void get().load(userId);
        }
        throw new Error('Status update failed');
      }
      set((state) => ({
        rows: state.rows.map((row) => (row.id === sessionId ? { ...row, revision: result.revision } : row)),
      }));
      void adoptServerWrite(sessionId, result.revision, []);
    } catch {
      // Roll back this row only. Another row may have moved while this was
      // in flight, and its change is not ours to undo.
      set((state) => ({
        rows: before ? state.rows.map((row) => (row.id === sessionId ? before : row)) : state.rows,
        error: state.error === CONFLICT_NOTICE ? CONFLICT_NOTICE : 'That status did not save. Try again.',
      }));
      throw new Error('Status update failed');
    }
  },

  remove: async (userId, sessionId) => {
    const beforeRow = get().rows.find((row) => row.id === sessionId) ?? null;
    set({ rows: get().rows.filter((row) => row.id !== sessionId), error: null });
    try {
      const { error } = await deleteSessionAction(userId, sessionId);
      const gone = !error || error.message === 'Application not found';
      if (!gone) throw error;
      useSessionStore.getState().deleteSession(sessionId);
    } catch {
      set((state) => ({
        rows: beforeRow && !state.rows.some((row) => row.id === sessionId)
          ? [beforeRow, ...state.rows]
          : state.rows,
        error: 'That application did not delete. Try again.',
      }));
      throw new Error('Delete failed');
    }
  },

  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setThinking: (thinking) => set({ thinking }),
  reset: () => {
    loadGeneration += 1;
    set({
      rows: [],
      loading: false,
      loadedOnce: false,
      error: null,
      search: '',
      statusFilter: 'all',
      hideRejected: false,
      messages: [],
      thinking: false,
    });
  },
}));

/** Rows after the search box, the count pill and the Hide rejected filter. */
export function selectVisibleRows(
  state: Pick<TrackerState, 'rows' | 'search' | 'hideRejected' | 'statusFilter'>,
): TrackerApplicationRow[] {
  const query = state.search.trim().toLowerCase();
  return state.rows.filter((row) => {
    const status = toTrackerStatus(row.status);
    if (state.hideRejected && status === 'rejected') return false;
    if (state.statusFilter !== 'all' && status !== state.statusFilter) return false;
    if (!query) return true;
    return (
      (row.company ?? '').toLowerCase().includes(query) ||
      (row.job_title ?? '').toLowerCase().includes(query)
    );
  });
}

/** The count pills read the same rows the table does, minus the pill filter. */
export function selectRowsForCounts(
  state: Pick<TrackerState, 'rows' | 'search' | 'hideRejected'>,
): TrackerApplicationRow[] {
  const query = state.search.trim().toLowerCase();
  return state.rows.filter((row) => {
    if (state.hideRejected && toTrackerStatus(row.status) === 'rejected') return false;
    if (!query) return true;
    return (
      (row.company ?? '').toLowerCase().includes(query) ||
      (row.job_title ?? '').toLowerCase().includes(query)
    );
  });
}
