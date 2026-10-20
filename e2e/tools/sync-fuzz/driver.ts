/**
 * The randomized interleaving run and its invariants.
 *
 * One run: a fake server, two tabs (or one real tab and a modelled second
 * writer, for the legacy module) and an agent, a random sequence of
 * operations whose requests are answered in random order, late, lost or never,
 * then a settle phase on a healthy network, then the invariants.
 *
 *   I1  no lost edit: the last thing a user typed into a field is on the server
 *       (an accepted write holds it), or in a conflict buffer with a notice
 *       raised, or still unsaved because the server refused it (and the user
 *       was told). An editor that was told "saved" has its exact draft on the server.
 *   I2  no stale overwrite: every save names a revision the writer's baseline
 *       is a truthful snapshot of; a baseline never claims a revision whose
 *       content it does not hold (checked after every step, and at every save).
 *   I3  convergence: at quiescence every tab's store equals the server's row
 *       (except values the server refuses) and its baseline is the server's revision.
 *   I4  no loops: the settle phase reaches a fixed point, and a second pass
 *       over a converged world raises no notice and makes no write.
 *   I5  refused fields do not block others: covered by I3, plus a refused
 *       value must be listed as rejected, not silently dropped.
 */

import { columnFingerprints } from '@/lib/session-sync-engine';
import type { Adapter, MutationResponse } from './adapters';
import { fieldMutation, legacyClient, newClient, responseProps } from './adapters';
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
  regens: number;
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
  token: string;
  start: unknown;
  /** The commit that ran last, if any. */
  committing: boolean;
}

export const GROUP_COLUMNS: Record<Field, string[]> = {
  jobTitle: ['job_title'],
  company: ['company'],
  jobDescription: ['job_description'],
  selectedTemplate: ['selected_template'],
  coverLetter: ['cover_letter'],
  email: ['email', 'email_subject', 'email_body'],
  followUpEmail: ['follow_up_email'],
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
    }
  }

  // I1: the last edit of each field.
  for (const edit of lastEdit.values()) {
    const client = clients.find((candidate) => candidate.id === edit.client)!;
    if (server.acceptedHas(edit.app, edit.token)) continue;
    if (edit.viaEditor && openEditorTokens.has(edit.token)) continue;
    const buffered = client.conflictJson(edit.app).includes(edit.token);
    if (buffered && client.notices.some((notice) => notice.conflictFor === edit.app)) continue;
    const session = client.session(edit.app);
    const stillHeld = session ? JSON.stringify(session).includes(edit.token) : false;
    const refusedColumns = client.rejectedColumns(edit.app);
    if (stillHeld && (client.kind === 'legacy' || GROUP_COLUMNS[edit.field].some((column) => refusedColumns.includes(column)))
      && client.notices.some((notice) => notice.message.includes('did not save'))) continue;
    violate('I1', `${client.id}'s last edit of ${edit.app}.${edit.field} (${edit.token}) was lost: not on the server, not in a conflict buffer${buffered ? ' with a notice' : ''}, not a refused value`);
  }
}

export interface RunOptions {
  engine: 'new' | 'legacy';
  ops?: number;
  verbose?: boolean;
}

export async function runSeed(seed: number, options: RunOptions): Promise<RunResult> {
  const rng = makeRng(seed);
  const clock = new FakeClock();
  const server = new FakeServer();
  const net = new RequestScheduler(rng);
  net.allowHang = options.engine === 'new';
  const world = { clock, server, net };
  const violations: Violation[] = [];
  const violate = (code: InvariantCode, message: string) => {
    if (!violations.some((existing) => existing.code === code && existing.message === message)) violations.push({ code, message });
  };
  const stats: RunStats = {
    ops: 0, edits: 0, editorSaves: 0, regens: 0, agentWrites: 0, handoffs: 0, polls: 0, saves: 0,
    requests: 0, dropped: 0, lostAnswers: 0, hung: 0, conflictNotices: 0, failureNotices: 0, settleRounds: 0,
  };
  const log: string[] = [];
  const say = (line: string) => { if (options.verbose) log.push(line); };

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
  // What each store has ever shown, and the furthest each baseline has got.
  const seen = new Map<string, Set<string>>();
  const furthest = new Map<string, number>();
  const observe = (where: string) => {
    for (const client of clients) {
      for (const app of client.apps) {
        const fps = client.fingerprints(app);
        if (fps) {
          for (const [column, fp] of Object.entries(fps)) {
            const key = `${client.id}|${app}|${column}`;
            if (!seen.has(key)) seen.set(key, new Set());
            seen.get(key)!.add(fp);
          }
        }
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
  // A save may only overwrite a server value its writer has displayed (or written itself).
  server.onAccept = (by, app, overwritten) => {
    for (const [column, fp] of Object.entries(overwritten)) {
      if (!clients.some((client) => client.id === by)) return;
      if (!seen.get(`${by}|${app}|${column}`)?.has(fp)) {
        violate('I2', `${by}'s save overwrote ${column} of ${app} with a server value its store had never shown`);
      }
    }
  };
  if (options.engine === 'new') {
    for (const id of ['A', 'B']) {
      clients.push(newClient(id, world, { onSaveCall: (app, expected) => {
        const adapter = clients.find((client) => client.id === id)!;
        const base = adapter.baseline(app);
        if (base && base.revision !== expected) violate('I2', `${id} saved ${app} against revision ${expected} but its baseline is ${base.revision}`);
        checkBaseline(adapter, app, 'at save');
      } }));
    }
  } else {
    clients.push(await legacyClient('A', world));
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

  const ops: Array<{ weight: number; run: () => void }> = [
    {
      weight: 24,
      run: () => {
        const client = pick(rng, clients);
        const apps = appsOf(client);
        if (apps.length) doEdit(client, pick(rng, apps), rng() < 0.12);
      },
    },
    {
      weight: 12,
      run: () => {
        const client = pick(rng, clients);
        const apps = appsOf(client);
        if (!apps.length) return;
        stats.saves += 1;
        track(client.save(pick(rng, apps)));
      },
    },
    {
      weight: 12,
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
        const field = pick(rng, EDITOR_FIELDS);
        const editor: Editor = { client, app, field, token: nextToken(client.id), start: client.editorStart(app), committing: false };
        editors.push(editor);
        openEditorTokens.add(editor.token);
        say(`${client.id} opens an editor on ${app}.${field} (draft ${editor.token})`);
      },
    },
    {
      weight: 9,
      run: () => {
        const open = editors.filter((editor) => !editor.committing);
        if (!open.length) return;
        const editor = pick(rng, open);
        editor.committing = true;
        stats.editorSaves += 1;
        const { client, app, field, token } = editor;
        const group = field;
        const describe = () => {
          const session = client.session(app) as unknown as Record<string, { body?: string } | null> | null;
          return `store ${field}=${session?.[field]?.body ?? '-'} baseline@${client.baseline(app)?.revision} server@${server.revisionOf(app)}`;
        };
        say(`${client.id} editor ${app}.${field} saving: ${describe()}`);
        const work = client.editorCommit(app, editor.start, () => {
          client.edit(app, fieldMutation(field, token));
          // The draft replaces whatever the store held for that field.
          lastEdit.set(keyOf(client.id, app, group), { client: client.id, app, field, token, viaEditor: true });
        }).then((outcome) => {
          editor.committing = false;
          say(`${client.id} editor ${app}.${field} -> ${outcome}: ${describe()}`);
          if (client.editorSucceeded(outcome)) {
            if (!server.acceptedHas(app, token)) {
              violate('I1', `${client.id}'s editor on ${app}.${field} was told "${outcome}" but the server never accepted the draft`);
            }
            const index = editors.indexOf(editor);
            if (index >= 0) editors.splice(index, 1);
            openEditorTokens.delete(token);
            lastEdit.delete(keyOf(client.id, app, group));
          }
        }, (error) => {
          editor.committing = false;
          throw error;
        });
        track(work);
      },
    },
    {
      weight: 7,
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
          const revision = server.write(app, serverColumns(field, token), 'route');
          return { revision, props, columns } satisfies MutationResponse;
        }).then((response) => client.mutationResponse(app, response));
        track(work);
        say(`${client.id} regenerates ${app}.${field} ${token}`);
      },
    },
    {
      weight: 9,
      run: () => {
        const ids = [...server.apps.keys()];
        const app = pick(rng, ids);
        const field = pick(rng, FIELDS);
        const token = nextToken('G');
        server.write(app, serverColumns(field, token), 'agent');
        stats.agentWrites += 1;
        say(`agent writes ${app}.${field} ${token}`);
      },
    },
    {
      // Another tab's edit followed straight away by its save. For the legacy run the other tab is modelled as a plain writer.
      weight: 6,
      run: () => {
        const field = pick(rng, FIELDS);
        const token = nextToken('O');
        if (options.engine === 'legacy') {
          const app = pick(rng, [...server.apps.keys()]);
          server.write(app, serverColumns(field, token), 'other-tab');
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
  ];
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
    if (options.engine !== 'new') return;
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
    checkBaseline: options.engine === 'new' ? checkBaseline : undefined,
    observe,
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
