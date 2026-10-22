import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { unifiedWriterAgent } from '@/lib/agents/unified-writer-agent';
import { type MasterContext } from '@/lib/agents/types';
import { getCurrentUser } from '@/auth/server';
import { CREDIT_COSTS } from '@/lib/middleware/creditCheck';
import { reserveCredits, captureReservation, releaseReservation } from '@/lib/supabase/credit-reservations';
import { detectLanguage, isSupportedLanguage, type SupportedLanguage } from '@/lib/utils/language-detector';
import { getPostHogServer } from '@/lib/posthog-server';
import { ACTIVE_MODEL_ID, ACTIVE_MODEL_PRICING } from '@/lib/models';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { clearKitDocumentError, getSession, updateSession, type ApplicationSession } from '@/db/repos/sessions';
import { saveKitDocument } from '@/lib/services/kit';
import { getDocumentByType, type Document } from '@/db/repos/documents';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import { loadApplicantLogistics } from '@/lib/profile/logistics.server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SESSION_ID_MAX = 64;

/**
 * Session-scoped follow-up regenerate. Builds MasterContext on the server
 * from the D1 session and the user's CVs, so the tracker does not depend
 * on the client having that application and CV in memory.
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

    const [primaryCv, masterCv] = await Promise.all([
      getDocumentByType(user.id, 'primary_cv'),
      getDocumentByType(user.id, 'master_cv'),
    ]);
    const rawCV = primaryCv?.raw_text?.trim() || '';
    if (!rawCV) {
      return NextResponse.json(
        { error: 'I need your CV to write that.', code: 'NO_CONTEXT' },
        { status: 400 },
      );
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

    // reserveCredits returns success for any existing key, including captured
    // and released. Only a live reserved row with no saved letter may generate.
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
    const storedArtifacts = readRecord(session.generated_artifacts);
    const storedRequirements = readRecord(session.requirements);
    const storedLanguage = isSupportedLanguage(storedRequirements?.detectedLanguage)
      ? storedRequirements.detectedLanguage
      : storedDetectedLanguage(storedArtifacts);
    const detectedLanguage = storedLanguage
      ?? await detectLanguage(session.job_description, generationContext);
    if (!storedLanguage) {
      // `requirements` is a column the browser also writes, so the write bumps the revision (see the regenerate route).
      const persistedLanguage = await updateSession(user.id, session.id, {
        generated_artifacts: { ...(storedArtifacts ?? {}), detectedLanguage },
        requirements: { ...(storedRequirements ?? {}), detectedLanguage },
      });
      if (persistedLanguage.error) throw persistedLanguage.error;
    }
    const masterContext = buildContextFromSession(
      session,
      rawCV,
      masterCv?.raw_text || undefined,
      primaryCv,
      detectedLanguage,
      storedArtifacts,
    );
    // The saved start date, read fresh from D1 like every other writer. Not swallowed: a failed read
    // lands in the catch below, which releases the reservation.
    masterContext.logistics = await loadApplicantLogistics(user.id);

    const traceId = `trace_${randomUUID()}`;
    const INPUT_COST_PER_M = ACTIVE_MODEL_PRICING.inputPerM;
    const OUTPUT_COST_PER_M = ACTIVE_MODEL_PRICING.outputPerM;
    const regenStartTime = Date.now();

    const { result: followUpEmail, tokens } = await unifiedWriterAgent.generateFollowUpEmail(masterContext, generationContext);
    if (!followUpEmail?.subject?.trim() || !followUpEmail?.body?.trim()) {
      await releaseReservation({
        idempotencyKey: reservationKey,
        userId: user.id,
        reason: 'empty_follow_up',
      });
      return NextResponse.json({ error: 'Failed to write the follow-up.' }, { status: 500 });
    }

    try {
      const posthog = getPostHogServer();
      const inputCost = (tokens.input / 1_000_000) * INPUT_COST_PER_M;
      const outputCost = (tokens.output / 1_000_000) * OUTPUT_COST_PER_M;
      posthog.capture({
        distinctId: user.id,
        event: '$ai_generation',
        properties: {
          // Who served the call: Bedrock after a failover, else the Anthropic API.
          $ai_provider: tokens.provider ?? 'anthropic',
          $ai_model: tokens.model ?? ACTIVE_MODEL_ID,
          $ai_input_tokens: tokens.input,
          $ai_output_tokens: tokens.output,
          $ai_input_cost_usd: inputCost,
          $ai_output_cost_usd: outputCost,
          $ai_total_cost_usd: inputCost + outputCost,
          $ai_is_error: false,
          $ai_http_status: 200,
          $ai_trace_id: traceId,
          $ai_latency: (Date.now() - regenStartTime) / 1000,
          step: 'regen_follow_up_email',
          total_tokens: tokens.input + tokens.output,
          feature: 'tracker_follow_up',
          workflow_action: 'regen_follow_up_email',
        },
      });
      await posthog.flush();
    } catch (error) {
      console.error('[PostHog] Tracker follow-up tracking error:', error);
    }

    const written = {
      subject: followUpEmail.subject,
      body: followUpEmail.body,
      recommendedDelay: followUpEmail.recommendedDelay || 5,
      reservationKey,
    };
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
    // letter exists (tabs only show the mark while the document is missing),
    // so a miss here is logged and never turns a delivered follow-up into a 500.
    try {
      await clearKitDocumentError(user.id, session.id, 'followUpEmail');
    } catch (clearError) {
      console.error('[Tracker follow-up] Could not clear the follow-up failure mark:', clearError);
    }

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

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function storedDetectedLanguage(artifacts: Record<string, unknown> | null): SupportedLanguage | undefined {
  if (isSupportedLanguage(artifacts?.detectedLanguage)) return artifacts.detectedLanguage;
  const pending = readRecord(artifacts?.pendingFitAnalysis);
  const contextData = readRecord(pending?.contextData);
  return isSupportedLanguage(contextData?.detectedLanguage) ? contextData.detectedLanguage : undefined;
}

function persistedClaimableEvidence(artifacts: Record<string, unknown> | null): string[] {
  const match = readRecord(artifacts?.match);
  const details = Array.isArray(match?.details) ? match.details : [];
  const detailEvidence = details.flatMap((value) => {
    const detail = readRecord(value);
    const evidence = readString(detail?.evidence);
    return detail?.claimable === true && evidence ? [evidence] : [];
  });
  const canonical = readStringList(match?.claimableEvidence);
  return uniqueStrings([...canonical, ...detailEvidence]);
}

function applicantFromDocument(doc: Document | null): MasterContext['applicant'] | undefined {
  const structured = doc?.structured_data;
  if (!structured || typeof structured !== 'object') return undefined;
  const personal = (structured as Record<string, unknown>).personal;
  if (!personal || typeof personal !== 'object') return undefined;
  const fields = personal as Record<string, unknown>;
  const name = readString(fields.fullName);
  const email = readString(fields.email);
  if (!name && !email) return undefined;
  return {
    name,
    email,
    phone: readString(fields.phone) || undefined,
    address: [fields.address, fields.city, fields.country]
      .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      .join(', ') || undefined,
    skills: [],
    tools: [],
    languages: [],
    experiences: [],
    certifications: [],
  };
}

function buildContextFromSession(
  session: ApplicationSession,
  rawCV: string,
  masterCV: string | undefined,
  primaryCv: Document | null,
  detectedLanguage: SupportedLanguage,
  storedArtifacts: Record<string, unknown> | null,
): MasterContext {
  const requirements = session.requirements && typeof session.requirements === 'object'
    ? session.requirements as Record<string, unknown>
    : null;
  const email = session.email && typeof session.email === 'object'
    ? session.email as Record<string, unknown>
    : null;
  const claimableEvidence = persistedClaimableEvidence(storedArtifacts)
    .filter((evidence) => isExplicitlyInCv(evidence, rawCV, masterCV));

  return {
    sessionId: session.id,
    jobDescription: session.job_description,
    rawCV,
    masterCV,
    detectedLanguage,
    applicant: applicantFromDocument(primaryCv),
    job: {
      title: readString(requirements?.title) || session.job_title || '',
      companyName: readString(requirements?.company) || session.company || '',
      location: readString(requirements?.location) || undefined,
      workType: readString(requirements?.workType) || undefined,
      requiredSkills: Array.isArray(requirements?.hardSkills)
        ? requirements.hardSkills.filter((item): item is string => typeof item === 'string')
        : [],
      niceToHaveSkills: Array.isArray(requirements?.niceToHave)
        ? requirements.niceToHave.filter((item): item is string => typeof item === 'string')
        : [],
      responsibilities: Array.isArray(requirements?.responsibilities)
        ? requirements.responsibilities.filter((item): item is string => typeof item === 'string')
        : [],
      startDate: readString(requirements?.startDate) || undefined,
      expectedSalary: readString(requirements?.expectedSalary) || undefined,
    },
    match: (session.matching_skills.length > 0 || session.missing_skills.length > 0 || claimableEvidence.length > 0)
      ? {
          score: session.match_score ?? 0,
          matchedRequirements: session.matching_skills,
          claimableEvidence,
          missingSkills: session.missing_skills.filter((skill) => !isExplicitlyInCv(skill, rawCV, masterCV)),
        }
      : undefined,
    applicationEmail: email?.subject && email?.body
      ? { subject: readString(email.subject), body: readString(email.body) }
      : undefined,
    companyResearch: session.company_research && typeof session.company_research === 'object'
      ? session.company_research as MasterContext['companyResearch']
      : undefined,
  };
}

function isExplicitlyInCv(value: string, ...sources: Array<string | undefined>): boolean {
  const claim = value.trim().normalize('NFKC').replace(/\s+/g, ' ');
  if (!claim) return false;
  const escaped = claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu');
  return sources.some((source) => pattern.test(source?.normalize('NFKC').replace(/\s+/g, ' ') ?? ''));
}
