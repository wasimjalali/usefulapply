import { v4 as uuidv4 } from 'uuid';

/**
 * Production-ready CV Schema
 * - Stable UUIDs (not index-based)
 * - Raw + normalized dates
 * - Region-aware settings
 */

export interface CVDate {
  raw: string;
  normalized?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface CVSettings {
  region: 'US' | 'EU' | 'other';
  includePhoto: boolean;
  pageSize: 'letter' | 'a4';
  maxPages: 1 | 2;
  language: string;
}

export interface StructuredCV {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  sourceFileName: string;
  sourceFormat: 'pdf' | 'docx' | 'txt' | 'manual';
  
  settings: CVSettings;
  
  personal: PersonalInfo;
  
  summary?: string;
  
  experience: WorkExperience[];
  
  education: Education[];
  
  skills: SkillCategory[];
  
  certifications: Certification[];
  
  languages: Language[];
  
  projects?: Project[];

  additionalSections?: AdditionalSection[];

  /** Localized section headers detected from CV language (e.g., "BERUFSERFAHRUNG" for German) */
  sectionHeaders?: Record<string, string>;

  /** Localized UI strings for template rendering (e.g., "Heute" for "Present" in German) */
  localizedStrings?: Record<string, string>;
}

export interface PersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  currentTitle?: string; // Job title/tagline (e.g., "Senior Software Engineer")
  address?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  dateOfBirth?: string; // Important for EU CVs
  nationality?: string; // Important for EU CVs
  linkedIn?: string;
  website?: string;
  github?: string;
  photoUrl?: string;
}

export interface WorkExperience {
  id: string;
  company: string;
  position: string;
  location?: string;
  startDate: CVDate;
  endDate?: CVDate;
  current: boolean;
  bullets: string[];
  _originalBullets?: string[];
}

export interface Education {
  id: string;
  institution: string;
  degree: string;
  field?: string;
  location?: string;
  startDate?: CVDate;
  endDate?: CVDate;
  grade?: string;
  highlights?: string[];
}

export interface SkillCategory {
  id: string;
  category: string;
  skills: string[];
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  date?: CVDate;
  expiryDate?: CVDate;
  credentialId?: string;
  credentialUrl?: string;
}

export interface Language {
  id: string;
  language: string;
  /** Exact proficiency text from the source CV, or an empty string when absent. */
  proficiency: string;
  certification?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  technologies: string[];
  url?: string;
  date?: CVDate;
}

export interface AdditionalSection {
  id: string;
  title: string;
  items: string[];
}

export function createEmptyCV(region: 'US' | 'EU' = 'EU'): StructuredCV {
  return {
    id: uuidv4(),
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceFileName: '',
    sourceFormat: 'manual',
    settings: {
      region,
      includePhoto: region === 'EU',
      pageSize: region === 'EU' ? 'a4' : 'letter',
      maxPages: region === 'EU' ? 2 : 1,
      language: region === 'EU' ? 'de' : 'en',
    },
    personal: {
      fullName: '',
      email: '',
      phone: '',
    },
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    languages: [],
  };
}

export function parseDate(raw: string): CVDate {
  if (!raw) return { raw: '', confidence: 'low' };
  
  const trimmed = raw.trim();
  
  const patterns = [
    { regex: /^(\d{4})-(\d{2})$/, format: 'YYYY-MM', confidence: 'high' as const },
    { regex: /^(\d{2})\/(\d{4})$/, format: 'MM/YYYY', confidence: 'high' as const },
    // German / DACH CVs use dotted dates: "03.2022" (MM.YYYY) and
    // "15.03.2022" (DD.MM.YYYY). Both normalize to YYYY-MM like the others.
    { regex: /^(\d{2})\.(\d{4})$/, format: 'MM.YYYY', confidence: 'high' as const },
    { regex: /^(\d{2})\.(\d{2})\.(\d{4})$/, format: 'DD.MM.YYYY', confidence: 'high' as const },
    { regex: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{4})$/i, format: 'Mon YYYY', confidence: 'high' as const },
    { regex: /^(\d{4})$/, format: 'YYYY', confidence: 'medium' as const },
    { regex: /present|current|heute|aktuell/i, format: 'present', confidence: 'high' as const },
  ];
  
  for (const { regex, format, confidence } of patterns) {
    const match = trimmed.match(regex);
    if (match) {
      let normalized: string | undefined;
      
      if (format === 'YYYY-MM') {
        normalized = trimmed;
      } else if (format === 'MM/YYYY' || format === 'MM.YYYY') {
        normalized = `${match[2]}-${match[1]}`;
      } else if (format === 'DD.MM.YYYY') {
        normalized = `${match[3]}-${match[2]}`;
      } else if (format === 'Mon YYYY') {
        const months: Record<string, string> = {
          jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
          jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
        };
        normalized = `${match[2]}-${months[match[1].toLowerCase()]}`;
      } else if (format === 'YYYY') {
        normalized = match[1];
      } else if (format === 'present') {
        normalized = 'present';
      }
      
      return { raw: trimmed, normalized, confidence };
    }
  }
  
  return { raw: trimmed, confidence: 'low' };
}

export function withId<T>(item: Omit<T, 'id'>): T {
  return { ...item, id: uuidv4() } as T;
}

export const CV_TEMPLATES = [
  {
    id: 'eu-ats',
    name: 'EU Professional',
    region: 'EU' as const,
    pageSize: 'a4' as const,
    maxPages: 2,
  },
  {
    id: 'us-ats',
    name: 'US ATS-Friendly',
    region: 'US' as const,
    pageSize: 'letter' as const,
    maxPages: 1,
  },
  {
    id: 'eu-creative',
    name: 'EU Creative',
    region: 'EU' as const,
    pageSize: 'a4' as const,
    maxPages: 2,
  },
  {
    id: 'us-executive',
    name: 'US Executive',
    region: 'US' as const,
    pageSize: 'letter' as const,
    maxPages: 2,
  },
];
