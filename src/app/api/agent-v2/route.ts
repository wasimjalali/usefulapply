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
  type AgentEvent,
  type MasterContext,
} from '@/lib/agents';
import { createClient } from '@/lib/supabase/server';
import { checkAndDeductCredits, formatCreditErrorResponse } from '@/lib/middleware/creditCheck';
import { setServerSupabaseClient, clearServerSupabaseClient } from '@/lib/supabase/credits';
import { 
  extractOriginalExperience,
  extractOriginalHeadline,
  extractSectionByHeader,
  transformToGeneratedCV,
} from '@/lib/utils/cv-transformers';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface AgentRequest {
  jobDescription: string;
  currentCV: string;
  masterCV?: string;
  certifications?: string;
  action: 'full_optimization' | 'analyze_only' | 'generate_cv' | 'generate_cover_letter' | 'generate_email';
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
          enableWebSearch,
        } = body;
        
        console.log('[API_AGENT_V2] Request received:', {
          action,
          enableWebSearch,
          hasJobDescription: !!jobDescription,
          hasMasterCV: !!masterCV,
        });
        
        if (!jobDescription || !currentCV) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'Job description and CV are required' 
          })}\n\n`));
          controller.close();
          return;
        }

        // Check and deduct credits for full application (2 credits)
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

        // Send credit deduction info to client
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'credits_deducted', 
          creditsUsed: 2,
          remainingCredits: creditResult.remainingCredits,
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
                tokens: event.tokens,
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
              
            case 'tool_usage':
              // Forward tool usage events (e.g., company research) to frontend
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

        // Execute Karko AI workflow
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
              // Job info
              job: ctx.job,
              // Company research
              companyResearch: ctx.companyResearch,
              // Match info (no longer shown but kept for data)
              match: ctx.match,
              // Generated documents
              optimizedCV: ctx.optimizedCV,
              optimizedCVData: ctx.optimizedCVData,  // Solution B: Structured JSON
              coverLetter: ctx.coverLetter,
              applicationEmail: ctx.applicationEmail,
              // Full context for debugging
              context: ctx,
            };
          } else {
            throw new Error(result.error || 'Optimization failed');
          }
        } else {
          // For other actions, run full optimization
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

// Helper to extract original experience bullets from CV text
// CV transformer functions moved to @/lib/utils/cv-transformers

// Helper to get workflow steps based on action - Karko AI Unified Agent
function getWorkflowSteps(action: string): Array<{ id: string; description: string }> {
  switch (action) {
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
