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

  // Reset
  resetUI: () => set(initialState),
}));
