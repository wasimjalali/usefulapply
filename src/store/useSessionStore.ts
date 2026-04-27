/**
 * Session Store - Application Sessions & Chat
 * 
 * Manages job application sessions, chat messages, and session history
 * Part of the split from useAppStore.ts for better organization
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  JobRequirements,
  GapAnalysis,
  GeneratedCV,
  GeneratedCoverLetter,
  GeneratedEmail,
} from '@/lib/types';
import type { JobFeedGenerationStatus } from '@/lib/supabase/types';

export interface CVEdit {
  id: string;
  section: string;
  field: string;
  originalValue: string;
  newValue: string;
  reason: string;
}

export interface CompanyResearch {
  name: string;
  description: string;
  culture: string[];
  values: string[];
  techStack?: string[];
  recentNews?: string[];
  address?: string;
  contactPerson?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  actions?: ChatAction[];
}

export interface ChatAction {
  label: string;
  action: string;
  icon?: 'cv' | 'cover-letter' | 'email' | 'new' | 'screening';
}

export interface ApplicationSession {
  id: string;
  jobTitle: string;
  company: string;
  createdAt: string;
  updatedAt: string;
  jobDescription: string;
  
  matchScore?: number;
  matchingSkills: string[];
  missingSkills: string[];
  suggestions: string[];
  
  requirements: JobRequirements | null;
  gaps: GapAnalysis | null;
  generatedCV: GeneratedCV | null;
  
  // Solution B: Structured CV data from AI (no parsing needed)
  optimizedCVData?: {
    personal: {
      fullName: string;
      email: string;
      phone?: string;
      currentTitle?: string;
      address?: string;
      city?: string;
      country?: string;
      linkedIn?: string;
      website?: string;
      github?: string;
      driverLicense?: string;
    };
    summary?: string;
    experience: Array<{
      id: string;
      company: string;
      position: string;
      location?: string;
      startDate: string;
      endDate?: string;
      current?: boolean;
      bullets: string[];
    }>;
    education: Array<{
      id: string;
      institution: string;
      degree: string;
      field?: string;
      location?: string;
      startDate?: string;
      endDate?: string;
      grade?: string;
      highlights?: string[];
    }>;
    skills: Array<{
      category: string;
      items: string[];
    }>;
    languages: Array<{
      language: string;
      proficiency: string;
    }>;
    certifications: Array<{
      id: string;
      name: string;
      issuer: string;
      date?: string;
    }>;
    projects?: Array<{
      id: string;
      name: string;
      description: string;
      technologies?: string[];
      url?: string;
    }>;
    customSections?: Array<{
      id: string;
      title: string;
      items: string[];
    }>;
    analysis?: {
      summary: string;
      key_changes: string[];
      ats_compatibility: number;
      missing_keywords_added: string[];
    };
    sectionHeaders?: {
      summary?: string;
      skills?: string;
      experience?: string;
      education?: string;
      certifications?: string;
      languages?: string;
      contact?: string;
      additionalInfo?: string;
      projects?: string;
    };
    localizedStrings?: {
      present?: string;
      gradePrefix?: string;
      degreeConnector?: string;
      photoPlaceholder?: string;
      dateOfBirthLabel?: string;
      nationalityLabel?: string;
    };
    additionalInfo?: string[];
  };
  
  coverLetter: GeneratedCoverLetter | null;
  email: GeneratedEmail | null;
  followUpEmail: {
    subject: string;
    body: string;
    recommendedDelay: number;
  } | null;
  fitAssessment?: string | null;
  generationStatus?: JobFeedGenerationStatus;
  generationError?: string | null;
  generationStartedAt?: string | null;
  generationCompletedAt?: string | null;
  generationFailedAt?: string | null;
  generationCancelledAt?: string | null;
  jobFeedGenerationId?: string | null;
  jobFeedGenerationAttempt?: number | null;
  companyResearch: CompanyResearch | null;
  
  /** Persisted fit analysis state — survives session switches, expires after 30 min */
  pendingFitAnalysis?: {
    contextId: string;
    jobDescription: string;
    contextData: {
      applicant: Record<string, unknown>;
      job: Record<string, unknown>;
      match: Record<string, unknown>;
      verifiedMetrics?: string[];
      detectedLanguage?: string;
      fitAnalysis?: Record<string, unknown>;
    };
    createdAt: string;
  } | null;

  /** Number of times the user has used screening question mode (max 2) */
  screeningUsageCount: number;

  cvEdits: CVEdit[];
  optimizedPdfRef?: {
    id: string;
    fileName: string;
    size: number;
    type: 'original' | 'optimized';
    createdAt: string;
    url?: string;
  };
  
  chatMessages: ChatMessage[];
}

interface SessionState {
  // Current active session
  currentSession: ApplicationSession | null;
  
  // All saved sessions (history)
  sessions: ApplicationSession[];
  
  /**
   * @deprecated Legacy fields - use currentSession instead
   * Kept for backward compatibility
   */
  jobDescription: string;
  requirements: JobRequirements | null;
  gaps: GapAnalysis | null;
  generatedCV: GeneratedCV | null;
  coverLetter: GeneratedCoverLetter | null;
  email: GeneratedEmail | null;
}

interface SessionActions {
  // Session management
  createNewSession: (jobDescription: string) => void;
  updateCurrentSession: (updates: Partial<ApplicationSession>) => void;
  loadSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  clearCurrentSession: () => void;
  setSessions: (sessions: ApplicationSession[]) => void;
  
  // Chat actions
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearChatMessages: () => void;
  
  /**
   * @deprecated Legacy setters - use updateCurrentSession instead
   */
  setJobDescription: (description: string) => void;
  setRequirements: (requirements: JobRequirements | null) => void;
  setGaps: (gaps: GapAnalysis | null) => void;
  setGeneratedCV: (cv: GeneratedCV | null) => void;
  setCoverLetter: (letter: GeneratedCoverLetter | null) => void;
  setEmail: (email: GeneratedEmail | null) => void;
  
  // Reset
  resetGenerated: () => void;
}

const initialState: SessionState = {
  currentSession: null,
  sessions: [],
  jobDescription: '',
  requirements: null,
  gaps: null,
  generatedCV: null,
  coverLetter: null,
  email: null,
};

export const useSessionStore = create<SessionState & SessionActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Session management
      createNewSession: (jobDescription) => {
        const newSession: ApplicationSession = {
          id: `session-${Date.now()}`,
          jobTitle: '',
          company: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          jobDescription,
          matchingSkills: [],
          missingSkills: [],
          suggestions: [],
          requirements: null,
          gaps: null,
          generatedCV: null,
          coverLetter: null,
          email: null,
          followUpEmail: null,
          companyResearch: null,
          screeningUsageCount: 0,
          cvEdits: [],
          chatMessages: [],
        };
        
        set((state) => ({
          currentSession: newSession,
          sessions: [newSession, ...state.sessions],
          jobDescription,
        }));
      },

      updateCurrentSession: (updates) => set((state) => {
        if (!state.currentSession) return state;
        
        const updatedSession = {
          ...state.currentSession,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        
        return {
          currentSession: updatedSession,
          sessions: state.sessions.map((s) =>
            s.id === updatedSession.id ? updatedSession : s
          ),
        };
      }),

      loadSession: (sessionId) => set((state) => {
        const session = state.sessions.find((s) => s.id === sessionId);
        if (session) {
          return {
            currentSession: session,
            jobDescription: session.jobDescription,
            requirements: session.requirements,
            gaps: session.gaps,
            generatedCV: session.generatedCV,
            coverLetter: session.coverLetter,
            email: session.email,
          };
        }
        return { currentSession: null };
      }),

      deleteSession: (sessionId) => set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== sessionId),
        currentSession: state.currentSession?.id === sessionId ? null : state.currentSession,
      })),

      clearCurrentSession: () => set({ currentSession: null }),

      setSessions: (sessions: ApplicationSession[]) => {
        // Deduplicate by session ID — keep the latest version (last occurrence wins)
        const seen = new Map<string, ApplicationSession>();
        for (const s of sessions) {
          seen.set(s.id, s);
        }
        const deduped = Array.from(seen.values());
        if (deduped.length !== sessions.length) {
          console.warn('[SessionStore] setSessions deduped:', sessions.length, '->', deduped.length);
        }
        console.log('[SessionStore] setSessions called with', deduped.length, 'sessions');
        set({ sessions: deduped });
      },

      // Chat actions
      addChatMessage: (message) => set((state) => {
        if (!state.currentSession) return state;
        
        const newMessage: ChatMessage = {
          ...message,
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
        };
        
        const updatedSession = {
          ...state.currentSession,
          chatMessages: [...state.currentSession.chatMessages, newMessage],
          updatedAt: new Date().toISOString(),
        };
        
        return {
          currentSession: updatedSession,
          sessions: state.sessions.map((s) =>
            s.id === updatedSession.id ? updatedSession : s
          ),
        };
      }),

      clearChatMessages: () => set((state) => {
        if (!state.currentSession) return state;
        
        const updatedSession = {
          ...state.currentSession,
          chatMessages: [],
          updatedAt: new Date().toISOString(),
        };
        
        return {
          currentSession: updatedSession,
          sessions: state.sessions.map((s) =>
            s.id === updatedSession.id ? updatedSession : s
          ),
        };
      }),

      // Legacy setters
      setJobDescription: (description) => {
        set({ jobDescription: description });
        const { currentSession, updateCurrentSession } = get();
        if (currentSession) {
          updateCurrentSession({ jobDescription: description });
        }
      },
      
      setRequirements: (requirements) => {
        set({ requirements });
        const { currentSession, updateCurrentSession } = get();
        if (currentSession) {
          updateCurrentSession({ 
            requirements,
            jobTitle: requirements?.title || '',
            company: requirements?.company || '',
          });
        }
      },
      
      setGaps: (gaps) => {
        set({ gaps });
        const { currentSession, updateCurrentSession } = get();
        if (currentSession) {
          updateCurrentSession({ gaps });
        }
      },
      
      setGeneratedCV: (generatedCV) => {
        set({ generatedCV });
        const { currentSession, updateCurrentSession } = get();
        if (currentSession) {
          updateCurrentSession({ generatedCV });
        }
      },
      
      setCoverLetter: (coverLetter) => {
        set({ coverLetter });
        const { currentSession, updateCurrentSession } = get();
        if (currentSession) {
          updateCurrentSession({ coverLetter });
        }
      },
      
      setEmail: (email) => {
        set({ email });
        const { currentSession, updateCurrentSession } = get();
        if (currentSession) {
          updateCurrentSession({ email });
        }
      },

      // Reset
      resetGenerated: () => set({
        generatedCV: null,
        coverLetter: null,
        email: null,
        requirements: null,
        gaps: null,
      }),
    }),
    {
      name: 'session-store',
      storage: createJSONStorage(() => localStorage),
      // CRITICAL: Only persist currentSession — NOT the full sessions array or legacy fields.
      // The sessions array (238+ sessions with full CV/CL/email data) would exceed
      // localStorage's ~5-10MB limit, causing silent corruption and session mixing
      // on cross-browser login. Sessions are loaded from Supabase via useSupabaseSync.
      //
      // Legacy fields (jobDescription, requirements, gaps, etc.) are NOT persisted
      // because they can become stale and leak data from one session into another
      // after a browser restart. They are repopulated from currentSession on load.
      partialize: (state) => ({
        currentSession: state.currentSession,
      }),
    }
  )
);
