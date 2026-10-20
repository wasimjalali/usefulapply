/**
 * Operations that run inside their tool call, with the same idempotency the
 * queued kit generation has.
 *
 * A fit analysis, a document regenerate and a section rewrite each take one
 * model call, so there is no queue: the tool reserves credits, runs the work
 * and answers. What makes them safe to retry is the `agent_operations` row they
 * share with queued kits:
 *
 * - the same `(user, kind, idempotency key)` with the same input returns the
 *   result the first call stored, and charges nothing;
 * - the same key with different input is rejected (`IdempotencyKeyMismatch`);
 * - an identical request under a fresh key, within ten minutes of the first
 *   one finishing (or while it runs), returns that first result as well;
 * - at most two of one kind run at once per user.
 *
 * The reservation is captured, or released when the work asks for it ("free if
 * refused"), in the same batch that marks the operation succeeded. A worker
 * that dies mid-call leaves the operation running past its lease; the cron
 * sweeper (recoverStuckOperations) then fails it and gives the credits back.
 *
 * The operation row carries no application id (`session_id` stays null):
 * these kinds never touch the application's generation_status, and the
 * application id is part of the hashed input instead.
 */

import { sql, type SQL } from 'drizzle-orm';
import { nowIso, runBatch } from '@/db/client';
import {
  buildCaptureReservationStatement,
  buildReleaseReservationStatements,
  getReservationByKey,
  releaseReservation,
  reserveCredits,
  type ReservationSpendLimit,
} from '@/db/repos/credits';
import type { CreditAction } from '@/lib/credit-costs';
import {
  InsufficientCreditsError,
  InvalidInputError,
  OperationFailedEarlierError,
  OperationLimitReached,
  ReservationConflictError,
  SpendLimitReachedError,
} from './errors';
import {
  MAX_ACTIVE_OPERATIONS_PER_USER,
  claimOperation,
  finishOperationWithoutKit,
  hashOperationInput,
  insertOperation,
  resolveExistingOperation,
  type AgentOperation,
  type ExistingOperation,
} from './operations';

/** Longer than any single model call, so the sweeper never ends an operation that is still working. */
const INLINE_LEASE_MS = 10 * 60 * 1000;

export interface InlineOutcome<T> {
  result: T;
  /** `capture` charges the reservation (the work produced something); `release` gives the credits back. */
  settle: 'capture' | 'release';
  /** Why a reservation was released, for the ledger. */
  releaseReason?: string;
}

export type InlineRun<T> =
  /** This call did the work. */
  | { kind: 'fresh'; operationId: string; result: T }
  /** An earlier call under this key (or with this exact input) already finished; its stored result. */
  | { kind: 'replayed'; operationId: string; result: Record<string, unknown>; matchedBy: ExistingOperation['matchedBy'] }
  /** The same request is running right now. */
  | { kind: 'in_progress'; operationId: string; matchedBy: ExistingOperation['matchedBy'] };

export interface InlineOperationParams<T> {
  userId: string;
  kind: string;
  idempotencyKey: string;
  /** Normalized input. Hashed for the key-reuse and fresh-key checks; keep it free of anything that changes between retries. */
  input: Record<string, unknown>;
  /** Credits to reserve before the work, and how. Leave out for work that costs none. */
  reserve?: {
    action: CreditAction;
    sessionId?: string | null;
    metadata?: Record<string, unknown>;
    spendLimit?: ReservationSpendLimit;
  };
  execute: (context: { operationId: string; reservationKey: string | null }) => Promise<InlineOutcome<T>>;
}

function describeExisting(existing: ExistingOperation): InlineRun<never> {
  const { operation, matchedBy } = existing;
  if (operation.status === 'succeeded') {
    return { kind: 'replayed', operationId: operation.id, result: (operation.result ?? {}) as Record<string, unknown>, matchedBy };
  }
  if (operation.status === 'pending' || operation.status === 'running') {
    return { kind: 'in_progress', operationId: operation.id, matchedBy };
  }
  throw new OperationFailedEarlierError(operation.id);
}

function errorCodeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z_]{3,40}$/.test(code) ? code.toLowerCase() : 'operation_failed';
}

export async function runInlineOperation<T extends Record<string, unknown>>(
  params: InlineOperationParams<T>,
): Promise<InlineRun<T>> {
  const { userId, kind, idempotencyKey } = params;
  if (!idempotencyKey || idempotencyKey.length > 200) {
    throw new InvalidInputError('An idempotency key of 1 to 200 characters is required', 'idempotencyKey');
  }
  const inputHash = await hashOperationInput(params.input);

  // An identical request is answered before anything is charged. Throws on a key reused with other input.
  const existing = await resolveExistingOperation({ userId, kind, idempotencyKey, inputHash, sessionId: null });
  if (existing) return describeExisting(existing);

  let reservationKey: string | null = null;
  let createdHere = false;
  if (params.reserve) {
    reservationKey = `mcp_${kind}:${userId}:${idempotencyKey}`;
    const reserved = await reserveCredits({
      userId,
      action: params.reserve.action,
      idempotencyKey: reservationKey,
      sessionId: params.reserve.sessionId,
      metadata: params.reserve.metadata,
      spendLimit: params.reserve.spendLimit,
    });
    if (reserved.success) {
      createdHere = reserved.created;
    } else if (reserved.code === 'SPEND_LIMIT_REACHED' && reserved.spendLimit) {
      throw new SpendLimitReachedError(reserved.spendLimit.spent, reserved.spendLimit.limit, reserved.required ?? 0);
    } else if (reserved.code === 'RESERVATION_IN_FLIGHT' && reserved.reservation?.status === 'reserved') {
      // A first attempt that died between reserving and inserting. Its credits are ours to use.
    } else if (reserved.code === 'RESERVATION_IN_FLIGHT') {
      throw new ReservationConflictError('REQUEST_IN_PROGRESS');
    } else if (reserved.code === 'RESERVATION_SPENT') {
      throw new ReservationConflictError('REQUEST_ALREADY_COMPLETED');
    } else {
      throw new InsufficientCreditsError(reserved.required ?? 0, reserved.available ?? 0);
    }
  }
  const releaseOnAbort = async (reason: string) => {
    if (createdHere && reservationKey) await releaseReservation({ userId, idempotencyKey: reservationKey, reason });
  };

  let inserted;
  try {
    inserted = await insertOperation({
      userId,
      sessionId: null,
      kind,
      idempotencyKey,
      inputHash,
      input: params.input,
      reservationKey,
    });
  } catch (error) {
    await releaseOnAbort('operation_insert_failed');
    throw error;
  }
  if (inserted.outcome === 'reservation_lost') throw new ReservationConflictError('REQUEST_IN_PROGRESS');
  if (inserted.outcome === 'limit') {
    await releaseOnAbort('operation_limit_reached');
    throw new OperationLimitReached(MAX_ACTIVE_OPERATIONS_PER_USER);
  }
  if (inserted.outcome === 'existing') {
    // Lost a race to an identical request. Its reservation, if it holds one, is its own; ours is surplus.
    if (inserted.operation.reservation_key !== reservationKey) await releaseOnAbort('duplicate_operation');
    return describeExisting({ operation: inserted.operation, matchedBy: inserted.matchedBy });
  }

  const owner = `inline:${crypto.randomUUID()}`;
  const claimed = await claimOperation(inserted.operation.id, owner, INLINE_LEASE_MS);
  if (!claimed) return { kind: 'in_progress', operationId: inserted.operation.id, matchedBy: 'key' };
  const expect = { attempt: claimed.attempt, leaseOwner: owner };

  let outcome: InlineOutcome<T>;
  try {
    outcome = await params.execute({ operationId: claimed.id, reservationKey });
  } catch (error) {
    // The credits go back in the same batch that fails the operation.
    await finishOperationWithoutKit(
      claimed,
      { status: 'failed', errorCode: errorCodeOf(error), reason: error instanceof Error ? error.message : 'operation failed' },
      expect,
    ).catch((finishError) => console.error('[inline-operation] could not end a failed operation:', finishError));
    throw error;
  }

  await settleInline(claimed, expect, outcome);
  return { kind: 'fresh', operationId: claimed.id, result: outcome.result };
}

async function settleInline<T extends Record<string, unknown>>(
  operation: AgentOperation,
  expect: { attempt: number; leaseOwner: string },
  outcome: InlineOutcome<T>,
): Promise<void> {
  const now = nowIso();
  const reservation = operation.reservation_key
    ? await getReservationByKey(operation.user_id, operation.reservation_key)
    : null;
  const statements: SQL[] = [sql`
    UPDATE agent_operations
    SET status = 'succeeded', result = ${JSON.stringify(outcome.result)}, error_code = NULL,
        lease_owner = NULL, lease_expires_at = NULL, updated_at = ${now}
    WHERE id = ${operation.id} AND status = 'running' AND attempt = ${expect.attempt} AND lease_owner = ${expect.leaseOwner}
  `];
  if (reservation && reservation.status === 'reserved') {
    if (outcome.settle === 'capture') {
      statements.push(buildCaptureReservationStatement(reservation, { chained: true, now }));
    } else {
      statements.push(...buildReleaseReservationStatements(reservation, {
        reason: outcome.releaseReason ?? 'nothing_changed',
        chained: true,
        now,
      }));
    }
  }
  await runBatch(statements);
}
