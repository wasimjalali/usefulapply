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
export const EDITOR_CONFLICT_NOTICE = `${CONFLICT_NOTICE} Your text is still in the editor, so you can copy it.`;
export const SAVE_FAILED_NOTICE = 'Your last change did not save. Try again.';
export const RELOAD_FAILED_NOTICE = "We couldn't load the latest version. Check your connection and try again.";

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

/** Every column whose value differs from what the server holds, rejected ones included. */
function differingColumns(session: ApplicationSession, base: Baseline): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(persistedColumns(session))) {
    if (fingerprint(value) !== base.fields[column]) out[column] = value;
  }
  return out;
}

/**
 * A column the server refused stays dirty (the user's value is still unsaved)
 * but is not resent until its value changes, so one bad field cannot block the
 * valid ones or be retried forever.
 */
const rejectedValues = new Map<string, Record<string, string>>();

function pendingColumns(sessionId: string, session: ApplicationSession, base: Baseline): Record<string, unknown> {
  const rejected = rejectedValues.get(sessionId) ?? {};
  const patch: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(differingColumns(session, base))) {
    if (rejected[column] !== fingerprint(value)) patch[column] = value;
  }
  return patch;
}

/** True when the store holds a change the server has not seen. */
export function hasUnsavedEdits(sessionId: string): boolean {
  const session = findSession(sessionId);
  const base = baselines.get(sessionId);
  if (!session || !base) return false;
  return Object.keys(differingColumns(session, base)).length > 0;
}

/** The revision this browser last loaded or saved for an application, or undefined when it has no baseline. */
export function getBaselineRevision(sessionId: string): number | undefined {
  return baselines.get(sessionId)?.revision;
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

/**
 * Applications whose last reload failed after a conflict. Their baseline is
 * known to be behind the server, so a save first has to reload; saving against
 * the old revision would only conflict again.
 */
const needsReload = new Set<string>();
const reloadFailureAnnounced = new Set<string>();

type ReloadResult = 'reloaded' | 'gone' | 'failed' | 'dirty';

/**
 * `ifClean`: apply the server's copy only if the store still has no unsaved
 * change when the answer arrives. The request takes time and the user keeps
 * working; a change made meanwhile must not be replaced and marked saved.
 */
async function reloadUnlocked(sessionId: string, options: { ifClean?: boolean } = {}): Promise<ReloadResult> {
  let row: StoredSessionRow | null;
  try {
    row = (await getStoredSession(sessionId, syncUserId ?? undefined)) as StoredSessionRow | null;
  } catch (error) {
    console.error('[session-sync] Could not reload the application:', error);
    return 'failed';
  }
  if (!row) return 'gone';
  if (options.ifClean) {
    const current = findSession(sessionId);
    const base = baselines.get(sessionId);
    if (current && base && Object.keys(differingColumns(current, base)).length > 0) return 'dirty';
  }
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
  rejectedValues.delete(sessionId);
  needsReload.delete(sessionId);
  reloadFailureAnnounced.delete(sessionId);
  return 'reloaded';
}

/**
 * Replace the browser's copy of an application with the server's. Used after
 * the server wrote the kit and after a conflict.
 */
export function reloadApplication(sessionId: string): Promise<'reloaded' | 'gone' | 'failed'> {
  if (sessionId.startsWith('session-')) return Promise.resolve('gone');
  return withLock(sessionId, async () => {
    const result = await reloadUnlocked(sessionId);
    return result === 'dirty' ? 'failed' : result;
  });
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export type SaveOutcome = 'saved' | 'clean' | 'skipped' | 'conflict' | 'gone' | 'rejected' | 'failed';

/**
 * Someone else wrote first. Load their version, then tell the user, in that
 * order: announcing a reload that did not happen would be a lie. A failed
 * reload is reported once, separately, and the application is marked as
 * needing a reload so the next save retries it instead of looping.
 */
async function resolveConflict(sessionId: string, notice: string): Promise<void> {
  const result = await reloadUnlocked(sessionId);
  if (result === 'reloaded') {
    notify(notice, 'info');
    return;
  }
  needsReload.add(sessionId);
  if (!reloadFailureAnnounced.has(sessionId)) {
    reloadFailureAnnounced.add(sessionId);
    notify(RELOAD_FAILED_NOTICE, 'error');
  }
}

async function saveUnlocked(sessionId: string, options: { editor?: boolean } = {}): Promise<SaveOutcome> {
  if (!syncUserId || sessionId.startsWith('session-')) return 'skipped';
  if (needsReload.has(sessionId)) {
    // Still behind the server after a conflict: reload first, quietly.
    if ((await reloadUnlocked(sessionId)) !== 'reloaded') return 'failed';
  }
  const session = findSession(sessionId);
  let base = baselines.get(sessionId);
  // No baseline means this browser never read the stored copy, so it has no
  // revision to stand on. Writing without one is exactly the stale-tab hazard.
  if (!session || !base) return 'skipped';
  const sent = fingerprints(session);
  const conflictNotice = options.editor ? EDITOR_CONFLICT_NOTICE : CONFLICT_NOTICE;

  // The server names a field it refuses; the rest of the patch still goes.
  for (let round = 0; round < 4; round++) {
    const patch = pendingColumns(sessionId, session, base);
    if (Object.keys(patch).length === 0) return round === 0 ? 'clean' : 'rejected';

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
      base = { revision: result.revision, fields: merged };
      baselines.set(sessionId, base);
      setStoreRevision(sessionId, result.revision);
      const rejected = rejectedValues.get(sessionId);
      if (rejected) for (const column of Object.keys(patch)) delete rejected[column];
      // Anything still differing was refused earlier and stays unsaved.
      return Object.keys(pendingColumns(sessionId, session, base)).length === 0 && Object.keys(differingColumns(session, base)).length > 0
        ? 'rejected'
        : 'saved';
    }
    if (result.reason === 'conflict') {
      await resolveConflict(sessionId, conflictNotice);
      return 'conflict';
    }
    if (result.reason === 'not_found') {
      forgetSession(sessionId);
      return 'gone';
    }
    // Rejected input (for example an emptied job description). Keep the field
    // dirty and unsent, announce it once, and send the rest.
    console.error('[session-sync] The server rejected a change:', result.message);
    const rejected = rejectedValues.get(sessionId) ?? {};
    const refused = result.field && result.field in patch ? [result.field] : Object.keys(patch);
    for (const column of refused) rejected[column] = sent[column];
    rejectedValues.set(sessionId, rejected);
    notify(SAVE_FAILED_NOTICE, 'error');
  }
  return 'rejected';
}

/** Save what changed in this application, now. Safe to call as often as you like. */
export function persistSessionEdits(sessionId: string): Promise<SaveOutcome> {
  return withLock(sessionId, () => saveUnlocked(sessionId));
}

/**
 * Save from an editor that kept its draft outside the store. The draft was
 * written against `startRevision`, the revision the editor opened on. If this
 * browser has since taken a newer one (a poll, a reload, another save), the
 * draft is stale: it is not applied, the application is reloaded and the user
 * is told. The editor keeps the draft text so it can be copied.
 *
 * `apply` puts the draft into the store; it only runs when the draft is still
 * based on the revision the browser holds.
 */
export function commitEditorSave(
  sessionId: string,
  startRevision: number | undefined,
  apply: () => void,
): Promise<SaveOutcome> {
  if (sessionId.startsWith('session-')) {
    apply();
    return Promise.resolve('skipped');
  }
  return withLock(sessionId, async () => {
    const base = baselines.get(sessionId);
    if (base && startRevision !== undefined && base.revision !== startRevision) {
      await resolveConflict(sessionId, EDITOR_CONFLICT_NOTICE);
      return 'conflict';
    }
    apply();
    return saveUnlocked(sessionId, { editor: true });
  });
}

/**
 * The server just wrote these columns (a regenerate) and answered with the new
 * revision; the store already shows the same content. Take the revision and
 * count those columns as saved, so the next save does not resend them against
 * a revision that has moved on. Everything else keeps its baseline, so edits
 * the user made meanwhile are still unsaved.
 *
 * If the new revision is more than the next one, other writes landed in
 * between that this browser has not seen (another tab, an agent). Taking the
 * revision would pretend it had loaded them and let its next save overwrite
 * them, so the whole application is reconciled with the server instead.
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
    if (revision > base.revision + 1) {
      const adopted = new Set(columns);
      const unsavedElsewhere = Object.keys(differingColumns(session, base)).filter((column) => !adopted.has(column));
      const result = await reloadUnlocked(sessionId);
      if (result === 'reloaded' && unsavedElsewhere.length > 0) notify(CONFLICT_NOTICE, 'info');
      return;
    }
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
 * unsaved, take the server's copy, but only if nothing became unsaved while
 * the copy was on its way. If something is unsaved, run the save, which
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
    if (session && Object.keys(differingColumns(session, base)).length > 0) {
      return (await saveUnlocked(sessionId)) === 'conflict' ? 'conflict' : 'unchanged';
    }
    const result = await reloadUnlocked(sessionId, { ifClean: true });
    if (result === 'dirty') {
      // The user changed something while the newer copy was loading. Their change
      // is based on the old revision: settle it as a conflict, not a quiet overwrite.
      return (await saveUnlocked(sessionId)) === 'conflict' ? 'conflict' : 'unchanged';
    }
    return result === 'reloaded' ? 'reloaded' : 'skipped';
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
