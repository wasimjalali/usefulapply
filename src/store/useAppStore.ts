import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ParsedCV,
  MasterCV,
  JobRequirements,
  GapAnalysis,
  GeneratedCV,
  GeneratedCoverLetter,
  GeneratedEmail,
} from '@/lib/types';
import type { StructuredCV } from '@/lib/types/cv-schema';

export interface PDFReference {
  id: string;
  fileName: string;
  size: number;
  type: 'original' | 'optimized';
  createdAt: string;
  url?: string;
}

export interface CVEdit {
  id: string;
  section: string;
  field: string;
  originalValue: string;
  newValue: string;
  reason: string;
}

export interface Certification {
  id: string;
  fileName: string;
  rawText: string;
  uploadedAt: string;
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
    // NEW: Analysis for Changes tab
    analysis?: {
      summary: string;
      key_changes: string[];
      ats_compatibility: number;
      missing_keywords_added: string[];
      annotations: Array<{
        section_id: string;
        insight: string;
      }>;
    };
  };
  coverLetter: GeneratedCoverLetter | null;
  email: GeneratedEmail | null;
  companyResearch: CompanyResearch | null;
  
  cvEdits: CVEdit[];
  optimizedPdfRef?: PDFReference;
  
  chatMessages: ChatMessage[];
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
  icon?: 'cv' | 'cover-letter' | 'email' | 'new';
}

export interface ProfilePhoto {
  id: string;
  fileName: string;
  dataUrl: string; // Base64 encoded image
  uploadedAt: string;
}

export interface AppState {
  // Documents (persist across sessions)
  currentCV: ParsedCV | null;
  masterCV: MasterCV | null;
  certifications: Certification[];
  profilePhoto: ProfilePhoto | null;
  
  // Structured CV data (new schema)
  structuredCV: StructuredCV | null;
  optimizedCV: StructuredCV | null;
  originalPdfRef: PDFReference | null;
  
  // Current application session
  currentSession: ApplicationSession | null;
  
  // All saved sessions (history)
  sessions: ApplicationSession[];
  
  /**
   * @deprecated Legacy fields - use currentSession instead
   * These are kept for backward compatibility but should not be used directly.
   * All new code should read from currentSession.
   */
  jobDescription: string;
  /** @deprecated Use currentSession.requirements */
  requirements: JobRequirements | null;
  /** @deprecated Use currentSession.gaps */
  gaps: GapAnalysis | null;
  /** @deprecated Use currentSession.generatedCV */
  generatedCV: GeneratedCV | null;
  /** @deprecated Use currentSession.coverLetter */
  coverLetter: GeneratedCoverLetter | null;
  /** @deprecated Use currentSession.email */
  email: GeneratedEmail | null;
  
  // UI State (don't persist)
  isAnalyzing: boolean;
  isGenerating: boolean;
  isPdfGenerating: boolean;
  activeTab: 'cv' | 'cover-letter' | 'email';
  error: string | null;
}

interface AppActions {
  // Document actions
  setCurrentCV: (cv: ParsedCV | null) => void;
  setMasterCV: (cv: MasterCV | null) => void;
  addCertification: (cert: Certification) => void;
  removeCertification: (id: string) => void;
  clearCertifications: () => void;
  setProfilePhoto: (photo: ProfilePhoto | null) => void;
  
  // New CV schema actions
  setStructuredCV: (cv: StructuredCV | null) => void;
  setOptimizedCV: (cv: StructuredCV | null) => void;
  setOriginalPdfRef: (ref: PDFReference | null) => void;
  
  // Session actions
  createNewSession: (jobDescription: string) => void;
  updateCurrentSession: (updates: Partial<ApplicationSession>) => void;
  loadSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  clearCurrentSession: () => void;
  
  // Chat actions
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearChatMessages: () => void;
  
  /**
   * @deprecated Legacy setters - use updateCurrentSession instead
   * These sync to both legacy fields and currentSession for backward compatibility.
   */
  setJobDescription: (description: string) => void;
  /** @deprecated Use updateCurrentSession({ requirements }) */
  setRequirements: (requirements: JobRequirements | null) => void;
  /** @deprecated Use updateCurrentSession({ gaps }) */
  setGaps: (gaps: GapAnalysis | null) => void;
  /** @deprecated Use updateCurrentSession({ generatedCV }) */
  setGeneratedCV: (cv: GeneratedCV | null) => void;
  /** @deprecated Use updateCurrentSession({ coverLetter }) */
  setCoverLetter: (letter: GeneratedCoverLetter | null) => void;
  /** @deprecated Use updateCurrentSession({ email }) */
  setEmail: (email: GeneratedEmail | null) => void;
  
  // UI actions
  setIsAnalyzing: (value: boolean) => void;
  setIsGenerating: (value: boolean) => void;
  setIsPdfGenerating: (value: boolean) => void;
  setActiveTab: (tab: 'cv' | 'cover-letter' | 'email') => void;
  setError: (error: string | null) => void;
  
  // Reset
  resetAll: () => void;
  resetGenerated: () => void;
  
  // Supabase sync actions
  setSessions: (sessions: ApplicationSession[]) => void;
}

const initialState: AppState = {
  currentCV: null,
  masterCV: null,
  certifications: [],
  profilePhoto: null,
  structuredCV: null,
  optimizedCV: null,
  originalPdfRef: null,
  currentSession: null,
  sessions: [],
  jobDescription: '',
  requirements: null,
  gaps: null,
  generatedCV: null,
  coverLetter: null,
  email: null,
  isAnalyzing: false,
  isGenerating: false,
  isPdfGenerating: false,
  activeTab: 'cv',
  error: null,
};

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Document actions
      setCurrentCV: (cv) => set({ currentCV: cv }),
      setMasterCV: (cv) => set({ masterCV: cv }),
      
      addCertification: (cert) => set((state) => ({
        certifications: [...state.certifications, cert],
      })),
      
      removeCertification: (id) => set((state) => ({
        certifications: state.certifications.filter((c) => c.id !== id),
      })),
      
      clearCertifications: () => set({ certifications: [] }),
      
      setProfilePhoto: (photo) => set({ profilePhoto: photo }),
      
      // New CV schema actions
      setStructuredCV: (cv) => set({ structuredCV: cv }),
      setOptimizedCV: (cv) => set({ optimizedCV: cv }),
      setOriginalPdfRef: (ref) => set({ originalPdfRef: ref }),

      // Session actions
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
          companyResearch: null,
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

      // Legacy setters that also update session
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

      // UI actions (not persisted)
      setIsAnalyzing: (value) => set({ isAnalyzing: value }),
      setIsGenerating: (value) => set({ isGenerating: value }),
      setIsPdfGenerating: (value: boolean) => set({ isPdfGenerating: value }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setError: (error) => set({ error }),

      // Reset
      resetAll: () => set(initialState),
      resetGenerated: () => set({
        generatedCV: null,
        coverLetter: null,
        email: null,
        requirements: null,
        gaps: null,
      }),
      
      // Supabase sync actions
      setSessions: (sessions: ApplicationSession[]) => {
        console.log('[AppStore] setSessions called with', sessions.length, 'sessions');
        set({ sessions });
      },
    }),
    {
      name: 'job-copilot-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist these fields
        currentCV: state.currentCV,
        masterCV: state.masterCV,
        certifications: state.certifications,
        structuredCV: state.structuredCV,
        optimizedCV: state.optimizedCV,
        originalPdfRef: state.originalPdfRef,
        currentSession: state.currentSession,
        sessions: state.sessions,
        // Also persist current work
        jobDescription: state.jobDescription,
        requirements: state.requirements,
        gaps: state.gaps,
        generatedCV: state.generatedCV,
        coverLetter: state.coverLetter,
        email: state.email,
      }),
    }
  )
);
