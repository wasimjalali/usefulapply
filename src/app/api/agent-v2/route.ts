/**
 * Agent V2 API Route - 3-Agent Architecture
 * 
 * Flow:
 * 1. Context Agent: Gather all information
 * 2. Writer Agent: Generate all documents
 * 
 * Streams progress updates to the client for real-time UI feedback
 */

import { NextRequest } from 'next/server';
import { 
  runJobCopilot,
  type AgentEvent,
  type MasterContext,
} from '@/lib/agents';
import { createClient } from '@/lib/supabase/server';
import { deductCreditsRPC, checkCreditBalanceRPC, CREDIT_COSTS } from '@/lib/supabase/credits';
import { setServerSupabaseClient, clearServerSupabaseClient } from '@/lib/supabase/credits';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface AgentRequest {
  jobDescription: string;
  currentCV: string;
  masterCV?: string;
  certifications?: string;
  action: 'full_optimization' | 'analyze_only' | 'generate_cv' | 'generate_cover_letter' | 'generate_email';
  emailType?: 'application' | 'followup' | 'thankyou';
  writerStrategy?: string;  // NEW: Strategy from fit assessment
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
        const { jobDescription, currentCV, masterCV, certifications, action, writerStrategy } = body;
        
        console.log('[API_AGENT_V2] Request received:', {
          action,
          hasJobDescription: !!jobDescription,
          hasMasterCV: !!masterCV,
          hasWriterStrategy: !!writerStrategy,
        });
        
        if (!jobDescription || !currentCV) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'Job description and CV are required' 
          })}\n\n`));
          controller.close();
          return;
        }

        // Check if user has enough credits for full generation (1.5 credits)
        const balanceCheck = await checkCreditBalanceRPC(user.id, CREDIT_COSTS.FULL_GENERATION);
        
        if (!balanceCheck.hasEnough) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            code: 'INSUFFICIENT_CREDITS',
            message: `Insufficient credits. Required: ${CREDIT_COSTS.FULL_GENERATION}, Available: ${balanceCheck.available}`,
            details: {
              required: CREDIT_COSTS.FULL_GENERATION,
              available: balanceCheck.available,
            },
          })}\n\n`));
          controller.close();
          return;
        }

        // Send credit deduction info to client
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'credits_deducted', 
          creditsUsed: 0,
          remainingCredits: balanceCheck.available,
        })}\n\n`));

        // Set up event handler to stream progress
        const eventHandler = (event: AgentEvent) => {
          switch (event.type) {
            case 'step_started':
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'step_start',
                step: event.step.id,
                index: getStepIndex(event.step.id),
                description: event.step.description,
              })}\n\n`));
              break;
              
            case 'step_completed':
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'step_complete',
                step: event.step.id,
                index: getStepIndex(event.step.id),
              })}\n\n`));
              break;
              
            case 'step_error':
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'step_error',
                step: event.step.id,
                index: getStepIndex(event.step.id),
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
              
            case 'message':
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'message',
                content: event.content,
              })}\n\n`));
              break;
          }
        };

        // Define workflow steps
        const steps = getWorkflowSteps(action);
        
        // Send workflow start
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'workflow_start', 
          steps: steps.map((s, i) => ({ 
            function: s.id, 
            description: s.description,
            index: i,
          })),
          models: {
            analysis: 'claude-haiku-4.5',
            writing: 'claude-haiku-4.5',
          },
        })}\n\n`));

        // Execute the 3-agent workflow
        let results: Record<string, unknown> = {};

        if (action === 'full_optimization') {
          const result = await runJobCopilot({
            sessionId: `session-${Date.now()}`,
            jobDescription,
            primaryCV: currentCV,
            masterCV,
            writerStrategy,  // Pass the strategy from fit assessment
          }, eventHandler);
          
          if (result.success && result.data) {
            const ctx = result.data.context;
            
            results = {
              // Job info
              job: ctx.job,
              // Match info
              match: ctx.match,
              // Generated documents
              optimizedCV: ctx.optimizedCV,
              optimizedCVData: ctx.optimizedCVData,
              coverLetter: ctx.coverLetter,
              applicationEmail: ctx.applicationEmail,
              // Full context for debugging
              context: ctx,
            };
          } else {
            throw new Error(result.error || 'Optimization failed');
          }
        } else {
          // For other actions, run full optimization for now
          const result = await runJobCopilot({
            sessionId: `session-${Date.now()}`,
            jobDescription,
            primaryCV: currentCV,
            masterCV,
            writerStrategy,
          }, eventHandler);
          
          if (result.success && result.data) {
            results = { context: result.data.context };
          } else {
            throw new Error(result.error || 'Workflow failed');
          }
        }

        // Deduct 1.5 credits after successful generation
        const deductResult = await deductCreditsRPC(user.id, 'FULL_GENERATION', {
          description: 'Full application generation (CV + Cover Letter + Email)',
        });

        if (!deductResult.success) {
          // Log error but don't fail - generation already succeeded
          console.error('[API_AGENT_V2] Failed to deduct credits:', deductResult.error);
        }

        // Send credit deduction info to client
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'credits_deducted', 
          creditsUsed: CREDIT_COSTS.FULL_GENERATION,
          remainingCredits: deductResult.remainingCredits,
          transactionType: 'full_generation',
        })}\n\n`));

        // Send workflow complete with final results
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'workflow_complete',
          results,
        })}\n\n`));
        
        // Clear server supabase client
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

// Helper to get workflow steps based on action - 3-Agent Architecture
function getWorkflowSteps(action: string): Array<{ id: string; description: string }> {
  switch (action) {
    case 'full_optimization':
      return [
        { id: 'context', description: 'Context Agent: Gathering CV, JD, and company info' },
        { id: 'writing', description: 'Writer Agent: Generating CV, cover letter, and email' },
      ];
    default:
      return [
        { id: 'context', description: 'Context Agent: Gathering information' },
        { id: 'writing', description: 'Writer Agent: Generating documents' },
      ];
  }
}

// Helper to get step index for progress tracking
function getStepIndex(stepId: string): number {
  const stepOrder = ['context', 'writing'];
  return stepOrder.indexOf(stepId);
}
