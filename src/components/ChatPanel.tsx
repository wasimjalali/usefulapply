'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Card } from './ui/Card';
import { MarkdownText } from './MarkdownText';
import { ChatMessage, type ChatMessageData } from './chat/ChatMessage';
import { ChatInput } from './chat/ChatInput';
import { ChatHistory } from './chat/ChatHistory';
import { FeedbackModal } from './chat/FeedbackModal';
import { AgentProgressV2 } from './AgentProgressV2';
import { useAgentWorkflow } from './chat/useAgentWorkflow';
import { useAppStore } from '@/store/useAppStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useAuth } from '@/contexts/AuthContext';
import { submitMessageFeedback, getChatMessages } from '@/lib/supabase';
import {
  Loader2,
  Plus,
  History,
  Sparkles,
  ArrowDown,
  Zap,
  Search,
} from 'lucide-react';
import { KarkoIcon } from './KarkoLogo';
import { useRouter } from 'next/navigation';
import { SignUpWallModal, hasUsedFreeGeneration } from '@/components/SignUpWallModal';
import { InsufficientCreditsModal } from '@/components/InsufficientCreditsModal';
import { usePostHog } from 'posthog-js/react';

function readChatQuery() {
  if (typeof window === 'undefined') {
    return {
      autostart: null,
      session: null,
      search: '',
    };
  }

  const search = window.location.search;
  const searchParams = new URLSearchParams(search);
  return {
    autostart: searchParams.get('autostart'),
    session: searchParams.get('session'),
    search,
  };
}

interface ChatPanelProps {
  onTabChange?: (tab: 'cv' | 'cover-letter' | 'email') => void;
  isMobileDrawer?: boolean;
  /** When provided, History + New Application buttons are portalled into this DOM node (desktop nav bar). Header is hidden. */
  navBarPortal?: HTMLDivElement | null;
}

export function ChatPanel({ onTabChange, isMobileDrawer = false, navBarPortal }: ChatPanelProps) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const posthog = usePostHog();
  const {
    currentCV,
    currentSession,
    addChatMessage,
    setJobDescription,
    isAnalyzing,
    isGenerating,
    isAgentWorking,
    sessions,
    loadSession,
  } = useAppStore();

  // Agent workflow hook — handles all SSE logic, JD detection, fit analysis, generation
  const {
    isTyping,
    agentSteps,
    v2Progress,
    v2Reflection,
    v2Models,
    v2TokenUsage,
    fitAnalysisContextId,
    fitAnalysisJD,
    applicationMode,
    setApplicationMode,
    setAwaitingJobDescription,
    isScreeningMode,
    setIsScreeningMode,
    handleSend: workflowHandleSend,
    handleStopGeneration,
    runAgentWorkflow,
    setFitAnalysisContextId,
    setFitAnalysisJD,
    setFitAnalysisContextData,
    setAgentSteps,
  } = useAgentWorkflow({
    onInsufficientCredits: (required, available) => {
      setCreditsModalData({ required, available });
      setShowCreditsModal(true);
    },
    onAnonymousLimitReached: () => {
      setSignUpWallTrigger('new-application');
      setShowSignUpWall(true);
    },
  });

  const [inputValue, setInputValue] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [messageFeedback, setMessageFeedback] = useState<Record<string, 'positive' | 'negative'>>({});
  const [feedbackModal, setFeedbackModal] = useState<{ messageId: string; content: string; type: 'positive' | 'negative' } | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [showSignUpWall, setShowSignUpWall] = useState(false);
  const [signUpWallTrigger, setSignUpWallTrigger] = useState<'download' | 'new-application' | 'general'>('new-application');
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [creditsModalData, setCreditsModalData] = useState<{ required: number; available: number } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const isDesktopDocked = !!navBarPortal && !isMobileDrawer;

  const isNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight < 100;
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    if (force || isNearBottom()) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isNearBottom]);

  // Track scroll position to show/hide scroll-to-bottom button
  const handleScroll = () => {
    setShowScrollButton(!isNearBottom());
  };

  // Force-scroll to bottom when new messages arrive (user sent or AI responded)
  const prevMessageCount = useRef(0);
  useEffect(() => {
    const count = currentSession?.chatMessages?.length ?? 0;
    if (count > prevMessageCount.current) {
      // New message added — force scroll so user sees it
      scrollToBottom(true);
    }
    prevMessageCount.current = count;
  }, [currentSession?.chatMessages, scrollToBottom]);

  // Scroll when typing indicator appears (if near bottom)
  useEffect(() => {
    if (isTyping) scrollToBottom();
  }, [isTyping, scrollToBottom]);

  // Auto-scroll when agent starts working — force so progress is visible
  const wasWorkingRef = useRef(false);
  useEffect(() => {
    if (isAgentWorking && !wasWorkingRef.current) {
      scrollToBottom(true);
    }
    wasWorkingRef.current = isAgentWorking;
  }, [isAgentWorking, scrollToBottom]);

  // While agent is working, force-scroll on every progress/step update so the
  // user always sees the latest content even as AgentProgressV2 expands.
  useEffect(() => {
    if (isAgentWorking) {
      scrollToBottom(true);
    }
  }, [isAgentWorking, agentSteps, v2Progress, scrollToBottom]);

  // Also observe the messages container: while agent is working, any height
  // growth (e.g. progress bar + new step + token counter) should pin to bottom.
  useEffect(() => {
    if (!isAgentWorking) return;
    const container = messagesContainerRef.current;
    if (!container) return;

    let rafId: number | null = null;
    const ro = new ResizeObserver(() => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    });
    ro.observe(container);
    // Observe all child nodes too so inner growth (AgentProgressV2) is caught.
    Array.from(container.children).forEach((child) => ro.observe(child));
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [isAgentWorking]);

  const previousGeneratedStateRef = useRef<{ sessionId: string | null; hasGeneratedCV: boolean }>({
    sessionId: null,
    hasGeneratedCV: false,
  });
  const autostartedApplySessionRef = useRef<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const sessionId = currentSession?.id ?? null;
    const hasGeneratedCV = !!currentSession?.generatedCV;
    const previous = previousGeneratedStateRef.current;

    if (sessionId && previous.sessionId === sessionId && !previous.hasGeneratedCV && hasGeneratedCV) {
      onTabChange?.('cv');
    }

    previousGeneratedStateRef.current = { sessionId, hasGeneratedCV };
  }, [currentSession?.id, currentSession?.generatedCV, onTabChange]);

  const messages = currentSession?.chatMessages || [];
  const hasFreshPendingFitAnalysis = Boolean(
    currentSession?.pendingFitAnalysis?.createdAt
    && nowMs < new Date(currentSession.pendingFitAnalysis.createdAt).getTime() + 30 * 60 * 1000
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const {
      autostart,
      session: requestedSessionId,
      search,
    } = readChatQuery();

    if (autostart !== 'job-feed-apply' || !currentSession || currentSession.id !== requestedSessionId) {
      return;
    }

    const clearAutostartParam = () => {
      const nextParams = new URLSearchParams(search);
      nextParams.delete('autostart');
      const nextQuery = nextParams.toString();
      router.replace(nextQuery ? `/dashboard?${nextQuery}` : '/dashboard');
    };

    const alreadyInProgress =
      currentSession.chatMessages.length > 0 ||
      !!currentSession.generatedCV ||
      !!currentSession.pendingFitAnalysis ||
      isAgentWorking;
    if (alreadyInProgress) {
      if (autostartedApplySessionRef.current !== currentSession.id) {
        autostartedApplySessionRef.current = currentSession.id;
        clearAutostartParam();
      }
      return;
    }

    const jobDescription = currentSession.jobDescription?.trim();
    if (!currentCV || !jobDescription) {
      return;
    }

    if (autostartedApplySessionRef.current === currentSession.id) {
      return;
    }

    autostartedApplySessionRef.current = currentSession.id;
    clearAutostartParam();

    // Seed the chat with the JD so the user sees what Karko is working on, then
    // kick off Apply Directly. Bypass handleSend's heuristic routing — we know
    // this is a JD coming from the Job Feed.
    addChatMessage({ role: 'user', content: jobDescription });
    setJobDescription(jobDescription);
    setApplicationMode('apply_directly');
    setAwaitingJobDescription(false);
    posthog?.capture('jd_pasted', { jd_length: jobDescription.length, mode: 'apply_directly', source: 'job_feed_autostart' });
    void runAgentWorkflow(jobDescription);
  }, [
    addChatMessage,
    currentCV,
    currentSession,
    isAgentWorking,
    posthog,
    router,
    runAgentWorkflow,
    setApplicationMode,
    setAwaitingJobDescription,
    setJobDescription,
  ]);

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

  const handleSend = async () => {
    if (!inputValue.trim()) return;
    const result = await workflowHandleSend(inputValue.trim());
    if (result === 'show_signup_wall') {
      setSignUpWallTrigger('new-application');
      setShowSignUpWall(true);
      return;
    }
    setInputValue('');
  };

  const handleModeSelect = (mode: 'apply_directly' | 'analyze_first') => {
    setApplicationMode(mode);
    setAwaitingJobDescription(true);
    if (!currentSession) {
      useSessionStore.getState().createNewSession('');
    }
    const msg = mode === 'apply_directly'
      ? "Paste a job description below. I'll generate a tailored CV, cover letter, and application email right away."
      : "Paste a job description below. I'll first analyze how well your profile matches the role, then you can decide whether to generate the full application.";
    addChatMessage({ role: 'assistant', content: msg });
  };

  const handleAction = async (action: string) => {
    switch (action) {
      case 'navigate-documents':
        router.push('/documents');
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
      case 'generate-full-application': {
        posthog?.capture('apply_clicked', { mode: 'analyze_first' });
        addChatMessage({
          role: 'assistant',
          content: '🚀 Generating your full application package...',
        });
        // Restore from session if React state was lost (e.g., after session switch)
        const pending = currentSession?.pendingFitAnalysis;
        const ctxId = fitAnalysisContextId || pending?.contextId;
        const jd = fitAnalysisJD || pending?.jobDescription || currentSession?.jobDescription || '';
        const ctxData = pending?.contextData ?? undefined;
        if (!fitAnalysisContextId && pending) {
          setFitAnalysisContextId(pending.contextId);
          setFitAnalysisJD(pending.jobDescription);
          setFitAnalysisContextData(ctxData ?? null);
        }
        // Clear pending state from session
        useAppStore.getState().updateCurrentSession({ pendingFitAnalysis: null });
        // Pass context data directly to avoid stale closure
        runAgentWorkflow(jd, ctxId || undefined, ctxData);
        break;
      }
      case 'skip-job':
        setFitAnalysisContextId(null);
        setFitAnalysisJD('');
        setAwaitingJobDescription(false);
        // Clear pending state from session
        useAppStore.getState().updateCurrentSession({ pendingFitAnalysis: null });
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
        // Gate: If anonymous user has already used their free generation, show signup wall
        if (!user && hasUsedFreeGeneration()) {
          setSignUpWallTrigger('new-application');
          setShowSignUpWall(true);
          return;
        }
        posthog?.capture('new_application_started');
        setFitAnalysisContextId(null);
        setFitAnalysisJD('');
        setAwaitingJobDescription(false);
        useAppStore.getState().clearCurrentSession();
        useAppStore.getState().setJobDescription('');
        setJobDescription('');
        setAgentSteps([]);
        break;
      case 'screening-questions':
        posthog?.capture('screening_questions_started');
        setIsScreeningMode(true);
        addChatMessage({
          role: 'assistant',
          content: '📋 **Screening Question Mode**\n\nPaste your screening questions below and I\'ll draft personalized answers based on your CV and this job description.\n\nI\'ll format each answer separately so you can copy and paste them individually.',
        });
        break;
      case 'upgrade-for-screening':
        posthog?.capture('screening_upgrade_prompt_shown');
        addChatMessage({
          role: 'assistant',
          content: '🔒 **Screening Question Answers** is available on the **Max plan**.\n\nWith Max, I can draft personalized answers to screening questions using the context from your CV and job description, formatted for easy copy and paste.',
          actions: [
            { label: 'View Plans', action: 'navigate-pricing', icon: 'new' },
          ],
        });
        break;
      case 'navigate-pricing':
        router.push('/pricing');
        break;
    }
  };

  const handleNewApplication = () => {
    // Gate: If anonymous user has already used their free generation, show signup wall
    if (!user && hasUsedFreeGeneration()) {
      setSignUpWallTrigger('new-application');
      setShowSignUpWall(true);
      return;
    }
    useAppStore.getState().clearCurrentSession();
    useAppStore.getState().resetGenerated();
    setShowHistory(false);
  };

  // History + New Application buttons — rendered in mobile header OR portalled into nav bar on desktop
  const chatNavButtons = (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setShowHistory(!showHistory)}
        className={`p-1.5 rounded-lg transition-all cursor-pointer ${
          showHistory ? 'bg-navy-50 text-navy-600 shadow-sm' : 'text-warm-gray hover:bg-cream-100 hover:text-navy-600'
        }`}
        title="Application History"
      >
        <History className="w-4 h-4" />
      </button>
      <button
        onClick={handleNewApplication}
        className="p-1.5 rounded-lg text-warm-gray hover:bg-cream-100 hover:text-navy-600 transition-all cursor-pointer"
        title="New Application"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );

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

      {/* Portal nav buttons into main nav bar when on desktop (navBarPortal provided) */}
      {navBarPortal && createPortal(chatNavButtons, navBarPortal)}

      <div className={`h-full flex flex-col ${isDesktopDocked ? 'bg-transparent' : 'bg-cream-50'} ${isMobileDrawer ? '' : navBarPortal ? '' : 'border-l border-cream-200'}`}>
        {/* Chat Header — only shown when navBarPortal is not provided (mobile layout) */}
        {navBarPortal === undefined && (
          <div className="relative px-4 py-2.5 glass-header">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-gold-500" />
                <span className="text-sm font-semibold text-navy-700">Chat</span>
              </div>
              {chatNavButtons}
            </div>
          </div>
        )}

        {/* History Overlay */}
        <div className="relative">
        {showHistory && (
          <ChatHistory
            sessions={sessions.map(s => ({
              id: s.id,
              company: s.company,
              jobTitle: s.jobTitle,
              updatedAt: s.updatedAt,
              hasGeneratedCV: !!s.generatedCV,
              hasFitAnalysis: !!s.pendingFitAnalysis,
            }))}
            currentSessionId={currentSession?.id}
            onClose={() => setShowHistory(false)}
            onSelectSession={async (sessionId) => {
              loadSession(sessionId);
              setShowHistory(false);
              
              // On-demand: fetch chat messages from Supabase if session has none loaded
              const sessionStore = useSessionStore.getState();
              const loaded = sessionStore.sessions.find(s => s.id === sessionId);
              if (loaded && loaded.chatMessages.length === 0 && !sessionId.startsWith('session-')) {
                try {
                  const messages = await getChatMessages(sessionId);
                  // Guard: if user switched sessions during async fetch, discard stale messages
                  if (useSessionStore.getState().currentSession?.id !== sessionId) return;
                  if (messages && messages.length > 0) {
                    const mapped = messages.map((msg) => ({
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
        </div>

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className={`flex-1 overflow-auto space-y-4 relative ${
            isDesktopDocked
              ? 'px-4 pt-4 pb-3 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(248,244,234,0.22))]'
              : 'p-4'
          }`}
        >
          {/* Welcome Hero */}
          {!currentSession && messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center min-h-[280px]">
              <div className="text-center max-w-sm px-6 py-8">
                {currentCV ? (
                  <>
                    <div className="flex items-center justify-center gap-3 mb-3">
                      <KarkoIcon size="md" theme="light" />
                      <h2 className="text-lg font-bold text-navy-800">
                        {user ? 'Ready to apply?' : 'Your AI Job Application Assistant'}
                      </h2>
                    </div>
                    <p className="text-sm text-warm-gray leading-relaxed mb-6">
                      Paste a job description and I&apos;ll create a tailored CV, cover letter, and application emails.
                    </p>
                    <div className="flex flex-col gap-2.5">
                      <button
                        onClick={() => handleModeSelect('apply_directly')}
                        title="Generates your optimized CV, cover letter, and email immediately (2 credits)."
                        className="w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold bg-gradient-to-r from-navy-600 to-navy-700 text-white rounded-xl hover:from-navy-700 hover:to-navy-800 transition-all shadow-md hover:shadow-lg cursor-pointer"
                      >
                        <Zap className="w-4 h-4" />
                        Apply Directly
                      </button>
                      <button
                        onClick={() => handleModeSelect('analyze_first')}
                        title="Shows your match score and skill gaps first, then you decide whether to generate the full application (0.5 credits, then +2 if you continue)."
                        className="w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium bg-white text-charcoal border border-cream-300 rounded-xl hover:bg-cream-50 hover:border-gold-300 hover:shadow-sm transition-all cursor-pointer"
                      >
                        <Search className="w-4 h-4 text-warm-gray" />
                        Analyze Fit First
                      </button>
                      <p className="mt-1 text-[11px] leading-relaxed text-warm-gray/80">
                        <span className="font-medium text-charcoal">Apply Directly</span> generates everything at once.{' '}
                        <span className="font-medium text-charcoal">Analyze First</span> shows match score before generating.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-3 mb-3">
                      <KarkoIcon size="md" theme="light" />
                      <h2 className="text-lg font-bold text-navy-800">
                        {user ? 'Upload your CV to get started' : 'Your AI Job Application Assistant'}
                      </h2>
                    </div>
                    <p className="text-sm text-warm-gray leading-relaxed mb-4">
                      {user
                        ? 'Upload your CV from the left panel, then come back here to apply for jobs.'
                        : 'Upload your CV, paste a job description, and I\'ll create a tailored CV, cover letter, and application emails.'}
                    </p>
                  </>
                )}
                {!user && (
                  <div className="mt-6 pt-5 border-t border-cream-200">
                    <button
                      onClick={() => { setSignUpWallTrigger('general'); setShowSignUpWall(true); }}
                      className="w-full px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-gold-400 to-gold-500 text-white rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-md cursor-pointer"
                    >
                      Sign Up Free
                    </button>
                    <p className="text-xs text-warm-gray mt-3">
                      Already have an account?{' '}
                      <button
                        onClick={() => router.push('/auth/login')}
                        className="text-navy-600 hover:text-navy-700 font-medium cursor-pointer"
                      >
                        Sign in
                      </button>
                    </p>
                    <p className="text-[11px] text-warm-gray/70 mt-2 italic">
                      Try one application free, no account needed
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentSession && messages.length === 0 && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 h-fit">
                <KarkoIcon size="xs" theme="light" />
              </div>
              <div className="flex-1">
                <Card padding="sm" className="bg-white border-cream-200 shadow-sm">
                  <MarkdownText
                    content={
                      currentCV
                        ? `**${currentSession.jobTitle || 'This application'}** is ready. Karko already has the saved job description, so we can start generating from here.`
                        : `**${currentSession.jobTitle || 'This application'}** is ready from Job Feed. Upload your CV to continue the application workflow.`
                    }
                    className="text-sm text-charcoal"
                  />
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
              <div className="flex-shrink-0 h-fit">
                <KarkoIcon size="xs" theme="light" />
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
              <div className="flex-shrink-0 h-fit">
                <KarkoIcon size="xs" theme="light" />
              </div>
              <div className="flex-1">
                <AgentProgressV2 
                  steps={agentSteps.map(s => ({
                    id: s.function,
                    description: s.description,
                    status: s.status,
                    agent: s.agent,
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
              <div className="flex-shrink-0 h-fit">
                <KarkoIcon size="xs" theme="light" />
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
          
          {/* Inline follow-up: Fit analysis actions */}
          {!isAgentWorking &&
            !currentSession?.generatedCV &&
            !!(fitAnalysisContextId || hasFreshPendingFitAnalysis) && (
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => handleAction('generate-full-application')}
                className="flex items-center gap-2 rounded-full border border-navy-700 bg-navy-700 text-white px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-navy-800 hover:border-navy-800 transition-all cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                Apply for This Job
              </button>
              <button
                onClick={() => handleAction('skip-job')}
                className="flex items-center gap-2 rounded-full border border-cream-200 bg-white text-charcoal px-4 py-2.5 text-sm font-medium hover:bg-cream-50 hover:border-gold-300 transition-all cursor-pointer"
              >
                New Search
              </button>
            </div>
          )}

          {/* Inline follow-up: Screening question prompt */}
          {!isAgentWorking &&
            !isScreeningMode &&
            !!currentSession?.generatedCV &&
            (currentSession?.screeningUsageCount ?? 0) < 2 &&
            !(fitAnalysisContextId || hasFreshPendingFitAnalysis) && (
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => {
                  const isMaxPlan = profile?.subscription_tier === 'max' || profile?.subscription_tier === 'pro';
                  handleAction(isMaxPlan ? 'screening-questions' : 'upgrade-for-screening');
                  const dismissNow = !isMaxPlan;
                  useAppStore.getState().updateCurrentSession({
                    screeningUsageCount: dismissNow ? 2 : (currentSession?.screeningUsageCount ?? 0) + 1,
                  });
                }}
                className="flex items-center gap-2 rounded-full border border-navy-700 bg-navy-700 text-white px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-navy-800 hover:border-navy-800 transition-all cursor-pointer"
              >
                Answer Screening Questions
              </button>
              <button
                onClick={() => {
                  useAppStore.getState().updateCurrentSession({
                    screeningUsageCount: 2,
                  });
                }}
                className="flex items-center gap-2 rounded-full border border-cream-200 bg-white text-charcoal px-4 py-2.5 text-sm font-medium hover:bg-cream-50 hover:border-gold-300 transition-all cursor-pointer"
              >
                Skip For Now
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to bottom button */}
        {showScrollButton && (
          <div className="flex justify-center -mt-12 relative z-10 pointer-events-none">
            <button
              onClick={() => scrollToBottom(true)}
              className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white text-navy-600 rounded-full shadow-lg border border-cream-200 hover:bg-cream-50 hover:shadow-xl transition-all cursor-pointer"
            >
              <ArrowDown className="w-3 h-3" />
              New messages
            </button>
          </div>
        )}

        {/* Input Area */}
        <div className={isDesktopDocked ? 'border-t border-gold-100/80 bg-cream-50/90 px-3 pt-2.5 pb-3 backdrop-blur-sm' : ''}>
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
            compact={messages.length > 0}
            surface={isDesktopDocked ? 'embedded' : 'floating'}
          />
        </div>
      </div>

      {/* Sign Up Wall Modal */}
      <SignUpWallModal
        isOpen={showSignUpWall}
        onClose={() => setShowSignUpWall(false)}
        trigger={signUpWallTrigger}
      />

      {/* Insufficient Credits Modal */}
      <InsufficientCreditsModal
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        required={creditsModalData?.required}
        available={creditsModalData?.available}
      />
    </>
  );
}
