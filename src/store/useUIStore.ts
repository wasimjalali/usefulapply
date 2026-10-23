/**
 * UI Store - User Interface State
 * 
 * Manages UI-specific state (loading indicators, active tabs, errors)
 * This state is NOT persisted - resets on page reload
 * Part of the split from useAppStore.ts for better organization
 */

import { create } from 'zustand';
import { FALLBACK_TEMPLATE_ID, readDefaultTemplate } from '@/lib/cv-templates/default-template';

export type KitTab = 'cv' | 'cover-letter' | 'email' | 'answers';

/**
 * A job handed off from the feed. `headline` is what the conversation shows as
 * the user's message instead of the raw ad, so the application opens with
 * "<role> · <company>" and where it came from rather than a wall of text.
 */
export interface PendingJobFeedAutostart {
  sessionId: string;
  generationId?: string | null;
  generationAttempt?: number | null;
  mode?: 'apply' | 'analyze';
  headline?: string | null;
  company?: string | null;
}

export type PendingApplicationAction =
  | 'generate-full-application'
  | 'skip-job'
  | 'start-screening-flow'
  | 'skip-screening';

/**
 * A kit run parked before any request because the applicant was never asked
 * when they can start. The host that parked it (the guided line or the chat)
 * shows the two questions, then resumes the run with these same arguments.
 */
export interface PendingLogistics {
  host: 'guided' | 'chat';
  sessionId: string | null;
  jd: string;
  contextId?: string;
  contextData?: unknown;
}

interface UIState {
  // Loading states
  isAnalyzing: boolean;
  isGenerating: boolean;
  isAgentWorking: boolean;  // True when Useful Apply agent is running full workflow
  agentWorkflowPhase: 'fit_analysis' | 'full_generation' | null;  // Current agent phase for panel messages

  // UI state
  activeTab: KitTab | 'tracker' | 'jobs';
  error: string | null;

  // The conversation column can fold to a rail. Below roughly 1100px the shell
  // folds it on its own, because the sidebar and a 520px conversation leave the
  // canvas nothing. The tracker also reads this: SAVED returns as a column
  // when the conversation is out of the way.
  conversationCollapsed: boolean;
  canvasCollapsed: boolean;

  // CV template shown in the kit. Owned here so Download all can render the
  // same template from any kit tab, not only while CVPanel is mounted.
  cvTemplateId: string;
  /** Dragged width of the conversation column, or null for its responsive default. */
  conversationWidth: number | null;

  // A regeneration requested from the chat is running. The canvas banner
  // names the stage and the tab the result will land in.
  regenStage: { title: string; tab: KitTab } | null;

  // "Download all" on the canvas asks the always-mounted KitExportHost to
  // run. Monotonic counter so repeat
  // clicks re-fire; kitDownloadBusy lets every control show the same state.
  kitDownloadRequest: number;
  kitDownloadBusy: boolean;

  // Cross-component autostart signal for Apply-with-Useful Apply from the Job Feed.
  // Set by the feed handoff on click; ChatPanel picks it up and starts the agent
  // workflow immediately — even if the user does not navigate to the
  // Application Kit tab. Consumed-then-cleared by ChatPanel.
  pendingJobFeedAutostart: PendingJobFeedAutostart | null;

  // Cross-component action signal: application panels and Job Feed cards
  // dispatch ChatPanel-owned follow-up actions after fit analysis or kit generation.
  // Safe as a bare action because only one ChatPanel mounts at a time
  // (mobile viewport does not render ChatPanel at all — Application Kit is
  // desktop/tablet only).
  pendingApplicationAction: PendingApplicationAction | null;

  // Cross-panel focus signal: the CV panel's "Tailor for a job" CTA points the
  // user at the job-description input, which lives in the chat panel. A
  // monotonic counter rather than a boolean so repeat clicks re-fire.
  // The dashboard shell expands a collapsed chat panel on change; ChatPanel
  // focuses whichever JD field is mounted (launchpad textarea or composer).
  jdFocusRequest: number;

  // Sidebar "New application" signal. ChatPanel owns workflow-local reset.
  newApplicationRequest: number;

  // "Refresh my feed" asked for in the chat. The feed conversation owns the
  // run and its progress UI, so the chat only stamps the time; the feed
  // consumes it and clears it. A timestamp rather than a flag, so a request
  // nothing picked up expires instead of firing an unasked-for run later.
  pendingFeedRunAt: number | null;

  // A kit run waiting on the start date and salary questions. Transient like
  // the rest of this store: nothing has been requested or charged while it is set.
  pendingLogistics: PendingLogistics | null;
}

interface UIActions {
  // Loading state setters
  setIsAnalyzing: (value: boolean) => void;
  setIsGenerating: (value: boolean) => void;
  setIsAgentWorking: (value: boolean) => void;
  setAgentWorkflowPhase: (phase: 'fit_analysis' | 'full_generation' | null) => void;

  // UI state setters
  setActiveTab: (tab: KitTab | 'tracker' | 'jobs') => void;
  setError: (error: string | null) => void;
  setConversationCollapsed: (collapsed: boolean) => void;
  setCanvasCollapsed: (collapsed: boolean) => void;
  setCvTemplateId: (id: string) => void;
  setConversationWidth: (width: number | null) => void;
  setRegenStage: (stage: { title: string; tab: KitTab } | null) => void;
  requestKitDownload: () => void;
  setKitDownloadBusy: (busy: boolean) => void;

  // Autostart signal
  setPendingJobFeedAutostart: (value: PendingJobFeedAutostart | null) => void;

  // Panel action signal (fit analysis and screening CTAs dispatched outside ChatPanel)
  setPendingApplicationAction: (value: PendingApplicationAction | null) => void;

  // Focus signal for the job-description input (see jdFocusRequest)
  requestJdFocus: () => void;

  requestNewApplication: () => void;

  // Chat-requested feed run (see pendingFeedRunAt)
  setPendingFeedRunAt: (value: number | null) => void;

  setPendingLogistics: (value: PendingLogistics | null) => void;

  // Reset
  resetUI: () => void;
}

const initialState: UIState = {
  isAnalyzing: false,
  isGenerating: false,
  isAgentWorking: false,
  agentWorkflowPhase: null,
  activeTab: 'cv',
  error: null,
  conversationCollapsed: false,
  canvasCollapsed: false,
  // Seeded with the fallback so server and first client render agree; the shell
  // hydrates it from localStorage on mount (see AppShell).
  cvTemplateId: FALLBACK_TEMPLATE_ID,
  conversationWidth: null,
  regenStage: null,
  kitDownloadRequest: 0,
  kitDownloadBusy: false,
  pendingJobFeedAutostart: null,
  pendingApplicationAction: null,
  jdFocusRequest: 0,
  newApplicationRequest: 0,
  pendingFeedRunAt: null,
  pendingLogistics: null,
};

/**
 * UI Store - No persistence
 * UI state should reset on page reload for clean state
 */
export const useUIStore = create<UIState & UIActions>()((set) => ({
  ...initialState,

  // Loading state setters
  setIsAnalyzing: (value) => set({ isAnalyzing: value }),
  setIsGenerating: (value) => set({ isGenerating: value }),
  setIsAgentWorking: (value) => set({ isAgentWorking: value }),
  setAgentWorkflowPhase: (phase) => set({ agentWorkflowPhase: phase }),

  // UI state setters
  setActiveTab: (tab) => set({ activeTab: tab }),
  setError: (error) => set({ error }),
  // One column at a time. Folding both would leave the workspace empty, so
  // folding one always opens the other.
  setConversationCollapsed: (collapsed) =>
    set(collapsed ? { conversationCollapsed: true, canvasCollapsed: false } : { conversationCollapsed: false }),
  setCanvasCollapsed: (collapsed) =>
    set(collapsed ? { canvasCollapsed: true, conversationCollapsed: false } : { canvasCollapsed: false }),
  setCvTemplateId: (id) => set({ cvTemplateId: id }),
  setConversationWidth: (width) => set({ conversationWidth: width }),
  setRegenStage: (stage) => set({ regenStage: stage }),
  requestKitDownload: () => set((state) => ({ kitDownloadRequest: state.kitDownloadRequest + 1 })),
  setKitDownloadBusy: (busy) => set({ kitDownloadBusy: busy }),

  // Autostart signal
  setPendingJobFeedAutostart: (value) => set({ pendingJobFeedAutostart: value }),

  // Panel action signal
  setPendingApplicationAction: (value) => set({ pendingApplicationAction: value }),

  // Chat-requested feed run
  setPendingFeedRunAt: (value) => set({ pendingFeedRunAt: value }),

  setPendingLogistics: (value) => set({ pendingLogistics: value }),

  // Focus signal
  requestJdFocus: () => set((state) => ({ jdFocusRequest: state.jdFocusRequest + 1 })),
  // The tick resets the workspace, which ChatPanel owns. ChatPanel is mounted
  // but hidden behind the feed and the tracker, so the reset ran and the user
  // stayed looking at the feed with nothing to show for the click. Starting an
  // application has to bring the application back into view as well.
  requestNewApplication: () => set((state) => ({
    newApplicationRequest: state.newApplicationRequest + 1,
    activeTab: 'cv',
  })),

  // Reset
  resetUI: () => set({ ...initialState, cvTemplateId: readDefaultTemplate() }),
}));
