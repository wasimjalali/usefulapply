'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card } from './ui/Card';
import { MarkdownText } from './MarkdownText';
import { ChatMessage, type ChatMessageData } from './chat/ChatMessage';
import { ChatInput } from './chat/ChatInput';
import { ChatHistory, type SessionSummary } from './chat/ChatHistory';
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
} from 'lucide-react';
import { KarkoIcon } from './KarkoLogo';
import { useRouter } from 'next/navigation';
import { SignUpWallModal, hasUsedFreeGeneration } from '@/components/SignUpWallModal';
import { InsufficientCreditsModal } from '@/components/InsufficientCreditsModal';
import { usePostHog } from 'posthog-js/react';

interface ChatPanelProps {
  onTabChange?: (tab: 'cv' | 'cover-letter' | 'email' | 'documents') => void;
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
  const [screeningPromptDismissed, setScreeningPromptDismissed] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const isNearBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight < 100;
  };

  const scrollToBottom = (force = false) => {
    if (force || isNearBottom()) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Track scroll position to show/hide scroll-to-bottom button
  const handleScroll = () => {
    setShowScrollButton(!isNearBottom());
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentSession?.chatMessages, isTyping]);

  // Auto-scroll when agent starts working (only if near bottom)
  useEffect(() => {
    if (isAgentWorking && agentSteps.length > 0) {
      scrollToBottom();
    }
  }, [isAgentWorking, agentSteps]);

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


  const handleAction = async (action: string) => {
    switch (action) {
      case 'navigate-documents':
        if (onTabChange) {
          onTabChange('documents');
        } else {
          router.push('/documents');
        }
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
        setScreeningPromptDismissed(false);
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
          content: '🔒 **Screening Question Answers** is available on the **Max plan**.\n\nWith Max, I can draft personalized answers to screening questions using the context from your CV and job description — formatted for easy copy & paste.',
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
    setScreeningPromptDismissed(false);
    setShowHistory(false);
  };

  // History + New Application buttons — rendered in mobile header OR portalled into nav bar on desktop
  const chatNavButtons = (
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

      <div className={`h-full flex flex-col bg-cream-50 ${isMobileDrawer ? '' : 'border-l border-cream-200'}`}>
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
        </div>

        {/* Messages */}
        <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-auto p-4 space-y-4 relative">
          {/* Welcome message */}
          {!currentSession && messages.length === 0 && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 h-fit">
                <KarkoIcon size="xs" theme="light" />
              </div>
              <div className="flex-1">
                <Card padding="sm" className="bg-white border-cream-200 shadow-sm">
                  {currentCV ? (
                    <MarkdownText
                      content="Your CV is ready! **Paste a job description** below and I'll optimize your CV, write a cover letter, and draft an application email."
                      className="text-sm text-charcoal"
                    />
                  ) : (
                    <p className="text-sm text-charcoal">
                      Upload your CV using the panel on the left, then paste a job description here to get started.
                    </p>
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
          compact={messages.length > 0}
          pendingFitAnalysis={
            !isAgentWorking &&
            !currentSession?.generatedCV &&
            !!(fitAnalysisContextId || (
              currentSession?.pendingFitAnalysis &&
              (Date.now() - new Date(currentSession.pendingFitAnalysis.createdAt).getTime()) < 30 * 60 * 1000
            ))
          }
          onFitAnalysisAction={(action) => {
            if (action === 'apply') {
              handleAction('generate-full-application');
            } else {
              handleAction('skip-job');
            }
          }}
          pendingScreeningPrompt={
            !isAgentWorking &&
            !isScreeningMode &&
            !screeningPromptDismissed &&
            !!currentSession?.generatedCV
          }
          onScreeningAction={(action) => {
            if (action === 'screening') {
              handleAction(
                (profile?.subscription_tier === 'max' || profile?.subscription_tier === 'pro')
                  ? 'screening-questions'
                  : 'upgrade-for-screening'
              );
              setScreeningPromptDismissed(true);
            } else {
              setScreeningPromptDismissed(true);
            }
          }}
        />
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
