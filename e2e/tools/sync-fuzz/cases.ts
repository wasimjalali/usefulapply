/**
 * Deterministic cases: the four races Codex reproduced in round 2, the
 * refused-value poll block, and round 1's "change made while a poll reload is
 * in flight". Each one drives requests by hand, so the order is exact, then runs
 * the same settle-and-verify as the randomized runs.
 */

import type { Adapter } from './adapters';
import { fieldMutation, legacyClient, newClient, responseProps } from './adapters';
import { settleAndVerify, type InvariantCode, type RunStats, type Violation } from './driver';
import { FakeClock, FakeServer, RequestScheduler, flush, makeRng, serverColumns, type Field, type RequestKind } from './world';

interface CaseContext {
  server: FakeServer;
  net: RequestScheduler;
  client: Adapter;
  app: string;
  /** Answer the first pending request of this kind, now. */
  serve: (kind: RequestKind, options?: { failAnswer?: boolean }) => Promise<void>;
  /** Like serve, but quietly does nothing when no such request is pending (the legacy module skips some). */
  serveIfPending: (kind: RequestKind) => Promise<void>;
  /** Heal the network and answer everything still in the air. */
  drain: () => Promise<void>;
  edit: (field: Field, token: string, bad?: boolean, onApp?: string) => void;
  check: (condition: boolean, message: string) => void;
}

export interface CaseDef {
  name: string;
  about: string;
  run: (ctx: CaseContext) => Promise<void>;
}

export interface CaseResult {
  name: string;
  violations: Violation[];
}

const emptyStats = (): RunStats => ({
  ops: 0, edits: 0, editorSaves: 0, regens: 0, agentWrites: 0, handoffs: 0, polls: 0, saves: 0, requests: 0,
  dropped: 0, lostAnswers: 0, hung: 0, conflictNotices: 0, failureNotices: 0, settleRounds: 0,
});

export const CASES: CaseDef[] = [
  {
    name: 'codex-1 handoff registers a baseline',
    about: 'An application created by the feed handoff must save the edits made to it.',
    run: async (ctx) => {
      const fresh = ctx.server.create('feed');
      const row = ctx.server.rowOf(fresh)!;
      await ctx.client.handoff(row);
      ctx.client.setCurrent(fresh);
      ctx.net.reliable = true;
      ctx.edit('jobTitle', 't:H1;', false, fresh);
      await ctx.client.save(fresh);
      ctx.check(ctx.server.acceptedHas(fresh, 't:H1;'), 'an edit on a feed-created application never reached the server');
    },
  },
  {
    name: 'codex-2 editor survives a failed conflict reload',
    about: 'A save that conflicts, then fails to reload, then is retried, must not close the editor with the draft lost.',
    run: async (ctx) => {
      const { server, net, client, app } = ctx;
      server.write(app, serverColumns('coverLetter', 't:S1;'), 'agent');
      const start = client.editorStart(app);
      const draft = 't:D1;';
      const apply = () => client.edit(app, fieldMutation('coverLetter', draft));
      const first = client.editorCommit(app, start, apply);
      await flush();
      await ctx.serve('save');
      // The conflict reload cannot reach the server.
      await flush();
      await ctx.serve('getRow', { failAnswer: true });
      const firstOutcome = await first;
      ctx.check(!client.editorSucceeded(firstOutcome) || server.acceptedHas(app, draft), `first save reported "${firstOutcome}" without the draft on the server`);
      net.reliable = true;
      const secondOutcome = await client.editorCommit(app, start, apply);
      ctx.check(!client.editorSucceeded(secondOutcome) || server.acceptedHas(app, draft), `retry reported "${secondOutcome}" but the server never accepted the draft (the draft was lost)`);
    },
  },
  {
    name: 'codex-3 edit made while an adoption reload is in flight',
    about: 'A change made while the reload after a regenerate is on its way must survive it.',
    run: async (ctx) => {
      const { server, client, app } = ctx;
      server.write(app, serverColumns('jobTitle', 't:G1;'), 'agent');
      const { props, columns } = responseProps('coverLetter', 't:R1;');
      const revision = server.write(app, serverColumns('coverLetter', 't:R1;'), 'route');
      const response = client.mutationResponse(app, { revision, props, columns });
      await flush();
      ctx.edit('company', 't:C1;');                // typed while the row is still on its way
      await ctx.serve('getRow');
      await ctx.drain();
      await response;
      ctx.check(JSON.stringify(client.session(app)).includes('t:C1;'), 'the edit made during the reload was overwritten');
    },
  },
  {
    name: 'codex-4 late regenerate response after a newer revision',
    about: 'A response that arrives after polling loaded a newer revision must not bring older content back or advance the baseline over it.',
    run: async (ctx) => {
      const { server, net, client, app } = ctx;
      // Regenerate 1: the route writes the letter (revision 1); its answer is held on the way back.
      const { props, columns } = responseProps('coverLetter', 't:L1;');
      const late = net.request(client.id, 'mutate', () => ({ revision: server.write(app, serverColumns('coverLetter', 't:L1;'), 'route'), props, columns }));
      const held = net.find(client.id, 'mutate')!;
      net.advance(held);                           // reaches the server, answer not delivered
      // Someone writes the letter again (revision 2) and this tab polls it in.
      server.write(app, serverColumns('coverLetter', 't:L2;'), 'agent');
      const polled = client.poll(app);
      await flush();
      await ctx.serve('getRevision');
      await flush();
      await ctx.serve('getRow');
      await polled;
      // Now the late answer arrives.
      net.advance(held);
      const response = await late;
      net.reliable = true;
      await client.mutationResponse(app, response);
      const body = JSON.stringify(client.session(app)?.coverLetter);
      ctx.check(body.includes('t:L2;') && !body.includes('t:L1;'), `the tab shows the older letter after the late response: ${body.slice(0, 80)}`);
    },
  },
  {
    name: 'low refused value does not block polling',
    about: 'A field the server refused stays unsaved, but the newer server state still loads.',
    run: async (ctx) => {
      const { server, client, app } = ctx;
      ctx.edit('jobDescription', 't:B1;', true);
      const saved = client.save(app);
      await flush();
      await ctx.serve('save');
      await saved;
      server.write(app, serverColumns('company', 't:N1;'), 'agent');
      const polled = client.poll(app);
      await flush();
      await ctx.serve('getRevision');
      await flush();
      await ctx.serveIfPending('getRow');
      await ctx.drain();
      await polled;
      ctx.check(client.session(app)?.company === 't:N1;', 'the poll did not load the newer company because a refused field was pending');
    },
  },
  {
    name: 'round-1 h2 edit made while a poll reload is in flight',
    about: 'A template change made while the poll reload is on its way is kept and saved, and the other writer\'s change loads.',
    run: async (ctx) => {
      const { server, client, app } = ctx;
      server.write(app, serverColumns('coverLetter', 't:X1;'), 'agent');
      const polled = client.poll(app);
      await flush();
      await ctx.serve('getRevision');
      await flush();
      ctx.edit('selectedTemplate', 't:T1;');       // typed while the reload request is held
      await ctx.serve('getRow');
      await ctx.drain();
      await polled;
      await client.save(app);
      ctx.check(server.acceptedHas(app, 't:T1;'), 'the template change made during the reload never reached the server');
      ctx.check(JSON.stringify(client.session(app)?.coverLetter).includes('t:X1;'), 'the other writer\'s letter did not load');
    },
  },
];

export async function runCase(def: CaseDef, engine: 'new' | 'legacy'): Promise<CaseResult> {
  const rng = makeRng(7);
  const clock = new FakeClock();
  const server = new FakeServer();
  const net = new RequestScheduler(rng);
  net.allowHang = engine === 'new';
  const world = { clock, server, net };
  const violations: Violation[] = [];
  const violate = (code: InvariantCode, message: string) => { violations.push({ code, message }); };
  const client = engine === 'new' ? newClient('A', world) : await legacyClient('A', world);
  const app = server.create('seed');
  await client.hydrate(server.rowOf(app)!);
  client.setCurrent(app);
  net.reliable = false;
  net.chaos = false;

  const lastEdit = new Map<string, { client: string; app: string; field: Field; token: string; viaEditor: boolean }>();
  const ctx: CaseContext = {
    server, net, client, app,
    serve: async (kind, options) => {
      await flush();
      const req = net.find(client.id, kind);
      if (!req) throw new Error(`no pending ${kind} request`);
      if (options?.failAnswer) req.deliver = 'fail';
      net.complete(req);
      await flush();
    },
    serveIfPending: async (kind) => {
      await flush();
      const req = net.find(client.id, kind);
      if (req) net.complete(req);
      await flush();
    },
    drain: async () => {
      net.reliable = true;
      for (let i = 0; i < 8; i++) {
        await flush();
        for (const req of [...net.pending]) net.complete(req);
      }
    },
    edit: (field, token, bad = false, onApp = app) => {
      client.edit(onApp, fieldMutation(field, token, bad));
      lastEdit.set(`${client.id}|${onApp}|${field}`, { client: client.id, app: onApp, field, token, viaEditor: false });
    },
    check: (condition, message) => { if (!condition) violate('I1', message); },
  };
  // A tab that waits forever on a lost answer would stall the whole run silently; give each case a real-time deadline.
  const deadline = <T>(work: Promise<T>, label: string): Promise<T | undefined> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => { violate('ERR', `${label} did not finish (a request was never answered)`); resolve(undefined); }, 15_000);
      work.then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error) => { clearTimeout(timer); violate('ERR', `${label} threw: ${error instanceof Error ? error.message : String(error)}`); resolve(undefined); },
      );
    });
  await deadline(def.run(ctx), 'the case');
  net.reliable = true;
  // Answer anything the case left in the air.
  for (const req of [...net.pending]) net.complete(req);
  await deadline(settleAndVerify({
    world, clients: [client], lastEdit: lastEdit as never, openEditorTokens: new Set(), violate, stats: emptyStats(),
  }), 'settling');
  return { name: def.name, violations };
}
