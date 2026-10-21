/**
 * Queue, credit and atomicity scenarios (specs d and e).
 *
 *   npx tsx e2e/tools/scenarios.ts d|e [outFile]
 *
 * Real code, real local D1 (a fresh migrated one in a temp dir), real agents and
 * validators; the model is the scripted fake on FAKE_ANTHROPIC_PORT. The
 * Cloudflare Queue itself is simulated at its edge: a producer whose `send`
 * records messages, and a consumer batch with `ack` / `retry` and an `attempts`
 * count, driven the way the platform redelivers (3 retries, then the DLQ).
 * Everything behind that edge (the lease, the runner, the settle batch, the
 * refunds, the sweeper) is the production code.
 *
 * Prints `__RESULT__{...report}`; exits non-zero if any scenario failed.
 */

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { FAKE_ANTHROPIC_URL } from '../lib/env';
import { fakeCalls, fakeReset } from '../lib/fake-control';
import { JOB_DESCRIPTION, PRIMARY_CV } from '../lib/model-script';
import { freshStateDir, openPlatform, pointModelAtFake, type Platform } from '../lib/platform';

pointModelAtFake();

interface Scenario {
  name: string;
  passed: boolean;
  observed: Record<string, unknown>;
  error?: string;
}

const report: { startedAt: string; mode: string; scenarios: Scenario[] } = {
  startedAt: new Date().toISOString(),
  mode: process.argv[2] ?? '',
  scenarios: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function control(body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${FAKE_ANTHROPIC_URL}/__control`, { method: 'POST', body: JSON.stringify(body) });
  assert.ok(response.ok, 'fake model control call failed');
}

type Row = Record<string, unknown>;

async function main(): Promise<void> {
  const mode = process.argv[2];
  const platform = await openPlatform(freshStateDir());
  const runners = await import('../../src/lib/services/generation-runner');
  const ops = await import('../../src/lib/services/operations');
  const credits = await import('../../src/db/repos/credits');
  const sessionsRepo = await import('../../src/db/repos/sessions');
  const errors = await import('../../src/lib/services/errors');
  const dbClient = await import('../../src/db/client');
  const { sql } = await import('drizzle-orm');

  const all = async (query: string, ...bindings: unknown[]): Promise<Row[]> => {
    const result = await platform.db.prepare(query).bind(...bindings).all();
    return (result as unknown as { results: Row[] }).results;
  };
  const one = async (query: string, ...bindings: unknown[]) => (await all(query, ...bindings))[0];
  const run = (query: string, ...bindings: unknown[]) => platform.db.prepare(query).bind(...bindings).run();

  /** A user with a stored CV, a credit balance and `sessions` applications. */
  async function seedUser(label: string, balance: { monthly: number; rollover?: number; addon?: number }, sessions = 1) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await run('INSERT INTO profiles (id, email, job_searches_reset_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', id, `${label}@test.local`, now, now, now);
    await run(
      'INSERT INTO user_credits (id, user_id, monthly_credits, rollover_credits, addon_credits, plan_tier, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)',
      crypto.randomUUID(), id, balance.monthly, balance.rollover ?? 0, balance.addon ?? 0, 'free', now, now,
    );
    await run(
      `INSERT INTO documents (id, user_id, type, file_name, file_type, raw_text, sections, all_skills, all_experiences, all_education, created_at, updated_at)
       VALUES (?, ?, 'primary_cv', 'cv.txt', 'txt', ?, '{}', '[]', '[]', '[]', ?, ?)`,
      crypto.randomUUID(), id, PRIMARY_CV, now, now,
    );
    const sessionIds: string[] = [];
    for (let i = 0; i < sessions; i++) {
      // Distinct ads so each application is a different request.
      const created = await sessionsRepo.createSession(id, `${JOB_DESCRIPTION} (posting ${i + 1})`);
      assert.ok(created.session);
      sessionIds.push(created.session.id);
    }
    return { id, sessionIds };
  }

  async function balanceOf(userId: string) {
    const row = await one('SELECT monthly_credits AS m, rollover_credits AS r, addon_credits AS a, version FROM user_credits WHERE user_id = ?', userId);
    const m = Number(row.m), r = Number(row.r), a = Number(row.a);
    return { monthly: m, rollover: r, addon: a, total: m + r + a, version: Number(row.version) };
  }
  const ledgerOf = (userId: string) => all('SELECT amount, transaction_type, transaction_kind, balance_before, balance_after, description FROM credit_transactions WHERE user_id = ? ORDER BY rowid', userId);
  const reservationsOf = (userId: string) => all('SELECT id, status, amount, idempotency_key, metadata FROM credit_reservations WHERE user_id = ? ORDER BY rowid', userId);
  const operationsOf = (userId: string) => all('SELECT id, status, attempt, error_code, reservation_key, lease_owner FROM agent_operations WHERE user_id = ? ORDER BY rowid', userId);

  interface Delivery { acked: boolean; retried: { delaySeconds?: number } | null }
  async function deliver(queue: string, operationId: string, attempts: number): Promise<Delivery> {
    const outcome: Delivery = { acked: false, retried: null };
    await runners.handleAgentQueueBatch({
      queue,
      messages: [{
        body: { operationId },
        attempts,
        ack: () => { outcome.acked = true; },
        retry: (options) => { outcome.retried = options ?? {}; },
      }],
    });
    return outcome;
  }

  /** Redeliver the way Cloudflare does: retry until the handler acks, up to 1 + max_retries deliveries, then the dead-letter queue. */
  async function deliverUntilSettled(operationId: string) {
    const deliveries: Delivery[] = [];
    for (let attempt = 1; attempt <= runners.QUEUE_MAX_RETRIES + 1; attempt++) {
      const outcome = await deliver(runners.AGENT_QUEUE_NAME, operationId, attempt);
      deliveries.push(outcome);
      if (outcome.acked) return { deliveries, deadLettered: false };
    }
    await deliver(runners.AGENT_DLQ_NAME, operationId, 1);
    return { deliveries, deadLettered: true };
  }

  /** A reservation of `amount` on a fresh user, via the real reserveCredits. */
  async function reserve(label: string, balance: { monthly: number; rollover?: number; addon?: number }, key: string) {
    const user = await seedUser(label, balance);
    const result = await credits.reserveCredits({ userId: user.id, action: 'FULL_APPLICATION', idempotencyKey: key, sessionId: user.sessionIds[0] });
    assert.ok(result.success && result.reservation, 'reserved');
    return { user, reservation: result.reservation as import('../../src/db/repos/credits').CreditReservation };
  }

  const scenario = async (name: string, body: () => Promise<Record<string, unknown>>) => {
    const observed: Record<string, unknown> = {};
    try {
      await control({ failWriter: null, delayMs: 0 });
      Object.assign(observed, await body());
      report.scenarios.push({ name, passed: true, observed });
      console.log(`PASS  ${name}`);
    } catch (error) {
      report.scenarios.push({ name, passed: false, observed, error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error) });
      console.log(`FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // =========================================================================
  // (d) enqueueKitGeneration, the queue runner and the credits around it
  // =========================================================================
  if (mode === 'd') {
    await scenario('d1. the same idempotency key twice gives one reservation, one operation and one charge', async () => {
      const user = await seedUser('d1', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      const before = await balanceOf(user.id);
      await fakeReset();
      const first = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d1', {});
      const second = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d1', {});
      assert.equal((await fakeCalls()).length, 0, 'enqueueing, twice, calls no model');
      assert.equal(first.deduped, false);
      assert.equal(second.deduped, true);
      assert.equal(second.matchedBy, 'key');
      assert.equal(second.operationId, first.operationId);
      assert.equal((await operationsOf(user.id)).length, 1, 'one operation');
      assert.equal((await reservationsOf(user.id)).length, 1, 'one reservation');
      const after = await balanceOf(user.id);
      assert.equal(before.total - after.total, 2, 'one 2.0 credit charge');
      const charges = (await ledgerOf(user.id)).filter((row) => Number(row.amount) < 0);
      assert.equal(charges.length, 1, 'one ledger charge');
      return { operationId: first.operationId, balanceBefore: before.total, balanceAfter: after.total, ledgerCharges: charges.length, queueMessages: platform.queue.messages.length };
    });

    await scenario('d2. the same key with different input is rejected and charges nothing', async () => {
      const user = await seedUser('d2', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      await runners.enqueueKitGeneration(user.id, sessionId, 'key-d2', {});
      const before = await balanceOf(user.id);
      await assert.rejects(
        runners.enqueueKitGeneration(user.id, sessionId, 'key-d2', { regenerate: true }),
        (error: unknown) => error instanceof errors.IdempotencyKeyMismatch,
      );
      const after = await balanceOf(user.id);
      assert.equal(after.total, before.total);
      assert.equal((await reservationsOf(user.id)).length, 1);
      return { rejected: 'IDEMPOTENCY_KEY_MISMATCH', balance: after.total };
    });

    await scenario('d3. an identical request under a fresh key returns the live operation (no second charge)', async () => {
      const user = await seedUser('d3', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      const first = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d3-a', {});
      const before = await balanceOf(user.id);
      const second = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d3-b', {});
      assert.equal(second.deduped, true);
      assert.equal(second.matchedBy, 'input');
      assert.equal(second.operationId, first.operationId);
      assert.equal((await balanceOf(user.id)).total, before.total);
      assert.equal((await operationsOf(user.id)).length, 1);
      return { matchedBy: second.matchedBy, balance: before.total };
    });

    await scenario('d4. at most 2 live operations per user; the third is refused and its credits are released', async () => {
      const user = await seedUser('d4', { monthly: 4, addon: 6 }, 3);
      const before = await balanceOf(user.id);
      await runners.enqueueKitGeneration(user.id, user.sessionIds[0], 'key-d4-1', {});
      await runners.enqueueKitGeneration(user.id, user.sessionIds[1], 'key-d4-2', {});
      await assert.rejects(
        runners.enqueueKitGeneration(user.id, user.sessionIds[2], 'key-d4-3', {}),
        (error: unknown) => error instanceof errors.OperationLimitReached,
      );
      const after = await balanceOf(user.id);
      assert.equal(before.total - after.total, 4, 'only the two accepted operations are charged');
      const states = (await reservationsOf(user.id)).map((row) => row.status);
      assert.deepEqual(states, ['reserved', 'reserved', 'released']);
      assert.equal((await operationsOf(user.id)).length, 2);
      return { reservationStates: states, balanceBefore: before.total, balanceAfter: after.total };
    });

    await scenario('d5. a good run: kit persisted, operation succeeded, reservation captured, one charge, all in the canonical columns', async () => {
      const user = await seedUser('d5', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      const before = await balanceOf(user.id);
      await fakeReset();
      const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d5', {});
      const settled = await deliverUntilSettled(queued.operationId);
      assert.equal(settled.deadLettered, false);
      assert.equal(settled.deliveries.length, 1);
      const writerCalls = (await fakeCalls()).filter((call) => ['cv', 'coverLetter', 'applicationEmail', 'followUpEmail'].includes(call.writer));
      assert.equal(writerCalls.length, 4, 'one run: each document written once');
      // The CV the model saw is the one in D1, read by the runner.
      assert.ok((await fakeCalls()).find((call) => call.writer === 'applicant')?.user.includes('Calder Industrial Components'));
      const operation = await one('SELECT status, attempt, result_ref, lease_owner FROM agent_operations WHERE id = ?', queued.operationId);
      assert.equal(operation.status, 'succeeded');
      assert.equal(operation.lease_owner, null);
      const reservation = (await reservationsOf(user.id))[0];
      assert.equal(reservation.status, 'captured');
      const session = await one('SELECT revision, generation_status, generated_cv, cover_letter, email, follow_up_email, job_title, company FROM application_sessions WHERE id = ?', sessionId);
      assert.equal(session.generation_status, 'succeeded');
      assert.ok(session.generated_cv && session.cover_letter && session.email && session.follow_up_email, 'canonical columns filled');
      assert.ok(String(session.generated_cv).includes('_optimizedCVData'));
      assert.equal(session.company, 'Northwind Foods');
      assert.ok(Number(session.revision) >= 1);
      const after = await balanceOf(user.id);
      assert.equal(before.total - after.total, 2);
      const refunds = (await ledgerOf(user.id)).filter((row) => row.transaction_kind === 'refund');
      assert.equal(refunds.length, 0);
      return { revision: session.revision, resultRef: operation.result_ref, balanceBefore: before.total, balanceAfter: after.total };
    });

    await scenario('d6. regenerate guard: a finished kit is refused unless regenerate is set', async () => {
      const user = await seedUser('d6', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d6-1', {});
      await deliverUntilSettled(queued.operationId);
      const before = await balanceOf(user.id);
      // Just after success the same request under a fresh key is the same request: it gets that operation back.
      const retried = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d6-2', {});
      assert.equal(retried.deduped, true);
      assert.equal(retried.operationId, queued.operationId);
      // Once the dedupe window has passed, a kit that exists is refused without `regenerate`.
      await run('UPDATE agent_operations SET updated_at = ? WHERE id = ?', new Date(Date.now() - 60 * 60 * 1000).toISOString(), queued.operationId);
      await assert.rejects(
        runners.enqueueKitGeneration(user.id, sessionId, 'key-d6-3', {}),
        (error: unknown) => error instanceof errors.KitAlreadyGeneratedError,
      );
      assert.equal((await balanceOf(user.id)).total, before.total);
      const again = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d6-4', { regenerate: true });
      assert.equal(again.deduped, false);
      return { dedupedJustAfterSuccess: true, refusedWithoutRegenerate: true, regenerateAccepted: true };
    });

    await scenario('d7. crash after reserve, before capture: every run fails, retries are exhausted, the reservation is released, the balance is restored exactly and the ledger shows it', async () => {
      const user = await seedUser('d7', { monthly: 1, rollover: 0.5, addon: 6 });
      const [sessionId] = user.sessionIds;
      const before = await balanceOf(user.id);
      await control({ failWriter: 'applicant' });
      const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d7', {});
      const reservedBalance = await balanceOf(user.id);
      assert.equal(before.total - reservedBalance.total, 2, 'reserved: 2.0 held');
      const settled = await deliverUntilSettled(queued.operationId);
      await control({ failWriter: null });
      // Three retries asked for, the fourth delivery is the terminal one and settles.
      assert.deepEqual(settled.deliveries.map((delivery) => (delivery.retried ? 'retry' : 'ack')), ['retry', 'retry', 'retry', 'ack']);
      assert.equal(settled.deadLettered, false);
      const operation = await one('SELECT status, attempt, error_code FROM agent_operations WHERE id = ?', queued.operationId);
      assert.equal(operation.status, 'failed');
      assert.equal(operation.error_code, 'generation_failed');
      assert.equal(operation.attempt, 4);
      assert.equal((await reservationsOf(user.id))[0].status, 'released');
      const after = await balanceOf(user.id);
      assert.deepEqual({ monthly: after.monthly, rollover: after.rollover, addon: after.addon }, { monthly: before.monthly, rollover: before.rollover, addon: before.addon }, 'every bucket restored exactly');
      const ledger = await ledgerOf(user.id);
      const refundRows = ledger.filter((row) => row.transaction_type === 'reservation_released');
      assert.ok(refundRows.length >= 1, 'a refund ledger row exists');
      assert.equal(refundRows.reduce((sum, row) => sum + Number(row.amount), 0), 2);
      const session = await one('SELECT generation_status, generated_cv FROM application_sessions WHERE id = ?', sessionId);
      assert.equal(session.generation_status, 'failed');
      assert.equal(session.generated_cv, null);
      return { deliveries: settled.deliveries.length, retryDelays: settled.deliveries.map((delivery) => delivery.retried?.delaySeconds ?? null), balanceBefore: before, balanceAfter: after, ledger };
    });

    await scenario('d8. a worker killed mid-run: the lease holds the operation, then the sweeper and the dead-letter queue settle it', async () => {
      const user = await seedUser('d8', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      const before = await balanceOf(user.id);
      const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d8', {});
      // A worker claims the lease and dies without telling anyone.
      const claim = await ops.claimOperation(queued.operationId, 'queue:dead-worker', 10 * 60 * 1000);
      assert.ok(claim, 'claimed');
      // A redelivery while that lease is live runs nothing and does not steal it.
      await control({ failWriter: 'applicant' });
      const whileLeased = await deliver(runners.AGENT_QUEUE_NAME, queued.operationId, 2);
      assert.equal(whileLeased.acked, true);
      assert.equal((await one('SELECT lease_owner FROM agent_operations WHERE id = ?', queued.operationId)).lease_owner, 'queue:dead-worker');
      assert.equal((await reservationsOf(user.id))[0].status, 'reserved', 'still held, not released under a live worker');
      // The dead-letter message for a live lease is ignored too.
      await deliver(runners.AGENT_DLQ_NAME, queued.operationId, 1);
      assert.equal((await one('SELECT status FROM agent_operations WHERE id = ?', queued.operationId)).status, 'running');
      // The lease runs out and the worker never comes back: it has used its attempts.
      await run("UPDATE agent_operations SET lease_expires_at = ?, attempt = ?, updated_at = ? WHERE id = ?", new Date(Date.now() - 10 * 60 * 1000).toISOString(), runners.MAX_RUN_ATTEMPTS, new Date(Date.now() - 20 * 60 * 1000).toISOString(), queued.operationId);
      const swept = await runners.recoverStuckOperations();
      assert.deepEqual(swept, { resent: 0, failed: 1 });
      const operation = await one('SELECT status, error_code FROM agent_operations WHERE id = ?', queued.operationId);
      assert.equal(operation.status, 'failed');
      assert.equal(operation.error_code, 'stuck');
      assert.equal((await reservationsOf(user.id))[0].status, 'released');
      assert.equal((await balanceOf(user.id)).total, before.total);
      return { sweeper: swept, finalStatus: operation, balanceBefore: before.total, balanceAfter: (await balanceOf(user.id)).total };
    });

    await scenario('d9. the sweeper re-sends a lost message for an operation that still has attempts left', async () => {
      const user = await seedUser('d9', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d9', {});
      await run('UPDATE agent_operations SET updated_at = ? WHERE id = ?', new Date(Date.now() - 30 * 60 * 1000).toISOString(), queued.operationId);
      const sentBefore = platform.queue.messages.length;
      const swept = await runners.recoverStuckOperations();
      assert.equal(swept.resent, 1);
      assert.equal(platform.queue.messages.length, sentBefore + 1);
      const settled = await deliverUntilSettled(queued.operationId);
      assert.equal(settled.deliveries.length, 1);
      assert.equal((await one('SELECT status FROM agent_operations WHERE id = ?', queued.operationId)).status, 'succeeded');
      return { resent: swept.resent };
    });

    await scenario('d10. a document that fails inside a good run is refunded per document, not by releasing the whole kit', async () => {
      const user = await seedUser('d10', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      const before = await balanceOf(user.id);
      await control({ failWriter: 'coverLetter' });
      const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d10', {});
      await deliverUntilSettled(queued.operationId);
      await control({ failWriter: null });
      assert.equal((await one('SELECT status FROM agent_operations WHERE id = ?', queued.operationId)).status, 'succeeded');
      const reservation = (await reservationsOf(user.id))[0];
      assert.equal(reservation.status, 'captured');
      const after = await balanceOf(user.id);
      assert.equal(before.total - after.total, 1.5, '2.0 charged, 0.5 handed back for the cover letter');
      const refunds = (await ledgerOf(user.id)).filter((row) => row.transaction_type === 'reservation_partial_refund');
      assert.equal(refunds.reduce((sum, row) => sum + Number(row.amount), 0), 0.5);
      const session = await one('SELECT cover_letter, generated_cv, generated_artifacts FROM application_sessions WHERE id = ?', sessionId);
      assert.equal(session.cover_letter, null);
      assert.ok(session.generated_cv);
      assert.ok(String(session.generated_artifacts).includes('"coverLetter":"GENERATION_FAILED"'));
      return { balanceBefore: before.total, balanceAfter: after.total, partialRefund: refunds };
    });

    await scenario('d11. cancel wins against a late finisher: the run finds it lost, nothing is written, the credits come back', async () => {
      const user = await seedUser('d11', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      const before = await balanceOf(user.id);
      await control({ delayMs: 2500 });
      const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d11', {});
      const running = runners.runKitOperation(queued.operationId);
      await new Promise((resolve) => setTimeout(resolve, 800));
      const cancelled = await ops.cancelOperation(user.id, queued.operationId);
      assert.equal(cancelled?.status, 'cancelled');
      const outcome = await running;
      await control({ delayMs: 0 });
      assert.deepEqual(outcome, { outcome: 'dropped', reason: 'lost_to_cancel_or_takeover' });
      assert.equal((await one('SELECT status FROM agent_operations WHERE id = ?', queued.operationId)).status, 'cancelled');
      const session = await one('SELECT generation_status, generated_cv, cover_letter FROM application_sessions WHERE id = ?', sessionId);
      assert.equal(session.generation_status, 'cancelled');
      assert.equal(session.generated_cv, null);
      assert.equal((await reservationsOf(user.id))[0].status, 'released');
      assert.equal((await balanceOf(user.id)).total, before.total);
      return { outcome, balanceAfter: (await balanceOf(user.id)).total };
    });

    await scenario('d12. enqueue failure after the operation exists marks it failed and releases the credits', async () => {
      const user = await seedUser('d12', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      const before = await balanceOf(user.id);
      platform.queue.failNext = true;
      await assert.rejects(runners.enqueueKitGeneration(user.id, sessionId, 'key-d12', {}), /queue unavailable/);
      const operation = (await operationsOf(user.id))[0];
      assert.equal(operation.status, 'failed');
      assert.equal(operation.error_code, 'enqueue_failed');
      assert.equal((await balanceOf(user.id)).total, before.total);
      return { operation };
    });
  }

  if (mode === 'd') {
    await scenario('d13. documents service: a CV given as text is parsed and stored like a web upload', async () => {
      const user = await seedUser('d13', { monthly: 4 }, 0);
      await run("DELETE FROM documents WHERE user_id = ?", user.id);
      const documents = await import('../../src/lib/services/documents');
      const saved = await documents.parseAndSaveCv(user.id, { type: 'primary_cv', fileName: 'tomas.txt', text: PRIMARY_CV });
      assert.equal(saved.document.file_type, 'txt');
      assert.equal(saved.document.type, 'primary_cv');
      assert.equal(saved.structuredCV.personal.fullName, 'Tomas Brandt');
      assert.ok(saved.rawText.includes('Calder Industrial Components'));
      const stored = await one('SELECT file_name, raw_text, structured_data, sections FROM documents WHERE user_id = ?', user.id);
      assert.equal(stored.file_name, 'tomas.txt');
      assert.ok(String(stored.structured_data).includes('Tomas Brandt'));
      assert.ok(String(stored.sections).includes('Calder Industrial Components'));
      // Saving again replaces the document, it does not add a second one.
      await documents.parseAndSaveCv(user.id, { type: 'primary_cv', fileName: 'tomas-2.txt', text: PRIMARY_CV });
      assert.equal((await all('SELECT id FROM documents WHERE user_id = ?', user.id)).length, 1);
      await assert.rejects(documents.parseAndSaveCv(user.id, { type: 'primary_cv', fileName: 'tomas.exe', bytes: new Uint8Array([1, 2, 3]) }), (error: unknown) => error instanceof errors.InvalidInputError);
      return { documentId: saved.document.id };
    });
  }

  if (mode === 'd') {
    await scenario('d14. letter rules on the revisioned path: structured letter persisted, recipient fill-only and revision-bumping, JD change clears it', async () => {
      const user = await seedUser('d14', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d14', {});
      await deliverUntilSettled(queued.operationId);
      const kitRow = await one('SELECT cover_letter, cover_letter_language, company_address, company_contact_person, job_description, revision FROM application_sessions WHERE id = ?', sessionId);
      const letter = JSON.parse(String(kitRow.cover_letter));
      assert.ok(letter.body && letter.structured, 'cover_letter is { body, structured }');
      assert.equal(letter.structured.version, 2);
      assert.equal(kitRow.cover_letter_language, letter.structured.language);
      assert.equal(kitRow.company_address, null, 'persistKit does not write company_address');

      const applications = await import('../../src/lib/services/applications');
      const structured = { ...letter.structured, recipient: { companyName: 'Northwind Foods', contactPerson: 'Ms Berg', addressLines: ['1 Main Street', 'Chicago'] } };
      const jd = String(kitRow.job_description);
      const filled = await applications.fillLetterRecipient(user.id, sessionId, jd, structured);
      assert.equal(filled.revision, Number(kitRow.revision) + 2, 'one bump per column written');
      const after = await one('SELECT company_address, company_contact_person FROM application_sessions WHERE id = ?', sessionId);
      assert.equal(after.company_address, '1 Main Street\nChicago');
      assert.equal(after.company_contact_person, 'Ms Berg');
      // Fill-only: a second letter changes nothing and bumps nothing.
      const again = await applications.fillLetterRecipient(user.id, sessionId, jd, { ...structured, recipient: { addressLines: ['Elsewhere'], contactPerson: 'Someone Else' } });
      assert.equal(again.revision, undefined);
      // A letter for another job never fills.
      await run('UPDATE application_sessions SET company_address = NULL WHERE id = ?', sessionId);
      const stale = await applications.fillLetterRecipient(user.id, sessionId, 'a different job', structured);
      assert.equal(stale.revision, undefined);
      assert.equal((await one('SELECT company_address FROM application_sessions WHERE id = ?', sessionId)).company_address, null);
      await applications.fillLetterRecipient(user.id, sessionId, jd, structured);

      // A job description change clears both columns in the same revisioned write; surrounding whitespace is not a change.
      let current = await one('SELECT revision FROM application_sessions WHERE id = ?', sessionId);
      const whitespace = await applications.updateApplicationFields(user.id, sessionId, Number(current.revision), { job_description: `  ${jd}\n` });
      assert.equal(whitespace.revision, Number(current.revision) + 1);
      assert.equal((await one('SELECT company_address FROM application_sessions WHERE id = ?', sessionId)).company_address, '1 Main Street\nChicago', 'whitespace-only edit keeps the recipient');
      current = await one('SELECT revision FROM application_sessions WHERE id = ?', sessionId);
      await applications.updateApplicationFields(user.id, sessionId, Number(current.revision), { job_description: 'A different ad entirely' });
      const cleared = await one('SELECT company_address, company_contact_person, revision FROM application_sessions WHERE id = ?', sessionId);
      assert.equal(cleared.company_address, null);
      assert.equal(cleared.company_contact_person, null);
      assert.equal(Number(cleared.revision), Number(current.revision) + 1);
      // The browser patch cannot carry the server-managed columns.
      await assert.rejects(
        applications.updateApplicationFields(user.id, sessionId, Number(cleared.revision), { company_address: 'x' }),
        (error: unknown) => error instanceof errors.InvalidInputError,
      );
      return { filled: filled.revision, cleared: cleared.revision };
    });
  }

  if (mode === 'd') {
    await scenario('d15. editing a legacy CV (generated_cv empty, CV only in generated_artifacts) keeps the legacy content', async () => {
      const user = await seedUser('d15', { monthly: 4 });
      const [sessionId] = user.sessionIds;
      const cvData = { personal: { fullName: 'Tomas Brandt', email: 't@example.com', currentTitle: 'Financial Analyst' }, experience: [], education: [], skills: [], languages: [], certifications: [] };
      await run('UPDATE application_sessions SET generated_artifacts = ? WHERE id = ?', JSON.stringify({
        optimizedCV: { content: 'LEGACY CV TEXT', changes: [{ section: 'Summary', before: 'a', after: 'b', reason: 'r' }] },
        optimizedCVData: cvData,
      }), sessionId);
      const cv = await import('../../src/lib/services/cv');
      const loaded = await cv.getTailoredCv(user.id, sessionId);
      assert.equal(loaded.data?.personal.currentTitle, 'Financial Analyst');
      await cv.setCvFields(user.id, sessionId, loaded.revision, [{ path: 'personal.currentTitle', value: 'Head of Forecasting' }]);
      const stored = JSON.parse(String((await one('SELECT generated_cv FROM application_sessions WHERE id = ?', sessionId)).generated_cv));
      assert.equal(stored.content, 'LEGACY CV TEXT');
      assert.equal(stored.changes.length, 1);
      assert.equal(stored.optimizedFor, 'Position');
      assert.equal(stored._optimizedCVData.personal.currentTitle, 'Head of Forecasting');
      return { keys: Object.keys(stored) };
    });

    await scenario('d16. a duplicate enqueue that hits the operation limit never releases a reservation it only adopted', async () => {
      const user = await seedUser('d16', { monthly: 4, addon: 6 }, 3);
      await runners.enqueueKitGeneration(user.id, user.sessionIds[0], 'key-d16-1', {});
      await runners.enqueueKitGeneration(user.id, user.sessionIds[1], 'key-d16-2', {});
      // "A" has reserved for the third application and has not inserted its operation yet.
      const kitGen = await import('../../src/lib/services/kit-generation');
      const [, , third] = user.sessionIds;
      const heldByA = await kitGen.reserveKitCredits({
        userId: user.id, sessionId: third, requestId: 'key-d16-3',
        keyFor: (action) => `generate_kit:${user.id}:${third}:${action}:key-d16-3`,
      });
      assert.ok(heldByA.result.success && heldByA.result.created);
      const balanceHeld = await balanceOf(user.id);
      // "B" is the same request: it adopts A's reservation, then hits the limit.
      await assert.rejects(
        runners.enqueueKitGeneration(user.id, third, 'key-d16-3', {}),
        (error: unknown) => error instanceof errors.OperationLimitReached,
      );
      const held = (await reservationsOf(user.id)).find((row) => row.idempotency_key === heldByA.key);
      assert.equal(held?.status, 'reserved', 'A still owns it');
      assert.deepEqual(await balanceOf(user.id), balanceHeld);
      return { status: held?.status };
    });

    await scenario('d17. a live operation holds its reservation: release and the stale sweeper refuse it until the operation ends', async () => {
      const user = await seedUser('d17', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d17', {});
      const held = await balanceOf(user.id);
      const refused = await credits.releaseReservation({ userId: user.id, idempotencyKey: queued.reservationKey as string, reason: 'a loser' });
      assert.equal(refused.success, false);
      await run("UPDATE credit_reservations SET reserved_at = '2020-01-01T00:00:00.000Z' WHERE user_id = ?", user.id);
      const swept = await credits.releaseStaleReservations({ maxAgeMs: 60_000 });
      assert.equal(swept.released, 0);
      assert.equal((await reservationsOf(user.id))[0].status, 'reserved');
      assert.deepEqual(await balanceOf(user.id), held);
      // Once the operation ends the same release is allowed.
      await ops.cancelOperation(user.id, queued.operationId);
      assert.equal((await reservationsOf(user.id))[0].status, 'released');
      assert.equal((await balanceOf(user.id)).total, held.total + 2);
      return { refusedWhileLive: true };
    });

    await scenario('d18. no capture, no kit: a reservation released from under a finished run fails the operation and delivers nothing', async () => {
      const user = await seedUser('d18', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d18', {});
      // The loser of a duplicate enqueue released it (simulated; the guards above stop the real path).
      await run("UPDATE credit_reservations SET status = 'released', released_at = ? WHERE user_id = ?", new Date().toISOString(), user.id);
      const settled = await deliverUntilSettled(queued.operationId);
      assert.equal(settled.deliveries.length, 1, 'permanent: no retries');
      const operation = await one('SELECT status, error_code FROM agent_operations WHERE id = ?', queued.operationId);
      assert.equal(operation.status, 'failed');
      assert.equal(operation.error_code, 'reservation_not_held');
      const session = await one('SELECT generated_cv, cover_letter, generation_status FROM application_sessions WHERE id = ?', sessionId);
      assert.equal(session.generated_cv, null);
      assert.equal(session.cover_letter, null);
      assert.equal(session.generation_status, 'failed');
      assert.equal((await reservationsOf(user.id))[0].status, 'released', 'never captured');
      return { operation };
    });

    await scenario('d19. the guard inside the success batch: a reservation that stops being reserved mid-batch rolls the kit back', async () => {
      const user = await seedUser('d19', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d19', {});
      const operation = (await ops.getOperationById(queued.operationId))!;
      const claimed = (await ops.claimOperation(queued.operationId, 'queue:d19', 600_000))!;
      assert.equal(claimed.attempt, 1);
      const reservation = (await credits.getReservationByKey(user.id, operation.reservation_key!))!;
      let hookRan = false;
      // The real settle runs: it finds the reservation held, then the hook releases it before the batch is sent.
      await assert.rejects(
        runners.settleSuccess(claimed, { attempt: 1, leaseOwner: 'queue:d19' }, { coverLetter: 'x', optimizedCV: { content: 'cv', changes: [] }, documentErrors: {} } as never, {
          beforeBatch: async () => {
            hookRan = true;
            await run("UPDATE credit_reservations SET status = 'released' WHERE id = ?", reservation.id);
          },
        }),
        (error: unknown) => error instanceof errors.PermanentOperationError,
      );
      assert.ok(hookRan, 'the hook ran between the pre-check and the batch');
      assert.equal((await one('SELECT generated_cv FROM application_sessions WHERE id = ?', sessionId)).generated_cv, null);
      assert.equal((await operationsOf(user.id))[0].status, 'running');
      return { rolledBack: true };
    });

    await scenario('d20. insertOperation refuses a reservation that is no longer reserved', async () => {
      const user = await seedUser('d20', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      const reserved = await credits.reserveCredits({ userId: user.id, action: 'FULL_APPLICATION', idempotencyKey: 'res-d20' });
      assert.ok(reserved.success);
      await credits.releaseReservation({ userId: user.id, idempotencyKey: 'res-d20', reason: 'gone' });
      const inserted = await ops.insertOperation({
        userId: user.id, sessionId, kind: 'generate_kit', idempotencyKey: 'key-d20', inputHash: 'h', input: {}, reservationKey: 'res-d20',
      });
      assert.equal(inserted.outcome, 'reservation_lost');
      assert.equal((await operationsOf(user.id)).length, 0);
      return { outcome: inserted.outcome };
    });

    await scenario('d21. a cached fit context for another job: the recipient never crosses jobs', async () => {
      const user = await seedUser('d21', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      const oldAd = String((await one('SELECT job_description FROM application_sessions WHERE id = ?', sessionId)).job_description);
      const agents = await import('../../src/lib/agents');
      const contextCache = await import('../../src/lib/services/context-cache');
      const fit = await agents.runFitAnalysis({ sessionId: 'fit-d21', jobDescription: oldAd, primaryCV: PRIMARY_CV }, () => {});
      assert.ok(fit.success && fit.data);
      await contextCache.cacheContext(user.id, 'ctx-d21', fit.data.context);
      // The ad is replaced after the fit, and the row now holds the NEW job's recipient.
      const applications = await import('../../src/lib/services/applications');
      const rev = Number((await one('SELECT revision FROM application_sessions WHERE id = ?', sessionId)).revision);
      await applications.updateApplicationFields(user.id, sessionId, rev, { job_description: 'Completely different ad for Other Corp. Required: Budgeting.' });
      await run("UPDATE application_sessions SET company_address = 'NEW-JOB-ADDRESS 99' WHERE id = ?", sessionId);
      await fakeReset();
      const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d21', { contextId: 'ctx-d21' });
      await deliverUntilSettled(queued.operationId);
      assert.equal((await one('SELECT status FROM agent_operations WHERE id = ?', queued.operationId)).status, 'succeeded');
      assert.ok((await fakeCalls()).find((call) => call.writer === 'coverLetter'), 'the letter was written');
      const stored = JSON.parse(String((await one('SELECT cover_letter FROM application_sessions WHERE id = ?', sessionId)).cover_letter));
      assert.ok(stored.structured, 'a structured letter was stored');
      assert.ok(!JSON.stringify(stored.structured.recipient).includes('NEW-JOB-ADDRESS'), 'the new job\'s saved recipient is not on a letter about the old job');
      const after = await one('SELECT company_address FROM application_sessions WHERE id = ?', sessionId);
      assert.equal(after.company_address, 'NEW-JOB-ADDRESS 99', 'and nothing from the old job was written over it');
      return { letterPromptChecked: true };
    });

    await scenario('d22. enqueue with a contextId: 1.5 after a paid fit, the claim race falls back to 2.0 for the loser, and the unclaimed price is 2.0', async () => {
      const user = await seedUser('d22', { monthly: 10, addon: 10 }, 3);
      const fitKey = 'fit_analysis:d22';
      const fit = await credits.reserveCredits({ userId: user.id, action: 'FIT_ANALYSIS', idempotencyKey: fitKey, metadata: { context_id: 'ctx-d22' } });
      assert.ok(fit.success);
      await credits.captureReservation({ userId: user.id, idempotencyKey: fitKey });
      const base = await balanceOf(user.id);
      // Two enqueues for the same paid fit at once: one claims the discount, the other must pay full price.
      const [a, b] = await Promise.all([
        runners.enqueueKitGeneration(user.id, user.sessionIds[0], 'key-d22-a', { contextId: 'ctx-d22' }),
        runners.enqueueKitGeneration(user.id, user.sessionIds[1], 'key-d22-b', { contextId: 'ctx-d22' }),
      ]);
      const live = (await reservationsOf(user.id)).filter((row) => row.status === 'reserved');
      assert.deepEqual(live.map((row) => Number(row.amount)).sort(), [1.5, 2.0]);
      assert.equal(base.total - (await balanceOf(user.id)).total, 3.5, 'net charge is 1.5 + 2.0 (a lost claim is refunded)');
      const lostClaims = (await ledgerOf(user.id)).filter((row) => row.transaction_type === 'reservation_released' && String(row.description).includes('fit_continuation_claim_lost'));
      assert.equal(lostClaims.length, 1, 'the loser of the claim race has a fit_continuation_claim_lost release row in the ledger');
      assert.equal(Number(lostClaims[0].amount), 1.5);
      // Run one to completion so a slot frees up; the discount stays spent for this fit.
      await deliverUntilSettled(a.operationId);
      const c = await runners.enqueueKitGeneration(user.id, user.sessionIds[2], 'key-d22-c', { contextId: 'ctx-d22' });
      const lastAmount = Number((await reservationsOf(user.id)).find((row) => String(row.idempotency_key).includes('key-d22-c'))?.amount);
      assert.equal(lastAmount, 2.0);
      return { a: a.creditsReserved, b: b.creditsReserved, c: c.creditsReserved };
    });
  }

  if (mode === 'd') {
    await scenario('d24. one generation at a time per application: a second enqueue with another key joins the first, in sequence and in a race', async () => {
      const user = await seedUser('d24', { monthly: 10, addon: 10 }, 2);
      const [sessionId, s2] = user.sessionIds;
      const base = await balanceOf(user.id);
      const first = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d24-a', {});
      const second = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d24-b', { regenerate: true });
      assert.equal(second.deduped, true);
      assert.equal(second.matchedBy, 'session');
      assert.equal(second.operationId, first.operationId);
      assert.equal((await operationsOf(user.id)).length, 1);
      assert.equal(base.total - (await balanceOf(user.id)).total, 2, 'one reservation held, nothing extra charged');
      // The atomic guard, past the pre-check: insert directly with a fresh reservation while one is live.
      const reserved = await credits.reserveCredits({ userId: user.id, action: 'FULL_APPLICATION', idempotencyKey: 'res-d24-c', sessionId });
      assert.ok(reserved.success);
      const raced = await ops.insertOperation({
        userId: user.id, sessionId, kind: 'generate_kit', idempotencyKey: 'key-d24-c', inputHash: 'another-input', input: {}, reservationKey: 'res-d24-c',
      });
      assert.equal(raced.outcome, 'existing');
      assert.equal(raced.outcome === 'existing' && raced.matchedBy, 'session');
      assert.equal((await operationsOf(user.id)).length, 1, 'the insert itself was refused');
      await credits.releaseReservation({ userId: user.id, idempotencyKey: 'res-d24-c', reason: 'test' });
      // A race between two enqueues on another application: one operation, one charge.
      const before = await balanceOf(user.id);
      const [x, y] = await Promise.all([
        runners.enqueueKitGeneration(user.id, s2, 'key-d24-x', {}),
        runners.enqueueKitGeneration(user.id, s2, 'key-d24-y', { regenerate: true }),
      ]);
      assert.equal(x.operationId, y.operationId);
      assert.equal(before.total - (await balanceOf(user.id)).total, 2, 'the loser of the race gave its reservation back');
      // After the first finishes, the application can be generated again.
      await deliverUntilSettled(first.operationId);
      const again = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d24-d', { regenerate: true });
      assert.equal(again.deduped, false);
      return { joined: second.matchedBy, raced: raced.outcome };
    });

    await scenario('d25. regenerate over a good kit when one document fails: the previous good letter stays in D1 and the failed document is refunded', async () => {
      const user = await seedUser('d25', { monthly: 10, addon: 10 });
      const [sessionId] = user.sessionIds;
      const first = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d25-1', {});
      await deliverUntilSettled(first.operationId);
      const good = await one('SELECT cover_letter, generated_cv FROM application_sessions WHERE id = ?', sessionId);
      assert.ok(good.cover_letter && good.generated_cv, 'a good kit exists');
      const before = await balanceOf(user.id);
      await control({ failWriter: 'coverLetter' });
      const second = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d25-2', { regenerate: true });
      await deliverUntilSettled(second.operationId);
      await control({ failWriter: null });
      assert.equal((await one('SELECT status FROM agent_operations WHERE id = ?', second.operationId)).status, 'succeeded');
      const after = await one('SELECT cover_letter, generated_cv FROM application_sessions WHERE id = ?', sessionId);
      assert.equal(after.cover_letter, good.cover_letter, 'the previous good letter body survives the failed regenerate');
      assert.ok(after.generated_cv);
      assert.equal(before.total - (await balanceOf(user.id)).total, 1.5, 'the failed letter is refunded: 2.0 charged, 0.5 back');
      return { letterKept: true };
    });

    await scenario('d26. a fit analysis saves what it found, with a revision bump, and keeps a title the application already has', async () => {
      const user = await seedUser('d26', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      const kit = await import('../../src/lib/services/kit');
      const revisionOf = async () => Number((await one('SELECT revision FROM application_sessions WHERE id = ?', sessionId)).revision);
      const before = await revisionOf();
      const job = { title: 'Financial Analyst', companyName: 'Northwind Foods', requiredSkills: ['Excel'], responsibilities: ['Forecasting'], niceToHaveSkills: [] } as never;
      const match = { score: 82.4, matchedRequirements: ['Excel'], missingSkills: ['SQL'] } as never;
      const written = await kit.persistFitResult(user.id, sessionId, { job, match, detectedLanguage: 'en' });
      assert.ok(written);
      assert.equal(await revisionOf(), before + 1, 'the fit columns are a content write: the revision bumps');
      const row = await one('SELECT job_title, company, requirements, match_score, matching_skills, missing_skills FROM application_sessions WHERE id = ?', sessionId);
      assert.equal(row.job_title, 'Financial Analyst');
      assert.equal(row.company, 'Northwind Foods');
      assert.equal(JSON.parse(String(row.requirements)).title, 'Financial Analyst');
      assert.equal(JSON.parse(String(row.requirements)).detectedLanguage, 'en');
      assert.equal(Number(row.match_score), 82);
      assert.deepEqual(JSON.parse(String(row.matching_skills)), ['Excel']);
      assert.deepEqual(JSON.parse(String(row.missing_skills)), ['SQL']);
      // A second analysis does not overwrite a title the application already has.
      await kit.persistFitResult(user.id, sessionId, { job: { ...(job as object), title: 'Other Title' } as never, match, detectedLanguage: 'en' });
      assert.equal((await one('SELECT job_title FROM application_sessions WHERE id = ?', sessionId)).job_title, 'Financial Analyst');
      return { revision: await revisionOf() };
    });

    await scenario('d27. the export kit loader reads through getKit: a generated kit comes back whole, a stranger gets nothing', async () => {
      const user = await seedUser('d27', { monthly: 4, addon: 6 });
      const other = await seedUser('d27-other', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      // The export reads the parsed primary CV next to the kit.
      const parsed = { personal: { fullName: 'Tomas Brandt', email: 'tomas@example.test' }, experience: [], education: [], skills: [], languages: [], certifications: [] };
      await run("UPDATE documents SET structured_data = ? WHERE user_id = ? AND type = 'primary_cv'", JSON.stringify(parsed), user.id);
      const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d27', {});
      await deliverUntilSettled(queued.operationId);
      const { loadKitFromSession } = await import('../../src/lib/services/export/kit-loader');
      const { getKit } = await import('../../src/lib/services/kit');
      const stored = await getKit(user.id, sessionId);
      const loaded = await loadKitFromSession(user.id, sessionId);
      assert.ok(loaded, 'the loader found the application');
      assert.equal(loaded.applicationId, sessionId);
      assert.equal(loaded.jobTitle, stored.jobTitle);
      assert.equal(loaded.company, stored.company);
      assert.ok(loaded.cv, 'the tailored CV is there');
      assert.ok(loaded.coverLetter && (loaded.coverLetter.structured || loaded.coverLetter.legacyText), 'the cover letter is there');
      assert.ok(loaded.emails.length >= 1, 'the application email is there');
      assert.equal(await loadKitFromSession(other.id, sessionId), null, 'another account gets nothing');
      assert.equal(await loadKitFromSession(user.id, 'no-such-application'), null);
      return { emails: loaded.emails.length };
    });

    await scenario('d23. operation housekeeping: attempt cap on claims, pending over an hour fails and releases, late enders stand down, workflow writes do not bump the revision', async () => {
      const user = await seedUser('d23', { monthly: 4, addon: 6 }, 3);
      const [s1, s2, s3] = user.sessionIds;
      // (c) a claim past the attempt cap is refused.
      const q1 = await runners.enqueueKitGeneration(user.id, s1, 'key-d23-1', {});
      await run('UPDATE agent_operations SET attempt = ? WHERE id = ?', runners.MAX_RUN_ATTEMPTS, q1.operationId);
      assert.equal(await ops.claimOperation(q1.operationId, 'queue:x', 60_000), null);
      // (a) a pending operation older than an hour is failed by the sweeper and its credits come back.
      await run('UPDATE agent_operations SET attempt = 0, created_at = ?, updated_at = ? WHERE id = ?', new Date(Date.now() - 2 * 3600_000).toISOString(), new Date(Date.now() - 2 * 3600_000).toISOString(), q1.operationId);
      const before = await balanceOf(user.id);
      const swept = await runners.recoverStuckOperations();
      assert.equal(swept.failed, 1);
      assert.equal((await one('SELECT status, error_code FROM agent_operations WHERE id = ?', q1.operationId)).error_code, 'stuck');
      assert.equal((await balanceOf(user.id)).total, before.total + 2);
      // (b) a late ender that observed "pending" cannot end an operation that has since started running.
      const q2 = await runners.enqueueKitGeneration(user.id, s2, 'key-d23-2', {});
      const observed = (await ops.getOperationById(q2.operationId))!;
      await ops.claimOperation(q2.operationId, 'queue:y', 600_000);
      const ended = await ops.finishOperationWithoutKit(observed, { status: 'failed', errorCode: 'late', reason: 'late' }, { pending: true });
      assert.equal(ended, false);
      assert.equal((await one('SELECT status FROM agent_operations WHERE id = ?', q2.operationId)).status, 'running');
      // (e) a cancelled operation's late "running" write is a no-op, and cancelling does not bump the revision.
      const revBefore = Number((await one('SELECT revision FROM application_sessions WHERE id = ?', s2)).revision);
      await ops.cancelOperation(user.id, q2.operationId);
      assert.equal(Number((await one('SELECT revision FROM application_sessions WHERE id = ?', s2)).revision), revBefore, 'workflow state: no bump');
      await ops.markSessionRunning(observed, 1, 'queue:y');
      assert.equal((await one('SELECT generation_status FROM application_sessions WHERE id = ?', s2)).generation_status, 'cancelled');
      // (f) the reservation index exists.
      const index = await one("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'agent_operations_reservation_idx'");
      assert.ok(index);
      void s3;
      return { swept };
    });
  }

  // =========================================================================
  // (e) refund atomicity
  // =========================================================================
  if (mode === 'e') {
    const POISON = sql`INSERT INTO table_that_does_not_exist (id) VALUES (1)`;

    await scenario('e1. release: a failure between the batch statements leaves nothing half done', async () => {
      const { user, reservation } = await reserve('e1', { monthly: 1, rollover: 0.5, addon: 6 }, 'key-e1');
      const reservedBalance = await balanceOf(user.id);
      const ledgerBefore = (await ledgerOf(user.id)).length;
      const statements = credits.buildReleaseReservationStatements(reservation, { reason: 'inject' });
      assert.ok(statements.length >= 3, 'a multi-statement batch');
      // Fail after the status transition and every ledger row, just before the credits move.
      const poisoned = [...statements.slice(0, -1), POISON, statements[statements.length - 1]];
      await assert.rejects(dbClient.runBatch(poisoned));
      assert.equal((await reservationsOf(user.id))[0].status, 'reserved', 'status transition rolled back');
      assert.deepEqual(await balanceOf(user.id), reservedBalance, 'credits untouched');
      assert.equal((await ledgerOf(user.id)).length, ledgerBefore, 'no ledger row');
      // The same statements without the poison apply completely.
      const results = await dbClient.runBatch(statements);
      assert.ok(results[0].meta.changes > 0);
      assert.equal((await reservationsOf(user.id))[0].status, 'released');
      const restored = await balanceOf(user.id);
      assert.equal(restored.total, reservedBalance.total + 2);
      const rows = (await ledgerOf(user.id)).filter((row) => row.transaction_type === 'reservation_released');
      assert.equal(rows.reduce((sum, row) => sum + Number(row.amount), 0), 2);
      assert.equal(restored.version, reservedBalance.version + 1, 'user_credits.version still bumps');
      return { statementsInBatch: statements.length, afterPoison: reservedBalance, afterClean: restored, ledgerRows: rows };
    });

    await scenario('e2: injecting the failure at every position rolls the whole release back', async () => {
      const outcomes: Array<{ position: number; reservation: unknown; ledgerRows: number; total: number }> = [];
      for (let position = 0; position <= 4; position++) {
        const { user, reservation } = await reserve(`e2-${position}`, { monthly: 1, rollover: 0.5, addon: 6 }, `key-e2-${position}`);
        const base = await balanceOf(user.id);
        const statements = credits.buildReleaseReservationStatements(reservation, { reason: 'inject' });
        const at = Math.min(position, statements.length);
        await assert.rejects(dbClient.runBatch([...statements.slice(0, at), POISON, ...statements.slice(at)]));
        assert.equal((await reservationsOf(user.id))[0].status, 'reserved');
        assert.deepEqual(await balanceOf(user.id), base);
        const ledgerRows = (await ledgerOf(user.id)).filter((row) => row.transaction_type === 'reservation_released').length;
        assert.equal(ledgerRows, 0);
        outcomes.push({ position: at, reservation: 'reserved', ledgerRows, total: base.total });
      }
      return { outcomes };
    });

    await scenario('e3. partial refund: a failure inside the batch loses neither the marker nor the credits', async () => {
      const { user, reservation } = await reserve('e3', { monthly: 1, rollover: 0.5, addon: 6 }, 'key-e3');
      await credits.captureReservation({ userId: user.id, idempotencyKey: 'key-e3' });
      const captured = (await credits.getReservationByKey(user.id, 'key-e3'))!;
      const base = await balanceOf(user.id);
      const plan = credits.planPartialRefund(captured, 0.5);
      const statements = credits.buildPartialRefundStatements(captured, plan, 'inject');
      await assert.rejects(dbClient.runBatch([...statements.slice(0, -1), POISON, statements[statements.length - 1]]));
      const metadata = JSON.parse(String((await reservationsOf(user.id))[0].metadata));
      assert.equal(metadata.partial_refund_at, undefined, 'marker not claimed');
      assert.deepEqual(await balanceOf(user.id), base);
      // The real function, then a replay of it, refunds exactly once.
      const first = await credits.refundReservationPartially({ userId: user.id, idempotencyKey: 'key-e3', amount: 0.5, reason: 'first' });
      const replay = await credits.refundReservationPartially({ userId: user.id, idempotencyKey: 'key-e3', amount: 0.5, reason: 'replay' });
      assert.equal(first.refunded, 0.5);
      assert.equal(replay.alreadyRefunded, true);
      assert.equal((await balanceOf(user.id)).total, base.total + 0.5);
      return { first, replay, reservation: reservation.id };
    });

    await scenario('e4. the Queue success batch is all or nothing: kit, operation, capture and refund', async () => {
      const user = await seedUser('e4', { monthly: 4, addon: 6 });
      const [sessionId] = user.sessionIds;
      const base = await balanceOf(user.id);
      const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-e4', {});
      const operation = (await ops.getOperationById(queued.operationId))!;
      const claimed = (await ops.claimOperation(queued.operationId, 'queue:e4', 600_000))!;
      assert.equal(claimed.attempt, 1);
      const kitService = await import('../../src/lib/services/kit');
      const reservation = (await credits.getReservationByKey(user.id, operation.reservation_key!))!;
      const row = (await sessionsRepo.getSession(user.id, sessionId))!;
      const now = new Date().toISOString();
      const results = {
        job: { title: 'Role', companyName: 'Acme', requiredSkills: [], niceToHaveSkills: [], responsibilities: [] },
        optimizedCV: { content: 'cv', changes: [] },
        optimizedCVData: null,
        coverLetter: 'letter',
        applicationEmail: { subject: 's', body: 'b' },
        followUpEmail: null,
        documentErrors: { followUpEmail: 'GENERATION_FAILED' as const },
      };
      const columns = kitService.kitColumnsFromResults(results, row, now);
      const guard = sql`EXISTS (SELECT 1 FROM agent_operations WHERE id = ${operation.id} AND status = 'running' AND attempt = 1 AND lease_owner = 'queue:e4')`;
      const build = () => [
        kitService.buildSessionUpdateStatement(user.id, sessionId, columns, row.revision, now, guard),
        ops.buildCompleteOperationStatement({ operationId: operation.id, attempt: 1, leaseOwner: 'queue:e4', resultRef: 'ref', now }),
        credits.buildCaptureReservationStatement(reservation, { chained: true, now }),
        ...credits.buildPartialRefundStatements(reservation, credits.planPartialRefund(reservation, 0.5), 'kit_documents_failed:followUpEmail', { chained: true, now }),
      ];
      const statements = build();
      // Kill the batch at every position, before the first statement through after the last.
      for (let position = 0; position <= statements.length; position++) {
        await assert.rejects(dbClient.runBatch([...statements.slice(0, position), POISON, ...statements.slice(position)]));
        assert.equal((await one('SELECT generated_cv FROM application_sessions WHERE id = ?', sessionId)).generated_cv, null, `kit written despite a failure at position ${position}`);
        assert.equal((await operationsOf(user.id))[0].status, 'running', `operation moved despite a failure at position ${position}`);
        assert.equal((await reservationsOf(user.id))[0].status, 'reserved', `reservation moved despite a failure at position ${position}`);
        assert.equal((await balanceOf(user.id)).total, base.total - 2, `credits moved despite a failure at position ${position}`);
      }
      const afterPoison = {
        session: await one('SELECT revision, generation_status, generated_cv FROM application_sessions WHERE id = ?', sessionId),
        operation: (await operationsOf(user.id))[0].status,
        reservation: (await reservationsOf(user.id))[0].status,
        balance: await balanceOf(user.id),
      };
      assert.equal(afterPoison.session.generated_cv, null, 'kit not written');
      assert.equal(afterPoison.operation, 'running');
      assert.equal(afterPoison.reservation, 'reserved');
      assert.equal(afterPoison.balance.total, base.total - 2, 'still held');
      const done = await dbClient.runBatch(build());
      assert.ok(done[0].meta.changes > 0);
      const final = {
        session: await one('SELECT revision, generation_status, cover_letter FROM application_sessions WHERE id = ?', sessionId),
        operation: (await operationsOf(user.id))[0].status,
        reservation: (await reservationsOf(user.id))[0].status,
        balance: await balanceOf(user.id),
      };
      assert.equal(final.session.generation_status, 'succeeded');
      assert.equal(final.operation, 'succeeded');
      assert.equal(final.reservation, 'captured');
      assert.equal(final.balance.total, base.total - 1.5);
      // A late finisher (or a replay) with the same attempt does nothing: the guard needs `running`.
      const replay = await dbClient.runBatch(build());
      assert.equal(replay[0].meta.changes, 0);
      assert.equal((await balanceOf(user.id)).total, base.total - 1.5);
      return { afterPoison, final };
    });

    await scenario('e5. the reconciler finishes a refund an old two-step run left half done, once, and leaves older rows alone', async () => {
      // Half-done release: status flipped, credits never returned (the old crash window).
      const half = await reserve('e5a', { monthly: 1, rollover: 0.5, addon: 6 }, 'key-e5a');
      const heldBalance = await balanceOf(half.user.id);
      const releasedAt = new Date().toISOString();
      await run("UPDATE credit_reservations SET status = 'released', released_at = ?, updated_at = ? WHERE id = ?", releasedAt, releasedAt, half.reservation.id);
      // Half-done partial refund: marker claimed, nothing paid.
      const partial = await reserve('e5b', { monthly: 1, rollover: 0.5, addon: 6 }, 'key-e5b');
      await credits.captureReservation({ userId: partial.user.id, idempotencyKey: 'key-e5b' });
      const partialHeld = await balanceOf(partial.user.id);
      await run(
        `UPDATE credit_reservations SET metadata = json_set(metadata, '$.partial_refund_at', ?, '$.partial_refund_amount', 0.5, '$.partial_refund_reason', 'old run') WHERE id = ?`,
        releasedAt, partial.reservation.id,
      );
      // A released row from before the reconciler's start date: must never be touched.
      const old = await reserve('e5c', { monthly: 1, rollover: 0.5, addon: 6 }, 'key-e5c');
      const oldHeld = await balanceOf(old.user.id);
      await run("UPDATE credit_reservations SET status = 'released', released_at = '2026-09-01T00:00:00.000Z', updated_at = '2026-09-01T00:00:00.000Z' WHERE id = ?", old.reservation.id);

      const first = await credits.reconcileCreditRefunds();
      assert.equal(first.releasedRepaired, 1);
      assert.equal(first.partialRepaired, 1);
      assert.equal(first.failed, 0);
      assert.equal((await balanceOf(half.user.id)).total, heldBalance.total + 2);
      assert.equal((await balanceOf(partial.user.id)).total, partialHeld.total + 0.5);
      assert.equal((await balanceOf(old.user.id)).total, oldHeld.total, 'rows before the start date are an audit, not a sweep');
      const second = await credits.reconcileCreditRefunds();
      assert.equal(second.releasedRepaired, 0);
      assert.equal(second.partialRepaired, 0);
      assert.equal((await balanceOf(half.user.id)).total, heldBalance.total + 2, 'no double refund');
      assert.equal((await balanceOf(partial.user.id)).total, partialHeld.total + 0.5);
      return { first, second };
    });

    await scenario('e6. a release racing itself refunds once', async () => {
      const { user } = await reserve('e6', { monthly: 1, rollover: 0.5, addon: 6 }, 'key-e6');
      const held = await balanceOf(user.id);
      const results = await Promise.all([
        credits.releaseReservation({ userId: user.id, idempotencyKey: 'key-e6', reason: 'a' }),
        credits.releaseReservation({ userId: user.id, idempotencyKey: 'key-e6', reason: 'b' }),
        credits.releaseReservation({ userId: user.id, idempotencyKey: 'key-e6', reason: 'c' }),
      ]);
      assert.ok(results.every((result) => result.success));
      assert.equal((await balanceOf(user.id)).total, held.total + 2);
      assert.equal((await ledgerOf(user.id)).filter((row) => row.transaction_type === 'reservation_released').reduce((sum, row) => sum + Number(row.amount), 0), 2);
      return { balanceHeld: held.total, balanceAfter: (await balanceOf(user.id)).total };
    });
  }

  if (mode === 'e') {
    /** The statements reserveCredits would run for `userId` right now, so a test can break the batch at any position. */
    async function reserveStatementsFor(userId: string, key: string, reuseReleasedId?: string) {
      const { credits: row } = await credits.getUserCredits(userId);
      assert.ok(row);
      const totalBefore = credits.getTotalCredits(row);
      // Same bucket order as the deduct: monthly, then rollover, then addon.
      let left = 2;
      const next = { monthly: row.monthly_credits, rollover: row.rollover_credits, addon: row.addon_credits };
      for (const bucket of ['monthly', 'rollover', 'addon'] as const) {
        const take = Math.min(left, next[bucket]);
        next[bucket] -= take;
        left -= take;
      }
      return credits.buildReserveStatements({
        userId,
        action: 'FULL_APPLICATION',
        amount: 2,
        credits: row,
        totalBefore,
        next,
        reservationId: crypto.randomUUID(),
        reuseReleasedId,
        idempotencyKey: key,
        generationId: null,
        sessionId: null,
        ledgerSessionId: null,
        metadataJson: JSON.stringify({ deducted_from: { monthly: 1, rollover: 0.5, addon: 0.5 } }),
        now: new Date().toISOString(),
      });
    }
    const POISON_R = sql`INSERT INTO table_that_does_not_exist (id) VALUES (1)`;

    await scenario('e7. reserve is one batch: a failure at every position leaves no deduct, no reservation, no ledger row', async () => {
      const user = await seedUser('e7', { monthly: 1, rollover: 0.5, addon: 6 });
      const base = await balanceOf(user.id);
      const statements = await reserveStatementsFor(user.id, 'key-e7');
      assert.ok(statements.length >= 3);
      for (let position = 0; position <= statements.length; position++) {
        await assert.rejects(dbClient.runBatch([...statements.slice(0, position), POISON_R, ...statements.slice(position)]));
        assert.deepEqual(await balanceOf(user.id), base, `credits moved with a failure at position ${position}`);
        assert.equal((await reservationsOf(user.id)).length, 0, `reservation written with a failure at position ${position}`);
        assert.equal((await ledgerOf(user.id)).length, 0, `ledger row written with a failure at position ${position}`);
      }
      const ok = await dbClient.runBatch(statements);
      assert.ok(ok[0].meta.changes > 0);
      const after = await balanceOf(user.id);
      assert.equal(after.total, base.total - 2);
      assert.equal(after.version, base.version + 1);
      assert.equal((await reservationsOf(user.id)).length, 1);
      const ledger = await ledgerOf(user.id);
      assert.equal(ledger.length, 1);
      assert.equal(Number(ledger[0].amount), -2);
      assert.equal(Number(ledger[0].balance_before) - Number(ledger[0].balance_after), 2);
      return { positionsTried: statements.length + 1, after };
    });

    await scenario('e8. re-reserving a released key is one batch too, and a lost reuse aborts the deduct', async () => {
      const { user, reservation } = await reserve('e8', { monthly: 1, rollover: 0.5, addon: 6 }, 'key-e8');
      await credits.releaseReservation({ userId: user.id, idempotencyKey: 'key-e8', reason: 'e8' });
      const base = await balanceOf(user.id);
      const ledgerBase = (await ledgerOf(user.id)).length;
      const statements = await reserveStatementsFor(user.id, 'key-e8', reservation.id);
      for (let position = 0; position <= statements.length; position++) {
        await assert.rejects(dbClient.runBatch([...statements.slice(0, position), POISON_R, ...statements.slice(position)]));
        assert.deepEqual(await balanceOf(user.id), base, `credits moved with a failure at position ${position}`);
        assert.equal((await reservationsOf(user.id))[0].status, 'released');
        assert.equal((await ledgerOf(user.id)).length, ledgerBase);
      }
      // Someone else reused the released row first: the guard aborts, taking the deduct with it.
      await run("UPDATE credit_reservations SET status = 'captured' WHERE id = ?", reservation.id);
      await assert.rejects(dbClient.runBatch(statements));
      assert.deepEqual(await balanceOf(user.id), base);
      await run("UPDATE credit_reservations SET status = 'released' WHERE id = ?", reservation.id);
      // The real function reuses it once.
      const again = await credits.reserveCredits({ userId: user.id, action: 'FULL_APPLICATION', idempotencyKey: 'key-e8' });
      assert.ok(again.success && again.created);
      assert.equal((await balanceOf(user.id)).total, base.total - 2);
      return { reused: again.reservation?.id === reservation.id };
    });

    await scenario('e9. reserve keeps its semantics: insufficient, in flight, spent, and one key racing itself charges once', async () => {
      const poor = await seedUser('e9a', { monthly: 1 });
      const insufficient = await credits.reserveCredits({ userId: poor.id, action: 'FULL_APPLICATION', idempotencyKey: 'key-e9a' });
      assert.equal(insufficient.success, false);
      assert.equal(insufficient.available, 1);
      assert.equal(insufficient.required, 2);
      assert.equal((await balanceOf(poor.id)).total, 1);
      assert.equal((await reservationsOf(poor.id)).length, 0);

      const user = await seedUser('e9b', { monthly: 1, rollover: 0.5, addon: 20 });
      const base = await balanceOf(user.id);
      const racers = await Promise.all(Array.from({ length: 5 }, () =>
        credits.reserveCredits({ userId: user.id, action: 'FULL_APPLICATION', idempotencyKey: 'key-e9b' })));
      assert.equal(racers.filter((result) => result.success && result.created).length, 1, 'exactly one creator');
      assert.ok(racers.filter((result) => !result.success).every((result) => result.code === 'RESERVATION_IN_FLIGHT'));
      assert.equal((await balanceOf(user.id)).total, base.total - 2, 'charged once');
      assert.equal((await ledgerOf(user.id)).filter((row) => Number(row.amount) < 0).length, 1);
      const inFlight = await credits.reserveCredits({ userId: user.id, action: 'FULL_APPLICATION', idempotencyKey: 'key-e9b' });
      assert.equal(inFlight.code, 'RESERVATION_IN_FLIGHT');
      await credits.captureReservation({ userId: user.id, idempotencyKey: 'key-e9b' });
      const spent = await credits.reserveCredits({ userId: user.id, action: 'FULL_APPLICATION', idempotencyKey: 'key-e9b' });
      assert.equal(spent.code, 'RESERVATION_SPENT');
      assert.equal((await balanceOf(user.id)).total, base.total - 2);
      // The deducted-from split on the reservation is what a later refund returns.
      const metadata = JSON.parse(String((await reservationsOf(user.id))[0].metadata));
      assert.deepEqual(metadata.deducted_from, { monthly: 1, rollover: 0.5, addon: 0.5 });
      return { racers: racers.map((result) => result.code ?? 'created'), inFlight: inFlight.code, spent: spent.code };
    });
  }

  await platform.dispose();
  const failed = report.scenarios.filter((entry) => !entry.passed);
  if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(report, null, 2));
  console.log(`__RESULT__${JSON.stringify(report)}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});

export type { Platform };
