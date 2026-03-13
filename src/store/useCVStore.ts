/**
 * CV Store - Document Management
 * 
 * Manages CV documents, certifications, and profile photos
 * Part of the split from useAppStore.ts for better organization
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ParsedCV, MasterCV } from '@/lib/types';
import type { StructuredCV } from '@/lib/types/cv-schema';

export interface PDFReference {
  id: string;
  fileName: string;
  size: number;
  type: 'original' | 'optimized';
  createdAt: string;
  url?: string;
}

export interface Certification {
  id: string;
  fileName: string;
  rawText: string;
  uploadedAt: string;
}

export interface ProfilePhoto {
  id: string;
  fileName: string;
  dataUrl: string; // Base64 encoded image
  uploadedAt: string;
}

interface CVState {
  // Legacy CV format
  currentCV: ParsedCV | null;
  masterCV: MasterCV | null;
  
  // New structured CV format (Solution B)
  structuredCV: StructuredCV | null;
  optimizedCV: StructuredCV | null;
  
  // Supporting documents
  certifications: Certification[];
  profilePhoto: ProfilePhoto | null;
  originalPdfRef: PDFReference | null;
}

interface CVActions {
  // CV actions
  setCurrentCV: (cv: ParsedCV | null) => void;
  setMasterCV: (cv: MasterCV | null) => void;
  setStructuredCV: (cv: StructuredCV | null) => void;
  setOptimizedCV: (cv: StructuredCV | null) => void;
  setOriginalPdfRef: (ref: PDFReference | null) => void;
  
  // Certification actions
  addCertification: (cert: Certification) => void;
  removeCertification: (id: string) => void;
  clearCertifications: () => void;
  
  // Profile photo actions
  setProfilePhoto: (photo: ProfilePhoto | null) => void;
  
  // Reset
  resetCVData: () => void;
}

const initialState: CVState = {
  currentCV: null,
  masterCV: null,
  structuredCV: null,
  optimizedCV: null,
  certifications: [],
  profilePhoto: null,
  originalPdfRef: null,
};

export const useCVStore = create<CVState & CVActions>()(
  persist(
    (set) => ({
      ...initialState,

      // CV actions
      setCurrentCV: (cv) => set({ currentCV: cv }),
      setMasterCV: (cv) => set({ masterCV: cv }),
      setStructuredCV: (cv) => set({ structuredCV: cv }),
      setOptimizedCV: (cv) => set({ optimizedCV: cv }),
      setOriginalPdfRef: (ref) => set({ originalPdfRef: ref }),

      // Certification actions
      addCertification: (cert) => set((state) => ({
        certifications: [...state.certifications, cert],
      })),

      removeCertification: (id) => set((state) => ({
        certifications: state.certifications.filter((c) => c.id !== id),
      })),

      clearCertifications: () => set({ certifications: [] }),

      // Profile photo actions
      setProfilePhoto: (photo) => set({ profilePhoto: photo }),

      // Reset
      resetCVData: () => set(initialState),
    }),
    {
      name: 'cv-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentCV: state.currentCV,
        masterCV: state.masterCV,
        structuredCV: state.structuredCV,
        optimizedCV: state.optimizedCV,
        certifications: state.certifications,
        originalPdfRef: state.originalPdfRef,
        // profilePhoto excluded — base64 dataUrl can be 6+ MB, exceeding
        // localStorage's ~5 MB quota. Photo reloads from Supabase on each session.
      }),
    }
  )
);
