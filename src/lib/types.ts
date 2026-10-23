import type { StructuredCoverLetter } from '@/lib/cover-letter/contract';

// ============================================
// DOCUMENT TYPES
// ============================================

export interface ParsedCV {
  rawText: string;
  sections: {
    contactInfo?: string;
    summary?: string;
    experience?: string;
    education?: string;
    skills?: string;
    other?: string;
  };
  fileName: string;
  fileType: 'pdf' | 'docx' | 'txt';
}

export interface MasterCV extends ParsedCV {
  allSkills: string[];
  allExperiences: string[];
  allEducation: string[];
}

// ============================================
// JOB ANALYSIS TYPES
// ============================================

export interface JobRequirements {
  title: string;
  company: string;
  hardSkills: string[];
  softSkills: string[];
  experienceLevel: string;
  keywords: string[];
  responsibilities: string[];
  niceToHave: string[];
  // Optional fields extracted from JD
  expectedSalary?: string | null;
  startDate?: string | null;
  location?: string | null;
  workType?: string | null;
  detectedLanguage?: string | null;
}

export interface GapAnalysis {
  matchingSkills: string[];
  missingSkills: string[];
  matchingExperience: string[];
  missingExperience: string[];
  matchScore: number; // 0-100
  suggestions: string[];
}

// ============================================
// GENERATION TYPES
// ============================================

export interface GeneratedCV {
  content: string;
  optimizedTagline?: string; // Optimized professional tagline for the job
  changes: CVChange[];
  optimizedFor: string; // job title
}

export interface CVChange {
  section: string;
  original: string;
  updated: string;
  reason: string;
}

export interface GeneratedCoverLetter {
  applicantAddress: {
    name: string;
    street: string;
    city: string;
    country: string;
    phone: string;
    email: string;
  };
  date: string;
  companyAddress: {
    companyName: string;
    department?: string;
    street?: string;
    city?: string;
  };
  salutation: string;
  body: string;
  closing: string;
  signatureName: string;
  /** ISO stamp of the last write. Rides in the session JSON, so no schema change. */
  updatedAt?: string;
  /**
   * The letter as the structured contract, written with `body` by the writer
   * agent. Dropped when the user edits the body, so the export renderer never
   * lays out paragraphs the user has changed; it then falls back to `body`.
   * Absent on letters written before the contract.
   */
  structured?: StructuredCoverLetter;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
  attachmentNote: string;
}
