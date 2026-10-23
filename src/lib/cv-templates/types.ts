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

export type CEFRLevel = keyof typeof CEFR_LEVELS;

export type CVTemplateStyle = 'classic' | 'modern-ats' | 'professional';

/** Shown when a CV with a photo, a date of birth or a nationality is on a US template, which leaves them out. */
export const US_TEMPLATE_PERSONAL_DATA_NOTE = 'US templates leave out your photo and personal details.';

/** True when the CV holds details only a DACH template prints: a photo, a date of birth or a nationality. */
export function hasDachPersonalData(personal: { photoUrl?: string; dateOfBirth?: string; nationality?: string }): boolean {
  return Boolean(personal.photoUrl || personal.dateOfBirth?.trim() || personal.nationality?.trim());
}

export interface CVTemplate {
  id: string;
  name: string;
  description: string;
  region: CVRegion;
  style: CVTemplateStyle;
  includesPhoto: boolean;
  pageSize: 'letter' | 'a4';
  /**
   * How a parser reads the page. Every template is a single column, read top to bottom; the field is here
   * for the template list the MCP `list_cv_templates` tool exposes.
   */
  atsReadingOrder: 'single-column';
  
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
  /** Language the CV is written in (ISO 639-1). Drives standard headings and date formats; inferred when absent. */
  language?: string;
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
    /** Kept in the CV but left off the canvas and the exports. */
    hidden?: boolean;
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
    hidden?: boolean;
  }>;
  
  skills: Array<{
    category: string;
    items: string[];
    /** The whole group is kept but not shown. */
    hidden?: boolean;
    /** Skills in `items` that are kept but not shown. */
    hiddenItems?: string[];
  }>;
  
  languages: Array<{
    language: string;
    proficiency: string; // CEFR level (A1-C2) or 'Native' - MANDATORY for EU per 2026 standards
    cefrLevel?: CEFRLevel; // Typed CEFR level for validation
    certification?: string; // e.g., "TOEFL 110", "Goethe B2"
    hidden?: boolean;
  }>;
  
  certifications: Array<{
    id: string;
    name: string;
    issuer: string;
    date?: string;
    credentialId?: string;
    hidden?: boolean;
  }>;
  
  projects?: Array<{
    id: string;
    name: string;
    description: string;
    technologies?: string[];
    url?: string;
    hidden?: boolean;
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
    projects?: string;       // e.g., "Projets" / "Projekte"
  };

  // Localized UI strings for template rendering
  localizedStrings?: {
    present?: string;        // "Present" / "Heute" / "Présent"
    gradePrefix?: string;    // "GPA:" / "Note:" / "Mention:"
    degreeConnector?: string; // "in" / "en" / "in"
    photoPlaceholder?: string; // "Photo" / "Foto"
    dateOfBirthLabel?: string; // "Date of Birth" / "Geburtsdatum"
    nationalityLabel?: string; // "Nationality" / "Nationalität"
    websiteLabel?: string;   // "Website" / "Webseite"
    signatureLabel?: string; // "Signature" / "Unterschrift"
    cityLabel?: string;      // "City" / "Ort"
    dateLabel?: string;      // "Date" / "Datum"
  };

  // Additional information (work authorization, driver's license, etc.)
  additionalInfo?: string[];

  // Generic catch-all for any other sections (achievements, references, volunteer, publications, etc.)
  // Ensures no parsed section is ever silently dropped
  customSections?: Array<{
    id: string;
    title: string;   // ATS-safe display heading (e.g., "Selected Achievements", "References")
    items: string[];  // Bullet points or paragraph items
    hidden?: boolean;
  }>;

  /** Sections whose heading the user or the chat chose. Shown exactly as written, never normalized. */
  renamedHeadings?: Array<'summary' | 'experience' | 'education' | 'skills' | 'certifications' | 'languages' | 'projects' | 'additionalInfo'>;

  /** Whole sections kept in the CV but not shown. See cv-templates/hidden.ts. */
  hiddenSections?: Array<'summary' | 'experience' | 'education' | 'skills' | 'certifications' | 'languages' | 'projects' | 'additionalInfo'>;
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
    atsReadingOrder: 'single-column',
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
    sectionOrder: ['header', 'summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'languages'],
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
    atsReadingOrder: 'single-column',
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
    atsReadingOrder: 'single-column',
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
    sectionOrder: ['header', 'summary', 'experience', 'education', 'skills', 'certifications', 'languages', 'projects'],
  },

  // 4. Portrait ATS - Single column with photo (EU/A4 format)
  {
    id: 'german-ats',
    name: 'Portrait ATS',
    description: 'Single-column A4 layout with photo. CEFR language levels, ideal for EU job markets.',
    region: 'EU',
    style: 'classic',
    includesPhoto: true,
    pageSize: 'a4',
    atsReadingOrder: 'single-column',
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
    sectionOrder: ['header', 'photo', 'summary', 'experience', 'education', 'skills', 'languages', 'certifications', 'projects'],
  },

  // 5. Portrait Classic - Single-column with photo (better ATS than two-column)
  {
    id: 'german-classic',
    name: 'Portrait Classic',
    description: 'Single-column A4 layout with photo. Maximum ATS compatibility, clean charcoal design.',
    region: 'EU',
    style: 'classic',
    includesPhoto: true,
    pageSize: 'a4',
    atsReadingOrder: 'single-column',
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
    sectionOrder: ['header', 'photo', 'summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'languages'],
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
    atsReadingOrder: 'single-column',
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
    sectionOrder: ['header', 'summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'languages'],
  },
];

export function getTemplateById(id: string): CVTemplate | undefined {
  return CV_TEMPLATE_DEFINITIONS.find(t => t.id === id);
}

export function getTemplatesByRegion(region: CVRegion): CVTemplate[] {
  return CV_TEMPLATE_DEFINITIONS.filter(t => t.region === region);
}
