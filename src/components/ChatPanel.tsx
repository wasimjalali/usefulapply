'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { MarkdownText } from './MarkdownText';
import { ChatMessage, type ChatMessageData } from './chat/ChatMessage';
import { ChatInput } from './chat/ChatInput';
import { ChatHistory, type SessionSummary } from './chat/ChatHistory';
import { FeedbackModal } from './chat/FeedbackModal';
import { AgentProgressV2 } from './AgentProgressV2';
import { useAppStore } from '@/store/useAppStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useAuth } from '@/contexts/AuthContext';
import { submitMessageFeedback, getChatMessages } from '@/lib/supabase';
import { 
  Loader2,
  ChevronRight,
  FileText,
  Plus,
  History,
  Sparkles,
} from 'lucide-react';
import KarkoLogo from '@/components/KarkoLogo';

interface ChatPanelProps {
  onTabChange?: (tab: 'cv' | 'cover-letter' | 'email') => void;
  onAnalyze?: () => void;
}

// AgentStepData type for V2 progress tracking
interface AgentStepData {
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

export function ChatPanel({ onTabChange, onAnalyze }: ChatPanelProps) {
  const { user } = useAuth();
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
    sessions,
    loadSession,
  } = useAppStore();

  const [inputValue, setInputValue] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [agentSteps, setAgentSteps] = useState<AgentStepData[]>([]);
  const [v2Progress, setV2Progress] = useState<{ percent: number; message: string } | null>(null);
  const [v2Reflection, setV2Reflection] = useState<{ iteration: number; status: 'started' | 'completed'; improved?: boolean } | null>(null);
  const [v2Models, setV2Models] = useState<{ analysis: string; writing: string } | null>(null);
  const [v2TokenUsage, setV2TokenUsage] = useState<{ inputTokens: number; outputTokens: number; totalTokens: number } | null>(null);
  const [messageFeedback, setMessageFeedback] = useState<Record<string, 'positive' | 'negative'>>({});
  const [feedbackModal, setFeedbackModal] = useState<{ messageId: string; content: string; type: 'positive' | 'negative' } | null>(null);
  const [fitAnalysisContextId, setFitAnalysisContextId] = useState<string | null>(null);
  const [fitAnalysisJD, setFitAnalysisJD] = useState<string>('');
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [applicationMode, setApplicationMode] = useState<'analyze_first' | 'apply_directly'>('analyze_first');
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentSession?.chatMessages, isTyping]);

  const messages = currentSession?.chatMessages || [];

  const handleFeedbackClick = (messageId: string, content: string, type: 'positive' | 'negative') => {
    setFeedbackModal({ messageId, content, type });
  };

  const handleFeedbackSubmit = async (feedbackText: string) => {
    if (!user || !feedbackModal) return;
    
    const { messageId, content, type } = feedbackModal;
    
    setMessageFeedback(prev => ({ ...prev, [messageId]: type }));
    
    const isValidUUID = currentSession?.id && !currentSession.id.startsWith('session-');
    try {
      const { feedback, error } = await submitMessageFeedback(user.id, messageId, type, {
        sessionId: isValidUUID ? currentSession!.id : undefined,
        messageContent: content.substring(0, 500),
        feedbackText: feedbackText.trim() || undefined,
      });
      
      if (error) {
        console.error('[ChatPanel] Failed to save feedback to Supabase:', error);
      } else {
        console.log('[ChatPanel] Feedback saved successfully:', feedback?.id);
      }
    } catch (err) {
      console.error('[ChatPanel] Feedback submission error:', err);
    }
    
    setFeedbackSuccess(true);
    
    setTimeout(() => {
      setFeedbackModal(null);
      setFeedbackSuccess(false);
    }, 2000);
  };

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

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const messageContent = inputValue.trim();
    setInputValue('');

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
                const { contextId, fitAnalysis, job } = data;
                setFitAnalysisContextId(contextId);
                
                const fitEmoji = fitAnalysis.fitLevel === 'strong' ? '🟢' : fitAnalysis.fitLevel === 'good' ? '🟡' : '🔴';
                const fitLabel = fitAnalysis.fitLevel === 'strong' ? 'Strong Fit' : fitAnalysis.fitLevel === 'good' ? 'Good Fit' : 'Weak Fit';
                
                const matchInfo = fitAnalysis.matchingSkills?.length > 0 
                  ? `\n\n**Matching Skills:** ${fitAnalysis.matchingSkills.join(', ')}`
                  : '';
                const missingInfo = fitAnalysis.missingSkills?.length > 0
                  ? `\n**Missing Skills:** ${fitAnalysis.missingSkills.join(', ')}`
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
                addChatMessage({
                  role: 'assistant',
                  content: `❌ Sorry, something went wrong: ${data.message}. Please try again.`,
                });
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
                
                if (ctx?.companyResearch) {
                  useAppStore.getState().updateCurrentSession({
                    companyResearch: ctx.companyResearch,
                  });
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
                addChatMessage({
                  role: 'assistant',
                  content: `❌ Sorry, something went wrong: ${data.message}. Please try again.`,
                });
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

  const handleAction = async (action: string) => {
    switch (action) {
      case 'navigate-documents':
        window.location.href = '/documents';
        break;
      case 'view-cv':
        onTabChange?.('cv');
        break;
      case 'view-cover-letter':
        onTabChange?.('cover-letter');
        break;
      case 'view-email':
        onTabChange?.('email');
        break;
      case 'generate-full-application':
        addChatMessage({
          role: 'assistant',
          content: '🚀 Generating your full application package...',
        });
        setIsAgentWorking(true);
        setV2Progress({ percent: 0, message: 'Starting document generation...' });
        runAgentWorkflow(fitAnalysisJD, fitAnalysisContextId || undefined);
        break;
      case 'skip-job':
        setFitAnalysisContextId(null);
        setFitAnalysisJD('');
        useAppStore.getState().clearCurrentSession();
        useAppStore.getState().setJobDescription('');
        setJobDescription('');
        setAgentSteps([]);
        addChatMessage({
          role: 'assistant',
          content: 'No problem! Paste a new job description whenever you\'re ready.',
        });
        break;
      case 'start-new-application':
        setFitAnalysisContextId(null);
        setFitAnalysisJD('');
        useAppStore.getState().clearCurrentSession();
        useAppStore.getState().setJobDescription('');
        setJobDescription('');
        setAgentSteps([]);
        break;
    }
  };

  const handleNewApplication = () => {
    useAppStore.getState().clearCurrentSession();
    useAppStore.getState().resetGenerated();
    setShowHistory(false);
  };

  return (
    <>
      {feedbackModal && (
        <FeedbackModal
          type={feedbackModal.type}
          onSubmit={handleFeedbackSubmit}
          onCancel={() => setFeedbackModal(null)}
          isSuccess={feedbackSuccess}
        />
      )}
    
      <div className="h-full flex flex-col bg-cream-50 border-l border-cream-200">
        {/* Header */}
        <div className="px-4 py-3 border-b border-cream-200 bg-white shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KarkoLogo variant="full" size="xs" theme="light" />
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`p-2 rounded-lg transition-all cursor-pointer ${
                  showHistory ? 'bg-navy-50 text-navy-600 shadow-sm' : 'text-warm-gray hover:bg-cream-100 hover:text-navy-600'
                }`}
                title="Application History"
              >
                <History className="w-4 h-4" />
              </button>
              <button
                onClick={handleNewApplication}
                className="p-2 rounded-lg text-warm-gray hover:bg-cream-100 hover:text-navy-600 transition-all cursor-pointer"
                title="New Application"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* History Sidebar */}
        {showHistory && (
          <ChatHistory
            sessions={sessions as SessionSummary[]}
            currentSessionId={currentSession?.id}
            onSelectSession={async (sessionId) => {
              loadSession(sessionId);
              setShowHistory(false);
              
              // On-demand: fetch chat messages from Supabase if session has none loaded
              const sessionStore = useSessionStore.getState();
              const loaded = sessionStore.sessions.find(s => s.id === sessionId);
              if (loaded && loaded.chatMessages.length === 0 && !sessionId.startsWith('session-')) {
                try {
                  const messages = await getChatMessages(sessionId);
                  if (messages && messages.length > 0) {
                    const mapped = messages.map((msg: any) => ({
                      id: msg.id,
                      role: msg.role,
                      content: msg.content,
                      timestamp: msg.created_at,
                      actions: msg.actions || [],
                    }));
                    sessionStore.updateCurrentSession({ chatMessages: mapped });
                    // Also update in the sessions array
                    sessionStore.setSessions(
                      sessionStore.sessions.map(s => s.id === sessionId ? { ...s, chatMessages: mapped } : s)
                    );
                    console.log(`[ChatPanel] Loaded ${messages.length} messages on-demand for session ${sessionId.substring(0, 8)}...`);
                  }
                } catch (err) {
                  console.error('[ChatPanel] Error loading messages on-demand:', err);
                }
              }
            }}
          />
        )}

        {/* Messages */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Welcome message */}
          {!currentSession && messages.length === 0 && (
            <div className="flex gap-3">
              <div className="p-2 bg-gradient-to-br from-navy-600 to-navy-700 rounded-xl h-fit shadow-sm">
                <Sparkles className="w-4 h-4 text-gold-400" />
              </div>
              <div className="flex-1">
                <Card padding="sm" className="bg-white border-cream-200 shadow-sm">
                  <MarkdownText 
                    content={currentCV 
                      ? "👋 Great, your CV is uploaded! **Paste a job description** below and I'll:\n\n1. Analyze the requirements\n2. Optimize your CV for the role\n3. Generate a tailored cover letter\n\nJust paste the job posting to get started!"
                      : "👋 Welcome to Karko AI! I'm your AI-powered application assistant.\n\nTo get started:\n1. **Upload your CV** in the Documents section\n2. Paste a job description here\n3. I'll optimize everything for you!"
                    }
                    className="text-sm text-charcoal"
                  />
                  {!currentCV && (
                    <div className="mt-3">
                      <button
                        onClick={() => handleAction('navigate-documents')}
                        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-gold-400 to-gold-500 text-white rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-sm cursor-pointer"
                      >
                        <FileText className="w-4 h-4" />
                        Upload CV
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </Card>
                <p className="text-xs text-warm-gray mt-1.5 ml-1">Just now</p>
              </div>
            </div>
          )}

          {/* Chat messages */}
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message as ChatMessageData}
              onAction={handleAction}
              onFeedback={handleFeedbackClick}
              feedback={messageFeedback[message.id]}
            />
          ))}

          {/* Immediate loading indicator */}
          {isAgentWorking && agentSteps.length === 0 && v2Progress && (
            <div className="flex gap-3">
              <div className="p-2 bg-gradient-to-br from-navy-600 to-navy-700 rounded-xl h-fit flex-shrink-0 shadow-sm">
                <Sparkles className="w-4 h-4 text-gold-400" />
              </div>
              <div className="flex-1">
                <div className="bg-white rounded-lg border border-cream-200 p-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-gold-500 animate-spin" />
                    <div>
                      <p className="text-sm font-medium text-navy-800">{v2Progress.message}</p>
                      <p className="text-xs text-warm-gray mt-1">Karko AI is preparing your application...</p>
                    </div>
                  </div>
                  {v2Progress.percent > 0 && (
                    <div className="mt-3 h-1.5 bg-cream-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-gold-400 to-gold-500 transition-all duration-300"
                        style={{ width: `${v2Progress.percent}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Agent Steps Progress V2 */}
          {isAgentWorking && agentSteps.length > 0 && (
            <div className="flex gap-3">
              <div className="p-2 bg-gradient-to-br from-navy-600 to-navy-700 rounded-xl h-fit flex-shrink-0 shadow-sm">
                <Sparkles className="w-4 h-4 text-gold-400" />
              </div>
              <div className="flex-1">
                <AgentProgressV2 
                  steps={agentSteps.map(s => ({
                    id: s.function,
                    description: s.description,
                    status: s.status,
                    agent: (s as any).agent,
                    result: s.result,
                    error: s.error,
                  }))}
                  progress={v2Progress}
                  reflection={v2Reflection}
                  models={v2Models}
                  isWorking={isAgentWorking}
                  tokenUsage={v2TokenUsage || undefined}
                />
              </div>
            </div>
          )}
          
          {/* Typing indicator */}
          {(isTyping || isAnalyzing || isGenerating) && !isAgentWorking && (
            <div className="flex gap-3">
              <div className="p-2 bg-gradient-to-br from-navy-600 to-navy-700 rounded-xl h-fit flex-shrink-0 shadow-sm">
                <Sparkles className="w-4 h-4 text-gold-400" />
              </div>
              <div className="flex items-center gap-2 px-4 py-3 bg-white rounded-xl border border-cream-200 shadow-sm">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gold-400 rounded-full animate-bounce typing-dot-1" />
                  <span className="w-2 h-2 bg-gold-500 rounded-full animate-bounce typing-dot-2" />
                  <span className="w-2 h-2 bg-gold-400 rounded-full animate-bounce typing-dot-3" />
                </div>
                <span className="text-sm text-navy-600 ml-2 font-medium">
                  {isAnalyzing ? 'Karko AI is analyzing...' : isGenerating ? 'Karko AI is generating...' : 'Karko AI is thinking...'}
                </span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area with integrated mode selector */}
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          onStop={handleStopGeneration}
          disabled={!currentCV || isAnalyzing || isGenerating || isTyping}
          isWorking={isAgentWorking || isTyping}
          placeholder={currentCV 
            ? "Paste a job description or ask me anything..." 
            : "Upload your CV first to get started..."
          }
          applicationMode={applicationMode}
          onModeChange={setApplicationMode}
          showModeSelector={!!currentCV}
        />
      </div>
    </>
  );
}
