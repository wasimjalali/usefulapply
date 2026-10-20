/**
 * TEST ONLY. DO NOT IMPORT THIS FROM THE APP.
 *
 * The sync engine as it was at PR #155 review round 2 (before the round 3 fixes).
 * It is kept so e2e/tools/sync-fuzz.ts (--engine round2) can keep showing that the
 * randomized interleaving test fails on it. The app uses src/lib/session-sync.ts
 * and src/lib/session-sync-engine.ts. Nothing in src/ may import from here.
 */

/**
 * How a browser keeps an open application in step with D1.
 *
 * No 'use client' and no app imports on purpose: the server actions, the store
 * and the clock are injected (`createSyncEngine`), so the same code runs in the
 * page (see session-sync.ts) and in the randomized interleaving test
 * (e2e/tools/sync-fuzz.ts) with several fake tabs against a fake server.
 *
 * The server writes generation output; the browser writes only what the user
 * changes, and only with revisions:
 *
 * - Every application the browser loads has a *baseline*: the revision it was
 *   read at and a fingerprint of each persisted column as the SERVER held it.
 *   What the user has changed is whatever differs from the baseline.
 * - Server content reaches the store through ONE door, `applyServerRow`:
 *   hydration, feed and new-application handoffs, opening a stored one, poll
 *   reloads, the reload after a conflict, and the refresh after any mutation
 *   the browser triggered (regenerate, follow-up, status). A mutation's response
 *   never writes content into the store; it asks for a refresh.
 * - `applyServerRow` runs inside the application's lock and looks at the store
 *   when the row ARRIVES. A row at an older revision than the baseline is
 *   ignored. Otherwise each field group is merged: untouched locally takes the
 *   server value; edited locally and unchanged on the server keeps the local
 *   value (still unsaved, now over the new baseline); edited on both sides is a
 *   conflict: the server value goes into the store, the user's value goes into
 *   a conflict buffer, and one notice offers it back.
 * - A save sends only the dirty, not-rejected columns with the baseline
 *   revision. A write conflict fetches the row and merges the same way, then
 *   retries what is left, a bounded number of times.
 * - A column the server refuses is "rejected": excluded from saves until its
 *   value changes, but it never blocks reading the server's newer state.
 * - Editors keep their draft outside the store and save through
 *   `commitEditorSave`, which says explicitly whether the server accepted the
 *   exact draft ('saved'/'clean') or not ('conflict', 'error', 'rejected',
 *   'gone'). Only a non-success leaves the editor open with its text.
 *
 * All work on one application runs one step at a time (`withLock`).
 */

import { mapSessionRowToStore, type StoredSessionRow } from '@/lib/session-row-mapping';
import type { ApplicationSession } from '@/store/useSessionStore';

export const CONFLICT_NOTICE = 'This application was updated elsewhere. We loaded the latest version.';
export const EDITOR_CONFLICT_NOTICE = `${CONFLICT_NOTICE} Your text is still in the editor, so you can copy it.`;
export const SAVE_FAILED_NOTICE = 'Your last change did not save. Try again.';
export const RELOAD_FAILED_NOTICE = "We couldn't load the latest version. Check your connection and try again.";

export const REVISION_POLL_MS = 15_000;
/** A request that has not answered by now is treated as failed, so one hung call cannot hold an application's lock forever. */
export const REQUEST_TIMEOUT_MS = 30_000;
/** Conflict-merge-retry rounds inside one save. */
const MAX_SAVE_ROUNDS = 5;

// ---------------------------------------------------------------------------
// Injected pieces
// ---------------------------------------------------------------------------

export type SaveResult =
  | { ok: true; revision: number }
  | { ok: false; reason: 'conflict'; currentRevision?: number | null }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'invalid'; message: string; field?: string };

export interface SyncActions {
  getRow(sessionId: string, userId: string): Promise<StoredSessionRow | null>;
  getRevision(sessionId: string, userId: string): Promise<{ revision: number } | null>;
  saveEdits(sessionId: string, expectedRevision: number, patch: Record<string, unknown>, userId: string): Promise<SaveResult>;
}

interface StoreSlice {
  sessions: ApplicationSession[];
  currentSession: ApplicationSession | null;
}

export interface SessionStoreLike {
  getState(): StoreSlice;
  setState(updater: (state: StoreSlice) => Partial<StoreSlice> & Record<string, unknown>): void;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export type SyncNoticeKind = 'info' | 'error';
export interface SyncNotice {
  message: string;
  kind: SyncNoticeKind;
  /** Set when the notice is about a conflict whose user text is in `getConflictBuffer(sessionId)`. */
  conflictFor?: string;
}

export interface SyncDeps {
  actions: SyncActions;
  store: SessionStoreLike;
  notify: (notice: SyncNotice) => void;
  clock: Clock;
}

// ---------------------------------------------------------------------------
// Persisted columns and field groups
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

/**
 * Columns that are derived from the same session properties move together: a
 * merge takes or keeps all of a group, never half of it.
 */
interface FieldGroup {
  key: string;
  label: string;
  columns: string[];
  props: (keyof ApplicationSession)[];
}

export const FIELD_GROUPS: FieldGroup[] = [
  { key: 'jobTitle', label: 'job title', columns: ['job_title'], props: ['jobTitle'] },
  { key: 'company', label: 'company', columns: ['company'], props: ['company'] },
  { key: 'jobDescription', label: 'job description', columns: ['job_description'], props: ['jobDescription'] },
  { key: 'matchScore', label: 'match score', columns: ['match_score'], props: ['matchScore'] },
  { key: 'matchingSkills', label: 'matching skills', columns: ['matching_skills'], props: ['matchingSkills'] },
  { key: 'missingSkills', label: 'missing skills', columns: ['missing_skills'], props: ['missingSkills'] },
  { key: 'suggestions', label: 'suggestions', columns: ['suggestions'], props: ['suggestions'] },
  { key: 'requirements', label: 'requirements', columns: ['requirements'], props: ['requirements'] },
  { key: 'gaps', label: 'gaps', columns: ['gaps'], props: ['gaps'] },
  {
    key: 'cv',
    label: 'CV',
    columns: ['generated_cv', 'optimized_cv_text'],
    props: ['generatedCV', 'optimizedCVData', 'screeningAnswers', 'screeningUsageCount'],
  },
  { key: 'coverLetter', label: 'cover letter', columns: ['cover_letter'], props: ['coverLetter'] },
  { key: 'email', label: 'email', columns: ['email', 'email_subject', 'email_body'], props: ['email'] },
  { key: 'followUpEmail', label: 'follow-up email', columns: ['follow_up_email'], props: ['followUpEmail'] },
  { key: 'companyResearch', label: 'company research', columns: ['company_research'], props: ['companyResearch'] },
  { key: 'cvEdits', label: 'CV edits', columns: ['cv_edits'], props: ['cvEdits'] },
  { key: 'fitAssessment', label: 'fit assessment', columns: ['fit_assessment'], props: ['fitAssessment'] },
  { key: 'selectedTemplate', label: 'template', columns: ['selected_template'], props: ['selectedTemplate'] },
];

const GROUP_OF_COLUMN = new Map<string, FieldGroup>();
for (const group of FIELD_GROUPS) for (const column of group.columns) GROUP_OF_COLUMN.set(column, group);

function fingerprint(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function fingerprints(session: ApplicationSession): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [column, value] of Object.entries(persistedColumns(session))) out[column] = fingerprint(value);
  return out;
}

/** For tests: the fingerprint of every persisted column of a store session. */
export const columnFingerprints = fingerprints;

// ---------------------------------------------------------------------------
// Types the callers see
// ---------------------------------------------------------------------------

export type ApplySource = 'hydrate' | 'open' | 'handoff' | 'poll' | 'refresh' | 'conflict';

export interface ApplyOptions {
  /** `upsert` also adds the application to the sidebar list when it is missing. Default `replace`. */
  placement?: 'replace' | 'upsert';
  /** Row to store shape. Default `mapSessionRowToStore`. */
  map?: (row: StoredSessionRow) => ApplicationSession;
  /** Last touch on the merged session (feed handoff keeps its own extras). Runs before the store write. */
  decorate?: (merged: ApplicationSession, local: ApplicationSession | null) => ApplicationSession;
  /** Apply even when the row is not newer than the baseline. */
  force?: boolean;
  /** The conflict notice to raise, if the merge finds one. */
  conflictNotice?: string;
}

export interface ApplyResult {
  status: 'applied' | 'stale' | 'gone' | 'failed';
  /** Labels of the field groups where the user's text lost to a newer server value. */
  conflicts: string[];
  /** The application as it now stands: what the store holds, or what was installed. Null only for a stale row of an application that is not loaded. */
  session: ApplicationSession | null;
}

export type SaveOutcome = 'saved' | 'clean' | 'skipped' | 'conflict' | 'gone' | 'rejected' | 'failed';

/** What an editor learns. Only 'saved', 'clean' and 'local' mean the draft is safe; anything else keeps the editor open. */
export type EditorOutcome = 'saved' | 'clean' | 'local' | 'conflict' | 'error' | 'rejected' | 'gone';

export function editorSaveSucceeded(outcome: EditorOutcome): boolean {
  return outcome === 'saved' || outcome === 'clean' || outcome === 'local';
}

/** What an editor knew when it opened: the revision and the server-side fingerprints of the columns. */
export interface EditorStart {
  revision: number;
  fields: Record<string, string>;
}

export interface ConflictEntry {
  key: string;
  label: string;
  columns: string[];
  props: Partial<ApplicationSession>;
  at: number;
}

interface Baseline {
  revision: number;
  fields: Record<string, string>;
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

export function createSyncEngine(deps: SyncDeps) {
  const { actions, store, clock } = deps;

  let userId: string | null = null;
  const baselines = new Map<string, Baseline>();
  /** Per application: column -> fingerprint of the value the server refused. */
  const rejected = new Map<string, Record<string, string>>();
  const conflictBuffers = new Map<string, Map<string, ConflictEntry>>();
  const reloadFailureAnnounced = new Set<string>();
  const chains = new Map<string, Promise<unknown>>();
  /** Per editor (its opening snapshot): the columns its draft sets, so a retry still knows them. */
  const draftColumns = new WeakMap<EditorStart, Set<string>>();

  const notify = (message: string, kind: SyncNoticeKind, conflictFor?: string) =>
    deps.notify({ message, kind, ...(conflictFor ? { conflictFor } : {}) });

  function setUser(next: string | null): void {
    if (userId !== next) {
      baselines.clear();
      rejected.clear();
      conflictBuffers.clear();
      reloadFailureAnnounced.clear();
    }
    userId = next;
  }

  function forgetSession(sessionId: string): void {
    baselines.delete(sessionId);
    rejected.delete(sessionId);
    conflictBuffers.delete(sessionId);
    reloadFailureAnnounced.delete(sessionId);
  }

  // -- plumbing -------------------------------------------------------------

  function withLock<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
    const previous = chains.get(sessionId) ?? Promise.resolve();
    const next = previous.then(work, work);
    const tail = next.catch(() => undefined);
    chains.set(sessionId, tail);
    void tail.then(() => { if (chains.get(sessionId) === tail) chains.delete(sessionId); });
    return next;
  }

  function withTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const handle = clock.setTimeout(() => reject(new Error(`${what} timed out`)), REQUEST_TIMEOUT_MS);
      promise.then(
        (value) => { clock.clearTimeout(handle); resolve(value); },
        (error) => { clock.clearTimeout(handle); reject(error); },
      );
    });
  }

  function findSession(sessionId: string): ApplicationSession | null {
    const state = store.getState();
    return state.sessions.find((session) => session.id === sessionId)
      ?? (state.currentSession?.id === sessionId ? state.currentSession : null);
  }

  const mirrorOf = (next: ApplicationSession) => ({
    jobDescription: next.jobDescription,
    requirements: next.requirements,
    gaps: next.gaps,
    generatedCV: next.generatedCV,
    coverLetter: next.coverLetter,
    email: next.email,
  });

  function writeSession(sessionId: string, next: ApplicationSession, placement: 'replace' | 'upsert'): void {
    store.setState((state) => {
      const inList = state.sessions.some((session) => session.id === sessionId);
      const isCurrent = state.currentSession?.id === sessionId;
      return {
        sessions: inList
          ? state.sessions.map((session) => (session.id === sessionId ? next : session))
          : placement === 'upsert' ? [next, ...state.sessions] : state.sessions,
        currentSession: isCurrent ? next : state.currentSession,
        ...(isCurrent ? mirrorOf(next) : {}),
      };
    });
  }

  function setStoreRevision(sessionId: string, revision: number): void {
    // Not through updateSessionById: that stamps updatedAt for a change the user did not make.
    store.setState((state) => ({
      sessions: state.sessions.map((session) => (session.id === sessionId ? { ...session, revision } : session)),
      currentSession: state.currentSession?.id === sessionId
        ? { ...state.currentSession, revision }
        : state.currentSession,
    }));
  }

  /** Every column whose value differs from what the server held at the baseline. */
  function dirtyColumns(session: ApplicationSession, base: Baseline): string[] {
    const out: string[] = [];
    for (const [column, value] of Object.entries(persistedColumns(session))) {
      if (fingerprint(value) !== base.fields[column]) out.push(column);
    }
    return out;
  }

  /** The dirty columns a save would send: rejected ones are held back until their value changes. */
  function pendingPatch(sessionId: string, session: ApplicationSession, base: Baseline): Record<string, unknown> {
    const refused = rejected.get(sessionId) ?? {};
    const current = persistedColumns(session);
    const patch: Record<string, unknown> = {};
    for (const column of dirtyColumns(session, base)) {
      if (refused[column] !== fingerprint(current[column])) patch[column] = current[column];
    }
    return patch;
  }

  // -- applyServerRow -------------------------------------------------------

  /** The one place server content reaches the store. Call inside the application's lock. */
  function applyUnlocked(
    sessionId: string,
    row: StoredSessionRow,
    source: ApplySource,
    options: ApplyOptions = {},
  ): ApplyResult {
    const base = baselines.get(sessionId);
    const local = findSession(sessionId);
    const placement = options.placement ?? 'replace';
    const incoming = typeof row.revision === 'number' ? row.revision : 0;

    // Refresh-type sources only mean something for an application this browser loaded.
    if (!base && (source === 'poll' || source === 'refresh' || source === 'conflict')) {
      return { status: 'stale', conflicts: [], session: local };
    }
    // Not newer than what we hold: a late answer, ignored. The exception is an explicit load of an
    // application (hydrate, open, handoff) at the same revision: workflow-only writes (generation
    // state, the feed's intent) do not bump it, and showing them is the point of that load.
    const explicitLoad = source === 'hydrate' || source === 'open' || source === 'handoff';
    if (base && !options.force && (incoming < base.revision || (incoming === base.revision && !explicitLoad))) {
      return { status: 'stale', conflicts: [], session: local };
    }

    const mapped = (options.map ?? mapSessionRowToStore)(row);
    const serverFp = fingerprints(mapped);
    const nextBaseline: Baseline = { revision: incoming, fields: serverFp };

    // Nothing local to preserve: never loaded, or not in the store.
    if (!base || !local) {
      const installed = options.decorate ? options.decorate(mapped, local) : mapped;
      baselines.set(sessionId, nextBaseline);
      rejected.delete(sessionId);
      reloadFailureAnnounced.delete(sessionId);
      if (local || placement === 'upsert') writeSession(sessionId, installed, placement);
      return { status: 'applied', conflicts: [], session: installed };
    }

    // Merge, field group by field group, against what the store holds NOW.
    const localFp = fingerprints(local);
    const merged: ApplicationSession = { ...mapped, chatMessages: local.chatMessages ?? mapped.chatMessages };
    const conflicts: ConflictEntry[] = [];
    for (const group of FIELD_GROUPS) {
      const dirtyLocally = group.columns.some((column) => column in localFp && localFp[column] !== base.fields[column]);
      if (!dirtyLocally) continue;                                  // untouched here: the server value stands
      const changedOnServer = group.columns.some((column) => serverFp[column] !== base.fields[column]);
      const sameNow = group.columns.every((column) => !(column in localFp) || localFp[column] === serverFp[column]);
      if (sameNow) continue;                                        // both sides made the same change
      if (!changedOnServer) {
        // Still the user's unsaved edit; it now sits over the new baseline.
        for (const prop of group.props) (merged as unknown as Record<string, unknown>)[prop] = local[prop];
        continue;
      }
      const props: Partial<ApplicationSession> = {};
      for (const prop of group.props) (props as Record<string, unknown>)[prop] = local[prop];
      conflicts.push({ key: group.key, label: group.label, columns: group.columns, props, at: clock.now() });
    }
    merged.revision = incoming;
    const finalSession = options.decorate ? options.decorate(merged, local) : merged;

    baselines.set(sessionId, nextBaseline);
    writeSession(sessionId, finalSession, placement);

    // What stays refused is only what is still unsaved and still the same value.
    const refused = rejected.get(sessionId);
    if (refused) {
      const finalFp = fingerprints(finalSession);
      for (const column of Object.keys(refused)) {
        if (finalFp[column] === undefined || finalFp[column] === nextBaseline.fields[column] || finalFp[column] !== refused[column]) {
          delete refused[column];
        }
      }
      if (Object.keys(refused).length === 0) rejected.delete(sessionId);
    }
    reloadFailureAnnounced.delete(sessionId);

    if (conflicts.length > 0) {
      const buffer = conflictBuffers.get(sessionId) ?? new Map<string, ConflictEntry>();
      for (const entry of conflicts) buffer.set(entry.key, entry);
      conflictBuffers.set(sessionId, buffer);
      notify(options.conflictNotice ?? CONFLICT_NOTICE, 'info', sessionId);
    }
    return { status: 'applied', conflicts: conflicts.map((entry) => entry.label), session: findSession(sessionId) ?? finalSession };
  }

  /** Public entry for a row the caller already holds. Waits for the application's lock, then looks at the store. */
  function applyServerRow(
    sessionId: string,
    row: StoredSessionRow,
    source: ApplySource,
    options?: ApplyOptions,
  ): Promise<ApplyResult> {
    if (sessionId.startsWith('session-')) return Promise.resolve({ status: 'stale', conflicts: [], session: findSession(sessionId) });
    return withLock(sessionId, async () => applyUnlocked(sessionId, row, source, options));
  }

  async function fetchRow(sessionId: string): Promise<StoredSessionRow | null | 'failed'> {
    if (!userId) return 'failed';
    try {
      return await withTimeout(actions.getRow(sessionId, userId), 'Loading the application');
    } catch (error) {
      console.error('[session-sync] Could not load the application:', error);
      return 'failed';
    }
  }

  /** The latest row, or the result to hand back when there is none. A failed load is announced once, except for the quiet poll. */
  async function loadRow(
    sessionId: string,
    source: ApplySource,
  ): Promise<{ row: StoredSessionRow } | { result: ApplyResult }> {
    const row = await fetchRow(sessionId);
    if (row === 'failed') {
      if (source !== 'poll' && !reloadFailureAnnounced.has(sessionId)) {
        reloadFailureAnnounced.add(sessionId);
        notify(RELOAD_FAILED_NOTICE, 'error');
      }
      return { result: { status: 'failed', conflicts: [], session: findSession(sessionId) } };
    }
    if (!row) return { result: { status: 'gone', conflicts: [], session: findSession(sessionId) } };
    return { row };
  }

  /** Fetch the latest row and apply it, from inside the application's lock. */
  async function refreshUnlocked(
    sessionId: string,
    source: ApplySource,
    options?: ApplyOptions,
  ): Promise<ApplyResult> {
    const loaded = await loadRow(sessionId, source);
    return 'row' in loaded ? applyUnlocked(sessionId, loaded.row, source, options) : loaded.result;
  }

  /**
   * Fetch the latest row and apply it. The way every mutation response, poll and
   * conflict gets server content: the request runs outside the lock and the row
   * is judged against the store when it arrives, inside it.
   */
  async function refreshFromServer(
    sessionId: string,
    source: ApplySource = 'refresh',
    options?: ApplyOptions,
  ): Promise<ApplyResult> {
    if (sessionId.startsWith('session-')) return { status: 'stale', conflicts: [], session: findSession(sessionId) };
    const loaded = await loadRow(sessionId, source);
    return 'row' in loaded ? applyServerRow(sessionId, loaded.row, source, options) : loaded.result;
  }

  // -- save -----------------------------------------------------------------

  /** Mark the columns the server refused, widening to the whole field group. */
  function rejectColumns(sessionId: string, patch: Record<string, unknown>, field: string | undefined): boolean {
    const refused = rejected.get(sessionId) ?? {};
    const named = field && field in patch ? GROUP_OF_COLUMN.get(field)?.columns ?? [field] : Object.keys(patch);
    let added = false;
    for (const column of named) {
      if (!(column in patch)) continue;
      const fp = fingerprint(patch[column]);
      if (refused[column] !== fp) added = true;
      refused[column] = fp;
    }
    rejected.set(sessionId, refused);
    return added;
  }

  async function saveUnlocked(sessionId: string, conflictNotice?: string): Promise<SaveOutcome> {
    if (!userId || sessionId.startsWith('session-')) return 'skipped';
    let accepted = false;
    let conflicted = false;
    for (let round = 0; round < MAX_SAVE_ROUNDS; round++) {
      const session = findSession(sessionId);
      const base = baselines.get(sessionId);
      // No baseline means this browser never read the stored copy, so it has no
      // revision to stand on. Writing without one is exactly the stale-tab hazard.
      if (!session || !base) return 'skipped';
      const patch = pendingPatch(sessionId, session, base);
      if (Object.keys(patch).length === 0) {
        if (accepted) return dirtyColumns(session, base).length > 0 ? 'rejected' : 'saved';
        if (conflicted) return 'conflict';
        return dirtyColumns(session, base).length > 0 ? 'rejected' : 'clean';
      }
      const sent = fingerprints(session);
      let result: SaveResult;
      try {
        result = await withTimeout(actions.saveEdits(sessionId, base.revision, patch, userId), 'Saving');
      } catch (error) {
        console.error('[session-sync] Save failed:', error);
        return 'failed';
      }
      if (result.ok) {
        const fields = { ...base.fields };
        for (const column of Object.keys(patch)) fields[column] = sent[column];
        const jumped = result.revision > base.revision + 1;
        baselines.set(sessionId, { revision: result.revision, fields });
        setStoreRevision(sessionId, result.revision);
        const refused = rejected.get(sessionId);
        if (refused) for (const column of Object.keys(patch)) delete refused[column];
        accepted = true;
        // The server moved by more than our write (a side effect on its side): reconcile instead of guessing.
        if (jumped) await refreshUnlocked(sessionId, 'refresh', { force: true, conflictNotice });
        continue;
      }
      if (result.reason === 'conflict') {
        conflicted = true;
        const applied = await refreshUnlocked(sessionId, 'conflict', { force: true, conflictNotice });
        if (applied.status === 'gone') { forgetSession(sessionId); return 'gone'; }
        if (applied.status === 'failed') return 'failed';
        continue;
      }
      if (result.reason === 'not_found') {
        forgetSession(sessionId);
        return 'gone';
      }
      // Rejected input (an emptied job description, say). Keep the field dirty and unsent,
      // announce it once, and send the rest.
      console.error('[session-sync] The server rejected a change:', result.message);
      if (rejectColumns(sessionId, patch, result.field)) notify(SAVE_FAILED_NOTICE, 'error');
    }
    return conflicted ? 'conflict' : 'rejected';
  }

  /** Save what changed in this application, now. Safe to call as often as you like. */
  function persistSessionEdits(sessionId: string): Promise<SaveOutcome> {
    return withLock(sessionId, () => saveUnlocked(sessionId));
  }

  // -- editors --------------------------------------------------------------

  function getEditorStart(sessionId: string): EditorStart | undefined {
    const base = baselines.get(sessionId);
    return base ? { revision: base.revision, fields: { ...base.fields } } : undefined;
  }

  /**
   * Save from an editor that kept its draft outside the store. The draft was
   * typed against what the editor opened on (`start`). `apply` puts it into the
   * store. If the server changed a field the draft touches since then, the
   * draft is not applied: the store keeps the newer value, the draft is kept for
   * copying and the editor is told 'conflict'. Otherwise the draft is saved over
   * the current baseline, and the editor hears 'saved' only if the server holds
   * the exact draft.
   */
  function commitEditorSave(
    sessionId: string,
    start: EditorStart | undefined,
    apply: () => void,
  ): Promise<EditorOutcome> {
    if (sessionId.startsWith('session-')) {
      apply();
      return Promise.resolve('local');
    }
    return withLock(sessionId, async () => {
      const base = baselines.get(sessionId);
      const before = findSession(sessionId);
      if (!userId || !base || !before) {
        apply();
        return 'local';
      }
      const beforeFp = fingerprints(before);
      apply();
      const after = findSession(sessionId);
      if (!after) return 'gone';
      const draftFp = fingerprints(after);
      // The columns this draft sets: what apply() just changed, plus what an earlier try of the
      // same editor changed (a retry finds its own draft already in the store and changes nothing).
      const remembered = start ? draftColumns.get(start) : undefined;
      const touched = [...new Set([
        ...Object.keys(draftFp).filter((column) => draftFp[column] !== beforeFp[column]),
        ...(remembered ?? []),
      ])];
      if (start) draftColumns.set(start, new Set(touched));

      if (start) {
        const moved = touched.filter((column) => base.fields[column] !== start.fields[column] && draftFp[column] !== base.fields[column]);
        if (moved.length > 0) {
          // The draft is based on text that is no longer the server's. Put the store back, keep the draft aside.
          writeSession(sessionId, before, 'replace');
          const buffer = conflictBuffers.get(sessionId) ?? new Map<string, ConflictEntry>();
          const seen = new Set<string>();
          for (const column of moved) {
            const group = GROUP_OF_COLUMN.get(column);
            if (!group || seen.has(group.key)) continue;
            seen.add(group.key);
            const props: Partial<ApplicationSession> = {};
            for (const prop of group.props) (props as Record<string, unknown>)[prop] = after[prop];
            buffer.set(group.key, { key: group.key, label: group.label, columns: group.columns, props, at: clock.now() });
          }
          conflictBuffers.set(sessionId, buffer);
          notify(EDITOR_CONFLICT_NOTICE, 'info', sessionId);
          return 'conflict';
        }
      }

      const outcome = await saveUnlocked(sessionId, EDITOR_CONFLICT_NOTICE);
      if (outcome === 'skipped') return 'local';
      if (outcome === 'gone') return 'gone';
      const settled = baselines.get(sessionId);
      if (touched.length > 0) {
        const exact = settled !== undefined && touched.every((column) => settled.fields[column] === draftFp[column]);
        if (exact) return outcome === 'clean' ? 'clean' : 'saved';
      } else if (outcome === 'saved' || outcome === 'clean') {
        return 'clean';
      }
      if (outcome === 'failed') return 'error';
      if (outcome === 'rejected') return 'rejected';
      return 'conflict';
    });
  }

  // -- poll -----------------------------------------------------------------

  /**
   * Has the server moved on from what this browser holds? The question is only
   * about revisions: unsaved or refused edits do not stand in the way. If it
   * has, the newer row goes through `applyServerRow` and merges.
   */
  async function checkForRemoteChange(sessionId: string): Promise<'unchanged' | 'reloaded' | 'conflict' | 'skipped'> {
    if (!userId || sessionId.startsWith('session-')) return 'skipped';
    if (!baselines.has(sessionId)) return 'skipped';
    let remote: { revision: number } | null;
    try {
      remote = await withTimeout(actions.getRevision(sessionId, userId), 'Checking for changes');
    } catch (error) {
      console.error('[session-sync] Revision check failed:', error);
      return 'skipped';
    }
    const base = baselines.get(sessionId);
    if (!base) return 'skipped';
    if (!remote || remote.revision <= base.revision) return 'unchanged';
    const applied = await refreshFromServer(sessionId, 'poll');
    if (applied.status === 'applied') return applied.conflicts.length > 0 ? 'conflict' : 'reloaded';
    return applied.status === 'stale' ? 'unchanged' : 'skipped';
  }

  // -- conflict buffer ------------------------------------------------------

  function getConflictBuffer(sessionId: string): ConflictEntry[] {
    return [...(conflictBuffers.get(sessionId)?.values() ?? [])];
  }

  function textOf(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const parts = [record.subject, record.body].filter((part): part is string => typeof part === 'string' && part.length > 0);
      if (parts.length > 0) return parts.join('\n\n');
      return JSON.stringify(value, null, 2);
    }
    return value == null ? '' : String(value);
  }

  /** The user's text from every conflicted field, ready to paste. */
  function conflictBufferText(sessionId: string): string {
    return getConflictBuffer(sessionId)
      .map((entry) => {
        const text = Object.values(entry.props).map(textOf).filter(Boolean).join('\n\n');
        return `${entry.label}\n${text}`;
      })
      .join('\n\n---\n\n');
  }

  function clearConflictBuffer(sessionId: string): void {
    conflictBuffers.delete(sessionId);
  }

  /** Put the user's version back as an unsaved edit over the current baseline, then save it. */
  function restoreConflictBuffer(sessionId: string): Promise<SaveOutcome> {
    return withLock(sessionId, async () => {
      const entries = getConflictBuffer(sessionId);
      const session = findSession(sessionId);
      if (entries.length === 0 || !session) return 'skipped';
      const next = { ...session } as ApplicationSession;
      for (const entry of entries) Object.assign(next, entry.props);
      writeSession(sessionId, next, 'replace');
      conflictBuffers.delete(sessionId);
      return saveUnlocked(sessionId);
    });
  }

  return {
    setUser,
    forgetSession,
    applyServerRow,
    refreshFromServer,
    persistSessionEdits,
    getEditorStart,
    commitEditorSave,
    checkForRemoteChange,
    getConflictBuffer,
    conflictBufferText,
    clearConflictBuffer,
    restoreConflictBuffer,
    /** For tests: what the engine believes about an application. */
    debug: {
      baseline: (sessionId: string) => {
        const base = baselines.get(sessionId);
        return base ? { revision: base.revision, fields: { ...base.fields } } : undefined;
      },
      dirty: (sessionId: string) => {
        const session = findSession(sessionId);
        const base = baselines.get(sessionId);
        return session && base ? dirtyColumns(session, base) : [];
      },
      rejected: (sessionId: string) => Object.keys(rejected.get(sessionId) ?? {}),
    },
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
