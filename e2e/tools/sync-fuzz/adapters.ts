/**
 * One tab, seen by the tests.
 *
 * `newClient` wraps a sync engine on its own store, together with the glue the
 * app puts around it (what happens when a generation finishes, when an editor
 * save returns, when a notice's Restore or Copy is clicked). Two variants:
 *
 *   current  the engine in src/lib/session-sync-engine.ts and today's glue.
 *   round2   the engine as it was at review round 2 (e2e/tools/legacy/session-sync-engine.round2.ts)
 *            with the glue of that round, kept so the harness can show it fail.
 *
 * `legacyClient` wraps the round-1 module (e2e/tools/legacy) on the real session
 * store, as the app called it before the restructure; there can be only one of
 * those per process, so legacy runs have one real tab and model the others as
 * plain server writers.
 */

import type { StoredSessionRow } from '@/lib/session-row-mapping';
import { mapSessionRowToStore } from '@/lib/session-row-mapping';
import type {
  ConflictAcknowledgement,
  ConflictEntry,
  EditorOutcome,
  EditorStart,
  SessionStoreLike,
  SyncNotice,
} from '@/lib/session-sync-engine';
import type { ApplicationSession } from '@/store/useSessionStore';
import { letterObject, type Field, type FakeClock, type FakeServer, type RequestScheduler } from './world';

type EngineModule = typeof import('@/lib/session-sync-engine');

export interface MutationResponse {
  revision: number;
  /** What the route returned: the new document, as store props. */
  props: Partial<ApplicationSession>;
  columns: string[];
}

/** What the app does once an editor save has returned. */
export interface EditorAfter {
  close: boolean;
  /** When the editor stays open after a save the server accepted: what its next save is based on. */
  start?: unknown;
}

export interface Adapter {
  readonly id: string;
  readonly kind: 'new' | 'legacy';
  readonly notices: SyncNotice[];
  readonly apps: Set<string>;
  session(app: string): ApplicationSession | null;
  fingerprints(app: string): Record<string, string> | null;
  edit(app: string, mutate: (session: ApplicationSession) => ApplicationSession): void;
  setCurrent(app: string): void;
  hydrate(row: StoredSessionRow): Promise<void>;
  handoff(row: StoredSessionRow): Promise<void>;
  open(row: StoredSessionRow): Promise<void>;
  save(app: string): Promise<string>;
  poll(app: string): Promise<string>;
  editorStart(app: string, previous?: unknown): unknown;
  editorCommit(app: string, start: unknown, apply: () => void): Promise<string>;
  editorSucceeded(outcome: string): boolean;
  /** The app's reaction to an editor save that returned: close the editor, or keep it. */
  editorAfter(app: string, outcome: string, sentDraft: string, currentDraft: string, previousStart: unknown): EditorAfter;
  /** A regenerate or follow-up answered: the document is already saved on the server. */
  mutationResponse(app: string, response: MutationResponse): Promise<void>;
  /** The generation finished (`workflow_complete`), carrying the generated fields. */
  workflowComplete(app: string, response: MutationResponse): Promise<void>;
  /** The tracker status write answered. */
  statusRefresh(app: string): Promise<void>;
  conflictJson(app: string): string;
  /** The buffer entries a notice is about, as text containing their tokens. */
  noticeText(notice: SyncNotice): string;
  /** The buffer entries a notice named, with the user text each holds and the field group they are about. */
  noticeEntries(notice: SyncNotice): { id: string; tokens: string[]; group: string }[];
  /** The ids of the entries the engine still holds for an application. */
  bufferIds(app: string): string[];
  restoreNotice(notice: SyncNotice): Promise<string>;
  /** What Copy puts on the clipboard, or null when there is nothing left to copy. */
  copyNotice(notice: SyncNotice): string | null;
  /** Dismiss then Discard: the user throws the notice's text away. */
  dismissNotice(notice: SyncNotice): void;
  /** Called when the user has dealt with a conflict notice of an application (restore, copy, discard). `ack.discarded` is true for Dismiss then Discard. */
  subscribeAcknowledged(listener: (app: string, ack: ConflictAcknowledgement) => void): () => void;
  /** What a panel whose editor holds these field groups does with an acknowledgement (the engine's own rule, which the panels call). */
  acknowledgementFor(ack: ConflictAcknowledgement, groups: string[], start: unknown): 'ignore' | 'rebase' | 'reset';
  /** The start a panel moves its editor to after a Restore or Copy, for the groups `acknowledgementFor` said 'rebase' for. */
  acknowledgedStart(ack: ConflictAcknowledgement, groups: string[], start: unknown): unknown;
  /** The snapshot an editor start holds (column -> server fingerprint), for the checks; undefined for engines without one. */
  startFields(start: unknown): Record<string, string> | undefined;
  /** A buffer entry this tab has raised a notice about, by id: its group, columns, user tokens and the fingerprint of each changed property. */
  entryInfo(id: string): { group: string; columns: string[]; tokens: string[]; changed: Record<string, string> } | undefined;
  /** What the CV panel does when the answer to a save comes back after it closed its editor on Save. */
  afterClosedEditorSave(outcome: string, epochAtSave: number, epochNow: number, start: unknown): { reopen: false } | { reopen: true; start: unknown };
  rejectedColumns(app: string): string[];
  baseline(app: string): { revision: number; fields: Record<string, string> | null } | undefined;
}

export interface World {
  clock: FakeClock;
  server: FakeServer;
  net: RequestScheduler;
}

// ---------------------------------------------------------------------------
// Shared store plumbing
// ---------------------------------------------------------------------------

interface Slice {
  sessions: ApplicationSession[];
  currentSession: ApplicationSession | null;
}

export function makeStore(): SessionStoreLike {
  let state: Slice & Record<string, unknown> = { sessions: [], currentSession: null };
  return {
    getState: () => state,
    setState: (updater) => { state = { ...state, ...updater(state) }; },
  };
}

function findIn(store: SessionStoreLike, app: string): ApplicationSession | null {
  const state = store.getState();
  return state.sessions.find((session) => session.id === app)
    ?? (state.currentSession?.id === app ? state.currentSession : null);
}

function editIn(store: SessionStoreLike, app: string, mutate: (session: ApplicationSession) => ApplicationSession): void {
  // What updateSessionById does: replace in the list and in currentSession.
  store.setState((state) => ({
    sessions: state.sessions.map((session) => (session.id === app ? mutate(session) : session)),
    currentSession: state.currentSession?.id === app ? mutate(state.currentSession) : state.currentSession,
  }));
}

function addToList(store: SessionStoreLike, session: ApplicationSession, makeCurrent: boolean): void {
  store.setState((state) => ({
    sessions: state.sessions.some((item) => item.id === session.id)
      ? state.sessions.map((item) => (item.id === session.id ? session : item))
      : [session, ...state.sessions],
    currentSession: makeCurrent || state.currentSession?.id === session.id ? session : state.currentSession,
  }));
}

function setCurrentIn(store: SessionStoreLike, app: string): void {
  store.setState((state) => ({
    currentSession: state.sessions.find((session) => session.id === app) ?? state.currentSession,
  }));
}

const cast = <T>(value: unknown) => value as T;

const baseCvData = () => cast<NonNullable<ApplicationSession['optimizedCVData']>>({
  personal: { fullName: 'N', email: 'n@example.test', currentTitle: 'seed title' },
  experience: [], education: [], skills: [], languages: [], certifications: [],
});

/** The edit a user makes to a field, as a store mutation. */
export function fieldMutation(field: Field, token: string, bad = false): (session: ApplicationSession) => ApplicationSession {
  switch (field) {
    case 'jobTitle': return (s) => ({ ...s, jobTitle: token });
    case 'company': return (s) => ({ ...s, company: token });
    case 'jobDescription': return (s) => ({ ...s, jobDescription: bad ? `BAD-${token}` : token });
    case 'selectedTemplate': return (s) => ({ ...s, selectedTemplate: `tpl-${token}` });
    case 'coverLetter':
      return (s) => ({
        ...s,
        coverLetter: { ...(s.coverLetter ?? cast<NonNullable<ApplicationSession['coverLetter']>>(letterObject(''))), body: token },
      });
    case 'email':
      return (s) => ({
        ...s,
        email: { ...(s.email ?? { subject: '', body: '', attachmentNote: '' }), subject: `s-${token}`, body: token, attachmentNote: '' },
      });
    case 'followUpEmail':
      return (s) => ({
        ...s,
        followUpEmail: { subject: `f-${token}`, body: token, recommendedDelay: 5 },
      });
    case 'cv':
      return (s) => {
        const data = s.optimizedCVData ?? baseCvData();
        return {
          ...s,
          generatedCV: s.generatedCV ?? cast<NonNullable<ApplicationSession['generatedCV']>>({ content: 'cv content', changes: [], optimizedFor: 'Position' }),
          optimizedCVData: { ...data, personal: { ...data.personal, currentTitle: token } },
        };
      };
    case 'screening':
      return (s) => ({
        ...s,
        screeningAnswers: [{ id: 's1', question: 'q', answer: token, createdAt: 'x' }],
      });
    case 'fitAssessment': return (s) => ({ ...s, fitAssessment: cast<ApplicationSession['fitAssessment']>({ summary: token, score: 50 }) });
    case 'requirements':
      return (s) => ({ ...s, requirements: cast<ApplicationSession['requirements']>({ ...(s.requirements ?? {}), title: token }) });
  }
}

/** The store props a regenerate response carries for a field. */
export function responseProps(field: Field, token: string): { props: Partial<ApplicationSession>; columns: string[] } {
  const probe = fieldMutation(field, token)(cast<ApplicationSession>({
    id: 'probe', jobTitle: '', company: '', createdAt: '', updatedAt: '', jobDescription: '',
    matchingSkills: [], missingSkills: [], suggestions: [], requirements: null, gaps: null, generatedCV: null,
    chatMessages: [],
  }));
  switch (field) {
    case 'coverLetter': return { props: { coverLetter: probe.coverLetter }, columns: ['cover_letter'] };
    case 'email': return { props: { email: probe.email }, columns: ['email', 'email_subject', 'email_body'] };
    case 'followUpEmail': return { props: { followUpEmail: probe.followUpEmail }, columns: ['follow_up_email'] };
    default: return { props: {}, columns: [] };
  }
}

/** What `workflow_complete` carries: the generated fields as the store shape, as of the revision the kit was written at. */
export function kitProps(row: StoredSessionRow): Partial<ApplicationSession> {
  const mapped = mapSessionRowToStore(row);
  return {
    generatedCV: mapped.generatedCV,
    optimizedCVData: mapped.optimizedCVData,
    coverLetter: mapped.coverLetter,
    email: mapped.email,
    followUpEmail: mapped.followUpEmail,
    requirements: mapped.requirements,
  };
}

/** The text an entry exists to keep: its changed properties (the round-2 engine kept every property). */
function userText(entry: ConflictEntry): unknown {
  if (!entry.changed) return entry.props;
  const out: Record<string, unknown> = {};
  for (const prop of entry.changed) out[prop] = (entry.props as Record<string, unknown>)[prop];
  return out;
}

// The text a user types carries the tab's letter (A, B, or O for the other tab's edit); server writes carry G, K, R or S.
const TOKEN = /t:[ABO][0-9]+;/g;
/** The tokens in a piece of text that a user typed. */
export const tokensIn = (text: string): string[] => text.match(TOKEN) ?? [];

// ---------------------------------------------------------------------------
// The restructured engine and the app's glue around it
// ---------------------------------------------------------------------------

export type EngineVariantName = 'current' | 'round2';

export async function loadEngine(variant: EngineVariantName): Promise<EngineModule> {
  if (variant === 'round2') return (await import('../legacy/session-sync-engine.round2')) as unknown as EngineModule;
  return import('@/lib/session-sync-engine');
}

export function newClient(
  id: string,
  world: World,
  engineModule: EngineModule,
  variant: EngineVariantName,
  hooks: {
    onSaveCall?: (app: string, expected: number) => void;
    /** A conflict notice was raised; its entries are already in the buffer. */
    onNotice?: (notice: SyncNotice) => void;
  } = {},
): Adapter {
  const store = makeStore();
  const notices: SyncNotice[] = [];
  const noticeEntries = new WeakMap<SyncNotice, ConflictEntry[]>();
  const entriesById = new Map<string, ConflictEntry>();
  const engine: ReturnType<EngineModule['createSyncEngine']> = engineModule.createSyncEngine({
    actions: {
      getRow: (app) => world.net.request(id, 'getRow', () => world.server.rowOf(app)),
      getRevision: (app) => world.net.request(id, 'getRevision', () => {
        const revision = world.server.revisionOf(app);
        return revision === null ? null : { revision };
      }),
      saveEdits: (app, expected, patch) => {
        hooks.onSaveCall?.(app, expected);
        return world.net.request(id, 'save', () => world.server.save(app, expected, patch, id));
      },
    },
    store,
    notify: (notice) => {
      notices.push(notice);
      if (notice.conflictFor) {
        // The entries this notice is about: named by id when the engine says so, otherwise the ones made just now.
        const all = engine.getConflictBuffer(notice.conflictFor);
        const named = notice.conflictEntries;
        const entries = named ? all.filter((entry) => named.includes(entry.id)) : all.filter((entry) => entry.at === world.clock.now());
        noticeEntries.set(notice, entries);
        for (const entry of entries) if (entry.id && !entriesById.has(entry.id)) entriesById.set(entry.id, entry);
        hooks.onNotice?.(notice);
      }
    },
    clock: {
      now: () => world.clock.now(),
      setTimeout: (fn, ms) => world.clock.setTimeout(fn, ms),
      clearTimeout: (handle) => world.clock.clearTimeout(handle),
    },
  });
  engine.setUser('u');
  const apps = new Set<string>();
  const current = variant === 'current';
  // The two engines expose the buffer actions under different names.
  const anyEngine = engine as unknown as Record<string, (...args: unknown[]) => unknown>;

  return {
    id, kind: 'new', notices, apps,
    session: (app) => findIn(store, app),
    fingerprints: (app) => {
      const session = findIn(store, app);
      return session ? engineModule.columnFingerprints(session) : null;
    },
    edit: (app, mutate) => editIn(store, app, mutate),
    setCurrent: (app) => setCurrentIn(store, app),
    hydrate: async (row) => {
      const result = await engine.applyServerRow(row.id, row, 'hydrate');
      if (result.session) addToList(store, result.session, store.getState().currentSession === null);
      apps.add(row.id);
    },
    handoff: async (row) => {
      const result = await engine.applyServerRow(row.id, row, 'handoff', { placement: 'upsert' });
      if (result.session) setCurrentIn(store, row.id);
      apps.add(row.id);
    },
    open: async (row) => {
      await engine.applyServerRow(row.id, row, 'open', { placement: 'upsert' });
      apps.add(row.id);
    },
    save: (app) => engine.persistSessionEdits(app),
    poll: (app) => engine.checkForRemoteChange(app),
    editorStart: (app) => engine.getEditorStart(app),
    editorCommit: (app, start, apply) => engine.commitEditorSave(app, start as never, apply),
    editorSucceeded: (outcome) => engineModule.editorSaveSucceeded(outcome as EditorOutcome),
    editorAfter: (app, outcome, sent, now, previousStart) => {
      if (!engineModule.editorSaveSucceeded(outcome as EditorOutcome)) return { close: false };
      // Round 2 closed the editor on any success, even if the user had typed more while it saved.
      if (!current) return { close: true };
      if (engineModule.editorShouldClose(outcome as EditorOutcome, sent, now)) return { close: true };
      // The save confirmed the columns the draft sets: only those move (the panels do the same).
      const start = previousStart as EditorStart | undefined;
      return { close: false, start: start ? engine.rebaseEditorStart(app, start, start.lineage.columns) : start };
    },
    mutationResponse: async (app) => { await engine.refreshFromServer(app); },
    workflowComplete: async (app, response) => {
      // Round 2 installed the generated fields from the response before it refreshed.
      if (!current) editIn(store, app, (session) => ({ ...session, ...response.props }));
      await engine.refreshFromServer(app);
    },
    statusRefresh: async (app) => { await engine.refreshFromServer(app); },
    // Only the user's text counts as buffered; `base` holds what the server showed instead.
    conflictJson: (app) => JSON.stringify(engine.getConflictBuffer(app).map(userText)),
    noticeText: (notice) => JSON.stringify((noticeEntries.get(notice) ?? []).map(userText)),
    noticeEntries: (notice) => (noticeEntries.get(notice) ?? []).map((entry) => ({
      id: entry.id ?? `${entry.key}@${entry.at}`,
      tokens: tokensIn(JSON.stringify(userText(entry))),
      group: entry.key,
    })),
    bufferIds: (app) => engine.getConflictBuffer(app).map((entry) => entry.id ?? `${entry.key}@${entry.at}`),
    dismissNotice: (notice) => {
      if (current && notice.conflictFor) anyEngine.discardConflict(notice.conflictFor, notice.conflictEntries ?? []);
    },
    subscribeAcknowledged: (listener) => (current ? (anyEngine.subscribeConflictAcknowledged(listener) as () => void) : () => undefined),
    acknowledgementFor: (ack, groups, start) => (current ? engineModule.acknowledgementFor(ack, groups, start as never) : 'ignore'),
    acknowledgedStart: (ack, groups, start) => (current ? engineModule.acknowledgedStart(ack, groups, start as never) : start),
    startFields: (start) => (current && start ? { ...(start as EditorStart).fields } : undefined),
    entryInfo: (id) => {
      const entry = entriesById.get(id);
      if (!entry) return undefined;
      const changed: Record<string, string> = {};
      for (const prop of entry.changed ?? []) changed[prop] = JSON.stringify((entry.props as Record<string, unknown>)[prop] ?? null);
      return { group: entry.key, columns: entry.columns, tokens: tokensIn(JSON.stringify(userText(entry))), changed };
    },
    afterClosedEditorSave: (outcome, epochAtSave, epochNow, start) => (current
      ? engineModule.afterClosedEditorSave(outcome as EditorOutcome, epochAtSave, epochNow, start as never)
      : { reopen: false }),
    restoreNotice: async (notice) => {
      if (!notice.conflictFor) return 'skipped';
      // Round 2 restored every buffered entry of the application, whichever notice was clicked.
      if (!current) return String(await anyEngine.restoreConflictBuffer(notice.conflictFor));
      return String(await anyEngine.restoreConflict(notice.conflictFor, notice.conflictEntries ?? []));
    },
    copyNotice: (notice) => {
      if (!notice.conflictFor) return null;
      // Round 2 had no "nothing left" answer: it copied whatever text it had, empty or not.
      if (!current) return String(anyEngine.conflictBufferText(notice.conflictFor));
      return anyEngine.copyConflict(notice.conflictFor, notice.conflictEntries ?? []) as string | null;
    },
    rejectedColumns: (app) => engine.debug.rejected(app),
    baseline: (app) => engine.debug.baseline(app),
  };
}

// ---------------------------------------------------------------------------
// The round-1 module, called the way the app called it
// ---------------------------------------------------------------------------

export async function legacyClient(id: string, world: World): Promise<Adapter> {
  const localStore = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => localStore.get(key) ?? null,
    setItem: (key: string, value: string) => { localStore.set(key, value); },
    removeItem: (key: string) => { localStore.delete(key); },
  };
  (globalThis as unknown as { __legacyActions: unknown }).__legacyActions = {
    getSession: (app: string) => world.net.request(id, 'getRow', () => world.server.rowOf(app)),
    getApplicationRevision: (app: string) => world.net.request(id, 'getRevision', () => {
      const revision = world.server.revisionOf(app);
      return revision === null ? null : { revision };
    }),
    saveApplicationEdits: (app: string, expected: number, patch: Record<string, unknown>) =>
      world.net.request(id, 'save', () => world.server.save(app, expected, patch, id)),
  };
  const legacy = await import('../legacy/session-sync.round1');
  const { useSessionStore } = await import('@/store/useSessionStore');
  const engineModule = await import('@/lib/session-sync-engine');
  const store = useSessionStore as unknown as SessionStoreLike;
  useSessionStore.setState({ sessions: [], currentSession: null });
  const notices: SyncNotice[] = [];
  legacy.subscribeSyncNotices((message, kind) => notices.push({ message, kind }));
  legacy.setSyncUser(null);
  legacy.setSyncUser('u');
  const apps = new Set<string>();

  return {
    id, kind: 'legacy', notices, apps,
    session: (app) => findIn(store, app),
    fingerprints: (app) => {
      const session = findIn(store, app);
      return session ? engineModule.columnFingerprints(session) : null;
    },
    edit: (app, mutate) => editIn(store, app, mutate),
    setCurrent: (app) => setCurrentIn(store, app),
    // Hydration and opening a stored application: remember the row, put it in the list.
    hydrate: async (row) => {
      const mapped = legacy.rememberServerRow(row);
      addToList(store, mapped, store.getState().currentSession === null);
      apps.add(row.id);
    },
    open: async (row) => {
      const mapped = legacy.rememberServerRow(row);
      addToList(store, mapped, false);
      apps.add(row.id);
    },
    // The feed handoff: it mapped the row and installed it. It never registered a baseline.
    handoff: async (row) => {
      addToList(store, mapSessionRowToStore(row), true);
      apps.add(row.id);
    },
    save: (app) => legacy.persistSessionEdits(app),
    poll: (app) => legacy.checkForRemoteChange(app),
    editorStart: (app) => legacy.getBaselineRevision(app),
    editorCommit: (app, start, apply) => legacy.commitEditorSave(app, start as number | undefined, apply),
    // The panels closed the editor on anything but a conflict.
    editorSucceeded: (outcome) => outcome !== 'conflict',
    editorAfter: (_app, outcome) => ({ close: outcome !== 'conflict' }),
    // A regenerate response: write the returned content into the store, then adopt its revision.
    mutationResponse: async (app, response) => {
      editIn(store, app, (session) => ({ ...session, ...response.props }));
      await legacy.adoptServerWrite(app, response.revision, response.columns);
    },
    workflowComplete: async (app, response) => {
      editIn(store, app, (session) => ({ ...session, ...response.props }));
      await legacy.adoptServerWrite(app, response.revision, []);
    },
    statusRefresh: async () => undefined,
    conflictJson: () => '[]',
    noticeText: () => '',
    noticeEntries: () => [],
    bufferIds: () => [],
    restoreNotice: async () => 'skipped',
    copyNotice: () => null,
    dismissNotice: () => undefined,
    subscribeAcknowledged: () => () => undefined,
    acknowledgementFor: () => 'ignore',
    acknowledgedStart: (_ack, _groups, start) => start,
    startFields: () => undefined,
    entryInfo: () => undefined,
    afterClosedEditorSave: () => ({ reopen: false }),
    rejectedColumns: () => [],
    baseline: (app) => {
      const revision = legacy.getBaselineRevision(app);
      return revision === undefined ? undefined : { revision, fields: null };
    },
  };
}
