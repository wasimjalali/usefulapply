/**
 * Site: tracker chat (src/app/api/tracker/chat/route.ts, the shipped POST handler, in process).
 *
 *   npx tsx evals/haiku-55-swap/run.ts tracker --allow-anthropic-api --gptoss-url http://localhost:8799 [--runs 3]
 *   npx tsx evals/haiku-55-swap/run.ts tracker --dry
 *
 * 50 messages over one fixed 25-row tracker, a fixed clock (Thursday 2026-10-22 12:14 UTC) and a user in
 * Berlin, Los Angeles or Tokyo. The route itself runs: only its inputs are fixed (auth, the tracker rows
 * and the rate limiter are stubbed; the model call, the row-ownership guard, the date resolution and the
 * reply handling are the shipped code). Three runs.
 *
 * Primary metric: the route's final answer matches exactly: action type, application, status and the
 * instant the date resolves to (wallClockToIso in the user's zone), reply of at most two sentences and
 * no dash. Hard constraints: a status write the user did not ask for (a write on a question, a thanks or an
 * ambiguous name), and a status write on the wrong application.
 * Sequence: one user, all 50 messages in order; the tracker prompt prefix is the same for every message.
 */
import { NextRequest } from 'next/server';
import { registerStub } from '../../lib/hooks';
import { wallClockToIso } from '@/lib/agents/chat-tools/untrusted';
import { DASH_RE, sentenceCount, withFixedClock } from '../lib/util';
import { EXPECTED_TRACKER_CASES, FIXED_NOW, TRACKER_CASES, TRACKER_ROWS, rowId, type TrackerCase } from '../fixtures/tracker';
import type { Site } from '../lib/runner';

const TEST_USER = { id: 'eval-user', email: 'eval@example.com' };

let routePost: ((req: NextRequest) => Promise<Response>) | null = null;

async function loadRoute(): Promise<(req: NextRequest) => Promise<Response>> {
  if (routePost) return routePost;
  const strict = <T extends Record<string, unknown>>(name: string, exports: T): T =>
    new Proxy(exports, {
      get(target, key) {
        if (key in target) return target[key as string];
        if (key === '__esModule') return true;
        if (typeof key === 'symbol') return undefined;
        throw new Error(`tracker eval: the route used ${name}.${String(key)}, which the harness does not provide`);
      },
    });
  registerStub('@/auth/server', strict('@/auth/server', { getCurrentUser: async () => TEST_USER }));
  registerStub('@/db/repos/sessions', strict('@/db/repos/sessions', { listTrackerOverview: async () => TRACKER_ROWS.map((r) => ({ id: r.id, company: r.company, job_title: r.job_title, match_score: r.match_score, status: r.status, interview_at: r.interview_at, follow_up_due_at: r.follow_up_due_at, revision: r.revision, created_at: r.created_at })) }));
  registerStub('@/lib/middleware/rateLimiter', strict('@/lib/middleware/rateLimiter', {
    checkRateLimit: async () => ({ allowed: true }),
    RATE_LIMITS: { chat: { limit: 1000, windowMs: 60_000 } },
  }));
  const mod = await import('@/app/api/tracker/chat/route');
  routePost = mod.POST as (req: NextRequest) => Promise<Response>;
  return routePost;
}

interface RouteBody {
  reply?: string;
  error?: string;
  action?: { type?: string; sessionId?: string; status?: string; dateTime?: string | null; company?: string };
}

const localDate = (iso: string, zone: string): string => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

export function gradeTracker(c: TrackerCase, res: { status: number; body: RouteBody }): { pass: boolean; failures: string[]; hard: string[] } {
  const failures: string[] = [];
  const hard: string[] = [];
  const e = c.expect;
  if (res.status !== 200) return { pass: false, failures: [`HTTP ${res.status}`], hard };
  const a = res.body.action ?? { type: 'missing' };
  if (a.type === 'status' && e.type !== 'status') hard.push('unrequested_write');
  if (a.type !== e.type) failures.push(`action ${a.type}, expected ${e.type}`);
  else if (e.row && a.sessionId !== rowId(e.row)) {
    failures.push(`application ${a.sessionId}, expected ${e.row}`);
    if (a.type === 'status') hard.push('wrong_row_write');
  } else if (e.type === 'status') {
    if (a.status !== e.status) failures.push(`status ${a.status}, expected ${e.status}`);
    if (e.wall === null) {
      if (a.dateTime !== null && a.dateTime !== undefined) failures.push(`dateTime ${a.dateTime}, expected null`);
    } else if (e.wall) {
      if (!a.dateTime) failures.push('dateTime missing');
      else if (e.dateOnly) {
        if (localDate(a.dateTime, c.timeZone) !== e.wall) failures.push(`date ${localDate(a.dateTime, c.timeZone)}, expected ${e.wall}`);
      } else {
        const want = wallClockToIso(e.wall, c.timeZone);
        if (a.dateTime !== want) failures.push(`dateTime ${a.dateTime}, expected ${want} (${e.wall} ${c.timeZone})`);
      }
    }
  }
  const reply = res.body.reply ?? '';
  if (!reply.trim()) failures.push('empty reply');
  if (sentenceCount(reply) > 2) failures.push(`reply has ${sentenceCount(reply)} sentences`);
  if (DASH_RE.test(reply)) failures.push('reply carries a dash');
  return { pass: failures.length === 0, failures, hard };
}

/** What a perfect route returns for a case, used by the self-test and the dry oracle. */
function perfectBody(c: TrackerCase): { status: number; body: RouteBody } {
  const e = c.expect;
  const row = e.row ? TRACKER_ROWS.find((r) => r.key === e.row) : undefined;
  const wall = e.wall ? (e.dateOnly ? `${e.wall}T09:00` : e.wall) : null;
  return {
    status: 200,
    body: {
      reply: 'Done.',
      action: e.type === 'none' || e.type === 'hide_rejected' || e.type === 'show_rejected' ? { type: e.type } : { type: e.type, sessionId: row?.id, company: row?.company, ...(e.type === 'status' ? { status: e.status, dateTime: wall ? wallClockToIso(wall, c.timeZone) : null } : {}) },
    },
  };
}

const INTENT: Record<TrackerCase['expect']['type'], string> = { status: 'status_change', follow_up: 'follow_up', prep: 'prep', hide_rejected: 'hide_rejected', show_rejected: 'show_rejected', none: 'answer' };

export const trackerSite: Site<TrackerCase> = {
  id: 'tracker',
  title: 'Tracker chat, 50 messages over a fixed 25-row tracker',
  command: 'npx tsx evals/haiku-55-swap/run.ts tracker --allow-anthropic-api --gptoss-url <url>',
  runsDefault: 3,
  passRule:
    "The route's action type, application, status and resolved instant match; the reply is at most two sentences with no dash.",
  absoluteHard: [],
  cases: () => TRACKER_CASES,
  selfTest() {
    const problems: string[] = [];
    if (TRACKER_CASES.length !== EXPECTED_TRACKER_CASES) problems.push(`expected ${EXPECTED_TRACKER_CASES} cases, found ${TRACKER_CASES.length}`);
    if (TRACKER_ROWS.length !== 25) problems.push(`expected 25 rows, found ${TRACKER_ROWS.length}`);
    if (new Set(TRACKER_CASES.map((c) => c.id)).size !== TRACKER_CASES.length) problems.push('duplicate case ids');
    for (const c of TRACKER_CASES) {
      if (c.expect.row && !TRACKER_ROWS.some((r) => r.key === c.expect.row)) problems.push(`${c.id}: unknown row ${c.expect.row}`);
      if (c.expect.wall && !wallClockToIso(c.expect.dateOnly ? `${c.expect.wall}T09:00` : c.expect.wall, c.timeZone)) problems.push(`${c.id}: wall clock does not parse`);
      if (c.message.length > 500) problems.push(`${c.id}: message over the route's 500 character limit`);
      const perfect = gradeTracker(c, perfectBody(c));
      if (!perfect.pass) problems.push(`${c.id}: grader rejects a perfect answer (${perfect.failures.join('; ')})`);
      const bad = perfectBody(c);
      bad.body.action = c.expect.type === 'none' ? { type: 'status', sessionId: rowId('zapwerk'), status: 'rejected', dateTime: null } : { type: 'none' };
      if (gradeTracker(c, bad).pass) problems.push(`${c.id}: grader accepts a wrong answer`);
    }
    return problems;
  },
  oracle: (c) => () => {
    const e = c.expect;
    const wall = e.wall ? (e.dateOnly ? `${e.wall}T09:00` : e.wall) : null;
    return { text: JSON.stringify({ intent: INTENT[e.type], sessionId: e.row ? rowId(e.row) : null, status: e.status ?? null, dateTime: wall, reply: 'Done.' }) };
  },
  async run(c) {
    const post = await loadRoute();
    const req = new NextRequest('http://localhost/api/tracker/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: c.message, timeZone: c.timeZone }),
    });
    const res = await withFixedClock(FIXED_NOW, () => post(req));
    const body = (await res.json()) as RouteBody;
    const graded = gradeTracker(c, { status: res.status, body });
    return { output: { status: res.status, body, category: c.category }, metrics: {}, ...graded };
  },
};
