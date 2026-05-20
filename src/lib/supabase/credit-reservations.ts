import { createAdminClient } from './admin';
import { deductCredits, getTotalCredits, getUserCredits, addCredits, type CreditAction, CREDIT_COSTS } from './credits';
import type { CreditReservation, CreditReservationStatus, Json } from './types';

// DB columns credit_reservations.session_id and credit_reservations.generation_id
// are uuid. Client sessions use `session-${Date.now()}` until synced with
// Supabase, so we must coerce any non-uuid value to null before inserting —
// otherwise Postgres throws `invalid input syntax for type uuid` and the
// whole reservation fails after credits were already deducted.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function coerceUuidOrNull(value: string | null | undefined): string | null {
  return value && UUID_RE.test(value) ? value : null;
}

export type { CreditReservation };

export interface ReserveCreditResult {
  success: boolean;
  reservation: CreditReservation | null;
  error: string | null;
  available?: number;
  required?: number;
}

export interface CaptureOrReleaseResult {
  success: boolean;
  reservation: CreditReservation | null;
  error: string | null;
}

/**
 * Reserve credits for a generation. Deducts from balance immediately but
 * tracks the hold so it can be released/refunded if the generation fails.
 *
 * Idempotent by `idempotencyKey` — calling twice for the same key returns
 * the existing reservation without double-charging.
 */
export async function reserveCredits(params: {
  userId: string;
  action: CreditAction;
  idempotencyKey: string;
  generationId?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, Json>;
}): Promise<ReserveCreditResult> {
  const { userId, action, idempotencyKey, metadata = {} } = params;
  const generationId = coerceUuidOrNull(params.generationId ?? null);
  const sessionId = coerceUuidOrNull(params.sessionId ?? null);
  const amount = CREDIT_COSTS[action];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: existing } = await admin
    .from('credit_reservations')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existing) {
    return { success: true, reservation: existing as CreditReservation, error: null };
  }

  const { credits, error: creditsError } = await getUserCredits(userId, admin);
  if (creditsError || !credits) {
    return { success: false, reservation: null, error: creditsError?.message ?? 'Credits not found' };
  }

  const total = getTotalCredits(credits);
  if (total < amount) {
    return {
      success: false,
      reservation: null,
      error: `Insufficient credits. Required: ${amount}, Available: ${total}`,
      available: total,
      required: amount,
    };
  }

  const deductResult = await deductCredits(userId, action, {
    sessionId: sessionId ?? undefined,
    description: `Credit reservation for ${action}`,
    supabaseClient: admin,
  });

  if (!deductResult.success) {
    return { success: false, reservation: null, error: deductResult.error?.message ?? 'Deduction failed' };
  }

  // Refund the deduction by reversing its per-bucket allocation. Without
  // this, every refund flowed into addon_credits even when the deduction
  // came from monthly/rollover, which inflated addon balances over time
  // (free-tier users would accumulate addon credits they never bought).
  const refundDeduction = async (reason: string, description: string) => {
    const { deductedFrom } = deductResult;
    if (deductedFrom.monthly > 0) {
      await addCredits(userId, deductedFrom.monthly, 'monthly', reason, description, admin);
    }
    if (deductedFrom.rollover > 0) {
      await addCredits(userId, deductedFrom.rollover, 'rollover', reason, description, admin);
    }
    if (deductedFrom.addon > 0) {
      await addCredits(userId, deductedFrom.addon, 'addon', reason, description, admin);
    }
  };

  const { data, error } = await admin
    .from('credit_reservations')
    .insert({
      user_id: userId,
      generation_id: generationId,
      session_id: sessionId,
      action: action.toLowerCase(),
      amount,
      status: 'reserved',
      idempotency_key: idempotencyKey,
      metadata: {
        ...metadata,
        remaining_after_reserve: deductResult.remainingCredits,
      },
    })
    .select('*')
    .single();

  if (error) {
    // Unique-constraint race: another caller with the same idempotency_key
    // also deducted and wrote the row first. Both parties deducted
    // (deductCredits has optimistic-retry), so the loser must refund to
    // keep net spend equal to one reservation.
    if (error.code === '23505') {
      const { data: raceWinner } = await admin
        .from('credit_reservations')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .single();

      if (raceWinner) {
        await refundDeduction('reservation_duplicate_refund', `Duplicate reservation refund for ${idempotencyKey}`);
        return { success: true, reservation: raceWinner as CreditReservation, error: null };
      }
    }

    // For any other insert error, verify the row truly does not exist
    // before refunding. The DB might have written the row and dropped the
    // response (network flap between PG and the edge runtime); refunding
    // in that case would create a free reservation.
    const { data: postInsertCheck } = await admin
      .from('credit_reservations')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (postInsertCheck) {
      return { success: true, reservation: postInsertCheck as CreditReservation, error: null };
    }

    await refundDeduction('reservation_failed_refund', `Failed reservation refund for ${idempotencyKey}`);
    return { success: false, reservation: null, error: `Failed to create reservation: ${error.message}` };
  }

  return { success: true, reservation: data as CreditReservation, error: null };
}

/**
 * Capture a reservation — generation succeeded and produced usable artifacts.
 * The credits stay deducted. The reservation moves to `captured`.
 */
export async function captureReservation(params: {
  idempotencyKey: string;
  userId: string;
}): Promise<CaptureOrReleaseResult> {
  return transitionReservation({
    ...params,
    fromStatus: 'reserved',
    toStatus: 'captured',
    timestampField: 'captured_at',
  });
}

/**
 * Release a reservation — generation failed/cancelled/expired before
 * producing usable artifacts. Credits are refunded to the user.
 */
export async function releaseReservation(params: {
  idempotencyKey: string;
  userId: string;
  reason?: string;
}): Promise<CaptureOrReleaseResult> {
  const result = await transitionReservation({
    ...params,
    fromStatus: 'reserved',
    toStatus: 'released',
    timestampField: 'released_at',
  });

  if (result.success && result.reservation) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    await addCredits(
      result.reservation.user_id,
      result.reservation.amount,
      'addon',
      'reservation_released',
      `Released reservation ${result.reservation.id}${params.reason ? `: ${params.reason}` : ''}`,
      admin,
    );
  }

  return result;
}

/**
 * Find an active (reserved) reservation for a generation or session.
 */
export async function findActiveReservation(params: {
  userId: string;
  generationId?: string | null;
  sessionId?: string | null;
  idempotencyKey?: string | null;
}): Promise<CreditReservation | null> {
  const { userId, generationId, sessionId, idempotencyKey } = params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  if (idempotencyKey) {
    const { data } = await admin
      .from('credit_reservations')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .eq('user_id', userId)
      .maybeSingle();
    return (data ?? null) as CreditReservation | null;
  }

  if (generationId) {
    const { data } = await admin
      .from('credit_reservations')
      .select('*')
      .eq('generation_id', generationId)
      .eq('user_id', userId)
      .eq('status', 'reserved')
      .maybeSingle();
    return (data ?? null) as CreditReservation | null;
  }

  if (sessionId) {
    const { data } = await admin
      .from('credit_reservations')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .eq('status', 'reserved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data ?? null) as CreditReservation | null;
  }

  return null;
}

/**
 * Release all stale reservations older than `maxAgeMs` that are still
 * in `reserved` status. Used by the reconciler job.
 */
export async function releaseStaleReservations(params?: {
  maxAgeMs?: number;
  limit?: number;
}): Promise<{ released: number }> {
  const maxAgeMs = params?.maxAgeMs ?? 30 * 60 * 1000;
  const limit = params?.limit ?? 50;
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data, error } = await admin
    .from('credit_reservations')
    .select('*')
    .eq('status', 'reserved')
    .lt('reserved_at', cutoff)
    .order('reserved_at', { ascending: true })
    .limit(limit);

  if (error || !data) return { released: 0 };

  let released = 0;
  for (const row of data as CreditReservation[]) {
    const result = await releaseReservation({
      idempotencyKey: row.idempotency_key,
      userId: row.user_id,
      reason: 'stale_reservation_reconciler',
    });
    if (result.success) released += 1;
  }

  return { released };
}

async function transitionReservation(params: {
  idempotencyKey: string;
  userId: string;
  fromStatus: CreditReservationStatus;
  toStatus: CreditReservationStatus;
  timestampField: 'captured_at' | 'released_at' | 'refunded_at';
}): Promise<CaptureOrReleaseResult> {
  const { idempotencyKey, userId, fromStatus, toStatus, timestampField } = params;
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: existing } = await admin
    .from('credit_reservations')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) {
    return { success: false, reservation: null, error: 'Reservation not found' };
  }

  const reservation = existing as CreditReservation;

  if (reservation.status === toStatus) {
    return { success: true, reservation, error: null };
  }

  if (reservation.status !== fromStatus) {
    return { success: false, reservation, error: `Cannot transition from ${reservation.status} to ${toStatus}` };
  }

  const { data, error } = await admin
    .from('credit_reservations')
    .update({
      status: toStatus,
      [timestampField]: now,
    })
    .eq('id', reservation.id)
    .eq('status', fromStatus)
    .select('*')
    .single();

  if (error) {
    return { success: false, reservation, error: `Failed to transition reservation: ${error.message}` };
  }

  return { success: true, reservation: data as CreditReservation, error: null };
}
