/**
 * useAgentWorkflow — Custom hook for agent SSE workflow logic
 * 
 * Extracted from ChatPanel.tsx for modularity.
 * Handles: handleSend, handleGeneralChat, runFitAnalysisFlow, runAgentWorkflow,
 * handleStopGeneration, getSmartFallbackResponse, and all associated state.
 */

import { useState, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useUIStore } from '@/store/useUIStore';
import { useAuth } from '@/contexts/AuthContext';
import { usePostHog } from 'posthog-js/react';
import { hasUsedFreeGeneration, markFreeGenerationUsed } from '@/lib/anonymous-generation';
import { notifyJobFeedBadgeRefresh } from '@/hooks/useJobFeedBadge';
import { generateRequestId } from '@/lib/utils/requestId';
import { triggerCreditUpdate } from '@/lib/utils/creditEvents';
import { computeFitLevel } from '@/lib/agents/prompts/fit-assessment-prompt';
import { useToast } from '@/components/ui/Toast';
import type { JobFeedApplicationGeneration } from '@/lib/supabase/types';

// AgentStepData type for V2 progress tracking
export interface AgentStepData {
  function: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: {
    matchScore?: number;
    matchingSkills?: string[];
    missingSkills?: string[];
  };
  error?: string;
  agent?: string;
}

interface FitAnalysisContextData {
  applicant: any;
  job: any;
  match: any;
  verifiedMetrics?: string[];
  detectedLanguage?: string;
  fitAnalysis?: any;
}

function formatFitAnalysisMessage(
  fitAnalysis: any,
  job?: { title?: string; companyName?: string },
): string {
  const fitEmoji =
    fitAnalysis?.fitLevel === 'strong' ? '🟢' :
    fitAnalysis?.fitLevel === 'good' ? '🟡' :
    fitAnalysis?.fitLevel === 'fair' ? '🟠' : '🔴';
  const fitLabel =
    fitAnalysis?.fitLevel === 'strong' ? 'Strong Fit' :
    fitAnalysis?.fitLevel === 'good' ? 'Good Fit' :
    fitAnalysis?.fitLevel === 'fair' ? 'Fair Fit' : 'Weak Fit';

  const role = job?.title || 'this position';
  const company = job?.companyName || 'this company';
  const score = typeof fitAnalysis?.score === 'number' ? `${fitAnalysis.score}%` : 'N/A';

  const rawAssessment = typeof fitAnalysis?.assessment === 'string'
    ? fitAnalysis.assessment.trim()
    : '';
  const assessmentLines = rawAssessment.split('\n');
  const firstAssessmentLine = assessmentLines[0]?.trim().toLowerCase() || '';
  const assessment = firstAssessmentLine && (
    firstAssessmentLine.includes(fitLabel.toLowerCase()) ||
    firstAssessmentLine.includes(score.toLowerCase()) ||
    firstAssessmentLine.includes('match')
  )
    ? assessmentLines.slice(1).join('\n').trim()
    : rawAssessment;

  const fallbackStrengths = (fitAnalysis?.matchingSkills || [])
    .slice(0, 3)
    .map((skill: string) => `- ${skill}`);
  const fallbackGaps = (fitAnalysis?.missingSkills || [])
    .slice(0, 2)
    .map((skill: string) => `- ${skill}`);

  const details = assessment || [
    fallbackStrengths.length > 0 ? `**Strengths**\n${fallbackStrengths.join('\n')}` : '',
    fallbackGaps.length > 0 ? `**Main gaps**\n${fallbackGaps.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  const closing =
    fitAnalysis?.fitLevel === 'weak'
      ? 'This one looks weak. I would skip it unless there is a strong strategic reason to apply.'
      : 'If you want to move forward, generate the full application below.';

  return [
    `${fitEmoji} **${fitLabel}**`,
    `**Role:** ${role} at ${company}`,
    `**Match score:** ${score}`,
    details,
    closing,
  ].filter(Boolean).join('\n\n');
}

export function useAgentWorkflow(options?: {
  onInsufficientCredits?: (required: number, available: number) => void | Promise<void>;
  onAnonymousLimitReached?: () => void;
}) {
  const { user } = useAuth();
  const posthog = usePostHog();
  const { toast } = useToast();
  const { setActiveTab } = useUIStore();
  const {
    currentCV,
    currentSession,
    createNewSession,
    addChatMessage,
    setJobDescription,
    setIsAgentWorking,
    setAgentWorkflowPhase,
  } = useAppStore();

  const [isTyping, setIsTyping] = useState(false);
  const [agentSteps, setAgentSteps] = useState<AgentStepData[]>([]);
  const [v2Progress, setV2Progress] = useState<{ percent: number; message: string } | null>(null);
  const [v2Reflection, setV2Reflection] = useState<{ iteration: number; status: 'started' | 'completed'; improved?: boolean } | null>(null);
  const [v2Models, setV2Models] = useState<{ analysis: string; writing: string } | null>(null);
  const [v2TokenUsage, setV2TokenUsage] = useState<{ inputTokens: number; outputTokens: number; totalTokens: number } | null>(null);
  const [fitAnalysisContextId, setFitAnalysisContextId] = useState<string | null>(null);
  const [fitAnalysisJD, setFitAnalysisJD] = useState<string>('');
  const [fitAnalysisContextData, setFitAnalysisContextData] = useState<FitAnalysisContextData | null>(null);
  const [applicationMode, setApplicationMode] = useState<'analyze_first' | 'apply_directly'>('apply_directly');
  const [isScreeningMode, setIsScreeningMode] = useState(false);
  // True after the user picks a mode (Apply Directly / Analyze First) and we are
  // explicitly waiting for them to paste the job description. While this is set,
  // the next non-trivial message is treated as the JD — no keyword heuristics,
  // no chat fallback. Prevents the "Paste a job description…" response loop.
  const [awaitingJobDescription, setAwaitingJobDescription] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const messages = currentSession?.chatMessages || [];

  const resolveJobFeedGenerationForSession = async (
    sessionId: string
  ): Promise<JobFeedApplicationGeneration | null> => {
    try {
      const params = new URLSearchParams({ sessionId });
      const response = await fetch(`/api/job-feed/apply/generation?${params.toString()}`);
      if (!response.ok) return null;

      const data = await response.json() as { generation?: JobFeedApplicationGeneration | null };
      return data.generation ?? null;
    } catch (error) {
      console.error('Failed to resolve job feed generation from session:', error);
      return null;
    }
  };

  const syncJobFeedGenerationStatus = async (
    status: 'running' | 'succeeded' | 'failed' | 'cancelled',
    errorMessage?: string,
    sessionId = currentSession?.id,
  ) => {
    if (!user || !sessionId) return;
    let generationId = useAppStore.getState().currentSession?.jobFeedGenerationId
      ?? currentSession?.jobFeedGenerationId
      ?? null;

    if (currentSession?.id === sessionId) {
      const now = new Date().toISOString();
      useAppStore.getState().updateCurrentSession({
        generationStatus: status,
        generationError: status === 'failed' || status === 'cancelled' ? errorMessage ?? null : null,
        generationStartedAt: status === 'running' ? now : currentSession.generationStartedAt ?? null,
        generationCompletedAt: status === 'succeeded' ? now : currentSession.generationCompletedAt ?? null,
        generationFailedAt: status === 'failed' ? now : currentSession.generationFailedAt ?? null,
        generationCancelledAt: status === 'cancelled' ? now : currentSession.generationCancelledAt ?? null,
      });
    }

    if (!generationId) {
      const resolvedGeneration = await resolveJobFeedGenerationForSession(sessionId);
      generationId = resolvedGeneration?.id ?? null;

      if (resolvedGeneration && useAppStore.getState().currentSession?.id === sessionId) {
        useAppStore.getState().updateCurrentSession({
          jobFeedGenerationId: resolvedGeneration.id,
          jobFeedGenerationAttempt: resolvedGeneration.attempt,
        });
      }
    }

    if (!generationId) {
      console.warn('[job-feed] generation status not synced because no generation row was found for session:', sessionId);
      return;
    }

    try {
      await fetch('/api/job-feed/apply/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          generationId,
          status,
          errorMessage,
        }),
      });
    } catch (error) {
      console.error('Failed to sync job feed generation status:', error);
    }
  };

  const handleStopGeneration = () => {
    const stoppedSessionId = currentSession?.id;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    void syncJobFeedGenerationStatus('cancelled', 'Generation stopped by the user.', stoppedSessionId);
    setIsAgentWorking(false);
    setAgentWorkflowPhase(null);
    setIsTyping(false);
    setV2Progress(null);
    setAgentSteps([]);
    
    addChatMessage({
      role: 'assistant',
      content: '⚠️ Generation stopped. No problem! When you\'re ready, paste a new job description to start a fresh application.',
      actions: [
        {
          label: 'Start New Application',
          action: 'start-new-application',
          icon: 'new',
        }
      ],
    });
  };

  const getSmartFallbackResponse = (message: string): string => {
    const lowerMessage = message.toLowerCase();
    
    if (!currentCV) {
      return "To get started, please upload your CV in the **Documents** section. Once uploaded, paste a job description here and I'll optimize your application.";
    }
    
    if (lowerMessage.includes('help') || lowerMessage.includes('what can you do')) {
      return "I can help you with:\n\n• **Analyzing job descriptions** - Paste a job posting and I'll identify key requirements\n• **Optimizing your CV** - I'll tailor your CV to match the job\n• **Creating cover letters** - Personalized letters for each application\n• **Drafting emails** - Professional application emails\n\nJust paste a job description to get started!";
    }
    
    if (lowerMessage.includes('cv') || lowerMessage.includes('resume')) {
      return currentSession?.generatedCV 
        ? "I've already optimized your CV for this role. Check the **CV tab** to see the changes, or paste a new job description to optimize for a different position."
        : "Your CV is ready! Paste a job description and I'll optimize it for that specific role.";
    }
    
    if (lowerMessage.includes('cover letter')) {
      return currentSession?.coverLetter
        ? "Your cover letter is ready! Check the **Cover Letter tab** to review it."
        : "I'll generate a cover letter once we've analyzed a job description. Paste a job posting to get started.";
    }
    
    return "I'm here to help optimize your job applications. Paste a job description and I'll analyze it, optimize your CV, and create a tailored cover letter.";
  };

  const handleGeneralChat = async (message: string) => {
    setIsTyping(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const { masterCV, certifications } = useAppStore.getState();
      const recentMessages = messages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      // Build screening-specific context when in screening mode
      const screeningContext = isScreeningMode ? {
        mode: 'screening_answers' as const,
        jobDescription: currentSession?.jobDescription?.substring(0, 8000),
        matchingSkills: currentSession?.matchingSkills,
        missingSkills: currentSession?.missingSkills,
        generatedCVSummary: typeof currentSession?.generatedCV?.content === 'string'
          ? currentSession.generatedCV.content.substring(0, 5000)
          : undefined,
        companyResearchSummary: currentSession?.companyResearch
          ? [
              currentSession.companyResearch.description,
              currentSession.companyResearch.culture?.join(', '),
              currentSession.companyResearch.recentNews?.join(', '),
            ].filter(Boolean).join(' | ').substring(0, 500)
          : undefined,
      } : {};

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          context: {
            hasCV: !!currentCV,
            cvSummary: currentCV?.sections?.summary?.substring(0, 500),
            hasAnalysis: !!currentSession?.gaps,
            jobTitle: currentSession?.jobTitle,
            company: currentSession?.company,
            hasMasterCV: !!masterCV,
            masterCVSummary: masterCV?.rawText?.substring(0, 3000),
            hasCertifications: certifications.length > 0,
            certificationsCount: certifications.length,
            certificationsList: certifications.map(c => c.fileName).join(', '),
            chatHistory: recentMessages,
            hasGeneratedCV: !!currentSession?.generatedCV,
            hasGeneratedCoverLetter: !!currentSession?.coverLetter,
            hasGeneratedEmail: !!currentSession?.email,
            ...screeningContext,
          },
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const { reply, actions } = await response.json();
        addChatMessage({
          role: 'assistant',
          content: reply,
          actions: actions || [],
        });
      } else if (response.status === 401) {
        // Signed out (or anonymous past the free run): ask for an account, never a canned reply.
        options?.onAnonymousLimitReached?.();
      } else {
        const errorData = await response.json().catch(() => null);
        if (errorData?.code === 'CHAT_LIMIT_REACHED') {
          addChatMessage({
            role: 'assistant',
            content: 'You\'ve reached the chat message limit for this application. Start a new application to continue.',
            actions: [
              { label: 'Start New Application', action: 'start-new-application', icon: 'new' },
            ],
          });
        } else {
          addChatMessage({
            role: 'assistant',
            content: getSmartFallbackResponse(message),
          });
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      addChatMessage({
        role: 'assistant',
        content: getSmartFallbackResponse(message),
      });
    } finally {
      setIsTyping(false);
      setIsScreeningMode(false);
      abortControllerRef.current = null;
    }
  };

  /**
   * Screening answers for the kit: one question in, the raw answer blocks out.
   * Adds no chat messages itself; the caller decides what the conversation
   * shows and where the answers land (the Answers tab).
   */
  const fetchScreeningAnswers = async (
    question: string,
  ): Promise<{ ok: true; reply: string } | { ok: false; code: 'PLAN_REQUIRED' | 'CHAT_LIMIT' | 'SIGNED_OUT' | 'ERROR' }> => {
    // Own controller: this must never replace the SSE workflow's abort handle.
    const controller = new AbortController();
    try {
      const { masterCV, certifications } = useAppStore.getState();
      const recentMessages = messages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content,
      }));
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: question,
          context: {
            hasCV: !!currentCV,
            cvSummary: currentCV?.sections?.summary?.substring(0, 500),
            hasAnalysis: !!currentSession?.gaps,
            jobTitle: currentSession?.jobTitle,
            company: currentSession?.company,
            hasMasterCV: !!masterCV,
            masterCVSummary: masterCV?.rawText?.substring(0, 3000),
            hasCertifications: certifications.length > 0,
            certificationsCount: certifications.length,
            certificationsList: certifications.map(c => c.fileName).join(', '),
            chatHistory: recentMessages,
            hasGeneratedCV: !!currentSession?.generatedCV,
            hasGeneratedCoverLetter: !!currentSession?.coverLetter,
            hasGeneratedEmail: !!currentSession?.email,
            mode: 'screening_answers' as const,
            jobDescription: currentSession?.jobDescription?.substring(0, 8000),
            matchingSkills: currentSession?.matchingSkills,
            missingSkills: currentSession?.missingSkills,
            generatedCVSummary: typeof currentSession?.generatedCV?.content === 'string'
              ? currentSession.generatedCV.content.substring(0, 5000)
              : undefined,
            companyResearchSummary: currentSession?.companyResearch
              ? [
                  currentSession.companyResearch.description,
                  currentSession.companyResearch.culture?.join(', '),
                  currentSession.companyResearch.recentNews?.join(', '),
                ].filter(Boolean).join(' | ').substring(0, 500)
              : undefined,
          },
        }),
        signal: controller.signal,
      });
      if (response.ok) {
        const { reply } = await response.json();
        return typeof reply === 'string' ? { ok: true, reply } : { ok: false, code: 'ERROR' };
      }
      if (response.status === 401) return { ok: false, code: 'SIGNED_OUT' };
      if (response.status === 403) return { ok: false, code: 'PLAN_REQUIRED' };
      const errorData = await response.json().catch(() => null);
      if (errorData?.code === 'CHAT_LIMIT_REACHED') return { ok: false, code: 'CHAT_LIMIT' };
      return { ok: false, code: 'ERROR' };
    } catch {
      return { ok: false, code: 'ERROR' };
    }
  };

  const runFitAnalysisFlow = async (jobDescription: string) => {
    if (!currentCV) return;

    setIsAgentWorking(true);
    setAgentWorkflowPhase('fit_analysis');
    setAgentSteps([]);
    setV2Reflection(null);
    setV2Models(null);
    setV2TokenUsage(null);
    setFitAnalysisContextId(null);
    setFitAnalysisJD(jobDescription);
    
    try {
      const { masterCV } = useAppStore.getState();

      abortControllerRef.current = new AbortController();

      // Stable idempotency key for this workflow. Server uses it to dedupe
      // credit reservations across transient retries.
      const requestId = generateRequestId();

      const response = await fetch('/api/agent-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify({
          jobDescription,
          currentCV: currentCV.rawText,
          masterCV: masterCV?.rawText,
          action: 'fit_analysis',
          sessionId: currentSession?.id,
        }),
        signal: abortControllerRef.current.signal,
      });
      
      if (!response.ok) throw new Error('Fit analysis failed');
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');
      
      const decoder = new TextDecoder();
      let buffer = '';
      
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
                setAgentSteps(data.steps.map((s: any) => ({
                  function: s.function,
                  description: s.description,
                  status: 'pending' as const,
                })));
                if (data.models) setV2Models(data.models);
                break;
              case 'step_start':
                setAgentSteps(prev => prev.map((step, idx) => 
                  idx === data.index ? { ...step, status: 'running' as const, agent: data.agent } : step
                ));
                break;
              case 'step_complete':
                setAgentSteps(prev => prev.map((step, idx) => 
                  idx === data.index ? { ...step, status: 'completed' as const, result: data.result } : step
                ));
                break;
              case 'step_error':
                setAgentSteps(prev => prev.map((step, idx) => 
                  idx === data.index ? { ...step, status: 'error' as const, error: data.error } : step
                ));
                break;
              case 'progress':
                setV2Progress({ percent: data.percent, message: data.message });
                break;
              case 'credits_deducted':
                triggerCreditUpdate();
                break;
              case 'fit_analysis_complete': {
                const { contextId, fitAnalysis, job, match, applicant, verifiedMetrics, detectedLanguage } = data;
                setFitAnalysisContextId(contextId);
                // Store full parsed context for cache-miss recovery
                setFitAnalysisContextData({
                  applicant,
                  job,
                  match,
                  verifiedMetrics,
                  detectedLanguage,
                  fitAnalysis,
                });
                // Persist job title, company, and match data to the session
                // so tracker shows correct info if user proceeds to apply.
                // Keep a feed-provided title (e.g. "Product Manager - B2B SaaS")
                // instead of the parser's shortened title.
                if (job?.title || job?.companyName) {
                  const existing = useAppStore.getState().currentSession;
                  useAppStore.getState().updateCurrentSession({
                    jobTitle: existing?.jobTitle?.trim() || job.title || '',
                    company: existing?.company?.trim() || job.companyName || '',
                  });
                }
                if (match) {
                  useAppStore.getState().updateCurrentSession({
                    matchScore: match.score,
                    matchingSkills: match.matchingSkills || [],
                    missingSkills: match.missingSkills || [],
                  });
                }
                // Persist fit analysis state to session so it survives session switches
                useAppStore.getState().updateCurrentSession({
                  pendingFitAnalysis: {
                    contextId,
                    jobDescription: jobDescription,
                    contextData: { applicant, job, match, verifiedMetrics, detectedLanguage, fitAnalysis },
                    createdAt: new Date().toISOString(),
                  },
                });
                posthog?.capture('fit_analysis_viewed', {
                  fit_score: fitAnalysis?.score,
                  fit_level: fitAnalysis?.fitLevel,
                  matching_skills_count: fitAnalysis?.matchingSkills?.length || 0,
                  missing_skills_count: fitAnalysis?.missingSkills?.length || 0,
                  job_title: job?.title,
                  company: job?.companyName,
                });

                addChatMessage({
                  role: 'assistant',
                  content: formatFitAnalysisMessage(fitAnalysis, job),
                });
                triggerCreditUpdate();
                break;
              }
              case 'error':
                if (data.code === 'ANONYMOUS_LIMIT_REACHED') {
                  options?.onAnonymousLimitReached?.();
                } else if (data.code === 'INSUFFICIENT_CREDITS') {
                  const required = data.details?.required ?? data.details?.details?.required ?? 0;
                  const available = data.details?.available ?? data.details?.details?.available ?? 0;
                  options?.onInsufficientCredits?.(required, available);
                } else {
                  addChatMessage({
                    role: 'assistant',
                    content: `❌ Sorry, something went wrong: ${data.message}. Please try again.`,
                  });
                }
                break;
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Fit analysis stopped by user');
        return;
      }
      console.error('Fit analysis error:', error);
      addChatMessage({
        role: 'assistant',
        content: '❌ Sorry, the fit analysis failed. Please try again.',
      });
    } finally {
      setIsAgentWorking(false);
      setAgentWorkflowPhase(null);
      abortControllerRef.current = null;
    }
  };

  const runAgentWorkflow = async (jobDescription: string, contextId?: string, overrideContextData?: FitAnalysisContextData) => {
    if (!currentCV) return;
    const workflowSessionId = currentSession?.id;

    setIsAgentWorking(true);
    setAgentWorkflowPhase('full_generation');
    setV2Progress({ percent: 0, message: 'Generating full application...' });
    setAgentSteps([]);
    setV2Reflection(null);
    setV2Models(null);
    setV2TokenUsage(null);

    try {
      const { masterCV } = useAppStore.getState();

      abortControllerRef.current = new AbortController();
      void syncJobFeedGenerationStatus('running', undefined, workflowSessionId);

      // Stable idempotency key for this workflow. Server uses it to dedupe
      // credit reservations across transient retries.
      const requestId = generateRequestId();

      const contextData = overrideContextData || fitAnalysisContextData;
      const response = await fetch('/api/agent-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify({
          jobDescription,
          currentCV: currentCV.rawText,
          masterCV: masterCV?.rawText,
          action: contextId ? 'generate_with_context' : 'full_optimization',
          contextId,
          cachedContextData: contextId ? contextData : undefined,
          sessionId: workflowSessionId,
        }),
        signal: abortControllerRef.current.signal,
      });
      
      if (!response.ok) {
        throw new Error('Agent workflow failed');
      }
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');
      
      const decoder = new TextDecoder();
      let buffer = '';
      
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
                setAgentSteps(data.steps.map((s: any) => ({
                  function: s.function,
                  description: s.description,
                  status: 'pending' as const,
                })));
                if (data.models) {
                  setV2Models(data.models);
                }
                break;
                
              case 'step_start':
                setAgentSteps(prev => prev.map((step, idx) => 
                  idx === data.index ? { ...step, status: 'running' as const, agent: data.agent } : step
                ));
                break;
                
              case 'step_complete':
                setAgentSteps(prev => prev.map((step, idx) => 
                  idx === data.index ? { 
                    ...step, 
                    status: 'completed' as const,
                    result: data.result,
                  } : step
                ));
                break;
                
              case 'step_error':
                setAgentSteps(prev => prev.map((step, idx) => 
                  idx === data.index ? { 
                    ...step, 
                    status: 'error' as const,
                    error: data.error,
                  } : step
                ));
                break;
              
              case 'progress':
                setV2Progress({ percent: data.percent, message: data.message });
                break;

              case 'credits_deducted':
                triggerCreditUpdate();
                break;
              
              case 'reflection':
                setV2Reflection({
                  iteration: data.iteration,
                  status: data.status,
                  improved: data.improved,
                });
                break;
                
              case 'workflow_complete':
                const ctx = data.results;
                void syncJobFeedGenerationStatus('succeeded', undefined, workflowSessionId);
                notifyJobFeedBadgeRefresh();
                posthog?.capture('application_generated', {
                  mode: contextId ? 'analyze_first' : 'apply_directly',
                  job_title: ctx?.job?.title,
                  company: ctx?.job?.companyName,
                  match_score: ctx?.match?.score,
                });

                if (ctx?.job) {
                  const existing = useAppStore.getState().currentSession;
                  useAppStore.getState().updateCurrentSession({
                    requirements: {
                      title: ctx.job.title || '',
                      company: ctx.job.companyName || '',
                      hardSkills: ctx.job.requiredSkills || [],
                      softSkills: [],
                      experienceLevel: '',
                      keywords: [],
                      responsibilities: ctx.job.responsibilities || [],
                      niceToHave: ctx.job.niceToHaveSkills || [],
                      expectedSalary: ctx.job.expectedSalary,
                      startDate: ctx.job.startDate,
                      location: ctx.job.location,
                      workType: ctx.job.workType,
                    },
                    jobTitle: existing?.jobTitle?.trim() || ctx.job.title,
                    company: existing?.company?.trim() || ctx.job.companyName,
                  });
                }
                
                if (ctx?.match) {
                  useAppStore.getState().updateCurrentSession({
                    gaps: {
                      matchScore: ctx.match.score || 0,
                      matchingSkills: ctx.match.matchingSkills || [],
                      missingSkills: ctx.match.missingSkills || [],
                      matchingExperience: [],
                      missingExperience: [],
                      suggestions: [],
                    },
                    matchScore: ctx.match.score,
                    matchingSkills: ctx.match.matchingSkills || [],
                    missingSkills: ctx.match.missingSkills || [],
                  });
                }
                
                if (ctx?.optimizedCV) {
                  useAppStore.getState().updateCurrentSession({
                    generatedCV: {
                      content: ctx.optimizedCV.content,
                      changes: ctx.optimizedCV.changes?.map((c: { section: string; before: string; after: string; reason: string }) => ({
                        section: c.section,
                        original: c.before,
                        updated: c.after,
                        reason: c.reason,
                      })) || [],
                      optimizedFor: ctx.job?.title || 'Position',
                    },
                  });
                }
                
                if (ctx?.optimizedCVData) {
                  useAppStore.getState().updateCurrentSession({
                    optimizedCVData: ctx.optimizedCVData,
                  });
                }
                
                if (ctx?.coverLetter) {
                  useAppStore.getState().updateCurrentSession({
                    coverLetter: {
                      applicantAddress: {
                        name: '',
                        street: '',
                        city: '',
                        country: '',
                        phone: '',
                        email: '',
                      },
                      date: '',
                      companyAddress: {
                        companyName: '',
                        street: '',
                      },
                      salutation: '',
                      body: ctx.coverLetter,
                      closing: '',
                      signatureName: '',
                      updatedAt: new Date().toISOString(),
                    },
                  });
                }
                
                if (ctx?.applicationEmail) {
                  useAppStore.getState().updateCurrentSession({
                    email: {
                      subject: ctx.applicationEmail.subject || `Application for ${ctx.job?.title || 'Position'} at ${ctx.job?.companyName || 'Company'}`,
                      body: ctx.applicationEmail.body || '',
                      attachmentNote: 'Please find my CV and cover letter attached.',
                    },
                  });
                }

                if (ctx?.followUpEmail) {
                  useAppStore.getState().updateCurrentSession({
                    followUpEmail: {
                      subject: ctx.followUpEmail.subject,
                      body: ctx.followUpEmail.body,
                      recommendedDelay: ctx.followUpEmail.recommendedDelay || 5,
                    },
                  });
                }
                
                if (ctx?.companyResearch) {
                  useAppStore.getState().updateCurrentSession({
                    companyResearch: ctx.companyResearch,
                  });
                }
                
                // Clear fit analysis pending state — application is done
                setFitAnalysisContextId(null);
                setFitAnalysisJD('');
                setFitAnalysisContextData(null);
                useAppStore.getState().updateCurrentSession({ pendingFitAnalysis: null });

                // Mark free generation as used for anonymous users
                if (!user) {
                  markFreeGenerationUsed();
                }

                setActiveTab('cv');
                const resultScore =
                  typeof ctx?.match?.score === 'number'
                    ? ctx.match.score
                    : ctx?.optimizedCVData?.analysis?.ats_compatibility;
                const isDirectPath = !contextId;
                const isWeakMatch =
                  typeof resultScore === 'number' && computeFitLevel(resultScore) === 'weak';
                const weakMatchNote = isDirectPath && isWeakMatch
                  ? `\n\nThis role looks like a weak match (${Math.round(resultScore)}%). Review the gaps before you send it.`
                  : '';
                const kitCompany = ctx?.job?.companyName || useAppStore.getState().currentSession?.company;
                const atsNote = typeof ctx?.optimizedCVData?.analysis?.ats_compatibility === 'number'
                  ? ` (ATS ${Math.round(ctx.optimizedCVData.analysis.ats_compatibility)}%)`
                  : '';
                addChatMessage({
                  role: 'assistant',
                  content: `Your kit${kitCompany ? ` for ${kitCompany}` : ''} is ready. Tailored CV${atsNote}, a cover letter and two emails. Nothing was invented.${weakMatchNote}`,
                });
                if (isDirectPath && isWeakMatch) {
                  toast.warning(
                    `This role scored ${Math.round(resultScore)}%. That's a weak match. Review it before you send.`,
                  );
                }
                triggerCreditUpdate();
                break;
                
              case 'error':
                void syncJobFeedGenerationStatus('failed', data.message || 'Application generation failed.', workflowSessionId);
                if (data.code === 'ANONYMOUS_LIMIT_REACHED') {
                  options?.onAnonymousLimitReached?.();
                } else if (data.code === 'INSUFFICIENT_CREDITS') {
                  const required = data.details?.required ?? data.details?.details?.required ?? 0;
                  const available = data.details?.available ?? data.details?.details?.available ?? 0;
                  options?.onInsufficientCredits?.(required, available);
                } else {
                  addChatMessage({
                    role: 'assistant',
                    content: `❌ Sorry, something went wrong: ${data.message}. Please try again.`,
                  });
                }
                break;
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Generation stopped by user');
        return;
      }
      console.error('Agent workflow error:', error);
      void syncJobFeedGenerationStatus(
        'failed',
        error instanceof Error ? error.message : 'Application generation failed.',
        workflowSessionId,
      );
      addChatMessage({
        role: 'assistant',
        content: '❌ Sorry, the analysis failed. Please try again.',
      });
    } finally {
      setIsAgentWorking(false);
      setAgentWorkflowPhase(null);
      abortControllerRef.current = null;
    }
  };

  const handleSend = async (
    inputValue: string,
    opts?: { mode?: 'analyze_first' | 'apply_directly' },
  ) => {
    if (!inputValue.trim()) return;

    const messageContent = inputValue.trim();
    // When the caller picks an action explicitly (e.g. the hero "Generate Kit"
    // / "Check Fit" buttons), that mode wins over the stored applicationMode and
    // the paste is always treated as the JD, never re-detected by heuristics.
    const explicitMode = opts?.mode;
    const effectiveMode = explicitMode ?? applicationMode;
    if (explicitMode) setApplicationMode(explicitMode);

    // Gate: If anonymous user has already used their free generation and this is a new JD, show signup wall
    if (!user && hasUsedFreeGeneration()) {
      const jobKeywords = /\b(responsibilities|requirements|qualifications|experience required|skills required|about the role|job description|we are looking for|you will|must have|nice to have|salary|benefits|apply|candidate|position|vacancy)\b/i;
      const isLikelyJD = messageContent.length > 100 || jobKeywords.test(messageContent);
      if (isLikelyJD) {
        return 'show_signup_wall' as const;
      }
    }

    const runWorkflowForJD = (jd: string) => {
      setJobDescription(jd);
      setIsAgentWorking(true);
      setAwaitingJobDescription(false);
      posthog?.capture('jd_pasted', { jd_length: jd.length, mode: effectiveMode });
      if (effectiveMode === 'apply_directly') {
        setV2Progress({ percent: 0, message: 'Generating full application...' });
        runAgentWorkflow(jd);
      } else {
        setV2Progress({ percent: 0, message: 'Analyzing job fit...' });
        runFitAnalysisFlow(jd);
      }
    };

    if (!currentSession) {
      createNewSession(messageContent);
      addChatMessage({
        role: 'user',
        content: messageContent,
      });

      // If the user explicitly picked a mode, treat the next non-trivial message
      // as the JD regardless of keyword heuristics.
      if ((explicitMode || awaitingJobDescription) && messageContent.length >= 30) {
        runWorkflowForJD(messageContent);
        return undefined;
      }

      const isJobDescription = messageContent.length > 100 ||
        /job|position|role|responsibilities|requirements|qualifications|experience/i.test(messageContent);

      if (isJobDescription) {
        runWorkflowForJD(messageContent);
      } else {
        handleGeneralChat(messageContent);
      }
    } else {
      addChatMessage({
        role: 'user',
        content: messageContent,
      });

      // Short-circuit: user just clicked Apply Directly / Analyze First and is
      // pasting the JD. Skip heuristic detection entirely.
      if ((explicitMode || awaitingJobDescription) && !isScreeningMode && messageContent.length >= 30) {
        setFitAnalysisContextId(null);
        setFitAnalysisJD('');
        setFitAnalysisContextData(null);
        useAppStore.getState().updateCurrentSession({
          requirements: null,
          gaps: null,
          generatedCV: null,
          matchScore: undefined,
          matchingSkills: [],
          missingSkills: [],
          suggestions: [],
          pendingFitAnalysis: null,
        });
        runWorkflowForJD(messageContent);
        return undefined;
      }

      // When in screening mode, always route to chat (never re-detect as JD)
      const jobKeywords = /\b(responsibilities|requirements|qualifications|experience required|skills required|about the role|job description|we are looking for|you will|must have|nice to have|salary|benefits|apply|candidate|position|vacancy)\b/i;
      // Once an application is finished the composer is mostly edit requests,
      // so a new JD has to carry at least two job-ad markers; length plus a
      // single common word ("apply", "position") is not enough to start over.
      const sessionHasCompletedApplication = Boolean(currentSession.generatedCV);
      const isLikelyJobDescription = !isScreeningMode && !sessionHasCompletedApplication && messageContent.length > 200 && jobKeywords.test(messageContent);
      // Count with a global regex: a non-global match() returns [hit, group]
      // and would read one marker as two.
      const markerHits = (messageContent.match(new RegExp(jobKeywords.source, 'gi')) || []).length;
      const isShortJobPost = !isScreeningMode && messageContent.length > 100 && markerHits >= 2;
      const isNewJobDescription = isLikelyJobDescription || isShortJobPost;

      if (isNewJobDescription) {
        setFitAnalysisContextId(null);
        setFitAnalysisJD('');
        setFitAnalysisContextData(null);
        useAppStore.getState().updateCurrentSession({
          requirements: null,
          gaps: null,
          generatedCV: null,
          matchScore: undefined,
          matchingSkills: [],
          missingSkills: [],
          suggestions: [],
          pendingFitAnalysis: null,
        });
        runWorkflowForJD(messageContent);
      } else {
        handleGeneralChat(messageContent);
      }
    }

    return undefined;
  };

  // Intentionally NOT aborting the SSE stream on unmount: the Zustand session
  // store is a singleton, so the stream can keep updating the session in the
  // background while the user switches tabs or navigates away. The stream
  // still gets replaced if the user starts a new generation (via a fresh
  // AbortController in runAgentWorkflow / runFitAnalysisFlow).

  return {
    // State
    isTyping,
    agentSteps,
    v2Progress,
    v2Reflection,
    v2Models,
    v2TokenUsage,
    fitAnalysisContextId,
    fitAnalysisJD,
    fitAnalysisContextData,
    applicationMode,
    setApplicationMode,
    awaitingJobDescription,
    setAwaitingJobDescription,
    isScreeningMode,
    setIsScreeningMode,
    // Actions
    handleSend,
    handleGeneralChat,
    fetchScreeningAnswers,
    handleStopGeneration,
    runAgentWorkflow,
    runFitAnalysisFlow,
    // Setters needed by handleAction
    setFitAnalysisContextId,
    setFitAnalysisJD,
    setFitAnalysisContextData,
    setAgentSteps,
  };
}
