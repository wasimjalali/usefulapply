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
  fileType: 'pdf' | 'docx';
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
}

export interface GeneratedEmail {
  subject: string;
  body: string;
  attachmentNote: string;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface AnalyzeRequest {
  jobDescription: string;
  currentCV: string;
  masterCV?: string;
}

export interface AnalyzeResponse {
  requirements: JobRequirements;
  gaps: GapAnalysis;
  success: boolean;
  error?: string;
}

export interface GenerateCVRequest {
  currentCV: string;
  masterCV?: string;
  requirements: JobRequirements;
  gaps: GapAnalysis;
}

export interface GenerateCVResponse {
  generatedCV: GeneratedCV;
  success: boolean;
  error?: string;
}

export interface GenerateCoverLetterRequest {
  cv: string;
  jobDescription: string;
  requirements: JobRequirements;
  userDetails: {
    name: string;
    address?: string;
    email: string;
    phone?: string;
  };
  companyDetails: {
    name: string;
    address?: string;
    hiringManager?: string;
  };
}

export interface GenerateCoverLetterResponse {
  coverLetter: GeneratedCoverLetter;
  success: boolean;
  error?: string;
}

export interface GenerateEmailRequest {
  cv: string;
  jobDescription: string;
  requirements: JobRequirements;
  userDetails: {
    name: string;
    email: string;
  };
  companyDetails: {
    name: string;
    hiringManager?: string;
  };
}

export interface GenerateEmailResponse {
  email: GeneratedEmail;
  success: boolean;
  error?: string;
}

export interface ParseDocumentRequest {
  file: File;
}

export interface ParseDocumentResponse {
  parsedCV: ParsedCV;
  success: boolean;
  error?: string;
}

// ============================================
// APP STATE TYPES
// ============================================

export interface AppState {
  // Documents
  currentCV: ParsedCV | null;
  masterCV: MasterCV | null;
  
  // Job
  jobDescription: string;
  requirements: JobRequirements | null;
  gaps: GapAnalysis | null;
  
  // Generated Content
  generatedCV: GeneratedCV | null;
  coverLetter: GeneratedCoverLetter | null;
  email: GeneratedEmail | null;
  
  // UI State
  isAnalyzing: boolean;
  isGenerating: boolean;
  activeTab: 'cv' | 'cover-letter' | 'email';
  error: string | null;
}

// ============================================
// LEGACY TYPES (for backward compatibility)
// ============================================

/** @deprecated Use ParsedCV instead */
export interface CVData {
  id?: string;
  fileName?: string;
  content: string;
  parsedData?: {
    name?: string;
    email?: string;
    phone?: string;
    summary?: string;
    experience?: ExperienceItem[];
    education?: EducationItem[];
    skills?: string[];
  };
}

export interface ExperienceItem {
  title: string;
  company: string;
  location?: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface EducationItem {
  degree: string;
  institution: string;
  location?: string;
  graduationDate: string;
}

/** @deprecated Use JobRequirements instead */
export interface JobDescription {
  id?: string;
  content: string;
  companyName?: string;
  positionTitle?: string;
  postedDate?: string;
}

/** @deprecated Use GapAnalysis instead */
export interface AnalysisResult {
  matchScore: number;
  keySkills: string[];
  matchingSkills: string[];
  missingSkills: string[];
  recommendations: string[];
  keywords: string[];
}

/** @deprecated Use GeneratedCV or GeneratedCoverLetter instead */
export interface GeneratedDocument {
  type: 'cv' | 'coverLetter' | 'email';
  content: string;
  generatedAt: Date;
}

/** @deprecated Use GeneratedCoverLetter instead */
export interface CoverLetter {
  content: string;
  date?: string;
  companyName?: string;
  companyAddress?: string;
  salutation?: string;
  body: string;
  closing?: string;
  name?: string;
}

/** @deprecated Use GeneratedEmail instead */
export interface ApplicationEmail {
  subject: string;
  body: string;
  recipient?: string;
}
