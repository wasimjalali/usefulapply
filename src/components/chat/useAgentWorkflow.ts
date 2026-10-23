/**
 * useAgentWorkflow — Custom hook for agent SSE workflow logic
 * 
 * Extracted from ChatPanel.tsx for modularity.
 * Handles: handleSend, handleGeneralChat, runFitAnalysisFlow, runAgentWorkflow,
 * handleStopGeneration, getSmartFallbackResponse, and all associated state.
 */

import { useEffect, useState, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useAppStore } from '@/store/useAppStore';
import { useSessionStore, type ApplicationSession, type ChatAction, type ChatMessage } from '@/store/useSessionStore';
import { useDatePrefs } from '@/hooks/useDatePrefs';
import { formatDate } from '@/lib/utils/format-date';
import { findSentApplicationForJob } from '@/lib/utils/same-job';
import { useUIStore } from '@/store/useUIStore';
import { useAuth } from '@/contexts/AuthContext';
import posthog from 'posthog-js';
import { hasUsedFreeGeneration, markFreeGenerationUsed } from '@/lib/anonymous-generation';
import { notifyJobFeedBadgeRefresh } from '@/hooks/useJobFeedBadge';
import { generateRequestId } from '@/lib/utils/requestId';
import { triggerCreditUpdate } from '@/lib/utils/creditEvents';
import { computeFitLevel } from '@/lib/agents/prompts/fit-assessment-prompt';
import { useToast } from '@/components/ui/Toast';
import { useTrackerStore } from '@/store/useTrackerStore';
import { openSettings } from '@/store/useSettingsStore';
import { writeDefaultTemplate } from '@/lib/cv-templates/default-template';
import { loadFeedOverview, loadSavedFeedJobs } from '@/components/job-feed/feed-actions';
import { useFeedStore } from '@/store/useFeedStore';
import { cvStructureDigest } from '@/lib/cv-structure/validate';
import { rememberUndo } from '@/lib/cv-structure/undo';
import type { JobFeedApplicationGeneration } from '@/lib/supabase/types';
import { readKitDocumentErrors, type StoredSessionRow } from '@/lib/open-session';
import { applyServerRow, forgetSession, refreshFromServer } from '@/lib/session-sync';
import { isStructuredCoverLetter } from '@/lib/cover-letter/contract';
import { needsAvailabilityPrompt } from '@/lib/profile/logistics';
import { parkedRunStillValid } from '@/lib/profile/logistics-resume';
import type { KitDocument } from '@/lib/agents/types';
import type { ExecutedEffect } from '@/lib/agents/chat-tools/types';
import { useChatCompactionMarker } from './compaction-marker';
import { readChatStream } from './read-chat-stream';
import { useStreamingReply } from './streaming-reply';
import { flushChatSync } from '@/lib/chat-sync-flush';
import { CHAT_LOCAL_REPLAY_TURNS } from '@/lib/chat-limits';
import {
  createSession as createStoredSession,
  deleteSession as deleteStoredSession,
} from '@/lib/supabase';

/** What the user hears when a signed-in user's profile can't be read before a kit. */
export const PROFILE_UNAVAILABLE = "We couldn't load your profile. Try again.";

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
  applicant: Record<string, unknown>;
  job: Record<string, unknown>;
  match: Record<string, unknown>;
  verifiedMetrics?: string[];
  detectedLanguage?: string;
  fitAnalysis?: Record<string, unknown>;
}

function formatFitAnalysisMessage(
  fitAnalysis: Record<string, unknown>,
  job?: { title?: string; companyName?: string },
): string {
  const fitLevel = typeof fitAnalysis.fitLevel === 'string' ? fitAnalysis.fitLevel : 'weak';
  const fitEmoji =
    fitLevel === 'strong' ? '🟢' :
    fitLevel === 'good' ? '🟡' :
    fitLevel === 'fair' ? '🟠' : '🔴';
  const fitLabel =
    fitLevel === 'strong' ? 'Strong Fit' :
    fitLevel === 'good' ? 'Good Fit' :
    fitLevel === 'fair' ? 'Fair Fit' : 'Weak Fit';

  const role = job?.title || 'this position';
  const company = job?.companyName || 'this company';
  const score = typeof fitAnalysis.score === 'number' ? `${fitAnalysis.score}%` : 'N/A';

  const rawAssessment = typeof fitAnalysis.assessment === 'string'
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

  const fallbackStrengths = (Array.isArray(fitAnalysis.matchingSkills) ? fitAnalysis.matchingSkills : [])
    .filter((skill): skill is string => typeof skill === 'string')
    .slice(0, 3)
    .map((skill: string) => `- ${skill}`);
  const fallbackGaps = (Array.isArray(fitAnalysis.missingSkills) ? fitAnalysis.missingSkills : [])
    .filter((skill): skill is string => typeof skill === 'string')
    .slice(0, 2)
    .map((skill: string) => `- ${skill}`);

  const details = assessment || [
    fallbackStrengths.length > 0 ? `**Strengths**\n${fallbackStrengths.join('\n')}` : '',
    fallbackGaps.length > 0 ? `**Main gaps**\n${fallbackGaps.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  // No pointer at "the button below": the fit's own chips are the next step, and a line in the transcript would still
  // point at them after a kit replaced them (FIT_CLOSING_BEFORE_2026_10_23).
  const closing =
    fitLevel === 'weak'
      ? 'This one looks weak. I would skip it unless there is a strong strategic reason to apply.'
      : '';

  return [
    `${fitEmoji} **${fitLabel}**`,
    `**Role:** ${role} at ${company}`,
    `**Match score:** ${score}`,
    details,
    closing,
  ].filter(Boolean).join('\n\n');
}

/** The closing line fit messages carried before 2026-10-23. Stored transcripts still hold it; ChatPanel hides it once a kit exists. */
export const FIT_CLOSING_BEFORE_2026_10_23 = 'If you want to move forward, generate the full application below.';

const KIT_DOCUMENT_NAMES: Record<KitDocument, string> = {
  cv: 'tailored CV',
  coverLetter: 'cover letter',
  applicationEmail: 'application email',
  followUpEmail: 'follow-up email',
};

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function formatCredits(amount: number): string {
  return `${amount} ${amount === 1 ? 'credit' : 'credits'}`;
}

/**
 * The chat line for a finished kit. It names only the documents the server
 * actually returned: a document is ready when it came back and carries no
 * error, the same test kit.ts uses before it saves it, so a document that
 * was never written is never announced. What is missing is named with where
 * to retry it, and a refund is claimed only when the server confirmed one.
 */
function kitReadyMessage(opts: {
  company?: string;
  atsNote: string;
  ready: Record<KitDocument, boolean>;
  creditsRefunded: number;
}): string {
  const { ready } = opts;
  const intro = `Your kit${opts.company ? ` for ${opts.company}` : ''} is ready`;
  const missing = (Object.keys(KIT_DOCUMENT_NAMES) as KitDocument[]).filter((document) => !ready[document]);
  if (missing.length === 0) {
    return `${intro}: a tailored CV${opts.atsNote}, a cover letter and two emails. Every claim comes from your CV. Review it before you send.`;
  }
  const names: string[] = [];
  if (ready.cv) names.push(`a tailored CV${opts.atsNote}`);
  if (ready.coverLetter) names.push('a cover letter');
  if (ready.applicationEmail && ready.followUpEmail) names.push('two emails');
  else if (ready.applicationEmail) names.push('an application email');
  else if (ready.followUpEmail) names.push('a follow-up email');
  // Both emails live on one tab, so count tabs, not documents.
  const retryTabs = [
    ...(!ready.coverLetter ? ['Cover letter'] : []),
    ...(!ready.applicationEmail || !ready.followUpEmail ? ['Emails'] : []),
  ];
  const lines = [
    names.length > 0
      ? `${intro}: ${joinNames(names)}. Every claim comes from your CV. Review it before you send.`
      : `Your kit${opts.company ? ` for ${opts.company}` : ''} didn't come through.`,
    `We couldn't write the ${joinNames(missing.map((document) => KIT_DOCUMENT_NAMES[document]))}.`,
  ];
  if (retryTabs.length > 0) {
    lines.push(`Try again from the ${joinNames(retryTabs)} ${retryTabs.length === 1 ? 'tab' : 'tabs'}.`);
  }
  if (!ready.cv) lines.push('The CV tab shows your base CV. To tailor it, paste the job ad again for a new kit.');
  if (opts.creditsRefunded > 0) lines.push(`We refunded ${formatCredits(opts.creditsRefunded)}.`);
  return `${lines[0]}\n\n${lines.slice(1).join(' ')}`;
}

export function useAgentWorkflow(options?: {
  onInsufficientCredits?: (required: number, available: number) => void | Promise<void>;
  onAnonymousLimitReached?: () => void;
  onSessionExpired?: () => void;
  /**
   * The model read the message as a pasted job ad. The client shows the
   * credit-aware decision card; the user's click is what starts a run, so
   * classification never spends credits.
   */
  /** Returns a line to add after the model's reply when the proposal can't be acted on. */
  onProposeApplication?: (jobDescription: string) => string | null;
  /**
   * The reply came back and the model did NOT read the message as an ad.
   * The client decides whether to offer a manual way in, so a model that
   * misses a real ad is never a dead end.
   */
  onChatAnsweredWithoutProposal?: (message: string) => void;
  /**
   * Which screen shows the start date and salary questions when this hook
   * parks a run. The guided line and the chat each mount their own copy of
   * this hook, so the one that parked is the one that renders the card.
   */
  logisticsHost?: 'guided' | 'chat';
}) {
  const { user, profile, refreshProfile } = useAuth();
  // Read at call time: the guided line starts runs from timers and effects
  // that hold an older render's closure, and a stale profile would skip the
  // gate or ask twice.
  const profileRef = useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  const datePrefs = useDatePrefs();
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
  // The streamed chat turn in flight (its streaming-reply id), so Stop knows it is stopping a reply, not a kit run.
  const chatTurnRef = useRef<string | null>(null);

  const messages = currentSession?.chatMessages || [];

  const addWorkflowMessage = (
    sessionId: string | undefined,
    message: { role: 'assistant'; content: string; actions?: ChatAction[] },
  ) => {
    if (!sessionId || useSessionStore.getState().currentSession?.id === sessionId) {
      addChatMessage(message);
      return;
    }
    const newMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      timestamp: new Date().toISOString(),
    };
    useSessionStore.setState((state) => ({
      sessions: state.sessions.map((session) => session.id === sessionId
        ? { ...session, chatMessages: [...session.chatMessages, newMessage], updatedAt: newMessage.timestamp }
        : session),
    }));
  };

  /**
   * What /api/chat needs to know about the conversation. A saved application's history is read from D1 by the route,
   * so only the new message's id goes (the route stores the turn under it). A local `session-` conversation has no
   * row yet and still sends its last CHAT_LOCAL_REPLAY_TURNS (7) turns. `messages` is this render's transcript, which does not hold the new
   * message yet.
   */
  const chatRequestHistory = (message: string) => {
    const live = useSessionStore.getState().currentSession;
    if (live && !live.id.startsWith('session-')) {
      // The message as the newest user turn with no reply after it. A message the chat already answered (an ad the
      // "Not a job ad" button sends again) goes without an id, since the route claims each message for one turn only:
      // the route stores the turn under its own id, with the button's words instead of a second copy of the ad, and
      // returns it as storedUserMessage, which the transcript then shows.
      const index = live.chatMessages.findLastIndex((entry) => entry.role === 'user' && entry.content === message);
      const answered = index !== -1 && live.chatMessages.slice(index + 1).some((entry) => entry.role === 'assistant');
      return { chatHistory: [], messageId: index === -1 || answered ? undefined : live.chatMessages[index].id };
    }
    // The message itself goes as `message`. When it is already the newest turn on screen (a pasted ad the "Not a job
    // ad" button sends again), it is not replayed as history too, or the model reads the same paste twice.
    const last = messages.at(-1);
    const earlier = last?.role === 'user' && last.content === message ? messages.slice(0, -1) : messages;
    return {
      chatHistory: earlier.slice(-CHAT_LOCAL_REPLAY_TURNS).map((msg) => ({ role: msg.role, content: msg.content })),
      messageId: undefined,
    };
  };

  /**
   * The assistant's reply under the id the route stored it with, so the sync writes the same row (with any note added
   * here) instead of a second one. Into the application the turn started in: the route stored it there, and a reply
   * shown in another application would be a row the sync can never write.
   */
  const addReplyMessage = (
    message: { role: 'assistant'; content: string; actions: ChatAction[] },
    id: string | undefined,
    sessionId: string | null,
  ) => {
    if (!id || !sessionId) {
      addChatMessage(message);
      return;
    }
    const newMessage: ChatMessage = { ...message, id, timestamp: new Date().toISOString() };
    useSessionStore.setState((state) => {
      const append = (session: ApplicationSession): ApplicationSession =>
        (session.id === sessionId ? { ...session, chatMessages: [...session.chatMessages, newMessage], updatedAt: newMessage.timestamp } : session);
      return {
        currentSession: state.currentSession ? append(state.currentSession) : state.currentSession,
        sessions: state.sessions.map(append),
      };
    });
  };

  /**
   * Where a chat turn's late answer goes: the application it started in while that is still open or listed, else, for
   * a local conversation that got its saved id meanwhile, the application with its createdAt (the new id keeps it).
   * Null when it is gone.
   */
  const resolveTurnSession = (startedIn: string | null, startedCreatedAt: string | null): string | null => {
    const state = useSessionStore.getState();
    if (startedIn && (state.currentSession?.id === startedIn || state.sessions.some((session) => session.id === startedIn))) return startedIn;
    if (!startedIn?.startsWith('session-') || !startedCreatedAt) return null;
    const renamed = [state.currentSession, ...state.sessions].find((session) => session?.createdAt === startedCreatedAt && !session.id.startsWith('session-'));
    return renamed?.id ?? null;
  };

  /** A message D1 already holds, into the application it belongs to (`stored`, so the sync never writes it again). */
  const addStoredMessage = (sessionId: string, message: { id: string; role: 'user'; content: string }) => {
    const newMessage: ChatMessage = { ...message, timestamp: new Date().toISOString(), stored: true };
    useSessionStore.setState((state) => {
      const append = (session: ApplicationSession): ApplicationSession =>
        (session.id === sessionId ? { ...session, chatMessages: [...session.chatMessages, newMessage] } : session);
      return {
        currentSession: state.currentSession ? append(state.currentSession) : state.currentSession,
        sessions: state.sessions.map(append),
      };
    });
  };

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
    // A chat reply, not a kit run: this tab stops reading it, and what was shown stays, marked stopped, on this screen
    // only. The route finishes the turn and stores the whole reply (route.ts, runChatTurn), so the next turn and a
    // reload have it.
    const chatTurn = chatTurnRef.current;
    if (chatTurn) {
      const streaming = useStreamingReply.getState().reply;
      useStreamingReply.getState().clearTurn(chatTurn);
      chatTurnRef.current = null;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setIsTyping(false);
      const target = resolveTurnSession(streaming?.sessionId ?? null, streaming?.sessionCreatedAt ?? null);
      if (streaming?.turnId === chatTurn && target && streaming.text.trim()) {
        // Not a `msg-` id, so the chat sync never writes it (useSupabaseSync): it lives on this screen only.
        addReplyMessage(
          { role: 'assistant', content: streaming.text, actions: [{ label: 'Stopped', action: 'none' }] },
          `stopped-${chatTurn}`,
          target,
        );
      }
      return;
    }
    const stoppedSessionId = currentSession?.id;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      window.setTimeout(triggerCreditUpdate, 750);
    }
    void syncJobFeedGenerationStatus('cancelled', 'Generation stopped by the user.', stoppedSessionId);
    setIsTyping(false);
    setV2Progress(null);
    setAgentSteps([]);
    
    addChatMessage({
      role: 'assistant',
      content: '⚠️ Generation stopped. No problem! When you\'re ready, paste a new job description to start a fresh application.',
    });
  };

  const getSmartFallbackResponse = (message: string): string => {
    const lowerMessage = message.toLowerCase();

    // The keyword branches below read a short typed question. Substring
    // matching them against a pasted ad is how a job description that says
    // "we help companies…" got answered with the "I can help you with" menu.
    const isPaste = message.length > 500;

    if (!currentCV) {
      return "To get started, please upload your CV in the **Documents** section. Once uploaded, paste a job description here and I'll optimize your application.";
    }

    if (isPaste) {
      return "I couldn't read that one just now. Nothing was charged, so send it again when you're ready.";
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

  // What the server says a tool actually did. Stores refresh from it so the
  // dashboard updates live without a reload.
  const applyExecutedEffects = (
    executed: unknown,
    userMessage: string,
    opts: { startedIn: string | null; suppressProposal: boolean },
  ): { refusal: string | null; note: string | null } => {
    if (!Array.isArray(executed)) return { refusal: null, note: null };
    // Effects that write to the open application only make sense if the user
    // is still looking at the one that asked. Switching applications mid
    // request would otherwise overwrite the wrong row.
    const stillHere = useSessionStore.getState().currentSession?.id === opts.startedIn;
    // Several structure edits in one turn each ship the WHOLE composed object
    // from the server's working copy, so the last one already contains all of
    // them. Applying them in sequence would fail every one after the first, on
    // its own base digest, and leave the CV half way through what the reply
    // says happened. Only the last one is applied.
    const lastCvEdit = (executed as ExecutedEffect[])
      .filter((effect) => effect.type === 'cv_structure_updated')
      .at(-1);
    let cvRefusal: string | null = null;
    let proposalNote: string | null = null;
    for (const effect of executed as ExecutedEffect[]) {
      if (effect.type === 'propose_application') {
        if (opts.suppressProposal || !stillHere) continue;
        // Classification only. The decision card the client shows is where
        // the user picks fit analysis or the full kit, so nothing is spent
        // here and nothing starts.
        proposalNote = options?.onProposeApplication?.(userMessage) ?? null;
      } else if (effect.type === 'set_cv_template') {
        if (!stillHere) continue;
        useUIStore.getState().setCvTemplateId(effect.templateId);
        useAppStore.getState().updateCurrentSession({ selectedTemplate: effect.templateId });
        writeDefaultTemplate(effect.templateId);
      } else if (effect.type === 'cv_structure_updated') {
        // Not a failure: several edits in one turn each ship the whole composed
        // object, so only the last one is the edit. The others are dropped in
        // silence on purpose.
        if (effect !== lastCvEdit) continue;
        const live = useSessionStore.getState().currentSession;
        // The server reply may say the edit landed. Every path out of here that
        // does not write has to replace that claim before it reaches the
        // transcript or gets an Undo button.
        if (!stillHere || !live || live.id !== effect.sessionId) {
          cvRefusal = 'That one didn\'t land. You moved to another application while I was working on it, so I left both CVs alone. Open that one again and ask me there.';
          continue;
        }
        if (!live.optimizedCVData) {
          cvRefusal = 'That one didn\'t land. There\'s no tailored CV open here any more.';
          continue;
        }
        // A canvas edit that landed while the request was in flight would be
        // silently clobbered by an object computed from the older CV. The
        // digest is content-based, so an identical reload still applies.
        if (cvStructureDigest(live.optimizedCVData) !== effect.baseDigest) {
          cvRefusal = 'Your CV changed while I was working on that, so I left it alone. Ask me again and I\'ll work from what\'s there now.';
          continue;
        }
        const applied = {
          ...effect.cv,
          // Same three keys CVPanel.onSave preserves. sectionHeaders comes from
          // the effect, because rename_heading is the one operation that
          // legitimately changes it.
          analysis: live.optimizedCVData.analysis,
          localizedStrings: live.optimizedCVData.localizedStrings,
        };
        // The snapshot is the live object itself, so undo restores analysis,
        // sectionHeaders and localizedStrings by construction. The digest of
        // what we are about to write rides along, so a later canvas edit or a
        // confirmed delete makes the Undo chip refuse instead of reverting it.
        rememberUndo(live.id, live.optimizedCVData, cvStructureDigest(applied));
        useAppStore.getState().updateCurrentSession({ optimizedCVData: applied });
      } else if (effect.type === 'navigate') {
        if (effect.target === 'tracker') setActiveTab('tracker');
        else if (effect.target === 'job-feed') setActiveTab('jobs');
        else if (effect.target === 'documents') openSettings('cv');
        else if (effect.target === 'billing') openSettings('usage');
      } else if (effect.type === 'tracker_updated') {
        if (user) void useTrackerStore.getState().load(user.id);
      } else if (effect.type === 'refresh_credits') {
        triggerCreditUpdate();
      } else if (effect.type === 'feed_settings_updated') {
        // The settings panel and the feed both read the store, so one quiet
        // reload is enough. Nothing on screen is replaced mid-read.
        void loadFeedOverview({ quiet: true });
      } else if (effect.type === 'run_feed') {
        // The feed conversation owns the run and its progress UI. Raise the
        // flag, then bring the user to the column that shows it.
        useUIStore.getState().setPendingFeedRunAt(Date.now());
        setActiveTab('jobs');
      } else if (effect.type === 'feed_item_updated') {
        // A dismiss drops the role from the list and a save changes which tab
        // it belongs to. The Saved list is refetched rather than just cleared:
        // clearing it while the user is looking at the Saved tab would blank
        // the column, since nothing refetches on that tab except on entry.
        void loadFeedOverview({ quiet: true });
        if (useFeedStore.getState().savedJobs !== null) {
          void loadSavedFeedJobs();
        }
        notifyJobFeedBadgeRefresh();
      }
    }
    return { refusal: cvRefusal, note: proposalNote };
  };

  // No proposal came back, either because the model read the ad as a question
  // or because the request never reached it. Either way the paste must not be
  // a dead end: the client decides whether to offer the manual chip.
  const offerManualWayIn = (
    message: string,
    startedIn: string | null,
    opts?: { suppressProposal?: boolean },
  ) => {
    if (opts?.suppressProposal) return;
    if (useSessionStore.getState().currentSession?.id !== startedIn) return;
    options?.onChatAnsweredWithoutProposal?.(message);
  };

  const handleGeneralChat = async (
    message: string,
    opts?: { suppressProposal?: boolean },
  ) => {
    setIsTyping(true);
    // The reply lands asynchronously; effects that touch the open application
    // check this before applying. Read the live store, not the render closure:
    // on a new conversation handleSend creates the session and calls this
    // synchronously, so the closure still holds the previous (null) session
    // and every effect in the reply would be dropped as "not still here".
    const startedIn = useSessionStore.getState().currentSession?.id ?? null;
    // A failure answer goes to the application the turn started in, or to the open one when that id is gone (a local
    // conversation that got its saved id while the request was out).
    const addFailureReply = (message: { role: 'assistant'; content: string }) => {
      const state = useSessionStore.getState();
      const known = startedIn !== null
        && (state.currentSession?.id === startedIn || state.sessions.some((session) => session.id === startedIn));
      if (known) addWorkflowMessage(startedIn, message);
      // A local conversation that got its saved id while the request was out: it is the open one.
      else if (startedIn?.startsWith('session-')) addChatMessage(message);
      // The application is gone: say nothing in an unrelated one.
      else console.error(`[chat] the application ${startedIn ?? '(none)'} this turn started in is gone; its failure reply is dropped`);
    };

    const controller = new AbortController();
    abortControllerRef.current = controller;
    // The streamed bubble for this turn (streaming-reply.ts), and whether the watchdog, not Stop, ended it.
    const startedCreatedAt = useSessionStore.getState().currentSession?.createdAt ?? null;
    const streamTurnId = useStreamingReply.getState().start(startedIn, startedCreatedAt);
    chatTurnRef.current = streamTurnId;
    let idledOut = false;
    let streamOpened = false;
    // This tab lost the reply (the stream broke, or no byte came for the watchdog's limit). On a saved application the
    // route finishes a turn whose client left and stores the reply, so the notice says a reload may show it; a local
    // conversation stores nothing, so there it asks to send again. Either way it lives on this screen only: a `notice-`
    // id the sync never writes, so D1 never holds a failure line next to the real reply.
    const showConnectionLost = () => flushSync(() => {
      useStreamingReply.getState().clearTurn(streamTurnId);
      const target = resolveTurnSession(startedIn, startedCreatedAt);
      if (target) {
        addReplyMessage({
          role: 'assistant',
          content: startedIn && !startedIn.startsWith('session-')
            ? 'I lost the connection while the reply was coming in. If it finished, it shows after a reload.'
            : 'I lost the connection while the reply was coming in. Send your message again.',
          actions: [],
        }, `notice-${streamTurnId}`, target);
      }
      setIsTyping(false);
    });

    try {
      const { masterCV, certifications } = useAppStore.getState();
      const { chatHistory: recentMessages, messageId } = chatRequestHistory(message);
      // Messages added just before this turn reach D1 first, so the route's history keeps the transcript's order.
      // A message that could not be written (a pasted ad) would be missing from the route's history, and the model
      // would answer without it. Hold the turn and say so, rather than answer as if it were not there.
      if (startedIn && !startedIn.startsWith('session-') && await flushChatSync(startedIn, messageId) === 'failed') {
        addFailureReply({
          role: 'assistant',
          content: "I couldn't save your earlier message, so I can't see it yet. Check your connection and send your question again.",
        });
        return;
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        // The reply as it is written (reply-stream.ts). A server from before streaming answers JSON, handled below too.
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          message,
          ...(messageId ? { messageId } : {}),
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
            hasGeneratedFollowUp: !!currentSession?.followUpEmail,
            // For the tool registry: the saved application this chat is on
            // (the route validates the id) and the user's clock for dates.
            sessionId: startedIn ?? undefined,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            cvTemplateId: useUIStore.getState().cvTemplateId,
            // The tailored CV the canvas is showing, for the structure tools.
            // Sent from the store rather than read server-side from D1: the
            // sync into D1 is debounced by two seconds, so a canvas edit the
            // user just saved would otherwise be reverted by an edit computed
            // from the older row. Omitted entirely when there is none.
            ...(currentSession?.optimizedCVData
              ? { optimizedCVData: currentSession.optimizedCVData }
              : {}),
          },
        }),
        signal: controller.signal,
      });

      // The turn the route stored under its own id (sent without one): shown before its reply, already in D1. A streamed
      // turn announces it first, and the final body repeats it.
      let storedTurnShown = false;
      const showStoredTurn = (stored: unknown) => {
        const turn = stored as { id?: unknown; content?: unknown } | null | undefined;
        if (storedTurnShown || !startedIn || !turn || typeof turn.id !== 'string' || typeof turn.content !== 'string') return;
        storedTurnShown = true;
        addStoredMessage(startedIn, { id: turn.id, role: 'user', content: turn.content });
      };

      const handleReply = (body: { reply: string; actions?: ChatAction[]; executed?: unknown; replyMessageId?: unknown; compactedThroughMessageId?: unknown; storedUserMessage?: unknown }) => {
        const { reply, actions, executed, replyMessageId, compactedThroughMessageId, storedUserMessage } = body;
        showStoredTurn(storedUserMessage);
        if (startedIn && compactedThroughMessageId !== undefined) {
          useChatCompactionMarker.getState().setMarker(startedIn, typeof compactedThroughMessageId === 'string' ? compactedThroughMessageId : null);
        }
        // Apply effects before committing the assistant turn. A CV effect can
        // be refused when the canvas changed during the request, and in that
        // case the transcript must contain the refusal instead of the model's
        // stale success claim. The rejected edit cannot be undone because it
        // never landed, so its Undo action is removed too.
        const { refusal: effectRefusal, note: effectNote } = applyExecutedEffects(executed as ExecutedEffect[] | undefined, message, {
          startedIn,
          suppressProposal: Boolean(opts?.suppressProposal),
        });
        // The streamed bubble and the finished reply swap in the same render (streaming-reply.ts).
        useStreamingReply.getState().clearTurn(streamTurnId);
        addReplyMessage({
          role: 'assistant',
          content: effectRefusal || (effectNote ? `${reply}\n\n${effectNote}` : reply),
          actions: effectRefusal
            ? (actions || []).filter((action: { action?: string }) => !action.action?.startsWith('undo-cv-edit:'))
            : actions || [],
        }, typeof replyMessageId === 'string' ? replyMessageId : undefined, startedIn);
        // A real ad the model read as a question would otherwise be a dead
        // end: no card, no run, no way back. The client offers a manual way
        // in when the text looked like an ad and no proposal came back. A reply
        // that raised its own button (a rewrite, a delete) understood the
        // message, and the way-in card would hide that button.
        const proposed = Array.isArray(executed)
          && (executed as ExecutedEffect[]).some((effect) => effect.type === 'propose_application');
        const raisedAction = !effectRefusal && Array.isArray(actions) && actions.length > 0;
        if (!proposed && !raisedAction) offerManualWayIn(message, startedIn, opts);
      };

      const handleFailure = (errorData: Record<string, unknown> | null) => {
        useStreamingReply.getState().clearTurn(streamTurnId);
        // A turn the route stored under its own id before it failed: shown before the failure reply, as on success.
        showStoredTurn(errorData?.storedUserMessage);
        if (errorData?.code === 'CHAT_LIMIT_REACHED') {
          addFailureReply({
            role: 'assistant',
            content: 'You\'ve reached the chat message limit for this application. Start a new application from the sidebar to keep going.',
          });
        } else if (errorData?.code === 'CHAT_PROVIDER_UNAVAILABLE') {
          // The route dropped the block it could not send (the next turn compacts again), so the divider goes too.
          if (startedIn && errorData.compactedThroughMessageId === null) useChatCompactionMarker.getState().setMarker(startedIn, null);
          addFailureReply({
            role: 'assistant',
            content: "I couldn't answer that just now. Your conversation is saved, so try again in a minute.",
          });
        } else if (errorData?.code === 'CHAT_STREAM_IDLE' || errorData?.code === 'CHAT_STREAM_INTERRUPTED') {
          // The reply broke off after some of it was on screen. Nothing of it was stored, so the bubble goes, and
          // effects a tool round already committed still land. With such effects the route sends the line that says so.
          applyExecutedEffects(Array.isArray(errorData.executed) ? errorData.executed as ExecutedEffect[] : undefined, message, {
            startedIn,
            suppressProposal: true,
          });
          const storedLine = typeof errorData.reply === 'string' && typeof errorData.replyMessageId === 'string'
            ? { content: errorData.reply, id: errorData.replyMessageId }
            : null;
          const target = resolveTurnSession(startedIn, startedCreatedAt);
          if (storedLine && target) {
            // The route stored that line under this id: the transcript keeps the same row, so the sync never adds one.
            addReplyMessage({ role: 'assistant', content: storedLine.content, actions: [] }, storedLine.id, target);
          } else {
            addFailureReply({
              role: 'assistant',
              content: typeof errorData.reply === 'string'
                ? errorData.reply
                : errorData.code === 'CHAT_STREAM_IDLE'
                  ? "The reply stopped coming for a minute, so I ended it. Your message is saved, so try again."
                  : 'The reply was cut off. Your message is saved, so try again.',
            });
          }
        } else if (errorData?.code === 'MESSAGE_TOO_LONG') {
          addFailureReply({
            role: 'assistant',
            content: 'That job ad is longer than I can read in one go. Paste the role, requirements and responsibilities and leave out the boilerplate.',
          });
        } else {
          addFailureReply({
            role: 'assistant',
            content: getSmartFallbackResponse(message),
          });
          offerManualWayIn(message, startedIn, opts);
        }
      };

      if (response.status === 401) {
        if (user) options?.onSessionExpired?.();
        else options?.onAnonymousLimitReached?.();
      } else if (response.ok && (response.headers.get('content-type') ?? '').includes('text/event-stream')) {
        streamOpened = true;
        const ended = await readChatStream(response, {
          onTurn: (event) => showStoredTurn(event.storedUserMessage),
          onDelta: (text) => useStreamingReply.getState().append(streamTurnId, text),
          onStatus: (status) => useStreamingReply.getState().setStatus(streamTurnId, status),
          // The bubble, the typing state and the landed message change in one commit: a render between them would
          // flash the typing indicator under the finished reply, or show the reply twice.
          onDone: (event) => flushSync(() => {
            handleReply(event as unknown as Parameters<typeof handleReply>[0]);
            setIsTyping(false);
          }),
          onError: (event) => flushSync(() => {
            handleFailure(event);
            setIsTyping(false);
          }),
          // No byte for longer than the server's own idle limit plus its heartbeat: the connection is gone.
          onIdle: () => {
            idledOut = true;
            controller.abort();
          },
        });
        // The server always ends a turn with done or error. A stream that just stopped was cut on the way.
        if (!ended) showConnectionLost();
      } else if (response.ok) {
        handleReply(await response.json());
      } else {
        handleFailure(await response.json().catch(() => null));
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Stop keeps what was shown (handleStopGeneration). The idle watchdog says what happened.
        if (idledOut) showConnectionLost();
        return;
      }
      // The connection broke while the reply was streaming in.
      if (streamOpened) {
        showConnectionLost();
        return;
      }
      useStreamingReply.getState().clearTurn(streamTurnId);
      addFailureReply({
        role: 'assistant',
        content: getSmartFallbackResponse(message),
      });
      offerManualWayIn(message, startedIn, opts);
    } finally {
      useStreamingReply.getState().clearTurn(streamTurnId);
      // A turn stopped earlier must not reset the UI of the turn the user started after it.
      const ownsUi = chatTurnRef.current === streamTurnId || chatTurnRef.current === null;
      if (ownsUi) {
        setIsTyping(false);
        setIsScreeningMode(false);
      }
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      if (chatTurnRef.current === streamTurnId) chatTurnRef.current = null;
    }
  };

  /**
   * Screening answers for the kit: one question in, the raw answer blocks out.
   * Adds no chat messages itself; the caller decides what the conversation
   * shows and where the answers land (the Answers tab).
   */
  const fetchScreeningAnswers = async (
    question: string,
  ): Promise<
    | { ok: true; reply: string; turnsUsed: number | null }
    | { ok: false; code: 'PLAN_REQUIRED' | 'CHAT_LIMIT' | 'SIGNED_OUT' | 'NOT_SAVED' | 'CAP_REACHED' | 'ERROR'; turnsUsed?: number }
  > => {
    // Own controller: this must never replace the SSE workflow's abort handle.
    const controller = new AbortController();
    try {
      // No master CV here: the route reads the applicant's own CVs on the server.
      const { certifications } = useAppStore.getState();
      // Screening runs on a saved application, so the route reads the history from D1; the id only keeps the question
      // itself out of it when the transcript already holds it.
      const { chatHistory: recentMessages, messageId } = chatRequestHistory(question);
      const screeningSessionId = useSessionStore.getState().currentSession?.id;
      if (messageId && screeningSessionId) await flushChatSync(screeningSessionId, messageId);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: question,
          ...(messageId ? { messageId } : {}),
          context: {
            hasCV: !!currentCV,
            cvSummary: currentCV?.sections?.summary?.substring(0, 500),
            hasAnalysis: !!currentSession?.gaps,
            jobTitle: currentSession?.jobTitle,
            company: currentSession?.company,
            hasCertifications: certifications.length > 0,
            certificationsCount: certifications.length,
            certificationsList: certifications.map(c => c.fileName).join(', '),
            chatHistory: recentMessages,
            hasGeneratedCV: !!currentSession?.generatedCV,
            hasGeneratedCoverLetter: !!currentSession?.coverLetter,
            hasGeneratedEmail: !!currentSession?.email,
            mode: 'screening_answers' as const,
            // The route spends the turn against this row, so it has to be the
            // saved application, not the local draft id.
            sessionId: screeningSessionId,
            // The server cuts the ad at 20,000 chars (MAX_SCREENING_JOB_DESCRIPTION_CHARS); real ads run to about 11,400 (longest 11,421).
            jobDescription: currentSession?.jobDescription?.substring(0, 20_000),
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
        const { reply, screeningTurnsUsed } = await response.json();
        return typeof reply === 'string'
          ? { ok: true, reply, turnsUsed: typeof screeningTurnsUsed === 'number' ? screeningTurnsUsed : null }
          : { ok: false, code: 'ERROR' };
      }
      if (response.status === 401) return { ok: false, code: 'SIGNED_OUT' };
      if (response.status === 403) return { ok: false, code: 'PLAN_REQUIRED' };
      const errorData = await response.json().catch(() => null);
      if (errorData?.code === 'CHAT_LIMIT_REACHED') return { ok: false, code: 'CHAT_LIMIT' };
      if (errorData?.code === 'SCREENING_SESSION_REQUIRED') return { ok: false, code: 'NOT_SAVED' };
      if (errorData?.code === 'SCREENING_CAP_REACHED') {
        return { ok: false, code: 'CAP_REACHED', turnsUsed: errorData.screeningTurnsUsed };
      }
      return { ok: false, code: 'ERROR' };
    } catch {
      return { ok: false, code: 'ERROR' };
    }
  };

  const runFitAnalysisFlow = async (jobDescription: string) => {
    if (!currentCV) return;
    // A fit run replaces a parked kit run (its card closes), so the two can't run side by side.
    useUIStore.getState().setPendingLogistics(null);
    const fitWorkflowSessionId = useSessionStore.getState().currentSession?.id;

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
          sessionId: fitWorkflowSessionId,
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
                setAgentSteps(data.steps.map((s: { function: string; description: string }) => ({
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
                // Keep parsed context for the fit UI and session resume only.
                setFitAnalysisContextData({
                  applicant,
                  job,
                  match,
                  verifiedMetrics,
                  detectedLanguage,
                  fitAnalysis,
                });
                // For a stored application the server saved what the analysis found (agent-v2
                // writes the fit columns with a revision bump), so it is loaded below instead of
                // written from this response. An unsaved session has no row and takes it directly.
                const storedFit = Boolean(user) && typeof fitWorkflowSessionId === 'string' && !fitWorkflowSessionId.startsWith('session-');
                if (!storedFit) {
                  // Persist job title, company, and match data to the session
                  // so tracker shows correct info if user proceeds to apply.
                  // Keep a feed-provided title (e.g. "Product Manager - B2B SaaS")
                  // instead of the parser's shortened title.
                  if (job?.title || job?.companyName) {
                    const existing = useSessionStore.getState().sessions.find((session) => session.id === fitWorkflowSessionId);
                    if (fitWorkflowSessionId) useAppStore.getState().updateSessionById(fitWorkflowSessionId, {
                      jobTitle: existing?.jobTitle?.trim() || job.title || '',
                      company: existing?.company?.trim() || job.companyName || '',
                      requirements: {
                        title: job.title || '',
                        company: job.companyName || '',
                        hardSkills: job.requiredSkills || [],
                        softSkills: [],
                        experienceLevel: '',
                        keywords: [],
                        responsibilities: job.responsibilities || [],
                        niceToHave: job.niceToHaveSkills || [],
                        expectedSalary: job.expectedSalary,
                        startDate: job.startDate,
                        location: job.location,
                        workType: job.workType,
                        detectedLanguage,
                      },
                    });
                  }
                  if (match) {
                    if (fitWorkflowSessionId) useAppStore.getState().updateSessionById(fitWorkflowSessionId, {
                      matchScore: match.score,
                      matchingSkills: match.matchedRequirements || [],
                      missingSkills: match.missingSkills || [],
                    });
                  }
                }
                // Persist fit analysis state to session so it survives session switches
                if (fitWorkflowSessionId) useAppStore.getState().updateSessionById(fitWorkflowSessionId, {
                  pendingFitAnalysis: {
                    contextId,
                    jobDescription: jobDescription,
                    contextData: { applicant, job, match, verifiedMetrics, detectedLanguage, fitAnalysis },
                    createdAt: new Date().toISOString(),
                  },
                });
                addWorkflowMessage(fitWorkflowSessionId, {
                  role: 'assistant',
                  content: formatFitAnalysisMessage(fitAnalysis, job),
                });
                triggerCreditUpdate();
                if (storedFit) void refreshFromServer(fitWorkflowSessionId);
                break;
              }
              case 'error':
                triggerCreditUpdate();
                if (data.code === 'ANONYMOUS_LIMIT_REACHED') {
                  if (user) options?.onSessionExpired?.();
                  else options?.onAnonymousLimitReached?.();
                } else if (data.code === 'INSUFFICIENT_CREDITS') {
                  const required = data.details?.required ?? data.details?.details?.required ?? 0;
                  const available = data.details?.available ?? data.details?.details?.available ?? 0;
                  options?.onInsufficientCredits?.(required, available);
                } else if (data.code === 'REQUEST_IN_PROGRESS') {
                  addWorkflowMessage(fitWorkflowSessionId, {
                    role: 'assistant',
                    content: 'That request is still running.',
                  });
                } else if (data.code === 'REQUEST_ALREADY_COMPLETED') {
                  addWorkflowMessage(fitWorkflowSessionId, {
                    role: 'assistant',
                    content: "That request already finished. You weren't charged twice.",
                  });
                } else {
                  addWorkflowMessage(fitWorkflowSessionId, {
                    role: 'assistant',
                    content: `❌ ${typeof data.message === 'string' && data.message.trim()
                      ? data.message.trim()
                      : 'Something went wrong. Please try again.'}`,
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
      window.setTimeout(triggerCreditUpdate, 750);
      addWorkflowMessage(fitWorkflowSessionId, {
        role: 'assistant',
        content: '❌ Sorry, the fit analysis failed. Please try again.',
      });
    } finally {
      setIsAgentWorking(false);
      setAgentWorkflowPhase(null);
      abortControllerRef.current = null;
    }
  };

  /**
   * The kit writers use the applicant's own start date and salary, so they're
   * asked once before the first kit. Parks the run (before any request, so no
   * credits move) and returns true when the questions still need answering.
   */
  const parkForLogistics = (jobDescription: string, contextId?: string, contextData?: unknown): boolean => {
    if (!needsAvailabilityPrompt(profileRef.current)) return false;
    useUIStore.getState().setPendingLogistics({
      host: options?.logisticsHost ?? 'chat',
      sessionId: useSessionStore.getState().currentSession?.id ?? null,
      jd: jobDescription,
      contextId,
      contextData,
    });
    setIsAgentWorking(false);
    setAgentWorkflowPhase(null);
    setV2Progress(null);
    return true;
  };

  /**
   * The questions are answered or skipped: say so, then run the parked kit as it was asked for.
   * `beforeRun` is the caller's own step that must happen only when the run really starts (the chat
   * clears the fit there). Returns the sentence to announce, or null when nothing ran: the parked run
   * belongs to another application now, or another run is already working, so credits can't be spent twice.
   */
  const resumeAfterLogistics = (outcome: 'saved' | 'skipped' | 'answered', beforeRun?: () => void): string | null => {
    const parked = useUIStore.getState().pendingLogistics;
    if (!parked) return null;
    useUIStore.getState().setPendingLogistics(null);
    const currentSessionId = useSessionStore.getState().currentSession?.id ?? null;
    if (!parkedRunStillValid(parked.sessionId, currentSessionId, useUIStore.getState().isAgentWorking)) return null;
    const content = outcome === 'skipped'
      ? "No problem. I'll keep the timing general and leave salary out."
      : 'Got it. Writing your kit now.';
    addChatMessage({ role: 'assistant', content });
    beforeRun?.();
    void runAgentWorkflow(
      parked.jd,
      parked.contextId,
      parked.contextData as FitAnalysisContextData | undefined,
      { logisticsResolved: true },
    );
    return content;
  };

  /**
   * A signed-in user whose profile hasn't loaded yet (a click right after the page opens) would skip the
   * start date questions, so the profile is read first. Returns false when it can't be read, so the caller
   * says so instead of starting a run that would skip the questions.
   */
  const ensureProfileLoaded = async (): Promise<boolean> => {
    if (!user || profileRef.current) return true;
    const loaded = await refreshProfile();
    if (!loaded) return false;
    profileRef.current = loaded;
    return true;
  };

  /** Resolves 'profile-unavailable' when the run didn't start because the profile couldn't be read. */
  const runAgentWorkflow = async (
    jobDescription: string,
    contextId?: string,
    _overrideContextData?: FitAnalysisContextData,
    runOptions?: { logisticsResolved?: boolean },
  ): Promise<'profile-unavailable' | void> => {
    if (!currentCV) return;
    // A new run replaces whatever was parked; this one parks again if it still needs the answers.
    if (!runOptions?.logisticsResolved) useUIStore.getState().setPendingLogistics(null);
    if (!runOptions?.logisticsResolved) {
      if (!(await ensureProfileLoaded())) {
        console.error('[useAgentWorkflow] The profile could not be read, so the kit did not start.');
        addChatMessage({ role: 'assistant', content: PROFILE_UNAVAILABLE });
        return 'profile-unavailable';
      }
      if (parkForLogistics(jobDescription, contextId, _overrideContextData)) return;
    }
    void _overrideContextData; // Legacy UI state only. Never send it as writer context.
    let workflowSessionId = useSessionStore.getState().currentSession?.id;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let eagerLocalSessionId: string | null = null;
    let eagerStoredSessionId: string | null = null;
    let didProduceArtifacts = false;
    // The saved kit loading back from the server (refreshFromServer). The run counts as working until it has landed:
    // GuidedLine reads "not working and no kit" as a failed run, and for that moment it showed "The kit didn't finish".
    let kitRefresh: Promise<unknown> | null = null;
    let requestStarted = false;
    let terminalServerError = false;

    setIsAgentWorking(true);
    setAgentWorkflowPhase('full_generation');
    setV2Progress({ percent: 0, message: 'Generating full application...' });
    setAgentSteps([]);
    setV2Reflection(null);
    setV2Models(null);
    setV2TokenUsage(null);

    try {
      const { masterCV } = useAppStore.getState();

      if (user && workflowSessionId?.startsWith('session-')) {
        const localSessionId = workflowSessionId;
        eagerLocalSessionId = localSessionId;
        const localSession = useSessionStore.getState().sessions.find((session) => session.id === localSessionId)
          ?? useSessionStore.getState().currentSession;
        const created = await createStoredSession(user.id, jobDescription);
        if (created.error || !created.session) {
          throw created.error ?? new Error('Failed to save application before generation');
        }
        eagerStoredSessionId = created.session.id;
        // The bare stored row is what the server holds. The local content goes
        // out afterwards as an ordinary revisioned save over it.
        await applyServerRow(created.session.id, created.session as unknown as StoredSessionRow, 'handoff');
        if (!localSession) {
          throw new Error('Local application disappeared before generation');
        }
        controller.signal.throwIfAborted();
        workflowSessionId = created.session.id;
        const persistedId = workflowSessionId;
        useSessionStore.setState((state) => {
          const replace = (session: typeof localSession) => session.id === localSessionId
            ? { ...session, id: persistedId, revision: created.session?.revision ?? 0 }
            : session;
          return {
            sessions: state.sessions.map(replace),
            currentSession: state.currentSession?.id === localSessionId
              ? replace(state.currentSession)
              : state.currentSession,
          };
        });
      }

      void syncJobFeedGenerationStatus('running', undefined, workflowSessionId);

      // Stable idempotency key for this workflow. Server uses it to dedupe
      // credit reservations across transient retries.
      const requestId = generateRequestId();

      requestStarted = true;
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
          sessionId: workflowSessionId,
        }),
        signal: controller.signal,
      });
      
      if (!response.ok) {
        terminalServerError = true;
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
                setAgentSteps(data.steps.map((s: { function: string; description: string }) => ({
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
                didProduceArtifacts = true;
                const ctx = data.results;
                // A partial kit is still a finished kit: the failed documents
                // are listed here and each tab shows its own error state.
                const kitErrors = readKitDocumentErrors(ctx?.documentErrors) ?? {};
                const creditsRefunded = typeof data.creditsRefunded === 'number' && data.creditsRefunded > 0
                  ? data.creditsRefunded
                  : 0;
                void syncJobFeedGenerationStatus('succeeded', undefined, workflowSessionId);
                notifyJobFeedBadgeRefresh();
                posthog.capture('application_generated', {
                  mode: contextId ? 'analyze_first' : 'apply_directly',
                  job_title: ctx?.job?.title,
                  company: ctx?.job?.companyName,
                  match_score: ctx?.match?.score,
                  failed_documents: Object.keys(kitErrors),
                });

                // A stored application is not written from this response. The server saved the kit
                // (agent-v2 persists it before it announces completion), and this response can arrive
                // after a newer revision was loaded; installing its fields would put older content on
                // screen. The refresh below loads the saved row instead. Only an anonymous or unsaved
                // session, which has no row to load, takes the result directly.
                const storedApplication = Boolean(user) && typeof workflowSessionId === 'string' && !workflowSessionId.startsWith('session-');
                if (!storedApplication) {
                  if (ctx?.job) {
                    const existing = useSessionStore.getState().sessions.find((session) => session.id === workflowSessionId);
                    if (workflowSessionId) useAppStore.getState().updateSessionById(workflowSessionId, {
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
                        detectedLanguage: ctx.detectedLanguage,
                      },
                      jobTitle: existing?.jobTitle?.trim() || ctx.job.title,
                      company: existing?.company?.trim() || ctx.job.companyName,
                    });
                  }
                
                  if (ctx?.match) {
                    if (workflowSessionId) useAppStore.getState().updateSessionById(workflowSessionId, {
                      gaps: {
                        matchScore: ctx.match.score || 0,
                        matchingSkills: ctx.match.matchedRequirements || [],
                        missingSkills: ctx.match.missingSkills || [],
                        matchingExperience: [],
                        missingExperience: [],
                        suggestions: [],
                      },
                      matchScore: ctx.match.score,
                      matchingSkills: ctx.match.matchedRequirements || [],
                      missingSkills: ctx.match.missingSkills || [],
                    });
                  }
                
                  if (ctx?.optimizedCV) {
                    if (workflowSessionId) useAppStore.getState().updateSessionById(workflowSessionId, {
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
                    if (workflowSessionId) useAppStore.getState().updateSessionById(workflowSessionId, {
                      optimizedCVData: ctx.optimizedCVData,
                    });
                  }
                
                  if (ctx?.coverLetter) {
                    if (workflowSessionId) useAppStore.getState().updateSessionById(workflowSessionId, {
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
                        ...(isStructuredCoverLetter(ctx.coverLetterStructured) ? { structured: ctx.coverLetterStructured } : {}),
                      },
                    });
                  }
                
                  if (ctx?.applicationEmail) {
                    if (workflowSessionId) useAppStore.getState().updateSessionById(workflowSessionId, {
                      email: {
                        subject: ctx.applicationEmail.subject || `Application for ${ctx.job?.title || 'Position'} at ${ctx.job?.companyName || 'Company'}`,
                        body: ctx.applicationEmail.body || '',
                        attachmentNote: 'Please find my CV and cover letter attached.',
                      },
                    });
                  }

                  if (workflowSessionId) {
                    useAppStore.getState().updateSessionById(workflowSessionId, {
                      followUpEmail: ctx?.followUpEmail ? {
                        subject: ctx.followUpEmail.subject,
                        body: ctx.followUpEmail.body,
                        recommendedDelay: ctx.followUpEmail.recommendedDelay || 5,
                      } : null,
                    });
                  }

                  // A document that failed in this run must not leave an older
                  // run's copy on screen as if it belonged to this job. Clear it
                  // so its tab shows the error and the retry instead.
                  if (workflowSessionId) {
                    useAppStore.getState().updateSessionById(workflowSessionId, {
                      kitDocumentErrors: Object.keys(kitErrors).length > 0 ? kitErrors : null,
                      ...(kitErrors.cv ? { generatedCV: null, optimizedCVData: undefined } : {}),
                      ...(kitErrors.coverLetter ? { coverLetter: null } : {}),
                      ...(kitErrors.applicationEmail ? { email: null } : {}),
                    });
                  }
                
                  if (ctx?.companyResearch) {
                    if (workflowSessionId) useAppStore.getState().updateSessionById(workflowSessionId, {
                      companyResearch: ctx.companyResearch,
                    });
                  }
                
                }

                // Clear fit analysis pending state — application is done
                setFitAnalysisContextId(null);
                setFitAnalysisJD('');
                setFitAnalysisContextData(null);
                if (workflowSessionId) useAppStore.getState().updateSessionById(workflowSessionId, { pendingFitAnalysis: null });

                // Mark free generation as used for anonymous users
                if (!user) {
                  markFreeGenerationUsed();
                }

                const originStillOpen = useSessionStore.getState().currentSession?.id === workflowSessionId;
                if (originStillOpen) setActiveTab('cv');
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
                const originSession = useSessionStore.getState().sessions.find((session) => session.id === workflowSessionId);
                const kitCompany = ctx?.job?.companyName || originSession?.company;
                const atsNote = typeof ctx?.optimizedCVData?.analysis?.ats_compatibility === 'number'
                  ? ` (ATS ${Math.round(ctx.optimizedCVData.analysis.ats_compatibility)}%)`
                  : '';
                // A repeat on an application the user already sent gets its own
                // entry, because overwriting the CV they applied with would
                // destroy the only record of it. Saying so turns what looks
                // like a duplicate into a stated fact. An unsent draft is
                // reused instead, quietly, in useSupabaseSync.
                const sessionForMatch = originSession;
                const alreadySent = sessionForMatch
                  ? findSentApplicationForJob(useSessionStore.getState().sessions, sessionForMatch)
                  : null;
                const sentOn = alreadySent?.createdAt
                  ? formatDate(new Date(alreadySent.createdAt), datePrefs)
                  : null;
                const repeatNote = alreadySent
                  ? `\n\nYou already applied to this one${sentOn ? ` on ${sentOn}` : ''}. This kit is saved separately, so the one you sent stays as it is.`
                  : '';
                const kitReady: Record<KitDocument, boolean> = {
                  cv: !kitErrors.cv && Boolean(ctx?.optimizedCV || ctx?.optimizedCVData),
                  coverLetter: !kitErrors.coverLetter && Boolean(ctx?.coverLetter),
                  applicationEmail: !kitErrors.applicationEmail && Boolean(ctx?.applicationEmail),
                  followUpEmail: !kitErrors.followUpEmail && Boolean(ctx?.followUpEmail),
                };
                addWorkflowMessage(workflowSessionId, {
                  role: 'assistant',
                  content: `${kitReadyMessage({ company: kitCompany, atsNote: kitReady.cv ? atsNote : '', ready: kitReady, creditsRefunded })}${weakMatchNote}${repeatNote}`,
                  // Screening is offered once, here, while this is the newest message (ChatPanel shows a message's
                  // chips only under the newest reply). Answers are saved with the tailored CV, so it needs one.
                  ...(kitReady.cv
                    ? { actions: [{ label: 'Answer screening questions', action: 'start-screening-flow', icon: 'screening' as const }] }
                    : {}),
                });
                if (originStillOpen && isDirectPath && isWeakMatch) {
                  toast.warning(
                    `This role scored ${Math.round(resultScore)}%. That's a weak match. Review it before you send.`,
                  );
                }
                triggerCreditUpdate();
                // The server saved this kit (agent-v2 persists it before it
                // announces completion). Load what it saved instead of writing
                // our copy back, so the screen and the database agree and the
                // next edit starts from the right revision.
                if (workflowSessionId && !workflowSessionId.startsWith('session-')) {
                  kitRefresh = refreshFromServer(workflowSessionId);
                }
                break;
                
              case 'error':
                triggerCreditUpdate();
                terminalServerError = data.code !== 'REQUEST_IN_PROGRESS'
                  && data.code !== 'REQUEST_ALREADY_COMPLETED';
                if (data.code !== 'REQUEST_IN_PROGRESS' && data.code !== 'REQUEST_ALREADY_COMPLETED') {
                  void syncJobFeedGenerationStatus('failed', data.message || 'Application generation failed.', workflowSessionId);
                }
                if (data.code === 'ANONYMOUS_LIMIT_REACHED') {
                  if (user) options?.onSessionExpired?.();
                  else options?.onAnonymousLimitReached?.();
                } else if (data.code === 'INSUFFICIENT_CREDITS') {
                  const required = data.details?.required ?? data.details?.details?.required ?? 0;
                  const available = data.details?.available ?? data.details?.details?.available ?? 0;
                  options?.onInsufficientCredits?.(required, available);
                } else if (data.code === 'REQUEST_IN_PROGRESS') {
                  addWorkflowMessage(workflowSessionId, {
                    role: 'assistant',
                    content: 'That request is still running.',
                  });
                } else if (data.code === 'REQUEST_ALREADY_COMPLETED') {
                  void syncJobFeedGenerationStatus('succeeded', undefined, workflowSessionId);
                  addWorkflowMessage(workflowSessionId, {
                    role: 'assistant',
                    content: "That request already finished. You weren't charged twice.",
                  });
                } else {
                  addWorkflowMessage(workflowSessionId, {
                    role: 'assistant',
                    content: `❌ ${typeof data.message === 'string' && data.message.trim()
                      ? data.message.trim()
                      : 'Something went wrong. Please try again.'}`,
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
      window.setTimeout(triggerCreditUpdate, 750);
      void syncJobFeedGenerationStatus(
        'failed',
        error instanceof Error ? error.message : 'Application generation failed.',
        workflowSessionId,
      );
      addWorkflowMessage(workflowSessionId, {
        role: 'assistant',
        content: '❌ Sorry, the analysis failed. Please try again.',
      });
    } finally {
      const canDeleteEmptyEagerSession = !requestStarted || terminalServerError;
      if (eagerStoredSessionId && !didProduceArtifacts && canDeleteEmptyEagerSession && user) {
        try {
          const deleted = await deleteStoredSession(eagerStoredSessionId, user.id);
          if (deleted.error) throw deleted.error;
          forgetSession(eagerStoredSessionId);
          if (eagerLocalSessionId) {
            const persistedId = eagerStoredSessionId;
            const localId = eagerLocalSessionId;
            useSessionStore.setState((state) => ({
              sessions: state.sessions.map((session) => session.id === persistedId
                ? { ...session, id: localId }
                : session),
              currentSession: state.currentSession?.id === persistedId
                ? { ...state.currentSession, id: localId }
                : state.currentSession,
            }));
          }
        } catch (cleanupError) {
          console.error('[useAgentWorkflow] Failed to clean up empty eager session:', cleanupError);
        }
      }
      if (kitRefresh) {
        await kitRefresh.catch((error: unknown) => {
          console.error('[useAgentWorkflow] The saved kit did not load back:', error);
        });
      }
      setIsAgentWorking(false);
      setAgentWorkflowPhase(null);
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
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
      posthog.capture('jd_pasted', { jd_length: jd.length, mode: effectiveMode });
      if (effectiveMode === 'apply_directly') {
        setV2Progress({ percent: 0, message: 'Generating full application...' });
        runAgentWorkflow(jd);
      } else {
        setV2Progress({ percent: 0, message: 'Analyzing job fit...' });
        runFitAnalysisFlow(jd);
      }
    };

    if (!currentSession) {
      // No job description yet: this is a conversation until an ad lands in
      // it. Passing the message here would file every typed question as an
      // application (isApplicationSession reads jobDescription).
      createNewSession('');
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

      // Classification is the model's job now (propose_application), so an
      // unclicked message never starts a paid run from keyword counting.
      handleGeneralChat(messageContent);
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

      // No heuristic auto-start here either. A pasted ad is recognised by the
      // model, which calls propose_application; the user's click on the
      // decision card is what spends credits.
      handleGeneralChat(messageContent);
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
    ensureProfileLoaded,
    parkForLogistics,
    resumeAfterLogistics,
    runFitAnalysisFlow,
    // Setters needed by handleAction
    setFitAnalysisContextId,
    setFitAnalysisJD,
    setFitAnalysisContextData,
    setAgentSteps,
  };
}
