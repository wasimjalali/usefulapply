import { NextRequest, NextResponse } from 'next/server';
import { unifiedWriterAgent } from '@/lib/agents/unified-writer-agent';
import { type MasterContext } from '@/lib/agents/types';
import { createClient } from '@/lib/supabase/server';
import { checkAndDeductCredits, formatCreditErrorResponse, CREDIT_COSTS } from '@/lib/middleware/creditCheck';
import { setServerSupabaseClient, clearServerSupabaseClient } from '@/lib/supabase/credits';
import { detectLanguage } from '@/lib/utils/language-detector';
import { getPostHogServer } from '@/lib/posthog-server';
import { randomUUID } from 'crypto';

/**
 * API endpoint for regenerating cover letter or email
 * Uses the Unified Writer Agent (single agent architecture)
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Set server supabase client for credit operations
    setServerSupabaseClient(supabase);

    const body = await request.json();
    const { type, context } = body;

    if (!type || !context) {
      return NextResponse.json(
        { error: 'Missing required fields: type and context' },
        { status: 400 }
      );
    }

    // Determine credit action based on type
    const creditAction = type === 'cover-letter' ? 'COVER_LETTER_REGEN' 
      : type === 'follow_up_email' ? 'FOLLOW_UP_REGEN' 
      : 'EMAIL_REGEN';
    
    // Check and deduct credits (follow-up regen is free, others cost credits)
    const creditResult = await checkAndDeductCredits(user.id, creditAction);
    
    if (!creditResult.success) {
      return NextResponse.json(
        { 
          error: creditResult.error || 'Insufficient credits',
          code: 'INSUFFICIENT_CREDITS',
          details: formatCreditErrorResponse(creditResult),
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
      clearServerSupabaseClient();
      return NextResponse.json({ 
        coverLetter,
        creditsDeducted: CREDIT_COSTS.COVER_LETTER_REGEN,
        remainingCredits: creditResult.remainingCredits,
        tokens,
      });
    } else if (type === 'email') {
      const { result: email, tokens } = await unifiedWriterAgent.generateApplicationEmail(masterContext);
      trackRegenLLM('regen_email', tokens);
      clearServerSupabaseClient();
      return NextResponse.json({ 
        email,
        creditsDeducted: CREDIT_COSTS.EMAIL_REGEN,
        remainingCredits: creditResult.remainingCredits,
        tokens,
      });
    } else if (type === 'follow_up_email') {
      // Set applicationEmail on masterContext from the request context so follow-up can reference it
      if (context.applicationEmail) {
        masterContext.applicationEmail = context.applicationEmail;
      }
      const { result: followUpEmail, tokens } = await unifiedWriterAgent.generateFollowUpEmail(masterContext);
      trackRegenLLM('regen_follow_up_email', tokens);
      clearServerSupabaseClient();
      return NextResponse.json({ 
        followUpEmail,
        creditsDeducted: CREDIT_COSTS.FOLLOW_UP_REGEN,
        remainingCredits: creditResult.remainingCredits,
        tokens,
      });
    } else {
      clearServerSupabaseClient();
      return NextResponse.json(
        { error: 'Invalid type. Must be "cover-letter", "email", or "follow_up_email"' },
        { status: 400 }
      );
    }
  } catch (error) {
    clearServerSupabaseClient();
    console.error('[Regenerate API] Error:', error);
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
    } catch (_) { /* ignore PostHog errors */ }
    return NextResponse.json(
      { error: 'Failed to regenerate content' },
      { status: 500 }
    );
  }
}
