'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Card } from './ui/Card';
import { MarkdownText } from './MarkdownText';
import { ChatMessage, type ChatMessageData } from './chat/ChatMessage';
import { ChatInput } from './chat/ChatInput';
import { ChatHistory } from './chat/ChatHistory';
import { FeedbackModal } from './chat/FeedbackModal';
import { AgentProgressV2 } from './AgentProgressV2';
import { useAgentWorkflow } from './chat/useAgentWorkflow';
import { useAppStore } from '@/store/useAppStore';
import { isApplicationSession, useSessionStore } from '@/store/useSessionStore';
import { useUIStore, type KitTab } from '@/store/useUIStore';
import { useTrackerStore } from '@/store/useTrackerStore';
import { useJobFeedBadge } from '@/hooks/useJobFeedBadge';
import { useFeedStore } from '@/store/useFeedStore';
import { loadFeedOverview, loadSavedFeedJobs } from '@/components/job-feed/feed-actions';
import { startFeedHandoff } from '@/components/job-feed/feed-handoff';
import { buildSuggestedPrompts, CANNED_RESPONSES, PROMPTS } from './chat/suggested-prompts';
import ChatGreeting from './chat/ChatGreeting';
import { openSettings } from '@/store/useSettingsStore';
import { useAuth } from '@/contexts/AuthContext';
import { submitMessageFeedback } from '@/lib/supabase';
import { openStoredSession } from '@/lib/open-session';
import {
  Loader2,
  Plus,
  History,
  Sparkles,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Zap,
  Search,
  Download,
  Edit3,
} from 'lucide-react';
import { BrandIcon } from './BrandLogo';
import { useRouter, useSearchParams } from 'next/navigation';
import { hasUsedFreeGeneration } from '@/lib/anonymous-generation';
import { DecisionChips } from '@/components/shell/DecisionChips';
import { useCreditsBalance, formatResetDate } from '@/hooks/useCreditsBalance';
import { CREDIT_COSTS } from '@/lib/credit-costs';
import { usePostHog } from 'posthog-js/react';
import { NamedStages } from '@/components/shell/NamedStages';
import { CV_REWRITE_SECTIONS, REGEN_META, detectRegenTarget, instructionFromMessage, regenerateDocument, regenerateFollowUpForSession, rewriteCvSection, type CvRewriteSection, type RegenTarget } from '@/lib/regenerate-client';
import { generateRequestId } from '@/lib/utils/requestId';
// The confirm path re-resolves and re-validates with the same pure functions
// the server used, so the two can never disagree about what a handle means.
import { resolveHandle } from '@/lib/cv-structure/handles';
import { applyDelete } from '@/lib/cv-structure/ops';
import { cvStructureDigest, validateEdit } from '@/lib/cv-structure/validate';
import { parseUndoChip, takeUndo } from '@/lib/cv-structure/undo';
import { looksLikeScreeningQuestion, parseScreeningAnswers, SCREENING_TURN_CAP } from '@/lib/screening-answers';

/**
 * The feed item behind a job_id the chat proposed an application for. Reads
 * today's list, anything loaded past the first page and the Saved tab, and
 * refetches once before giving up: the proposal may be older than the feed
 * currently in the store.
 */
async function findFeedJob(jobId: string) {
  const fromStore = () => {
    const state = useFeedStore.getState();
    return [...(state.overview?.jobs ?? []), ...state.extraJobs, ...(state.savedJobs ?? [])]
      .find((item) => item.id === jobId) ?? null;
  };
  const first = fromStore();
  if (first) return first;
  await loadFeedOverview({ quiet: true });
  const second = fromStore();
  if (second) return second;
  await loadSavedFeedJobs();
  return fromStore();
}

// Module-level dedupe set for Job Feed autostart. Kept as a safety net in
// case the dashboard ever navigates between two sessions fast enough that
// React has not finished unmounting the previous ChatPanel. ChatPanel
// itself only renders on desktop/tablet (mobile shows a "Best on desktop"
// screen), so we no longer have a desktop+mobile dual-mount race.
const autostartedApplySessionIds = new Set<string>();

/**
 * Applications whose follow-up this tab has already drafted. Module level for
 * the same reason as the set above: ChatPanel mounts twice on desktop, and a
 * per-mount ref would let the second mount pay for the same draft again. A
 * session id is immutable, so an entry here can never come to mean a different
 * application. It does not survive a reload, so a chip clicked again in a new
 * tab still charges; the proposal labels the button "Rewrite" once a draft
 * exists, so that cost is stated before the click either way.
 */
const followUpDone = new Set<string>();

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

/**
 * Unambiguous pasted job ads only. These skip the model and show the decision
 * chips instantly; everything else goes to /api/chat, where gpt-oss decides
 * whether it is an ad (propose_application) or a question to answer. Keeping
 * this test narrow is the point: the old heuristic turned any longish message
 * with one marker word into a job ad.
 */
const JOB_AD_MARKERS = /\b(responsibilities|requirements|qualifications|job description|we are looking for|must have|nice to have|about the role|you will|salary|benefits|apply|candidate|position|vacancy)\b/gi;

export function isObviousJobAd(text: string): boolean {
  if (text.length <= 350) return false;
  const distinct = new Set((text.match(JOB_AD_MARKERS) || []).map((hit) => hit.toLowerCase())).size;
  // The composer caps at 2000 characters, so anything near that is a paste,
  // but a long paste is not automatically an ad: pasting your own CV text
  // into an edit request is just as long. Markers are what separate them.
  if (text.length > 1800) return distinct >= 2;
  return distinct >= 3;
}

/**
 * Ad-shaped enough to offer the user a way in, not enough to decide for them.
 * Only used after the model has answered without calling propose_application,
 * so a real ad it misread is never a dead end.
 */
export function looksAdShaped(text: string): boolean {
  if (text.length < 350) return false;
  return new Set((text.match(JOB_AD_MARKERS) || []).map((hit) => hit.toLowerCase())).size >= 2;
}

/** Below this a message is a question, whatever the model called it. */
const MIN_JOB_AD_CHARS = 200;

/**
 * A rewrite waiting on its cost chip. It carries the note the user typed and
 * the application it was raised for: the click has to spend against the same
 * job the cost was quoted for, not whichever one is open by then.
 */
interface PendingRegen {
  target: RegenTarget;
  instruction: string | null;
  sessionId: string | null;
  requestId: string;
}

interface ChatPanelProps {
  onTabChange?: (tab: KitTab) => void;
  isMobileDrawer?: boolean;
  /** True when the panel is docked as the desktop right-hand column. */
  docked?: boolean;
  /** Spine workspace: no top chrome, chips for decisions, no signup/credits modals. */
  spine?: boolean;
}

export function ChatPanel({
  onTabChange,
  isMobileDrawer = false,
  docked = false,
  spine = false,
}: ChatPanelProps) {
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
  } = useAppStore();

  // The workflow hook is created before the handlers it calls back into, so
  // the callbacks read them from refs. Assigned in an effect, never during
  // render: a render React discards must not leave a ref behind.
  const presentJobAdDecisionRef = useRef<((jd: string) => void) | null>(null);
  const offerAdFallbackRef = useRef<((jd: string) => void) | null>(null);

  // Agent workflow hook — handles all SSE logic, JD detection, fit analysis, generation
  const {
    isTyping,
    agentSteps,
    v2Progress,
    v2Reflection,
    fitAnalysisContextId,
    fitAnalysisJD,
    setApplicationMode,
    setAwaitingJobDescription,
    isScreeningMode,
    setIsScreeningMode,
    handleSend: workflowHandleSend,
    handleGeneralChat,
    fetchScreeningAnswers,
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
          content: 'Sorry, something went wrong during generation. Your credits were not charged. Please try again.',
        });
        return;
      }
      setShortCredits({ required, available: liveAvailable });
      addChatMessage({
        role: 'assistant',
        content: `You have ${liveAvailable} credits left this month, so here's what's open to you:`,
      });
    },
    onAnonymousLimitReached: () => {
      askForAccount();
    },
    onSessionExpired: () => {
      addChatMessage({
        role: 'assistant',
        content: 'Your session expired. Sign in again to continue. Nothing was charged.',
        actions: [{ label: 'Sign in', action: 'navigate-login' }],
      });
    },
    onProposeApplication: (jd) => {
      // A short message is a question whatever the model decided, and acting
      // on it would overwrite the real job description with it.
      if (jd.trim().length < MIN_JOB_AD_CHARS) return;
      presentJobAdDecisionRef.current?.(jd);
    },
    onChatAnsweredWithoutProposal: (message) => {
      offerAdFallbackRef.current?.(message);
    },
  });

  const [inputValue, setInputValue] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [messageFeedback, setMessageFeedback] = useState<Record<string, 'positive' | 'negative'>>({});
  const [feedbackModal, setFeedbackModal] = useState<{ messageId: string; content: string; type: 'positive' | 'negative' } | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [shortCredits, setShortCredits] = useState<{ required: number; available: number } | null>(null);
  const [pendingDecisionJd, setPendingDecisionJd] = useState<string | null>(null);
  // The model answered an ad-shaped message as a question. One chip, no cost,
  // so a missed classification is recoverable without re-pasting.
  const [adFallbackJd, setAdFallbackJd] = useState<string | null>(null);
  const [needsAccount, setNeedsAccount] = useState(false);
  // Regeneration from the chat: the cost chip waits in pendingRegen, the
  // named stage shows while runningRegen is set. The pending chip carries the
  // instruction the user typed and the application it was raised for, so a
  // chip cannot fire a rewrite against a different application or with an
  // instruction from an earlier message.
  const [pendingRegen, setPendingRegen] = useState<PendingRegen | null>(null);
  const [runningRegen, setRunningRegen] = useState<RegenTarget | null>(null);
  // A CV section rewrite is paid and takes as long as a document rewrite, so
  // it needs its own progress line. It is a separate flag rather than a fourth
  // RegenTarget because REGEN_META and regenerateDocument are both keyed on
  // that union, and a CV section is not one of the three documents they write.
  const [runningCvRewrite, setRunningCvRewrite] = useState(false);
  const [runningScreening, setRunningScreening] = useState(false);
  // Refs, not state: a guard that flips synchronously so a double click never
  // starts a second paid request.
  const regenInFlightRef = useRef(false);
  const cvRewriteInFlightRef = useRef(false);
  // The message that raised a CV rewrite chip. Ephemeral on purpose: it is
  // replaced by the next message sent, so a chip further up the conversation
  // can never run against a note the user has since changed.
  const cvRewriteNoteRef = useRef<{ text: string; sessionId: string | null } | null>(null);
  const screeningInFlightRef = useRef(false);
  const setRegenStage = useUIStore((state) => state.setRegenStage);
  const requestKitDownload = useUIStore((state) => state.requestKitDownload);

  // Anonymous visitor hit something that needs an account. One line in the
  // conversation plus a chip to act on; the old modal wall is gone.
  function askForAccount() {
    addChatMessage({
      role: 'assistant',
      content: 'Create a free account to keep going. 4 credits included, no card.',
    });
    setNeedsAccount(true);
  }
  const { credits, isLoading: creditsLoading, refresh: refreshCredits } = useCreditsBalance();

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

  // Two thresholds, not one. With a single cut-off any pixel of height
  // change near it flips the pill on, and an on/off flip that moves the
  // layout flips it straight back: the pill visibly vibrates while you
  // scroll. The dead band means a small change can never cross both.
  const PILL_SHOW_DISTANCE = 120;
  const PILL_HIDE_DISTANCE = 40;

  const updateScrollButton = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollButton((shown) => (shown ? distance > PILL_HIDE_DISTANCE : distance > PILL_SHOW_DISTANCE));
  }, []);

  // Track scroll position to show/hide scroll-to-bottom button
  const handleScroll = () => {
    updateScrollButton();
  };

  // Scroll events alone cannot keep the button honest: the panel stays
  // mounted but display:none behind the feed and tracker, where no scroll
  // fires and every height reads 0, so a stale "not at bottom" from before
  // the view switch would survive into a fresh conversation. Recompute from
  // the container's geometry on every resize (including the 0 to real-height
  // jump on reveal) and on session change.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    updateScrollButton();
    const ro = new ResizeObserver(updateScrollButton);
    ro.observe(container);
    return () => ro.disconnect();
  }, [updateScrollButton, currentSession?.id]);

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

  // The fit-result chips gate on the balance, and the credits_deducted event
  // can race the capture write: a stale low read shows "Upgrade" to a user
  // who can afford the kit until they reload. Refetch when the chips appear
  // and once more after the capture has certainly settled.
  const showFitChips = Boolean(fitAnalysisContextId || hasFreshPendingFitAnalysis);
  useEffect(() => {
    if (!showFitChips) return;
    void refreshCredits();
    const timer = window.setTimeout(() => { void refreshCredits(); }, 1500);
    return () => window.clearTimeout(timer);
  }, [showFitChips, refreshCredits]);

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
  // focus on every remount (e.g. after a client-side navigation) with no user click.
  const handledJdFocusRef = useRef(jdFocusRequest);
  useEffect(() => {
    if (jdFocusRequest === handledJdFocusRef.current) return;
    handledJdFocusRef.current = jdFocusRequest;
    // preventScroll: focusing scrolls the element into view, and on a browser
    // whose 100vh exceeds the visible viewport that drags the whole page down.
    heroTextareaRef.current?.focus({ preventScroll: true });
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
  // The feed handoff sets `pendingJobFeedAutostart` synchronously before
  // switching the shell to the application's tab.
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

    // A job that came from the feed opens with its own headline, not the ad.
    addChatMessage({
      role: 'user',
      content: pendingJobFeedAutostart.headline?.trim() || jobDescription,
    });
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

  // ---- Adaptive empty-state chips -------------------------------------

  const chatIsEmpty = Boolean(
    spine && user && !currentSession?.jobDescription && messages.length === 0
    && !isAgentWorking && !pendingDecisionJd,
  );
  const trackerRows = useTrackerStore((state) => state.rows);
  const trackerLoadedOnce = useTrackerStore((state) => state.loadedOnce);
  const jobFeedBadge = useJobFeedBadge(chatIsEmpty && Boolean(user), user?.id ?? null);
  // The chips need the tracker to know whether a follow-up is due. Load it
  // once, and only while the empty state is actually on screen.
  useEffect(() => {
    if (!chatIsEmpty || !user || trackerLoadedOnce) return;
    void useTrackerStore.getState().load(user.id);
  }, [chatIsEmpty, user, trackerLoadedOnce]);

  // Paint the chips once, settled. Rendering before the tracker lands would
  // swap them under the pointer a beat later.
  const showSuggestedPrompts = chatIsEmpty && trackerLoadedOnce;

  const applicationCount = sessions.filter(isApplicationSession).length;
  const newFeedCount = jobFeedBadge.hasNewRun ? jobFeedBadge.jobCount : 0;
  const suggestedPrompts = useMemo(
    () => buildSuggestedPrompts({
      hasCV: Boolean(currentCV),
      applicationCount,
      trackerRows,
      newFeedCount,
    }),
    [currentCV, applicationCount, trackerRows, newFeedCount],
  );

  // Show the credit-aware decision card for a job ad. The ad lands on a
  // session first so the run has it, but no run starts and nothing is spent
  // until the user picks a chip.
  const presentJobAdDecision = (jd: string) => {
    if (!currentSession) {
      useAppStore.getState().createNewSession(jd);
    } else if (!currentSession.generatedCV) {
      // A new ad on an unfinished application replaces it. Without this the
      // fit result from the previous ad stays live and its "generate the kit"
      // chip would spend 2 credits building for the wrong job.
      setJobDescription(jd);
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
    }
    setAdFallbackJd(null);
    setPendingDecisionJd(jd);
    setShortCredits(null);
  };

  const offerAdFallback = (message: string) => {
    if (!looksAdShaped(message)) return;
    setAdFallbackJd(message);
  };

  useEffect(() => {
    presentJobAdDecisionRef.current = presentJobAdDecision;
    offerAdFallbackRef.current = offerAdFallback;
  });

  // Commit a pasted job ad to a session right before a run starts. A finished
  // application stays in the sidebar; the new job opens its own conversation.
  const beginJobRun = (jd: string) => {
    setPendingDecisionJd(null);
    if (currentSession?.generatedCV) {
      useAppStore.getState().createNewSession(jd);
      addChatMessage({ role: 'user', content: jd });
    }
  };

  // ---- Kit follow-ups: rewrite requests and screening questions ----------

  // A cost chip raised against one application must not stay on screen under
  // another one's conversation. Clicking it there already refuses and charges
  // nothing, but showing it at all is the stale card the plan rules out.
  useEffect(() => {
    if (pendingRegen && pendingRegen.sessionId !== (currentSession?.id ?? null)) {
      setPendingRegen(null);
    }
  }, [currentSession?.id, pendingRegen]);

  const startRegenPrompt = (target: RegenTarget, instruction: string | null) => {
    if (!user) {
      askForAccount();
      return;
    }
    const meta = REGEN_META[target];
    const balance = credits?.total;
    // Only promise the draft when it can actually be paid for. Below this line
    // the chip swaps to the upgrade path, and a sentence promising the letter
    // above an Upgrade button reads as a bug. Stating the shortfall there is
    // the honest thing to do; the affordable path never mentions credits.
    const affordable = balance === undefined || balance >= meta.cost;
    // With a note, the rewrite follows it. Without one it is a fresh draft.
    // Either way the writer only uses what the CVs actually say, and nothing
    // is charged until the chip is confirmed.
    addChatMessage({
      role: 'assistant',
      content: !affordable
        ? `Rewriting the ${meta.noun} costs ${meta.cost} credits (you have ${balance}).`
        : instruction
          ? `I'll write a fresh draft of the ${meta.noun} following your note. Anything you ask for that isn't in your CV gets left out. Nothing changes until you confirm below.`
          : `I'll write a fresh ${meta.noun}, not an edit of this one. Nothing changes until you confirm below.`,
    });
    setPendingRegen({
      target,
      instruction,
      sessionId: useSessionStore.getState().currentSession?.id ?? null,
      requestId: generateRequestId(),
    });
  };

  const confirmRegen = async (pending: PendingRegen) => {
    if (regenInFlightRef.current) return;
    const { target, instruction } = pending;
    const meta = REGEN_META[target];
    const startedIn = useSessionStore.getState().currentSession?.id ?? null;
    // The chip was raised against one application. If the user has switched
    // since, the note and the cost on screen belong to a different job, so
    // the chip is dropped rather than charged against the wrong one.
    if (pending.sessionId !== startedIn) {
      setPendingRegen(null);
      addChatMessage({
        role: 'assistant',
        content: 'That rewrite was for the application you had open before. Ask again here and I\'ll cost it up for this one. Nothing was charged.',
      });
      return;
    }
    regenInFlightRef.current = true;
    setPendingRegen(null);
    addChatMessage({ role: 'user', content: 'Rewrite it' });
    setRunningRegen(target);
    setRegenStage({ title: meta.stage, tab: meta.tab });
    posthog?.capture('regeneration_requested', { section: meta.type, source: 'chat', with_instruction: Boolean(instruction) });
    try {
      const result = await regenerateDocument(target, pending.requestId, instruction ?? undefined, pending.sessionId);
      // The document lands on the application that asked for it; the chat
      // line only makes sense if the user is still looking at that one.
      if (useSessionStore.getState().currentSession?.id !== startedIn) return;
      if (result.ok) {
        addChatMessage({
          role: 'assistant',
          content: instruction
            ? `Done, ${result.wordCount} words. The new ${meta.noun} is on the right. I followed your note as far as your CV backs it up, so give it a read.`
            : `Done, ${result.wordCount} words. The new ${meta.noun} is on the right.`,
          actions: [{ label: meta.stage, action: 'stage-done' }],
        });
      } else if (result.code === 'INSUFFICIENT_CREDITS') {
        addChatMessage({
          role: 'assistant',
          content: `Rewriting the ${meta.noun} needs ${result.required} credits and you have ${result.available}. Nothing was charged.`,
          actions: [{ label: 'Upgrade to Plus · 50 credits a month', action: 'navigate-pricing', icon: 'new' }],
        });
      } else if (result.code === 'SIGNED_OUT') {
        addChatMessage({
          role: 'assistant',
          content: 'Your session expired. Sign in again and ask for the rewrite once more. Nothing was charged.',
          actions: [{ label: 'Sign in', action: 'navigate-login' }],
        });
      } else if (result.code === 'NO_CONTEXT') {
        addChatMessage({
          role: 'assistant',
          content: `I can't rewrite the ${meta.noun} without the job ad and your CV loaded. Open the application from the sidebar and try again.`,
        });
      } else if (result.code === 'REQUEST_IN_PROGRESS') {
        addChatMessage({ role: 'assistant', content: 'That request is still running.' });
      } else if (result.code === 'REQUEST_ALREADY_COMPLETED') {
        addChatMessage({ role: 'assistant', content: "That request already finished. You weren't charged twice." });
      } else {
        setPendingRegen(pending);
        addChatMessage({
          role: 'assistant',
          content: `That rewrite didn't go through. The ${meta.noun} on the right is unchanged. Try again in a moment.`,
        });
      }
    } finally {
      regenInFlightRef.current = false;
      setRunningRegen(null);
      setRegenStage(null);
    }
  };

  const runScreening = async (question: string) => {
    if (!user) {
      askForAccount();
      return;
    }
    if (screeningInFlightRef.current) return;
    const session = useSessionStore.getState().currentSession;
    const startedIn = session?.id ?? null;
    if (!startedIn) return;
    // A local read of a spent cap saves a round trip. It is not the cap: the
    // chat route holds that, on a column only it writes.
    if ((session?.screeningUsageCount ?? 0) >= SCREENING_TURN_CAP) {
      setIsScreeningMode(false);
      addChatMessage({
        role: 'assistant',
        content: `That's the ${SCREENING_TURN_CAP} screening answers for this application. Start a new application for more.`,
      });
      return;
    }
    // Profile still loading means the tier is unknown; let the server decide.
    const isPaidPlan = profile?.subscription_tier === 'plus' || profile?.subscription_tier === 'max';
    if (profile && !isPaidPlan) {
      setIsScreeningMode(false);
      await handleAction('upgrade-for-screening');
      return;
    }
    screeningInFlightRef.current = true;
    setRunningScreening(true);
    try {
      const result = await fetchScreeningAnswers(question);
      const stillHere = useSessionStore.getState().currentSession?.id === startedIn;
      if (!result.ok) {
        if (!stillHere) return;
        if (result.code === 'PLAN_REQUIRED') {
          await handleAction('upgrade-for-screening');
        } else if (result.code === 'CHAT_LIMIT') {
          addChatMessage({
            role: 'assistant',
            content: 'You\'ve reached the chat limit for this application. Start a new application from the sidebar to keep going.',
          });
        } else if (result.code === 'SIGNED_OUT') {
          addChatMessage({
            role: 'assistant',
            content: 'Your session expired. Sign in again and paste the question once more.',
            actions: [{ label: 'Sign in', action: 'navigate-login' }],
          });
        } else if (result.code === 'CAP_REACHED') {
          // The server's number is the real one, so the local display catches up.
          useSessionStore.getState().updateSessionById(startedIn, {
            screeningUsageCount: result.turnsUsed ?? SCREENING_TURN_CAP,
          });
          addChatMessage({
            role: 'assistant',
            content: `That's the ${SCREENING_TURN_CAP} screening answers for this application. Start a new application for more.`,
          });
        } else if (result.code === 'NOT_SAVED') {
          addChatMessage({
            role: 'assistant',
            content: 'This application hasn\'t saved yet. Give it a second and paste the question again.',
          });
        } else {
          addChatMessage({
            role: 'assistant',
            content: 'That answer didn\'t come through. Paste the question again in a moment.',
          });
        }
        return;
      }
      const parsed = parseScreeningAnswers(result.reply);
      if (!parsed) {
        // No answer blocks: show the reply as a normal turn rather than lose it.
        // The turn was still spent, so the displayed count follows the server.
        if (result.turnsUsed !== null) {
          useSessionStore.getState().updateSessionById(startedIn, { screeningUsageCount: result.turnsUsed });
        }
        if (stillHere) addChatMessage({ role: 'assistant', content: result.reply });
        return;
      }
      const now = new Date().toISOString();
      const store = useSessionStore.getState();
      const target = store.currentSession?.id === startedIn
        ? store.currentSession
        : store.sessions.find((s) => s.id === startedIn);
      const existing = target?.screeningAnswers ?? [];
      const items = parsed.map((a, i) => ({
        id: `ans-${Date.now()}-${i}`,
        question: a.question || question,
        answer: a.answer,
        createdAt: now,
      }));
      // Answers land on the application that asked, even if the user moved on.
      // The count comes from the server, which just spent the turn.
      store.updateSessionById(startedIn, {
        screeningAnswers: [...existing, ...items],
        screeningUsageCount: result.turnsUsed ?? (target?.screeningUsageCount ?? 0) + 1,
      });
      posthog?.capture('screening_answers_generated', { count: items.length });
      if (!stillHere) return;
      // The one allowed auto-switch: the user just asked for exactly this.
      onTabChange?.('answers');
      addChatMessage({
        role: 'assistant',
        content: result.reply,
        actions: [{ label: 'Answering from your CV', action: 'stage-done' }],
      });
    } finally {
      screeningInFlightRef.current = false;
      setRunningScreening(false);
      setIsScreeningMode(false);
    }
  };

  /**
   * With a kit on screen the composer mostly carries follow-ups. Returns true
   * when the message was handled here (rewrite or screening); false sends it
   * down the normal chat path.
   */
  const routeKitMessage = async (text: string): Promise<boolean> => {
    if (!currentSession?.generatedCV) return false;
    const openTab = useUIStore.getState().activeTab;
    const openDocument = openTab === 'cover-letter' ? 'cover-letter' : openTab === 'email' ? 'email' : openTab === 'cv' ? 'cv' : null;
    const target = detectRegenTarget(text, openDocument);
    // The CV is no longer a dead end: the chat can reorder it, drop an item,
    // switch a heading, or price a section rewrite. Fall through so the model
    // reads the outline and picks the right one of those, rather than
    // answering here with a rule about what it can and cannot do.
    if (target === 'cv') return false;
    if (target) {
      // The message that asked for the rewrite is the instruction. A message
      // too long to be a request is refused out loud, not silently dropped.
      const parsed = instructionFromMessage(text);
      if (!parsed.ok && parsed.reason === 'too_long') {
        addChatMessage({
          role: 'assistant',
          content: `That's a lot to take in at once. Tell me in a sentence what to change about the ${REGEN_META[target].noun} and I'll cost it up.`,
        });
        return true;
      }
      startRegenPrompt(target, parsed.ok ? parsed.instruction : null);
      return true;
    }
    if (isScreeningMode || looksLikeScreeningQuestion(text)) {
      await runScreening(text);
      return true;
    }
    return false;
  };

  const handleSend = async () => {
    if (!inputValue.trim()) return;
    const text = inputValue.trim();
    // A card raised by the previous message must not outlive it: clicking it
    // later would run a job ad the user has moved on from, or spend credits
    // on a rewrite note they have since replaced.
    setPendingDecisionJd(null);
    setAdFallbackJd(null);
    setPendingRegen(null);
    // This message replaces any earlier rewrite note. A CV rewrite chip raised
    // by the reply to it may use it; one raised before it may not.
    cvRewriteNoteRef.current = { text, sessionId: currentSession?.id ?? null };
    if (spine && currentSession?.generatedCV && (isScreeningMode || !isObviousJobAd(text))) {
      const draft = text;
      setInputValue('');
      addChatMessage({ role: 'user', content: draft });
      if (await routeKitMessage(draft)) return;
      // Plain question about the kit: the normal chat path, user message already added.
      await handleGeneralChat(draft);
      return;
    }
    if (spine && isObviousJobAd(text) && !isScreeningMode) {
      if (!user && hasUsedFreeGeneration()) {
        askForAccount();
        setInputValue('');
        return;
      }
      // With a kit on screen the new application only starts when a chip is
      // picked (see beginJobRun), so a misread edit request costs nothing.
      addChatMessage({ role: 'user', content: text });
      presentJobAdDecision(text);
      setInputValue('');
      return;
    }
    const result = await workflowHandleSend(text);
    if (result === 'show_signup_wall') {
      askForAccount();
      setInputValue('');
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
      askForAccount();
      return;
    }
    setInputValue('');
  };

  // Feed applications proposed in the chat. In-flight stops a double click
  // from creating two sessions; done makes a click on an old chip say so
  // instead of quietly doing nothing.
  const feedApplyInFlight = useRef<Set<string>>(new Set());
  const feedApplyDone = useRef<Set<string>>(new Set());
  // In-flight follow-ups. Synchronous, so a double click cannot get past it
  // before the first request has even started. The done set is module level.
  const followUpInFlight = useRef<Set<string>>(new Set());

  const handleAction = async (action: string) => {
    // One entry removed from the tailored CV, proposed by delete_cv_item.
    //
    // This click can land arbitrarily long after the proposal, so unlike the
    // immediate reorder path it re-checks reality rather than trusting what the
    // reply said: it re-resolves the handle against the LIVE store CV with the
    // same shared resolver the server used, then re-runs the full validator.
    // Content-derived handles make that a real check. If the entry is gone or
    // its text has changed, resolution fails instead of hitting a neighbour.
    if (action.startsWith('confirm-cv-delete:')) {
      const rest = action.slice('confirm-cv-delete:'.length);
      const split = rest.indexOf(':');
      const sessionId = split > 0 ? rest.slice(0, split) : '';
      const handle = split > 0 ? rest.slice(split + 1) : '';
      if (!sessionId || !handle || handle.length > 120) return;
      const live = useSessionStore.getState().currentSession;
      if (!live || live.id !== sessionId) {
        addChatMessage({
          role: 'assistant',
          content: 'That was for a different application. Open it and ask me again there.',
        });
        return;
      }
      const before = live.optimizedCVData;
      if (!before) {
        addChatMessage({ role: 'assistant', content: 'There\'s no tailored CV open here any more.' });
        return;
      }
      if (!resolveHandle(before, handle)) {
        addChatMessage({
          role: 'assistant',
          content: 'That one\'s already gone, or it\'s changed since I offered it. Ask me again and I\'ll look at what\'s there now.',
        });
        return;
      }
      const result = applyDelete(before, handle);
      if (!result.ok) {
        addChatMessage({ role: 'assistant', content: result.error });
        return;
      }
      const failure = validateEdit(before, result.cv, { removed: result.removed });
      if (failure) {
        addChatMessage({ role: 'assistant', content: failure });
        return;
      }
      // Same three keys CVPanel.onSave preserves, and no undo chip: the confirm
      // was the safety net, and one mechanism per operation.
      useSessionStore.getState().updateCurrentSession({
        optimizedCVData: {
          ...result.cv,
          analysis: before.analysis,
          localizedStrings: before.localizedStrings,
        },
      });
      addChatMessage({
        role: 'assistant',
        content: 'Removed. It\'s off your CV.',
      });
      return;
    }
    // Undo of the last immediate structure edit. Entirely client-side: the slot
    // holds the live store object from just before the edit, so putting it back
    // restores analysis, sectionHeaders and localizedStrings exactly.
    // The chip carries the digest of the CV its own edit produced, so a chip
    // further up the conversation refuses instead of reverting whatever the
    // newest edit was. Chips persisted before that carried no digest and still
    // parse; they fall back to the live-digest check they always had.
    if (action.startsWith('undo-cv-edit:')) {
      const target = action.slice('undo-cv-edit:'.length);
      const chip = parseUndoChip(target);
      if (!chip) return;
      const live = useSessionStore.getState().currentSession;
      const snapshot = live && live.id === chip.sessionId && live.optimizedCVData
        ? takeUndo(target, cvStructureDigest(live.optimizedCVData))
        : null;
      if (!snapshot) {
        // No claim about where the change is. It may have been superseded, it
        // may belong to another application, or it may never have landed at
        // all, and this handler cannot tell those apart.
        addChatMessage({
          role: 'assistant',
          content: 'I can\'t undo that one from here. Check the CV canvas for what\'s actually on it.',
        });
        return;
      }
      useSessionStore.getState().updateCurrentSession({ optimizedCVData: snapshot });
      addChatMessage({ role: 'assistant', content: 'Put back the way it was.' });
      return;
    }
    // A CV section rewrite, proposed by propose_cv_rewrite. The click is the
    // confirming second request and the only thing that spends credits: the
    // tool handler never calls the route.
    //
    // The instruction is deliberately NOT in the action string. This chip is
    // persisted in message history and survives reloads, so an instruction
    // baked into it would become a stale note that outlives the conversation,
    // which is the shape Phase 4 rejected for the follow-up. It rides ephemeral
    // state instead: the message that raised the chip, usable only while that
    // chip is still the newest thing said. Scroll back to an older one and it
    // is a plain rewrite of that section, which is what its label promises.
    if (action.startsWith('confirm-cv-rewrite:')) {
      if (!user) return;
      const rest = action.slice('confirm-cv-rewrite:'.length);
      const firstColon = rest.indexOf(':');
      const sessionId = firstColon > 0 ? rest.slice(0, firstColon) : '';
      const afterSession = firstColon > 0 ? rest.slice(firstColon + 1) : '';
      const secondColon = afterSession.indexOf(':');
      // The entry id is opaque and may itself carry a colon, so only the first
      // two separators are structural.
      const section = secondColon >= 0 ? afterSession.slice(0, secondColon) : afterSession;
      const entryId = secondColon >= 0 ? afterSession.slice(secondColon + 1) : '';
      if (!sessionId || sessionId.length > 100) return;
      if (!CV_REWRITE_SECTIONS.includes(section as CvRewriteSection)) return;
      if (cvRewriteInFlightRef.current) return;
      // Shared with the follow-up and the document rewrites: two paid paths
      // running at once clear each other's stage and drop a result in silence
      // after the credits are spent.
      if (regenInFlightRef.current) {
        addChatMessage({
          role: 'assistant',
          content: 'One rewrite at a time. Let this one finish and ask again.',
        });
        return;
      }
      const live = useSessionStore.getState().currentSession;
      if (live?.id !== sessionId) {
        addChatMessage({
          role: 'assistant',
          content: 'That rewrite was for a different application. Open it and ask me again there. Nothing was charged.',
        });
        return;
      }
      if (!live.optimizedCVData) {
        addChatMessage({
          role: 'assistant',
          content: 'There\'s no tailored CV open here any more, so there\'s no section to rewrite. Nothing was charged.',
        });
        return;
      }
      // Only the newest reply's chip carries the note that asked for it. Any
      // message since has replaced what the user wants, so an older chip runs
      // without one rather than applying a request they have moved on from.
      const latest = messages[messages.length - 1];
      const isNewest = latest?.role === 'assistant'
        && (latest.actions || []).some((chip) => chip.action === action);
      const note = isNewest && cvRewriteNoteRef.current?.sessionId === sessionId
        ? cvRewriteNoteRef.current.text
        : null;
      cvRewriteInFlightRef.current = true;
      regenInFlightRef.current = true;
      setRunningCvRewrite(true);
      setRegenStage({ title: 'Rewriting that section of your CV', tab: 'cv' });
      posthog?.capture('regeneration_requested', { section: 'cv_section', source: 'chat', with_instruction: Boolean(note) });
      try {
        const result = await rewriteCvSection(section as CvRewriteSection, entryId, sessionId, note ?? undefined);
        if (result.ok && result.applied) {
          const done = result.label
            ? `Rewritten. ${result.label} is updated on your CV.`
            : 'Rewritten. That section is updated on your CV.';
          // A rewrite can honour the shape half of a request and refuse the
          // content half, and that is the common case, not the rare one.
          // Reporting it as clean success is the silent narrowing the rules
          // forbid, so what was left out is said in the same breath.
          const left = result.omitted.join(', ');
          addChatMessage({
            role: 'assistant',
            content: left
              ? `${done} I left out ${left}, your CV doesn't mention it.`
              : done,
          });
        } else if (result.ok) {
          // The route already released the reservation on a refusal, and its
          // message says which words it could not support. Relay it as it is.
          addChatMessage({ role: 'assistant', content: result.message });
        } else if (result.code === 'INSUFFICIENT_CREDITS') {
          addChatMessage({
            role: 'assistant',
            content: `That rewrite needs ${result.required} credits and you have ${result.available}. Nothing was charged.`,
            actions: [{ label: 'Upgrade to Plus · 50 credits a month', action: 'navigate-pricing', icon: 'new' }],
          });
        } else if (result.code === 'SIGNED_OUT') {
          addChatMessage({
            role: 'assistant',
            content: 'Your session expired. Sign in again and ask for the rewrite once more. Nothing was charged.',
            actions: [{ label: 'Sign in', action: 'navigate-login' }],
          });
        } else if (result.code === 'NO_CONTEXT') {
          addChatMessage({
            role: 'assistant',
            content: 'I can\'t rewrite that without the job ad and your CV. Open the application and check both are there. Nothing was charged.',
          });
        } else {
          // No billing claim: the route captures before it answers, so a
          // dropped connection late in the call means the rewrite may have
          // landed and been paid for.
          addChatMessage({
            role: 'assistant',
            content: 'That rewrite didn\'t come back. Check the CV tab before asking again, in case it landed anyway.',
          });
        }
      } finally {
        cvRewriteInFlightRef.current = false;
        regenInFlightRef.current = false;
        setRunningCvRewrite(false);
        setRegenStage(null);
      }
      return;
    }
    // Delete proposed by the chat's delete_application tool. The click is the
    // confirming second request; the store's remove path re-checks ownership
    // server-side.
    if (action.startsWith('confirm-delete-application:')) {
      if (!user) return;
      const sessionId = action.slice('confirm-delete-application:'.length);
      // The chip survives in the message history, so a second click has to
      // read as "already gone", not as a second successful delete. Only
      // trust the store once it has actually loaded rows.
      const tracker = useTrackerStore.getState();
      if (tracker.loadedOnce && !tracker.rows.some((row) => row.id === sessionId)) {
        addChatMessage({ role: 'assistant', content: 'That one\'s already gone from your tracker.' });
        return;
      }
      try {
        await useTrackerStore.getState().remove(user.id, sessionId);
        addChatMessage({ role: 'assistant', content: 'Deleted. It\'s gone from your tracker.' });
      } catch {
        addChatMessage({ role: 'assistant', content: 'That delete did not go through. Try again from the tracker.' });
      }
      return;
    }
    // A follow-up draft proposed by propose_follow_up. The click is the
    // confirming request and it runs the same tracker follow-up path the
    // tracker's own button runs, so credits are reserved by the code that
    // always reserves them. No handler ever writes this without a click.
    if (action.startsWith('confirm-follow-up:')) {
      if (!user) return;
      const sessionId = action.slice('confirm-follow-up:'.length);
      if (!sessionId || sessionId.length > 100) return;
      if (followUpInFlight.current.has(sessionId)) return;
      // The two paid paths share runningRegen and regenStage, and this one
      // switches the current session when it lands. Starting it over a rewrite
      // that is still running would clear that rewrite's stage and move the
      // session out from under it, so its result would be dropped in silence
      // after the credits were spent. One at a time.
      if (regenInFlightRef.current) {
        addChatMessage({
          role: 'assistant',
          content: 'One rewrite at a time. Let this one finish and ask again.',
        });
        return;
      }
      if (followUpDone.has(sessionId)) {
        addChatMessage({ role: 'assistant', content: 'That follow-up is already written. It\'s in the Emails tab.' });
        return;
      }
      followUpInFlight.current.add(sessionId);
      regenInFlightRef.current = true;
      const meta = REGEN_META['follow-up'];
      setRunningRegen('follow-up');
      setRegenStage({ title: meta.stage, tab: meta.tab });
      posthog?.capture('regeneration_requested', { section: meta.type, source: 'chat_tracker' });
      try {
        const result = await regenerateFollowUpForSession(sessionId);
        if (result.ok) {
          followUpDone.add(sessionId);
          // One source of truth per application: the draft lands in the same
          // place the tracker's button puts it.
          const opened = await openStoredSession(sessionId);
          if (opened) onTabChange?.('email');
          addChatMessage({
            role: 'assistant',
            content: `Your follow-up is ready, ${result.wordCount} words. It's in the Emails tab.`,
          });
        } else if (result.code === 'INSUFFICIENT_CREDITS') {
          addChatMessage({
            role: 'assistant',
            content: `That follow-up needs ${result.required} credits and you have ${result.available}. Nothing was charged.`,
            actions: [{ label: 'Upgrade to Plus · 50 credits a month', action: 'navigate-pricing', icon: 'new' }],
          });
        } else if (result.code === 'SIGNED_OUT') {
          addChatMessage({
            role: 'assistant',
            content: 'Your session expired. Sign in again and ask for the follow-up once more. Nothing was charged.',
            actions: [{ label: 'Sign in', action: 'navigate-login' }],
          });
        } else if (result.code === 'NO_CONTEXT') {
          addChatMessage({
            role: 'assistant',
            content: 'I can\'t write that follow-up without the job ad and your CV. Open the application and check both are there.',
          });
        } else {
          addChatMessage({
            role: 'assistant',
            content: 'That follow-up didn\'t come back. If it landed anyway it\'s in the Emails tab, so check there before asking again.',
          });
        }
      } finally {
        followUpInFlight.current.delete(sessionId);
        regenInFlightRef.current = false;
        setRunningRegen(null);
        setRegenStage(null);
      }
      return;
    }
    // An application for a feed role, proposed by propose_feed_application. The
    // click is the confirming request and it runs the same handoff a feed card
    // runs, so credits are reserved by the code that always reserves them.
    if (action.startsWith('confirm-feed-apply:')) {
      // Split on the first colon only: a job id is opaque and may carry one.
      const rest = action.slice('confirm-feed-apply:'.length);
      const split = rest.indexOf(':');
      const mode = split > 0 ? rest.slice(0, split) : '';
      const jobId = split > 0 ? rest.slice(split + 1) : '';
      if ((mode !== 'analyze' && mode !== 'apply') || !jobId || jobId.length > 100) return;
      if (isAgentWorking || isGenerating) return;
      // The chip lives on in the message history, so a second click has to be
      // a no-op, not a second application. The busy flags only rise after the
      // handoff returns, which is far too late to stop a double click.
      if (feedApplyInFlight.current.has(jobId)) return;
      if (feedApplyDone.current.has(jobId)) {
        addChatMessage({ role: 'assistant', content: 'That one\'s already open in your application kit.' });
        return;
      }
      feedApplyInFlight.current.add(jobId);
      try {
        const job = await findFeedJob(jobId);
        if (!job) {
          addChatMessage({
            role: 'assistant',
            content: 'That role isn\'t in your feed any more. Open the feed and pick it from there.',
          });
          return;
        }
        // The role can come from today's list or from Saved, so the run it
        // belongs to is not today's by default. Null lets the server resolve it.
        const result = await startFeedHandoff(job, mode, { hasCV: Boolean(currentCV), runId: null });
        if (!result.ok) {
          addChatMessage({ role: 'assistant', content: result.error });
          return;
        }
        feedApplyDone.current.add(jobId);
        if (!result.autostarted) {
          addChatMessage({
            role: 'assistant',
            content: 'That one\'s already open in your application kit. Check the panels on the right.',
          });
          return;
        }
        posthog?.capture('job_feed_item_applied', { job_id: job.id, company: job.company, mode, source: 'chat' });
      } finally {
        feedApplyInFlight.current.delete(jobId);
      }
      return;
    }
    switch (action) {
      case 'navigate-documents':
        openSettings('cv');
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
          content: 'Paste the screening question and I\'ll answer it from your CV. The answer lands in the Answers tab on the right.',
        });
        break;
      case 'start-screening-flow': {
        const isPaidPlan = profile?.subscription_tier === 'plus' || profile?.subscription_tier === 'max';
        await handleAction(isPaidPlan ? 'screening-questions' : 'upgrade-for-screening');
        // Paid plans count a use when an answer lands (runScreening). A free
        // plan has seen the pitch, so the follow-up chips step aside.
        if (!isPaidPlan) {
          useAppStore.getState().updateCurrentSession({ screeningUsageCount: 2 });
        }
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
          content: 'Screening answers are on Plus and Max. On a paid plan I answer each question from your CV and the job ad, ready to paste into the form.',
          actions: [
            { label: 'Upgrade to Plus · 50 credits a month', action: 'navigate-pricing', icon: 'new' },
          ],
        });
        break;
      case 'navigate-pricing':
        openSettings('usage');
        break;
      case 'navigate-login':
        router.push('/auth/login');
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
  const newApplicationRequest = useUIStore((state) => state.newApplicationRequest);
  const handledNewApplicationRef = useRef(newApplicationRequest);

  const handleNewApplication = () => {
    // Gate: If anonymous user has already used their free generation, show signup wall
    if (!user && hasUsedFreeGeneration()) {
      askForAccount();
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
    setPendingDecisionJd(null);
    setShortCredits(null);
    setNeedsAccount(false);
    setPendingRegen(null);
    setRunningRegen(null);
    setRunningScreening(false);
    setRegenStage(null);
    autostartedApplySessionRef.current = null;
    setShowHistory(false);
  };

  useEffect(() => {
    if (newApplicationRequest === handledNewApplicationRef.current) return;
    handledNewApplicationRef.current = newApplicationRequest;
    handleNewApplication();
    // handleNewApplication is recreated each render; the tick is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newApplicationRequest]);

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

      <div className={`h-full flex flex-col bg-cream-50 ${isMobileDrawer || isDesktopDocked || spine ? '' : 'border-l border-cream-200'}`}>
        {!spine && (
        <div className="flex-shrink-0 flex items-center justify-between gap-2 border-b border-cream-200 bg-cream-50 px-4 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-gold-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-navy-700 truncate">
              {currentSession?.jobTitle || 'New Application'}
            </span>
          </div>
          {chatNavButtons}
        </div>
        )}

        {/* History Overlay */}
        <div className="relative">
        {showHistory && (
          <ChatHistory
            sessions={sessions.filter(isApplicationSession).map(s => ({
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
              setShowHistory(false);
              await openStoredSession(sessionId);
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
          // Folding the canvas widens this column to the whole window. The
          // surface stays full width; the cards inside it cap and centre so
          // they line up with the composer instead of running edge to edge.
          // scrollbar-gutter both-edges keeps this scroller's content box
          // symmetric, so the centred cards line up with the centred composer
          // instead of sitting a half-scrollbar to the left of it.
          className={`flex-1 overflow-auto space-y-4 relative [scrollbar-gutter:stable_both-edges] [&>*]:mx-auto [&>*]:w-full [&>*]:max-w-[820px] ${
            isDesktopDocked ? 'px-4 pt-4 pb-3' : 'p-4'
          }`}
        >
          {/* Welcome Hero */}
          {!spine && showWelcomeHero ? (
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
                      onClick={() => router.push('/auth/signup')}
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

          {/* Only for sessions that arrive with a saved job (Job Board). A
              fresh paste is mid-decision, and this bubble would double the
              decision UI below with contradictory copy. */}
          {currentSession && messages.length === 0 && !showWelcomeHero && !pendingDecisionJd && !isAgentWorking && (
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
                {/* A fresh job ad is present: lead with the fit prompts. The
                    analyze chip runs the existing 0.5-credit fit flow, so the
                    click itself is the user's spend decision. */}
                {user && currentCV && currentSession.jobDescription && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isAgentWorking}
                      onClick={() => {
                        addChatMessage({ role: 'user', content: 'Analyze this job description' });
                        void runFitAnalysisFlow(currentSession.jobDescription);
                      }}
                      className="inline-flex items-center rounded-full border border-cream-200 bg-cream-50 px-3.5 py-1.5 text-xs font-medium text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                    >
                      Analyze this job description · {CREDIT_COSTS.FIT_ANALYSIS} credits
                    </button>
                    <button
                      type="button"
                      disabled={isAgentWorking}
                      onClick={() => {
                        addChatMessage({ role: 'user', content: 'How well do I fit this role?' });
                        void handleGeneralChat('How well do I fit this role?');
                      }}
                      className="inline-flex items-center rounded-full border border-cream-200 bg-cream-50 px-3.5 py-1.5 text-xs font-medium text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                    >
                      How well do I fit this role?
                    </button>
                  </div>
                )}
                <p className="text-xs text-warm-gray mt-1.5 ml-1">Just now</p>
              </div>
            </div>
          )}

          {/* Spine empty state: suggested prompts that teach what the chat
              can do. Clicking one sends it as the message, straight to chat,
              so the JD heuristics never read a chip as a job ad. */}
          {showSuggestedPrompts && (
            <div className="min-h-full flex flex-col items-center justify-center gap-5 px-4 py-10">
              <ChatGreeting name={user?.name} />
              <div className="flex flex-wrap justify-center gap-2">
              {suggestedPrompts.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    const store = useAppStore.getState();
                    if (!store.currentSession) store.createNewSession('');
                    useAppStore.getState().addChatMessage({ role: 'user', content: suggestion });
                    const canned = CANNED_RESPONSES[suggestion];
                    if (canned) {
                      useAppStore.getState().addChatMessage({ role: 'assistant', content: canned });
                      return;
                    }
                    if (suggestion === PROMPTS.runFeed) {
                      // Deterministic, same as the run_feed tool effect: the
                      // Job Board owns the run, its progress and the
                      // once-a-day message.
                      useAppStore.getState().addChatMessage({
                        role: 'assistant',
                        content: "Opening your Job Board and starting today's search.",
                      });
                      useUIStore.getState().setPendingFeedRunAt(Date.now());
                      useUIStore.getState().setActiveTab('jobs');
                      return;
                    }
                    void handleGeneralChat(suggestion);
                  }}
                  className="inline-flex items-center rounded-full border border-cream-200 bg-cream-50 px-3.5 py-1.5 text-xs font-medium text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white cursor-pointer"
                >
                  {suggestion}
                </button>
              ))}
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
              layout={spine ? 'spine' : 'classic'}
              answersInDoc={(currentSession?.screeningAnswers?.length ?? 0) > 0}
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
                  isWorking={isAgentWorking}
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
            !pendingDecisionJd &&
            !!(fitAnalysisContextId || hasFreshPendingFitAnalysis) && (
            <DecisionChips
              chips={
                (credits?.total ?? CREDIT_COSTS.GENERATION_AFTER_FIT) >= CREDIT_COSTS.GENERATION_AFTER_FIT
                  ? [
                      {
                        id: 'generate-kit',
                        label: 'Generate the full kit',
                        cost: `${CREDIT_COSTS.GENERATION_AFTER_FIT} credits`,
                        variant: 'primary',
                        icon: <Zap className="h-4 w-4" />,
                        onSelect: () => { void handleAction('generate-full-application'); },
                      },
                    ]
                  : [
                      {
                        id: 'upgrade-kit',
                        label: 'Upgrade to Plus to generate the kit',
                        cost: '50 credits a month',
                        variant: 'secondary',
                        icon: <ArrowUpRight className="h-4 w-4" />,
                        onSelect: () => openSettings('usage'),
                      },
                    ]
              }
              hint={
                (credits?.total ?? CREDIT_COSTS.GENERATION_AFTER_FIT) < CREDIT_COSTS.GENERATION_AFTER_FIT
                  ? `The full kit needs ${CREDIT_COSTS.GENERATION_AFTER_FIT}. Your ${credits?.planTier === 'free' ? 'free ' : ''}credits reset${formatResetDate(credits?.nextResetDate) ? ` on ${formatResetDate(credits?.nextResetDate)}` : ' next month'}.`
                  : undefined
              }
            />
          )}

          {spine && !isAgentWorking && pendingDecisionJd && (
            <div className="mt-1">
              {(credits?.total ?? CREDIT_COSTS.FULL_APPLICATION) < CREDIT_COSTS.FULL_APPLICATION
                && (credits?.total ?? 0) >= CREDIT_COSTS.FIT_ANALYSIS ? (
                <DecisionChips
                  chips={[
                    {
                      id: 'check-fit',
                      label: 'Check fit first',
                      cost: `${CREDIT_COSTS.FIT_ANALYSIS} credits`,
                      variant: 'primary',
                      icon: <Search className="h-4 w-4" />,
                      onSelect: () => {
                        const jd = pendingDecisionJd;
                        beginJobRun(jd);
                        void runFitAnalysisFlow(jd);
                      },
                    },
                    {
                      id: 'upgrade',
                      label: 'Upgrade to Plus to generate the kit',
                      cost: '50 credits a month',
                      variant: 'secondary',
                      icon: <ArrowUpRight className="h-4 w-4" />,
                      onSelect: () => openSettings('usage'),
                    },
                  ]}
                  hint={`The full kit needs ${CREDIT_COSTS.GENERATION_AFTER_FIT}. Your ${credits?.planTier === 'free' ? 'free ' : ''}credits reset${formatResetDate(credits?.nextResetDate) ? ` on ${formatResetDate(credits?.nextResetDate)}` : ' next month'}.`}
                />
              ) : (
                <div className="flex flex-col gap-3">
                  <DecisionChips
                    chips={[
                      {
                        id: 'check-fit',
                        label: 'Check my fit',
                        cost: `${CREDIT_COSTS.FIT_ANALYSIS} credits`,
                        variant: 'primary',
                        icon: <Search className="h-4 w-4" />,
                        onSelect: () => {
                          const jd = pendingDecisionJd;
                          beginJobRun(jd);
                          void runFitAnalysisFlow(jd);
                        },
                      },
                      {
                        id: 'not-a-job',
                        label: 'Not a job ad, just a question',
                        variant: 'secondary' as const,
                        onSelect: () => {
                          const jd = pendingDecisionJd;
                          setPendingDecisionJd(null);
                          void (async () => {
                            if (currentSession?.generatedCV && await routeKitMessage(jd)) return;
                            // Same text, same model: without this it would be
                            // read as an ad again and the card would return.
                            await handleGeneralChat(jd, { suppressProposal: true });
                          })();
                        },
                      },
                    ]}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const jd = pendingDecisionJd;
                      beginJobRun(jd);
                      void runAgentWorkflow(jd);
                    }}
                    className="self-start text-[13px] font-medium text-navy-600 hover:text-navy-800 cursor-pointer"
                  >
                    Skip the check, generate the full kit now
                  </button>
                </div>
              )}
            </div>
          )}

          {spine && !isAgentWorking && !pendingDecisionJd && adFallbackJd && (
            <DecisionChips
              chips={[
                {
                  id: 'treat-as-job-ad',
                  label: 'That was a job ad, start an application',
                  variant: 'secondary',
                  icon: <Plus className="h-4 w-4" />,
                  onSelect: () => {
                    const jd = adFallbackJd;
                    presentJobAdDecision(jd);
                  },
                },
              ]}
            />
          )}

          {spine && needsAccount && !user && !isAgentWorking && (
            <DecisionChips
              chips={[
                {
                  id: 'create-account',
                  label: 'Create a free account',
                  variant: 'primary',
                  onSelect: () => router.push('/auth/signup'),
                },
                {
                  id: 'log-in',
                  label: 'Log in',
                  variant: 'secondary',
                  onSelect: () => router.push('/auth/login'),
                },
              ]}
            />
          )}

          {spine && shortCredits && !pendingDecisionJd && !isAgentWorking && (
            <DecisionChips
              chips={[
                ...(shortCredits.available >= CREDIT_COSTS.FIT_ANALYSIS && !currentSession?.pendingFitAnalysis
                  ? [{
                      id: 'check-fit-short',
                      label: 'Check fit first',
                      cost: `${CREDIT_COSTS.FIT_ANALYSIS} credits`,
                      variant: 'primary' as const,
                      icon: <Search className="h-4 w-4" />,
                      onSelect: () => {
                        const jd = currentSession?.jobDescription || '';
                        setShortCredits(null);
                        if (jd) void runFitAnalysisFlow(jd);
                      },
                    }]
                  : []),
                {
                  id: 'upgrade-short',
                  label: 'Upgrade to Plus to generate the kit',
                  cost: '50 credits a month',
                  variant: 'secondary',
                  icon: <ArrowUpRight className="h-4 w-4" />,
                  onSelect: () => openSettings('usage'),
                },
              ]}
              hint={`The full kit needs ${shortCredits.required}. Your credits reset${formatResetDate(credits?.nextResetDate) ? ` on ${formatResetDate(credits?.nextResetDate)}` : ' next month'}.`}
            />
          )}

          {/* Rewrite from the chat: one gold confirm chip, then a named stage */}
          {spine && pendingRegen && !runningRegen && !isAgentWorking && (
            <DecisionChips
              chips={
                creditsLoading || (credits !== null && credits.total >= REGEN_META[pendingRegen.target].cost)
                  ? [
                      {
                        id: 'rewrite',
                        label: 'Rewrite it',
                        variant: 'primary',
                        icon: <Edit3 className="h-4 w-4" />,
                        onSelect: () => {
                          if (creditsLoading) return;
                          void confirmRegen(pendingRegen);
                        },
                      },
                      {
                        id: 'keep-it',
                        label: 'Keep it as it is',
                        variant: 'secondary',
                        onSelect: () => setPendingRegen(null),
                      },
                    ]
                  : [
                      {
                        id: 'upgrade-rewrite',
                        label: 'Upgrade to Plus to rewrite it',
                        cost: '50 credits a month',
                        variant: 'secondary',
                        icon: <ArrowUpRight className="h-4 w-4" />,
                        onSelect: () => openSettings('usage'),
                      },
                      {
                        id: 'keep-it',
                        label: 'Keep it as it is',
                        variant: 'secondary',
                        onSelect: () => setPendingRegen(null),
                      },
                    ]
              }
              hint={
                !creditsLoading && credits !== null && credits.total < REGEN_META[pendingRegen.target].cost
                  ? `A rewrite needs ${REGEN_META[pendingRegen.target].cost}. Your ${credits.planTier === 'free' ? 'free ' : ''}credits reset${formatResetDate(credits.nextResetDate) ? ` on ${formatResetDate(credits.nextResetDate)}` : ' next month'}.`
                  : undefined
              }
            />
          )}

          {spine && (runningRegen || runningScreening || runningCvRewrite) && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 h-fit">
                <BrandIcon size="xs" theme="light" />
              </div>
              <div className="flex-1 rounded-2xl border border-cream-200 bg-white p-3 shadow-sm">
                <NamedStages
                  stages={[{
                    title: runningRegen
                      ? REGEN_META[runningRegen].stage
                      : runningCvRewrite
                        ? 'Rewriting that section of your CV'
                        : 'Answering from your CV',
                    state: 'active',
                  }]}
                />
              </div>
            </div>
          )}

          {/* Kit ready: download it, or move on to screening questions */}
          {spine &&
            !isAgentWorking &&
            !isScreeningMode &&
            !pendingRegen &&
            !runningRegen &&
            !runningCvRewrite &&
            !runningScreening &&
            !!currentSession?.generatedCV &&
            !(fitAnalysisContextId || hasFreshPendingFitAnalysis) && (
            <DecisionChips
              chips={[
                {
                  id: 'download-kit',
                  label: 'Download the kit',
                  variant: 'primary',
                  icon: <Download className="h-4 w-4" />,
                  onSelect: () => requestKitDownload(),
                },
                ...((currentSession?.screeningUsageCount ?? 0) < 2
                  ? [{
                      id: 'screening',
                      label: 'Answer screening questions',
                      variant: 'secondary' as const,
                      icon: <Sparkles className="h-4 w-4" />,
                      onSelect: () => { void handleAction('start-screening-flow'); },
                    }]
                  : []),
              ]}
            />
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to bottom button. The wrapper is zero height and the pill
            floats out of it, so showing or hiding it never changes the
            scroller's height. In the flow it did, which fired the
            ResizeObserver above and fought its own visibility. */}
        {showScrollButton && (
          <div className="relative z-10 h-0 overflow-visible">
            <div className="pointer-events-none absolute inset-x-0 -top-11 flex justify-center">
            <button
              onClick={() => scrollToBottom(true)}
              className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white text-navy-600 rounded-full shadow-lg border border-cream-200 hover:bg-cream-50 hover:shadow-lg transition-all cursor-pointer"
            >
              <ArrowDown className="w-3 h-3" />
              New messages
            </button>
            </div>
          </div>
        )}

        {/* Input Area — hidden while the launchpad owns the JD input */}
        {(spine || !isLaunchpadState) && (
        <div className={isDesktopDocked || spine ? 'bg-cream-50 px-4 pt-2.5 pb-4 [&>*]:mx-auto [&>*]:w-full [&>*]:max-w-[820px]' : ''}>
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            onStop={handleStopGeneration}
            disabled={!currentCV || isAnalyzing || isGenerating || isTyping || !!runningRegen || runningScreening}
            isWorking={isAgentWorking || isTyping}
            placeholder={
              spine
                ? (currentSession?.generatedCV
                    ? 'Ask for a change, or paste a screening question'
                    : 'Paste a job ad or ask anything')
                : currentCV
                  ? 'Paste a job description or ask me anything...'
                  : 'Upload your CV first to get started...'
            }
            compact={messages.length > 0}
            surface={isDesktopDocked || spine ? 'embedded' : 'floating'}
            focusSignal={jdFocusRequest}
          />
        </div>
        )}
      </div>

    </>
  );
}
