/**
 * One tab, seen by the tests. `newClient` wraps the sync engine on its own
 * store. `legacyClient` wraps the round-1 module (e2e/tools/legacy) on the real
 * session store, exactly as the app called it before the restructure; there can
 * be only one of those per process, so legacy runs have one real tab and
 * model the others as plain server writers.
 */

import type { StoredSessionRow } from '@/lib/session-row-mapping';
import {
  createSyncEngine,
  columnFingerprints,
  editorSaveSucceeded,
  type EditorOutcome,
  type SessionStoreLike,
  type SyncNotice,
} from '@/lib/session-sync-engine';
import type { ApplicationSession } from '@/store/useSessionStore';
import { letterObject, type Field, type FakeClock, type FakeServer, type RequestScheduler } from './world';

export interface MutationResponse {
  revision: number;
  /** What the route returned: the new document, as store props. */
  props: Partial<ApplicationSession>;
  columns: string[];
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
  editorStart(app: string): unknown;
  editorCommit(app: string, start: unknown, apply: () => void): Promise<string>;
  editorSucceeded(outcome: string): boolean;
  mutationResponse(app: string, response: MutationResponse): Promise<void>;
  conflictJson(app: string): string;
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
        coverLetter: { ...(s.coverLetter ?? (letterObject('') as unknown as NonNullable<ApplicationSession['coverLetter']>)), body: token },
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
  }
}

/** The store props a regenerate response carries for a field. */
export function responseProps(field: Field, token: string): { props: Partial<ApplicationSession>; columns: string[] } {
  const probe = fieldMutation(field, token)({
    id: 'probe', jobTitle: '', company: '', createdAt: '', updatedAt: '', jobDescription: '',
    matchingSkills: [], missingSkills: [], suggestions: [], requirements: null, gaps: null, generatedCV: null,
    chatMessages: [],
  } as unknown as ApplicationSession);
  switch (field) {
    case 'coverLetter': return { props: { coverLetter: probe.coverLetter }, columns: ['cover_letter'] };
    case 'email': return { props: { email: probe.email }, columns: ['email', 'email_subject', 'email_body'] };
    case 'followUpEmail': return { props: { followUpEmail: probe.followUpEmail }, columns: ['follow_up_email'] };
    default: return { props: {}, columns: [] };
  }
}

// ---------------------------------------------------------------------------
// The restructured engine
// ---------------------------------------------------------------------------

export function newClient(id: string, world: World, hooks: { onSaveCall?: (app: string, expected: number) => void } = {}): Adapter {
  const store = makeStore();
  const notices: SyncNotice[] = [];
  const apps = new Set<string>();
  const engine = createSyncEngine({
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
    notify: (notice) => notices.push(notice),
    clock: {
      now: () => world.clock.now(),
      setTimeout: (fn, ms) => world.clock.setTimeout(fn, ms),
      clearTimeout: (handle) => world.clock.clearTimeout(handle),
    },
  });
  engine.setUser('u');

  return {
    id, kind: 'new', notices, apps,
    session: (app) => findIn(store, app),
    fingerprints: (app) => {
      const session = findIn(store, app);
      return session ? columnFingerprints(session) : null;
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
    editorSucceeded: (outcome) => editorSaveSucceeded(outcome as EditorOutcome),
    mutationResponse: async (app) => { await engine.refreshFromServer(app); },
    conflictJson: (app) => JSON.stringify(engine.getConflictBuffer(app)),
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
  const { mapSessionRowToStore } = await import('@/lib/session-row-mapping');
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
      return session ? columnFingerprints(session) : null;
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
    // A regenerate response: write the returned content into the store, then adopt its revision.
    mutationResponse: async (app, response) => {
      editIn(store, app, (session) => ({ ...session, ...response.props }));
      await legacy.adoptServerWrite(app, response.revision, response.columns);
    },
    conflictJson: () => '[]',
    rejectedColumns: () => [],
    baseline: (app) => {
      const revision = legacy.getBaselineRevision(app);
      return revision === undefined ? undefined : { revision, fields: null };
    },
  };
}
