/**
 * useAgentWorkflow — Custom hook for agent SSE workflow logic
 * 
 * Extracted from ChatPanel.tsx for modularity.
 * Handles: handleSend, handleGeneralChat, runFitAnalysisFlow, runAgentWorkflow,
 * handleStopGeneration, getSmartFallbackResponse, and all associated state.
 */

import { useState, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/contexts/AuthContext';
import { usePostHog } from 'posthog-js/react';
import { hasUsedFreeGeneration, markFreeGenerationUsed } from '@/components/SignUpWallModal';

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

export function useAgentWorkflow(options?: {
  onInsufficientCredits?: (required: number, available: number) => void;
}) {
  const { user } = useAuth();
  const posthog = usePostHog();
  const {
    currentCV,
    currentSession,
    createNewSession,
    addChatMessage,
    setJobDescription,
    isAnalyzing,
    isGenerating,
    isAgentWorking,
    setIsAgentWorking,
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
  const [applicationMode, setApplicationMode] = useState<'analyze_first' | 'apply_directly'>('analyze_first');

  const abortControllerRef = useRef<AbortController | null>(null);

  const messages = currentSession?.chatMessages || [];

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsAgentWorking(false);
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
            masterCVSummary: masterCV?.rawText?.substring(0, 1000),
            hasCertifications: certifications.length > 0,
            certificationsCount: certifications.length,
            certificationsList: certifications.map(c => c.fileName).join(', '),
            chatHistory: recentMessages,
            hasGeneratedCV: !!currentSession?.generatedCV,
            hasGeneratedCoverLetter: !!currentSession?.coverLetter,
            hasGeneratedEmail: !!currentSession?.email,
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
      } else {
        addChatMessage({
          role: 'assistant',
          content: getSmartFallbackResponse(message),
        });
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
      abortControllerRef.current = null;
    }
  };

  const runFitAnalysisFlow = async (jobDescription: string) => {
    if (!currentCV) return;
    
    setIsAgentWorking(true);
    setAgentSteps([]);
    setV2Reflection(null);
    setV2Models(null);
    setV2TokenUsage(null);
    setFitAnalysisContextId(null);
    setFitAnalysisJD(jobDescription);
    
    try {
      const { masterCV } = useAppStore.getState();
      
      abortControllerRef.current = new AbortController();
      
      const response = await fetch('/api/agent-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobDescription,
          currentCV: currentCV.rawText,
          masterCV: masterCV?.rawText,
          action: 'fit_analysis',
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
                posthog?.capture('fit_analysis_viewed', {
                  fit_score: fitAnalysis?.score,
                  fit_level: fitAnalysis?.fitLevel,
                  matching_skills_count: fitAnalysis?.matchingSkills?.length || 0,
                  missing_skills_count: fitAnalysis?.missingSkills?.length || 0,
                  job_title: job?.title,
                  company: job?.companyName,
                });
                
                const fitEmoji = 
                  fitAnalysis.fitLevel === 'strong' ? '🟢' : 
                  fitAnalysis.fitLevel === 'good' ? '🟡' : 
                  fitAnalysis.fitLevel === 'fair' ? '🟠' : '🔴';
                const fitLabel = 
                  fitAnalysis.fitLevel === 'strong' ? 'Strong Fit' : 
                  fitAnalysis.fitLevel === 'good' ? 'Good Fit' : 
                  fitAnalysis.fitLevel === 'fair' ? 'Fair Fit' : 'Weak Fit';
                
                // Limit skills display: max 10 per section, ~300 chars each
                const MAX_SKILLS_SHOWN = 6;
                const matchingAll = fitAnalysis.matchingSkills || [];
                const missingAll = fitAnalysis.missingSkills || [];
                const matchingShown = matchingAll.slice(0, MAX_SKILLS_SHOWN);
                const missingShown = missingAll.slice(0, MAX_SKILLS_SHOWN);
                const matchingExtra = matchingAll.length - matchingShown.length;
                const missingExtra = missingAll.length - missingShown.length;
                
                const matchInfo = matchingShown.length > 0 
                  ? `\n\n**Matching Skills (${matchingAll.length}):**\n${matchingShown.join(', ')}${matchingExtra > 0 ? ` *(+${matchingExtra} more)*` : ''}`
                  : '';
                const missingInfo = missingShown.length > 0
                  ? `\n\n**Missing Skills (${missingAll.length}):**\n${missingShown.join(', ')}${missingExtra > 0 ? ` *(+${missingExtra} more)*` : ''}`
                  : '';
                
                addChatMessage({
                  role: 'assistant',
                  content: `${fitEmoji} **${fitLabel}** for **${job?.title || 'this position'}** at **${job?.companyName || 'this company'}** (${fitAnalysis.score}% match)\n\n${fitAnalysis.assessment}${matchInfo}${missingInfo}`,
                  actions: [
                    { label: 'Apply for This Job', action: 'generate-full-application', icon: 'cv' },
                    { label: 'Start New Application', action: 'skip-job', icon: 'new' },
                  ],
                });
                break;
              }
              case 'error':
                if (data.code === 'INSUFFICIENT_CREDITS') {
                  const required = data.details?.details?.required ?? 0;
                  const available = data.details?.details?.available ?? 0;
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
      abortControllerRef.current = null;
    }
  };

  const runAgentWorkflow = async (jobDescription: string, contextId?: string) => {
    if (!currentCV) return;
    
    setIsAgentWorking(true);
    setAgentSteps([]);
    setV2Reflection(null);
    setV2Models(null);
    setV2TokenUsage(null);
    
    try {
      const { masterCV, certifications } = useAppStore.getState();
      const certificationsText = certifications.length > 0 
        ? certifications.map((cert: any) => `- ${cert.fileName}`).join('\n')
        : undefined;
      
      abortControllerRef.current = new AbortController();
      
      const response = await fetch('/api/agent-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobDescription,
          currentCV: currentCV.rawText,
          masterCV: masterCV?.rawText,
          certifications: certificationsText,
          action: contextId ? 'generate_with_context' : 'full_optimization',
          contextId,
          cachedContextData: contextId ? fitAnalysisContextData : undefined,
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
              
              case 'reflection':
                setV2Reflection({
                  iteration: data.iteration,
                  status: data.status,
                  improved: data.improved,
                });
                break;
                
              case 'workflow_complete':
                const { results } = data;
                const ctx = results.context;
                posthog?.capture('application_generated', {
                  mode: contextId ? 'analyze_first' : 'apply_directly',
                  job_title: ctx?.job?.title,
                  company: ctx?.job?.companyName,
                  match_score: ctx?.match?.score,
                });
                
                if (ctx?.job) {
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
                    jobTitle: ctx.job.title,
                    company: ctx.job.companyName,
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
                
                // Mark free generation as used for anonymous users
                if (!user) {
                  markFreeGenerationUsed();
                }

                addChatMessage({
                  role: 'assistant',
                  content: `✅ **Analysis Complete!**\n\nYour CV has been optimized for this role.\n\nCheck the **CV tab** to review the changes.`,
                  actions: [
                    { label: 'View Optimized CV', action: 'view-cv', icon: 'cv' },
                    { label: 'View Cover Letter', action: 'view-cover-letter', icon: 'cover-letter' },
                    { label: 'View Email', action: 'view-email', icon: 'email' },
                    { label: 'To start a new application, begin a new chat', action: 'none' },
                    { label: 'Start New Application', action: 'start-new-application', icon: 'new' },
                  ],
                });
                break;
                
              case 'error':
                if (data.code === 'INSUFFICIENT_CREDITS') {
                  const required = data.details?.details?.required ?? 0;
                  const available = data.details?.details?.available ?? 0;
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
      addChatMessage({
        role: 'assistant',
        content: '❌ Sorry, the analysis failed. Please try again.',
      });
    } finally {
      setIsAgentWorking(false);
      abortControllerRef.current = null;
    }
  };

  const handleSend = async (inputValue: string) => {
    if (!inputValue.trim()) return;

    const messageContent = inputValue.trim();

    // Gate: If anonymous user has already used their free generation and this is a new JD, show signup wall
    if (!user && hasUsedFreeGeneration()) {
      const jobKeywords = /\b(responsibilities|requirements|qualifications|experience required|skills required|about the role|job description|we are looking for|you will|must have|nice to have|salary|benefits|apply|candidate|position|vacancy)\b/i;
      const isLikelyJD = messageContent.length > 100 || jobKeywords.test(messageContent);
      if (isLikelyJD) {
        return 'show_signup_wall' as const;
      }
    }

    if (!currentSession) {
      createNewSession(messageContent);
      addChatMessage({
        role: 'user',
        content: messageContent,
      });
      
      const isJobDescription = messageContent.length > 100 || 
        /job|position|role|responsibilities|requirements|qualifications|experience/i.test(messageContent);
      
      if (isJobDescription) {
        setJobDescription(messageContent);
        setIsAgentWorking(true);
        posthog?.capture('jd_pasted', { jd_length: messageContent.length, mode: applicationMode });
        if (applicationMode === 'apply_directly') {
          setV2Progress({ percent: 0, message: 'Generating full application...' });
          runAgentWorkflow(messageContent);
        } else {
          setV2Progress({ percent: 0, message: 'Analyzing job fit...' });
          runFitAnalysisFlow(messageContent);
        }
      } else {
        handleGeneralChat(messageContent);
      }
    } else {
      addChatMessage({
        role: 'user',
        content: messageContent,
      });
      
      const jobKeywords = /\b(responsibilities|requirements|qualifications|experience required|skills required|about the role|job description|we are looking for|you will|must have|nice to have|salary|benefits|apply|candidate|position|vacancy)\b/i;
      const isLikelyJobDescription = messageContent.length > 200 && jobKeywords.test(messageContent);
      const isShortJobPost = messageContent.length > 100 && (messageContent.match(jobKeywords) || []).length >= 2;
      const isNewJobDescription = isLikelyJobDescription || isShortJobPost;
      
      if (isNewJobDescription) {
        useAppStore.getState().updateCurrentSession({
          requirements: null,
          gaps: null,
          generatedCV: null,
          matchScore: undefined,
          matchingSkills: [],
          missingSkills: [],
          suggestions: [],
        });
        
        setJobDescription(messageContent);
        setIsAgentWorking(true);
        posthog?.capture('jd_pasted', { jd_length: messageContent.length, mode: applicationMode });
        if (applicationMode === 'apply_directly') {
          setV2Progress({ percent: 0, message: 'Generating full application...' });
          runAgentWorkflow(messageContent);
        } else {
          setV2Progress({ percent: 0, message: 'Analyzing job fit...' });
          runFitAnalysisFlow(messageContent);
        }
      } else {
        handleGeneralChat(messageContent);
      }
    }

    return undefined;
  };

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
    // Actions
    handleSend,
    handleStopGeneration,
    runAgentWorkflow,
    // Setters needed by handleAction
    setFitAnalysisContextId,
    setFitAnalysisJD,
    setAgentSteps,
  };
}
