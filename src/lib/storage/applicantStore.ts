/**
 * Applicant Store - Abstraction layer for document storage
 * Currently uses localStorage/IndexedDB, can be swapped to Supabase later
 */

export interface ApplicantDocuments {
  primaryCV?: string;
  masterCV?: string;
  certifications?: string[];
}

/**
 * Load applicant documents from local storage
 * This abstraction allows easy migration to Supabase later
 */
export async function loadApplicantDocuments(sessionId: string): Promise<ApplicantDocuments> {
  // For now, documents are passed directly from the UI
  // This function serves as a placeholder for future Supabase integration
  
  if (typeof window === 'undefined') {
    // Server-side: return empty (documents come from request)
    return {};
  }

  try {
    // Try to load from localStorage (where Zustand persists)
    const storedState = localStorage.getItem('job-copilot-storage');
    if (storedState) {
      const parsed = JSON.parse(storedState);
      const state = parsed?.state;
      
      return {
        primaryCV: state?.cvText || undefined,
        masterCV: state?.masterCVText || undefined,
        certifications: state?.certifications || [],
      };
    }
  } catch (error) {
    console.warn('[ApplicantStore] Failed to load from localStorage:', error);
  }

  return {};
}

/**
 * Save applicant documents to local storage
 */
export async function saveApplicantDocuments(
  sessionId: string, 
  documents: ApplicantDocuments
): Promise<void> {
  // Currently handled by Zustand store
  // This is a placeholder for future Supabase integration
  console.log('[ApplicantStore] Documents would be saved for session:', sessionId);
}

/**
 * Clear applicant documents
 */
export async function clearApplicantDocuments(sessionId: string): Promise<void> {
  // Currently handled by Zustand store
  console.log('[ApplicantStore] Documents would be cleared for session:', sessionId);
}
