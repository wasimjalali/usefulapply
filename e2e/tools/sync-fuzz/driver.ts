/**
 * The randomized interleaving run and its invariants.
 *
 * One run: a fake server, two tabs (or one real tab and a modelled second
 * writer, for the legacy module) and an agent, a random sequence of
 * operations whose requests are answered in random order, late, lost or never,
 * then a settle phase on a healthy network, then the invariants.
 *
 * What the operations cover: local edits; autosaves; polls; editors that are
 * opened, typed into (also while a save is in flight) and saved; regenerate and
 * workflow_complete responses that carry generated content and arrive late;
 * tracker status writes; writes that do NOT bump the revision (workflow state,
 * and in the round-2 server model the silent `requirements` annotation); agent
 * and other-tab writes; feed handoffs; opening and re-opening an application;
 * Copy and Restore on conflict notices, new and old. The fields include the
 * multi-column groups: the CV with its embedded structured data and screening
 * answers, the email with its derived subject and body, the fit assessment.
 *
 *   I1  no lost edit: the last thing a user typed into a field is on the server
 *       (an accepted write holds it), or in a conflict buffer with a notice
 *       raised, or still unsaved because the server refused it (and the user
 *       was told). An editor that was told "saved" has its exact draft on the
 *       server, and an editor never closes over text typed during its save.
 *       Text set aside in a conflict buffer reaches the server only when the
 *       user asked for it back with Restore on the notice that names it, and
 *       Copy offers only the text of the notice it was clicked on (or says there
 *       is nothing left). A notice stays until the user restores, copies or
 *       discards, so the text behind every open notice stays reachable. A save
 *       never writes older user text over newer user text unless the user asked
 *       for it, and a value one writer saved is only replaced by a writer that
 *       had seen it.
 *   I2  no stale overwrite: every save names a revision the writer's baseline
 *       is a truthful snapshot of; a baseline never claims a revision whose
 *       content it does not hold and never moves backwards; a save only
 *       overwrites a server value its writer's store had shown (so a value
 *       the server changed without announcing it, or one that arrived stale,
 *       is not overwritten unseen).
 *   I3  convergence: at quiescence every tab's store equals the server's row
 *       (except values the server refuses), its status is the server's, and its
 *       baseline is the server's revision.
 *   I4  no loops: the settle phase reaches a fixed point, and a second pass
 *       over a converged world raises no notice and makes no write.
 *   I5  refused fields do not block others: covered by I3, plus a refused
 *       value must be listed as rejected, not silently dropped.
 */

import { columnFingerprints } from '@/lib/session-sync-engine';
import type { SyncNotice } from '@/lib/session-sync-engine';
import type { Adapter, EngineVariantName, MutationResponse } from './adapters';
import { fieldMutation, kitProps, legacyClient, loadEngine, newClient, responseProps, tokensIn } from './adapters';
import {
  EDITOR_FIELDS, FIELDS, FakeClock, FakeServer, RequestScheduler, flush, makeRng, serverColumns, tick, tokenOf,
  type Field, type Rng,
} from './world';

export type InvariantCode = 'I1' | 'I2' | 'I3' | 'I4' | 'I5' | 'ERR';

export interface Violation {
  code: InvariantCode;
  message: string;
}

export interface RunStats {
  ops: number;
  edits: number;
  editorSaves: number;
  typedDuringSave: number;
  regens: number;
  workflows: number;
  trackerWrites: number;
  silentWrites: number;
  restores: number;
  copies: number;
  agentWrites: number;
  handoffs: number;
  polls: number;
  saves: number;
  requests: number;
  dropped: number;
  lostAnswers: number;
  hung: number;
  conflictNotices: number;
  failureNotices: number;
  settleRounds: number;
}

export const emptyStats = (): RunStats => ({
  ops: 0, edits: 0, editorSaves: 0, typedDuringSave: 0, regens: 0, workflows: 0, trackerWrites: 0, silentWrites: 0,
  restores: 0, copies: 0, agentWrites: 0, handoffs: 0, polls: 0, saves: 0, requests: 0, dropped: 0, lostAnswers: 0,
  hung: 0, conflictNotices: 0, failureNotices: 0, settleRounds: 0,
});

export interface RunResult {
  seed: number;
  violations: Violation[];
  stats: RunStats;
}

interface EditRecord {
  client: string;
  app: string;
  field: Field;
  token: string;
  /** An editor draft whose commit failed keeps living in that editor. */
  viaEditor: boolean;
}

interface Editor {
  client: Adapter;
  app: string;
  field: Field;
  /** What the user has typed so far. */
  draft: string;
  /** Every draft this editor held or sent, for the I1 accounting. */
  tokens: Set<string>;
  start: unknown;
  committing: boolean;
  /** Whether the editor had a start when it opened. One that has lost it must never save as if it had none. */
  hadStart: boolean;
  /** The CV panel closes its editor when Save is clicked and reopens it only if the save did not land. */
  closesOnSave: boolean;
  /** Counts the discards of this editor's text, as the panels do: a save started before one must not reopen the draft. */
  epoch: number;
}

export const GROUP_COLUMNS: Record<Field, string[]> = {
  jobTitle: ['job_title'],
  company: ['company'],
  jobDescription: ['job_description'],
  selectedTemplate: ['selected_template'],
  coverLetter: ['cover_letter'],
  email: ['email', 'email_subject', 'email_body'],
  followUpEmail: ['follow_up_email'],
  cv: ['generated_cv', 'optimized_cv_text'],
  screening: ['generated_cv', 'optimized_cv_text'],
  fitAssessment: ['fit_assessment'],
  requirements: ['requirements'],
};

const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

export interface VerifyContext {
  world: { clock: FakeClock; server: FakeServer; net: RequestScheduler };
  clients: Adapter[];
  lastEdit: Map<string, EditRecord>;
  openEditorTokens: Set<string>;
  violate: (code: InvariantCode, message: string) => void;
  stats: RunStats;
  checkBaseline?: (adapter: Adapter, app: string, where: string) => void;
  /** Text the user threw away on purpose (Dismiss, then Discard). */
  discarded?: Set<string>;
  /** Extra checks the run adds at the end (notices still open, values replaced by writers that had not seen them). */
  finalChecks?: () => void;
  /** Called after every settle step: records what each store shows and checks baselines only move forward. */
  observe?: (where: string) => void;
}

/** Heal the network, let every tab save and poll until nothing changes, then check I1 to I5. */
export async function settleAndVerify(ctx: VerifyContext): Promise<void> {
  const { world, clients, lastEdit, openEditorTokens, violate, stats } = ctx;
  const { server, net } = world;
  const appsOf = (client: Adapter) => [...client.apps];
  const checkAllBaselines = (where: string) => {
    ctx.observe?.(where);
    if (!ctx.checkBaseline) return;
    for (const client of clients) for (const app of client.apps) ctx.checkBaseline(client, app, where);
  };

  // -- settle on a healthy network -----------------------------------------
  net.chaos = false;
  net.reliable = true;
  await flush();
  const noticeCount = () => clients.reduce((sum, client) => sum + client.notices.length, 0);
  const worldHash = () => JSON.stringify([
    [...server.apps.values()].map((app) => [app.id, app.revision]),
    clients.map((client) => [...client.apps].map((app) => [app, client.fingerprints(app), client.baseline(app)?.revision])),
  ]);
  let previous = '';
  let converged = false;
  for (let round = 0; round < 10; round++) {
    stats.settleRounds = round + 1;
    for (const client of clients) {
      for (const app of appsOf(client)) {
        await client.save(app);
        checkAllBaselines('settle save');
        await client.poll(app);
        checkAllBaselines('settle poll');
      }
    }
    await flush();
    const hash = worldHash();
    if (hash === previous) { converged = true; break; }
    previous = hash;
  }
  if (!converged) violate('I4', 'the settle phase did not reach a fixed point in 10 rounds');
  // A converged world stays quiet: another pass writes nothing and raises nothing.
  const noticesBefore = noticeCount();
  const writesBefore = server.accepted.length;
  for (const client of clients) for (const app of appsOf(client)) { await client.save(app); await client.poll(app); }
  await flush();
  if (noticeCount() !== noticesBefore) violate('I4', 'a pass over a converged world raised a notice');
  if (server.accepted.length !== writesBefore) violate('I4', 'a pass over a converged world wrote to the server');
  checkAllBaselines('settled');

  // -- invariants at quiescence ----------------------------------------------
  for (const client of clients) {
    for (const app of client.apps) {
      const session = client.session(app);
      const base = client.baseline(app);
      const current = server.revisionOf(app);
      if (!session) { violate('I3', `${client.id} lost ${app} from its store`); continue; }
      if (current === null) continue;
      if (!base) { violate('I3', `${client.id} holds ${app} with no baseline, so nothing it edits can save`); continue; }
      if (base.revision !== current) violate('I3', `${client.id}'s baseline of ${app} is revision ${base.revision}, the server is at ${current}`);
      const truth = server.truth(app, current)!;
      const local = columnFingerprints(session);
      const refused = new Set(client.rejectedColumns(app));
      for (const [column, fp] of Object.entries(local)) {
        if (truth[column] === fp) continue;
        // A value the server refuses is allowed to stay unsaved, but only while it is listed as refused.
        if (fp.includes('BAD-')) {
          if (client.kind === 'new' && !refused.has(column)) violate('I5', `${client.id}'s refused ${column} on ${app} is not listed as rejected`);
          continue;
        }
        violate('I3', `${client.id}'s ${column} on ${app} differs from the server after settling`);
      }
      // The tracker status rides every revision bump.
      if (client.kind === 'new' && (session.status ?? 'drafted') !== server.statusOf(app)) {
        violate('I3', `${client.id}'s status of ${app} is "${session.status}", the server has "${server.statusOf(app)}"`);
      }
    }
  }

  ctx.finalChecks?.();

  // I1: the last edit of each field.
  for (const edit of lastEdit.values()) {
    const client = clients.find((candidate) => candidate.id === edit.client)!;
    if (server.acceptedHas(edit.app, edit.token)) continue;
    if (ctx.discarded?.has(edit.token)) continue;
    if (edit.viaEditor && openEditorTokens.has(edit.token)) continue;
    const buffered = client.conflictJson(edit.app).includes(edit.token);
    if (buffered && client.notices.some((notice) => notice.conflictFor === edit.app)) continue;
    const session = client.session(edit.app);
    const stillHeld = session ? JSON.stringify(session).includes(edit.token) : false;
    const refusedColumns = client.rejectedColumns(edit.app);
    if (stillHeld && (client.kind === 'legacy' || GROUP_COLUMNS[edit.field].some((column) => refusedColumns.includes(column)))
      && client.notices.some((notice) => notice.message.includes('did not save'))) continue;
    violate('I1', `${client.id}'s last edit of ${edit.app}.${edit.field} (${edit.token}) was lost: not on the server, not in a conflict buffer${buffered ? ' with a notice' : ''}, not a refused value (store still holds it: ${stillHeld}, buffer: ${client.conflictJson(edit.app).slice(0, 160)})`);
  }
}

export const OP_NAMES = ['edit', 'save', 'poll', 'editorOpen', 'type', 'editorSave', 'regen', 'workflow', 'tracker', 'agent', 'workflowWrite', 'silentRequirements', 'tabWrite', 'handoff', 'openOther', 'reopen', 'restore', 'copy', 'dismiss'] as const;

export interface RunOptions {
  /** `new`: the current engine and glue. `round2`: the review-round-2 engine, glue and server. `legacy`: the round-1 module. */
  engine: 'new' | 'round2' | 'legacy';
  ops?: number;
  verbose?: boolean;
  /** Run only these operations (see OP_NAMES), to isolate one bug. */
  only?: string[];
}

export async function runSeed(seed: number, options: RunOptions): Promise<RunResult> {
  const rng = makeRng(seed);
  const clock = new FakeClock();
  const server = new FakeServer();
  const net = new RequestScheduler(rng);
  net.allowHang = options.engine !== 'legacy';
  const world = { clock, server, net };
  const violations: Violation[] = [];
  const violate = (code: InvariantCode, message: string) => {
    if (!violations.some((existing) => existing.code === code && existing.message === message)) violations.push({ code, message });
  };
  const stats = emptyStats();
  const log: string[] = [];
  const say = (line: string) => { if (options.verbose) log.push(line); };
  // The round-2 server wrote `requirements` (a column the browser also writes) without bumping the revision.
  const silentRequirements = options.engine === 'round2';

  // -- clients ------------------------------------------------------------
  const clients: Adapter[] = [];
  const checkBaseline = (adapter: Adapter, app: string, where: string) => {
    const base = adapter.baseline(app);
    if (!base || !base.fields) return;
    const truth = server.truth(app, base.revision);
    if (!truth) {
      violate('I2', `${adapter.id} holds a baseline at revision ${base.revision} of ${app}, which never existed (${where})`);
      return;
    }
    for (const [column, fp] of Object.entries(base.fields)) {
      if (truth[column] !== fp) {
        violate('I2', `${adapter.id} baseline of ${app} claims ${column} at revision ${base.revision} is not what the server held then (${where})`);
        return;
      }
    }
  };
  // What each store has ever shown, the furthest each baseline has got, and the text set aside in conflict buffers.
  const seen = new Map<string, Set<string>>();
  const furthest = new Map<string, number>();
  const buffered = new Set<string>();
  const intended = new Set<string>();
  /** Text the user threw away with Dismiss and Discard. */
  const discarded = new Set<string>();
  /** Buffer entries a Restore took out of the buffer (client|id). */
  const restoredEntries = new Set<string>();
  /** Notices the user has restored, copied or discarded. A notice stays open until then. */
  const handled = new WeakSet<SyncNotice>();
  /** Per accepted write: the columns it overwrote that its writer's store had never shown. */
  const unseenAt = new Map<string, Set<string>>();
  /** Text the user chose to save: editor drafts sent with Save. */
  const deliberate = new Set<string>();
  const sequenceOf = (text: string): number => Math.max(-1, ...(text.match(/t:[ABO][0-9]+;/g) ?? []).map((token) => Number(token.slice(3, -1))));
  // generated_cv is one column holding several things a user edits (the structured CV, the screening answers):
  // each is "shown" on its own, so a save is judged by the parts it changes.
  const parts = (column: string, fp: string): Record<string, string> => {
    if (column !== 'generated_cv') return { '': fp };
    try {
      const value = JSON.parse(fp) as Record<string, unknown> | null;
      return Object.fromEntries(Object.entries(value ?? {}).map(([key, part]) => [key, JSON.stringify(part)]));
    } catch { return { '': fp }; }
  };
  const observe = (where: string) => {
    for (const client of clients) {
      for (const app of client.apps) {
        const fps = client.fingerprints(app);
        if (fps) {
          for (const [column, fp] of Object.entries(fps)) {
            for (const [part, value] of Object.entries(parts(column, fp))) {
              const key = `${client.id}|${app}|${column}#${part}`;
              if (!seen.has(key)) seen.set(key, new Set());
              seen.get(key)!.add(value);
            }
          }
        }
        // Text the server already carried when it was set aside (a save that timed out but landed) may come back from the server legitimately.
        for (const token of tokensIn(client.conflictJson(app))) if (!buffered.has(token) && !server.acceptedAnywhere(token)) buffered.add(token);
        const base = client.baseline(app);
        if (base) {
          const key = `${client.id}|${app}`;
          const before = furthest.get(key) ?? -1;
          if (base.revision < before) violate('I2', `${client.id}'s baseline of ${app} went back from revision ${before} to ${base.revision} (${where})`);
          furthest.set(key, Math.max(before, base.revision));
        }
      }
    }
  };
  server.onAccept = (by, app, overwritten, patchJson) => {
    if (!clients.some((client) => client.id === by)) return;
    say(`   server accepts ${by}'s write to ${app}: ${tokensIn(patchJson).join(' ')}`);
    // A save may only overwrite a server value its writer has displayed (or written itself).
    const patch = JSON.parse(patchJson) as Record<string, unknown>;
    const unseenColumns = new Set<string>();
    for (const [column, fp] of Object.entries(overwritten)) {
      const before = parts(column, fp);
      const after = parts(column, JSON.stringify(patch[column] ?? null));
      const unseen = Object.keys({ ...before, ...after }).filter((part) => before[part] !== after[part] && before[part] !== undefined
        && !seen.get(`${by}|${app}|${column}#${part}`)?.has(before[part]));
      if (unseen.length > 0) {
        unseenColumns.add(column);
        const mine = clients.find((client) => client.id === by);
        violate('I2', `${by}'s save overwrote ${column} of ${app} with a server value its store had never shown (server ${fp}; store ${mine?.fingerprints(app)?.[column]}; patch tokens ${tokensIn(patchJson).join(',')}; baseline@${mine?.baseline(app)?.revision} server@${server.revisionOf(app)})`);
      }
    }
    unseenAt.set(`${app}@${(server.revisionOf(app) ?? 0) + 1}`, unseenColumns);
    // A save does not write older user text over newer user text, unless the user asked for that text.
    for (const [column, fp] of Object.entries(overwritten)) {
      const writing = JSON.stringify(patch[column] ?? null);
      const newest = sequenceOf(writing);
      if (newest >= 0 && newest < sequenceOf(fp) && !tokensIn(writing).some((token) => intended.has(token) || deliberate.has(token))) {
        violate('I1', `${by}'s save wrote older text over newer text in ${column} of ${app}`);
      }
    }
    // Text set aside in a conflict buffer goes back to the server only when the user restored the notice that holds it.
    for (const token of tokensIn(patchJson)) {
      if (buffered.has(token) && !intended.has(token) && !deliberate.has(token)) {
        violate('I1', `${by}'s save sent ${token}, text that was set aside in a conflict buffer and that the user did not restore`);
      }
    }
  };
  if (options.engine === 'legacy') {
    clients.push(await legacyClient('A', world));
  } else {
    const variant: EngineVariantName = options.engine === 'round2' ? 'round2' : 'current';
    const engineModule = await loadEngine(variant);
    for (const id of ['A', 'B']) {
      clients.push(newClient(id, world, engineModule, variant, { onSaveCall: (app, expected) => {
        const adapter = clients.find((client) => client.id === id)!;
        const base = adapter.baseline(app);
        if (base && base.revision !== expected) violate('I2', `${id} saved ${app} against revision ${expected} but its baseline is ${base.revision}`);
        checkBaseline(adapter, app, 'at save');
      } }));
    }
  }

  // -- setup on a healthy network -----------------------------------------
  const firstApp = server.create('seed');
  for (const client of clients) {
    await client.hydrate(server.rowOf(firstApp)!);
    client.setCurrent(firstApp);
  }
  net.chaos = true;
  net.reliable = false;

  // -- bookkeeping --------------------------------------------------------
  let counter = 0;
  const nextToken = (client: string) => tokenOf(client, ++counter);
  const lastEdit = new Map<string, EditRecord>();
  const keyOf = (client: string, app: string, field: Field) => `${client}|${app}|${field}`;
  const editors: Editor[] = [];
  const openEditorTokens = new Set<string>();
  let inflight = 0;
  const track = (promise: Promise<unknown>) => {
    inflight += 1;
    promise.then(
      () => { inflight -= 1; },
      (error) => {
        inflight -= 1;
        const message = error instanceof Error ? error.message : String(error);
        if (message !== 'network error' && !message.includes('timed out')) violate('ERR', `an operation threw: ${message}`);
      },
    );
  };

  const appsOf = (client: Adapter) => [...client.apps];
  /** A request the harness itself makes (a fetch with no engine timeout around it): give up after a minute, as a browser would. */
  const call = <T>(client: Adapter, kind: 'mutate' | 'create' | 'getRow', run: () => T): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = clock.setTimeout(() => reject(new Error('network error')), 60_000);
      net.request(client.id, kind, run).then(
        (value) => { clock.clearTimeout(timer); resolve(value); },
        (error) => { clock.clearTimeout(timer); reject(error); },
      );
    });
  const record = (client: Adapter, app: string, field: Field, token: string, viaEditor: boolean) =>
    lastEdit.set(keyOf(client.id, app, field), { client: client.id, app, field, token, viaEditor });

  // -- operations ---------------------------------------------------------
  const doEdit = (client: Adapter, app: string, bad = false) => {
    const field = pick(rng, FIELDS);
    const token = nextToken(client.id);
    client.edit(app, fieldMutation(field, token, bad && field === 'jobDescription'));
    record(client, app, field, token, false);
    stats.edits += 1;
    say(`${client.id} edits ${app}.${field} ${token}`);
  };

  const noticesWithText = (client: Adapter) => client.notices.filter((notice) => notice.conflictFor);
  const dropEditor = (editor: Editor) => {
    const index = editors.indexOf(editor);
    if (index >= 0) editors.splice(index, 1);
    for (const token of editor.tokens) openEditorTokens.delete(token);
  };
  // The panels act on an acknowledgement through the engine's own rule (acknowledgementFor): an editor whose field
  // group is named rebases on Restore and Copy and, on Discard, drops its draft as Cancel does; the others are left alone.
  for (const client of clients) {
    client.subscribeAcknowledged((app, ack) => {
      for (const editor of [...editors]) {
        if (editor.client !== client || editor.app !== app) continue;
        const action = client.acknowledgementFor(ack, [editor.field], editor.start);
        say(`   ${client.id}'s editor on ${app}.${editor.field} (draft ${editor.draft}) hears ${ack.discarded ? 'a discard' : 'an acknowledgement'} of ${ack.entries.map((entry) => entry.group).join(', ')}: ${action}`);
        if (action === 'ignore') continue;
        if (action === 'rebase') {
          editor.start = client.editorStart(app, editor.start);
          continue;
        }
        // The user threw away the text this editor holds.
        editor.epoch += 1;
        for (const token of editor.tokens) discarded.add(token);
        if (editor.committing && editor.closesOnSave) {
          // The CV panel's save is still running: its editor is closed, its start is cleared, and the answer decides nothing.
          editor.start = undefined;
        } else {
          dropEditor(editor);
        }
      }
    });
  }

  const ops: Array<{ weight: number; run: () => void }> = [
    {
      weight: 22,
      run: () => {
        const client = pick(rng, clients);
        const apps = appsOf(client);
        if (apps.length) doEdit(client, pick(rng, apps), rng() < 0.12);
      },
    },
    {
      weight: 11,
      run: () => {
        const client = pick(rng, clients);
        const apps = appsOf(client);
        if (!apps.length) return;
        stats.saves += 1;
        track(client.save(pick(rng, apps)));
      },
    },
    {
      weight: 11,
      run: () => {
        const client = pick(rng, clients);
        const apps = appsOf(client);
        if (!apps.length) return;
        stats.polls += 1;
        track(client.poll(pick(rng, apps)));
      },
    },
    {
      weight: 5,
      run: () => {
        const client = pick(rng, clients);
        const apps = appsOf(client);
        if (!apps.length || editors.filter((editor) => editor.client === client).length >= 2) return;
        const app = pick(rng, apps);
        const field = pick(rng, options.engine === 'new' ? [...EDITOR_FIELDS, 'cv' as Field] : EDITOR_FIELDS);
        const draft = nextToken(client.id);
        const start = client.editorStart(app);
        const editor: Editor = {
          client, app, field, draft, tokens: new Set([draft]), start, committing: false,
          hadStart: start !== undefined, closesOnSave: field === 'cv', epoch: 0,
        };
        editors.push(editor);
        openEditorTokens.add(draft);
        say(`${client.id} opens an editor on ${app}.${field} (draft ${draft})`);
      },
    },
    {
      // The user keeps typing, also while a save is in flight.
      weight: 5,
      run: () => {
        // An editor that closed on Save (the CV's) cannot be typed into until it reopens.
        const typable = editors.filter((editor) => !(editor.committing && editor.closesOnSave));
        if (!typable.length) return;
        const editor = pick(rng, typable);
        editor.draft = nextToken(editor.client.id);
        editor.tokens.add(editor.draft);
        openEditorTokens.add(editor.draft);
        if (editor.committing) stats.typedDuringSave += 1;
        say(`${editor.client.id} types ${editor.draft} in the editor on ${editor.app}.${editor.field}${editor.committing ? ' (during a save)' : ''}`);
      },
    },
    {
      weight: 8,
      run: () => {
        const open = editors.filter((editor) => !editor.committing);
        if (!open.length) return;
        const editor = pick(rng, open);
        editor.committing = true;
        stats.editorSaves += 1;
        const { client, app, field } = editor;
        const sent = editor.draft;
        const epochAtSave = editor.epoch;
        if (discarded.has(sent)) violate('I1', `${client.id}'s open editor on ${app}.${field} saved ${sent}, which the user had discarded (Dismiss, then Discard leaves the draft in the editor)`);
        if (editor.hadStart && editor.start === undefined) violate('I1', `${client.id}'s editor on ${app}.${field} saved ${sent} with no EditorStart, so the save is not checked against what the server holds now`);
        deliberate.add(sent);
        const work = client.editorCommit(app, editor.start, () => {
          client.edit(app, fieldMutation(field, sent));
          // The draft replaces whatever the store held for that field.
          lastEdit.set(keyOf(client.id, app, field), { client: client.id, app, field, token: sent, viaEditor: true });
        }).then((outcome) => {
          editor.committing = false;
          say(`${client.id} editor ${app}.${field} sent ${sent} -> ${outcome}`);
          if (client.editorSucceeded(outcome)) {
            if (!server.acceptedHas(app, sent)) {
              violate('I1', `${client.id}'s editor on ${app}.${field} was told "${outcome}" but the server never accepted the draft`);
            }
            lastEdit.delete(keyOf(client.id, app, field));
            openEditorTokens.delete(sent);
          }
          if (editor.closesOnSave) {
            // The CV panel: the editor closed on Save. A save that landed leaves it closed; one that did not reopens it
            // with the text in it, unless the draft was discarded while the save ran.
            if (client.editorSucceeded(outcome)) { dropEditor(editor); return; }
            const again = client.afterClosedEditorSave(outcome, epochAtSave, editor.epoch, editor.start);
            if (!again.reopen) { dropEditor(editor); return; }
            if (editor.epoch !== epochAtSave) violate('I1', `${client.id}'s editor on ${app}.${field} reopened with ${sent}, which the user discarded while the save ran`);
            editor.start = again.start;
            if (!editors.includes(editor)) editors.push(editor);
            return;
          }
          // The draft was discarded while the save ran: the editor is gone, and its answer decides nothing.
          if (editor.epoch !== epochAtSave) return;
          const after = client.editorAfter(app, outcome, sent, editor.draft, editor.start);
          if (after.close) {
            if (editor.draft !== sent && !server.acceptedHas(app, editor.draft)) {
              violate('I1', `${client.id}'s editor on ${app}.${field} closed over text the user typed while the save ran`);
            }
            dropEditor(editor);
          } else if (after.start !== undefined) {
            editor.start = after.start;
          }
        }, (error) => {
          editor.committing = false;
          throw error;
        });
        track(work);
      },
    },
    {
      weight: 6,
      run: () => {
        const client = pick(rng, clients);
        const apps = appsOf(client);
        if (!apps.length) return;
        const app = pick(rng, apps);
        const field = pick(rng, EDITOR_FIELDS);
        const token = nextToken('R');
        stats.regens += 1;
        const { props, columns } = responseProps(field, token);
        const work = call(client, 'mutate', () => {
          const revision = server.writeField(app, field, token, 'route');
          return { revision, props, columns } satisfies MutationResponse;
        }).then((response) => client.mutationResponse(app, response));
        track(work);
        say(`${client.id} regenerates ${app}.${field} ${token}`);
      },
    },
    {
      // A generation finishes: the kit is saved in one write, and the SSE result carrying the generated fields arrives later.
      weight: 5,
      run: () => {
        const client = pick(rng, clients);
        const apps = appsOf(client);
        if (!apps.length) return;
        const app = pick(rng, apps);
        const token = nextToken('K');
        stats.workflows += 1;
        const work = call(client, 'mutate', () => {
          const revision = server.persistKit(app, token, 'route');
          return { revision, props: kitProps(server.rowOf(app)!), columns: [] } satisfies MutationResponse;
        }).then((response) => client.workflowComplete(app, response));
        track(work);
        say(`${client.id} finishes a generation of ${app} (${token})`);
      },
    },
    {
      weight: 3,
      run: () => {
        const client = pick(rng, clients);
        const apps = appsOf(client);
        if (!apps.length) return;
        const app = pick(rng, apps);
        stats.trackerWrites += 1;
        const status = pick(rng, ['drafted', 'applied', 'interview', 'offer', 'rejected']);
        const work = call(client, 'mutate', () => server.write(app, { status }, 'tracker')).then(() => client.statusRefresh(app));
        track(work);
        say(`${client.id} sets ${app} to ${status}`);
      },
    },
    {
      weight: 8,
      run: () => {
        const ids = [...server.apps.keys()];
        const app = pick(rng, ids);
        const field = pick(rng, FIELDS);
        const token = nextToken('G');
        server.writeField(app, field, token, 'agent');
        stats.agentWrites += 1;
        say(`agent writes ${app}.${field} ${token}`);
      },
    },
    {
      // Workflow state moves without a revision bump; nothing a browser edits changes.
      weight: 3,
      run: () => {
        const app = pick(rng, [...server.apps.keys()]);
        server.writeWithoutBump(app, { generation_status: pick(rng, ['running', 'succeeded', 'failed']) });
      },
    },
    {
      // The round-2 server annotated `requirements` without announcing it.
      weight: silentRequirements ? 4 : 0,
      run: () => {
        const app = pick(rng, [...server.apps.keys()]);
        const token = nextToken('S');
        server.writeWithoutBump(app, serverColumns('requirements', token));
        stats.silentWrites += 1;
        say(`server annotates ${app}.requirements without a revision bump (${token})`);
      },
    },
    {
      // Another tab's edit followed straight away by its save. For the legacy run the other tab is modelled as a plain writer.
      weight: 5,
      run: () => {
        const field = pick(rng, FIELDS);
        const token = nextToken('O');
        if (options.engine === 'legacy') {
          const app = pick(rng, [...server.apps.keys()]);
          server.writeField(app, field, token, 'other-tab');
          stats.agentWrites += 1;
          return;
        }
        const client = pick(rng, clients);
        const apps = appsOf(client);
        if (!apps.length) return;
        const app = pick(rng, apps);
        client.edit(app, fieldMutation(field, token));
        record(client, app, field, token, false);
        stats.edits += 1;
        track(client.save(app));
      },
    },
    {
      weight: 3,
      run: () => {
        const client = pick(rng, clients);
        stats.handoffs += 1;
        const work = call(client, 'create', () => {
          const id = server.create('feed');
          return server.rowOf(id)!;
        }).then(async (row) => {
          await client.handoff(row);
          say(`${client.id} hands off ${row.id}`);
        });
        track(work);
      },
    },
    {
      weight: 3,
      run: () => {
        const client = pick(rng, clients);
        const missing = [...server.apps.keys()].filter((app) => !client.apps.has(app));
        if (!missing.length) return;
        const app = pick(rng, missing);
        const work = call(client, 'getRow', () => server.rowOf(app)).then(async (row) => {
          if (row && !client.apps.has(app)) await client.open(row);
        });
        track(work);
      },
    },
    {
      // Open an application the tab already holds: an explicit load of a row that may be older or equal.
      weight: 3,
      run: () => {
        const client = pick(rng, clients);
        const apps = appsOf(client);
        if (!apps.length) return;
        const app = pick(rng, apps);
        const work = call(client, 'getRow', () => server.rowOf(app)).then(async (row) => {
          if (row) await client.open(row);
        });
        track(work);
      },
    },
    {
      // "Restore my text" on a random notice of this tab, including old ones.
      weight: 4,
      run: () => {
        const client = pick(rng, clients);
        const notices = noticesWithText(client);
        if (!notices.length) return;
        const notice = pick(rng, notices);
        for (const token of tokensIn(client.noticeText(notice))) intended.add(token);
        handled.add(notice);
        stats.restores += 1;
        say(`${client.id} clicks Restore on a notice for ${notice.conflictFor}`);
        track(client.restoreNotice(notice).then((outcome) => {
          // An entry the restore took out of the buffer has been dealt with, whichever notice names it.
          const held = new Set(client.bufferIds(notice.conflictFor!));
          for (const entry of client.noticeEntries(notice)) if (!held.has(entry.id)) restoredEntries.add(`${client.id}|${entry.id}`);
          say(`   restore -> ${outcome}`);
        }));
      },
    },
    {
      // "Copy my text" on a random notice: it may only offer the text of that notice, and says so when none is left.
      weight: 2,
      run: () => {
        const client = pick(rng, clients);
        const notices = noticesWithText(client);
        if (!notices.length) return;
        const notice = pick(rng, notices);
        stats.copies += 1;
        const allowed = new Set(tokensIn(client.noticeText(notice)));
        const copied = client.copyNotice(notice);
        if (copied === '') violate('I1', `${client.id}'s Copy would put an empty string on the clipboard`);
        if (copied !== null) handled.add(notice);
        for (const token of tokensIn(copied ?? '')) {
          if (!allowed.has(token)) violate('I1', `${client.id}'s Copy on a notice offered text that belongs to another notice`);
        }
      },
    },
    {
      // "Dismiss", then "Discard": the user throws the text of a notice away on purpose.
      weight: options.engine === 'new' ? 2 : 0,
      run: () => {
        const client = pick(rng, clients);
        const notices = noticesWithText(client);
        if (!notices.length) return;
        const notice = pick(rng, notices);
        handled.add(notice);
        say(`${client.id} clicks Dismiss, then Discard on a notice for ${notice.conflictFor}`);
        // Only an entry still in the buffer is thrown away; the notice may name entries a Restore or a save already took out.
        const held = new Set(client.bufferIds(notice.conflictFor!));
        const thrown = client.noticeEntries(notice).filter((entry) => held.has(entry.id));
        for (const entry of thrown) for (const token of entry.tokens) discarded.add(token);
        // An open draft of a field this notice is not about is not the user's to lose.
        const groups = new Set(thrown.map((entry) => entry.group));
        const bystanders = editors
          .filter((editor) => editor.client === client && editor.app === notice.conflictFor && !groups.has(editor.field))
          .map((editor) => ({ editor, epoch: editor.epoch, start: editor.start }));
        client.dismissNotice(notice);
        for (const { editor, epoch, start } of bystanders) {
          if (!editors.includes(editor) || editor.epoch !== epoch || editor.start !== start) {
            violate('I1', `${client.id} discarded a notice about ${[...groups].join(', ')} and the open draft of ${editor.app}.${editor.field} (${editor.draft}) was reset with it`);
          }
        }
      },
    },
  ].map((op, index) => ({ ...op, name: OP_NAMES[index] })).filter((op) => op.weight > 0 && (!options.only || options.only.includes(op.name)));
  if (ops.length === 0) throw new Error(`no operation left to run (--only ${options.only?.join(',')})`);
  const totalWeight = ops.reduce((sum, op) => sum + op.weight, 0);
  const startOp = () => {
    let r = rng() * totalWeight;
    for (const op of ops) {
      r -= op.weight;
      if (r <= 0) { op.run(); stats.ops += 1; return; }
    }
  };

  // -- the chaotic phase --------------------------------------------------
  const budget = options.ops ?? 60;
  let started = 0;
  const checkAllBaselines = (where: string) => {
    observe(where);
    if (options.engine === 'legacy') return;
    for (const client of clients) for (const app of client.apps) checkBaseline(client, app, where);
  };
  observe('setup');
  for (let step = 0; step < budget * 6 && started < budget; step++) {
    const r = rng();
    if ((net.pending.length === 0 && inflight === 0) || r < 0.4) {
      startOp();
      started += 1;
    } else if (net.pending.length > 0 && r < 0.93) {
      net.advance(net.randomPending()!);
    } else {
      clock.advance(Math.floor(rng() * 40_000));
    }
    await tick();
    checkAllBaselines(`step ${step}`);
  }
  // Let everything in flight finish (or time out).
  for (let guard = 0; guard < 4000 && (inflight > 0 || net.pending.length > 0); guard++) {
    if (net.pending.length > 0 && rng() < 0.8) net.advance(net.randomPending()!);
    else clock.advance(31_000);
    await tick();
    checkAllBaselines('drain');
  }
  if (inflight > 0 || net.pending.length > 0) violate('I4', `${inflight} operations and ${net.pending.length} requests never finished`);

  await settleAndVerify({
    world, clients, lastEdit, openEditorTokens, violate, stats,
    checkBaseline: options.engine === 'legacy' ? undefined : checkBaseline,
    observe,
    discarded,
    finalChecks: () => {
      // The text behind every notice that is still open must still be reachable: in the buffer, or on the server by now.
      if (options.engine === 'new') {
        for (const client of clients) {
          for (const notice of client.notices) {
            if (!notice.conflictFor || handled.has(notice)) continue;
            const held = new Set(client.bufferIds(notice.conflictFor));
            for (const entry of client.noticeEntries(notice)) {
              const onServer = entry.tokens.length > 0 && entry.tokens.every((token) => server.acceptedAnywhere(token) || discarded.has(token));
              if (!held.has(entry.id) && !onServer && !restoredEntries.has(`${client.id}|${entry.id}`) && entry.tokens.length > 0) {
                violate('I1', `${client.id}'s open notice for ${notice.conflictFor} lost the text of entry ${entry.id} (${entry.tokens.join(' ')})`);
              }
            }
          }
        }
      }
      // A value one writer saved is only replaced by a writer that had seen it.
      const latest = new Map<string, { revision: number; column: string }>();
      for (const write of server.accepted) {
        if (!clients.some((client) => client.id === write.by)) continue;
        for (const column of Object.keys(JSON.parse(write.json) as Record<string, unknown>)) latest.set(`${write.by}|${write.app}|${column}`, { revision: write.revision, column });
      }
      for (const [key, saved] of latest) {
        const [by, app] = key.split('|');
        const next = server.accepted.find((write) => write.app === app && write.revision > saved.revision
          && saved.column in (JSON.parse(write.json) as Record<string, unknown>));
        if (next && clients.some((client) => client.id === next.by) && unseenAt.get(`${app}@${next.revision}`)?.has(saved.column)) {
          violate('I1', `${by}'s saved ${saved.column} of ${app} was replaced by ${next.by}, whose store had never shown it`);
        }
      }
    },
  });

  stats.requests = net.stats.requests;
  stats.dropped = net.stats.dropped;
  stats.lostAnswers = net.stats.lostAnswers;
  stats.hung = net.stats.hung;
  for (const client of clients) {
    for (const notice of client.notices) {
      if (notice.conflictFor || notice.message.includes('updated elsewhere')) stats.conflictNotices += 1;
      else if (notice.kind === 'error') stats.failureNotices += 1;
    }
  }
  if (options.verbose && violations.length) console.log(`--- seed ${seed} ---\n${log.join('\n')}`);
  return { seed, violations, stats };
}
