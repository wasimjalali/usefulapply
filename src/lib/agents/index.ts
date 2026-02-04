/**
 * Agents Index - 3-Agent Architecture
 * 
 * Agents:
 * 1. Orchestrator - Coordinates the workflow
 * 2. Context Agent - Gathers all information (CV parsing, JD parsing, research)
 * 3. Writer Agent - Generates all documents (CV, cover letter, email)
 */

// Export types
export * from './types';

// Export the 3 agents
export { contextAgent } from './context-agent';
export { writerAgent } from './writer-agent';
export { 
  orchestratorAgent, 
  runJobCopilot,
  type OrchestrationResult,
  type OrchestratorInput,
} from './orchestrator-agent';

// Convenience function to run the full optimization workflow
export async function optimizeCV(
  jobDescription: string,
  primaryCV: string,
  masterCV?: string,
  options?: {
    onEvent?: import('./types').AgentEventHandler;
  }
): Promise<import('./orchestrator-agent').OrchestrationResult | null> {
  const { runJobCopilot } = await import('./orchestrator-agent');
  
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
