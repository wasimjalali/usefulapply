/**
 * CV Template System Types
 * Supports US/Canada (no photo) and EU/Germany (with photo) standards
 * Updated January 2026 based on industry research
 */

export type CVRegion = 'US' | 'EU';

// CEFR Language Proficiency Levels (Mandatory for EU CVs per 2026 standards)
// ⚠️ NOTE: A1 & A2 should be OMITTED from professional resumes - too limited for business context
export const CEFR_LEVELS = {
  A1: { code: 'A1', name: 'Beginner', description: 'Basic user (beginner)', includeOnResume: false },
  A2: { code: 'A2', name: 'Elementary', description: 'Basic user (elementary)', includeOnResume: false },
  B1: { code: 'B1', name: 'Intermediate', description: 'Independent user (intermediate)', includeOnResume: true },
  B2: { code: 'B2', name: 'Upper Intermediate', description: 'Independent user (upper intermediate)', includeOnResume: true },
  C1: { code: 'C1', name: 'Advanced', description: 'Proficient user (advanced)', includeOnResume: true },
  C2: { code: 'C2', name: 'Mastery', description: 'Proficient user (mastery/native)', includeOnResume: true },
  NATIVE: { code: 'Native', name: 'Native Speaker', description: 'Native speaker', includeOnResume: true },
} as const;

// Professional CEFR levels only (B1+) - exclude A1/A2 as too basic for business context
export const PROFESSIONAL_CEFR_LEVELS = ['B1', 'B2', 'C1', 'C2', 'NATIVE'] as const;
export type ProfessionalCEFRLevel = typeof PROFESSIONAL_CEFR_LEVELS[number];

export type CEFRLevel = keyof typeof CEFR_LEVELS;

// CEFR to descriptive proficiency mapping (for US/Canada format)
export const CEFR_TO_DESCRIPTIVE: Record<string, string> = {
  B1: 'Intermediate',
  B2: 'Upper Intermediate / Professional',
  C1: 'Advanced / Fluent',
  C2: 'Proficient / Native-level',
  Native: 'Native Speaker',
};

// German language proficiency terms
export const GERMAN_PROFICIENCY_LABELS: Record<string, string> = {
  A1: 'Grundkenntnisse', // Don't list - too basic
  A2: 'Grundkenntnisse', // Don't list - too basic
  B1: 'Gute Kenntnisse',
  B2: 'Fließend',
  C1: 'Fließend',
  C2: 'Verhandlungssicher',
  Native: 'Muttersprache',
};

// ============================================
// CV SECTION LIMITS & VALIDATION (2026 Standards)
// Based on industry research for US/Canada, Germany, and EU markets
// ============================================

export type ExperienceLevel = 'entry' | 'mid' | 'senior';
export type TargetRegion = 'US' | 'Germany' | 'EU';

// 1. PROFESSIONAL TAGLINE / HEADLINE LIMITS
export const TAGLINE_LIMITS = {
  US: { min: 120, max: 220, optimal: { min: 150, max: 180 }, words: { min: 10, max: 18 } },
  Germany: { min: 100, max: 180, optimal: { min: 120, max: 160 }, words: { min: 8, max: 15 } },
  EU: { min: 110, max: 200, optimal: { min: 140, max: 180 }, words: { min: 9, max: 16 } },
} as const;

// 2. PROFESSIONAL SUMMARY LIMITS
export const SUMMARY_LIMITS = {
  US: { 
    min: 400, max: 800, optimal: { min: 500, max: 700 }, 
    words: { min: 60, max: 120 }, sentences: { min: 3, max: 5 } 
  },
  Germany: { 
    min: 300, max: 650, optimal: { min: 400, max: 550 }, 
    words: { min: 45, max: 100 }, sentences: { min: 3, max: 4 } 
  },
  EU: { 
    min: 350, max: 750, optimal: { min: 450, max: 650 }, 
    words: { min: 50, max: 110 }, sentences: { min: 3, max: 4 } 
  },
} as const;

// 3. SKILLS SECTION LIMITS (Languages is separate 6th category)
export const SKILLS_LIMITS = {
  US: { totalSkills: { min: 15, max: 25 }, categories: { min: 3, max: 5 }, perCategory: { min: 3, max: 5 }, totalChars: { min: 300, max: 500 } },
  Germany: { totalSkills: { min: 10, max: 15 }, categories: { min: 3, max: 5 }, perCategory: { min: 2, max: 5 }, totalChars: { min: 250, max: 400 } },
  EU: { totalSkills: { min: 10, max: 18 }, categories: { min: 3, max: 5 }, perCategory: { min: 3, max: 5 }, totalChars: { min: 280, max: 480 } },
} as const;

// 4. EXPERIENCE BULLET POINT LIMITS
export const EXPERIENCE_BULLET_LIMITS = {
  entry: { chars: { min: 80, max: 140 }, words: { min: 12, max: 20 } },
  mid: { chars: { min: 75, max: 160 }, words: { min: 11, max: 22 } },
  senior: { chars: { min: 80, max: 180 }, words: { min: 12, max: 25 } },
  Germany: { chars: { min: 70, max: 150 }, words: { min: 10, max: 20 } },
} as const;

// 2026 Standard: Strict role and bullet limits to ensure 2-page CV
export const EXPERIENCE_ROLE_LIMITS = {
  maxRoles: 4,           // Maximum 3-4 roles total
  minRoles: 2,           // At least 2 roles for credibility
  maxTotalBullets: 15,   // NEVER exceed 15 bullets across entire CV
  roleAgeLimit: 10,      // Drop roles older than 10 years
} as const;

// Experience bullets per role (2026 Standard: 4-3-3 pattern)
export const EXPERIENCE_BULLETS_PER_ROLE = {
  mostRecentRole: { min: 3, max: 4 },    // Most recent: exactly 4 bullets
  secondRole: { min: 3, max: 4 },        // Second role: 3-4 bullets
  olderRoles: { min: 2, max: 3 },        // 3rd/4th roles: exactly 3 bullets
  Germany: { mostRecent: 4, older: 3 },  // Germany: 4 + 3 pattern
} as const;

// 5. EDUCATION SECTION LIMITS
export const EDUCATION_LIMITS = {
  US: { degreesToList: 2, charsPerDegree: { min: 150, max: 250 }, wordsPerDegree: { min: 20, max: 35 }, totalChars: { min: 300, max: 500 } },
  Germany: { degreesToList: 2, charsPerDegree: { min: 120, max: 220 }, wordsPerDegree: { min: 15, max: 30 }, totalChars: { min: 250, max: 450 } },
  EU: { degreesToList: 2, charsPerDegree: { min: 140, max: 240 }, wordsPerDegree: { min: 18, max: 32 }, totalChars: { min: 300, max: 500 } },
} as const;

// 6. CERTIFICATIONS SECTION LIMITS
export const CERTIFICATIONS_LIMITS = {
  US: { count: { min: 3, max: 6 }, charsPerCert: { min: 80, max: 150 }, totalChars: { min: 400, max: 700 } },
  Germany: { count: { min: 3, max: 5 }, charsPerCert: { min: 70, max: 130 }, totalChars: { min: 300, max: 550 } },
  EU: { count: { min: 3, max: 6 }, charsPerCert: { min: 80, max: 150 }, totalChars: { min: 350, max: 650 } },
} as const;

// 7. LANGUAGES SECTION LIMITS
export const LANGUAGES_LIMITS = {
  US: { count: { min: 2, max: 4 }, charsPerLang: { min: 40, max: 80 }, totalChars: { min: 150, max: 300 }, format: 'descriptive' },
  Germany: { count: { min: 2, max: 5 }, charsPerLang: { min: 45, max: 90 }, totalChars: { min: 180, max: 350 }, format: 'CEFR' },
  EU: { count: { min: 2, max: 5 }, charsPerLang: { min: 45, max: 90 }, totalChars: { min: 180, max: 350 }, format: 'CEFR' },
} as const;

// Validation functions, text analysis, and ATS checks have been extracted to:
// - src/lib/cv-templates/validation.ts
// - src/lib/cv-templates/text-analysis.ts

// ============================================
// PAGE CHARACTER BUDGETS (2026 Standards)
// Total resume character counts by experience level
// ============================================

export const PAGE_CHARACTER_BUDGETS = {
  // Page 1 Section Allocations
  page1: {
    entry: {
      nameContact: { min: 80, max: 100 },
      headline: { min: 150, max: 180 },
      summary: { min: 400, max: 600 },
      skills: { min: 300, max: 400 },
      experienceRecent: { min: 600, max: 900 },
      subtotal: { min: 1600, max: 2300 },
    },
    mid: {
      nameContact: { min: 80, max: 100 },
      headline: { min: 150, max: 180 },
      summary: { min: 500, max: 700 },
      skills: { min: 350, max: 450 },
      experienceRecent: { min: 1200, max: 1600 },
      subtotal: { min: 2400, max: 3200 },
    },
    senior: {
      nameContact: { min: 80, max: 100 },
      headline: { min: 150, max: 180 },
      summary: { min: 600, max: 800 },
      skills: { min: 300, max: 400 },
      experienceRecent: { min: 1500, max: 2000 },
      subtotal: { min: 2800, max: 3700 },
    },
  },
  // Page 2 Section Allocations
  page2: {
    entry: {
      experienceOlder: { min: 400, max: 600 },
      education: { min: 300, max: 400 },
      certifications: { min: 150, max: 250 },
      languages: { min: 100, max: 200 },
      subtotal: { min: 950, max: 1450 },
    },
    mid: {
      experienceOlder: { min: 1200, max: 1800 },
      education: { min: 300, max: 400 },
      certifications: { min: 300, max: 400 },
      languages: { min: 150, max: 250 },
      subtotal: { min: 1950, max: 2850 },
    },
    senior: {
      experienceOlder: { min: 2000, max: 3000 },
      education: { min: 250, max: 350 },
      certifications: { min: 300, max: 400 },
      languages: { min: 150, max: 250 },
      subtotal: { min: 2700, max: 4000 },
    },
  },
  // Total Resume Character Counts
  totals: {
    entry: { page1: { min: 1600, max: 2300 }, page2: { min: 950, max: 1450 }, total: { min: 2550, max: 3750 }, words: { min: 300, max: 450 } },
    midOnePage: { page1: { min: 2400, max: 3200 }, total: { min: 2400, max: 3200 }, words: { min: 350, max: 450 } },
    midTwoPage: { page1: { min: 2400, max: 3200 }, page2: { min: 1950, max: 2850 }, total: { min: 4350, max: 6050 }, words: { min: 500, max: 750 } },
    senior: { page1: { min: 2800, max: 3700 }, page2: { min: 2700, max: 4000 }, total: { min: 5500, max: 7700 }, words: { min: 700, max: 950 } },
    germany: { page1: { min: 2200, max: 3000 }, page2: { min: 1800, max: 2600 }, total: { min: 4000, max: 5600 }, words: { min: 450, max: 650 } },
  },
} as const;

// ============================================
// REGION-SPECIFIC COMPLIANCE CHECKLISTS
// ============================================

export const COMPLIANCE_CHECKLIST = {
  US: {
    required: ['email', 'phone', 'city'],
    optional: ['linkedIn', 'github', 'portfolio'],
    forbidden: ['photo', 'dateOfBirth', 'maritalStatus', 'citizenship', 'streetAddress'],
    formatting: {
      headline: '120-220 characters',
      summary: '60-120 words (entry), 70-110 (mid), 80-120 (senior)',
      skills: '12-20 total, 3-5 categories',
      experienceBullets: '3-7 bullets per role',
      education: "Bachelor's + (optional master's)",
      languages: 'Descriptive OR CEFR (both acceptable)',
      fileFormat: 'DOCX (for ATS), PDF (for email)',
      pageLength: '1 page (entry-level) OR 2 pages (mid+)',
      atsCompatibility: 'No tables, columns, text boxes',
    },
  },
  Germany: {
    required: ['email', 'phone', 'fullAddress', 'signature'],
    optional: ['photo', 'dateOfBirth', 'nationality'],
    recommended: ['photo'], // 53% expect it
    formatting: {
      headline: '100-180 characters',
      summary: '45-100 words, 3-4 sentences',
      skills: '10-15 total, 3-4 categories',
      experienceBullets: 'max 5 per role',
      languages: 'CEFR scale ONLY (A1-C2)',
      dateFormat: 'DD.MM.YYYY or MM/YYYY',
      fileFormat: 'DOCX or PDF (text-based)',
      pageLength: '2 pages max (1-2 pages standard)',
      fonts: 'Arial, Helvetica, Calibri (11-12pt)',
      margins: '2cm all sides (A4 size mandatory)',
      lineSpacing: '1.0 text, 1.15 between sections',
      signature: 'Required at bottom with city and date',
    },
    sectionNames: {
      personalData: 'Persönliche Daten',
      workExperience: 'Berufserfahrung',
      education: 'Ausbildung',
      skills: 'Kenntnisse / Fähigkeiten',
      languages: 'Sprachkenntnisse',
      certifications: 'Weiterbildungen',
    },
  },
  EU: {
    required: ['email', 'phone', 'city'],
    optional: ['photo', 'dateOfBirth', 'fullAddress'],
    photoByCountry: {
      common: ['Germany', 'France', 'Spain'],
      avoided: ['UK', 'Netherlands', 'Ireland'],
    },
    formatting: {
      headline: '110-200 characters',
      summary: '50-110 words, 3-4 sentences',
      skills: '10-18 total, 3-4 categories',
      languages: 'CEFR scale (A1-C2) recommended',
      dateFormat: 'DD/MM/YYYY or DD.MM.YYYY',
      fileFormat: 'DOCX or PDF',
      pageLength: '2 pages standard',
      fonts: 'Arial, Calibri, Times New Roman (11-12pt)',
      margins: '2cm all sides (A4 size)',
      atsCompatibility: 'No tables, columns (same as US/Canada)',
    },
  },
} as const;


// ============================================
// TEMPLATE CHARACTER/SECTION MAPPING (Part 7)
// ============================================

// Template specifications for validation - Consolidated to 3 templates
export const TEMPLATE_SPECIFICATIONS = {
  'premium-ats': {
    name: 'Premium ATS',
    headline: { min: 120, max: 220 },
    summary: { min: 500, max: 700 },
    skills: { min: 300, max: 450 },
    expBullets: { min: 4, max: 8 },
    pageCount: '1-2',
    atsScore: '100%',
  },
  'modern-professional': {
    name: 'Modern Professional',
    headline: { min: 150, max: 180 },
    summary: { min: 500, max: 700 },
    skills: { min: 350, max: 450 },
    expBullets: { min: 4, max: 6 },
    pageCount: '1-2',
    atsScore: '95%',
  },
  'executive': {
    name: 'Executive',
    headline: { min: 150, max: 180 },
    summary: { min: 600, max: 800 },
    skills: { min: 300, max: 400 },
    expBullets: { min: 5, max: 8 },
    pageCount: '2+',
    atsScore: '90%',
  },
} as const;

export type CVTemplateStyle = 'classic' | 'modern-ats' | 'professional';

export interface CVTemplate {
  id: string;
  name: string;
  description: string;
  region: CVRegion;
  style: CVTemplateStyle;
  includesPhoto: boolean;
  pageSize: 'letter' | 'a4';
  
  // Styling configuration
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    textLight: string;
    background: string;
    headerBg: string;
  };
  
  // Font configuration
  fonts: {
    heading: string;
    body: string;
  };
  
  // Section order (can be customized per template)
  sectionOrder: CVSection[];
}

export type CVSection = 
  | 'header'
  | 'photo'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'languages'
  | 'certifications'
  | 'projects'
  | 'references';

// Parsed/structured CV data for rendering
export interface CVData {
  personal: {
    fullName: string;
    email: string;
    phone: string;
    currentTitle?: string; // Job title/tagline (e.g., "Senior Software Engineer") - Resume Headline
    targetJobTitle?: string; // Target job title from job posting (for ATS keyword matching)
    address?: string;
    city?: string;
    country?: string;
    linkedIn?: string; // LinkedIn URL (MANDATORY 2026 per research)
    website?: string; // Personal website
    portfolio?: string; // Portfolio URL (separate from website - for creative/tech roles)
    github?: string; // GitHub URL (expected for developers)
    photoUrl?: string;
    dateOfBirth?: string; // Optional for Germany, declining trend
    nationality?: string;
  };
  
  // Signature for German CVs (REQUIRED per 2026 research)
  signature?: {
    city: string; // e.g., "Berlin"
    date: string; // e.g., "31.01.2026" (DD.MM.YYYY format)
    signatureImageUrl?: string; // Optional digital signature image
    includeSignature: boolean; // Toggle for German CV compliance
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
    proficiency: string; // CEFR level (A1-C2) or 'Native' - MANDATORY for EU per 2026 standards
    cefrLevel?: CEFRLevel; // Typed CEFR level for validation
    certification?: string; // e.g., "TOEFL 110", "Goethe B2"
  }>;
  
  certifications: Array<{
    id: string;
    name: string;
    issuer: string;
    date?: string;
    credentialId?: string;
  }>;
  
  projects?: Array<{
    id: string;
    name: string;
    description: string;
    technologies?: string[];
    url?: string;
  }>;
  
  // AI-generated section headers in the detected language (i18n support)
  sectionHeaders?: {
    summary?: string;        // e.g., "Profil Professionnel"
    skills?: string;         // e.g., "Compétences Clés"
    experience?: string;     // e.g., "Expérience Professionnelle"
    education?: string;      // e.g., "Formation"
    certifications?: string; // e.g., "Certifications"
    languages?: string;      // e.g., "Langues"
    contact?: string;        // e.g., "Contact"
    additionalInfo?: string; // e.g., "Informations Complémentaires"
  };

  // Localized UI strings for template rendering
  localizedStrings?: {
    present?: string;        // "Present" / "Heute" / "Présent"
    gradePrefix?: string;    // "GPA:" / "Note:" / "Mention:"
    degreeConnector?: string; // "in" / "en" / "in"
    photoPlaceholder?: string; // "Photo" / "Foto"
  };

  // Additional information (work authorization, driver's license, etc.)
  additionalInfo?: string[];
}

// Template definitions - Consolidated Premium Templates (January 2026)
// Focused on English/Global markets with ATS optimization
export const CV_TEMPLATE_DEFINITIONS: CVTemplate[] = [
  // ============================================
  // PREMIUM TEMPLATES (3 Options - English/Global)
  // ============================================
  
  // 1. Premium ATS - Best for most applications (DEFAULT)
  {
    id: 'premium-ats',
    name: '⭐ Premium ATS',
    description: 'AI-optimized, maximum ATS compatibility. Best for corporate portals and online applications.',
    region: 'US',
    style: 'modern-ats',
    includesPhoto: false,
    pageSize: 'letter',
    colors: {
      primary: '#1a365d',      // Navy - trust, reliability
      secondary: '#2d3748',    // Dark gray
      accent: '#2b6cb0',       // Professional blue
      text: '#1a202c',         // Charcoal (4.5:1 contrast)
      textLight: '#4a5568',    // Medium gray
      background: '#ffffff',
      headerBg: '#f7fafc',     // Subtle header
    },
    fonts: {
      heading: 'Inter, Calibri, Arial, sans-serif',  // Modern + ATS-safe
      body: 'Inter, Calibri, Arial, sans-serif',
    },
    sectionOrder: ['header', 'summary', 'skills', 'experience', 'education', 'certifications', 'languages'],
  },
  
  // 2. Modern Professional - Tech/Startups
  {
    id: 'modern-professional',
    name: 'Modern Professional',
    description: 'Clean, contemporary design for tech and startups. Subtle accents, skills-focused.',
    region: 'US',
    style: 'modern-ats',
    includesPhoto: false,
    pageSize: 'letter',
    colors: {
      primary: '#0f172a',      // Slate
      secondary: '#334155',    // Gray
      accent: '#0ea5e9',       // Sky blue (tech modern)
      text: '#0f172a',
      textLight: '#64748b',
      background: '#ffffff',
      headerBg: '#f8fafc',     // Very light gray
    },
    fonts: {
      heading: 'Helvetica, Arial, sans-serif',  // 10/10 ATS score
      body: 'Arial, Helvetica, sans-serif',
    },
    sectionOrder: ['header', 'summary', 'skills', 'experience', 'projects', 'education', 'certifications'],
  },
  
  // 3. Executive - C-Suite/Directors/Senior Roles
  {
    id: 'executive',
    name: 'Executive',
    description: 'Elegant design for senior leaders. Achievement-focused, 2-page format supported.',
    region: 'US',
    style: 'professional',
    includesPhoto: false,
    pageSize: 'letter',
    colors: {
      primary: '#1a365d',      // Navy executive
      secondary: '#2d3748',    // Dark gray
      accent: '#d97706',       // Gold (prestige)
      text: '#1f2937',
      textLight: '#4b5563',
      background: '#ffffff',
      headerBg: '#1a365d',     // Dark header for executive presence
    },
    fonts: {
      heading: 'Georgia, Cambria, serif',      // 9/10 ATS, executive feel
      body: 'Calibri, Arial, sans-serif',
    },
    sectionOrder: ['header', 'summary', 'experience', 'skills', 'education', 'certifications', 'languages'],
  },
  
  // 4. German ATS - For German job market (with photo support)
  {
    id: 'german-ats',
    name: '🇩🇪 Deutsch (mit Foto)',
    description: 'German CV format with photo placeholder. CEFR language levels, German section headers.',
    region: 'EU',
    style: 'classic',
    includesPhoto: true,
    pageSize: 'a4',
    colors: {
      primary: '#1a365d',      // Navy - professional
      secondary: '#2d3748',    // Dark gray
      accent: '#2b6cb0',       // Professional blue
      text: '#1a202c',         // Charcoal
      textLight: '#4a5568',    // Medium gray
      background: '#ffffff',
      headerBg: '#f7fafc',     // Light header
    },
    fonts: {
      heading: 'Arial, Helvetica, sans-serif',  // German standard
      body: 'Arial, Helvetica, sans-serif',
    },
    sectionOrder: ['header', 'photo', 'summary', 'experience', 'education', 'skills', 'languages', 'certifications'],
  },
  
  // 5. German Classic - Single-column with photo (better ATS than two-column)
  {
    id: 'german-classic',
    name: '🇩🇪 Deutsch Klassisch',
    description: 'Single-column German CV with photo. Maximum ATS compatibility, clean charcoal design.',
    region: 'EU',
    style: 'classic',
    includesPhoto: true,
    pageSize: 'a4',
    colors: {
      primary: '#374151',      // Charcoal/Anthracite - neutral, professional
      secondary: '#4B5563',    // Medium grey
      accent: '#374151',       // Charcoal
      text: '#1A1A1A',         // Near-black
      textLight: '#4B5563',    // Medium grey
      background: '#ffffff',
      headerBg: '#F9FAFB',     // Very light grey
    },
    fonts: {
      heading: 'Georgia, Times New Roman, serif',
      body: 'Arial, Helvetica, sans-serif',
    },
    sectionOrder: ['header', 'photo', 'summary', 'skills', 'experience', 'education', 'certifications', 'languages'],
  },
  
  // 6. Classic Green - English market, distinctive forest green accent
  {
    id: 'classic-green',
    name: 'Classic Green',
    description: 'Distinctive forest green design for all industries. Clean single-column, ATS-optimized.',
    region: 'US',
    style: 'modern-ats',
    includesPhoto: false,
    pageSize: 'letter',
    colors: {
      primary: '#2D6A4F',      // Forest Green - calm, professional
      secondary: '#4B5563',    // Medium grey
      accent: '#2D6A4F',       // Forest Green
      text: '#1A1A1A',         // Near-black
      textLight: '#4B5563',    // Medium grey
      background: '#ffffff',
      headerBg: '#ECFDF5',     // Very light green tint
    },
    fonts: {
      heading: 'Georgia, Times New Roman, serif',
      body: 'Arial, Helvetica, sans-serif',
    },
    sectionOrder: ['header', 'summary', 'skills', 'experience', 'education', 'certifications', 'languages'],
  },
];

export function getTemplateById(id: string): CVTemplate | undefined {
  return CV_TEMPLATE_DEFINITIONS.find(t => t.id === id);
}

export function getTemplatesByRegion(region: CVRegion): CVTemplate[] {
  return CV_TEMPLATE_DEFINITIONS.filter(t => t.region === region);
}
