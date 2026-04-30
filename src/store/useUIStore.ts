/**
 * UI Store - User Interface State
 * 
 * Manages UI-specific state (loading indicators, active tabs, errors)
 * This state is NOT persisted - resets on page reload
 * Part of the split from useAppStore.ts for better organization
 */

import { create } from 'zustand';

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

  // Cross-component action signal: CoverLetterPanel/EmailPanel dispatch
  // 'generate-full-application' or 'skip-job' after a fit analysis.
  // ChatPanel consumes and clears this.
  pendingApplicationAction: 'generate-full-application' | 'skip-job' | null;
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

  // Panel action signal (fit analysis CTAs dispatched from Cover Letter / Email panels)
  setPendingApplicationAction: (value: 'generate-full-application' | 'skip-job' | null) => void;

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

  // Reset
  resetUI: () => set(initialState),
}));
