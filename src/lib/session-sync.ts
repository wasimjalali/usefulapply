'use client';

/**
 * How the browser keeps an open application in step with D1.
 *
 * The server is the writer of generation output (agent-v2 persists the kit,
 * regenerate persists a document); the browser writes only what the user
 * changes. It does that with revisions:
 *
 * - Every application the browser loads has a *baseline*: the revision it was
 *   read at, and a fingerprint of each persisted column as the store saw it.
 * - A save sends only the columns whose fingerprint moved, plus the baseline
 *   revision, to `saveApplicationEditsAction`. The server writes only if the
 *   application is still at that revision and answers with the new one.
 * - A conflict means someone else wrote first (another tab, an agent, a
 *   background generation). The browser drops its unsaved change, reloads the
 *   application from the server and says so. Nothing is overwritten silently.
 * - While an application is open, the browser polls its revision on window
 *   focus and every 15 seconds. If it moved and there is nothing unsaved, it
 *   reloads quietly; if there is something unsaved, the save runs and settles
 *   it through the conflict path.
 *
 * All work on one application runs one step at a time (`withLock`), so a save,
 * a reload and a poll can never interleave on the same baseline.
 */

import {
  getSession as getStoredSession,
  saveApplicationEdits,
  getApplicationRevision,
} from '@/lib/supabase';
import { mapSessionRowToStore, type StoredSessionRow } from '@/lib/session-row-mapping';
import { useSessionStore, type ApplicationSession } from '@/store/useSessionStore';

export const CONFLICT_NOTICE = 'This application was updated elsewhere. We loaded the latest version.';
export const SAVE_FAILED_NOTICE = 'Your last change did not save. Try again.';

export const REVISION_POLL_MS = 15_000;

// ---------------------------------------------------------------------------
// Notices (the toast lives in React; this module is plain TypeScript)
// ---------------------------------------------------------------------------

export type SyncNoticeKind = 'info' | 'error';
type NoticeListener = (message: string, kind: SyncNoticeKind) => void;
const noticeListeners = new Set<NoticeListener>();

export function subscribeSyncNotices(listener: NoticeListener): () => void {
  noticeListeners.add(listener);
  return () => { noticeListeners.delete(listener); };
}

function notify(message: string, kind: SyncNoticeKind): void {
  noticeListeners.forEach((listener) => listener(message, kind));
}

// ---------------------------------------------------------------------------
// The signed-in user (set by useSupabaseSync)
// ---------------------------------------------------------------------------

let syncUserId: string | null = null;

export function setSyncUser(userId: string | null): void {
  if (syncUserId !== userId) baselines.clear();
  syncUserId = userId;
}

// ---------------------------------------------------------------------------
// Persisted columns
// ---------------------------------------------------------------------------

/**
 * Structured CV data and screening answers ride inside the generated_cv JSON
 * column. Only keys the session actually holds are written, so a session
 * loaded without them (older rows, partial mappers) never wipes what is stored.
 */
export function embedKitData(session: ApplicationSession): Record<string, unknown> | null {
  const base: Record<string, unknown> | null = session.generatedCV
    ? { ...session.generatedCV }
    : session.optimizedCVData
      ? {}
      : null;
  if (!base) return null;
  if (session.optimizedCVData !== undefined) base._optimizedCVData = session.optimizedCVData;
  if (session.screeningAnswers !== undefined) base._screeningAnswers = session.screeningAnswers;
  base._screeningUsageCount = session.screeningUsageCount ?? 0;
  return base;
}

/**
 * The columns the browser may write, read off a store session. `status` and
 * the generation_* columns are deliberately absent: the tracker owns status,
 * and the server owns generation state.
 */
export function persistedColumns(session: ApplicationSession): Record<string, unknown> {
  const matchScore = session.matchScore != null
    ? Math.round(Math.min(100, Math.max(0, session.matchScore)))
    : null;
  const columns: Record<string, unknown> = {
    job_title: session.jobTitle ?? '',
    company: session.company ?? '',
    job_description: session.jobDescription ?? '',
    match_score: matchScore,
    matching_skills: session.matchingSkills ?? [],
    missing_skills: session.missingSkills ?? [],
    suggestions: session.suggestions ?? [],
    requirements: session.requirements ?? null,
    gaps: session.gaps ?? null,
    generated_cv: embedKitData(session),
    cover_letter: session.coverLetter ?? null,
    email: session.email ?? null,
    follow_up_email: session.followUpEmail ?? null,
    company_research: session.companyResearch ?? null,
    cv_edits: session.cvEdits ?? [],
    optimized_cv_text: session.generatedCV?.content ?? null,
    email_subject: session.email?.subject ?? null,
    email_body: session.email?.body ?? null,
    fit_assessment: session.fitAssessment ?? null,
  };
  // A session without a template keeps the stored one.
  if (session.selectedTemplate) columns.selected_template = session.selectedTemplate;
  return columns;
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function fingerprints(session: ApplicationSession): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [column, value] of Object.entries(persistedColumns(session))) out[column] = fingerprint(value);
  return out;
}

// ---------------------------------------------------------------------------
// Baselines
// ---------------------------------------------------------------------------

interface Baseline {
  revision: number;
  fields: Record<string, string>;
}

const baselines = new Map<string, Baseline>();

/** Record what the server holds for this application, as the store sees it. */
export function rememberServerSession(session: ApplicationSession): void {
  if (session.id.startsWith('session-')) return;
  baselines.set(session.id, { revision: session.revision ?? 0, fields: fingerprints(session) });
}

/** Map a stored row and remember it. Returns the store-shaped session. */
export function rememberServerRow(row: StoredSessionRow): ApplicationSession {
  const mapped = mapSessionRowToStore(row);
  rememberServerSession(mapped);
  return mapped;
}

export function forgetSession(sessionId: string): void {
  baselines.delete(sessionId);
}

/** Move a baseline to a new id (a local draft that just got its stored row). */
export function renameBaseline(fromId: string, toId: string): void {
  const base = baselines.get(fromId);
  if (!base) return;
  baselines.delete(fromId);
  baselines.set(toId, base);
}

function findSession(sessionId: string): ApplicationSession | null {
  const state = useSessionStore.getState();
  return state.sessions.find((session) => session.id === sessionId)
    ?? (state.currentSession?.id === sessionId ? state.currentSession : null);
}

function changedColumns(session: ApplicationSession, base: Baseline): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(persistedColumns(session))) {
    if (fingerprint(value) !== base.fields[column]) patch[column] = value;
  }
  return patch;
}

/** True when the store holds a change the server has not seen. */
export function hasUnsavedEdits(sessionId: string): boolean {
  const session = findSession(sessionId);
  const base = baselines.get(sessionId);
  if (!session || !base) return false;
  return Object.keys(changedColumns(session, base)).length > 0;
}

function setStoreRevision(sessionId: string, revision: number): void {
  // Not through updateSessionById: that stamps updatedAt for a change the user did not make.
  useSessionStore.setState((state) => ({
    sessions: state.sessions.map((session) => (session.id === sessionId ? { ...session, revision } : session)),
    currentSession: state.currentSession?.id === sessionId
      ? { ...state.currentSession, revision }
      : state.currentSession,
  }));
}

// ---------------------------------------------------------------------------
// One step at a time per application
// ---------------------------------------------------------------------------

const chains = new Map<string, Promise<unknown>>();

function withLock<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
  const previous = chains.get(sessionId) ?? Promise.resolve();
  const next = previous.then(work, work);
  const tail = next.catch(() => undefined);
  chains.set(sessionId, tail);
  void tail.then(() => { if (chains.get(sessionId) === tail) chains.delete(sessionId); });
  return next;
}

// ---------------------------------------------------------------------------
// Reload
// ---------------------------------------------------------------------------

async function reloadUnlocked(sessionId: string): Promise<'reloaded' | 'gone' | 'failed'> {
  let row: StoredSessionRow | null;
  try {
    row = (await getStoredSession(sessionId, syncUserId ?? undefined)) as StoredSessionRow | null;
  } catch (error) {
    console.error('[session-sync] Could not reload the application:', error);
    return 'failed';
  }
  if (!row) return 'gone';
  const mapped = mapSessionRowToStore(row);
  useSessionStore.setState((state) => {
    const previous = state.sessions.find((session) => session.id === sessionId)
      ?? (state.currentSession?.id === sessionId ? state.currentSession : null);
    // Chat is not part of the stored row; it loads and syncs on its own.
    const next: ApplicationSession = { ...mapped, chatMessages: previous?.chatMessages ?? mapped.chatMessages };
    const isCurrent = state.currentSession?.id === sessionId;
    return {
      sessions: state.sessions.some((session) => session.id === sessionId)
        ? state.sessions.map((session) => (session.id === sessionId ? next : session))
        : state.sessions,
      currentSession: isCurrent ? next : state.currentSession,
      ...(isCurrent
        ? {
            jobDescription: next.jobDescription,
            requirements: next.requirements,
            gaps: next.gaps,
            generatedCV: next.generatedCV,
            coverLetter: next.coverLetter,
            email: next.email,
          }
        : {}),
    };
  });
  rememberServerSession(mapped);
  return 'reloaded';
}

/**
 * Replace the browser's copy of an application with the server's. Used after
 * the server wrote the kit and after a conflict.
 */
export function reloadApplication(sessionId: string): Promise<'reloaded' | 'gone' | 'failed'> {
  if (sessionId.startsWith('session-')) return Promise.resolve('gone');
  return withLock(sessionId, () => reloadUnlocked(sessionId));
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export type SaveOutcome = 'saved' | 'clean' | 'skipped' | 'conflict' | 'gone' | 'rejected' | 'failed';

async function saveUnlocked(sessionId: string): Promise<SaveOutcome> {
  if (!syncUserId || sessionId.startsWith('session-')) return 'skipped';
  const session = findSession(sessionId);
  const base = baselines.get(sessionId);
  // No baseline means this browser never read the stored copy, so it has no
  // revision to stand on. Writing without one is exactly the stale-tab hazard.
  if (!session || !base) return 'skipped';
  const patch = changedColumns(session, base);
  if (Object.keys(patch).length === 0) return 'clean';
  const sent = fingerprints(session);

  let result;
  try {
    result = await saveApplicationEdits(sessionId, base.revision, patch, syncUserId);
  } catch (error) {
    console.error('[session-sync] Save failed:', error);
    return 'failed';
  }
  if (result.ok) {
    const merged = { ...base.fields };
    for (const column of Object.keys(patch)) merged[column] = sent[column];
    baselines.set(sessionId, { revision: result.revision, fields: merged });
    setStoreRevision(sessionId, result.revision);
    return 'saved';
  }
  if (result.reason === 'conflict') {
    notify(CONFLICT_NOTICE, 'info');
    await reloadUnlocked(sessionId);
    return 'conflict';
  }
  if (result.reason === 'not_found') {
    forgetSession(sessionId);
    return 'gone';
  }
  // Rejected input (for example an emptied job description). Retrying the same
  // patch would fail the same way, so settle the baseline and say so.
  console.error('[session-sync] The server rejected a change:', result.message);
  const merged = { ...base.fields };
  for (const column of Object.keys(patch)) merged[column] = sent[column];
  baselines.set(sessionId, { revision: base.revision, fields: merged });
  notify(SAVE_FAILED_NOTICE, 'error');
  return 'rejected';
}

/** Save what changed in this application, now. Safe to call as often as you like. */
export function persistSessionEdits(sessionId: string): Promise<SaveOutcome> {
  return withLock(sessionId, () => saveUnlocked(sessionId));
}

/**
 * The server just wrote these columns (a regenerate) and answered with the new
 * revision; the store already shows the same content. Take the revision and
 * count those columns as saved, so the next save does not resend them against
 * a revision that has moved on. Everything else keeps its baseline, so edits
 * the user made meanwhile are still unsaved.
 */
export function adoptServerWrite(
  sessionId: string,
  revision: number | undefined,
  columns: string[],
): Promise<void> {
  if (revision === undefined || sessionId.startsWith('session-')) return Promise.resolve();
  return withLock(sessionId, async () => {
    const base = baselines.get(sessionId);
    const session = findSession(sessionId);
    if (!base || !session) return;
    const current = persistedColumns(session);
    const fields = { ...base.fields };
    for (const column of columns) fields[column] = fingerprint(current[column]);
    const next = Math.max(base.revision, revision);
    baselines.set(sessionId, { revision: next, fields });
    setStoreRevision(sessionId, next);
  });
}

// ---------------------------------------------------------------------------
// Poll
// ---------------------------------------------------------------------------

/**
 * Has the server moved on from what this browser loaded? If so and nothing is
 * unsaved, take the server's copy. If something is unsaved, run the save, which
 * settles through the conflict path.
 */
export function checkForRemoteChange(sessionId: string): Promise<'unchanged' | 'reloaded' | 'conflict' | 'skipped'> {
  if (!syncUserId || sessionId.startsWith('session-')) return Promise.resolve('skipped');
  return withLock(sessionId, async () => {
    const base = baselines.get(sessionId);
    if (!base) return 'skipped';
    let remote;
    try {
      remote = await getApplicationRevision(sessionId, syncUserId ?? undefined);
    } catch (error) {
      console.error('[session-sync] Revision check failed:', error);
      return 'skipped';
    }
    if (!remote || remote.revision === base.revision) return 'unchanged';
    const session = findSession(sessionId);
    if (session && Object.keys(changedColumns(session, base)).length > 0) {
      return (await saveUnlocked(sessionId)) === 'conflict' ? 'conflict' : 'unchanged';
    }
    return (await reloadUnlocked(sessionId)) === 'reloaded' ? 'reloaded' : 'skipped';
  });
}

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
