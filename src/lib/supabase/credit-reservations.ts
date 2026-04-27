import { createAdminClient } from './admin';
import { deductCredits, getTotalCredits, getUserCredits, addCredits, type CreditAction, CREDIT_COSTS } from './credits';
import type { CreditReservation, CreditReservationStatus, Json } from './types';

export type { CreditReservation };

export interface ReserveCreditResult {
  success: boolean;
  reservation: CreditReservation | null;
  error: string | null;
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
  const { userId, action, idempotencyKey, generationId = null, sessionId = null, metadata = {} } = params;
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
    if (error.code === '23505') {
      const { data: raceWinner } = await admin
        .from('credit_reservations')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .single();

      if (raceWinner) {
        await addCredits(userId, amount, 'addon', 'reservation_duplicate_refund', `Duplicate reservation refund for ${idempotencyKey}`, admin);
        return { success: true, reservation: raceWinner as CreditReservation, error: null };
      }
    }

    await addCredits(userId, amount, 'addon', 'reservation_failed_refund', `Failed reservation refund for ${idempotencyKey}`, admin);
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
