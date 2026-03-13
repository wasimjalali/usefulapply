'use client';

import { useState, useRef, useEffect } from 'react';
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
  ChevronRight,
  FileText,
  Plus,
  History,
  Sparkles,
} from 'lucide-react';
// KarkoLogo removed — logo is now in Tier 1 global nav bar
import { useRouter } from 'next/navigation';
import { SignUpWallModal, hasUsedFreeGeneration } from '@/components/SignUpWallModal';
import { InsufficientCreditsModal } from '@/components/InsufficientCreditsModal';
import { usePostHog } from 'posthog-js/react';

interface ChatPanelProps {
  onTabChange?: (tab: 'cv' | 'cover-letter' | 'email') => void;
  isMobileDrawer?: boolean;
}

export function ChatPanel({ onTabChange, isMobileDrawer = false }: ChatPanelProps) {
  const router = useRouter();
  const { user } = useAuth();
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
    handleSend: workflowHandleSend,
    handleStopGeneration,
    runAgentWorkflow,
    setFitAnalysisContextId,
    setFitAnalysisJD,
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentSession?.chatMessages, isTyping]);

  // Auto-scroll when agent starts working
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
      case 'generate-full-application':
        posthog?.capture('apply_clicked', { mode: 'analyze_first' });
        addChatMessage({
          role: 'assistant',
          content: '🚀 Generating your full application package...',
        });
        // runAgentWorkflow sets isAgentWorking and v2Progress internally
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
        // Gate: If anonymous user has already used their free generation, show signup wall
        if (!user && hasUsedFreeGeneration()) {
          setSignUpWallTrigger('new-application');
          setShowSignUpWall(true);
          return;
        }
        posthog?.capture('new_application_started');
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
    
      <div className={`h-full flex flex-col bg-cream-50 ${isMobileDrawer ? '' : 'border-l border-cream-200'}`}>
        {/* Chat Header — simplified: "Chat" label + action icons */}
        <div className="relative px-4 py-2.5 glass-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-gold-500" />
              <span className="text-sm font-semibold text-navy-700">Chat</span>
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
            sessions={sessions.map(s => ({ id: s.id, company: s.company, jobTitle: s.jobTitle, updatedAt: s.updatedAt }))}
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
