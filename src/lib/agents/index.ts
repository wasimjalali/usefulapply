/**
 * Agents Index - Single Agent Architecture
 * 
 * Migrated from 3-agent system to unified single agent:
 * - Unified Writer Agent: Handles all context building and document generation
 * 
 * REMOVED:
 * - Orchestrator Agent (merged into unified)
 * - Context Agent (merged into unified)
 * - RAG System (AI-native skill matching)
 * - Company Research (relies on job description context)
 */

// Export types
export * from './types';

// Export the unified agent
export { 
  unifiedWriterAgent,
  runJobCopilot,
  type OrchestrationResult,
  type UnifiedAgentInput,
  COVER_LETTER_BLACKLIST,
} from './unified-writer-agent';

// Convenience function to run the full optimization workflow
export async function optimizeCV(
  jobDescription: string,
  primaryCV: string,
  masterCV?: string,
  options?: {
    onEvent?: import('./types').AgentEventHandler;
  }
): Promise<import('./unified-writer-agent').OrchestrationResult | null> {
  const { runJobCopilot } = await import('./unified-writer-agent');
  
  const emit = options?.onEvent || (() => {});
  
  const result = await runJobCopilot({
    sessionId: `session-${Date.now()}`,
    jobDescription,
    primaryCV,
    masterCV,
  }, emit);
  
  if (result.success && result.data) {
    return result.data;
  }
  
  console.error('CV optimization failed:', result.error);
  return null;
}
