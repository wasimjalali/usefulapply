import { expect, test } from '@playwright/test';
import { storedApplication } from '../lib/app';
import { fakeCalls, fakeControl, fakeReset } from '../lib/fake-control';
import { JOB_DESCRIPTION } from '../lib/model-script';
import { runTool } from '../lib/run-tool';
import { callAgent, createSignedInApiUser, creditsOf, setBalance, type AgentEvent } from '../lib/user';

/**
 * Credit pricing through the real /api/agent-v2 route, after the pricing and
 * reservation logic moved into the shared kit-generation core. No browser: the
 * route is called as a signed-in API client and its event stream is read.
 */

async function newApplication(userId: string): Promise<string> {
  const created = await runTool<{ id: string }>('e2e/tools/ops.ts', [
    'create-application',
    JSON.stringify({ userId, jobDescription: JOB_DESCRIPTION }),
  ]);
  return created.id;
}

const event = (events: AgentEvent[], type: string) => events.find((candidate) => candidate.type === type);
const requestId = () => `req-${Math.random().toString(36).slice(2)}-${Date.now()}`;

test.beforeEach(async () => {
  await fakeControl({ failWriter: null, delayMs: 0 });
  await fakeReset();
});

test('(g1) a fit check then the kit costs exactly 2.0 (0.5 + 1.5), and the model reads the CV stored in D1', async ({ request }) => {
  const user = await createSignedInApiUser(request, 'price1');
  const start = creditsOf(user.id).total;
  const sessionId = await newApplication(user.id);

  // The body carries a forged CV; the server must read the stored one.
  const fit = await callAgent(request, {
    action: 'fit_analysis', jobDescription: JOB_DESCRIPTION, currentCV: 'FORGED CV TEXT SENT BY THE CLIENT', sessionId,
  }, requestId());
  expect(event(fit, 'credits_deducted')?.creditsUsed).toBe(0.5);
  const contextId = String(event(fit, 'fit_analysis_complete')?.contextId);
  expect(contextId).toMatch(/^ctx-/);
  expect(creditsOf(user.id).total).toBe(start - 0.5);

  const applicantPrompt = (await fakeCalls()).find((call) => call.writer === 'applicant')?.user ?? '';
  expect(applicantPrompt).toContain('Calder Industrial Components');
  expect(applicantPrompt).not.toContain('FORGED CV TEXT');

  const kit = await callAgent(request, { action: 'generate_with_context', contextId, jobDescription: JOB_DESCRIPTION, sessionId }, requestId());
  expect(event(kit, 'credits_deducted')?.creditsUsed).toBe(1.5);
  expect(event(kit, 'workflow_complete')).toBeTruthy();
  expect(creditsOf(user.id).total).toBe(start - 2.0);

  // The route wrote the kit itself.
  const stored = storedApplication(user.id, sessionId);
  expect(stored?.generation_status).toBe('succeeded');
  expect(stored?.generated_cv?._optimizedCVData).toBeTruthy();
  expect(stored?.cover_letter?.body).toContain('Calder Industrial Components');
});

test('(g2) a kit with a failed CV is charged 2.0 and refunded exactly 0.5', async ({ request }) => {
  const user = await createSignedInApiUser(request, 'price2');
  const start = creditsOf(user.id).total;
  const sessionId = await newApplication(user.id);
  await fakeControl({ failWriter: 'cv' });
  const kit = await callAgent(request, { action: 'full_optimization', jobDescription: JOB_DESCRIPTION, sessionId }, requestId());
  const done = event(kit, 'workflow_complete');
  expect(done?.creditsRefunded).toBe(0.5);
  expect(creditsOf(user.id).total).toBe(start - 1.5);
  const stored = storedApplication(user.id, sessionId);
  expect(stored?.generated_cv).toBeNull();
  expect(stored?.cover_letter?.body).toBeTruthy();
});

test('(g3) full_optimization costs 2.0', async ({ request }) => {
  const user = await createSignedInApiUser(request, 'price3');
  const start = creditsOf(user.id).total;
  const sessionId = await newApplication(user.id);
  const kit = await callAgent(request, { action: 'full_optimization', jobDescription: JOB_DESCRIPTION, sessionId }, requestId());
  expect(event(kit, 'credits_deducted')?.creditsUsed).toBe(2);
  expect(event(kit, 'workflow_complete')).toBeTruthy();
  expect(creditsOf(user.id).total).toBe(start - 2.0);
});

test('(g4) a context-cache miss reruns from the stored CV: 1.5 after a paid fit, 2.0 without one', async ({ request }) => {
  const user = await createSignedInApiUser(request, 'price4');
  const start = creditsOf(user.id).total;
  const sessionId = await newApplication(user.id);
  // A captured fit for a context whose cached copy is gone (never cached in this Worker): what an expired cache looks like.
  await runTool('e2e/tools/ops.ts', ['seed-fit-capture', JSON.stringify({ userId: user.id, contextId: 'ctx-expired' })]);
  const afterFit = creditsOf(user.id).total;
  expect(afterFit).toBe(start - 0.5);

  const paid = await callAgent(request, { action: 'generate_with_context', contextId: 'ctx-expired', jobDescription: JOB_DESCRIPTION, sessionId }, requestId());
  expect(event(paid, 'credits_deducted')?.creditsUsed).toBe(1.5);
  expect(event(paid, 'workflow_complete')).toBeTruthy();
  expect(creditsOf(user.id).total).toBe(afterFit - 1.5);

  // No fit behind this context: no discount.
  const sessionTwo = await newApplication(user.id);
  const before = creditsOf(user.id).total;
  const unpaid = await callAgent(request, { action: 'generate_with_context', contextId: 'ctx-never-paid', jobDescription: JOB_DESCRIPTION, sessionId: sessionTwo }, requestId());
  expect(event(unpaid, 'credits_deducted')?.creditsUsed).toBe(2);
  expect(creditsOf(user.id).total).toBe(before - 2.0);
});

test('(g5) INSUFFICIENT_CREDITS, REQUEST_IN_PROGRESS and REQUEST_ALREADY_COMPLETED carry their payloads', async ({ request }) => {
  const user = await createSignedInApiUser(request, 'price5');
  const sessionId = await newApplication(user.id);

  // Insufficient: the error names what was needed and what there is.
  setBalance(user.id, { monthly: 0.5 });
  const broke = await callAgent(request, { action: 'full_optimization', jobDescription: JOB_DESCRIPTION, sessionId }, requestId());
  const insufficient = event(broke, 'error');
  expect(insufficient?.code).toBe('INSUFFICIENT_CREDITS');
  expect(insufficient?.details).toMatchObject({ required: 2, available: 0.5 });
  expect(creditsOf(user.id).total).toBe(0.5);

  // The same request id twice: once while it runs, once after it finished.
  setBalance(user.id, { monthly: 10 });
  await fakeControl({ delayMs: 3000 });
  const id = requestId();
  const first = callAgent(request, { action: 'full_optimization', jobDescription: JOB_DESCRIPTION, sessionId }, id);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const duplicate = await callAgent(request, { action: 'full_optimization', jobDescription: JOB_DESCRIPTION, sessionId }, id);
  expect(event(duplicate, 'error')).toMatchObject({ code: 'REQUEST_IN_PROGRESS' });
  const firstEvents = await first;
  expect(event(firstEvents, 'workflow_complete')).toBeTruthy();
  const balanceAfter = creditsOf(user.id).total;
  expect(balanceAfter).toBe(8);

  await fakeControl({ delayMs: 0 });
  const replay = await callAgent(request, { action: 'full_optimization', jobDescription: JOB_DESCRIPTION, sessionId }, id);
  expect(event(replay, 'error')).toMatchObject({ code: 'REQUEST_ALREADY_COMPLETED' });
  expect(creditsOf(user.id).total).toBe(balanceAfter);
});

test('(g6) a kit written to an application that was deleted mid-run is not charged', async ({ request }) => {
  const user = await createSignedInApiUser(request, 'price6');
  const start = creditsOf(user.id).total;
  const sessionId = await newApplication(user.id);
  await fakeControl({ delayMs: 2500 });
  const running = callAgent(request, { action: 'full_optimization', jobDescription: JOB_DESCRIPTION, sessionId }, requestId());
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const { openLocalD1 } = await import('../lib/sqlite');
  const db = openLocalD1();
  try {
    db.prepare('DELETE FROM application_sessions WHERE id = ?').run(sessionId);
  } finally {
    db.close();
  }
  const events = await running;
  expect(event(events, 'error')).toBeTruthy();
  expect(event(events, 'workflow_complete')).toBeUndefined();
  expect(creditsOf(user.id).total).toBe(start);
});
