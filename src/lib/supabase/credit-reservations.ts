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

/**
 * Extract the per-bucket deduction split persisted on a reservation at reserve
 * time (metadata.deducted_from). Returns null when absent (reservations created
 * before this field existed) or when the split does not sum to `amount`, so the
 * caller falls back to a safe single-bucket refund and the net refund total is
 * never changed by a corrupt record.
 */
function extractDeductedFrom(
  metadata: CreditReservation['metadata'],
  amount: number,
): { monthly: number; rollover: number; addon: number } | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).deducted_from;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const split = raw as Record<string, unknown>;
  const monthly = typeof split.monthly === 'number' ? split.monthly : 0;
  const rollover = typeof split.rollover === 'number' ? split.rollover : 0;
  const addon = typeof split.addon === 'number' ? split.addon : 0;
  // Only trust the split when it reconstructs the exact reserved amount, so a
  // partial or corrupt record can never change the net credits refunded.
  if (Math.abs(monthly + rollover + addon - amount) > 1e-9) return null;
  return { monthly, rollover, addon };
}

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
        // Persist the per-bucket allocation so a later release refunds the
        // SAME buckets it drew from (monthly/rollover/addon), instead of
        // dumping everything into addon. Stored here on the existing JSONB
        // column, so no schema change is needed.
        deducted_from: {
          monthly: deductResult.deductedFrom.monthly,
          rollover: deductResult.deductedFrom.rollover,
          addon: deductResult.deductedFrom.addon,
        },
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

  // Gate on `transitioned`, not `success`: a repeat release on an already
  // released reservation returns success but did NOT change state, and must
  // not refund a second time.
  if (result.transitioned && result.reservation) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const reservation = result.reservation;
    const reason = 'reservation_released';
    const description = `Released reservation ${reservation.id}${params.reason ? `: ${params.reason}` : ''}`;

    // Refund into the SAME buckets the reservation drew from (recorded at
    // reserve time in metadata.deducted_from). Refunding blindly to addon
    // silently converted expiring monthly credits into permanent addon
    // credits. Pre-fix reservations have no split recorded, so they fall back
    // to addon; the net amount refunded is identical either way.
    const split = extractDeductedFrom(reservation.metadata, reservation.amount);
    if (split) {
      if (split.monthly > 0) {
        await addCredits(reservation.user_id, split.monthly, 'monthly', reason, description, admin);
      }
      if (split.rollover > 0) {
        await addCredits(reservation.user_id, split.rollover, 'rollover', reason, description, admin);
      }
      if (split.addon > 0) {
        await addCredits(reservation.user_id, split.addon, 'addon', reason, description, admin);
      }
    } else {
      await addCredits(reservation.user_id, reservation.amount, 'addon', reason, description, admin);
    }
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
}): Promise<CaptureOrReleaseResult & { transitioned: boolean }> {
  // `transitioned` is true ONLY when this call performed the real state change.
  // A repeat call on an already-`toStatus` reservation returns success but
  // transitioned:false, so callers (releaseReservation) never refund twice.
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
    return { success: false, reservation: null, error: 'Reservation not found', transitioned: false };
  }

  const reservation = existing as CreditReservation;

  if (reservation.status === toStatus) {
    return { success: true, reservation, error: null, transitioned: false };
  }

  if (reservation.status !== fromStatus) {
    return { success: false, reservation, error: `Cannot transition from ${reservation.status} to ${toStatus}`, transitioned: false };
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
    return { success: false, reservation, error: `Failed to transition reservation: ${error.message}`, transitioned: false };
  }

  return { success: true, reservation: data as CreditReservation, error: null, transitioned: true };
}
