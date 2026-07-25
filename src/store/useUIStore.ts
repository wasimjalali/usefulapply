/**
 * UI Store - User Interface State
 * 
 * Manages UI-specific state (loading indicators, active tabs, errors)
 * This state is NOT persisted - resets on page reload
 * Part of the split from useAppStore.ts for better organization
 */

import { create } from 'zustand';

export type PendingApplicationAction =
  | 'generate-full-application'
  | 'skip-job'
  | 'start-screening-flow'
  | 'skip-screening';

interface UIState {
  // Loading states
  isAnalyzing: boolean;
  isGenerating: boolean;
  isAgentWorking: boolean;  // True when Karko AI agent is running full workflow
  isPdfGenerating: boolean;
  agentWorkflowPhase: 'fit_analysis' | 'full_generation' | null;  // Current agent phase for panel messages

  // UI state
  activeTab: 'cv' | 'cover-letter' | 'email' | 'tracker' | 'jobs';
  error: string | null;

  // Cross-component autostart signal for Apply-with-Karko from the Job Feed.
  // Set by JobFeedPanel on click; ChatPanel picks it up and starts the agent
  // workflow immediately — even if the user does not navigate to the
  // Application Kit tab. Consumed-then-cleared by ChatPanel.
  pendingJobFeedAutostart: { sessionId: string; generationId?: string | null; generationAttempt?: number | null; mode?: 'apply' | 'analyze' } | null;

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
}

interface UIActions {
  // Loading state setters
  setIsAnalyzing: (value: boolean) => void;
  setIsGenerating: (value: boolean) => void;
  setIsAgentWorking: (value: boolean) => void;
  setIsPdfGenerating: (value: boolean) => void;
  setAgentWorkflowPhase: (phase: 'fit_analysis' | 'full_generation' | null) => void;

  // UI state setters
  setActiveTab: (tab: 'cv' | 'cover-letter' | 'email' | 'tracker' | 'jobs') => void;
  setError: (error: string | null) => void;

  // Autostart signal
  setPendingJobFeedAutostart: (value: { sessionId: string; generationId?: string | null; generationAttempt?: number | null; mode?: 'apply' | 'analyze' } | null) => void;

  // Panel action signal (fit analysis and screening CTAs dispatched outside ChatPanel)
  setPendingApplicationAction: (value: PendingApplicationAction | null) => void;

  // Focus signal for the job-description input (see jdFocusRequest)
  requestJdFocus: () => void;

  // Reset
  resetUI: () => void;
}

const initialState: UIState = {
  isAnalyzing: false,
  isGenerating: false,
  isAgentWorking: false,
  isPdfGenerating: false,
  agentWorkflowPhase: null,
  activeTab: 'cv',
  error: null,
  pendingJobFeedAutostart: null,
  pendingApplicationAction: null,
  jdFocusRequest: 0,
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
  setIsPdfGenerating: (value) => set({ isPdfGenerating: value }),
  setAgentWorkflowPhase: (phase) => set({ agentWorkflowPhase: phase }),

  // UI state setters
  setActiveTab: (tab) => set({ activeTab: tab }),
  setError: (error) => set({ error }),

  // Autostart signal
  setPendingJobFeedAutostart: (value) => set({ pendingJobFeedAutostart: value }),

  // Panel action signal
  setPendingApplicationAction: (value) => set({ pendingApplicationAction: value }),

  // Focus signal
  requestJdFocus: () => set((state) => ({ jdFocusRequest: state.jdFocusRequest + 1 })),

  // Reset
  resetUI: () => set(initialState),
}));
