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
import type { ConflictAcknowledgement } from '@/lib/session-sync-engine';
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
      const after = client.editorAfter(app, outcome, sent, typed, start);
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
      const copied = client.copyNotice(second) ?? '';
      ctx.check(!copied.includes('t:C1;'), 'Copy on the cover letter notice offered the company text too');
      net.reliable = true;
      await client.restoreNotice(second);
      await flush();
      ctx.check(server.acceptedHas(app, 't:L1;'), 'Restore did not put the cover letter text back');
      ctx.check(!server.acceptedHas(app, 't:C1;'), 'Restore on the cover letter notice also restored the company text');
    },
  },
  {
    name: 'round-3b Restore applies a whole entry or none of it',
    about: 'If any property of an entry is blocked (here the user typed new screening text), nothing of it is restored: the user\'s old title is never paired with the server\'s newer CV.',
    run: async (ctx) => {
      const { server, client, app } = ctx;
      // Two things in the CV column, both edited here; then the server rewrites the column.
      ctx.edit('cv', 't:P1;');
      ctx.edit('screening', 't:P2;');
      server.writeField(app, 'cv', 't:G1;', 'agent');
      await pollNow(ctx);
      const notice = [...client.notices].reverse().find((candidate) => candidate.conflictFor);
      ctx.check(notice !== undefined, 'the poll raised no conflict notice');
      if (!notice) return;
      const entryIds = client.noticeEntries(notice).map((entry) => entry.id);
      // New screening text typed after the conflict blocks the entry.
      ctx.edit('screening', 't:P3;');
      await client.restoreNotice(notice);
      const shown = JSON.stringify(client.session(app)?.optimizedCVData);
      ctx.check(!shown.includes('t:P1;'), `a blocked entry was partly restored: the old title is back (${shown.slice(0, 90)})`);
      ctx.check(shown.includes('t:G1;'), 'the server\'s newer CV title is no longer shown');
      ctx.check(entryIds.every((id) => client.bufferIds(app).includes(id)), 'a blocked entry left the buffer');
      ctx.check((client.copyNotice(notice) ?? '').includes('t:P1;'), 'the blocked entry\'s text can no longer be copied');
      const fresh = client.notices[client.notices.length - 1];
      ctx.check(fresh !== notice && fresh.conflictFor === app, 'a blocked Restore raised no fresh notice');
    },
  },
  {
    name: 'round-3b Copy with nothing left says so instead of copying an empty string',
    about: 'After the text was restored (or settled), Copy on the old notice must report nothing left, not write an empty clipboard.',
    run: async (ctx) => {
      const { server, client, app } = ctx;
      ctx.edit('company', 't:E1;');
      server.writeField(app, 'company', 't:G2;', 'agent');
      await pollNow(ctx);
      const notice = [...client.notices].reverse().find((candidate) => candidate.conflictFor);
      ctx.check(notice !== undefined, 'the poll raised no conflict notice');
      if (!notice) return;
      await client.restoreNotice(notice);                       // the text goes back and is saved
      const copied = client.copyNotice(notice);
      ctx.check(copied === null, `Copy on a notice with nothing left gave ${JSON.stringify(copied)} instead of "nothing left"`);
    },
  },
  {
    name: 'pr159 Discard reaches only the editor whose text it throws away',
    about: 'Two open editors (CV and cover letter) and a conflict notice about the letter: Discard resets the letter editor that holds the text, not the CV edit and not a letter editor opened after the conflict.',
    run: async (ctx) => {
      const { server, net, client, app } = ctx;
      net.reliable = true;
      const cvStart = client.editorStart(app);
      const letterStart = client.editorStart(app);
      server.writeField(app, 'coverLetter', 't:G1;', 'agent');
      await client.poll(app);
      const outcome = await client.editorCommit(app, letterStart, () => client.edit(app, fieldMutation('coverLetter', 't:L1;')));
      ctx.check(outcome === 'conflict', `the letter draft on an older revision was not a conflict (${outcome})`);
      const notice = [...client.notices].reverse().find((candidate) => candidate.conflictFor);
      ctx.check(notice !== undefined, 'the conflicting editor save raised no notice');
      if (!notice) return;
      const freshLetterStart = client.editorStart(app);
      const heard: { ack?: ConflictAcknowledgement } = {};
      client.subscribeAcknowledged((_app, ack) => { heard.ack = ack; });
      client.dismissNotice(notice);
      if (!heard.ack) { ctx.check(false, 'Discard told no open editor'); return; }
      ctx.check(client.acknowledgementFor(heard.ack, ['cv'], cvStart) === 'ignore', 'discarding the letter text reaches the CV editor');
      ctx.check(client.acknowledgementFor(heard.ack, ['coverLetter'], letterStart) === 'reset', 'discarding the letter text does not reset the letter editor that holds it');
      ctx.check(client.acknowledgementFor(heard.ack, ['coverLetter'], freshLetterStart) === 'ignore', 'discarding an old notice resets a letter editor opened after the conflict');
      // An editor with no start cannot be shown to hold this text, so the discard leaves it alone; its Save is then
      // checked as stale and cannot write over the newer letter (the round 2 rule: no lineage matches no editor).
      ctx.check(client.acknowledgementFor(heard.ack, ['coverLetter'], undefined) === 'ignore', 'a discard reached an editor with no start, which cannot be shown to hold its text');
      server.writeField(app, 'coverLetter', 't:G2;', 'agent');
      await client.poll(app);
      const unchecked = await client.editorCommit(app, undefined, () => client.edit(app, fieldMutation('coverLetter', 't:L9;')));
      ctx.check(unchecked === 'conflict' && !server.acceptedHas(app, 't:L9;'), `an editor with no start saved over a newer letter (${unchecked})`);
    },
  },
  {
    name: 'r2-1 Copy of an email conflict leaves the follow-up snapshot alone',
    about: 'The email panel opens on r1 with both documents. An email-only conflict is copied after a newer follow-up arrived: only the email snapshot moves, so Save cannot write the r1 follow-up over the newer one.',
    run: async (ctx) => {
      const { server, net, client, app } = ctx;
      net.reliable = true;
      const opened = client.session(app);
      const followUpCopy = opened?.followUpEmail;
      let start = client.editorStart(app);
      const apply = () => client.edit(app, (session) => ({ ...fieldMutation('email', 't:E1;')(session), ...(followUpCopy ? { followUpEmail: followUpCopy } : {}) }));
      server.writeField(app, 'email', 't:G1;', 'agent');
      await client.poll(app);
      const first = await client.editorCommit(app, start, apply);
      ctx.check(first === 'conflict', `the email draft on an older revision was not a conflict (${first})`);
      const notice = [...client.notices].reverse().find((candidate) => candidate.conflictFor);
      if (!notice) { ctx.check(false, 'the email conflict raised no notice'); return; }
      server.writeField(app, 'followUpEmail', 't:G2;', 'agent');
      await client.poll(app);
      const actions: string[] = [];
      client.subscribeAcknowledged((_app, ack) => {
        const email = client.acknowledgementFor(ack, ['email'], start);
        const followUp = client.acknowledgementFor(ack, ['followUpEmail'], start);
        actions.push(`${email}/${followUp}`);
        start = client.acknowledgedStart(ack, [...(email === 'rebase' ? ['email'] : []), ...(followUp === 'rebase' ? ['followUpEmail'] : [])], start);
      });
      client.copyNotice(notice);
      ctx.check(actions[0] === 'rebase/ignore', `Copy of the email conflict acted on the panel as ${actions[0]}, expected rebase/ignore`);
      const second = await client.editorCommit(app, start, apply);
      const followUpNow = JSON.stringify(server.rowOf(app)?.follow_up_email ?? null);
      ctx.check(second === 'conflict' && followUpNow.includes('t:G2;'), `Save after Copy replaced the newer follow-up with the r1 copy (${second}, follow-up ${followUpNow.slice(0, 80)})`);
    },
  },
  {
    name: 'r2-2 Discard of a save-reconciliation conflict spares a newer editor',
    about: 'A save that conflicts at the server sets the draft aside in its reconciliation. That entry still names its editor: Discard resets that editor only, never a newer editor of the same field opened after Cancel.',
    run: async (ctx) => {
      const { server, net, client, app } = ctx;
      const startA = client.editorStart(app);
      const committing = client.editorCommit(app, startA, () => client.edit(app, fieldMutation('coverLetter', 't:A1;')));
      await flush();
      server.writeField(app, 'coverLetter', 't:G1;', 'agent');   // lands between the draft and its save
      await ctx.serve('save');
      await ctx.serve('getRow');
      await ctx.drain();
      const outcome = await committing;
      ctx.check(outcome === 'conflict', `a save the server refused for a newer letter was not a conflict (${outcome})`);
      const notice = [...client.notices].reverse().find((candidate) => candidate.conflictFor);
      if (!notice) { ctx.check(false, 'the reconciliation conflict raised no notice'); return; }
      // Cancel A, open B on the current revision and type.
      const startB = client.editorStart(app);
      const heard: { ack?: ConflictAcknowledgement } = {};
      client.subscribeAcknowledged((_app, ack) => { heard.ack = ack; });
      client.dismissNotice(notice);
      if (!heard.ack) { ctx.check(false, 'Discard told no open editor'); return; }
      ctx.check(client.acknowledgementFor(heard.ack, ['coverLetter'], startB) === 'ignore', 'discarding an old reconciliation notice reset a newer editor of the letter');
      ctx.check(client.acknowledgementFor(heard.ack, ['coverLetter'], startA) === 'reset', 'discarding a reconciliation notice did not reach the editor whose text it holds');
      net.reliable = true;
      const saved = await client.editorCommit(app, startB, () => client.edit(app, fieldMutation('coverLetter', 't:B1;')));
      ctx.check(saved === 'saved' && server.acceptedHas(app, 't:B1;'), `the newer editor's draft did not save (${saved})`);
    },
  },
  {
    name: 'r2-3 Copy of another editor\'s notice leaves a stale draft checked',
    about: 'A conflict from editor A, A cancelled, editor B opened and typed, another remote letter polled, then Copy on A\'s old notice: B is not rebased, so its Save conflicts instead of overwriting the newer letter.',
    run: async (ctx) => {
      const { server, net, client, app } = ctx;
      net.reliable = true;
      const startA = client.editorStart(app);
      server.writeField(app, 'coverLetter', 't:G1;', 'agent');
      await client.poll(app);
      const first = await client.editorCommit(app, startA, () => client.edit(app, fieldMutation('coverLetter', 't:A1;')));
      ctx.check(first === 'conflict', `A's draft on an older revision was not a conflict (${first})`);
      const notice = [...client.notices].reverse().find((candidate) => candidate.conflictFor);
      if (!notice) { ctx.check(false, 'A\'s conflict raised no notice'); return; }
      let startB = client.editorStart(app);
      const actions: string[] = [];
      client.subscribeAcknowledged((_app, ack) => {
        const action = client.acknowledgementFor(ack, ['coverLetter'], startB);
        actions.push(action);
        if (action === 'rebase') startB = client.acknowledgedStart(ack, ['coverLetter'], startB);
      });
      server.writeField(app, 'coverLetter', 't:G2;', 'agent');
      await client.poll(app);
      client.copyNotice(notice);
      ctx.check(actions[0] === 'ignore', `Copy on A's notice acted on editor B (${actions[0]})`);
      const second = await client.editorCommit(app, startB, () => client.edit(app, fieldMutation('coverLetter', 't:B1;')));
      ctx.check(second === 'conflict' && !server.acceptedHas(app, 't:B1;'), `B's Save overwrote the newer letter (${second})`);
    },
  },
  {
    name: 'r2-4 Copy moves the producing editor only to the version its notice showed',
    about: 'Editor A conflicts at G1; the server moves to G2 before the user copies. A is rebased to G1, the version the notice showed, so its next Save conflicts on G2 instead of overwriting a letter the user never saw.',
    run: async (ctx) => {
      const { server, net, client, app } = ctx;
      net.reliable = true;
      let startA = client.editorStart(app);
      server.writeField(app, 'coverLetter', 't:G1;', 'agent');
      await client.poll(app);
      const first = await client.editorCommit(app, startA, () => client.edit(app, fieldMutation('coverLetter', 't:A1;')));
      ctx.check(first === 'conflict', `A's draft on an older revision was not a conflict (${first})`);
      const notice = [...client.notices].reverse().find((candidate) => candidate.conflictFor);
      if (!notice) { ctx.check(false, 'A\'s conflict raised no notice'); return; }
      client.subscribeAcknowledged((_app, ack) => {
        if (client.acknowledgementFor(ack, ['coverLetter'], startA) === 'rebase') startA = client.acknowledgedStart(ack, ['coverLetter'], startA);
      });
      server.writeField(app, 'coverLetter', 't:G2;', 'agent');
      await client.poll(app);
      client.copyNotice(notice);
      const second = await client.editorCommit(app, startA, () => client.edit(app, fieldMutation('coverLetter', 't:A2;')));
      ctx.check(second === 'conflict' && !server.acceptedHas(app, 't:A2;'), `A's Save after Copy overwrote a letter its notice never showed (${second})`);
      // Copied at the version it showed, a second Save from A after copying the newer notice goes through.
      const latest = [...client.notices].reverse().find((candidate) => candidate.conflictFor);
      if (latest && latest !== notice) client.copyNotice(latest);
      const third = await client.editorCommit(app, startA, () => client.edit(app, fieldMutation('coverLetter', 't:A3;')));
      ctx.check(third === 'saved' && server.acceptedHas(app, 't:A3;'), `A could not save after copying the notice that showed the newer letter (${third})`);
    },
  },
  {
    name: 'r2-5 a confirmed save rebases only the columns it wrote',
    about: 'The email panel saves while the server changes the follow-up underneath (merged in the save\'s reconciliation) and the user keeps typing. Only the email snapshot moves, so the next Save cannot put the old follow-up copy over the newer one.',
    run: async (ctx) => {
      const { server, net, client, app } = ctx;
      const followUpCopy = client.session(app)?.followUpEmail;
      const start = client.editorStart(app);
      const applyWith = (token: string) => () => client.edit(app, (session) => ({ ...fieldMutation('email', token)(session), ...(followUpCopy ? { followUpEmail: followUpCopy } : {}) }));
      const committing = client.editorCommit(app, start, applyWith('t:E1;'));
      await flush();
      server.writeField(app, 'followUpEmail', 't:G1;', 'agent');   // lands between the drafts and their save
      await ctx.serve('save');
      await ctx.serve('getRow');
      await ctx.drain();
      const outcome = await committing;
      ctx.check(outcome === 'saved' && server.acceptedHas(app, 't:E1;'), `the email draft did not save (${outcome})`);
      // The user typed more during the save, so the panel stays open on the confirmed columns.
      const after = client.editorAfter(app, outcome, 'sent', 'typed more', start);
      ctx.check(!after.close && after.start !== undefined, 'the panel closed over text typed during the save');
      net.reliable = true;
      const second = await client.editorCommit(app, after.start, applyWith('t:E2;'));
      const followUpNow = JSON.stringify(server.rowOf(app)?.follow_up_email ?? null);
      ctx.check(second === 'conflict' && followUpNow.includes('t:G1;'), `the next Save put the old follow-up copy over the newer one (${second}, follow-up ${followUpNow.slice(0, 80)})`);
    },
  },
  {
    name: 'r3-x a partial Discard leaves the discarded document out of the next save\'s rebase',
    about: 'The email panel saves an email draft that conflicts, the user discards it and the panel stays open with the store\'s email (G1). A newer email (G2) arrives, then a follow-up-only save lands while the user types. That save confirms only the follow-up, so the email snapshot stays behind G2 and a later Save of the stale email copy is a conflict, never a write over G2.',
    run: async (ctx) => {
      const { server, net, client, app } = ctx;
      net.reliable = true;
      let start = client.editorStart(app);
      server.writeField(app, 'email', 't:G1;', 'agent');
      await client.poll(app);
      const first = await client.editorCommit(app, start, () => client.edit(app, fieldMutation('email', 't:E1;')));
      ctx.check(first === 'conflict', `the email draft on an older revision was not a conflict (${first})`);
      const notice = [...client.notices].reverse().find((candidate) => candidate.conflictFor);
      if (!notice) { ctx.check(false, 'the email conflict raised no notice'); return; }
      // The panel: a Discard of one document drops that draft and shows the store's version; the other draft stays.
      const actions: string[] = [];
      client.subscribeAcknowledged((_app, ack) => {
        const email = client.acknowledgementFor(ack, ['email'], start);
        const followUp = client.acknowledgementFor(ack, ['followUpEmail'], start);
        actions.push(`${email}/${followUp}`);
        if (email === 'reset' && followUp !== 'reset') start = client.discardedStart(app, start, ['email']);
      });
      client.dismissNotice(notice);
      ctx.check(actions[0] === 'reset/ignore', `Discard of the email conflict acted on the panel as ${actions[0]}, expected reset/ignore`);
      server.writeField(app, 'email', 't:G2;', 'agent');
      await client.poll(app);
      const save = await client.editorCommit(app, start, () => client.edit(app, fieldMutation('followUpEmail', 't:F1;')));
      ctx.check(save === 'saved', `the follow-up-only save was not saved (${save})`);
      const after = client.editorAfter(app, save, 'sent', 'typed more', start);
      ctx.check(!after.close, 'the panel closed although the user typed during the save');
      const stale = await client.editorCommit(app, after.start, () => client.edit(app, fieldMutation('email', 't:E3;')));
      const emailNow = JSON.stringify(server.rowOf(app)?.email ?? null);
      ctx.check(stale === 'conflict' && emailNow.includes('t:G2;'), `the stale email copy was saved over G2 (${stale}, email ${emailNow.slice(0, 80)})`);
    },
  },
  {
    name: 'r3-y a partial Discard moves only the discarded document\'s snapshot, to the version the panel shows',
    about: 'After a Discard of the email draft the panel shows the store\'s email (G1). Editing that copy and saving while the server is still on G1 is a save, not a false conflict. The follow-up keeps its own snapshot: a newer server follow-up (G3) that arrived before the Discard still makes a Save of the old follow-up copy a conflict.',
    run: async (ctx) => {
      const { server, net, client, app } = ctx;
      net.reliable = true;
      let start = client.editorStart(app);
      server.writeField(app, 'email', 't:G1;', 'agent');
      await client.poll(app);
      const first = await client.editorCommit(app, start, () => client.edit(app, fieldMutation('email', 't:E1;')));
      ctx.check(first === 'conflict', `the email draft on an older revision was not a conflict (${first})`);
      const notice = [...client.notices].reverse().find((candidate) => candidate.conflictFor);
      if (!notice) { ctx.check(false, 'the email conflict raised no notice'); return; }
      server.writeField(app, 'followUpEmail', 't:G3;', 'agent');
      await client.poll(app);
      const actions: string[] = [];
      client.subscribeAcknowledged((_app, ack) => {
        const email = client.acknowledgementFor(ack, ['email'], start);
        const followUp = client.acknowledgementFor(ack, ['followUpEmail'], start);
        actions.push(`${email}/${followUp}`);
        if (email === 'reset' && followUp !== 'reset') start = client.discardedStart(app, start, ['email']);
      });
      client.dismissNotice(notice);
      ctx.check(actions[0] === 'reset/ignore', `Discard of the email conflict acted on the panel as ${actions[0]}, expected reset/ignore`);
      const edited = await client.editorCommit(app, start, () => client.edit(app, fieldMutation('email', 't:E2;')));
      ctx.check(edited === 'saved' && server.acceptedHas(app, 't:E2;'), `an edit of the email the panel shows raised a false conflict (${edited})`);
      const after = client.editorAfter(app, edited, 'sent', 'typed more', start);
      ctx.check(!after.close, 'the panel closed although the user typed during the save');
      const stale = await client.editorCommit(app, after.start, () => client.edit(app, fieldMutation('followUpEmail', 't:F1;')));
      const followUpNow = JSON.stringify(server.rowOf(app)?.follow_up_email ?? null);
      ctx.check(stale === 'conflict' && followUpNow.includes('t:G3;'), `the old follow-up copy was saved over G3 (${stale}, follow-up ${followUpNow.slice(0, 80)})`);
    },
  },
  {
    name: 'r4-1 a save waiting for the lock does not write an email draft discarded after Save was clicked',
    about: 'The email panel\'s email draft E1 conflicts (G1). The user clicks Save again while another save holds the lock, then discards the E1 notice before that save answers. The queued save runs with its old closure: it must skip the discarded email, so E1 comes back in no new notice, never reaches the store or the server, and the editor keeps showing the store\'s email.',
    run: async (ctx) => {
      const { server, net, client, app } = ctx;
      net.reliable = true;
      let start = client.editorStart(app);
      server.writeField(app, 'email', 't:G1;', 'agent');
      await client.poll(app);
      const first = await client.editorCommit(app, start, () => client.edit(app, fieldMutation('email', 't:E1;')));
      ctx.check(first === 'conflict', `the email draft on an older revision was not a conflict (${first})`);
      const notice = [...client.notices].reverse().find((candidate) => candidate.conflictFor);
      if (!notice) { ctx.check(false, 'the email conflict raised no notice'); return; }
      // The panel: per-document discard counts, and a partial Discard keeps the editor open on the other document.
      const discards = { email: 0, followUpEmail: 0 };
      const actions: string[] = [];
      client.subscribeAcknowledged((_app, ack) => {
        const email = client.acknowledgementFor(ack, ['email'], start);
        const followUp = client.acknowledgementFor(ack, ['followUpEmail'], start);
        actions.push(`${email}/${followUp}`);
        if (email === 'reset') discards.email += 1;
        if (email === 'reset' && followUp !== 'reset') start = client.discardedStart(app, start, ['email']);
      });
      // Another save holds the application's lock, waiting on the network.
      net.reliable = false;
      ctx.edit('jobTitle', 't:J1;');
      const holding = client.save(app);
      await flush();
      // Save clicked: the panel's closure holds E1 and the start of the click.
      const atSave = { ...discards };
      const queued = client.editorCommit(app, start, () => {
        if (!client.discardedSinceSave(atSave.email, discards.email)) client.edit(app, fieldMutation('email', 't:E1;'));
      });
      await flush();
      const noticesBefore = client.notices.length;
      client.dismissNotice(notice);
      ctx.check(actions[0] === 'reset/ignore', `Discard of the email conflict acted on the panel as ${actions[0]}, expected reset/ignore`);
      await ctx.serve('save');
      await ctx.drain();
      await holding;
      const outcome = await queued;
      const emailNow = JSON.stringify(client.session(app)?.email ?? null);
      const revived = client.notices.slice(noticesBefore).filter((candidate) => client.noticeText(candidate).includes('t:E1;'));
      ctx.check(revived.length === 0, `the queued save brought the discarded email back in a new notice (${outcome})`);
      ctx.check(!emailNow.includes('t:E1;') && emailNow.includes('t:G1;'), `the queued save put the discarded email into the store (${emailNow.slice(0, 80)})`);
      ctx.check(!server.acceptedHas(app, 't:E1;'), 'the queued save sent the discarded email to the server');
    },
  },
  {
    name: 'r4-2 a partial Discard keeps the editor\'s lineage, so a notice about its other draft still reaches it',
    about: 'The email panel\'s follow-up draft F1 goes into the store but its save is lost. A retry with the email draft conflicts on a newer email (G1) and the user discards that email notice (a partial Discard, which rebases the snapshot). A newer server follow-up (G2) then sets F1 aside in an entry naming the editor\'s lineage. Copy of that notice must rebase the panel\'s follow-up and Discard must reset it: the rebase kept the lineage (mutation M18 gives it a new, empty one).',
    run: async (ctx) => {
      const { server, net, client, app } = ctx;
      let start = client.editorStart(app);
      // Try 1: F1 reaches the store; the save request never reaches the server and an error comes back.
      const tryOne = client.editorCommit(app, start, () => client.edit(app, fieldMutation('followUpEmail', 't:F1;')));
      await flush();
      const lost = net.find(client.id, 'save');
      if (!lost) { ctx.check(false, 'the follow-up save sent no request'); return; }
      lost.arrive = 'drop';
      lost.deliver = 'fail';
      net.complete(lost);
      await flush();
      const first = await tryOne;
      ctx.check(first === 'error' && !server.acceptedHas(app, 't:F1;'), `the lost follow-up save was not an error (${first})`);
      net.reliable = true;
      // Try 2: the email draft against a newer server email. F1 is already in the store, so only the email is set aside.
      server.writeField(app, 'email', 't:G1;', 'agent');
      await client.poll(app);
      const second = await client.editorCommit(app, start, () => client.edit(app, fieldMutation('email', 't:E1;')));
      ctx.check(second === 'conflict', `the email draft on an older revision was not a conflict (${second})`);
      const emailNotice = [...client.notices].reverse().find((candidate) => candidate.conflictFor);
      if (!emailNotice) { ctx.check(false, 'the email conflict raised no notice'); return; }
      const actions: string[] = [];
      client.subscribeAcknowledged((_app, ack) => {
        const email = client.acknowledgementFor(ack, ['email'], start);
        const followUp = client.acknowledgementFor(ack, ['followUpEmail'], start);
        actions.push(`${email}/${followUp}`);
        if (email === 'reset' && followUp !== 'reset') start = client.discardedStart(app, start, ['email']);
        else if (followUp === 'rebase') start = client.acknowledgedStart(ack, ['followUpEmail'], start);
      });
      client.dismissNotice(emailNotice);
      ctx.check(actions[0] === 'reset/ignore', `Discard of the email conflict acted on the panel as ${actions[0]}, expected reset/ignore`);
      // A newer server follow-up: the merge sets the store's F1 aside, in an entry naming the editor whose draft it is.
      server.writeField(app, 'followUpEmail', 't:G2;', 'agent');
      await client.poll(app);
      const followUpNotice = [...client.notices].reverse().find((candidate) => candidate.conflictFor && candidate !== emailNotice);
      if (!followUpNotice) { ctx.check(false, 'the follow-up merge raised no notice'); return; }
      ctx.check(client.noticeText(followUpNotice).includes('t:F1;'), 'the follow-up notice does not hold F1');
      client.copyNotice(followUpNotice);
      ctx.check(actions[1] === 'ignore/rebase', `Copy of the follow-up notice acted on the panel as ${actions[1]}, expected ignore/rebase (the partial Discard gave the editor a new lineage)`);
      client.dismissNotice(followUpNotice);
      ctx.check(actions[2] === 'ignore/reset', `Discard of the follow-up notice acted on the panel as ${actions[2]}, expected ignore/reset (the partial Discard gave the editor a new lineage)`);
    },
  },
  {
    name: 'pr159 a draft that reopens with no start is checked as stale',
    about: 'A save that was running when its draft was discarded reopens nothing; a draft that does reopen without an EditorStart is saved against a start that never matches, so it cannot overwrite a newer CV.',
    run: async (ctx) => {
      const { server, net, client, app } = ctx;
      net.reliable = true;
      server.writeField(app, 'cv', 't:G1;', 'agent');
      await client.poll(app);
      ctx.check(client.afterClosedEditorSave('conflict', 1, 2, undefined).reopen === false, 'a draft discarded while its save ran was reopened');
      const again = client.afterClosedEditorSave('conflict', 1, 1, undefined);
      ctx.check(again.reopen && again.start !== undefined, 'a reopened draft has no start');
      if (!again.reopen) return;
      const outcome = await client.editorCommit(app, again.start, () => client.edit(app, fieldMutation('cv', 't:D1;')));
      ctx.check(outcome === 'conflict' && !server.acceptedHas(app, 't:D1;'), `a draft with a lost start was saved over the newer CV (${outcome})`);
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
