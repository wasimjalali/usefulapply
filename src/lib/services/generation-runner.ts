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
import type { ReservationSpendLimit } from '@/db/repos/credits';
import { releaseFitContinuationClaim, releaseReservation } from '@/lib/supabase/credit-reservations';
import { isStructuredCoverLetter } from '@/lib/cover-letter/contract';
import { isSameStoredText } from '@/db/trim-text';
import { fillLetterRecipient } from './applications';
import { getCachedContext, normalizeCachedMatch, removeCachedContext } from './context-cache';
import { finalizeFeedRowForKit } from './feed/kit-finalize';
import { failUnclaimedRun, runQueuedFeedRun } from './feed/run-queue';
import {
  InsufficientCreditsError,
  InvalidInputError,
  KitAlreadyGeneratedError,
  NotFoundError,
  OperationLimitReached,
  PermanentOperationError,
  ReservationConflictError,
  SpendLimitReachedError,
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
  MAX_RUN_ATTEMPTS,
  PENDING_OPERATION_MAX_AGE_MS,
  claimOperation,
  extendOperationLease,
  markSessionRunning,
  type FinishExpectation,
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
export { MAX_RUN_ATTEMPTS } from './operations';
/** Twice the route's `maxDuration` (300 s), so a second worker never starts while the first is alive. */
export const OPERATION_LEASE_MS = 10 * 60 * 1000;
/** The runner pushes the lease out this often while the model runs. */
export const LEASE_HEARTBEAT_MS = 2 * 60 * 1000;
/** Consecutive failed heartbeats after which the runner stops and lets the lease go. */
const HEARTBEAT_FAILURES_BEFORE_STOP = 3;

// ---------------------------------------------------------------------------
// Bindings and message shapes
// ---------------------------------------------------------------------------

export interface AgentQueueBinding {
  send(message: AgentQueueMessage, options?: { delaySeconds?: number }): Promise<void>;
}
export const FEED_RUN_MESSAGE_KIND = 'job_feed_run';

/** A kit operation to run. The original message shape: no `kind`. */
export interface KitQueueMessage {
  operationId: string;
}
/** A queued job feed run (run_job_feed). The consumer claims the `queued` run row and runs the feed. */
export interface FeedRunQueueMessage {
  kind: typeof FEED_RUN_MESSAGE_KIND;
  userId: string;
  runId: string;
}
export type AgentQueueMessage = KitQueueMessage | FeedRunQueueMessage;

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

/** Put a queued job feed run on the queue. Throws when the queue is missing or the send fails; the caller owns the run row. */
export async function sendFeedRunMessage(userId: string, runId: string): Promise<void> {
  const queue = await getQueue();
  await queue.send({ kind: FEED_RUN_MESSAGE_KIND, userId, runId });
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

export interface KitGenerationInput {
  /** The fit analysis context this kit continues; earns the after-fit price when the user has paid for that fit. */
  contextId?: string | null;
  /** Replace a kit that already exists. Without it an existing kit is an error. */
  regenerate?: boolean;
  /**
   * A cap on what the caller's channel may reserve per window (the MCP daily agent limit). Part of
   * neither the operation's identity nor its hash: it only decides whether the reservation is made.
   */
  spendLimit?: ReservationSpendLimit;
}

export interface EnqueueKitResult {
  operationId: string;
  status: AgentOperation['status'];
  /** True when this call returned an operation that already existed. */
  deduped: boolean;
  /**
   * Why a deduped call returned this operation. `key`: the caller's own retry.
   * `input`: an identical request under another key. `session`: the application
   * already has a generation running, and this call JOINED it: the input of this
   * call (regenerate, contextId) was NOT used, the running operation's input
   * stands. A caller that took new input from the user (the MCP tool) should say so.
   */
  matchedBy?: 'key' | 'input' | 'session';
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
  // The fit context only decides the price and where the run starts, and the MCP tool derives it
  // from the application's stored fit (a kit that lands removes that stash). So it is stored with
  // the operation but is not part of the request's identity: a retry after the kit finished, or an
  // identical request under a fresh key, must still match the first one.
  const inputHash = await hashOperationInput({ sessionId: normalized.sessionId, regenerate: normalized.regenerate });

  const describe = (operation: AgentOperation, deduped: boolean, matchedBy?: 'key' | 'input' | 'session'): EnqueueKitResult => ({
    operationId: operation.id,
    status: operation.status,
    deduped,
    matchedBy,
    creditsReserved: 0,
    reservationKey: operation.reservation_key,
  });

  // An identical request is answered before anything is charged.
  const existing = await resolveExistingOperation({ userId, kind, idempotencyKey, inputHash, sessionId });
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
    spendLimit: input.spendLimit,
  });
  const reservation = reserved.result.reservation;
  if (!reserved.result.success) {
    if (reserved.result.code === 'SPEND_LIMIT_REACHED' && reserved.result.spendLimit) {
      throw new SpendLimitReachedError(reserved.result.spendLimit.spent, reserved.result.spendLimit.limit, reserved.cost);
    }
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

  // A reservation adopted from another enqueue of the same key belongs to that
  // enqueue's operation. Only the call that created it may give it back.
  const createdHere = reserved.result.success && reserved.result.created;
  const releaseOnAbort = async (reason: string) => {
    if (!createdHere) return;
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
  if (inserted.outcome === 'reservation_lost') {
    // Whoever created the shared reservation gave it back before our operation could hold it.
    throw new ReservationConflictError('REQUEST_IN_PROGRESS');
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
  jobDescription: string;
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
  const found = contextId ? await getCachedContext(operation.user_id, contextId) : null;
  // A fit context is only reused for the job it analysed: one cached for another ad (another application, or
  // this one before its job description changed) would write the kit for the wrong job.
  const cachedContext = found && found.jobDescription?.trim() === session.job_description.trim() ? found : null;
  if (cachedContext) normalizeCachedMatch(cachedContext);
  // A cache miss reruns the whole pipeline from the server-held CV, like the web route does.
  if (contextId && !found) console.warn('[agent-queue] context cache miss for', operation.id);
  if (found && !cachedContext) console.warn('[agent-queue] cached fit context is for another job description, not used, for', operation.id);

  // One job description for the whole run, like the web route: the cached fit
  // context's when there is one. The stored recipient only counts while the
  // row still describes that job, and the recipient fill compares the same text,
  // so a replaced ad never lends its employer to a letter about another job.
  const runJobDescription = cachedContext?.jobDescription ?? session.job_description;
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
    letterRecipient: isSameStoredText(session.job_description, runJobDescription)
      ? {
          companyName: session.company,
          address: session.company_address,
          contactPerson: session.company_contact_person,
        }
      : undefined,
    emit: () => {},
    generationContext,
  });
  return { results, jobDescription: runJobDescription, usedContextId: cachedContext ? contextId : null };
}

async function stillOwns(operationId: string, claimed: { attempt: number; leaseOwner: string }): Promise<boolean> {
  const current = await getOperationById(operationId);
  return Boolean(current && current.status === 'running' && current.attempt === claimed.attempt && current.lease_owner === claimed.leaseOwner);
}

/**
 * Finish a successful run in one batch. Returns 'done', or 'lost' when this
 * attempt no longer owns the operation (cancelled, taken over).
 *
 * No capture, no kit. A reservation that is no longer held (released by
 * someone else, never made) fails the operation instead of delivering a free
 * kit. The batch is the kit write, the operation completion, the capture and
 * the per-document refund; a final guard aborts it, rolling the kit and the
 * completion back, if the operation completed without this batch capturing.
 */
/** Seams for the scenarios that need to act between the steps of a settle. Production passes none. */
export interface SettleHooks {
  /** Runs after the reservation was found held and before the batch. */
  beforeBatch?: () => Promise<void>;
}

export async function settleSuccess(
  operation: AgentOperation,
  claimed: { attempt: number; leaseOwner: string },
  results: KitResults,
  hooks: SettleHooks = {},
): Promise<'done' | 'lost'> {
  const sessionId = operation.session_id as string;
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await sessionsRepo.getSession(operation.user_id, sessionId);
    if (!row) throw new PermanentOperationError('session_missing');
    const reservation = operation.reservation_key
      ? await getReservationByKey(operation.user_id, operation.reservation_key)
      : null;
    if (operation.reservation_key && reservation?.status !== 'reserved') {
      // A cancel releases the reservation too: if we no longer own the operation, stand down quietly.
      if (!(await stillOwns(operation.id, claimed))) return 'lost';
      throw new PermanentOperationError('reservation_not_held', `reservation is ${reservation?.status ?? 'missing'}`);
    }
    const now = nowIso();
    const columns = kitColumnsFromResults(results, row, now);
    const resultRef = `application:${sessionId}#rev${row.revision + 1}`;
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
        resultRef,
        now,
      }),
    ];
    if (reservation) {
      statements.push(buildCaptureReservationStatement(reservation, { chained: true, now }));
      statements.push(sql`
        SELECT json(CASE
          WHEN EXISTS (SELECT 1 FROM agent_operations WHERE id = ${operation.id} AND status = 'succeeded' AND result_ref = ${resultRef})
           AND NOT EXISTS (SELECT 1 FROM credit_reservations WHERE id = ${reservation.id} AND status = 'captured' AND captured_at = ${now})
          THEN 'completed without a capture' ELSE '{}' END)
      `);
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
    await hooks.beforeBatch?.();
    let batch;
    try {
      batch = await runBatch(statements);
    } catch (error) {
      // The guard aborted: the reservation is not ours to capture any more. Nothing was written.
      const held = operation.reservation_key
        ? await getReservationByKey(operation.user_id, operation.reservation_key)
        : null;
      if (operation.reservation_key && held?.status !== 'reserved') {
        if (!(await stillOwns(operation.id, claimed))) return 'lost';
        throw new PermanentOperationError('reservation_not_held', `reservation is ${held?.status ?? 'missing'}`);
      }
      throw error;
    }
    if (batch[0].meta.changes > 0) return 'done';
    // Nothing was written. Either this attempt lost the operation, or a user
    // edit moved the revision under us. Look, then retry or stand down.
    if (!(await stillOwns(operation.id, claimed))) return 'lost';
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
  let failedBeats = 0;
  const heartbeat = setInterval(() => {
    extendOperationLease(operationId, leaseOwner, claimed.attempt, OPERATION_LEASE_MS)
      .then((ok) => {
        failedBeats = 0;
        if (!ok) leaseLost = true;
      })
      .catch((error) => {
        // A lease that could not be extended for several beats in a row is
        // about to expire under us: stop before another worker takes over.
        failedBeats += 1;
        console.error('[agent-queue] heartbeat failed for', operationId, failedBeats, error);
        if (failedBeats >= HEARTBEAT_FAILURES_BEFORE_STOP) leaseLost = true;
      });
  }, LEASE_HEARTBEAT_MS);

  try {
    await markSessionRunning(claimedRow, claimed.attempt, leaseOwner);
    const generated = await generateKit(claimedRow);
    if (leaseLost) return { outcome: 'dropped', reason: 'lease_lost' };
    const settled = await settleSuccess(claimedRow, claimed, generated.results);
    if (settled === 'lost') return { outcome: 'dropped', reason: 'lost_to_cancel_or_takeover' };
    // Outside the settle batch: the kit and its charge are already stored, and a feed row that
    // cannot be updated is logged, not rolled back.
    await finalizeFeedRowForKit(claimedRow, 'succeeded');
    // The letter's recipient from the ad goes onto the row (fill-only, bumps the revision).
    if (isStructuredCoverLetter(generated.results.coverLetterStructured)) {
      await fillLetterRecipient(claimedRow.user_id, claimedRow.session_id as string, generated.jobDescription, generated.results.coverLetterStructured).catch((error) => {
        console.error('[agent-queue] could not save the cover letter recipient:', error);
      });
    }
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
  expect?: FinishExpectation,
): Promise<void> {
  await finishOperationWithoutKit(operation, { status: 'failed', errorCode, reason }, expect);
}

// ---------------------------------------------------------------------------
// Consumer
// ---------------------------------------------------------------------------

/** What a queue message asks for. Anything that is not exactly one of the two known shapes is `null`. */
type ParsedMessage =
  | { type: 'kit'; operationId: string }
  | { type: 'feed_run'; userId: string; runId: string };

const ID_MAX_LENGTH = 100;
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= ID_MAX_LENGTH;

function parseMessage(body: unknown): ParsedMessage | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if ('kind' in record) {
    // A feed run message carries exactly these three fields and nothing else.
    const keys = Object.keys(record);
    if (record.kind === FEED_RUN_MESSAGE_KIND && keys.length === 3 && isId(record.userId) && isId(record.runId)) {
      return { type: 'feed_run', userId: record.userId, runId: record.runId };
    }
    return null;
  }
  return isId(record.operationId) ? { type: 'kit', operationId: record.operationId } : null;
}

/** A message that landed in the dead-letter queue: the operation will never be retried by the queue. */
async function handleDeadLetter(operationId: string): Promise<void> {
  const operation = await getOperationById(operationId);
  console.error('[agent-queue] dead-letter message for operation', operationId, operation ? `status=${operation.status}` : 'unknown');
  if (!operation) return;
  if (operation.status !== 'pending' && operation.status !== 'running') return;
  // A live lease means a worker is still on it; the sweeper deals with it if it dies.
  if (operation.status === 'running' && operation.lease_expires_at && operation.lease_expires_at > nowIso()) return;
  // End it only if it is still in the state we just looked at.
  const observed: FinishExpectation = operation.status === 'pending'
    ? { pending: true }
    : { attempt: operation.attempt, leaseOwner: operation.lease_owner };
  await finishFailed(operation, 'dead_lettered', 'the queue gave up delivering the message', observed);
}

/** The `queue()` handler body, for both the main queue and its dead-letter queue. */
export async function handleAgentQueueBatch(batch: MessageBatchLike): Promise<void> {
  for (const message of batch.messages) {
    try {
      const parsed = parseMessage(message.body);
      if (!parsed) {
        console.error('[agent-queue] dropping a message of an unknown shape');
        message.ack();
        continue;
      }
      if (parsed.type === 'feed_run') {
        if (batch.queue === AGENT_DLQ_NAME) {
          console.error('[agent-queue] dead-letter message for job feed run', parsed.runId);
          await failUnclaimedRun(parsed.userId, parsed.runId);
          message.ack();
          continue;
        }
        const outcome = await runQueuedFeedRun({
          userId: parsed.userId,
          runId: parsed.runId,
          attempt: message.attempts,
          maxAttempts: QUEUE_MAX_RETRIES + 1,
        });
        if (outcome.outcome === 'retry') message.retry({ delaySeconds: retryDelaySeconds(message.attempts) });
        else message.ack();
        continue;
      }
      if (batch.queue === AGENT_DLQ_NAME) {
        await handleDeadLetter(parsed.operationId);
        message.ack();
        continue;
      }
      const outcome = await runKitOperation(parsed.operationId);
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
      const observed: FinishExpectation = operation.status === 'pending'
        ? { pending: true }
        : { attempt: operation.attempt, leaseOwner: operation.lease_owner };
      if (operation.kind !== OPERATION_KINDS.generateKit) {
        // An operation that runs inside its tool call has no queue message to re-send. One that is
        // still unfinished past its lease lost its worker: end it and give the credits back.
        await finishFailed(operation, 'abandoned', 'the worker running the operation went away', observed);
        result.failed += 1;
      } else if (operation.status === 'pending' && Date.parse(operation.created_at) < Date.now() - PENDING_OPERATION_MAX_AGE_MS) {
        // Its message never produced a run for over an hour: give the credits back.
        await finishFailed(operation, 'stuck', 'the operation sat pending for over an hour', observed);
        result.failed += 1;
      } else if (operation.attempt >= MAX_RUN_ATTEMPTS) {
        await finishFailed(operation, 'stuck', 'the operation used all its attempts without finishing', observed);
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
