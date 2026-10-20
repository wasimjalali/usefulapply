/**
 * Deterministic cases: the four races Codex reproduced in round 2, the
 * refused-value poll block, round 1's "change made while a poll reload is in
 * flight", and the three review round 3 bugs (a late workflow_complete that
 * installs older content, typing while a save is in flight, Restore acting on
 * every buffered entry). Each one drives requests by hand, so the order is
 * exact, then runs the same settle-and-verify as the randomized runs.
 */

import { toStoreApplicationSession } from '@/components/job-feed/feed-session-mapper';
import { mapSessionRowToStore } from '@/lib/session-row-mapping';
import { columnFingerprints } from '@/lib/session-sync-engine';
import type { Adapter } from './adapters';
import { fieldMutation, kitProps, legacyClient, loadEngine, newClient, responseProps } from './adapters';
import { emptyStats, settleAndVerify, type InvariantCode, type Violation } from './driver';
import { FakeClock, FakeServer, RequestScheduler, flush, makeRng, serverColumns, cvObject, type Field, type RequestKind } from './world';

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

/** Poll and answer the revision check and the row fetch by hand. */
async function pollNow(ctx: CaseContext): Promise<void> {
  const polled = ctx.client.poll(ctx.app);
  await flush();
  await ctx.serveIfPending('getRevision');
  await flush();
  await ctx.serveIfPending('getRow');
  await ctx.drain();
  await polled;
}

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
  {
    name: 'round-3 workflow_complete must not install older generated content',
    about: 'A generation result that arrives after a newer generation was polled in must not put its older fields on screen.',
    run: async (ctx) => {
      const { server, net, client, app } = ctx;
      // Generation 1 is saved (revision 1); its result is held on the way back.
      const first = net.request(client.id, 'mutate', () => {
        const revision = server.persistKit(app, 't:K1;', 'route');
        return { revision, props: kitProps(server.rowOf(app)!), columns: [] as string[] };
      });
      const held = net.find(client.id, 'mutate')!;
      net.advance(held);
      // Generation 2 is saved (revision 2) and this tab polls it in.
      server.persistKit(app, 't:K2;', 'agent');
      const polled = client.poll(app);
      await flush();
      await ctx.serve('getRevision');
      await flush();
      await ctx.serve('getRow');
      await polled;
      // Now the first result arrives.
      net.advance(held);
      const response = await first;
      net.reliable = true;
      await client.workflowComplete(app, response);
      const shown = JSON.stringify([client.session(app)?.coverLetter, client.session(app)?.optimizedCVData]);
      ctx.check(shown.includes('t:K2;') && !shown.includes('t:K1;'), `the tab shows generation 1 after its late result: ${shown.slice(0, 90)}`);
    },
  },
  {
    name: 'round-3 typing during a save is not lost',
    about: 'Text typed while an editor save is in flight keeps the editor open with the newer draft, which then saves on the new revision.',
    run: async (ctx) => {
      const { server, net, client, app } = ctx;
      const start = client.editorStart(app);
      const sent = 't:D1;';
      const typed = 't:D2;';
      const first = client.editorCommit(app, start, () => client.edit(app, fieldMutation('coverLetter', sent)));
      await flush();                                // the save is in flight; the user types more
      await ctx.serve('save');
      const outcome = await first;
      const after = client.editorAfter(app, outcome, sent, typed);
      ctx.check(!after.close, `the editor closed (${outcome}) over text typed while the save ran`);
      net.reliable = true;
      const second = await client.editorCommit(app, after.start ?? start, () => client.edit(app, fieldMutation('coverLetter', typed)));
      ctx.check(client.editorSucceeded(second) && server.acceptedHas(app, typed), `the newer draft did not reach the server (${second})`);
    },
  },
  {
    name: 'round-3 Restore and Copy act on their own notice only',
    about: 'Two conflicts, two notices: Restore on the second puts back the second text only, and Copy offers only that.',
    run: async (ctx) => {
      const { server, net, client, app } = ctx;
      ctx.edit('company', 't:C1;');
      server.writeField(app, 'company', 't:G1;', 'agent');
      await pollNow(ctx);
      net.reliable = false;
      ctx.edit('coverLetter', 't:L1;');
      server.writeField(app, 'coverLetter', 't:G2;', 'agent');
      await pollNow(ctx);
      const notices = client.notices.filter((notice) => notice.conflictFor);
      ctx.check(notices.length >= 2, `expected two conflict notices, saw ${notices.length}`);
      const second = notices[notices.length - 1];
      const copied = client.copyNotice(second);
      ctx.check(!copied.includes('t:C1;'), 'Copy on the cover letter notice offered the company text too');
      net.reliable = true;
      await client.restoreNotice(second);
      await flush();
      ctx.check(server.acceptedHas(app, 't:L1;'), 'Restore did not put the cover letter text back');
      ctx.check(!server.acceptedHas(app, 't:C1;'), 'Restore on the cover letter notice also restored the company text');
    },
  },
  {
    name: 'low feed handoff mapper matches the standard mapper',
    about: 'A row loaded through the feed handoff has the same fields as the same row loaded any other way.',
    run: async (ctx) => {
      const row = {
        ...ctx.server.rowOf(ctx.app)!,
        selected_template: 'executive',
        revision: 7,
        generated_cv: null,
        generated_artifacts: { optimizedCVData: cvObject('from artifacts')._optimizedCVData },
      };
      const generation = { id: 'g1', attempt: 1, status: 'queued', error_message: null };
      const feed = toStoreApplicationSession(row as never, generation as never);
      const standard = mapSessionRowToStore(row);
      ctx.check(JSON.stringify(columnFingerprints(feed)) === JSON.stringify(columnFingerprints(standard)), 'the feed mapper produces other persisted fields than the standard mapper');
      ctx.check(feed.revision === 7 && feed.selectedTemplate === 'executive', 'the feed mapper drops the revision or the template');
      ctx.check(JSON.stringify(feed.optimizedCVData) === JSON.stringify(standard.optimizedCVData) && feed.optimizedCVData !== undefined, 'the feed mapper misses the generated_artifacts fallback for optimizedCVData');
    },
  },
];

export async function runCase(def: CaseDef, engine: 'new' | 'round2' | 'legacy'): Promise<CaseResult> {
  const rng = makeRng(7);
  const clock = new FakeClock();
  const server = new FakeServer();
  const net = new RequestScheduler(rng);
  net.allowHang = engine !== 'legacy';
  const world = { clock, server, net };
  const violations: Violation[] = [];
  const violate = (code: InvariantCode, message: string) => { violations.push({ code, message }); };
  const client = engine === 'legacy'
    ? await legacyClient('A', world)
    : newClient('A', world, await loadEngine(engine === 'round2' ? 'round2' : 'current'), engine === 'round2' ? 'round2' : 'current');
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
