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
  /** The buffer entries (`ConflictEntry.id`) this notice is about. Copy and Restore act on these and nothing else. */
  conflictEntries?: string[];
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

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

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

/**
 * Does the editor close after a save? Only when the server holds the draft that
 * was sent AND the user has not typed more since. Typing during the save keeps
 * the editor open with the newer draft.
 */
export function editorShouldClose(outcome: EditorOutcome, sentDraft: string, currentDraft: string): boolean {
  return editorSaveSucceeded(outcome) && sentDraft === currentDraft;
}

/** What an editor knew when it opened: the revision and the server-side fingerprints of the columns. */
export interface EditorStart {
  revision: number;
  fields: Record<string, string>;
  /**
   * Shared by every start of one editor (a rebase makes a new start with the same lineage), so the
   * columns its draft sets are remembered across rebases, also one that happens while a save is running.
   */
  lineage: { columns: Set<string> };
}

export interface ConflictEntry {
  /** Unique per entry. A later conflict in the same field group makes a new entry. */
  id: string;
  key: string;
  label: string;
  columns: string[];
  /** The user's version of each property of the group. */
  props: Partial<ApplicationSession>;
  /** What the store showed instead (the server's value) when the entry was made. */
  base: Partial<ApplicationSession>;
  /** The properties where the user's version differs from `base`: the text the entry exists to keep. */
  changed: (keyof ApplicationSession)[];
  at: number;
  /**
   * The editors whose draft this entry holds (their `EditorStart.lineage`), however the entry was made: an editor's
   * own save, the reconciliation inside that save, or a later merge of the draft that save left in the store. More
   * than one only when editors put the very same value there (the email panel copies a document it opens with).
   * Empty when the text is no editor's draft (a plain store edit): such an entry matches no editor.
   */
  editors: EditorStart['lineage'][];
  /** The server's fingerprint of each column of the group when the entry was made: the version the notice showed the user. */
  fields: Record<string, string>;
}

/** What the user did with a conflict notice, told to open editors so they can rebase or, on a discard, drop their draft. */
export interface ConflictAcknowledgement {
  /** True for Discard: the text of `entries` was thrown away. Restore and Copy are not discards. */
  discarded: boolean;
  /**
   * The entries the notice named that were still in the buffer: their field group, the editor their text came from,
   * and the server version of the group's columns the user has now seen (what a rebase moves that editor's snapshot to).
   */
  entries: { id: string; group: string; editors: EditorStart['lineage'][]; fields: Record<string, string> }[];
}

/**
 * What a panel does with an acknowledgement, for one field group its editor holds. An acknowledgement reaches only
 * the editor that produced the entry (same lineage) and only the entry's own group: 'ignore' for every other
 * editor, every other group, an entry with no editor and an editor with no start. For the producing editor:
 * 'rebase' on Restore or Copy (see `acknowledgedStart`), 'reset' on Discard (the draft goes, as with Cancel).
 */
export function acknowledgementFor(
  ack: ConflictAcknowledgement,
  groups: readonly string[],
  start: EditorStart | undefined,
): 'ignore' | 'rebase' | 'reset' {
  if (!start) return 'ignore';
  const named = ack.entries.filter((entry) => groups.includes(entry.group));
  const mine = named.filter((entry) => entry.editors.includes(start.lineage));
  if (mine.length === 0) return 'ignore';
  return ack.discarded ? 'reset' : 'rebase';
}

/**
 * The start of an editor after a Restore or Copy it produced: its snapshot of the acknowledged groups moves to the
 * version the user was shown for them, and nothing else moves (another group of the same editor keeps its own
 * snapshot, so a Save still catches a newer server value there). Call it with the groups `acknowledgementFor` said
 * 'rebase' for. A start that is not the entries' editor comes back unchanged.
 */
export function acknowledgedStart(
  ack: ConflictAcknowledgement,
  groups: readonly string[],
  start: EditorStart | undefined,
): EditorStart | undefined {
  if (!start) return start;
  const fields = { ...start.fields };
  for (const entry of ack.entries) {
    if (groups.includes(entry.group) && entry.editors.includes(start.lineage)) Object.assign(fields, entry.fields);
  }
  return { revision: start.revision, fields, lineage: start.lineage };
}

/**
 * What an editor is based on when nothing is known about it: a revision that never existed, so a save from it
 * is checked as a stale draft (it is refused unless the server already holds exactly that text).
 */
export function staleEditorStart(): EditorStart {
  return { revision: -1, fields: {}, lineage: { columns: new Set<string>() } };
}

/**
 * The CV panel closes its editor when Save is clicked and reopens it if the save did not land. This says
 * what the answer does. A discard of the editor's group while the save ran (the epoch moved) means the
 * draft was thrown away: nothing reopens, whatever the outcome. A reopened draft always has a start;
 * one that lost its start is treated as stale, never as "checked against nothing".
 */
export function afterClosedEditorSave(
  outcome: EditorOutcome,
  epochAtSave: number,
  epochNow: number,
  start: EditorStart | undefined,
): { reopen: false } | { reopen: true; start: EditorStart } {
  if (editorSaveSucceeded(outcome) || epochAtSave !== epochNow) return { reopen: false };
  return { reopen: true, start: start ?? staleEditorStart() };
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
  /**
   * Per application: the store-shaped session as the server holds it (the last row applied,
   * plus what our own saves wrote). A property of the store that differs from this is
   * something the user typed and the server does not have yet.
   */
  const serverSessions = new Map<string, ApplicationSession>();
  /** Per application: column -> fingerprint of the value the server refused. */
  const rejected = new Map<string, Record<string, string>>();
  const conflictBuffers = new Map<string, Map<string, ConflictEntry>>();
  /**
   * Per application: store property -> the last value an editor's draft (or a Restore of an editor's text) put
   * there, by fingerprint, and the editors whose draft it is. A merge that sets that value aside names those
   * editors on the entry; a value that changed since (the fingerprint no longer matches) is no editor's draft.
   */
  const draftOwners = new Map<string, Map<string, { fp: string; editors: Set<EditorStart['lineage']> }>>();
  const reloadFailureAnnounced = new Set<string>();
  const chains = new Map<string, Promise<unknown>>();

  let conflictSeq = 0;
  const notify = (message: string, kind: SyncNoticeKind, conflictFor?: string, conflictEntries?: string[]) =>
    deps.notify({ message, kind, ...(conflictFor ? { conflictFor, conflictEntries: conflictEntries ?? [] } : {}) });

  /** Entries are kept per conflict, so every notice's text stays reachable. */
  const SOFT_BUFFER_LIMIT = 40;
  const overLimitLogged = new Set<string>();

  /** Is the user's text of this entry already on the server? Then nothing is lost by forgetting it. */
  function entrySettled(sessionId: string, entry: ConflictEntry): boolean {
    const server = serverSessions.get(sessionId);
    return server !== undefined && entry.changed.every((prop) => sameValue(server[prop], entry.props[prop]));
  }

  /**
   * Past the soft limit only an entry whose text is already on the server is forgotten, oldest
   * first. Unsettled text is never dropped to make room: the buffer grows past the limit and
   * says so loudly.
   */
  function addEntry(sessionId: string, entry: ConflictEntry): void {
    const buffer = conflictBuffers.get(sessionId) ?? new Map<string, ConflictEntry>();
    buffer.set(entry.id, entry);
    for (const candidate of [...buffer.values()]) {
      if (buffer.size <= SOFT_BUFFER_LIMIT) break;
      if (candidate.id !== entry.id && entrySettled(sessionId, candidate)) buffer.delete(candidate.id);
    }
    if (buffer.size > SOFT_BUFFER_LIMIT && !overLimitLogged.has(sessionId)) {
      overLimitLogged.add(sessionId);
      console.error(`[session-sync] ${buffer.size} unsaved conflict entries are kept for ${sessionId}; none can be forgotten without losing text.`);
    }
    conflictBuffers.set(sessionId, buffer);
  }

  type AcknowledgedListener = (sessionId: string, ack: ConflictAcknowledgement) => void;
  const acknowledgedListeners = new Set<AcknowledgedListener>();
  /**
   * Tell open editors the user has dealt with a conflict notice (restored, copied or discarded), so they can rebase.
   * On a discard the editor whose draft the entries hold also drops it: that draft is the text just thrown away,
   * and rebasing it onto the current revision would let the next Save write it over the server's newer version.
   * The acknowledgement names each entry's field group, editor and the server version the user was shown, so only
   * that editor acts on it, only for that group, and a rebase never moves past what the user saw.
   */
  function acknowledgeConflict(
    sessionId: string,
    entries: ConflictEntry[],
    discarded = false,
    seen: (entry: ConflictEntry) => Record<string, string> = (entry) => entry.fields,
  ): void {
    const ack: ConflictAcknowledgement = {
      discarded,
      entries: entries.map((entry) => ({ id: entry.id, group: entry.key, editors: [...entry.editors], fields: { ...seen(entry) } })),
    };
    acknowledgedListeners.forEach((listener) => listener(sessionId, ack));
  }
  function subscribeConflictAcknowledged(listener: AcknowledgedListener): () => void {
    acknowledgedListeners.add(listener);
    return () => { acknowledgedListeners.delete(listener); };
  }

  /**
   * A buffer entry: the user's version of a group, set against what the store shows now. `serverFields` is the
   * server's fingerprint of every column as the notice shows it.
   */
  function makeEntry(
    group: FieldGroup,
    theirs: ApplicationSession,
    shown: ApplicationSession,
    serverFields: Record<string, string>,
    editors: EditorStart['lineage'][],
  ): ConflictEntry {
    const props: Partial<ApplicationSession> = {};
    const base: Partial<ApplicationSession> = {};
    const changed: (keyof ApplicationSession)[] = [];
    for (const prop of group.props) {
      (props as Record<string, unknown>)[prop] = theirs[prop];
      (base as Record<string, unknown>)[prop] = shown[prop];
      if (!sameValue(theirs[prop], shown[prop])) changed.push(prop);
    }
    const fields: Record<string, string> = {};
    for (const column of group.columns) if (column in serverFields) fields[column] = serverFields[column];
    return { id: `c${++conflictSeq}`, key: group.key, label: group.label, columns: group.columns, props, base, changed, at: clock.now(), fields, editors };
  }

  /** These editors' text just went into the store for `prop`: a later merge that sets it aside names them. */
  function ownValue(sessionId: string, prop: string, value: unknown, editors: Iterable<EditorStart['lineage']>): void {
    const owners = draftOwners.get(sessionId) ?? new Map<string, { fp: string; editors: Set<EditorStart['lineage']> }>();
    const fp = fingerprint(value);
    const record = owners.get(prop);
    const next = record && record.fp === fp ? record : { fp, editors: new Set<EditorStart['lineage']>() };
    for (const editor of editors) next.editors.add(editor);
    if (next.editors.size === 0) return;
    owners.set(prop, next);
    draftOwners.set(sessionId, owners);
  }

  /** An editor's draft just went into the store: remember it as the owner of every property the draft changed. */
  function recordDraft(sessionId: string, before: ApplicationSession, after: ApplicationSession, lineage: EditorStart['lineage']): void {
    for (const group of FIELD_GROUPS) {
      for (const prop of group.props) {
        if (!sameValue(before[prop], after[prop])) ownValue(sessionId, prop, after[prop], [lineage]);
      }
    }
  }

  /** The editors whose draft the store holds for this group, on a property a conflict is about to set aside. */
  function draftEditorsOf(sessionId: string, group: FieldGroup, local: ApplicationSession, shown: ApplicationSession): EditorStart['lineage'][] {
    const owners = draftOwners.get(sessionId);
    const out = new Set<EditorStart['lineage']>();
    if (!owners) return [];
    for (const prop of group.props) {
      if (sameValue(local[prop], shown[prop])) continue;
      const record = owners.get(prop);
      if (record && record.fp === fingerprint(local[prop])) for (const editor of record.editors) out.add(editor);
    }
    return [...out];
  }

  function setUser(next: string | null): void {
    if (userId !== next) {
      baselines.clear();
      serverSessions.clear();
      rejected.clear();
      conflictBuffers.clear();
      draftOwners.clear();
      reloadFailureAnnounced.clear();
    }
    userId = next;
  }

  function forgetSession(sessionId: string): void {
    baselines.delete(sessionId);
    serverSessions.delete(sessionId);
    rejected.delete(sessionId);
    conflictBuffers.delete(sessionId);
    draftOwners.delete(sessionId);
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
      serverSessions.set(sessionId, mapped);
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
      // The entry names the editors whose draft this is (also when the merge runs inside that editor's save).
      conflicts.push(makeEntry(group, local, merged, serverFp, draftEditorsOf(sessionId, group, local, merged)));
    }
    merged.revision = incoming;
    const finalSession = options.decorate ? options.decorate(merged, local) : merged;

    baselines.set(sessionId, nextBaseline);
    serverSessions.set(sessionId, mapped);
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
      for (const entry of conflicts) addEntry(sessionId, entry);
      notify(options.conflictNotice ?? CONFLICT_NOTICE, 'info', sessionId, conflicts.map((entry) => entry.id));
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
        // The user's newer text for what an entry holds reached the server: that entry is settled.
        dropSettledEntries(sessionId, Object.keys(patch), session);
        recordSaved(sessionId, Object.keys(patch), session);
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

  /**
   * What a newly opened editor is based on: the current baseline, under a lineage of its own. With no baseline
   * (the application was never read here) it is a stale start, so a later Save is checked rather than trusted.
   */
  function getEditorStart(sessionId: string): EditorStart {
    const base = baselines.get(sessionId);
    if (!base) return staleEditorStart();
    return { revision: base.revision, fields: { ...base.fields }, lineage: { columns: new Set<string>() } };
  }

  /**
   * An editor that stays open after a save the server confirmed ('saved' or 'clean'): its snapshot of `columns`
   * (the ones that save confirmed it wrote, normally `start.lineage.columns`) moves to the current baseline. Every
   * other column keeps the snapshot it had, so a group the save did not write still catches a newer server value.
   */
  function rebaseEditorStart(sessionId: string, start: EditorStart, columns: Iterable<string>): EditorStart {
    const base = baselines.get(sessionId);
    const fields = { ...start.fields };
    if (base) for (const column of columns) if (column in base.fields) fields[column] = base.fields[column];
    return { revision: base?.revision ?? start.revision, fields, lineage: start.lineage };
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
      // An editor that knows nothing of what it opened on is checked as stale, never as "checked against nothing".
      const checked = start ?? staleEditorStart();
      const beforeFp = fingerprints(before);
      apply();
      const after = findSession(sessionId);
      if (!after) return 'gone';
      const draftFp = fingerprints(after);
      // The columns this draft sets: what apply() just changed, plus what an earlier try of the
      // same editor changed (a retry finds its own draft already in the store and changes nothing).
      const touched = [...new Set([
        ...Object.keys(draftFp).filter((column) => draftFp[column] !== beforeFp[column]),
        ...checked.lineage.columns,
      ])];
      for (const column of touched) checked.lineage.columns.add(column);

      const moved = touched.filter((column) => base.fields[column] !== checked.fields[column] && draftFp[column] !== base.fields[column]);
      if (moved.length > 0) {
        // The draft is based on text that is no longer the server's. Put the store back, keep the draft aside.
        writeSession(sessionId, before, 'replace');
        const seen = new Set<string>();
        const entryIds: string[] = [];
        for (const column of moved) {
          const group = GROUP_OF_COLUMN.get(column);
          if (!group || seen.has(group.key)) continue;
          seen.add(group.key);
          const entry = makeEntry(group, after, before, base.fields, [checked.lineage, ...draftEditorsOf(sessionId, group, after, before)]);
          addEntry(sessionId, entry);
          entryIds.push(entry.id);
        }
        notify(EDITOR_CONFLICT_NOTICE, 'info', sessionId, entryIds);
        return 'conflict';
      }
      // The draft is in the store now: a merge that sets it aside (in this save or later) names this editor.
      recordDraft(sessionId, before, after, checked.lineage);

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

  /** The entries a notice named that are still in the buffer. */
  function entriesFor(sessionId: string, ids: string[]): ConflictEntry[] {
    const wanted = new Set(ids);
    return getConflictBuffer(sessionId).filter((entry) => wanted.has(entry.id));
  }

  /** Has the user typed into this property since the server's version of it was last applied or written? */
  function userEdited(sessionId: string, session: ApplicationSession, prop: keyof ApplicationSession): boolean {
    const server = serverSessions.get(sessionId);
    return server ? !sameValue(session[prop], server[prop]) : false;
  }

  /** Our save wrote these columns: the server now holds what we sent for their properties. */
  function recordSaved(sessionId: string, columns: string[], sent: ApplicationSession): void {
    const server = serverSessions.get(sessionId);
    if (!server) return;
    const next = { ...server } as unknown as Record<string, unknown>;
    for (const column of columns) {
      const group = GROUP_OF_COLUMN.get(column);
      if (group) for (const prop of group.props) next[prop] = sent[prop];
    }
    serverSessions.set(sessionId, next as unknown as ApplicationSession);
  }

  /**
   * Forget the entries a save settled. An entry holds the text the user lost a
   * conflict with; it is settled when this save put exactly that text on the
   * server for every property it covers. A save that carries other text for those
   * properties (the user typed something else, or the server's value) settles nothing:
   * the entry stays, restorable until a newer version stands in its way.
   */
  function dropSettledEntries(sessionId: string, columns: string[], saved: ApplicationSession): void {
    const buffer = conflictBuffers.get(sessionId);
    if (!buffer) return;
    for (const entry of [...buffer.values()]) {
      if (!entry.columns.some((column) => columns.includes(column))) continue;
      if (entry.changed.every((prop) => sameValue(saved[prop], entry.props[prop]))) buffer.delete(entry.id);
    }
    if (buffer.size === 0) conflictBuffers.delete(sessionId);
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

  /** The user's text from the entries a notice named, ready to paste. */
  function conflictText(sessionId: string, ids: string[]): string {
    return entriesFor(sessionId, ids)
      .map((entry) => {
        const text = entry.changed.map((prop) => textOf(entry.props[prop])).filter(Boolean).join('\n\n');
        return `${entry.label}\n${text}`;
      })
      .join('\n\n---\n\n');
  }

  /**
   * The text to put on the clipboard for Copy, or null when there is nothing left to copy (the
   * entries were restored, settled or forgotten). The caller says so instead of copying an empty string.
   */
  function copyConflict(sessionId: string, ids: string[]): string | null {
    const text = conflictText(sessionId, ids);
    if (text.trim() === '') return null;
    acknowledgeConflict(sessionId, entriesFor(sessionId, ids));
    return text;
  }

  /**
   * Put the user's version of the entries a notice named back as an unsaved
   * edit, then save it the normal way: against the current baseline. An entry is
   * restored whole or not at all: if the user has typed something since, or the
   * server changed the field again since the notice, none of it is applied (so the
   * user's old text is never paired with the server's newer text) and the entry
   * stays in the buffer with a fresh notice.
   */
  function restoreConflict(sessionId: string, ids: string[]): Promise<SaveOutcome> {
    return withLock(sessionId, async () => {
      const entries = entriesFor(sessionId, ids);
      const session = findSession(sessionId);
      if (entries.length === 0 || !session) return 'skipped';
      const server = serverSessions.get(sessionId);
      const next = { ...session } as ApplicationSession;
      const buffer = conflictBuffers.get(sessionId);
      const kept: string[] = [];
      for (const entry of entries) {
        const blocked = entry.changed.some((prop) => userEdited(sessionId, session, prop)
          || (server !== undefined && !sameValue(server[prop], entry.base[prop])));
        if (blocked) {
          kept.push(entry.id);
          continue;
        }
        for (const prop of entry.changed) {
          (next as unknown as Record<string, unknown>)[prop] = entry.props[prop];
          // The restored text is still those editors' draft: a later conflict on it names them again.
          ownValue(sessionId, prop, entry.props[prop], entry.editors);
        }
        buffer?.delete(entry.id);
      }
      if (kept.length < entries.length) writeSession(sessionId, next, 'replace');
      if (buffer && buffer.size === 0) conflictBuffers.delete(sessionId);
      if (kept.length > 0) notify(CONFLICT_NOTICE, 'info', sessionId, kept);
      const outcome = await saveUnlocked(sessionId);
      // What the producing editor has now seen of each group: its own restored text where the server holds exactly
      // that, otherwise the version its notice showed. Never a newer server version it was not shown.
      const settled = baselines.get(sessionId);
      const now = findSession(sessionId);
      const nowFp = now ? fingerprints(now) : undefined;
      acknowledgeConflict(sessionId, entries, false, (entry) => {
        const restored = !kept.includes(entry.id) && settled !== undefined && now !== null && nowFp !== undefined
          && entry.changed.every((prop) => sameValue(now[prop], entry.props[prop]))
          && entry.columns.every((column) => nowFp[column] === settled.fields[column]);
        if (!restored) return entry.fields;
        const fields: Record<string, string> = {};
        for (const column of entry.columns) if (column in settled.fields) fields[column] = settled.fields[column];
        return fields;
      });
      return outcome;
    });
  }

  /** The user chose to throw the text away. */
  function discardConflict(sessionId: string, ids: string[]): void {
    const entries = entriesFor(sessionId, ids);
    const buffer = conflictBuffers.get(sessionId);
    for (const id of ids) buffer?.delete(id);
    if (buffer && buffer.size === 0) conflictBuffers.delete(sessionId);
    acknowledgeConflict(sessionId, entries, true);
  }

  return {
    setUser,
    forgetSession,
    applyServerRow,
    refreshFromServer,
    persistSessionEdits,
    getEditorStart,
    rebaseEditorStart,
    commitEditorSave,
    checkForRemoteChange,
    getConflictBuffer,
    conflictText,
    copyConflict,
    restoreConflict,
    discardConflict,
    acknowledgeConflict,
    subscribeConflictAcknowledged,
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
