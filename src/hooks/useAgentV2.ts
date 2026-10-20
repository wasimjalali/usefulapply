/**
 * useAgentV2 Hook
 * Handles Useful Apply unified agent workflow with streaming progress
 * 
 * Useful Apply performs:
 * 1. CV and Job Description Analysis
 * 2. Skill Matching and Gap Analysis
 * 3. Optimized CV Generation
 * 4. Cover Letter Composition
 * 5. Application Email Generation
 */

import { useState, useCallback } from 'react';
import { triggerCreditUpdate } from '@/lib/utils/creditEvents';
import { generateRequestId } from '@/lib/utils/requestId';
import type { KitDocumentErrors } from '@/lib/agents/types';
import type { StructuredCoverLetter } from '@/lib/cover-letter/contract';

export interface AgentV2Step {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  agent?: string;
  result?: unknown;
  error?: string;
  tokens?: { input: number; output: number };
}

export interface AgentV2Progress {
  percent: number;
  message: string;
}

export interface AgentV2Reflection {
  iteration: number;
  status: 'started' | 'completed';
  improved?: boolean;
}

export interface AgentV2Evaluation {
  score: number;
  passed: boolean;
  improvements: string[];
}

// Company research data from tool_usage event
export interface CompanyResearchData {
  name: string;
  description: string;
  address: string;
  culture: string[];
  values: string[];
  techStack: string[];
  recentNews: string[];
}

// Solution B: Structured CV data type (matches MasterContext.optimizedCVData)
export interface OptimizedCVData {
  personal: {
    fullName: string;
    email: string;
    phone?: string;
    currentTitle?: string;
    address?: string;
    city?: string;
    country?: string;
    linkedIn?: string;
    website?: string;
    github?: string;
    driverLicense?: string;
  };
  summary?: string;
  experience: Array<{
    id: string;
    company: string;
    position: string;
    location?: string;
    startDate: string;
    endDate?: string;
    current?: boolean;
    bullets: string[];
    technologies?: string[];
  }>;
  education: Array<{
    id: string;
    institution: string;
    degree: string;
    field?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    grade?: string;
    highlights?: string[];
  }>;
  skills: Array<{
    category: string;
    items: string[];
  }>;
  languages: Array<{
    language: string;
    proficiency: string;
  }>;
  certifications: Array<{
    id: string;
    name: string;
    issuer: string;
    date?: string;
  }>;
  // NEW: Analysis for Changes tab
  analysis?: {
    summary: string;
    key_changes: string[];
    ats_compatibility: number;
    missing_keywords_added: string[];
  };
  sectionHeaders?: {
    summary?: string;
    skills?: string;
    experience?: string;
    education?: string;
    certifications?: string;
    languages?: string;
    contact?: string;
    additionalInfo?: string;
  };
  localizedStrings?: {
    present?: string;
    gradePrefix?: string;
    degreeConnector?: string;
    photoPlaceholder?: string;
    dateOfBirthLabel?: string;
    nationalityLabel?: string;
  };
  additionalInfo?: string[];
}

export interface AgentV2Result {
  requirements?: {
    title: string;
    company: string;
    requiredSkills: string[];
    preferredSkills: string[];
    keywords: string[];
  };
  gaps?: {
    matchScore: number;
    matchingSkills: Array<{ cvSkill: string; jobSkill: string; score: number }>;
    missingSkills: string[];
    suggestions: string[];
  };
  generatedCV?: {
    summary: string;
    headline: string;
    experience: Array<{ company: string; title: string; bullets: string[] }>;
    skills: string[];
    matchScore: number;
  };
  evaluation?: AgentV2Evaluation;
  companyResearch?: CompanyResearchData;
  optimizedCVData?: OptimizedCVData;  // Solution B: Structured JSON from AI
  coverLetter?: string;  // Now directly a string
  /** The same letter as the structured contract; null when the letter failed. */
  coverLetterStructured?: StructuredCoverLetter | null;
  email?: string;        // Now directly a string
  followUpEmail?: {
    subject: string;
    body: string;
    recommendedDelay: number;
  } | null;
  /** A partial kit: the documents that failed. Their fields above are absent. */
  documentErrors?: KitDocumentErrors;
  globalContext?: unknown;
}

export interface AgentV2Options {
  enableReflection?: boolean;
  action?: 'full_optimization' | 'analyze_only' | 'generate_cv' | 'generate_cover_letter' | 'generate_email';
  emailType?: 'application' | 'followup' | 'thankyou';
}

export interface UseAgentV2Return {
  isWorking: boolean;
  steps: AgentV2Step[];
  progress: AgentV2Progress | null;
  reflection: AgentV2Reflection | null;
  result: AgentV2Result | null;
  error: string | null;
  companyResearch: CompanyResearchData | null;  // NEW: Live company research data
  models: { analysis: string; writing: string } | null;
  runWorkflow: (
    jobDescription: string,
    currentCV: string,
    masterCV?: string,
    certifications?: string,
    options?: AgentV2Options
  ) => Promise<AgentV2Result | null>;
  reset: () => void;
}

export function useAgentV2(): UseAgentV2Return {
  const [isWorking, setIsWorking] = useState(false);
  const [steps, setSteps] = useState<AgentV2Step[]>([]);
  const [progress, setProgress] = useState<AgentV2Progress | null>(null);
  const [reflection, setReflection] = useState<AgentV2Reflection | null>(null);
  const [result, setResult] = useState<AgentV2Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<{ analysis: string; writing: string } | null>(null);
  const [companyResearch, setCompanyResearch] = useState<CompanyResearchData | null>(null);

  const reset = useCallback(() => {
    setIsWorking(false);
    setSteps([]);
    setProgress(null);
    setReflection(null);
    setResult(null);
    setError(null);
    setModels(null);
    setCompanyResearch(null);
  }, []);

  const runWorkflow = useCallback(async (
    jobDescription: string,
    currentCV: string,
    masterCV?: string,
    certifications?: string,
    options: AgentV2Options = {}
  ): Promise<AgentV2Result | null> => {
    reset();
    setIsWorking(true);

    // Client-generated request id. The server uses this as the
    // idempotency-key suffix so transient reconnects on the same
    // workflow don't create duplicate reservations.
    const requestId = generateRequestId();

    try {
      const response = await fetch('/api/agent-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify({
          jobDescription,
          currentCV,
          masterCV,
          certifications,
          action: options.action || 'full_optimization',
          emailType: options.emailType,
          enableReflection: options.enableReflection ?? true,
        }),
      });

      if (!response.ok) {
        throw new Error('Agent workflow failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: AgentV2Result | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case 'workflow_start':
                setSteps(data.steps.map((s: { function: string; description: string }) => ({
                  id: s.function,
                  description: s.description,
                  status: 'pending' as const,
                })));
                if (data.models) {
                  setModels(data.models);
                }
                break;

              case 'step_start':
                setSteps(prev => prev.map((step, idx) =>
                  idx === data.index ? { ...step, status: 'running' as const, agent: data.agent } : step
                ));
                break;

              case 'step_complete':
                setSteps(prev => prev.map((step, idx) =>
                  idx === data.index ? { 
                    ...step, 
                    status: 'completed' as const, 
                    result: data.result,
                    tokens: data.tokens,
                  } : step
                ));
                break;

              case 'step_error':
                setSteps(prev => prev.map((step, idx) =>
                  idx === data.index ? { ...step, status: 'error' as const, error: data.error } : step
                ));
                break;

              case 'progress':
                setProgress({ percent: data.percent, message: data.message });
                break;

              case 'reflection':
                setReflection({
                  iteration: data.iteration,
                  status: data.status,
                  improved: data.improved,
                });
                break;

              case 'workflow_complete':
                finalResult = data.results;
                setResult(data.results);
                // Trigger credit indicator update
                triggerCreditUpdate();
                break;
              
              case 'credits_deducted':
                // Credits were deducted - trigger UI update
                console.log(`[useAgentV2] Credits deducted: ${data.creditsUsed}, remaining: ${data.remainingCredits}`);
                triggerCreditUpdate();
                break;

              case 'tool_usage':
                // NEW: Handle tool_usage events for frontend visibility
                if (data.tool === 'company_research' && data.display) {
                  setCompanyResearch(data.output as CompanyResearchData);
                  console.log('[useAgentV2] Company research received:', data.output);
                }
                break;

              case 'error':
                setError(data.message);
                break;
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        }
      }

      return finalResult;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Workflow failed';
      setError(errorMessage);
      return null;
    } finally {
      setIsWorking(false);
    }
  }, [reset]);

  return {
    isWorking,
    steps,
    progress,
    reflection,
    result,
    error,
    models,
    companyResearch,  // NEW: Expose company research data
    runWorkflow,
    reset,
  };
}
