/**
 * Unified App Store - Backward Compatibility Layer
 * 
 * This file combines the three specialized stores (CV, Session, UI) into a single
 * unified interface for backward compatibility with existing code.
 * 
 * New code should import specific stores:
 * - import { useCVStore } from '@/store/useCVStore'
 * - import { useSessionStore } from '@/store/useSessionStore'
 * - import { useUIStore } from '@/store/useUIStore'
 * 
 * This unified store is maintained for backward compatibility with existing imports.
 */

import { useCVStore } from './useCVStore';
import { useSessionStore } from './useSessionStore';
import { useUIStore } from './useUIStore';

// Re-export types for backward compatibility
export type {
  PDFReference,
  Certification,
  ProfilePhoto,
} from './useCVStore';

export type {
  ApplicationSession,
  ChatMessage,
  ChatAction,
  CVEdit,
  CompanyResearch,
} from './useSessionStore';

/**
 * Unified App Store Hook
 * 
 * Combines all three stores into a single interface.
 * This maintains backward compatibility with existing code that uses useAppStore.
 * 
 * @example
 * ```typescript
 * const { currentCV, setCurrentCV, isAnalyzing, setIsAnalyzing } = useAppStore();
 * ```
 */
export const useAppStore = () => {
  const cvStore = useCVStore();
  const sessionStore = useSessionStore();
  const uiStore = useUIStore();

  return {
    // CV Store
    ...cvStore,
    
    // Session Store
    ...sessionStore,
    
    // UI Store
    ...uiStore,
    
    // Combined reset function
    resetAll: () => {
      cvStore.resetCVData();
      sessionStore.resetGenerated();
      uiStore.resetUI();
    },
  };
};

/**
 * Static getState() for accessing store state outside of React components.
 * Combines all three stores into a single state object.
 */
useAppStore.getState = () => ({
  ...useCVStore.getState(),
  ...useSessionStore.getState(),
  ...useUIStore.getState(),
  resetAll: () => {
    useCVStore.getState().resetCVData();
    useSessionStore.getState().resetGenerated();
    useUIStore.getState().resetUI();
  },
});

// Re-export individual stores for direct access
export { useCVStore } from './useCVStore';
export { useSessionStore } from './useSessionStore';
export { useUIStore } from './useUIStore';
