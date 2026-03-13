/**
 * Store Barrel Export
 * 
 * Exports all store hooks and types for easy importing
 */

// Main unified store (backward compatibility)
export { useAppStore } from './useAppStore';

// Individual stores (recommended for new code)
export { useCVStore } from './useCVStore';
export { useSessionStore } from './useSessionStore';
export { useUIStore } from './useUIStore';

// Types
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
