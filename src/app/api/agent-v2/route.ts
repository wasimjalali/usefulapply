/**
 * Agent V2 API Route - Karko AI Architecture
 * 
 * Karko AI handles the complete workflow:
 * 1. Parse CV and analyze job requirements
 * 2. Match skills and identify gaps
 * 3. Optimize CV for the position
 * 4. Compose tailored cover letter
 * 5. Generate application email
 * 
 * Streams progress updates to the client for real-time UI feedback
 */

import { NextRequest } from 'next/server';
import {
  runJobCopilot,
  runFitAnalysis,
  runWithContext,
  type AgentEvent,
  type MasterContext,
} from '@/lib/agents';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { checkAndDeductCredits, formatCreditErrorResponse, CREDIT_COSTS } from '@/lib/middleware/creditCheck';
import {
  extractOriginalExperience,
  extractOriginalHeadline,
  extractSectionByHeader,
  transformToGeneratedCV,
} from '@/lib/utils/cv-transformers';
import { getPostHogServer } from '@/lib/posthog-server';
import { randomUUID, createHash } from 'crypto';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

export const runtime = 'nodejs';
export const maxDuration = 300;

// =====================================================
// SERVER-SIDE CONTEXT CACHE
// Stores MasterContext from fit analysis for reuse in full generation
// TTL: 30 minutes, keyed by contextId
// =====================================================
const contextCache = new Map<string, { context: MasterContext; expiresAt: number }>();
const CONTEXT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 100; // Prevent unbounded memory growth

function cacheContext(contextId: string, context: MasterContext): void {
  // Clean up expired entries
  const now = Date.now();
  for (const [key, value] of contextCache.entries()) {
    if (value.expiresAt < now) contextCache.delete(key);
  }
  // Evict oldest entries if cache exceeds max size
  if (contextCache.size >= MAX_CACHE_SIZE) {
    const entriesToDelete = contextCache.size - MAX_CACHE_SIZE + 1;
    let deleted = 0;
    for (const key of contextCache.keys()) {
      if (deleted >= entriesToDelete) break;
      contextCache.delete(key);
      deleted++;
    }
  }
  contextCache.set(contextId, { context, expiresAt: now + CONTEXT_CACHE_TTL_MS });
}

function getCachedContext(contextId: string): MasterContext | null {
  const entry = contextCache.get(contextId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    contextCache.delete(contextId);
    return null;
  }
  return entry.context;
}

function removeCachedContext(contextId: string): void {
  contextCache.delete(contextId);
}

// Input length limits
const MAX_JOB_DESCRIPTION_LENGTH = 30_000;
const MAX_CV_LENGTH = 20_000;
const MAX_MASTER_CV_LENGTH = 30_000;

// Anonymous generation tracking helpers
function hashIP(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

function getSupabaseAdmin() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function hasAnonymousGeneration(ipHash: string): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from('anonymous_generations')
    .select('id')
    .eq('ip_hash', ipHash)
    .limit(1);
  return (data && data.length > 0) || false;
}

async function recordAnonymousGeneration(ipHash: string): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin
    .from('anonymous_generations')
    .insert({ ip_hash: ipHash });
}

interface AgentRequest {
  jobDescription: string;
  currentCV: string;
  masterCV?: string;
  action: 'full_optimization' | 'fit_analysis' | 'generate_with_context';
  contextId?: string; // For generate_with_context: references cached fit analysis context
  cachedContextData?: { // Client-side fallback when server cache misses (e.g. dev hot-reload, serverless cold start)
    applicant: MasterContext['applicant'];
    job: MasterContext['job'];
    match: MasterContext['match'];
    verifiedMetrics?: string[];
    detectedLanguage?: string;
    fitAnalysis?: MasterContext['fitAnalysis'];
  };
  emailType?: 'application' | 'followup' | 'thankyou';
  enableWebSearch?: boolean;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      // PostHog LLM analytics — hoisted above try/catch so error tracking works in catch block
      const traceId = `trace_${randomUUID()}`;
      const stepStartTimes = new Map<string, number>();
      let distinctId = 'anonymous';
      let currentAction = 'unknown';

      // Sonnet 4.6 pricing (per million tokens)
      const INPUT_COST_PER_M = 3;   // $3 per 1M input tokens
      const OUTPUT_COST_PER_M = 15;  // $15 per 1M output tokens

      const trackLLMStep = (stepId: string, tokens?: { input: number; output: number }) => {
        if (!tokens) return;
        try {
          const posthog = getPostHogServer();
          const inputCost = (tokens.input / 1_000_000) * INPUT_COST_PER_M;
          const outputCost = (tokens.output / 1_000_000) * OUTPUT_COST_PER_M;
          const totalCost = inputCost + outputCost;
          const stepStart = stepStartTimes.get(stepId);
          const latencySeconds = stepStart ? (Date.now() - stepStart) / 1000 : undefined;

          posthog.capture({
            distinctId,
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
              ...(latencySeconds !== undefined && { $ai_latency: latencySeconds }),
              // Custom properties for segmentation
              step: stepId,
              total_tokens: tokens.input + tokens.output,
              feature: currentAction === 'fit_analysis' ? 'fit_analysis' : 'application_generation',
              workflow_action: currentAction,
            },
          });
        } catch (e) {
          console.error('[PostHog] LLM tracking error:', e);
        }
      };

      // Track LLM errors to PostHog
      const trackLLMError = (stepId: string, error: unknown) => {
        try {
          const posthog = getPostHogServer();
          const stepStart = stepStartTimes.get(stepId);
          const latencySeconds = stepStart ? (Date.now() - stepStart) / 1000 : undefined;

          posthog.capture({
            distinctId,
            event: '$ai_generation',
            properties: {
              $ai_provider: 'anthropic',
              $ai_model: 'claude-sonnet-4-6',
              $ai_is_error: true,
              $ai_http_status: 500,
              $ai_trace_id: traceId,
              ...(latencySeconds !== undefined && { $ai_latency: latencySeconds }),
              $ai_error: error instanceof Error ? error.message : String(error),
              step: stepId,
              feature: currentAction === 'fit_analysis' ? 'fit_analysis' : 'application_generation',
              workflow_action: currentAction,
            },
          });
        } catch (e) {
          console.error('[PostHog] LLM error tracking error:', e);
        }
      };

      try {
        // Rate limiting
        const clientIP = getClientIP(request);
        const rateLimitResult = checkRateLimit(`agent-v2:${clientIP}`, RATE_LIMITS['agent-v2']);
        if (!rateLimitResult.allowed) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            message: 'Too many requests. Please wait a moment before trying again.',
          })}\n\n`));
          controller.close();
          return;
        }

        // Get authenticated user (optional — anonymous users get one free generation)
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const isAnonymous = !user;
        distinctId = user?.id || 'anonymous';

        // Fetch job preferences for cover letter context (best-effort, never blocks)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const typedSupabase = supabase as any;
        let jobPreferences: import('@/lib/agents/types').MasterContext['jobPreferences'] = undefined;
        if (user) {
          const { data: prefs } = await typedSupabase
            .from('user_job_preferences')
            .select('salary_floor,remote_preference,employment_types,target_market,seniority_target')
            .eq('user_id', user.id)
            .maybeSingle();
          if (prefs) {
            jobPreferences = {
              salaryFloor: prefs.salary_floor,
              remotePreference: prefs.remote_preference,
              employmentTypes: prefs.employment_types,
              targetMarket: prefs.target_market,
              seniorityTarget: prefs.seniority_target,
            };
          }
        }

        const body: AgentRequest = await request.json();
        const {
          jobDescription,
          currentCV,
          masterCV,
          action,
          contextId,
          cachedContextData,
          enableWebSearch,
        } = body;
        currentAction = action;

        // Input length validation
        if (jobDescription && jobDescription.length > MAX_JOB_DESCRIPTION_LENGTH) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            message: `Job description is too long (${jobDescription.length} chars). Maximum allowed: ${MAX_JOB_DESCRIPTION_LENGTH} characters.`,
          })}\n\n`));
          controller.close();
          return;
        }
        if (currentCV && currentCV.length > MAX_CV_LENGTH) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            message: `CV text is too long (${currentCV.length} chars). Maximum allowed: ${MAX_CV_LENGTH} characters.`,
          })}\n\n`));
          controller.close();
          return;
        }
        if (masterCV && masterCV.length > MAX_MASTER_CV_LENGTH) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            message: `Master CV text is too long (${masterCV.length} chars). Maximum allowed: ${MAX_MASTER_CV_LENGTH} characters.`,
          })}\n\n`));
          controller.close();
          return;
        }

        // Action validation
        const validActions = ['full_optimization', 'fit_analysis', 'generate_with_context'];
        if (!validActions.includes(action)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            message: 'Invalid action',
          })}\n\n`));
          controller.close();
          return;
        }

        // Server-side anonymous generation tracking
        const ipHash = hashIP(clientIP);
        if (isAnonymous) {
          const alreadyUsed = await hasAnonymousGeneration(ipHash);
          if (alreadyUsed) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              code: 'ANONYMOUS_LIMIT_REACHED',
              message: 'You have already used your free generation. Sign up for a free account to continue.',
            })}\n\n`));
            controller.close();
            return;
          }
        }

        console.log('[API_AGENT_V2] Request received:', {
          action,
          contextId,
          hasCachedContextData: !!cachedContextData,
          enableWebSearch,
          hasJobDescription: !!jobDescription,
          hasMasterCV: !!masterCV,
        });

        // Set up event handler to stream progress
        const createEventHandler = (stepIndexFn: (id: string) => number) => (event: AgentEvent) => {
          switch (event.type) {
            case 'step_started':
              stepStartTimes.set(event.step.id, Date.now());
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'step_start',
                step: event.step.id,
                index: stepIndexFn(event.step.id),
                description: event.step.description,
              })}\n\n`));
              break;
            case 'step_completed':
              trackLLMStep(event.step.id, event.tokens);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'step_complete',
                step: event.step.id,
                index: stepIndexFn(event.step.id),
                tokens: event.tokens,
              })}\n\n`));
              break;
            case 'step_error':
              trackLLMError(event.step.id, event.error);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'step_error',
                step: event.step.id,
                index: stepIndexFn(event.step.id),
                error: event.error,
              })}\n\n`));
              break;
            case 'progress':
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'progress',
                percent: event.percent,
                message: event.message,
              })}\n\n`));
              break;
            case 'tool_usage':
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'tool_usage',
                tool: event.tool,
                output: event.output,
                display: event.display,
              })}\n\n`));
              break;
            case 'message':
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'message',
                content: event.content,
              })}\n\n`));
              break;
          }
        };

        // =====================================================
        // ACTION: FIT ANALYSIS (Phase 1 only - 0.5 credits)
        // =====================================================
        if (action === 'fit_analysis') {
          if (!jobDescription || !currentCV) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'error', 
              message: 'Job description and CV are required' 
            })}\n\n`));
            controller.close();
            return;
          }

          // Deduct 0.5 credits for fit analysis (skip for anonymous users — free generation)
          if (!isAnonymous) {
            const creditResult = await checkAndDeductCredits(user!.id, 'FIT_ANALYSIS', undefined, supabase);
            if (!creditResult.success) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'error', 
                code: 'INSUFFICIENT_CREDITS',
                message: creditResult.error || 'Insufficient credits',
                details: formatCreditErrorResponse(creditResult),
              })}\n\n`));
              controller.close();
              return;
            }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'credits_deducted', 
              creditsUsed: CREDIT_COSTS.FIT_ANALYSIS,
              remainingCredits: creditResult.remainingCredits,
            })}\n\n`));
          }

          const steps = getWorkflowSteps('fit_analysis');
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'workflow_start', 
            steps: steps.map((s, i) => ({ function: s.id, description: s.description, index: i })),
            models: { analysis: 'claude-sonnet-4.6', writing: 'claude-sonnet-4.6' },
          })}\n\n`));

          const eventHandler = createEventHandler((id) => getFitAnalysisStepIndex(id));
          const sessionId = `fit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          const result = await runFitAnalysis({
            sessionId,
            jobDescription,
            primaryCV: currentCV,
            masterCV,
            jobPreferences,
          }, eventHandler);

          if (result.success && result.data) {
            const ctx = result.data.context;
            
            // Cache the context for reuse in generate_with_context
            const cachedContextId = `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            cacheContext(cachedContextId, ctx);

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'fit_analysis_complete',
              contextId: cachedContextId,
              fitAnalysis: ctx.fitAnalysis,
              job: ctx.job,
              match: ctx.match,
              // Client-side context backup for cache-miss recovery
              applicant: ctx.applicant,
              verifiedMetrics: ctx.verifiedMetrics,
              detectedLanguage: ctx.detectedLanguage,
            })}\n\n`));
          } else {
            throw new Error(result.error || 'Fit analysis failed');
          }

          // Don't record anonymous generation yet — user still needs to call
          // generate_with_context to complete the two-step flow.
          // Recording happens after phase 2 completes.

          controller.close();
          return;
        }

        // =====================================================
        // ACTION: GENERATE WITH CONTEXT (Phase 2 only - 2.0 credits)
        // Uses cached context from fit analysis
        // =====================================================
        if (action === 'generate_with_context') {
          if (!contextId) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'error', 
              message: 'Context ID is required for generate_with_context' 
            })}\n\n`));
            controller.close();
            return;
          }

          // Retrieve cached context
          let cachedContext = getCachedContext(contextId);
          
          if (!cachedContext) {
            // Validate client-sent context data structure before using it
            if (cachedContextData) {
              if (!cachedContextData.applicant || !cachedContextData.job || !cachedContextData.match) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'error',
                  message: 'Invalid context data',
                })}\n\n`));
                controller.close();
                return;
              }
            }

            // Server cache miss — try reconstructing from client-sent context data
            if (cachedContextData && cachedContextData.applicant && cachedContextData.job && cachedContextData.match && jobDescription && currentCV) {
              console.log('[API_AGENT_V2] Server cache miss, reconstructing from client-sent context data');
              cachedContext = {
                sessionId: `ctx-reconstructed-${Date.now()}`,
                jobDescription,
                rawCV: currentCV,
                masterCV,
                applicant: cachedContextData.applicant,
                job: cachedContextData.job,
                match: cachedContextData.match,
                verifiedMetrics: cachedContextData.verifiedMetrics,
                detectedLanguage: cachedContextData.detectedLanguage,
                fitAnalysis: cachedContextData.fitAnalysis,
              };
            } else if (!jobDescription || !currentCV) {
              // No fallback possible
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'error', 
                message: 'Context expired. Please run fit analysis again.' 
              })}\n\n`));
              controller.close();
              return;
            } else {
              // Last resort: neither server cache nor client data — fall back to full optimization
              console.warn('[API_AGENT_V2] Context cache miss AND no client context data, falling back to full optimization');

              if (!isAnonymous) {
                const creditResult = await checkAndDeductCredits(user!.id, 'FULL_APPLICATION', undefined, supabase);
                if (!creditResult.success) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                    type: 'error', 
                    code: 'INSUFFICIENT_CREDITS',
                    message: creditResult.error || 'Insufficient credits',
                    details: formatCreditErrorResponse(creditResult),
                  })}\n\n`));
                  controller.close();
                  return;
                }

                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                  type: 'credits_deducted', 
                  creditsUsed: CREDIT_COSTS.FULL_APPLICATION,
                  remainingCredits: creditResult.remainingCredits,
                })}\n\n`));
              }

              const steps = getWorkflowSteps('full_optimization');
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'workflow_start', 
                steps: steps.map((s, i) => ({ function: s.id, description: s.description, index: i })),
                models: { analysis: 'claude-sonnet-4.6', writing: 'claude-sonnet-4.6' },
              })}\n\n`));

              const eventHandler = createEventHandler((id) => getStepIndex(id));
              const result = await runJobCopilot({
                sessionId: `session-${Date.now()}`,
                jobDescription,
                primaryCV: currentCV,
                masterCV,
                jobPreferences,
              }, eventHandler);

              if (result.success && result.data) {
                const ctx = result.data.context;
                // Record anonymous generation server-side
                if (isAnonymous) {
                  await recordAnonymousGeneration(ipHash);
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'workflow_complete',
                  results: {
                    job: ctx.job,
                    companyResearch: ctx.companyResearch,
                    match: ctx.match,
                    optimizedCV: ctx.optimizedCV,
                    optimizedCVData: ctx.optimizedCVData,
                    coverLetter: ctx.coverLetter,
                    applicationEmail: ctx.applicationEmail,
                    followUpEmail: ctx.followUpEmail || null,
                  },
                })}\n\n`));
              } else {
                throw new Error(result.error || 'Optimization failed');
              }

              controller.close();
              return;
            }
          }

          // Context found - deduct 1.5 credits (fit was 0.5, total = 2.0; skip for anonymous)
          if (!isAnonymous) {
            const creditResult = await checkAndDeductCredits(user!.id, 'GENERATION_AFTER_FIT', undefined, supabase);
            if (!creditResult.success) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'error',
                code: 'INSUFFICIENT_CREDITS',
                message: creditResult.error || 'Insufficient credits',
                details: formatCreditErrorResponse(creditResult),
              })}\n\n`));
              controller.close();
              return;
            }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'credits_deducted',
              creditsUsed: CREDIT_COSTS.GENERATION_AFTER_FIT,
              remainingCredits: creditResult.remainingCredits,
            })}\n\n`));
          }

          const steps = getWorkflowSteps('generate_with_context');
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'workflow_start', 
            steps: steps.map((s, i) => ({ function: s.id, description: s.description, index: i })),
            models: { analysis: 'claude-sonnet-4.6', writing: 'claude-sonnet-4.6' },
          })}\n\n`));

          const eventHandler = createEventHandler((id) => getGenerateWithContextStepIndex(id));
          if (jobPreferences) cachedContext.jobPreferences = jobPreferences;
          const result = await runWithContext(cachedContext, eventHandler);

          // Remove cached context after use
          removeCachedContext(contextId);

          if (result.success && result.data) {
            const ctx = result.data.context;
            // Record anonymous generation server-side
            if (isAnonymous) {
              await recordAnonymousGeneration(ipHash);
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'workflow_complete',
              results: {
                job: ctx.job,
                companyResearch: ctx.companyResearch,
                match: ctx.match,
                optimizedCV: ctx.optimizedCV,
                optimizedCVData: ctx.optimizedCVData,
                coverLetter: ctx.coverLetter,
                applicationEmail: ctx.applicationEmail,
                followUpEmail: ctx.followUpEmail || null,
              },
            })}\n\n`));
          } else {
            throw new Error(result.error || 'Generation failed');
          }

          controller.close();
          return;
        }

        // =====================================================
        // ACTION: FULL OPTIMIZATION (legacy - runs both phases)
        // =====================================================
        if (!jobDescription || !currentCV) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'Job description and CV are required' 
          })}\n\n`));
          controller.close();
          return;
        }

        // Check and deduct credits for full application (skip for anonymous)
        if (!isAnonymous) {
          const creditResult = await checkAndDeductCredits(user!.id, 'FULL_APPLICATION', undefined, supabase);
          
          if (!creditResult.success) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'error', 
              code: 'INSUFFICIENT_CREDITS',
              message: creditResult.error || 'Insufficient credits',
              details: formatCreditErrorResponse(creditResult),
            })}\n\n`));
            controller.close();
            return;
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'credits_deducted', 
            creditsUsed: CREDIT_COSTS.FULL_APPLICATION,
            remainingCredits: creditResult.remainingCredits,
          })}\n\n`));
        }

        const steps = getWorkflowSteps(action);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'workflow_start', 
          steps: steps.map((s, i) => ({ function: s.id, description: s.description, index: i })),
          models: { analysis: 'claude-sonnet-4.6', writing: 'claude-sonnet-4.6' },
        })}\n\n`));

        const eventHandler = createEventHandler((id) => getStepIndex(id));
        let results: Record<string, unknown> = {};

        if (action === 'full_optimization') {
          const result = await runJobCopilot({
            sessionId: `session-${Date.now()}`,
            jobDescription,
            primaryCV: currentCV,
            masterCV,
            jobPreferences,
          }, eventHandler);
          
          if (result.success && result.data) {
            const ctx = result.data.context;
            results = {
              job: ctx.job,
              companyResearch: ctx.companyResearch,
              match: ctx.match,
              optimizedCV: ctx.optimizedCV,
              optimizedCVData: ctx.optimizedCVData,
              coverLetter: ctx.coverLetter,
              applicationEmail: ctx.applicationEmail,
              followUpEmail: ctx.followUpEmail || null,
            };
          } else {
            throw new Error(result.error || 'Optimization failed');
          }
        } else {
          const result = await runJobCopilot({
            sessionId: `session-${Date.now()}`,
            jobDescription,
            primaryCV: currentCV,
            masterCV,
            jobPreferences,
          }, eventHandler);

          if (result.success && result.data) {
            const ctx = result.data.context;
            results = {
              job: ctx.job,
              companyResearch: ctx.companyResearch,
              match: ctx.match,
              optimizedCV: ctx.optimizedCV,
              optimizedCVData: ctx.optimizedCVData,
              coverLetter: ctx.coverLetter,
              applicationEmail: ctx.applicationEmail,
              followUpEmail: ctx.followUpEmail || null,
            };
          } else {
            throw new Error(result.error || 'Workflow failed');
          }
        }

        // Record anonymous generation server-side
        if (isAnonymous) {
          await recordAnonymousGeneration(ipHash);
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'workflow_complete',
          results,
        })}\n\n`));

        controller.close();
        
      } catch (error) {
        // Track the top-level workflow error in PostHog
        trackLLMError('workflow', error);
        // Also capture as exception for Error Tracking dashboard
        try {
          const posthog = getPostHogServer();
          posthog.captureException(error as Error, distinctId, {
            endpoint: '/api/agent-v2',
            method: 'POST',
            workflow_action: currentAction,
          });
        } catch (_) { /* ignore PostHog errors */ }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'error', 
          message: error instanceof Error ? error.message : 'Workflow failed'
        })}\n\n`));
        controller.close();
      }
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// Helper to extract original experience bullets from CV text
// CV transformer functions moved to @/lib/utils/cv-transformers

// Helper to get workflow steps based on action - Karko AI Unified Agent
function getWorkflowSteps(action: string): Array<{ id: string; description: string }> {
  switch (action) {
    case 'fit_analysis':
      return [
        { id: 'analysis', description: 'Karko AI: Parsing CV and analyzing job requirements' },
        { id: 'matching', description: 'Karko AI: Matching skills and identifying gaps' },
        { id: 'fit_assessment', description: 'Karko AI: Assessing job fit' },
      ];
    case 'generate_with_context':
      return [
        { id: 'cv_generation', description: 'Karko AI: Optimizing CV for the position' },
        { id: 'cover_letter', description: 'Karko AI: Composing tailored cover letter' },
        { id: 'email', description: 'Karko AI: Generating application and follow-up emails' },
      ];
    case 'full_optimization':
      return [
        { id: 'analysis', description: 'Karko AI: Parsing CV and analyzing job requirements' },
        { id: 'matching', description: 'Karko AI: Matching skills and identifying gaps' },
        { id: 'cv_generation', description: 'Karko AI: Optimizing CV for the position' },
        { id: 'cover_letter', description: 'Karko AI: Composing tailored cover letter' },
        { id: 'email', description: 'Karko AI: Generating application and follow-up emails' },
      ];
    default:
      return [
        { id: 'analysis', description: 'Karko AI: Analyzing documents' },
        { id: 'generation', description: 'Karko AI: Generating content' },
      ];
  }
}

// Helper to get step index for progress tracking
function getStepIndex(stepId: string): number {
  const stepOrder = ['analysis', 'matching', 'cv_generation', 'cover_letter', 'email'];
  return stepOrder.indexOf(stepId);
}

function getFitAnalysisStepIndex(stepId: string): number {
  const stepOrder = ['analysis', 'matching', 'fit_assessment'];
  return stepOrder.indexOf(stepId);
}

function getGenerateWithContextStepIndex(stepId: string): number {
  const stepOrder = ['cv_generation', 'cover_letter', 'email'];
  return stepOrder.indexOf(stepId);
}
