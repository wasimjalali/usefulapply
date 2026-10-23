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
export { runJobCopilot, runFitAnalysis, runWithContext } from './unified-writer-agent';
