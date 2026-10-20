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
      const first = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d1', {});
      const second = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d1', {});
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
      const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-d5', {});
      const settled = await deliverUntilSettled(queued.operationId);
      assert.equal(settled.deadLettered, false);
      assert.equal(settled.deliveries.length, 1);
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

  // =========================================================================
  // (e) refund atomicity
  // =========================================================================
  if (mode === 'e') {
    /** A reservation of `amount` on a fresh user, via the real reserveCredits. */
    async function reserve(label: string, balance: { monthly: number; rollover?: number; addon?: number }, key: string) {
      const user = await seedUser(label, balance);
      const result = await credits.reserveCredits({ userId: user.id, action: 'FULL_APPLICATION', idempotencyKey: key, sessionId: user.sessionIds[0] });
      assert.ok(result.success && result.reservation, 'reserved');
      return { user, reservation: result.reservation as import('../../src/db/repos/credits').CreditReservation };
    }
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
