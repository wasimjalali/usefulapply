/**
 * Site: chat UX pass (src/app/api/chat/route.ts, the shipped POST handler, with its real tools), 33 turns.
 * Cases and what each checks: fixtures/cases.ts. The header of run.ts has the commands.
 *
 * Built on the 2026-10-22 chat site (haiku-55-swap/sites/chat.ts): it reuses that site's setup (local D1 built
 * from migrations/d1, route stubs, frozen clock, the 25 tracker rows) and its seed, and does not copy them.
 *
 * What changed since that site was written (PR #179, server-owned chat history):
 *  - For a saved application the route reads chat_messages from D1 and stores the user's turn and its reply itself.
 *    The old site inserted both rows after every turn and sent `chatHistory`, so every turn would have been
 *    stored twice and the next turn's history would have doubled. This site inserts nothing after a turn and sends
 *    no chatHistory. It sends `messageId` ("msg-..."), the way the client does (src/lib/chat-message-id.ts).
 *  - A conversation that starts with earlier messages (an ad pasted before, a long history) seeds them straight
 *    into chat_messages before its first turn (seedHistory).
 *  - After each turn the site checks the route stored exactly two rows (the user's, the reply) under the ids it
 *    expects, so a regression of that write shows up as a failure, not as a doubled prompt.
 *  - The compaction case reads the summary the route stored in chat_compactions (migration 0013).
 *
 * Primary metric: a case passes when every check holds (tools, chips, effects, rows changed, reply language,
 * length, patterns, summary). Metrics are means over the cases that carry the check, so two runs compare per
 * area: german_ok, length_ok, screening_called / screening_chip (positives), screening_false_positive
 * (negatives), claims_ok, summary_german, no_dash, plus pass_<category>. Hard constraint: unrequested_write.
 */
import { NextRequest } from 'next/server';
import { join } from 'node:path';
import { chatRuntime, chatSite, seedChatUser, USER_ID } from '../../haiku-55-swap/sites/chat';
import { currentScope, type Oracle } from '../../haiku-55-swap/lib/intercept';
import { withFixedClock } from '../../haiku-55-swap/lib/util';
import { FIXED_NOW, TRACKER_ROWS, rowId } from '../../haiku-55-swap/fixtures/tracker';
import { OPEN_APPLICATION_ID, TAILORED_CV, TIME_ZONE, WRITE_TOOLS } from '../../haiku-55-swap/fixtures/chat';
import type { Site } from '../../haiku-55-swap/lib/runner';
import { REPO_ROOT } from '../../haiku-55-swap/lib/core';
import { checkGerman, checkGermanSummary, countSentences, DASH_RE } from '../lib/checks';
import { CASES, EXPECTED, KNOWN_TOOLS, OFFER_SCREENING_TOOL, SCREENING_CHIP, type UxCase } from '../fixtures/cases';

const RESULTS_ROOT_UX = join(REPO_ROOT, 'evals', 'results', '2026-10-23-chat-ux');

/** What the grader needs from one turn. The route's answer is reduced to this shape in readChatAnswer. */
export interface ChatAnswer {
  reply?: string;
  error?: string;
  actions?: Array<{ label: string; action: string }>;
  executed?: Array<{ type: string }>;
  replyMessageId?: string;
}

/**
 * THE ONE PLACE THAT READS THE ROUTE'S ANSWER.
 *
 * Today /api/chat answers with one JSON body: { success, reply, actions, executed, replyMessageId, ... }.
 * A streaming version of the route is being built in another session. When it merges, change only this function:
 * read the stream to its end (for example the server-sent events, taking the text deltas for `reply` and the final
 * event for `actions`, `executed` and `replyMessageId`) and return the same ChatAnswer. Nothing else in this file
 * looks at the Response body.
 */
async function readChatAnswer(res: Response): Promise<ChatAnswer> {
  return (await res.json()) as ChatAnswer;
}

export interface TurnInput {
  status: number;
  body: ChatAnswer;
  toolsCalled: string[];
  /** Application ids whose status or dates changed during the turn. */
  changed: string[];
  dbFailures: string[];
  /** The summary the route stored this turn (chat_compactions), or null. */
  summary: string | null;
  /** Rows added to the application's chat_messages by the turn; the route stores two. Null when not measured. */
  rowsAdded: number | null;
}

export interface Graded {
  pass: boolean;
  failures: string[];
  hard: string[];
  metrics: Record<string, number>;
}

/** Tools a case must not call: the ones it names plus every write tool its script does not use. */
export function forbiddenOf(c: UxCase): string[] {
  const allowed = new Set(c.expect.tools ?? []);
  return [...new Set([...(c.expect.forbidden ?? []), ...WRITE_TOOLS.filter((t) => !allowed.has(t))])];
}

export function gradeUx(c: UxCase, input: TurnInput): Graded {
  const failures: string[] = [];
  const hard: string[] = [];
  const metrics: Record<string, number> = {};
  const e = c.expect;
  if (input.status !== 200) return { pass: false, failures: [`HTTP ${input.status}: ${input.body.error ?? ''}`], hard, metrics };

  const called = new Set(input.toolsCalled);
  for (const t of e.tools ?? []) if (!called.has(t)) failures.push(`did not call ${t}`);
  const forbidden = forbiddenOf(c);
  const badCalls = forbidden.filter((t) => called.has(t));
  if (badCalls.length > 0) failures.push(`called forbidden tool(s): ${badCalls.join(', ')}`);
  const effects = (input.body.executed ?? []).map((x) => x.type);
  const allowedIds = new Set((e.mayChange ?? []).map(rowId));
  const strayRows = input.changed.filter((id) => !allowedIds.has(id));
  const strayEffects = (e.mayChange ?? []).length === 0 ? effects.filter((t) => t === 'tracker_updated' || t === 'cv_structure_updated') : [];
  if (strayRows.length > 0) failures.push(`changed ${strayRows.length} row(s) the turn did not name`);
  if (strayEffects.length > 0) failures.push(`write effect on a turn that asked for none: ${strayEffects.join(', ')}`);
  if (badCalls.some((t) => (WRITE_TOOLS as readonly string[]).includes(t)) || strayRows.length > 0 || strayEffects.length > 0) hard.push('unrequested_write');
  for (const t of e.executed ?? []) if (!effects.includes(t)) failures.push(`response lacks the ${t} effect`);
  const actions = input.body.actions ?? [];
  for (const prefix of e.chips ?? []) if (!actions.some((a) => a.action.startsWith(prefix))) failures.push(`response lacks a ${prefix} chip`);
  for (const prefix of e.forbiddenChips ?? []) if (actions.some((a) => a.action.startsWith(prefix))) failures.push(`response carries a ${prefix} chip`);
  failures.push(...input.dbFailures);
  if (input.rowsAdded !== null && input.rowsAdded !== 2) failures.push(`the route stored ${input.rowsAdded} chat rows for the turn, expected 2 (the user's and the reply)`);

  const reply = input.body.reply ?? '';
  const r = e.reply;
  if (!reply.trim()) failures.push('empty reply');
  const noDash = !DASH_RE.test(reply);
  if (!noDash) failures.push('reply carries a dash');
  metrics.no_dash = noDash ? 1 : 0;
  if (r?.maxSentences !== undefined) {
    const n = countSentences(reply);
    const ok = n <= r.maxSentences;
    if (!ok) failures.push(`reply has ${n} sentences, max ${r.maxSentences}`);
    metrics.length_ok = ok ? 1 : 0;
    metrics.sentences = n;
  }
  if (r?.german) {
    const verdict = checkGerman(reply);
    if (!verdict.ok) failures.push(`reply is not German (${verdict.reason})`);
    metrics.german_ok = verdict.ok ? 1 : 0;
  }
  let patternsOk = true;
  for (const re of r?.mustMatch ?? []) if (!re.test(reply)) { failures.push(`reply does not match ${re}`); patternsOk = false; }
  for (const re of r?.mustNotMatch ?? []) if (re.test(reply)) { failures.push(`reply matches ${re}`); patternsOk = false; }
  if (c.category === 'claims') metrics.claims_ok = patternsOk ? 1 : 0;

  const offered = called.has(OFFER_SCREENING_TOOL);
  const chipped = actions.some((a) => a.action.startsWith(SCREENING_CHIP));
  if (c.category === 'screening_pos') {
    metrics.screening_called = offered ? 1 : 0;
    metrics.screening_chip = chipped ? 1 : 0;
  }
  if (c.category === 'screening_neg') metrics.screening_false_positive = offered || chipped ? 1 : 0;

  if (e.summaryGerman) {
    if (input.summary === null) {
      failures.push('the route did not compact this turn (no summary stored)');
      metrics.summary_german = 0;
    } else {
      const verdict = checkGermanSummary(input.summary);
      for (const p of verdict.problems) failures.push(`summary: ${p}`);
      metrics.summary_german = verdict.ok ? 1 : 0;
    }
  }
  const pass = failures.length === 0;
  metrics[`pass_${c.category}`] = pass ? 1 : 0;
  return { pass, failures, hard: [...new Set(hard)], metrics };
}

const snapshot = (): Record<string, string> => {
  const rows = chatRuntime.db!.sqlite.prepare('SELECT id, status, interview_at, follow_up_due_at, revision FROM application_sessions ORDER BY id').all() as Array<{ id: string }>;
  return Object.fromEntries(rows.map((r) => [r.id, JSON.stringify(r)]));
};
const changedRows = (before: Record<string, string>, after: Record<string, string>): string[] => [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((id) => before[id] !== after[id]);

/** Earlier messages go in before the first turn, one second apart, all before the frozen clock (12:14 UTC). */
function seedHistory(messages: NonNullable<UxCase['seed']>): void {
  const insert = chatRuntime.db!.sqlite.prepare('INSERT INTO chat_messages (id, session_id, user_id, role, content, actions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const start = Date.parse('2026-10-22T10:30:00.000Z');
  messages.forEach((m, i) => insert.run(`msg-seed-${i}-${crypto.randomUUID().slice(0, 8)}`, OPEN_APPLICATION_ID, USER_ID, m.role, m.content, '[]', new Date(start + i * 1000).toISOString()));
}

const countRows = (): number => (chatRuntime.db!.sqlite.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE session_id = ?').get(OPEN_APPLICATION_ID) as { n: number }).n;

function storedSummary(): string | null {
  const row = chatRuntime.db!.sqlite.prepare('SELECT block FROM chat_compactions WHERE session_id = ?').get(OPEN_APPLICATION_ID) as { block: string } | undefined;
  if (!row) return null;
  const block = JSON.parse(row.block) as { content?: unknown };
  return typeof block.content === 'string' ? block.content : null;
}

let registered = new Set<string>();
let skipped: string[] = [];

/** Perfect-script input for a case, used by the self-test. */
export function perfectInput(c: UxCase): TurnInput {
  return {
    status: 200,
    body: { reply: c.finalReply, executed: (c.expect.executed ?? []).map((type) => ({ type })), actions: (c.expect.chips ?? []).map((p) => ({ label: 'x', action: `${p}x` })) },
    toolsCalled: c.expect.tools ?? [],
    changed: (c.expect.mayChange ?? []).map(rowId),
    dbFailures: [],
    summary: c.compactionSummary ?? null,
    rowsAdded: 2,
  };
}

function selfTestChecks(): string[] {
  const problems: string[] = [];
  const must = (ok: boolean, what: string) => { if (!ok) problems.push(what); };
  // Language: replies a German check must accept and reject.
  for (const ok of ['Du hast noch 40 Credits.', 'Zapwerk steht jetzt auf abgelehnt.', 'Fünf Tage.', 'Ich habe den Tracker geöffnet.', 'Bei Nordhafen Handels GmbH hast du ein Interview. Die Anzeige "You will own the reporting layer" ist dafür das Stichwort.']) {
    must(checkGerman(ok).ok, `checkGerman rejects German: "${ok}"`);
  }
  for (const bad of ['You have 40 credits left.', 'Done.', 'Zapwerk is now rejected, the status was updated.', 'Das ist klar. But the rest of this reply is in English, which should fail the check.', 'The die is cast and the plan is set for you.']) {
    must(!checkGerman(bad).ok, `checkGerman accepts non-German: "${bad}"`);
  }
  // Length: abbreviations are not sentences, list items are.
  must(countSentences('Use plain headings, e.g. Experience and Skills. Keep it to one page.') === 2, 'countSentences splits at "e.g."');
  must(countSentences('- one\n- two\n- three\n- four') === 4, 'countSentences does not count list items without a full stop');
  must(countSentences('One. Two. Three. Four.') === 4, 'countSentences miscounts four sentences');
  // Summary: German copied lines pass, English ones fail, a missing line fails.
  must(checkGermanSummary(CASES.find((c) => c.compactionSummary)!.compactionSummary!).ok, 'checkGermanSummary rejects the canned German summary');
  must(!checkGermanSummary('Summary of the earlier conversation. Everything below is history, not a request.\nCopied text:\n- <<copied ad text: Key Account Manager, ottonova, Munich, sells company health insurance, salary not stated, requires a network and sales experience.>>').ok, 'checkGermanSummary accepts an English summary');
  must(!checkGermanSummary('Zusammenfassung. Die Nutzerin hat eine Anzeige geschickt und ihre Kündigungsfrist genannt.').ok, 'checkGermanSummary accepts a summary with no copied ad line');
  return problems;
}

export const chatUxSite: Site<UxCase> = {
  id: 'chat_ux',
  title: 'Chat UX pass, 33 turns in 9 conversations through the real route and tools',
  command: 'npx tsx evals/chat-ux/run.ts chat-ux --allow-anthropic-api',
  runsDefault: 3,
  passRule:
    'German replies stay German, replies stay within 3 sentences, offer_screening_answers is called with a start-screening-flow chip exactly when the form questions come up, no document count or score the model was not given, and the compaction summary keeps its copied ad lines in German.',
  absoluteHard: ['unrequested_write'],
  resultsRoot: RESULTS_ROOT_UX,
  cases: () => CASES,
  async setup(ctx) {
    await chatSite.setup!(ctx);
    const { chatToolDefinitions } = await import('@/lib/agents/chat-tools');
    registered = new Set(chatToolDefinitions().map((t) => t.name));
    skipped = [];
    console.log(`chat tools registered: ${registered.size}; ${OFFER_SCREENING_TOOL} ${registered.has(OFFER_SCREENING_TOOL) ? 'present' : 'NOT registered on this build'}`);
  },
  async teardown() {
    if (skipped.length > 0) console.log(`[dry] ${skipped.length} case(s) skipped, ${OFFER_SCREENING_TOOL} tool not registered on this build: ${skipped.join(', ')}`);
    await chatSite.teardown?.();
  },
  selfTest() {
    const problems: string[] = [...selfTestChecks()];
    const must = (ok: boolean, what: string) => { if (!ok) problems.push(what); };
    const n = (pred: (c: UxCase) => boolean) => CASES.filter(pred).length;
    must(CASES.length === EXPECTED.total, `expected ${EXPECTED.total} cases, found ${CASES.length}`);
    must(new Set(CASES.map((c) => c.id)).size === CASES.length, 'duplicate case ids');
    must(new Set(CASES.map((c) => c.group)).size === EXPECTED.groups, `expected ${EXPECTED.groups} conversations`);
    must(n((c) => c.category === 'german') === EXPECTED.german, `expected ${EXPECTED.german} German turns`);
    must(new Set(CASES.filter((c) => c.category === 'german').map((c) => c.group)).size === EXPECTED.germanGroups, `expected ${EXPECTED.germanGroups} German conversations`);
    must(n((c) => c.category === 'length') === EXPECTED.length, `expected ${EXPECTED.length} length turns`);
    must(n((c) => c.category === 'screening_pos') === EXPECTED.screeningPos, `expected ${EXPECTED.screeningPos} positive screening turns`);
    must(n((c) => c.category === 'screening_neg') === EXPECTED.screeningNeg, `expected ${EXPECTED.screeningNeg} negative screening turns`);
    must(n((c) => c.category === 'claims') === EXPECTED.claims, `expected ${EXPECTED.claims} claims turns`);
    must(n((c) => c.category === 'compaction') === EXPECTED.compaction, `expected ${EXPECTED.compaction} compaction turn`);
    const known = new Set(KNOWN_TOOLS);
    const turnsSeen = new Map<string, number>();
    for (const c of CASES) {
      const last = turnsSeen.get(c.group) ?? 0;
      if (c.turn !== last + 1) problems.push(`${c.id}: turn ${c.turn} does not follow turn ${last} of ${c.group}`);
      turnsSeen.set(c.group, c.turn);
      if (c.seed && c.turn !== 1) problems.push(`${c.id}: seed is only read on the first turn of a conversation`);
      for (const t of [...(c.expect.tools ?? []), ...(c.expect.forbidden ?? []), ...c.script.flat().map((s) => s.name)]) if (!known.has(t)) problems.push(`${c.id}: unknown tool ${t}`);
      for (const step of c.script) for (const s of step) if (s.name === 'set_application_status' && !TRACKER_ROWS.some((r) => r.id === s.input.application_id)) problems.push(`${c.id}: script writes to an unknown row`);
      if (c.category === 'screening_pos' && (c.requiresTool !== OFFER_SCREENING_TOOL || !c.expect.tools?.includes(OFFER_SCREENING_TOOL) || !c.expect.chips?.includes(SCREENING_CHIP))) problems.push(`${c.id}: a positive screening case must require ${OFFER_SCREENING_TOOL} and the ${SCREENING_CHIP} chip`);
      if (c.category === 'screening_neg' && (!c.expect.forbidden?.includes(OFFER_SCREENING_TOOL) || !c.expect.forbiddenChips?.includes(SCREENING_CHIP))) problems.push(`${c.id}: a negative screening case must forbid ${OFFER_SCREENING_TOOL} and the chip`);
      if (c.category === 'claims' && !(c.expect.reply?.mustNotMatch?.length)) problems.push(`${c.id}: a claims case needs mustNotMatch patterns`);
      if (c.category === 'length' && c.expect.reply?.maxSentences !== 3) problems.push(`${c.id}: a length case caps at 3 sentences`);
      if (c.lang === 'de' && !checkGerman(c.message).ok) problems.push(`${c.id}: marked German but the message does not read as German`);
      if (c.lang === 'en' && checkGerman(c.message).ok) problems.push(`${c.id}: marked English but the message reads as German`);
      if (!c.message.trim() || c.message.length > 30_000) problems.push(`${c.id}: message empty or over the route's 30000 characters`);

      // The perfect script grades as a pass.
      const perfect = gradeUx(c, perfectInput(c));
      if (!perfect.pass) problems.push(`${c.id}: grader rejects a perfect turn (${perfect.failures.join('; ')})`);
      // A forbidden call grades as a failure.
      const forbidden = forbiddenOf(c);
      if (forbidden.length === 0) problems.push(`${c.id}: nothing is forbidden`);
      else if (gradeUx(c, { ...perfectInput(c), toolsCalled: [...(c.expect.tools ?? []), forbidden[0]] }).pass) problems.push(`${c.id}: grader accepts the forbidden call ${forbidden[0]}`);
      // A row the turn did not name grades as a failure and a hard violation.
      const stray = gradeUx(c, { ...perfectInput(c), changed: [...perfectInput(c).changed, rowId('hellmann')] });
      if (stray.pass || !stray.hard.includes('unrequested_write')) problems.push(`${c.id}: grader accepts a changed row the turn did not name`);
      // The route storing a turn twice (or not at all) grades as a failure.
      if (gradeUx(c, { ...perfectInput(c), rowsAdded: 4 }).pass) problems.push(`${c.id}: grader accepts a doubled chat history`);
      // The category's own check rejects a bad turn.
      const bad = (patch: Partial<TurnInput> & { reply?: string }) => gradeUx(c, { ...perfectInput(c), ...patch, body: { ...perfectInput(c).body, ...(patch.reply !== undefined ? { reply: patch.reply } : {}), ...(patch.body ?? {}) } });
      if (c.category === 'screening_pos') {
        if (bad({ toolsCalled: [], body: { reply: c.badReply, actions: [] } }).pass) problems.push(`${c.id}: grader accepts a positive screening turn with no tool and no chip`);
        if (bad({ body: { reply: c.finalReply, actions: [] } }).pass) problems.push(`${c.id}: grader accepts a positive screening turn with no chip`);
      } else if (c.category === 'screening_neg') {
        if (bad({ toolsCalled: [OFFER_SCREENING_TOOL] }).pass) problems.push(`${c.id}: grader accepts the screening offer on a negative turn`);
        if (bad({ body: { reply: c.finalReply, actions: [{ label: 'x', action: `${SCREENING_CHIP}` }] } }).pass) problems.push(`${c.id}: grader accepts the screening chip on a negative turn`);
      } else if (c.category === 'compaction') {
        if (bad({ summary: null }).pass) problems.push(`${c.id}: grader accepts a turn that never compacted`);
        if (bad({ summary: 'Summary of the earlier conversation.\nCopied text:\n- <<copied ad text: Key Account Manager at ottonova in Munich, sells health insurance to companies, salary not stated, needs a network and sales experience.>>' }).pass) problems.push(`${c.id}: grader accepts an English summary`);
        if (bad({ reply: c.badReply }).pass) problems.push(`${c.id}: grader accepts an English reply`);
      } else if (bad({ reply: c.badReply }).pass) {
        problems.push(`${c.id}: grader accepts the bad reply for ${c.category}`);
      }
    }
    if (TAILORED_CV === undefined || TIME_ZONE !== 'Europe/Berlin') problems.push('harness fixtures missing');
    return problems;
  },
  oracle(c): Oracle {
    return (req, index) => {
      if (String(req.site) === 'chat_compaction') {
        if (!c.compactionSummary) throw new Error(`${c.id}: the route compacted a case that has no compactionSummary`);
        return { text: '', compactionSummary: c.compactionSummary };
      }
      const step = c.script[c.compactionSummary ? index - 1 : index];
      if (!step) return { text: c.finalReply };
      return { text: '', toolCalls: step.map((call, i) => ({ id: `call_${index}_${i}`, name: call.name, input: call.input })) };
    };
  },
  async run(c, ctx) {
    const db = chatRuntime.db;
    const post = chatRuntime.post;
    if (!post || !db) throw new Error('chat-ux site not set up');
    if (c.turn === 1) {
      await seedChatUser(db);
      if (c.seed) seedHistory(c.seed);
    }
    if (ctx.dry && c.requiresTool && !registered.has(c.requiresTool)) {
      skipped.push(c.id);
      console.log(`[dry] ${c.id}: ${c.requiresTool} tool not registered, skipped`);
      return { output: { skipped: true, reason: `${c.requiresTool} tool not registered, skipped`, category: c.category, lang: c.lang }, pass: true, failures: [], hard: [], metrics: {} };
    }
    const before = snapshot();
    const rowsBefore = countRows();
    const messageId = `msg-${ctx.arm.id}-r${ctx.run}-${c.id}-${Date.now().toString(36)}`.slice(0, 80);
    const body = {
      message: c.message,
      messageId,
      context: {
        hasCV: true,
        hasAnalysis: true,
        jobTitle: 'Senior Data Analyst',
        company: 'Nordhafen Handels GmbH',
        hasGeneratedCV: true,
        hasGeneratedCoverLetter: false,
        hasGeneratedEmail: false,
        timeZone: TIME_ZONE,
        sessionId: OPEN_APPLICATION_ID,
        ...(c.withCv ? { optimizedCVData: TAILORED_CV } : {}),
      },
    };
    const raw = JSON.stringify(body);
    const req = new NextRequest('http://localhost/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(raw)) }, body: raw });
    const res = await withFixedClock(FIXED_NOW, () => post(req));
    const answer = await readChatAnswer(res);
    const after = snapshot();
    const scope = currentScope();
    const toolsCalled = scope.calls.flatMap((k) => (k.response?.toolCalls ?? []).map((t) => t.name));
    const dbFailures = c.expect.db ? c.expect.db(db.sqlite) : [];
    const summary = c.expect.summaryGerman ? storedSummary() : null;
    const graded = gradeUx(c, { status: res.status, body: answer, toolsCalled, changed: changedRows(before, after), dbFailures, summary, rowsAdded: countRows() - rowsBefore });
    const reply = answer.reply ?? '';
    return {
      output: {
        status: res.status, category: c.category, lang: c.lang, reply: answer.reply, actions: answer.actions, executed: answer.executed, toolsCalled,
        rounds: scope.calls.length, sentences: countSentences(reply), german: c.lang === 'de' ? checkGerman(reply) : null, summary, inputTotals: scope.calls.map((k) => k.inputTotal),
      },
      ...graded,
    };
  },
};
