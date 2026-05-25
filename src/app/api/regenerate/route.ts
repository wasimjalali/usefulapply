import { NextRequest, NextResponse } from 'next/server';
import { unifiedWriterAgent } from '@/lib/agents/unified-writer-agent';
import { type MasterContext } from '@/lib/agents/types';
import { createClient } from '@/lib/supabase/server';
import { CREDIT_COSTS } from '@/lib/middleware/creditCheck';
import { reserveCredits, captureReservation, releaseReservation } from '@/lib/supabase/credit-reservations';
import { detectLanguage } from '@/lib/utils/language-detector';
import { getPostHogServer } from '@/lib/posthog-server';
import { randomUUID } from 'crypto';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

/**
 * API endpoint for regenerating cover letter or email
 * Uses the Unified Writer Agent (single agent architecture)
 */
export async function POST(request: NextRequest) {
  let activeReservationKey: string | null = null;
  let activeReservationUserId: string | null = null;
  try {
    // Rate limiting
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit(`regenerate:${clientIP}`, RATE_LIMITS['regenerate']);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429 }
      );
    }

    // Get authenticated user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { type, context } = body;

    if (!type || !context) {
      return NextResponse.json(
        { error: 'Missing required fields: type and context' },
        { status: 400 }
      );
    }

    // Determine credit action based on type
    const creditAction = type === 'cover-letter' ? 'COVER_LETTER_REGEN' as const
      : type === 'follow_up_email' ? 'FOLLOW_UP_REGEN' as const
      : 'EMAIL_REGEN' as const;

    // Prefer client-sent request id so retries of the same regeneration
    // (e.g. transient network failure) dedupe instead of double-deducting.
    const clientRequestId = request.headers.get('x-request-id')
      ?? `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const reservationKey = `${creditAction.toLowerCase()}:${user.id}:${clientRequestId}`;
    activeReservationKey = reservationKey;
    activeReservationUserId = user.id;
    const reserveResult = await reserveCredits({
      userId: user.id,
      action: creditAction,
      idempotencyKey: reservationKey,
      sessionId: context.sessionId || null,
    });

    if (!reserveResult.success) {
      if (reserveResult.error) {
        console.warn('[Regenerate API] Credit reservation failed:', reserveResult.error);
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

    // Get detected language - from context or detect from job description
    const detectedLanguage = context.detectedLanguage || 
                             detectLanguage(context.jobDescription || '');
    
    console.log('[Regenerate API] Using language:', detectedLanguage);

    // Build MasterContext from the provided data
    // CRITICAL: masterCV, verifiedMetrics, and match must be passed through
    // so that anti-hallucination rules have the same source data as first generation
    const masterContext: MasterContext = {
      sessionId: context.sessionId || 'regenerate-session',
      jobDescription: context.jobDescription || '',
      rawCV: context.rawCV || '',
      masterCV: context.masterCV,
      detectedLanguage: detectedLanguage,
      userLanguageOverride: context.userLanguageOverride,
      applicant: context.applicant,
      job: context.job,
      companyResearch: context.companyResearch,
      match: context.match,
      verifiedMetrics: context.verifiedMetrics,
    };

    // PostHog LLM analytics for regeneration
    const traceId = `trace_${randomUUID()}`;
    const INPUT_COST_PER_M = 3;
    const OUTPUT_COST_PER_M = 15;
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
            $ai_model: 'claude-sonnet-4-6',
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

    const trackRegenError = (step: string, error: unknown) => {
      try {
        const posthog = getPostHogServer();
        const latencySeconds = (Date.now() - regenStartTime) / 1000;

        posthog.capture({
          distinctId: user.id,
          event: '$ai_generation',
          properties: {
            $ai_provider: 'anthropic',
            $ai_model: 'claude-sonnet-4-6',
            $ai_is_error: true,
            $ai_http_status: 500,
            $ai_trace_id: traceId,
            $ai_latency: latencySeconds,
            $ai_error: error instanceof Error ? error.message : String(error),
            step,
            feature: 'regeneration',
            workflow_action: `regen_${type}`,
          },
        });
      } catch (e) {
        console.error('[PostHog] Regen error tracking error:', e);
      }
    };

    if (type === 'cover-letter') {
      const { result: coverLetter, tokens } = await unifiedWriterAgent.generateCoverLetter(masterContext);
      trackRegenLLM('regen_cover_letter', tokens);
      await captureReservation({ idempotencyKey: reservationKey, userId: user.id });
      return NextResponse.json({
        coverLetter,
        creditsDeducted: CREDIT_COSTS.COVER_LETTER_REGEN,
        tokens,
      });
    } else if (type === 'email') {
      const { result: email, tokens } = await unifiedWriterAgent.generateApplicationEmail(masterContext);
      trackRegenLLM('regen_email', tokens);
      await captureReservation({ idempotencyKey: reservationKey, userId: user.id });
      return NextResponse.json({
        email,
        creditsDeducted: CREDIT_COSTS.EMAIL_REGEN,
        tokens,
      });
    } else if (type === 'follow_up_email') {
      if (context.applicationEmail) {
        masterContext.applicationEmail = context.applicationEmail;
      }
      const { result: followUpEmail, tokens } = await unifiedWriterAgent.generateFollowUpEmail(masterContext);
      trackRegenLLM('regen_follow_up_email', tokens);
      await captureReservation({ idempotencyKey: reservationKey, userId: user.id });
      return NextResponse.json({
        followUpEmail,
        creditsDeducted: CREDIT_COSTS.FOLLOW_UP_REGEN,
        tokens,
      });
    } else {
      await releaseReservation({ idempotencyKey: reservationKey, userId: user.id, reason: 'invalid_type' });
      return NextResponse.json(
        { error: 'Invalid type. Must be "cover-letter", "email", or "follow_up_email"' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[Regenerate API] Error:', error);
    if (activeReservationKey && activeReservationUserId) {
      try {
        await releaseReservation({
          idempotencyKey: activeReservationKey,
          userId: activeReservationUserId,
          reason: error instanceof Error ? error.message : 'regen_error',
        });
      } catch (_releaseErr) { /* best-effort refund */ }
    }
    // Track regeneration error in PostHog
    try {
      const posthog = getPostHogServer();
      posthog.capture({
        distinctId: 'unknown',
        event: '$ai_generation',
        properties: {
          $ai_provider: 'anthropic',
          $ai_model: 'claude-sonnet-4-6',
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
    } catch (_) { /* ignore PostHog errors */ }
    return NextResponse.json(
      { error: 'Failed to regenerate content' },
      { status: 500 }
    );
  }
}
