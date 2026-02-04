/**
 * Orchestrator Agent - 3-Agent Architecture
 * 
 * Flow:
 * 1. Context Agent: Gather all information (CV parsing, JD parsing, company research)
 * 2. Writer Agent: Generate all documents (CV, Cover Letter, Email)
 * 
 * Simple, linear, no loops.
 */

import type { MasterContext, AgentEventHandler, AgentResult } from './types';
import { contextAgent } from './context-agent';
import { writerAgent } from './writer-agent';

export interface OrchestrationResult {
  context: MasterContext;
  totalLatencyMs: number;
}

export interface OrchestratorInput {
  sessionId: string;
  jobDescription: string;
  primaryCV: string;
  masterCV?: string;
  writerStrategy?: string;  // NEW: Strategy from fit assessment
}

/**
 * Main orchestration function - runs the 3-agent workflow
 */
export async function runJobCopilot(
  input: OrchestratorInput,
  emit: AgentEventHandler
): Promise<AgentResult<OrchestrationResult>> {
  const startTime = Date.now();

  // Initialize MasterContext
  let context: MasterContext = {
    sessionId: input.sessionId,
    jobDescription: input.jobDescription,
    rawCV: input.primaryCV,
    masterCV: input.masterCV,
    writerStrategy: input.writerStrategy,
  };

  try {
    // ============================================
    // STEP 1: Context Building (Context Agent)
    // ============================================
    // SKIP if writerStrategy is already provided from fit assessment
    if (input.writerStrategy) {
      emit({ type: 'step_started', step: { id: 'context', description: 'Using saved context from fit assessment' } });
      emit({ type: 'progress', percent: 10, message: 'Loading saved analysis...' });
      
      // Minimal context building - just parse the basics for the writer
      // The writerStrategy contains all the intelligence from the fit assessment
      context = await contextAgent.buildMinimalContext(context, emit);
      
      emit({ type: 'step_completed', step: { id: 'context', description: 'Context loaded from fit assessment' } });
    } else {
      // Full context building (original flow)
      emit({ type: 'step_started', step: { id: 'context', description: 'Gathering all information' } });
      emit({ type: 'progress', percent: 10, message: 'Building context...' });

      context = await contextAgent.buildContext(context, emit);

      emit({ type: 'step_completed', step: { id: 'context', description: 'Context ready' } });
    }

    // Validate critical data
    if (!context.applicant?.name) {
      console.warn('[Orchestrator] WARNING: Applicant name not found in CV');
    }
    if (!context.job?.title || !context.job?.companyName) {
      console.warn('[Orchestrator] WARNING: Job title or company not found in JD');
    }

    // ============================================
    // STEP 2: Writing All Documents (Writer Agent)
    // ============================================
    emit({ type: 'step_started', step: { id: 'writing', description: 'Generating CV, cover letter, and email' } });
    emit({ type: 'progress', percent: 50, message: 'Generating documents...' });

    context = await writerAgent.generateAll(context, emit);

    emit({ type: 'step_completed', step: { id: 'writing', description: 'All documents generated' } });

    // ============================================
    // DONE
    // ============================================
    emit({ type: 'progress', percent: 100, message: 'Complete!' });

    return {
      success: true,
      data: {
        context,
        totalLatencyMs: Date.now() - startTime,
      },
      latencyMs: Date.now() - startTime,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Orchestration failed';
    console.error('[Orchestrator] Error:', errorMessage);

    emit({ type: 'step_error', step: { id: 'orchestrate' }, error: errorMessage });

    return {
      success: false,
      error: errorMessage,
      latencyMs: Date.now() - startTime,
    };
  }
}

// Legacy class wrapper for backward compatibility
export class OrchestratorAgent {
  private eventHandler: AgentEventHandler | null = null;

  setEventHandler(handler: AgentEventHandler): void {
    this.eventHandler = handler;
  }

  async execute(input: OrchestratorInput): Promise<AgentResult<OrchestrationResult>> {
    const emit = this.eventHandler || (() => {});
    return runJobCopilot(input, emit);
  }
}

export const orchestratorAgent = new OrchestratorAgent();
