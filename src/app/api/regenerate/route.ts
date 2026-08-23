import { NextRequest, NextResponse } from 'next/server';
import {
  unifiedWriterAgent,
  resolveCVSectionTarget,
  type ResolvedCVSection,
} from '@/lib/agents/unified-writer-agent';
import { type MasterContext } from '@/lib/agents/types';
import { getCurrentUser } from '@/auth/server';
import { CREDIT_COSTS } from '@/lib/middleware/creditCheck';
import { reserveCredits, captureReservation, releaseReservation } from '@/lib/supabase/credit-reservations';
import { detectLanguage } from '@/lib/utils/language-detector';
import { getPostHogServer } from '@/lib/posthog-server';
import { randomUUID } from 'crypto';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import { MAX_INSTRUCTION_CHARS, flattenInstruction } from '@/lib/agents/chat-tools/untrusted';

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
    const rateLimitResult = await checkRateLimit(`regenerate:${clientIP}`, RATE_LIMITS['regenerate']);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429 }
      );
    }

    // Get authenticated user
    const user = await getCurrentUser(request);
    
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
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

    // A rewrite instruction typed by the user in the chat composer. It is
    // user-authored, not ad-authored, but it still rides into a prompt, so it
    // is length-capped and flattened here rather than trusted. Anything past
    // the cap is a paste, not an instruction, and is refused rather than
    // silently truncated: a half-read instruction is worse than none.
    let userInstruction: string | undefined;
    if (instruction !== undefined && instruction !== null) {
      if (typeof instruction !== 'string') {
        return NextResponse.json(
          { error: 'instruction must be a string' },
          { status: 400 }
        );
      }
      if (instruction.length > MAX_INSTRUCTION_CHARS) {
        return NextResponse.json(
          { error: 'instruction is too long', code: 'INSTRUCTION_TOO_LONG' },
          { status: 400 }
        );
      }
      userInstruction = flattenInstruction(instruction) || undefined;
    }

    // A section rewrite needs a generated CV to rewrite a section of, and a
    // target that exists inside it. Both are settled before anything is
    // reserved, so a request that could never succeed never touches credits.
    let resolvedSection: ResolvedCVSection | null = null;
    if (type === 'cv_section') {
      // Without the Primary CV there is no source to check a claim against.
      // The two guards fail in opposite directions on an empty haystack: the
      // number guard passes everything, since no number can be contradicted by
      // a document that is not there, and the claim guard refuses everything,
      // since no word in the rewrite can be traced. Neither answer is worth
      // charging for, so refuse before anything is reserved.
      if (typeof context.rawCV !== 'string' || !context.rawCV.trim()) {
        return NextResponse.json(
          { error: 'We need your CV to rewrite a section of it.', code: 'NO_SOURCE_CV' },
          { status: 400 }
        );
      }
      if (!context.optimizedCVData || typeof context.optimizedCVData !== 'object') {
        return NextResponse.json(
          { error: 'There is no generated CV on this application yet, so there is no section to rewrite.', code: 'NO_CV_DATA' },
          { status: 400 }
        );
      }
      resolvedSection = resolveCVSectionTarget(
        context.optimizedCVData,
        (section ?? {}) as { kind?: unknown; id?: unknown },
      );
      if (!resolvedSection) {
        return NextResponse.json(
          { error: 'That is not a section we can rewrite, or it is not in this CV.', code: 'INVALID_SECTION' },
          { status: 400 }
        );
      }
    }

    // Determine credit action based on type
    const creditAction = type === 'cover-letter' ? 'COVER_LETTER_REGEN' as const
      : type === 'follow_up_email' ? 'FOLLOW_UP_REGEN' as const
      : type === 'cv_section' ? 'CV_SECTION_REWRITE' as const
      : 'EMAIL_REGEN' as const;

    // The client's request id becomes the idempotency key, so a retry that
    // reuses it dedupes instead of double-deducting. Callers currently send a
    // fresh id per click, so today this only dedupes a retried fetch.
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
      userInstruction,
    };
    const generationContext: LlmGenerationContext = {
      requestExecutionId: randomUUID(),
      clientRequestId,
      userId: user.id,
      route: '/api/regenerate',
      feature: 'regeneration',
      operation: `regen_${type}`,
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

    if (type === 'cover-letter') {
      const { result: coverLetter, tokens } = await unifiedWriterAgent.generateCoverLetter(masterContext, generationContext);
      trackRegenLLM('regen_cover_letter', tokens);
      await captureReservation({ idempotencyKey: reservationKey, userId: user.id });
      return NextResponse.json({
        coverLetter,
        creditsDeducted: CREDIT_COSTS.COVER_LETTER_REGEN,
        tokens,
      });
    } else if (type === 'email') {
      const { result: email, tokens } = await unifiedWriterAgent.generateApplicationEmail(masterContext, generationContext);
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
      const { result: followUpEmail, tokens } = await unifiedWriterAgent.generateFollowUpEmail(masterContext, generationContext);
      trackRegenLLM('regen_follow_up_email', tokens);
      await captureReservation({ idempotencyKey: reservationKey, userId: user.id });
      return NextResponse.json({
        followUpEmail,
        creditsDeducted: CREDIT_COSTS.FOLLOW_UP_REGEN,
        tokens,
      });
    } else if (type === 'cv_section' && resolvedSection) {
      const outcome = await unifiedWriterAgent.rewriteCVSection(masterContext, resolvedSection, generationContext);
      trackRegenLLM('regen_cv_section', outcome.tokens);

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
    } else {
      await releaseReservation({ idempotencyKey: reservationKey, userId: user.id, reason: 'invalid_type' });
      return NextResponse.json(
        { error: 'Invalid type. Must be "cover-letter", "email", "follow_up_email", or "cv_section"' },
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
