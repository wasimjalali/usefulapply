import { expect, test } from '@playwright/test';
import { storedApplication } from '../lib/app';
import { BASE_URL } from '../lib/env';
import { runTool } from '../lib/run-tool';
import { openLocalD1 } from '../lib/sqlite';
import { JOB_DESCRIPTION } from '../lib/model-script';
import { createTestUser, creditsOf } from '../lib/user';

interface Report {
  scenarios: Array<{ name: string; passed: boolean; observed: Record<string, unknown>; error?: string }>;
}

/**
 * (d) enqueueKitGeneration. The 23 scenarios in e2e/tools/scenarios.ts run the
 * production service, runner and sweeper against a fresh local D1 with the
 * Queue simulated at its edge (send / ack / retry / attempts / dead-letter),
 * and the model scripted. They cover: one key twice is one reservation, one
 * operation and one charge; the same key with other input is rejected; an
 * identical request under a fresh key is deduped; at most 2 live operations;
 * a good run; the regenerate guard; a crash after reserve that retries out
 * (reservation released, balance restored exactly, ledger row present); a
 * killed worker (lease, sweeper, dead-letter queue); a partly failed kit
 * refunded per document; cancel beating a late finisher; enqueue failure; and
 * the documents service parsing and storing a CV like a web upload.
 */
test('(d) enqueueKitGeneration: idempotency, limits, retries, crash recovery', async () => {
  const report = await runTool<Report>('e2e/tools/scenarios.ts', ['d']);
  const failed = report.scenarios.filter((scenario) => !scenario.passed);
  expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
  expect(report.scenarios).toHaveLength(23);
  test.info().attach('scenarios-d.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
});

/**
 * The same pipeline through the real Cloudflare Queue the preview Worker runs
 * locally. A pending operation whose message was lost is picked up by the
 * 10-minute cron sweeper (triggered with wrangler's /__scheduled), which sends
 * a message through the real `AGENT_GENERATION_QUEUE` binding. The Worker's
 * own `queue()` handler then claims the lease, runs the writer pipeline and
 * settles the kit in one batch.
 */
test('(d) the real queue consumer in the preview Worker settles a recovered operation', async ({ request }) => {
  const user = await createTestUser(request, 'queue');
  const before = creditsOf(user.id);
  const application = await runTool<{ id: string }>('e2e/tools/ops.ts', [
    'create-application',
    JSON.stringify({ userId: user.id, jobDescription: JOB_DESCRIPTION }),
  ]);
  const queued = await runTool<{ operationId: string; status: string; creditsReserved: number }>('e2e/tools/ops.ts', [
    'enqueue',
    JSON.stringify({ userId: user.id, sessionId: application.id, key: `real-queue-${Date.now()}` }),
  ]);
  expect(queued.status).toBe('pending');
  expect(creditsOf(user.id).total).toBe(before.total - 2);

  // The producer in that process only recorded the message, so nothing consumed it:
  // exactly the "message lost" case the sweeper exists for.
  const db = openLocalD1();
  try {
    db.prepare('UPDATE agent_operations SET updated_at = ? WHERE id = ?').run(new Date(Date.now() - 30 * 60 * 1000).toISOString(), queued.operationId);
  } finally {
    db.close();
  }

  const sweep = await request.get(`${BASE_URL}/__scheduled?cron=*%2F10+*+*+*+*`);
  expect(sweep.ok(), await sweep.text()).toBeTruthy();

  const deadline = Date.now() + 90_000;
  let status = 'pending';
  while (Date.now() < deadline) {
    const check = openLocalD1();
    try {
      status = (check.prepare('SELECT status FROM agent_operations WHERE id = ?').get(queued.operationId) as { status: string }).status;
    } finally {
      check.close();
    }
    if (status !== 'pending' && status !== 'running') break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  expect(status).toBe('succeeded');

  const stored = storedApplication(user.id, application.id);
  expect(stored?.generation_status).toBe('succeeded');
  expect(stored?.generated_cv?._optimizedCVData).toBeTruthy();
  expect(stored?.cover_letter?.body).toContain('Calder Industrial Components');
  expect(stored?.revision).toBeGreaterThanOrEqual(1);
  // One charge, captured.
  expect(creditsOf(user.id).total).toBe(before.total - 2);
  const verify = openLocalD1();
  try {
    const reservation = verify.prepare('SELECT status FROM credit_reservations WHERE user_id = ?').get(user.id) as { status: string };
    expect(reservation.status).toBe('captured');
  } finally {
    verify.close();
  }
});
