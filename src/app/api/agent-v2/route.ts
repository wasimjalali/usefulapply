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
import { checkAndDeductCredits, formatCreditErrorResponse, CREDIT_COSTS } from '@/lib/middleware/creditCheck';
import { setServerSupabaseClient, clearServerSupabaseClient } from '@/lib/supabase/credits';
import { 
  extractOriginalExperience,
  extractOriginalHeadline,
  extractSectionByHeader,
  transformToGeneratedCV,
} from '@/lib/utils/cv-transformers';

export const runtime = 'nodejs';
export const maxDuration = 120;

// =====================================================
// SERVER-SIDE CONTEXT CACHE
// Stores MasterContext from fit analysis for reuse in full generation
// TTL: 30 minutes, keyed by contextId
// =====================================================
const contextCache = new Map<string, { context: MasterContext; expiresAt: number }>();
const CONTEXT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function cacheContext(contextId: string, context: MasterContext): void {
  // Clean up expired entries
  const now = Date.now();
  for (const [key, value] of contextCache.entries()) {
    if (value.expiresAt < now) contextCache.delete(key);
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

interface AgentRequest {
  jobDescription: string;
  currentCV: string;
  masterCV?: string;
  certifications?: string;
  action: 'full_optimization' | 'fit_analysis' | 'generate_with_context' | 'analyze_only' | 'generate_cv' | 'generate_cover_letter' | 'generate_email';
  contextId?: string; // For generate_with_context: references cached fit analysis context
  emailType?: 'application' | 'followup' | 'thankyou';
  enableWebSearch?: boolean;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Get authenticated user
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'Authentication required' 
          })}\n\n`));
          controller.close();
          return;
        }

        // Set server supabase client for credit operations
        setServerSupabaseClient(supabase);

        const body: AgentRequest = await request.json();
        const { 
          jobDescription, 
          currentCV, 
          masterCV, 
          action,
          contextId,
          enableWebSearch,
        } = body;
        
        console.log('[API_AGENT_V2] Request received:', {
          action,
          contextId,
          enableWebSearch,
          hasJobDescription: !!jobDescription,
          hasMasterCV: !!masterCV,
        });

        // Set up event handler to stream progress
        const createEventHandler = (stepIndexFn: (id: string) => number) => (event: AgentEvent) => {
          switch (event.type) {
            case 'step_started':
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'step_start',
                step: event.step.id,
                index: stepIndexFn(event.step.id),
                description: event.step.description,
              })}\n\n`));
              break;
            case 'step_completed':
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'step_complete',
                step: event.step.id,
                index: stepIndexFn(event.step.id),
                tokens: event.tokens,
              })}\n\n`));
              break;
            case 'step_error':
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

          // Deduct 0.5 credits for fit analysis
          const creditResult = await checkAndDeductCredits(user.id, 'FIT_ANALYSIS');
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

          const steps = getWorkflowSteps('fit_analysis');
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'workflow_start', 
            steps: steps.map((s, i) => ({ function: s.id, description: s.description, index: i })),
            models: { analysis: 'claude-haiku-4.5', writing: 'claude-haiku-4.5' },
          })}\n\n`));

          const eventHandler = createEventHandler((id) => getFitAnalysisStepIndex(id));
          const sessionId = `fit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          const result = await runFitAnalysis({
            sessionId,
            jobDescription,
            primaryCV: currentCV,
            masterCV,
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
            })}\n\n`));
          } else {
            throw new Error(result.error || 'Fit analysis failed');
          }

          clearServerSupabaseClient();
          controller.close();
          return;
        }

        // =====================================================
        // ACTION: GENERATE WITH CONTEXT (Phase 2 only - 1.5 credits)
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
            // Context expired or not found - fall back to full optimization
            console.warn('[API_AGENT_V2] Context cache miss, falling back to full optimization');
            
            if (!jobDescription || !currentCV) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'error', 
                message: 'Context expired. Please run fit analysis again.' 
              })}\n\n`));
              controller.close();
              return;
            }

            // Deduct full application credits (1.5) since we need to redo Phase 1
            const creditResult = await checkAndDeductCredits(user.id, 'FULL_APPLICATION');
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

            // Run full optimization as fallback
            const steps = getWorkflowSteps('full_optimization');
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'workflow_start', 
              steps: steps.map((s, i) => ({ function: s.id, description: s.description, index: i })),
              models: { analysis: 'claude-haiku-4.5', writing: 'claude-haiku-4.5' },
            })}\n\n`));

            const eventHandler = createEventHandler((id) => getStepIndex(id));
            const result = await runJobCopilot({
              sessionId: `session-${Date.now()}`,
              jobDescription,
              primaryCV: currentCV,
              masterCV,
            }, eventHandler);

            if (result.success && result.data) {
              const ctx = result.data.context;
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
                  context: ctx,
                },
              })}\n\n`));
            } else {
              throw new Error(result.error || 'Optimization failed');
            }

            clearServerSupabaseClient();
            controller.close();
            return;
          }

          // Context found - deduct 1.5 credits for generation only
          const creditResult = await checkAndDeductCredits(user.id, 'FULL_APPLICATION');
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

          const steps = getWorkflowSteps('generate_with_context');
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'workflow_start', 
            steps: steps.map((s, i) => ({ function: s.id, description: s.description, index: i })),
            models: { analysis: 'claude-haiku-4.5', writing: 'claude-haiku-4.5' },
          })}\n\n`));

          const eventHandler = createEventHandler((id) => getGenerateWithContextStepIndex(id));
          const result = await runWithContext(cachedContext, eventHandler);

          // Remove cached context after use
          removeCachedContext(contextId);

          if (result.success && result.data) {
            const ctx = result.data.context;
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
                context: ctx,
              },
            })}\n\n`));
          } else {
            throw new Error(result.error || 'Generation failed');
          }

          clearServerSupabaseClient();
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

        // Check and deduct credits for full application
        const creditResult = await checkAndDeductCredits(user.id, 'FULL_APPLICATION');
        
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

        const steps = getWorkflowSteps(action);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'workflow_start', 
          steps: steps.map((s, i) => ({ function: s.id, description: s.description, index: i })),
          models: { analysis: 'claude-haiku-4.5', writing: 'claude-haiku-4.5' },
        })}\n\n`));

        const eventHandler = createEventHandler((id) => getStepIndex(id));
        let results: Record<string, unknown> = {};

        if (action === 'full_optimization') {
          const result = await runJobCopilot({
            sessionId: `session-${Date.now()}`,
            jobDescription,
            primaryCV: currentCV,
            masterCV,
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
              context: ctx,
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
          }, eventHandler);
          
          if (result.success && result.data) {
            results = { context: result.data.context };
          } else {
            throw new Error(result.error || 'Workflow failed');
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'workflow_complete',
          results,
        })}\n\n`));
        
        clearServerSupabaseClient();
        controller.close();
        
      } catch (error) {
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
        { id: 'email', description: 'Karko AI: Generating application email' },
      ];
    case 'full_optimization':
      return [
        { id: 'analysis', description: 'Karko AI: Parsing CV and analyzing job requirements' },
        { id: 'matching', description: 'Karko AI: Matching skills and identifying gaps' },
        { id: 'cv_generation', description: 'Karko AI: Optimizing CV for the position' },
        { id: 'cover_letter', description: 'Karko AI: Composing tailored cover letter' },
        { id: 'email', description: 'Karko AI: Generating application email' },
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
