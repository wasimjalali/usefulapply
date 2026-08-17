'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
import { useUIStore } from '@/store/useUIStore';
import { useAuth } from '@/contexts/AuthContext';
import { submitMessageFeedback, getChatMessages } from '@/lib/supabase';
import {
  Loader2,
  Plus,
  History,
  Sparkles,
  ArrowDown,
  ArrowRight,
  Zap,
  Search,
} from 'lucide-react';
import { BrandIcon } from './BrandLogo';
import { useRouter, useSearchParams } from 'next/navigation';
import { SignUpWallModal, hasUsedFreeGeneration } from '@/components/SignUpWallModal';
import { InsufficientCreditsModal } from '@/components/InsufficientCreditsModal';
import { usePostHog } from 'posthog-js/react';

// Module-level dedupe set for Job Feed autostart. Kept as a safety net in
// case the dashboard ever navigates between two sessions fast enough that
// React has not finished unmounting the previous ChatPanel. ChatPanel
// itself only renders on desktop/tablet (mobile shows a "Best on desktop"
// screen), so we no longer have a desktop+mobile dual-mount race.
const autostartedApplySessionIds = new Set<string>();

function buildJobFeedAutostartKey(params: {
  sessionId: string;
  generationId?: string | null;
  generationAttempt?: number | null;
}): string {
  return [
    params.sessionId,
    params.generationId ?? 'no-generation',
    params.generationAttempt ?? 0,
  ].join(':');
}

interface ChatPanelProps {
  onTabChange?: (tab: 'cv' | 'cover-letter' | 'email') => void;
  isMobileDrawer?: boolean;
  /** True when the panel is docked as the desktop right-hand column. */
  docked?: boolean;
}

export function ChatPanel({ onTabChange, isMobileDrawer = false, docked = false }: ChatPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
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
    setApplicationMode,
    setAwaitingJobDescription,
    isScreeningMode,
    setIsScreeningMode,
    handleSend: workflowHandleSend,
    handleStopGeneration,
    runAgentWorkflow,
    runFitAnalysisFlow,
    setFitAnalysisContextId,
    setFitAnalysisJD,
    setFitAnalysisContextData,
    setAgentSteps,
  } = useAgentWorkflow({
    onInsufficientCredits: async (required, available) => {
      // Server-reported `available` can be stale or zero due to a reservation
      // race. Verify with the live balance before showing the out-of-credits
      // modal — users with hundreds of credits should not see "0 remaining".
      let liveAvailable = available;
      try {
        const res = await fetch('/api/credits/balance');
        if (res.ok) {
          const data = await res.json();
          if (typeof data?.total === 'number') {
            liveAvailable = data.total;
          }
        }
      } catch {
        // Fall through to the server-reported value.
      }
      if (liveAvailable >= required) {
        // False positive. Surface a recoverable error instead of the upsell.
        addChatMessage({
          role: 'assistant',
          content: '❌ Sorry, something went wrong during generation. Your credits were not charged. Please try again.',
        });
        return;
      }
      setCreditsModalData({ required, available: liveAvailable });
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
  const isDesktopDocked = docked && !isMobileDrawer;

  // Welcome-hero action state: the JD lives in the same input box the user
  // already types into. Actions stay inert until a real JD is present, then
  // light up once (no looping animation).
  const HERO_MIN_JD = 80;
  const heroJdLength = inputValue.trim().length;
  const heroJdValid = heroJdLength >= HERO_MIN_JD;
  const heroJdTooShort = heroJdLength > 0 && !heroJdValid;
  const [heroJustActivated, setHeroJustActivated] = useState(false);
  const heroPrevValidRef = useRef(false);
  useEffect(() => {
    if (heroJdValid && !heroPrevValidRef.current) {
      setHeroJustActivated(true);
      const t = setTimeout(() => setHeroJustActivated(false), 900);
      heroPrevValidRef.current = heroJdValid;
      return () => clearTimeout(t);
    }
    heroPrevValidRef.current = heroJdValid;
  }, [heroJdValid]);

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

  // The launchpad owns the JD input, so the composer stays hidden while it is
  // on screen. Shown when nothing is in flight: no session at all, or a session
  // that never received a job description and produced nothing.
  //
  // Deliberately NOT keyed on `messages.length === 0` alone. A session loaded
  // from history has an empty local message array until the Supabase fetch
  // resolves (see onSelectSession below), and the Job Feed handoff arrives with
  // a saved job description and no messages — both would flash the launchpad
  // over real work.
  const isLaunchpadState = Boolean(
    currentCV
    && (
      !currentSession
      || (
        !currentSession.jobDescription
        && !currentSession.generatedCV
        && messages.length === 0
      )
    )
  );

  // Without a CV there is no JD form to show, only the upload prompt — but that
  // prompt still belongs in this same welcome block.
  const showWelcomeHero = isLaunchpadState || !currentSession;

  // Cross-panel focus: the CV panel's "Tailor for a job" CTA lands here. Focus
  // whichever JD field is mounted and ring it once so the eye follows across
  // the ~440px gap between the two columns.
  const jdFocusRequest = useUIStore((state) => state.jdFocusRequest);
  const heroTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [heroFocusRing, setHeroFocusRing] = useState(false);
  // Seeded from the current value, not from 0. The store is module-level and
  // survives client-side navigation, so comparing against 0 would re-fire the
  // focus on every remount (e.g. returning from /documents) with no user click.
  const handledJdFocusRef = useRef(jdFocusRequest);
  useEffect(() => {
    if (jdFocusRequest === handledJdFocusRef.current) return;
    handledJdFocusRef.current = jdFocusRequest;
    heroTextareaRef.current?.focus();
    setHeroFocusRing(true);
    const t = setTimeout(() => setHeroFocusRing(false), 1200);
    return () => clearTimeout(t);
  }, [jdFocusRequest]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  // Job Feed autostart — single source of truth.
  // JobFeedPanel sets `pendingJobFeedAutostart` synchronously before navigating.
  // The module-level `autostartedApplySessionIds` set dedupes across multiple
  // mounted ChatPanel instances (desktop + mobile can both be in the DOM).
  const pendingJobFeedAutostart = useUIStore((state) => state.pendingJobFeedAutostart);
  const setPendingJobFeedAutostart = useUIStore((state) => state.setPendingJobFeedAutostart);
  useEffect(() => {
    const urlSessionId = searchParams.get('session');
    const urlGenerationId = searchParams.get('generation');
    const rawGenerationAttempt = searchParams.get('generationAttempt');
    const urlGenerationAttempt = rawGenerationAttempt && Number.isFinite(Number(rawGenerationAttempt))
      ? Number(rawGenerationAttempt)
      : null;
    const autostartParam = searchParams.get('autostart');
    const autostartMode: 'apply' | 'analyze' | null =
      autostartParam === 'job-feed-apply' ? 'apply'
        : autostartParam === 'job-feed-analyze' ? 'analyze'
          : null;
    if (!autostartMode) return;
    if (!urlSessionId || currentSession?.id !== urlSessionId) return;
    const autostartKey = buildJobFeedAutostartKey({
      sessionId: urlSessionId,
      generationId: urlGenerationId,
      generationAttempt: urlGenerationAttempt ?? currentSession.jobFeedGenerationAttempt ?? null,
    });
    const pendingKey = pendingJobFeedAutostart
      ? buildJobFeedAutostartKey(pendingJobFeedAutostart)
      : null;
    if (pendingKey === autostartKey) return;
    if (autostartedApplySessionIds.has(autostartKey)) return;

    setPendingJobFeedAutostart({
      sessionId: urlSessionId,
      generationId: urlGenerationId,
      generationAttempt: urlGenerationAttempt ?? currentSession.jobFeedGenerationAttempt ?? null,
      mode: autostartMode,
    });
  }, [currentSession, pendingJobFeedAutostart, searchParams, setPendingJobFeedAutostart]);

  useEffect(() => {
    if (!pendingJobFeedAutostart) return;
    if (!currentSession || currentSession.id !== pendingJobFeedAutostart.sessionId) return;
    const autostartKey = buildJobFeedAutostartKey({
      sessionId: currentSession.id,
      generationId: pendingJobFeedAutostart.generationId ?? currentSession.jobFeedGenerationId ?? null,
      generationAttempt: pendingJobFeedAutostart.generationAttempt ?? currentSession.jobFeedGenerationAttempt ?? null,
    });

    // Module-level dedupe: once any ChatPanel instance has autostarted this
    // generation attempt, no other instance should fire it again.
    if (autostartedApplySessionIds.has(autostartKey)) {
      setPendingJobFeedAutostart(null);
      return;
    }

    // Also respect the per-instance ref for "New Application" resets.
    autostartedApplySessionRef.current = currentSession.id;

    // If the session already has progress (messages, CV, or running agent),
    // don't re-trigger — just consume the flag.
    const canRestartPendingJobFeedGeneration =
      Boolean(pendingJobFeedAutostart.generationId) &&
      currentSession.jobFeedGenerationId === pendingJobFeedAutostart.generationId &&
      currentSession.generationStatus === 'pending';
    const alreadyInProgress =
      isAgentWorking ||
      (
        !canRestartPendingJobFeedGeneration &&
        (
          currentSession.chatMessages.length > 0 ||
          !!currentSession.generatedCV ||
          !!currentSession.pendingFitAnalysis
        )
      );
    if (alreadyInProgress) {
      autostartedApplySessionIds.add(autostartKey);
      setPendingJobFeedAutostart(null);
      return;
    }

    const jobDescription = currentSession.jobDescription?.trim();
    if (!currentCV || !jobDescription) {
      return;
    }

    // Claim the session BEFORE firing — any concurrent render will bail out.
    autostartedApplySessionIds.add(autostartKey);
    setPendingJobFeedAutostart(null);
    if (pendingJobFeedAutostart.generationId) {
      useAppStore.getState().updateCurrentSession({
        jobFeedGenerationId: pendingJobFeedAutostart.generationId,
        jobFeedGenerationAttempt: pendingJobFeedAutostart.generationAttempt ?? currentSession.jobFeedGenerationAttempt ?? null,
      });
    }

    const mode = pendingJobFeedAutostart.mode ?? 'apply';
    const applicationModeForRun = mode === 'analyze' ? 'analyze_first' : 'apply_directly';

    addChatMessage({ role: 'user', content: jobDescription });
    setJobDescription(jobDescription);
    setApplicationMode(applicationModeForRun);
    setAwaitingJobDescription(false);
    posthog?.capture('jd_pasted', {
      jd_length: jobDescription.length,
      mode: applicationModeForRun,
      source: 'job_feed_autostart',
    });
    if (mode === 'analyze') {
      void runFitAnalysisFlow(jobDescription);
    } else {
      void runAgentWorkflow(jobDescription);
    }
  }, [
    addChatMessage,
    currentCV,
    currentSession,
    isAgentWorking,
    pendingJobFeedAutostart,
    posthog,
    runAgentWorkflow,
    runFitAnalysisFlow,
    setApplicationMode,
    setAwaitingJobDescription,
    setJobDescription,
    setPendingJobFeedAutostart,
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

  // Hero actions: the JD typed in the hero input drives generation directly.
  // Routes through the same send path so anonymous signup-wall and credit
  // checks still apply; the explicit mode skips JD re-detection.
  const heroSubmit = async (mode: 'apply_directly' | 'analyze_first') => {
    const text = inputValue.trim();
    if (text.length < HERO_MIN_JD) return;
    const result = await workflowHandleSend(text, { mode });
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
      case 'generate-full-application': {
        // Defense-in-depth: never fire a second generation over an already
        // running workflow. Prevents double-billing and the confusing
        // "something went wrong" message from a mid-flight second request.
        if (isAgentWorking || isGenerating) {
          return;
        }
        posthog?.capture('apply_clicked', { mode: 'analyze_first' });
        addChatMessage({
          role: 'assistant',
          content: '🚀 Generating your full application...',
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
        // Delegates to the single reset path. This case used to duplicate it
        // and the two drifted apart, which is how component-local state
        // (fit analysis, screening mode, the composer draft) started leaking
        // into the next application.
        handleNewApplication();
        break;
      case 'screening-questions':
        posthog?.capture('screening_questions_started');
        setIsScreeningMode(true);
        addChatMessage({
          role: 'assistant',
          content: '📋 **Screening Question Mode**\n\nPaste your screening questions below and I\'ll draft personalized answers based on your CV and this job description.\n\nI\'ll format each answer separately so you can copy and paste them individually.',
        });
        break;
      case 'start-screening-flow': {
        const isPaidPlan = profile?.subscription_tier === 'plus' || profile?.subscription_tier === 'max';
        await handleAction(isPaidPlan ? 'screening-questions' : 'upgrade-for-screening');
        useAppStore.getState().updateCurrentSession({
          screeningUsageCount: isPaidPlan ? (currentSession?.screeningUsageCount ?? 0) + 1 : 2,
        });
        break;
      }
      case 'skip-screening':
        useAppStore.getState().updateCurrentSession({
          screeningUsageCount: 2,
        });
        break;
      case 'upgrade-for-screening':
        posthog?.capture('screening_upgrade_prompt_shown');
        addChatMessage({
          role: 'assistant',
          content: '🔒 **Screening Question Answers** is available on **Plus and Max**.\n\nOn a paid plan, I can draft personalized answers to screening questions from your CV and the job description, formatted for easy copy and paste.',
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

  // Consume pendingApplicationAction from CoverLetterPanel / EmailPanel CTAs.
  // ChatPanel only renders on desktop/tablet (mobile has its own Job Feed
  // + Tracker shell), so exactly one instance consumes the signal.
  const pendingApplicationAction = useUIStore((state) => state.pendingApplicationAction);
  const setPendingApplicationAction = useUIStore((state) => state.setPendingApplicationAction);
  useEffect(() => {
    if (!pendingApplicationAction) return;
    const action = pendingApplicationAction;
    setPendingApplicationAction(null);
    void handleAction(action);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingApplicationAction]);

  // Single reset path for starting a new application, shared by the panel
  // header button and the in-chat "start-new-application" action. Every piece
  // of component-local workflow state must be reset here: it survives
  // clearCurrentSession() and otherwise leaks into the next application.
  const handleNewApplication = () => {
    // Gate: If anonymous user has already used their free generation, show signup wall
    if (!user && hasUsedFreeGeneration()) {
      setSignUpWallTrigger('new-application');
      setShowSignUpWall(true);
      return;
    }
    posthog?.capture('new_application_started');
    useAppStore.getState().clearCurrentSession();
    useAppStore.getState().resetGenerated();
    useAppStore.getState().setJobDescription('');
    setJobDescription('');
    // Reset workflow-local state so the new session starts with a clean slate.
    // Without these, flags set by the previous run (e.g. autostart setting
    // awaitingJobDescription=false) leak into the next session and break
    // JD detection on the first paste.
    setAwaitingJobDescription(false);
    setApplicationMode('apply_directly');
    setAgentSteps([]);
    // Fit-analysis state is component-local and survives clearCurrentSession.
    // Leaving it set strands a live "Generate Kit" button next to the fresh
    // launchpad: clicking it charges 2 credits, then every store write is a
    // no-op because there is no current session to write into.
    setFitAnalysisContextId(null);
    setFitAnalysisJD('');
    setFitAnalysisContextData(null);
    // Screening mode gates the JD detection path off entirely
    // (useAgentWorkflow.ts:893), so a stale flag would route the next paste as
    // screening answers and break the launchpad's primary action.
    setIsScreeningMode(false);
    // A leftover draft would pre-fill the launchpad textarea and could enable
    // "Generate application kit" for a job the user never pasted.
    setInputValue('');
    autostartedApplySessionRef.current = null;
    setShowHistory(false);
  };

  // Panel controls. "New Application" is the most-repeated action in the
  // product (job seekers apply 10-30 times), so it carries a label rather than
  // sitting as a bare icon in the global nav where it read as account chrome.
  const chatNavButtons = (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setShowHistory(!showHistory)}
        className={`p-1.5 rounded-lg transition-colors duration-200 cursor-pointer ${
          showHistory ? 'bg-navy-50 text-navy-600' : 'text-warm-gray hover:bg-cream-100 hover:text-navy-600'
        }`}
        title="Application history"
        aria-label="Application history"
      >
        <History className="w-4 h-4" />
      </button>
      <button
        onClick={handleNewApplication}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-navy-600 hover:bg-cream-100 transition-colors duration-200 cursor-pointer"
        title="Start a new application"
      >
        <Plus className="w-4 h-4" />
        New
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

      <div className={`h-full flex flex-col bg-cream-50 ${isMobileDrawer || isDesktopDocked ? '' : 'border-l border-cream-200'}`}>
        {/* Panel header. The column previously opened with no title at all,
            which left it reading as a leftover sidebar next to a finished
            document. Naming it is what tells the user this column has a job. */}
        <div className="flex-shrink-0 flex items-center justify-between gap-2 border-b border-cream-200 bg-cream-50 px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-gold-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-navy-700 truncate">
              {currentSession?.jobTitle || 'New Application'}
            </span>
          </div>
          {chatNavButtons}
        </div>

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
          // The dashboard's resize sash overlays this panel's left edge and
          // forwards wheel events here, so it needs to find this scroller.
          data-chat-scroll
          className={`flex-1 overflow-auto space-y-4 relative ${
            isDesktopDocked ? 'px-4 pt-4 pb-3' : 'p-4'
          }`}
        >
          {/* Welcome Hero */}
          {showWelcomeHero ? (
            <div className="flex flex-col">
              <div className="px-1 pt-1">
                {currentCV ? (
                  <>
                    <p className="text-sm text-warm-gray leading-relaxed mb-3">
                      Paste a job ad and Useful Apply tailors your CV, cover letter and emails to it.
                    </p>

                    {/* JD input sits directly above the actions (top-to-bottom path) */}
                    <textarea
                      ref={heroTextareaRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (heroJdValid) void heroSubmit('apply_directly');
                        }
                      }}
                      rows={8}
                      placeholder="Paste the job ad here. Title, requirements, the whole posting is fine."
                      className={`w-full resize-none rounded-lg border bg-white px-3.5 py-3 text-sm text-charcoal placeholder:text-warm-gray/70 focus:outline-none transition-colors duration-200 ${
                        heroFocusRing
                          ? 'border-gold-400 ring-2 ring-gold-300'
                          : 'border-cream-200 focus:border-gold-300 focus:ring-2 focus:ring-gold-300/50'
                      }`}
                    />

                    {/* Helper copy carries the state of the field. Without this
                        the two actions below just sit dead below the threshold
                        with no explanation, which reads as a broken UI. */}
                    <p
                      aria-live="polite"
                      className={`mt-1.5 text-[11px] leading-relaxed ${
                        heroJdTooShort ? 'text-navy-600' : 'text-warm-gray/80'
                      }`}
                    >
                      {heroJdValid
                        ? 'Ready. Pick how you want to start.'
                        : heroJdTooShort
                          ? 'That looks too short. Paste the whole posting for a better result.'
                          : 'Your CV stays the source of truth. Useful Apply never invents experience.'}
                    </p>

                    <div className="flex flex-col gap-2 mt-3">
                      <button
                        onClick={() => heroSubmit('apply_directly')}
                        disabled={!heroJdValid}
                        className={`w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold rounded-lg shadow-sm transition-colors duration-200 cursor-pointer ${
                          heroJdValid
                            ? 'bg-gold-400 text-white hover:bg-gold-500'
                            : 'bg-cream-200 text-warm-gray cursor-not-allowed'
                        } ${heroJustActivated ? 'ring-2 ring-gold-300' : ''}`}
                      >
                        <Zap className="w-4 h-4" />
                        Generate application kit
                      </button>
                      <button
                        onClick={() => heroSubmit('analyze_first')}
                        disabled={!heroJdValid}
                        className={`w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium rounded-lg border transition-colors duration-200 cursor-pointer ${
                          heroJdValid
                            ? 'border-cream-200 bg-white text-navy-600 hover:bg-cream-100'
                            : 'border-cream-200 bg-cream-50 text-warm-gray cursor-not-allowed'
                        }`}
                      >
                        <Search className="w-4 h-4" />
                        Check fit first
                      </button>

                      {/* Costs stay quiet and secondary. Free tier is 4 credits
                          a month, so a loud "2 credits" on the primary button
                          reads as "half your month" and suppresses the action
                          we most want new users to take. */}
                      <p className="mt-0.5 text-[11px] leading-relaxed text-warm-gray/80">
                        Full kit costs 2 credits. Checking fit first costs 0.5 and shows your match before you commit.
                      </p>
                    </div>

                    {/* A user with no job ad in hand has nowhere to go from
                        here. One text line, not a competing card. */}
                    <button
                      onClick={() => useUIStore.getState().setActiveTab('jobs')}
                      className="mt-5 inline-flex items-center gap-1.5 text-xs text-warm-gray hover:text-navy-600 transition-colors duration-200 cursor-pointer"
                    >
                      No job in mind? Pick one from your Job Feed
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <div className="text-center px-5 py-8">
                    <div className="flex items-center justify-center gap-3 mb-3">
                      <BrandIcon size="md" theme="light" />
                      <h2 className="text-lg font-semibold tracking-tight text-navy-800">
                        {user ? 'Upload your CV to get started' : 'Your AI job application assistant'}
                      </h2>
                    </div>
                    <p className="text-sm text-warm-gray leading-relaxed">
                      {user
                        ? 'Upload your CV from the left panel, then come back here to apply for jobs.'
                        : 'Upload your CV, paste a job ad, and Useful Apply creates a tailored CV, cover letter and application emails.'}
                    </p>
                  </div>
                )}
                {!user && (
                  <div className="mt-6 pt-5 border-t border-cream-200 text-center">
                    <button
                      onClick={() => { setSignUpWallTrigger('general'); setShowSignUpWall(true); }}
                      className="cta-gold w-full px-4 py-2.5 text-sm font-semibold bg-gold-400 text-white rounded-lg hover:bg-gold-500 shadow-sm cursor-pointer"
                    >
                      Sign up free
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
                    <p className="text-[11px] text-warm-gray/70 mt-2">
                      Try one application free, no account needed.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {currentSession && messages.length === 0 && !showWelcomeHero && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 h-fit">
                <BrandIcon size="xs" theme="light" />
              </div>
              <div className="flex-1">
                <Card padding="sm" className="bg-white border-cream-200 shadow-sm">
                  <MarkdownText
                    content={
                      currentCV
                        ? `**${currentSession.jobTitle || 'This application'}** is ready. Useful Apply already has the saved job description, so we can start generating from here.`
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
                <BrandIcon size="xs" theme="light" />
              </div>
              <div className="flex-1">
                <div className="bg-white rounded-lg border border-cream-200 p-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-gold-500 animate-spin" />
                    <div>
                      <p className="text-sm font-medium text-navy-800">{v2Progress.message}</p>
                      <p className="text-xs text-warm-gray mt-1">Useful Apply is preparing your application...</p>
                    </div>
                  </div>
                  {v2Progress.percent > 0 && (
                    <div className="mt-3 h-1.5 bg-cream-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gold-400 transition-all duration-300"
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
                <BrandIcon size="xs" theme="light" />
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
                <BrandIcon size="xs" theme="light" />
              </div>
              <div className="flex items-center gap-2 px-4 py-3 bg-white rounded-2xl border border-cream-200 shadow-sm">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gold-400 rounded-full animate-bounce typing-dot-1" />
                  <span className="w-2 h-2 bg-gold-500 rounded-full animate-bounce typing-dot-2" />
                  <span className="w-2 h-2 bg-gold-400 rounded-full animate-bounce typing-dot-3" />
                </div>
                <span className="text-sm text-navy-600 ml-2 font-medium">
                  {isAnalyzing ? 'Useful Apply is analyzing...' : isGenerating ? 'Useful Apply is generating...' : 'Useful Apply is thinking...'}
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
                className="flex items-center gap-2 rounded-full bg-gold-400 text-white px-4 py-2.5 text-sm font-semibold shadow-sm hover:bg-gold-500 transition-colors duration-200 cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                Generate Kit
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
                  void handleAction('start-screening-flow');
                }}
                className="flex items-center gap-2 rounded-full border border-gold-400 bg-gold-400 text-white px-4 py-2.5 text-sm font-semibold shadow-sm hover:bg-gold-500 hover:border-gold-500 transition-colors duration-200 cursor-pointer"
              >
                Answer Screening Questions
              </button>
              <button
                onClick={() => {
                  void handleAction('skip-screening');
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
              className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white text-navy-600 rounded-full shadow-lg border border-cream-200 hover:bg-cream-50 hover:shadow-lg transition-all cursor-pointer"
            >
              <ArrowDown className="w-3 h-3" />
              New messages
            </button>
          </div>
        )}

        {/* Input Area — hidden while the launchpad owns the JD input */}
        {!isLaunchpadState && (
        <div className={isDesktopDocked ? 'border-t border-cream-200 bg-cream-50 px-3 pt-2.5 pb-3' : ''}>
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
            focusSignal={jdFocusRequest}
          />
        </div>
        )}
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
