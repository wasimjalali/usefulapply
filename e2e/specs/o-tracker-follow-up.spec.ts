import { expect, test, type APIRequestContext } from '@playwright/test';
import { storedApplication } from '../lib/app';
import { BASE_URL } from '../lib/env';
import { fakeCalls, fakeControl, fakeReset } from '../lib/fake-control';
import { JOB_DESCRIPTION } from '../lib/model-script';
import { runTool } from '../lib/run-tool';
import { openLocalD1 } from '../lib/sqlite';
import { createSignedInApiUser, creditsOf, setBalance, type TestUser } from '../lib/user';

/**
 * The tracker's follow-up route (/api/tracker/follow-up) through the real preview, as a signed-in API client.
 * It writes the letter through the shared regenerate service and keeps its own reservation handling: a key scoped
 * to the application and request, a 409 for a key already in flight or spent, a release on any failure before the
 * save, and one capture after it. Every case reads the balance and the reservation rows straight from local D1.
 * o1 to o6 pass on main's route too (before the shared service); o7 is the one refusal the shared service adds.
 */

interface Reservation { idempotency_key: string; status: string; amount: number; action: string }

function reservationsOf(userId: string): Reservation[] {
  const db = openLocalD1();
  try {
    return db.prepare('SELECT idempotency_key, status, amount, action FROM credit_reservations WHERE user_id = ? ORDER BY created_at')
      .all(userId) as Reservation[];
  } finally {
    db.close();
  }
}

async function newApplication(userId: string): Promise<string> {
  const created = await runTool<{ id: string }>('e2e/tools/ops.ts', [
    'create-application',
    JSON.stringify({ userId, jobDescription: JOB_DESCRIPTION }),
  ]);
  return created.id;
}

const requestId = () => `req-${Math.random().toString(36).slice(2)}-${Date.now()}`;

function followUp(request: APIRequestContext, user: TestUser, sessionId: string, id: string) {
  return request.post(`${BASE_URL}/api/tracker/follow-up`, {
    data: { sessionId },
    headers: { 'x-request-id': id, 'cf-connecting-ip': user.ip, 'x-forwarded-for': user.ip },
    timeout: 120_000,
  });
}

const followUpCalls = async () => (await fakeCalls()).filter((call) => call.writer === 'followUpEmail');

test.beforeEach(async () => {
  await fakeControl({ failWriter: null, delayMs: 0 });
  await fakeReset();
});

test('(o1) a follow-up costs 0.5, is written from the stored CV and job ad, and its reservation is captured', async ({ request }) => {
  const user = await createSignedInApiUser(request, 'fu1');
  const sessionId = await newApplication(user.id);
  const start = creditsOf(user.id).total;
  const id = requestId();

  const response = await followUp(request, user, sessionId, id);
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.creditsDeducted).toBe(0.5);
  expect(body.followUpEmail.subject).toContain('Following Up');
  expect(typeof body.revision).toBe('number');
  expect(creditsOf(user.id).total).toBe(start - 0.5);

  const key = `follow_up_regen:${user.id}:${sessionId}:${id}`;
  expect(reservationsOf(user.id)).toEqual([{ idempotency_key: key, status: 'captured', amount: 0.5, action: 'follow_up_regen' }]);
  const stored = storedApplication(user.id, sessionId)?.follow_up_email as Record<string, unknown> | null;
  expect(stored?.subject).toBe(body.followUpEmail.subject);
  expect(stored?.reservationKey).toBe(key);

  const calls = await followUpCalls();
  expect(calls).toHaveLength(1);
  expect(calls[0].user).toContain('Calder Industrial Components');
});

test('(o2) the same request id after it finished is REQUEST_ALREADY_COMPLETED: no charge, no model call', async ({ request }) => {
  const user = await createSignedInApiUser(request, 'fu2');
  const sessionId = await newApplication(user.id);
  const id = requestId();
  expect((await followUp(request, user, sessionId, id)).status()).toBe(200);
  const afterFirst = creditsOf(user.id).total;

  const again = await followUp(request, user, sessionId, id);
  expect(again.status()).toBe(409);
  expect((await again.json()).code).toBe('REQUEST_ALREADY_COMPLETED');
  expect(creditsOf(user.id).total).toBe(afterFirst);
  expect(reservationsOf(user.id)).toHaveLength(1);
  expect(await followUpCalls()).toHaveLength(1);

  // A new request id is a new, paid follow-up.
  const fresh = await followUp(request, user, sessionId, requestId());
  expect(fresh.status()).toBe(200);
  expect(creditsOf(user.id).total).toBe(afterFirst - 0.5);
  expect(reservationsOf(user.id).map((row) => row.status)).toEqual(['captured', 'captured']);
});

test('(o3) the same request id sent twice at once is charged once; the second gets REQUEST_IN_PROGRESS', async ({ request }) => {
  const user = await createSignedInApiUser(request, 'fu3');
  const sessionId = await newApplication(user.id);
  const start = creditsOf(user.id).total;
  await fakeControl({ failWriter: null, delayMs: 3000 });
  const id = requestId();

  const [a, b] = await Promise.all([followUp(request, user, sessionId, id), followUp(request, user, sessionId, id)]);
  const statuses = [a.status(), b.status()].sort();
  expect(statuses).toEqual([200, 409]);
  const conflict = await (a.status() === 409 ? a : b).json();
  expect(conflict.code).toBe('REQUEST_IN_PROGRESS');
  expect(creditsOf(user.id).total).toBe(start - 0.5);
  expect(reservationsOf(user.id).map((row) => row.status)).toEqual(['captured']);
});

test('(o4) a writer failure refunds the reservation and stores no letter', async ({ request }) => {
  const user = await createSignedInApiUser(request, 'fu4');
  const sessionId = await newApplication(user.id);
  const start = creditsOf(user.id).total;
  await fakeControl({ failWriter: 'followUpEmail' });

  const response = await followUp(request, user, sessionId, requestId());
  expect(response.status()).toBe(500);
  expect((await response.json()).error).toBe('Failed to write the follow-up.');
  expect(creditsOf(user.id).total).toBe(start);
  expect(reservationsOf(user.id).map((row) => row.status)).toEqual(['released']);
  expect(storedApplication(user.id, sessionId)?.follow_up_email ?? null).toBeNull();
});

test('(o5) too few credits is a 402 with the numbers, and nothing is reserved', async ({ request }) => {
  const user = await createSignedInApiUser(request, 'fu5');
  const sessionId = await newApplication(user.id);
  setBalance(user.id, { monthly: 0.25 });

  const response = await followUp(request, user, sessionId, requestId());
  expect(response.status()).toBe(402);
  const body = await response.json();
  expect(body.code).toBe('INSUFFICIENT_CREDITS');
  expect(body.details).toMatchObject({ required: 0.5, available: 0.25 });
  expect(creditsOf(user.id).total).toBe(0.25);
  expect(reservationsOf(user.id)).toHaveLength(0);
  expect(await followUpCalls()).toHaveLength(0);
});

test('(o6) no CV or no job ad is NO_CONTEXT before anything is reserved', async ({ request }) => {
  const user = await createSignedInApiUser(request, 'fu6');
  const sessionId = await newApplication(user.id);
  const start = creditsOf(user.id).total;

  const db = openLocalD1();
  try {
    db.prepare("UPDATE application_sessions SET job_description = '' WHERE id = ?").run(sessionId);
  } finally {
    db.close();
  }
  const noAd = await followUp(request, user, sessionId, requestId());
  expect(noAd.status()).toBe(400);
  expect((await noAd.json()).code).toBe('NO_CONTEXT');

  const db2 = openLocalD1();
  try {
    db2.prepare('UPDATE application_sessions SET job_description = ? WHERE id = ?').run(JOB_DESCRIPTION, sessionId);
    db2.prepare("DELETE FROM documents WHERE user_id = ? AND type = 'primary_cv'").run(user.id);
  } finally {
    db2.close();
  }
  const noCv = await followUp(request, user, sessionId, requestId());
  expect(noCv.status()).toBe(400);
  expect((await noCv.json()).code).toBe('NO_CONTEXT');

  const missing = await followUp(request, user, 'no-such-application', requestId());
  expect(missing.status()).toBe(404);

  expect(creditsOf(user.id).total).toBe(start);
  expect(reservationsOf(user.id)).toHaveLength(0);
  expect(await followUpCalls()).toHaveLength(0);
});

test('(o7) a CV with no applicant name is NO_CONTEXT before anything is reserved', async ({ request }) => {
  const user = await createSignedInApiUser(request, 'fu7');
  const sessionId = await newApplication(user.id);
  const start = creditsOf(user.id).total;
  const db = openLocalD1();
  try {
    db.prepare("UPDATE documents SET structured_data = '{}' WHERE user_id = ? AND type = 'primary_cv'").run(user.id);
  } finally {
    db.close();
  }

  const response = await followUp(request, user, sessionId, requestId());
  expect(response.status()).toBe(400);
  expect((await response.json()).code).toBe('NO_CONTEXT');
  expect(creditsOf(user.id).total).toBe(start);
  expect(reservationsOf(user.id)).toHaveLength(0);
  expect(await followUpCalls()).toHaveLength(0);
});
