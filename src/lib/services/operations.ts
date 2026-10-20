/**
 * Agent operations: idempotent, leased units of background work.
 *
 * One row in `agent_operations` is one logical request (today: generate the
 * kit for one application). The pieces:
 *
 * - Idempotency. `(user_id, kind, idempotency_key)` is unique. The same key
 *   with the same input hands back the same operation; the same key with
 *   different input is a typed error. An identical request under a fresh key
 *   (a client that retries with a new UUID) is caught by the input hash:
 *   a live operation, or one that finished in the last ten minutes, is
 *   returned instead of charging again.
 * - Lease. The Queue consumer claims an operation with a conditional UPDATE.
 *   A claim that affects no row means another worker holds it (or it is
 *   finished), and the message is dropped without running the model. The
 *   lease is the same pattern as job_feed_application_generations.
 * - One success path. The runner finishes an operation in a single D1 batch
 *   (see generation-runner.ts); the helpers here build the operation and
 *   failure halves of those batches.
 *
 * Every function that takes a `userId` filters by it. The runner, which starts
 * from an operation id carried by a queue message, loads the row by id and
 * then scopes everything else by the `user_id` on that row.
 */

import { and, eq, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { getDb, isUniqueViolation, nowIso, runBatch } from '@/db/client';
import { agentOperations } from '@/db/schema';
import { buildReleaseReservationStatements, getReservationByKey, releaseFitContinuationClaim } from '@/db/repos/credits';
import { IdempotencyKeyMismatch, NotFoundError } from './errors';
import { finalizeFeedRowForKit } from './feed/kit-finalize';

export const OPERATION_KINDS = {
  /** Queued: runs in the Queue consumer, finished by the runner's atomic batch. */
  generateKit: 'generate_kit',
  /** The kinds below run inside the tool call itself (inline-operations.ts); the queue never sees them. */
  analyzeFit: 'analyze_fit',
  regenerateDocument: 'regenerate_document',
  rewriteCvSection: 'rewrite_cv_section',
  draftScreeningAnswers: 'draft_screening_answers',
} as const;
export type OperationKind = (typeof OPERATION_KINDS)[keyof typeof OPERATION_KINDS];

export type OperationStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface AgentOperation {
  id: string;
  user_id: string;
  session_id: string | null;
  kind: string;
  idempotency_key: string;
  input_hash: string;
  input: Record<string, unknown>;
  status: OperationStatus;
  result_ref: string | null;
  /** The JSON result of an operation that ran inline in its tool call. Null for queued kits (see result_ref). */
  result: Record<string, unknown> | null;
  reservation_key: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  attempt: number;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

/** One claim per delivery: the first run plus three retries (matches `max_retries` in wrangler.jsonc). */
export const MAX_RUN_ATTEMPTS = 4;
/** A pending operation older than this has lost its message for good. */
export const PENDING_OPERATION_MAX_AGE_MS = 60 * 60 * 1000;
/** At most this many pending or running operations of one kind per user. */
export const MAX_ACTIVE_OPERATIONS_PER_USER = 2;
/** An identical request inside this window is the same request. */
export const OPERATION_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

/** SHA-256 of the input with keys sorted, so key order never changes the hash. */
export async function hashOperationInput(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(input));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getOperation(userId: string, operationId: string): Promise<AgentOperation | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(agentOperations)
    .where(and(eq(agentOperations.id, operationId), eq(agentOperations.user_id, userId)))
    .limit(1);
  return (rows[0] as AgentOperation | undefined) ?? null;
}

/**
 * Load by id alone. Only for the Queue runner: the message carries nothing but
 * the id, and the row's own `user_id` then scopes every later query.
 */
export async function getOperationById(operationId: string): Promise<AgentOperation | null> {
  const db = await getDb();
  const rows = await db.select().from(agentOperations).where(eq(agentOperations.id, operationId)).limit(1);
  return (rows[0] as AgentOperation | undefined) ?? null;
}

export async function findOperationByKey(
  userId: string,
  kind: string,
  idempotencyKey: string,
): Promise<AgentOperation | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(agentOperations)
    .where(and(
      eq(agentOperations.user_id, userId),
      eq(agentOperations.kind, kind),
      eq(agentOperations.idempotency_key, idempotencyKey),
    ))
    .limit(1);
  return (rows[0] as AgentOperation | undefined) ?? null;
}

/** A live operation for this exact input, or one that succeeded within the dedupe window. */
export async function findReusableOperation(
  userId: string,
  kind: string,
  inputHash: string,
  now: Date = new Date(),
): Promise<AgentOperation | null> {
  const db = await getDb();
  const cutoff = new Date(now.getTime() - OPERATION_DEDUPE_WINDOW_MS).toISOString();
  const rows = await db
    .select()
    .from(agentOperations)
    .where(and(
      eq(agentOperations.user_id, userId),
      eq(agentOperations.kind, kind),
      eq(agentOperations.input_hash, inputHash),
      sql`(${agentOperations.status} in ('pending', 'running')
        or (${agentOperations.status} = 'succeeded' and ${agentOperations.updated_at} >= ${cutoff}))`,
    ))
    .orderBy(sql`${agentOperations.created_at} desc`)
    .limit(1);
  return (rows[0] as AgentOperation | undefined) ?? null;
}

export interface ExistingOperation {
  operation: AgentOperation;
  /** Why it was returned: the client's own key, an identical request under another key, or the application already has one running. */
  matchedBy: 'key' | 'input' | 'session';
}

/**
 * Before reserving credits: is this request already an operation?
 * Throws `IdempotencyKeyMismatch` when the key was used with different input.
 */
export async function resolveExistingOperation(params: {
  userId: string;
  kind: string;
  idempotencyKey: string;
  inputHash: string;
  sessionId?: string | null;
}): Promise<ExistingOperation | null> {
  const byKey = await findOperationByKey(params.userId, params.kind, params.idempotencyKey);
  if (byKey) {
    if (byKey.input_hash !== params.inputHash) throw new IdempotencyKeyMismatch();
    return { operation: byKey, matchedBy: 'key' };
  }
  const byInput = await findReusableOperation(params.userId, params.kind, params.inputHash);
  if (byInput) return { operation: byInput, matchedBy: 'input' };
  // One generation at a time per application: a second request, whatever its input, joins the first.
  if (params.sessionId) {
    const live = await findLiveOperationForSession(params.userId, params.kind, params.sessionId);
    if (live) return { operation: live, matchedBy: 'session' };
  }
  return null;
}

/** The pending or running operation of this kind on an application, if there is one. */
export async function findLiveOperationForSession(userId: string, kind: string, sessionId: string): Promise<AgentOperation | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(agentOperations)
    .where(and(
      eq(agentOperations.user_id, userId),
      eq(agentOperations.kind, kind),
      eq(agentOperations.session_id, sessionId),
      inArray(agentOperations.status, ['pending', 'running']),
    ))
    .orderBy(sql`${agentOperations.created_at} desc`)
    .limit(1);
  return (rows[0] as AgentOperation | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type InsertOperationResult =
  | { outcome: 'created'; operation: AgentOperation }
  | { outcome: 'existing'; operation: AgentOperation; matchedBy: 'key' | 'input' | 'session' }
  | { outcome: 'limit' }
  /** The reservation this operation was to hold is no longer reserved. */
  | { outcome: 'reservation_lost' };

/**
 * Insert the operation row. The count of live operations is part of the INSERT
 * itself, so two requests racing past the limit cannot both get in. A request
 * that loses a race on the idempotency key or on the live-input index comes
 * back as `existing`, never as an error, so the caller can release the
 * reservation it just made.
 */
export async function insertOperation(params: InsertOperationParams): Promise<InsertOperationResult> {
  const first = await insertOperationOnce(params);
  // A refusal reported as "at the limit" can be stale: the live operation that filled the
  // limit may have finished between the refused INSERT and the check. Ask once more.
  return first.outcome === 'limit' ? insertOperationOnce(params) : first;
}

interface InsertOperationParams {
  userId: string;
  sessionId: string | null;
  kind: string;
  idempotencyKey: string;
  inputHash: string;
  input: Record<string, unknown>;
  reservationKey: string | null;
  maxActive?: number;
}

async function insertOperationOnce(params: InsertOperationParams): Promise<InsertOperationResult> {
  const id = crypto.randomUUID();
  const now = nowIso();
  const maxActive = params.maxActive ?? MAX_ACTIVE_OPERATIONS_PER_USER;
  let changes = 0;
  try {
    const [result] = await runBatch([sql`
      INSERT INTO agent_operations (
        id, user_id, session_id, kind, idempotency_key, input_hash, input, status, reservation_key, attempt, created_at, updated_at
      )
      SELECT ${id}, ${params.userId}, ${params.sessionId}, ${params.kind}, ${params.idempotencyKey}, ${params.inputHash},
             ${JSON.stringify(params.input)}, 'pending', ${params.reservationKey}, 0, ${now}, ${now}
      WHERE (
        SELECT COUNT(*) FROM agent_operations
        WHERE user_id = ${params.userId} AND kind = ${params.kind} AND status IN ('pending', 'running')
      ) < ${maxActive}
      AND (
        ${params.reservationKey} IS NULL
        OR EXISTS (SELECT 1 FROM credit_reservations WHERE idempotency_key = ${params.reservationKey} AND status = 'reserved')
      )
      AND (
        ${params.sessionId} IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM agent_operations
          WHERE user_id = ${params.userId} AND kind = ${params.kind} AND session_id = ${params.sessionId} AND status IN ('pending', 'running')
        )
      )
      ON CONFLICT (user_id, kind, idempotency_key) DO NOTHING
    `]);
    changes = result.meta.changes;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // The live-input index: an identical request is already pending or running.
    const live = await findReusableOperation(params.userId, params.kind, params.inputHash);
    if (live) return { outcome: 'existing', operation: live, matchedBy: 'input' };
    throw error;
  }
  if (changes > 0) {
    const operation = await getOperation(params.userId, id);
    if (!operation) throw new Error('Operation disappeared after insert');
    return { outcome: 'created', operation };
  }
  const byKey = await findOperationByKey(params.userId, params.kind, params.idempotencyKey);
  if (byKey) {
    if (byKey.input_hash !== params.inputHash) throw new IdempotencyKeyMismatch();
    return { outcome: 'existing', operation: byKey, matchedBy: 'key' };
  }
  if (params.sessionId) {
    // One generation at a time per application: the insert is refused while one is live.
    const live = await findLiveOperationForSession(params.userId, params.kind, params.sessionId);
    if (live) return { outcome: 'existing', operation: live, matchedBy: 'session' };
  }
  if (params.reservationKey) {
    const db = await getDb();
    const held = await db.all<{ ok: number }>(sql`SELECT 1 AS ok FROM credit_reservations WHERE idempotency_key = ${params.reservationKey} AND status = 'reserved'`);
    if (held.length === 0) return { outcome: 'reservation_lost' };
  }
  return { outcome: 'limit' };
}

// ---------------------------------------------------------------------------
// Lease
// ---------------------------------------------------------------------------

/**
 * Take the lease. Returns the claimed row, or null when someone else holds a
 * live lease or the operation is finished. `attempt` goes up on every claim;
 * the success and cancel updates are conditional on it, so a worker that lost
 * its lease cannot finish over the one that took it.
 */
export async function claimOperation(
  operationId: string,
  leaseOwner: string,
  leaseMs: number,
  now: Date = new Date(),
): Promise<AgentOperation | null> {
  const db = await getDb();
  const nowIsoString = now.toISOString();
  const rows = await db
    .update(agentOperations)
    .set({
      status: 'running',
      lease_owner: leaseOwner,
      lease_expires_at: new Date(now.getTime() + leaseMs).toISOString(),
      attempt: sql`${agentOperations.attempt} + 1`,
      updated_at: nowIsoString,
    })
    .where(and(
      eq(agentOperations.id, operationId),
      inArray(agentOperations.status, ['pending', 'running']),
      // An operation that used all its attempts is the sweeper's to end, not another run.
      sql`${agentOperations.attempt} < ${MAX_RUN_ATTEMPTS}`,
      sql`(${agentOperations.lease_expires_at} is null or ${agentOperations.lease_expires_at} < ${nowIsoString})`,
    ))
    .returning();
  return (rows[0] as AgentOperation | undefined) ?? null;
}

/** Push the lease out. False means the lease was lost (cancelled, taken over): stop and do not write. */
export async function extendOperationLease(
  operationId: string,
  leaseOwner: string,
  attempt: number,
  leaseMs: number,
): Promise<boolean> {
  const db = await getDb();
  const now = new Date();
  const rows = await db
    .update(agentOperations)
    .set({ lease_expires_at: new Date(now.getTime() + leaseMs).toISOString(), updated_at: now.toISOString() })
    .where(and(
      eq(agentOperations.id, operationId),
      eq(agentOperations.status, 'running'),
      eq(agentOperations.lease_owner, leaseOwner),
      eq(agentOperations.attempt, attempt),
    ))
    .returning({ id: agentOperations.id });
  return rows.length > 0;
}

/** Hand the lease back so the next delivery can claim at once (a retryable failure). */
export async function releaseOperationLease(
  operationId: string,
  leaseOwner: string,
  attempt: number,
): Promise<void> {
  const db = await getDb();
  await db
    .update(agentOperations)
    .set({ status: 'pending', lease_owner: null, lease_expires_at: null, updated_at: nowIso() })
    .where(and(
      eq(agentOperations.id, operationId),
      eq(agentOperations.status, 'running'),
      eq(agentOperations.lease_owner, leaseOwner),
      eq(agentOperations.attempt, attempt),
    ));
}

// ---------------------------------------------------------------------------
// Finishing
// ---------------------------------------------------------------------------

/**
 * The operation half of the success batch. It is the SECOND statement there:
 * the first (the kit write) is itself guarded on this operation still being
 * `running` at this attempt for this owner, and this one waits on that write
 * having changed a row.
 */
export function buildCompleteOperationStatement(params: {
  operationId: string;
  attempt: number;
  leaseOwner: string;
  resultRef: string;
  now: string;
}): SQL {
  return sql`
    UPDATE agent_operations
    SET status = 'succeeded', result_ref = ${params.resultRef}, error_code = NULL,
        lease_owner = NULL, lease_expires_at = NULL, updated_at = ${params.now}
    WHERE id = ${params.operationId} AND status = 'running' AND attempt = ${params.attempt}
      AND lease_owner = ${params.leaseOwner} AND (SELECT changes()) > 0
  `;
}

export interface FinishFailure {
  /** 'failed' for a runner or sweeper giving up, 'cancelled' for the user. */
  status: 'failed' | 'cancelled';
  errorCode: string;
  /** Free text for the ledger description and the session's generation_error. Not shown raw to users. */
  reason: string;
}

/**
 * End an operation without a kit, in one batch: the operation's terminal
 * status, the reservation release with its refund and ledger rows, and the
 * application's generation_status. Conditional on the operation still being
 * pending or running (and, when `expect` is given, on that attempt and owner),
 * so a late failure cannot undo a success and a late success cannot undo a
 * cancel. Returns false when the operation was not in a state to end.
 */
/**
 * What the caller observed, so a late ender cannot end work that moved on: the
 * attempt and lease owner it saw running, or that it saw the operation pending.
 */
export type FinishExpectation = { attempt: number; leaseOwner: string | null } | { pending: true };

export async function finishOperationWithoutKit(
  operation: AgentOperation,
  failure: FinishFailure,
  expect?: FinishExpectation,
): Promise<boolean> {
  const now = nowIso();
  const reservation = operation.reservation_key
    ? await getReservationByKey(operation.user_id, operation.reservation_key)
    : null;
  const statements: SQL[] = [
    sql`
      UPDATE agent_operations
      SET status = ${failure.status}, error_code = ${failure.errorCode},
          lease_owner = NULL, lease_expires_at = NULL, updated_at = ${now}
      WHERE id = ${operation.id} AND status IN ('pending', 'running')
        ${!expect
          ? sql``
          : 'pending' in expect
            ? sql`AND status = 'pending'`
            : sql`AND attempt = ${expect.attempt} AND lease_owner IS ${expect.leaseOwner}`}
    `,
  ];
  if (reservation && reservation.status === 'reserved') {
    statements.push(...buildReleaseReservationStatements(reservation, {
      reason: `${failure.errorCode}: ${failure.reason}`.slice(0, 300),
      chained: true,
      now,
    }));
  }
  if (operation.session_id) {
    const cancelled = failure.status === 'cancelled';
    statements.push(sql`
      UPDATE application_sessions
      SET generation_status = ${cancelled ? 'cancelled' : 'failed'},
          generation_error = ${cancelled ? null : failure.errorCode},
          generation_completed = 0,
          ${cancelled ? sql`generation_cancelled_at = ${now}` : sql`generation_failed_at = ${now}`},
          updated_at = ${now}
      WHERE id = ${operation.session_id} AND user_id = ${operation.user_id}
        AND generation_status IN ('pending', 'running')
        AND EXISTS (SELECT 1 FROM agent_operations WHERE id = ${operation.id} AND status = ${failure.status})
    `);
  }
  const results = await runBatch(statements);
  const ended = results[0].meta.changes > 0;
  if (ended) {
    // A kit that used the fit-continuation discount gives the claim back, so
    // the user can still spend it on a retry.
    const contextId = typeof operation.input.contextId === 'string' ? operation.input.contextId : null;
    if (contextId) {
      await releaseFitContinuationClaim(operation.user_id, contextId, operation.idempotency_key).catch((error) => {
        console.error('[operations] could not release the fit continuation claim:', error);
      });
    }
    // A kit queued for a job from the feed leaves the pending state on the feed row too. After the
    // batch above, and never failing it.
    if (operation.kind === OPERATION_KINDS.generateKit) {
      await finalizeFeedRowForKit(operation, failure.status, failure.errorCode);
    }
  }
  return ended;
}

/** Cancel on the user's request. Returns the operation after, or null when it was not theirs. */
export async function cancelOperation(userId: string, operationId: string): Promise<AgentOperation | null> {
  const operation = await getOperation(userId, operationId);
  if (!operation) throw new NotFoundError('Operation');
  if (operation.status !== 'pending' && operation.status !== 'running') return operation;
  await finishOperationWithoutKit(operation, {
    status: 'cancelled',
    errorCode: 'cancelled_by_user',
    reason: 'cancelled by the user',
  });
  return getOperation(userId, operationId);
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

/** Operations that should have finished by now: pending too long, or running past an expired lease. */
export async function listStuckOperations(params: {
  pendingOlderThanMs: number;
  expiredLeaseOlderThanMs: number;
  limit: number;
  now?: Date;
}): Promise<AgentOperation[]> {
  const now = params.now ?? new Date();
  const pendingCutoff = new Date(now.getTime() - params.pendingOlderThanMs).toISOString();
  const leaseCutoff = new Date(now.getTime() - params.expiredLeaseOlderThanMs).toISOString();
  const db = await getDb();
  const rows = await db
    .select()
    .from(agentOperations)
    .where(sql`(
      (${agentOperations.status} = 'pending' and ${agentOperations.updated_at} < ${pendingCutoff})
      or (${agentOperations.status} = 'running' and ${agentOperations.lease_expires_at} < ${leaseCutoff})
    )`)
    .orderBy(agentOperations.updated_at)
    .limit(params.limit);
  return rows as AgentOperation[];
}

/** Delete finished operations older than `days`. Their reservations and ledger rows are not touched. */
export async function deleteFinishedOperationsOlderThan(days: number, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const db = await getDb();
  const deleted = await db
    .delete(agentOperations)
    .where(and(
      inArray(agentOperations.status, ['succeeded', 'failed', 'cancelled']),
      lt(agentOperations.updated_at, cutoff),
    ))
    .returning({ id: agentOperations.id });
  return deleted.length;
}

/**
 * `generation_status = 'running'` for an operation's application, written only
 * while that operation is still the running attempt that owns the lease. A
 * late starter must not flip an application that was already cancelled or
 * finished back to running. Workflow state: no revision bump.
 */
export async function markSessionRunning(operation: AgentOperation, attempt: number, leaseOwner: string): Promise<void> {
  if (!operation.session_id) return;
  const now = nowIso();
  await runBatch([sql`
    UPDATE application_sessions
    SET generation_status = 'running', generation_started_at = ${now}, generation_error = NULL,
        generation_completed = 0, updated_at = ${now}
    WHERE id = ${operation.session_id} AND user_id = ${operation.user_id}
      AND EXISTS (
        SELECT 1 FROM agent_operations
        WHERE id = ${operation.id} AND status = 'running' AND attempt = ${attempt} AND lease_owner = ${leaseOwner}
      )
  `]);
}
