import { NextRequest, NextResponse } from 'next/server';
import { EmailValidationError } from '@/lib/agents/unified-writer-agent';
import { getCurrentUser } from '@/auth/server';
import { CREDIT_COSTS } from '@/lib/middleware/creditCheck';
import { reserveCredits, captureReservation, releaseReservation } from '@/lib/supabase/credit-reservations';
import { getPostHogServer } from '@/lib/posthog-server';
import { ACTIVE_MODEL_ID, ACTIVE_MODEL_PRICING } from '@/lib/models';
import { randomUUID } from 'crypto';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import {
  RegenerateRequestError,
  prepareRegeneration,
  type RegenerateType,
} from '@/lib/services/regenerate';

/**
 * API endpoint for regenerating cover letter or email
 * Uses the Unified Writer Agent (single agent architecture)
 *
 * The checks, the model call and the writes live in src/lib/services/regenerate.ts, which the MCP
 * tools share. This route owns the HTTP shape, the rate limit and the credits.
 */
export async function POST(request: NextRequest) {
  let activeReservationKey: string | null = null;
  let activeReservationUserId: string | null = null;
  try {
    // Get authenticated user before choosing a fallback limiter key.
    const clientIP = getClientIP(request);
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const limiterSubject = clientIP === 'unknown' ? `user:${user.id}` : clientIP;
    const rateLimitResult = await checkRateLimit(`regenerate:${limiterSubject}`, RATE_LIMITS['regenerate']);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { type, context, instruction, section } = body;

    if (!type || !context) {
      return NextResponse.json(
        { error: 'Missing required fields: type and context' },
        { status: 400 }
      );
    }

    // Every check that can refuse the request runs before anything is reserved.
    let prepared;
    try {
      prepared = await prepareRegeneration(user.id, {
        sessionId: context.sessionId,
        type: type as RegenerateType,
        instruction,
        section,
        userLanguageOverride: context.userLanguageOverride,
      });
    } catch (error) {
      if (error instanceof RegenerateRequestError) {
        return NextResponse.json(
          error.code ? { error: error.message, code: error.code } : { error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }
    const creditAction = prepared.creditAction;

    // The client's request id becomes the idempotency key, so a retry that
    // reuses it dedupes instead of double-deducting. Callers currently send a
    // fresh id per click, so today this only dedupes a retried fetch.
    const clientRequestId = request.headers.get('x-request-id')
      ?? `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const reservationKey = `${creditAction.toLowerCase()}:${user.id}:${clientRequestId}`;
    const generationContext: LlmGenerationContext = {
      requestExecutionId: randomUUID(),
      clientRequestId,
      userId: user.id,
      applicationSessionId: prepared.sessionId,
      route: '/api/regenerate',
      feature: 'regeneration',
      operation: `regen_${type}`,
    };
    activeReservationKey = reservationKey;
    activeReservationUserId = user.id;
    const reserveResult = await reserveCredits({
      userId: user.id,
      action: creditAction,
      idempotencyKey: reservationKey,
      sessionId: prepared.sessionId,
    });

    if (!reserveResult.success) {
      if (reserveResult.error) {
        console.warn('[Regenerate API] Credit reservation failed:', reserveResult.error);
      }
      if (reserveResult.code === 'RESERVATION_IN_FLIGHT') {
        return NextResponse.json(
          { error: 'That request is still running.', code: 'REQUEST_IN_PROGRESS' },
          { status: 409 },
        );
      }
      if (reserveResult.code === 'RESERVATION_SPENT') {
        return NextResponse.json(
          { error: 'That request already finished.', code: 'REQUEST_ALREADY_COMPLETED' },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error: 'Insufficient credits',
          code: 'INSUFFICIENT_CREDITS',
          details: {
            required: reserveResult.required ?? CREDIT_COSTS[creditAction],
            available: reserveResult.available ?? 0,
            upgradeRequired: true,
          },
        },
        { status: 402 }
      );
    }

    // PostHog LLM analytics for regeneration
    const traceId = `trace_${randomUUID()}`;
    const INPUT_COST_PER_M = ACTIVE_MODEL_PRICING.inputPerM;
    const OUTPUT_COST_PER_M = ACTIVE_MODEL_PRICING.outputPerM;
    const regenStartTime = Date.now();

    const trackRegenLLM = (step: string, tokens: { input: number; output: number }) => {
      try {
        const posthog = getPostHogServer();
        const inputCost = (tokens.input / 1_000_000) * INPUT_COST_PER_M;
        const outputCost = (tokens.output / 1_000_000) * OUTPUT_COST_PER_M;
        const totalCost = inputCost + outputCost;
        const latencySeconds = (Date.now() - regenStartTime) / 1000;

        posthog.capture({
          distinctId: user.id,
          event: '$ai_generation',
          properties: {
            // Required PostHog LLM analytics properties
            $ai_provider: 'anthropic',
            $ai_model: ACTIVE_MODEL_ID,
            $ai_input_tokens: tokens.input,
            $ai_output_tokens: tokens.output,
            $ai_input_cost_usd: inputCost,
            $ai_output_cost_usd: outputCost,
            $ai_total_cost_usd: totalCost,
            $ai_is_error: false,
            $ai_http_status: 200,
            $ai_trace_id: traceId,
            $ai_latency: latencySeconds,
            // Custom properties for segmentation
            step,
            total_tokens: tokens.input + tokens.output,
            feature: 'regeneration',
            workflow_action: `regen_${type}`,
          },
        });
      } catch (e) {
        console.error('[PostHog] Regen LLM tracking error:', e);
      }
    };

    const result = await prepared.execute(generationContext);

    if (result.type === 'cover-letter') {
      trackRegenLLM('regen_cover_letter', result.tokens);
      await captureReservation({ idempotencyKey: reservationKey, userId: user.id });
      return NextResponse.json({
        coverLetter: result.coverLetter,
        coverLetterStructured: result.coverLetterStructured,
        creditsDeducted: CREDIT_COSTS.COVER_LETTER_REGEN,
        tokens: result.tokens,
        revision: result.revision,
      });
    }
    if (result.type === 'email') {
      trackRegenLLM('regen_email', result.tokens);
      await captureReservation({ idempotencyKey: reservationKey, userId: user.id });
      return NextResponse.json({
        email: result.email,
        creditsDeducted: CREDIT_COSTS.EMAIL_REGEN,
        tokens: result.tokens,
        revision: result.revision,
      });
    }
    if (result.type === 'follow_up_email') {
      trackRegenLLM('regen_follow_up_email', result.tokens);
      await captureReservation({ idempotencyKey: reservationKey, userId: user.id });
      return NextResponse.json({
        followUpEmail: result.followUpEmail,
        creditsDeducted: CREDIT_COSTS.FOLLOW_UP_REGEN,
        tokens: result.tokens,
        revision: result.revision,
      });
    }

    const outcome = result.outcome;
    trackRegenLLM('regen_cv_section', outcome.tokens);
    // The model claim check on the rewrite, when it ran. Our cost, not charged to the user.
    if (outcome.claimCheckTokens) trackRegenLLM('section_rewrite_claim_check', outcome.claimCheckTokens);

    if (outcome.status === 'applied') {
      await captureReservation({ idempotencyKey: reservationKey, userId: user.id });
      // `omitted` rides on the applied branch too, and the client has to show
      // it. A rewrite that tightened the section but dropped "my Munich
      // fintech project" is a partial success, and reporting it as a clean
      // "Rewritten" is the silent narrowing this whole mechanism exists to
      // prevent. Shape: a flat string array, at most 5 entries, each at most
      // 120 characters, single line, no markup, possibly empty. Advisory, not
      // proof: half of it is model-authored, so word it as "left out" rather
      // than as a finding.
      return NextResponse.json({
        applied: true,
        target: { kind: outcome.kind, id: outcome.id },
        label: outcome.label,
        content: outcome.content,
        omitted: outcome.omitted,
        creditsDeducted: CREDIT_COSTS.CV_SECTION_REWRITE,
        tokens: outcome.tokens,
      });
    }

    // The CV was not touched, so the rewrite is free. The billing line is
    // only written when the release actually landed: claiming "nothing was
    // charged" against a release that failed would be the same lie Phase 4
    // fixed on the follow-up route. A stranded reservation is refunded by
    // the stale-reservation reconciler.
    const release = await releaseReservation({
      idempotencyKey: reservationKey,
      userId: user.id,
      reason: `cv_section_${outcome.status}`,
    });
    if (!release.success) {
      console.error('[Regenerate API] cv_section reservation release failed:', release.error);
    }
    const billingLine = release.success ? ' Nothing was charged.' : '';

    let message: string;
    if (outcome.status === 'refused' && outcome.reason === 'unsupported_claim') {
      const named = outcome.terms.slice(0, 3).map((term) => `"${term}"`).join(', ');
      message = `Your CV doesn't mention ${named}, so we left that section as it is.${billingLine}`;
    } else if (outcome.status === 'refused') {
      message = `The rewrite came back with a number we can't trace to your CV, so we left that section as it is.${billingLine}`;
    } else {
      message = `Nothing in that section could change without adding something your CV doesn't say. We left it as it is.${billingLine}`;
    }

    return NextResponse.json({
      applied: false,
      reason: outcome.status === 'refused' ? outcome.reason : 'no_change',
      target: { kind: outcome.kind, id: outcome.id },
      label: outcome.label,
      omitted: outcome.omitted,
      terms: outcome.status === 'refused' ? outcome.terms : [],
      message,
      creditsDeducted: 0,
      tokens: outcome.tokens,
    });
  } catch (error) {
    console.error('[Regenerate API] Error:', error);
    if (activeReservationKey && activeReservationUserId) {
      try {
        await releaseReservation({
          idempotencyKey: activeReservationKey,
          userId: activeReservationUserId,
          reason: error instanceof Error ? error.message : 'regen_error',
        });
      } catch { /* best-effort refund */ }
    }
    // Track regeneration error in PostHog
    try {
      const posthog = getPostHogServer();
      posthog.capture({
        distinctId: 'unknown',
        event: '$ai_generation',
        properties: {
          $ai_provider: 'anthropic',
          $ai_model: ACTIVE_MODEL_ID,
          $ai_is_error: true,
          $ai_http_status: 500,
          $ai_error: error instanceof Error ? error.message : String(error),
          step: 'regen_error',
          feature: 'regeneration',
        },
      });
      // Also capture as exception for Error Tracking dashboard
      posthog.captureException(error as Error, 'server_error', {
        endpoint: '/api/regenerate',
        method: 'POST',
        feature: 'regeneration',
      });
      await posthog.flush();
    } catch { /* ignore PostHog errors */ }
    return NextResponse.json(
      error instanceof EmailValidationError
        ? { error: "We couldn't finish the email. Please try rewriting it again.", code: 'EMAIL_VALIDATION_FAILED' }
        : { error: 'Failed to regenerate content' },
      { status: 500 }
    );
  }
}
