/**
 * Queued kit generation: enqueue, run, recover.
 *
 * Flow (docs/agent-integration/PLAN.md, 3.4):
 *
 *   enqueueKitGeneration
 *     1. an identical request (same key, or same input inside ten minutes)
 *        returns the operation it already created, charging nothing more;
 *     2. otherwise reserve credits, insert the operation (at most two live per
 *        user), mark the application's generation_status 'pending', and send
 *        a queue message that carries only the operation id.
 *
 *   runKitOperation (the Queue consumer)
 *     1. load the operation by id and claim its lease with a conditional UPDATE;
 *        a claim that matches no row means another worker holds it or it is
 *        finished, and the message is dropped without running the model;
 *     2. run the same pipeline the web route runs (kit-generation.ts);
 *     3. finish in ONE D1 batch: the kit (canonical columns, generated_artifacts,
 *        generation_status, revision), the operation's status, the reservation
 *        capture and, for a partly failed kit, the per-document refund. The kit
 *        write is guarded on this operation still being the running attempt that
 *        owns the lease, so a late finisher cannot overwrite a cancel, and a
 *        cancel or a takeover makes the whole batch a no-op;
 *     4. on a failure that will not retry, release the reservation, fail the
 *        operation and the application's generation_status, again in one batch.
 *
 *   recoverStuckOperations (cron): re-sends a lost message, or fails an
 *   operation that has used its attempts and releases its credits.
 *
 * The queue's own retry (3 retries, then the dead-letter queue) is the first
 * line of defence; the lease and the sweeper cover a Worker that dies without
 * telling anyone.
 */

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { sql, type SQL } from 'drizzle-orm';
import { nowIso, runBatch } from '@/db/client';
import * as sessionsRepo from '@/db/repos/sessions';
import {
  buildCaptureReservationStatement,
  buildPartialRefundStatements,
  getReservationByKey,
  planPartialRefund,
} from '@/db/repos/credits';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import { releaseFitContinuationClaim, releaseReservation } from '@/lib/supabase/credit-reservations';
import { getCachedContext, normalizeCachedMatch, removeCachedContext } from './context-cache';
import {
  InsufficientCreditsError,
  InvalidInputError,
  KitAlreadyGeneratedError,
  NotFoundError,
  OperationLimitReached,
  PermanentOperationError,
  ReservationConflictError,
} from './errors';
import { buildSessionUpdateStatement, kitColumnsFromResults, kitFromRow, type KitResults } from './kit';
import {
  kitFailureRefund,
  loadJobPreferences,
  loadOwnedCvSources,
  reserveKitCredits,
  runKitPipeline,
} from './kit-generation';
import {
  MAX_ACTIVE_OPERATIONS_PER_USER,
  OPERATION_KINDS,
  buildCompleteOperationStatement,
  claimOperation,
  extendOperationLease,
  finishOperationWithoutKit,
  getOperationById,
  hashOperationInput,
  insertOperation,
  listStuckOperations,
  releaseOperationLease,
  resolveExistingOperation,
  type AgentOperation,
} from './operations';

export const AGENT_QUEUE_NAME = 'agent-generation';
export const AGENT_DLQ_NAME = 'agent-generation-dlq';
/** Matches `max_retries` in wrangler.jsonc: one delivery plus three retries. */
export const QUEUE_MAX_RETRIES = 3;
export const MAX_RUN_ATTEMPTS = QUEUE_MAX_RETRIES + 1;
/** Twice the route's `maxDuration` (300 s), so a second worker never starts while the first is alive. */
export const OPERATION_LEASE_MS = 10 * 60 * 1000;
/** The runner pushes the lease out this often while the model runs. */
export const LEASE_HEARTBEAT_MS = 2 * 60 * 1000;

// ---------------------------------------------------------------------------
// Bindings and message shapes
// ---------------------------------------------------------------------------

export interface AgentQueueBinding {
  send(message: AgentQueueMessage, options?: { delaySeconds?: number }): Promise<void>;
}
export interface AgentQueueMessage {
  operationId: string;
}

declare global {
  interface CloudflareEnv {
    AGENT_GENERATION_QUEUE?: AgentQueueBinding;
  }
}

/** The slice of a Workers Queue message the consumer uses. */
export interface QueueMessageLike {
  id?: string;
  body: unknown;
  attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}
export interface MessageBatchLike {
  queue: string;
  messages: readonly QueueMessageLike[];
}

async function getQueue(): Promise<AgentQueueBinding> {
  const { env } = await getCloudflareContext({ async: true });
  const queue = env.AGENT_GENERATION_QUEUE;
  if (!queue) {
    throw new Error('[agent-queue] AGENT_GENERATION_QUEUE is not bound. Add the queue to wrangler.jsonc and run through wrangler.');
  }
  return queue;
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

export interface KitGenerationInput {
  /** The fit analysis context this kit continues; earns the after-fit price when the user has paid for that fit. */
  contextId?: string | null;
  /** Replace a kit that already exists. Without it an existing kit is an error. */
  regenerate?: boolean;
}

export interface EnqueueKitResult {
  operationId: string;
  status: AgentOperation['status'];
  /** True when this call returned an operation that already existed. */
  deduped: boolean;
  matchedBy?: 'key' | 'input';
  creditsReserved: number;
  reservationKey: string | null;
}

export async function enqueueKitGeneration(
  userId: string,
  sessionId: string,
  idempotencyKey: string,
  input: KitGenerationInput = {},
): Promise<EnqueueKitResult> {
  if (!idempotencyKey || idempotencyKey.length > 200) {
    throw new InvalidInputError('An idempotency key of 1 to 200 characters is required');
  }
  const queue = await getQueue();
  const row = await sessionsRepo.getSession(userId, sessionId);
  if (!row) throw new NotFoundError();

  const normalized = {
    sessionId,
    contextId: input.contextId ?? null,
    regenerate: Boolean(input.regenerate),
  };
  const kind = OPERATION_KINDS.generateKit;
  const inputHash = await hashOperationInput(normalized);

  const describe = (operation: AgentOperation, deduped: boolean, matchedBy?: 'key' | 'input'): EnqueueKitResult => ({
    operationId: operation.id,
    status: operation.status,
    deduped,
    matchedBy,
    creditsReserved: 0,
    reservationKey: operation.reservation_key,
  });

  // An identical request is answered before anything is charged.
  const existing = await resolveExistingOperation({ userId, kind, idempotencyKey, inputHash });
  if (existing) {
    // The first attempt may have died between the insert and the send. Sending
    // again is safe: a second delivery fails to claim and is dropped.
    if (existing.operation.status === 'pending') await queue.send({ operationId: existing.operation.id });
    return describe(existing.operation, true, existing.matchedBy);
  }

  if (!normalized.regenerate && kitFromRow(row).hasKit) throw new KitAlreadyGeneratedError();

  let heldKey: string | null = null;
  const reserved = await reserveKitCredits({
    userId,
    sessionId,
    contextId: normalized.contextId,
    requestId: idempotencyKey,
    keyFor: (action) => `generate_kit:${userId}:${sessionId}:${action}:${idempotencyKey}`,
    onReservation: (key) => { heldKey = key; },
  });
  const reservation = reserved.result.reservation;
  if (!reserved.result.success) {
    // A reservation under this very key with no operation is a first attempt
    // that died between reserving and inserting. It is ours: adopt it.
    if (reserved.result.code === 'RESERVATION_IN_FLIGHT' && reservation?.status === 'reserved') {
      heldKey = reserved.key;
    } else if (reserved.result.code === 'RESERVATION_IN_FLIGHT') {
      throw new ReservationConflictError('REQUEST_IN_PROGRESS');
    } else if (reserved.result.code === 'RESERVATION_SPENT') {
      throw new ReservationConflictError('REQUEST_ALREADY_COMPLETED');
    } else {
      throw new InsufficientCreditsError(reserved.result.required ?? reserved.cost, reserved.result.available ?? 0);
    }
  }
  if (!reservation) throw new Error('Reservation missing after reserve');
  const reservationKey = heldKey ?? reserved.key;

  const releaseOnAbort = async (reason: string) => {
    await releaseReservation({ userId, idempotencyKey: reservationKey, reason });
    if (reserved.continuation) {
      await releaseFitContinuationClaim(userId, reserved.continuation.contextId, reserved.continuation.requestId);
    }
  };

  let inserted;
  try {
    inserted = await insertOperation({
      userId,
      sessionId,
      kind,
      idempotencyKey,
      inputHash,
      input: normalized,
      reservationKey,
    });
  } catch (error) {
    await releaseOnAbort('operation_insert_failed');
    throw error;
  }
  if (inserted.outcome === 'limit') {
    await releaseOnAbort('operation_limit_reached');
    throw new OperationLimitReached(MAX_ACTIVE_OPERATIONS_PER_USER);
  }
  if (inserted.outcome === 'existing') {
    // Lost a race to an identical request. If it holds a different reservation,
    // ours is surplus.
    if (inserted.operation.reservation_key !== reservationKey) await releaseOnAbort('duplicate_operation');
    if (inserted.operation.status === 'pending') await queue.send({ operationId: inserted.operation.id });
    return describe(inserted.operation, true, inserted.matchedBy);
  }

  const operation = inserted.operation;
  await sessionsRepo.updateSession(userId, sessionId, {
    generation_status: 'pending',
    generation_completed: false,
    generation_error: null,
  }, { bumpRevision: false });

  try {
    await queue.send({ operationId: operation.id });
  } catch (error) {
    console.error('[agent-queue] could not send the message for', operation.id, error);
    await finishOperationWithoutKit(operation, { status: 'failed', errorCode: 'enqueue_failed', reason: 'queue send failed' });
    throw error;
  }
  return {
    operationId: operation.id,
    status: operation.status,
    deduped: false,
    creditsReserved: reserved.cost,
    reservationKey,
  };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export type RunOutcome =
  | { outcome: 'succeeded' }
  /** Nothing to do: unknown id, already finished, or another worker holds the lease. */
  | { outcome: 'dropped'; reason: string }
  | { outcome: 'retry'; delaySeconds: number }
  | { outcome: 'failed'; errorCode: string };

function retryDelaySeconds(attempt: number): number {
  return Math.min(30 * 2 ** Math.max(0, attempt - 1), 300);
}

interface GeneratedKit {
  results: KitResults;
  usedContextId: string | null;
}

async function generateKit(operation: AgentOperation): Promise<GeneratedKit> {
  if (!operation.session_id) throw new PermanentOperationError('session_missing');
  const session = await sessionsRepo.getSession(operation.user_id, operation.session_id);
  if (!session) throw new PermanentOperationError('session_missing');
  if (!session.job_description?.trim()) throw new PermanentOperationError('no_job_description');

  const sources = await loadOwnedCvSources(operation.user_id);
  if (!sources.primaryCV) throw new PermanentOperationError('no_cv');

  const contextId = typeof operation.input.contextId === 'string' ? operation.input.contextId : null;
  const cachedContext = contextId ? await getCachedContext(operation.user_id, contextId) : null;
  if (cachedContext) normalizeCachedMatch(cachedContext);
  // A cache miss reruns the whole pipeline from the server-held CV, like the web route does.
  if (contextId && !cachedContext) console.warn('[agent-queue] context cache miss for', operation.id);

  const generationContext: LlmGenerationContext = {
    requestExecutionId: crypto.randomUUID(),
    clientRequestId: operation.idempotency_key,
    userId: operation.user_id,
    applicationSessionId: operation.session_id,
    route: 'queue:agent-generation',
    feature: 'application_generation',
    operation: cachedContext ? 'generate_with_context' : 'full_optimization',
  };
  const { results } = await runKitPipeline({
    sessionId: operation.session_id,
    jobDescription: session.job_description,
    primaryCV: sources.primaryCV,
    masterCV: sources.masterCV,
    jobPreferences: await loadJobPreferences(operation.user_id),
    cachedContext,
    emit: () => {},
    generationContext,
  });
  return { results, usedContextId: cachedContext ? contextId : null };
}

/**
 * Finish a successful run in one batch. Returns 'done', or 'lost' when this
 * attempt no longer owns the operation (cancelled, taken over).
 */
async function settleSuccess(
  operation: AgentOperation,
  claimed: { attempt: number; leaseOwner: string },
  results: KitResults,
): Promise<'done' | 'lost'> {
  const sessionId = operation.session_id as string;
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await sessionsRepo.getSession(operation.user_id, sessionId);
    if (!row) throw new PermanentOperationError('session_missing');
    const reservation = operation.reservation_key
      ? await getReservationByKey(operation.user_id, operation.reservation_key)
      : null;
    const now = nowIso();
    const columns = kitColumnsFromResults(results, row, now);
    const guard = sql`EXISTS (
      SELECT 1 FROM agent_operations
      WHERE id = ${operation.id} AND status = 'running' AND attempt = ${claimed.attempt} AND lease_owner = ${claimed.leaseOwner}
    )`;
    const statements: SQL[] = [
      buildSessionUpdateStatement(operation.user_id, sessionId, columns, row.revision, now, guard),
      buildCompleteOperationStatement({
        operationId: operation.id,
        attempt: claimed.attempt,
        leaseOwner: claimed.leaseOwner,
        resultRef: `application:${sessionId}#rev${row.revision + 1}`,
        now,
      }),
    ];
    if (reservation && reservation.status === 'reserved') {
      statements.push(buildCaptureReservationStatement(reservation, { chained: true, now }));
      const { failed, amount } = kitFailureRefund(results.documentErrors ?? {});
      if (failed.length > 0 && amount > 0) {
        statements.push(...buildPartialRefundStatements(
          reservation,
          planPartialRefund(reservation, amount),
          `kit_documents_failed:${failed.join(',')}`,
          { chained: true, now },
        ));
      }
    }
    const batch = await runBatch(statements);
    if (batch[0].meta.changes > 0) return 'done';
    // Nothing was written. Either this attempt lost the operation, or a user
    // edit moved the revision under us. Look, then retry or stand down.
    const current = await getOperationById(operation.id);
    if (!current || current.status !== 'running' || current.attempt !== claimed.attempt || current.lease_owner !== claimed.leaseOwner) {
      return 'lost';
    }
  }
  throw new Error('Could not settle the kit after repeated revision conflicts');
}

/**
 * Run one operation. Safe to call for any delivery of any message: a stale,
 * duplicate or late one finds nothing to claim and returns `dropped`.
 */
export async function runKitOperation(operationId: string): Promise<RunOutcome> {
  const operation = await getOperationById(operationId);
  if (!operation) return { outcome: 'dropped', reason: 'unknown_operation' };
  if (operation.status !== 'pending' && operation.status !== 'running') {
    return { outcome: 'dropped', reason: `already_${operation.status}` };
  }
  const leaseOwner = `queue:${crypto.randomUUID()}`;
  const claimedRow = await claimOperation(operationId, leaseOwner, OPERATION_LEASE_MS);
  if (!claimedRow) return { outcome: 'dropped', reason: 'lease_held' };
  const claimed = { attempt: claimedRow.attempt, leaseOwner };

  let leaseLost = false;
  const heartbeat = setInterval(() => {
    extendOperationLease(operationId, leaseOwner, claimed.attempt, OPERATION_LEASE_MS)
      .then((ok) => { if (!ok) leaseLost = true; })
      .catch((error) => console.error('[agent-queue] heartbeat failed for', operationId, error));
  }, LEASE_HEARTBEAT_MS);

  try {
    if (claimedRow.session_id) {
      await sessionsRepo.updateSession(claimedRow.user_id, claimedRow.session_id, {
        generation_status: 'running',
        generation_started_at: nowIso(),
        generation_error: null,
        generation_completed: false,
      }, { bumpRevision: false });
    }
    const generated = await generateKit(claimedRow);
    if (leaseLost) return { outcome: 'dropped', reason: 'lease_lost' };
    const settled = await settleSuccess(claimedRow, claimed, generated.results);
    if (settled === 'lost') return { outcome: 'dropped', reason: 'lost_to_cancel_or_takeover' };
    if (generated.usedContextId) {
      await removeCachedContext(claimedRow.user_id, generated.usedContextId).catch((error) => {
        console.error('[agent-queue] could not remove the used context:', error);
      });
    }
    return { outcome: 'succeeded' };
  } catch (error) {
    const permanent = error instanceof PermanentOperationError || error instanceof NotFoundError;
    const code = error instanceof PermanentOperationError ? error.code : error instanceof NotFoundError ? 'session_missing' : 'generation_failed';
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[agent-queue] operation ${operationId} attempt ${claimed.attempt} failed:`, message);
    if (!permanent && claimed.attempt < MAX_RUN_ATTEMPTS) {
      // Hand the lease back so the redelivery can claim at once.
      await releaseOperationLease(operationId, leaseOwner, claimed.attempt);
      return { outcome: 'retry', delaySeconds: retryDelaySeconds(claimed.attempt) };
    }
    await finishFailed(claimedRow, code, message, claimed);
    return { outcome: 'failed', errorCode: code };
  } finally {
    clearInterval(heartbeat);
  }
}

async function finishFailed(
  operation: AgentOperation,
  errorCode: string,
  reason: string,
  expect?: { attempt: number; leaseOwner: string },
): Promise<void> {
  await finishOperationWithoutKit(operation, { status: 'failed', errorCode, reason }, expect);
}

// ---------------------------------------------------------------------------
// Consumer
// ---------------------------------------------------------------------------

function operationIdFrom(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const id = (body as { operationId?: unknown }).operationId;
  return typeof id === 'string' && id.length > 0 && id.length <= 100 ? id : null;
}

/** A message that landed in the dead-letter queue: the operation will never be retried by the queue. */
async function handleDeadLetter(operationId: string): Promise<void> {
  const operation = await getOperationById(operationId);
  console.error('[agent-queue] dead-letter message for operation', operationId, operation ? `status=${operation.status}` : 'unknown');
  if (!operation) return;
  if (operation.status !== 'pending' && operation.status !== 'running') return;
  // A live lease means a worker is still on it; the sweeper deals with it if it dies.
  if (operation.status === 'running' && operation.lease_expires_at && operation.lease_expires_at > nowIso()) return;
  await finishFailed(operation, 'dead_lettered', 'the queue gave up delivering the message');
}

/** The `queue()` handler body, for both the main queue and its dead-letter queue. */
export async function handleAgentQueueBatch(batch: MessageBatchLike): Promise<void> {
  for (const message of batch.messages) {
    try {
      const operationId = operationIdFrom(message.body);
      if (!operationId) {
        console.error('[agent-queue] dropping a message without an operation id');
        message.ack();
        continue;
      }
      if (batch.queue === AGENT_DLQ_NAME) {
        await handleDeadLetter(operationId);
        message.ack();
        continue;
      }
      const outcome = await runKitOperation(operationId);
      if (outcome.outcome === 'retry') message.retry({ delaySeconds: outcome.delaySeconds });
      else message.ack();
    } catch (error) {
      // An unexpected infrastructure error (D1 down). Let the queue retry; after
      // the last retry the message reaches the dead-letter queue.
      console.error('[agent-queue] unexpected error handling a message:', error);
      message.retry({ delaySeconds: 30 });
    }
  }
}

// ---------------------------------------------------------------------------
// Sweeper
// ---------------------------------------------------------------------------

export interface RecoverResult {
  resent: number;
  failed: number;
}

/**
 * Cron pass for operations nobody is working on: a pending one whose message
 * was lost, a running one whose worker died. Under the attempt limit it sends
 * the message again; past it, it fails the operation and releases the credits.
 */
export async function recoverStuckOperations(options: { limit?: number } = {}): Promise<RecoverResult> {
  const stuck = await listStuckOperations({
    pendingOlderThanMs: 10 * 60 * 1000,
    expiredLeaseOlderThanMs: 2 * 60 * 1000,
    limit: options.limit ?? 25,
  });
  const result: RecoverResult = { resent: 0, failed: 0 };
  if (stuck.length === 0) return result;
  const queue = await getQueue();
  for (const operation of stuck) {
    try {
      if (operation.attempt >= MAX_RUN_ATTEMPTS) {
        await finishFailed(operation, 'stuck', 'the operation used all its attempts without finishing');
        result.failed += 1;
      } else {
        // Touch first so the next pass does not send it again while it is queued.
        await touchOperation(operation);
        await queue.send({ operationId: operation.id });
        result.resent += 1;
      }
    } catch (error) {
      console.error('[agent-queue] could not recover operation', operation.id, error);
    }
  }
  return result;
}

async function touchOperation(operation: AgentOperation): Promise<void> {
  await runBatch([sql`
    UPDATE agent_operations
    SET updated_at = ${nowIso()}
    WHERE id = ${operation.id} AND status = ${operation.status}
  `]);
}
