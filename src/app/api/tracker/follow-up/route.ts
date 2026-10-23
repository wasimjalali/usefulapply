import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getCurrentUser } from '@/auth/server';
import { CREDIT_COSTS } from '@/lib/credit-costs';
import { reserveCredits, captureReservation, releaseReservation } from '@/lib/supabase/credit-reservations';
import { getPostHogServer } from '@/lib/posthog-server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getSession, type ApplicationSession } from '@/db/repos/sessions';
import { saveKitDocument } from '@/lib/services/kit';
import { EmptyGenerationError, RegenerateRequestError, prepareRegeneration } from '@/lib/services/regenerate';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SESSION_ID_MAX = 64;

/**
 * Session-scoped follow-up regenerate. The writer's context is built on the
 * server from the D1 session and the user's CVs by the shared regenerate
 * service, so the tracker does not depend on the client having that
 * application and CV in memory. This route owns the reservation: its key is
 * scoped to the application, and a saved letter carries the key so a retry
 * replays it instead of paying again.
 */
export async function POST(request: NextRequest) {
  let activeReservationKey: string | null = null;
  let activeReservationUserId: string | null = null;
  let persisted = false;
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const rateLimitResult = await checkRateLimit(`regenerate:${user.id}`, RATE_LIMITS['regenerate']);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!sessionId || sessionId.length > SESSION_ID_MAX) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const session = await getSession(user.id, sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }
    if (!session.job_description?.trim()) {
      return NextResponse.json(
        { error: 'That application has no job description.', code: 'NO_CONTEXT' },
        { status: 400 },
      );
    }

    // Every check that can refuse the request runs before anything is reserved.
    let prepared;
    try {
      prepared = await prepareRegeneration(user.id, { sessionId: session.id, type: 'follow_up_email' });
    } catch (error) {
      if (error instanceof RegenerateRequestError) {
        if (error.code === 'NO_SOURCE_CV' || error.code === 'NO_APPLICANT') {
          return NextResponse.json(
            { error: 'I need your CV to write that.', code: 'NO_CONTEXT' },
            { status: 400 },
          );
        }
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    const requestIdHeader = request.headers.get('x-request-id');
    const clientRequestId = requestIdHeader && requestIdHeader.length > 0 && requestIdHeader.length <= 128
      ? requestIdHeader
      : `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const reservationKey = `follow_up_regen:${user.id}:${session.id}:${clientRequestId}`;
    activeReservationKey = reservationKey;
    activeReservationUserId = user.id;
    const reserveResult = await reserveCredits({
      userId: user.id,
      action: 'FOLLOW_UP_REGEN',
      idempotencyKey: reservationKey,
      sessionId: session.id,
    });

    if (!reserveResult.success) {
      if (reserveResult.code === 'RESERVATION_IN_FLIGHT') {
        return NextResponse.json(
          { error: 'That request is still running.', code: 'REQUEST_IN_PROGRESS' },
          { status: 409 },
        );
      }
      if (reserveResult.code === 'RESERVATION_SPENT') {
        return NextResponse.json(
          { error: "That request already finished. You weren't charged twice.", code: 'REQUEST_ALREADY_COMPLETED' },
          { status: 409 },
        );
      }
      if (typeof reserveResult.available === 'number') {
        return NextResponse.json(
          {
            error: 'Insufficient credits',
            code: 'INSUFFICIENT_CREDITS',
            details: {
              required: reserveResult.required ?? CREDIT_COSTS.FOLLOW_UP_REGEN,
              available: reserveResult.available,
              upgradeRequired: true,
            },
          },
          { status: 402 },
        );
      }
      return NextResponse.json({ error: 'Failed to write the follow-up.' }, { status: 500 });
    }

    if (!reserveResult.reservation) {
      return NextResponse.json({ error: 'Failed to write the follow-up.' }, { status: 500 });
    }

    // reserveCredits refuses a key that is reserved or captured (409 above) and
    // reserves a released key again. So the replay below runs only after a capture
    // that never landed: the letter was saved, the reconciler released the
    // reservation, and the client retried with the same request id. The other
    // branches guard the same rule if reserveCredits ever changes: only a live
    // reserved row with no letter for this key may generate.
    const reservationStatus = reserveResult.reservation.status;
    const existingLetter = storedFollowUp(session);
    // Only replay a letter this reservation wrote. An older follow-up on the
    // session is not this request.
    if (reservationStatus === 'captured') {
      if (!existingLetter) {
        return NextResponse.json({ error: 'That rewrite already finished.' }, { status: 409 });
      }
      return NextResponse.json({
        followUpEmail: {
          subject: existingLetter.subject,
          body: existingLetter.body,
          recommendedDelay: existingLetter.recommendedDelay,
        },
        creditsDeducted: 0,
        replayed: true,
      });
    }
    if (reservationStatus === 'reserved' && existingLetter?.reservationKey === reservationKey) {
      // The letter was delivered before, and this request just took a fresh hold
      // for it. Hand the hold back so "nothing charged" is true now, not after
      // the stale-reservation sweep. A release that fails is still freed by that sweep.
      const release = await releaseReservation({
        idempotencyKey: reservationKey,
        userId: user.id,
        reason: 'replayed_saved_letter',
      });
      if (!release.success) {
        console.error('[Tracker follow-up] Replay release did not land; the stale-reservation sweep frees it:', release.error);
      }
      return NextResponse.json({
        followUpEmail: {
          subject: existingLetter.subject,
          body: existingLetter.body,
          recommendedDelay: existingLetter.recommendedDelay,
        },
        creditsDeducted: 0,
        replayed: true,
      });
    }
    if (reservationStatus !== 'reserved') {
      return NextResponse.json({ error: 'That rewrite already finished.' }, { status: 409 });
    }

    const generationContext: LlmGenerationContext = {
      requestExecutionId: randomUUID(),
      clientRequestId,
      userId: user.id,
      applicationSessionId: session.id,
      route: '/api/tracker/follow-up',
      feature: 'tracker_follow_up',
      operation: 'regen_follow_up_email',
    };
    let generated;
    try {
      generated = await prepared.generate(generationContext);
    } catch (error) {
      if (!(error instanceof EmptyGenerationError)) throw error;
      await releaseReservation({
        idempotencyKey: reservationKey,
        userId: user.id,
        reason: 'empty_follow_up',
      });
      return NextResponse.json({ error: 'Failed to write the follow-up.' }, { status: 500 });
    }
    if (generated.kind !== 'document') throw new Error('Follow-up regeneration returned a CV section');
    const draft = generated.toResult(0);
    if (draft.type !== 'follow_up_email') throw new Error('Follow-up regeneration returned another document');
    const { tokens } = draft;
    const written = { ...draft.followUpEmail, reservationKey };
    let writtenRevision: number | undefined;
    let persistError: unknown = null;
    try {
      writtenRevision = (await saveKitDocument(user.id, session.id, 'followUpEmail', written)).revision;
    } catch (error) {
      persistError = error;
    }
    if (persistError) {
      console.error('[Tracker follow-up] could not save the follow-up:', persistError);
      await releaseReservation({
        idempotencyKey: reservationKey,
        userId: user.id,
        reason: 'persist_failed',
      });
      return NextResponse.json({ error: 'Failed to save the follow-up.' }, { status: 500 });
    }
    persisted = true;
    // A partial kit may have marked this follow-up as failed. Cosmetic once the
    // letter exists (tabs only show the mark while the document is missing):
    // afterSave logs a miss and never throws, so a delivered follow-up never
    // turns into a 500.
    if (writtenRevision !== undefined) await generated.afterSave(writtenRevision);

    // Past this point the letter is saved and durable, so the only truthful
    // response is success. A capture that fails must not turn a delivered
    // follow-up into a 500: the user would be told it failed, click again, pay
    // again, and wait on the reconciler to refund the first one. The capture is
    // CAS-guarded and idempotent, so one retry is safe by construction; if it
    // still does not land the reservation stays reserved and
    // releaseStaleReservations refunds it, which costs us one free follow-up
    // and is the right way to err.
    let captureLanded = false;
    for (let attempt = 0; attempt < 2 && !captureLanded; attempt += 1) {
      try {
        const captured = await captureReservation({ idempotencyKey: reservationKey, userId: user.id });
        captureLanded = captured.success;
      } catch (captureError) {
        console.error('[Tracker follow-up] Capture threw; letter is saved and returned anyway:', captureError);
      }
    }
    if (!captureLanded) {
      console.error('[Tracker follow-up] Capture did not land. The letter was delivered and the reservation stays reserved for the reconciler to release.');
      try {
        const posthog = getPostHogServer();
        posthog.captureException(new Error('Follow-up capture did not land'), 'server_error', {
          endpoint: '/api/tracker/follow-up',
          feature: 'regeneration',
          reservation_key: reservationKey,
        });
        await posthog.flush();
      } catch { /* ignore PostHog errors */ }
    }
    return NextResponse.json({
      followUpEmail: {
        subject: written.subject,
        body: written.body,
        recommendedDelay: written.recommendedDelay,
      },
      creditsDeducted: CREDIT_COSTS.FOLLOW_UP_REGEN,
      tokens,
      revision: writtenRevision,
    });
  } catch (error) {
    console.error('[Tracker follow-up] Error:', error);
    if (activeReservationKey && activeReservationUserId && !persisted) {
      try {
        await releaseReservation({
          idempotencyKey: activeReservationKey,
          userId: activeReservationUserId,
          reason: 'regen_error',
        });
      } catch {
        /* best-effort refund */
      }
    }
    try {
      const posthog = getPostHogServer();
      posthog.captureException(error as Error, 'server_error', {
        endpoint: '/api/tracker/follow-up',
        method: 'POST',
        feature: 'tracker_follow_up',
      });
      await posthog.flush();
    } catch {
      /* ignore PostHog errors */
    }
    return NextResponse.json({ error: 'Failed to write the follow-up.' }, { status: 500 });
  }
}

function storedFollowUp(session: ApplicationSession): {
  subject: string;
  body: string;
  recommendedDelay: number;
  reservationKey: string | null;
} | null {
  const raw = session.follow_up_email;
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const subject = readString(record.subject);
  const body = readString(record.body);
  if (!subject.trim() || !body.trim()) return null;
  return {
    subject,
    body,
    recommendedDelay: typeof record.recommendedDelay === 'number' ? record.recommendedDelay : 5,
    reservationKey: readString(record.reservationKey) || null,
  };
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
