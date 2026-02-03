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

// 3. SKILLS SECTION LIMITS
export const SKILLS_LIMITS = {
  US: { totalSkills: { min: 12, max: 20 }, categories: { min: 3, max: 5 }, perCategory: { min: 3, max: 6 }, totalChars: { min: 300, max: 500 } },
  Germany: { totalSkills: { min: 10, max: 15 }, categories: { min: 3, max: 4 }, perCategory: { min: 2, max: 4 }, totalChars: { min: 250, max: 400 } },
  EU: { totalSkills: { min: 10, max: 18 }, categories: { min: 3, max: 4 }, perCategory: { min: 3, max: 5 }, totalChars: { min: 280, max: 480 } },
} as const;

// 4. EXPERIENCE BULLET POINT LIMITS
export const EXPERIENCE_BULLET_LIMITS = {
  entry: { chars: { min: 80, max: 140 }, words: { min: 12, max: 20 } },
  mid: { chars: { min: 75, max: 160 }, words: { min: 11, max: 22 } },
  senior: { chars: { min: 80, max: 180 }, words: { min: 12, max: 25 } },
  Germany: { chars: { min: 70, max: 150 }, words: { min: 10, max: 20 } },
} as const;

// Experience bullets per role by experience level
export const EXPERIENCE_BULLETS_PER_ROLE = {
  entry: { recentRole: { min: 2, max: 3 }, olderRoles: { min: 2, max: 3 } },
  mid: { recentRole: { min: 4, max: 6 }, olderRoles: { min: 4, max: 6 } },
  senior: { recentRole: { min: 5, max: 8 }, olderRoles: { min: 2, max: 3 } },
  Germany: { recentRole: { min: 4, max: 5 }, olderRoles: { min: 3, max: 4 } },
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

// ============================================
// VALIDATION FUNCTIONS
// ============================================

export interface ValidationResult {
  isValid: boolean;
  charCount: number;
  wordCount: number;
  expectedRange: string;
  status: 'PASS' | 'WARNING' | 'FAIL';
  message?: string;
}

// Validate tagline/headline
export function validateTagline(tagline: string, region: TargetRegion): ValidationResult {
  const limits = TAGLINE_LIMITS[region];
  const charCount = tagline.length;
  const wordCount = tagline.split(/\s+/).filter(Boolean).length;
  
  const isValidChars = charCount >= limits.min && charCount <= limits.max;
  const isValidWords = wordCount >= limits.words.min && wordCount <= limits.words.max;
  const isOptimal = charCount >= limits.optimal.min && charCount <= limits.optimal.max;
  
  return {
    isValid: isValidChars && isValidWords,
    charCount,
    wordCount,
    expectedRange: `${limits.min}-${limits.max} chars, ${limits.words.min}-${limits.words.max} words`,
    status: isOptimal ? 'PASS' : (isValidChars && isValidWords ? 'WARNING' : 'FAIL'),
    message: isOptimal ? 'Optimal length' : (isValidChars ? 'Acceptable but not optimal' : `Adjust to ${limits.optimal.min}-${limits.optimal.max} chars`),
  };
}

// Validate professional summary
export function validateSummary(summary: string, region: TargetRegion): ValidationResult {
  const limits = SUMMARY_LIMITS[region];
  const charCount = summary.length;
  const wordCount = summary.split(/\s+/).filter(Boolean).length;
  const sentenceCount = summary.split(/[.!?]+/).filter(s => s.trim()).length;
  
  const isValidChars = charCount >= limits.min && charCount <= limits.max;
  const isValidWords = wordCount >= limits.words.min && wordCount <= limits.words.max;
  const isValidSentences = sentenceCount >= limits.sentences.min && sentenceCount <= limits.sentences.max;
  const isOptimal = charCount >= limits.optimal.min && charCount <= limits.optimal.max;
  
  return {
    isValid: isValidChars && isValidWords && isValidSentences,
    charCount,
    wordCount,
    expectedRange: `${limits.min}-${limits.max} chars, ${limits.words.min}-${limits.words.max} words, ${limits.sentences.min}-${limits.sentences.max} sentences`,
    status: isOptimal ? 'PASS' : (isValidChars ? 'WARNING' : 'FAIL'),
    message: !isValidSentences ? `Adjust to ${limits.sentences.min}-${limits.sentences.max} sentences` : undefined,
  };
}

// Validate skills section
export function validateSkillsSection(skills: Array<{ category: string; items: string[] }>, region: TargetRegion): ValidationResult & { totalSkills: number; categoryCount: number } {
  const limits = SKILLS_LIMITS[region];
  const totalSkills = skills.reduce((sum, cat) => sum + cat.items.length, 0);
  const categoryCount = skills.length;
  const totalChars = skills.reduce((sum, cat) => sum + cat.category.length + cat.items.join(', ').length, 0);
  
  const isValidTotal = totalSkills >= limits.totalSkills.min && totalSkills <= limits.totalSkills.max;
  const isValidCategories = categoryCount >= limits.categories.min && categoryCount <= limits.categories.max;
  const isValidPerCategory = skills.every(cat => cat.items.length >= limits.perCategory.min && cat.items.length <= limits.perCategory.max);
  
  return {
    isValid: isValidTotal && isValidCategories && isValidPerCategory,
    charCount: totalChars,
    wordCount: totalSkills,
    totalSkills,
    categoryCount,
    expectedRange: `${limits.totalSkills.min}-${limits.totalSkills.max} skills in ${limits.categories.min}-${limits.categories.max} categories`,
    status: isValidTotal && isValidCategories && isValidPerCategory ? 'PASS' : 'FAIL',
    message: !isValidTotal ? `Adjust to ${limits.totalSkills.min}-${limits.totalSkills.max} total skills` : undefined,
  };
}

// Validate experience bullet point
export function validateBulletPoint(bullet: string, experienceLevel: ExperienceLevel, region: TargetRegion): ValidationResult & { hasMetric: boolean } {
  const limits = region === 'Germany' ? EXPERIENCE_BULLET_LIMITS.Germany : EXPERIENCE_BULLET_LIMITS[experienceLevel];
  const charCount = bullet.length;
  const wordCount = bullet.split(/\s+/).filter(Boolean).length;
  
  // Check for quantifiable metrics (%, $, numbers, time periods)
  const hasMetric = /(\d+%|\$[\d,KMB]+|\d+\s*(year|month|week|day|hour)s?|\d+\s*(project|client|team|user|customer)s?|\d+[xX]|\d+\+)/.test(bullet);
  
  const isValidLength = charCount >= limits.chars.min && charCount <= limits.chars.max;
  const isValidWords = wordCount >= limits.words.min && wordCount <= limits.words.max;
  
  return {
    isValid: isValidLength && isValidWords && hasMetric,
    charCount,
    wordCount,
    hasMetric,
    expectedRange: `${limits.chars.min}-${limits.chars.max} chars`,
    status: isValidLength && hasMetric ? 'PASS' : (isValidLength ? 'WARNING' : 'FAIL'),
    message: !hasMetric ? 'Add quantifiable metric (%, $, numbers)' : undefined,
  };
}

// Strong action verbs for experience bullets (avoid weak verbs)
export const STRONG_ACTION_VERBS = [
  'Achieved', 'Accelerated', 'Accomplished', 'Administered', 'Advanced',
  'Built', 'Boosted',
  'Captured', 'Championed', 'Consolidated', 'Converted', 'Coordinated', 'Created', 'Cultivated',
  'Decreased', 'Delivered', 'Designed', 'Developed', 'Directed', 'Drove',
  'Earned', 'Eliminated', 'Enabled', 'Engineered', 'Enhanced', 'Established', 'Exceeded', 'Executed', 'Expanded',
  'Facilitated', 'Formulated', 'Founded',
  'Generated', 'Grew',
  'Headed',
  'Implemented', 'Improved', 'Increased', 'Initiated', 'Innovated', 'Introduced',
  'Launched', 'Led', 'Leveraged',
  'Managed', 'Maximized', 'Mentored', 'Modernized',
  'Negotiated',
  'Optimized', 'Orchestrated', 'Outperformed', 'Overhauled',
  'Partnered', 'Pioneered', 'Produced', 'Propelled',
  'Raised', 'Reached', 'Realized', 'Reduced', 'Refined', 'Reorganized', 'Resolved', 'Restructured', 'Revamped', 'Revolutionized',
  'Saved', 'Scaled', 'Secured', 'Simplified', 'Spearheaded', 'Standardized', 'Streamlined', 'Strengthened', 'Surpassed',
  'Trained', 'Transformed', 'Tripled',
  'Unified', 'Upgraded',
  'Won',
] as const;

// Weak verbs to avoid
export const WEAK_VERBS_TO_AVOID = [
  'Assisted', 'Helped', 'Participated', 'Responsible for', 'Worked on', 'Was involved in',
  'Handled', 'Did', 'Made', 'Got', 'Tried', 'Attempted',
] as const;

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

// Validate language proficiency for resume inclusion
export function shouldIncludeLanguage(cefrLevel: string): boolean {
  // A1 and A2 are too basic for professional resumes
  return !['A1', 'A2'].includes(cefrLevel);
}

// Format language entry based on region
export function formatLanguageEntry(language: string, cefrLevel: string, region: TargetRegion): string {
  if (!shouldIncludeLanguage(cefrLevel)) {
    return ''; // Don't include A1/A2 levels
  }
  
  if (region === 'US') {
    const descriptive = CEFR_TO_DESCRIPTIVE[cefrLevel] || cefrLevel;
    return `${language} – ${descriptive}`;
  } else {
    // Germany/EU: Use CEFR format
    const germanLabel = region === 'Germany' ? GERMAN_PROFICIENCY_LABELS[cefrLevel] : CEFR_TO_DESCRIPTIVE[cefrLevel];
    return `${language} – ${cefrLevel} (${germanLabel})`;
  }
}

// Estimate page count based on character count
export function estimatePageCount(totalChars: number, experienceLevel: ExperienceLevel): number {
  const budgets = PAGE_CHARACTER_BUDGETS.totals;
  
  if (experienceLevel === 'entry') {
    return totalChars <= budgets.entry.page1.max ? 1 : 2;
  } else if (experienceLevel === 'mid') {
    return totalChars <= budgets.midOnePage.total.max ? 1 : 2;
  } else {
    return 2; // Senior always 2 pages
  }
}

// ============================================
// AI FUNCTION IMPLEMENTATIONS (Part 6)
// Character validation, metric detection, keyword matching, ATS checking
// ============================================

// Character count limits by region
const CHARACTER_LIMITS = {
  US: {
    headline: { min: 120, max: 220 },
    summary_entry: { min: 60, max: 120 },
    summary_mid: { min: 70, max: 110 },
    summary_senior: { min: 80, max: 120 },
    skills_total: { min: 12, max: 20 },
    bullet_point: { min: 80, max: 180 },
  },
  Germany: {
    headline: { min: 100, max: 180 },
    summary: { min: 60, max: 100 },
    skills_total: { min: 10, max: 15 },
    bullet_point: { min: 70, max: 150 },
  },
  EU: {
    headline: { min: 110, max: 200 },
    summary: { min: 70, max: 110 },
    skills_total: { min: 10, max: 18 },
    bullet_point: { min: 80, max: 170 },
  },
} as const;

// Field validation result
export interface FieldValidation {
  current: number;
  min: number;
  max: number;
  isValid: boolean;
  status: 'PASS' | 'REVIEW';
}

// Validate a single field against limits
export function validateField(content: string | number, limit: { min: number; max: number }): FieldValidation {
  const count = typeof content === 'number' ? content : content.length;
  const isValid = count >= limit.min && count <= limit.max;
  return {
    current: count,
    min: limit.min,
    max: limit.max,
    isValid,
    status: isValid ? 'PASS' : 'REVIEW',
  };
}

// CV validation result
export interface CVValidationResult {
  headline: FieldValidation;
  summary: FieldValidation;
  skills: FieldValidation;
  bullets: FieldValidation[];
  status: 'all_valid' | 'review_required';
}

// Validate all character counts in CV data
export function validateCharacterCounts(
  cvData: {
    headline?: string;
    summary?: string;
    skills: Array<{ items: string[] }>;
    experience: Array<{ bullets: string[] }>;
  },
  region: TargetRegion,
  experienceLevel: ExperienceLevel = 'mid'
): CVValidationResult {
  const limits = CHARACTER_LIMITS[region];
  
  // Get summary limits based on experience level (US only has level-specific)
  const summaryLimit = region === 'US' 
    ? (limits as typeof CHARACTER_LIMITS.US)[`summary_${experienceLevel}` as keyof typeof CHARACTER_LIMITS.US] as { min: number; max: number }
    : (limits as typeof CHARACTER_LIMITS.Germany | typeof CHARACTER_LIMITS.EU).summary;
  
  const headlineValidation = validateField(cvData.headline || '', limits.headline);
  const summaryValidation = validateField(cvData.summary || '', summaryLimit);
  const skillsCount = cvData.skills.reduce((sum, cat) => sum + cat.items.length, 0);
  const skillsValidation = validateField(skillsCount, limits.skills_total);
  
  const bulletValidations = cvData.experience.flatMap(job =>
    job.bullets.map(bullet => validateField(bullet, limits.bullet_point))
  );
  
  const allValid = headlineValidation.isValid && 
    summaryValidation.isValid && 
    skillsValidation.isValid && 
    bulletValidations.every(b => b.isValid);
  
  return {
    headline: headlineValidation,
    summary: summaryValidation,
    skills: skillsValidation,
    bullets: bulletValidations,
    status: allValid ? 'all_valid' : 'review_required',
  };
}

// Metric detection result
export interface MetricDetectionResult {
  hasPercentage: boolean;
  hasCurrency: boolean;
  hasCount: boolean;
  hasRatio: boolean;
  hasGrowthVerb: boolean;
  metricsFound: string[];
  isValid: boolean;
}

// Detect metrics in a bullet point
export function detectMetricsInBullet(bullet: string): MetricDetectionResult {
  const percentagePattern = /(\d+)%/g;
  const currencyPattern = /\$[\d,KMB]+|€[\d,KMB]+|£[\d,KMB]+/g;
  const countPattern = /\d+\s*(years?|months?|weeks?|days?|projects?|teams?|people?|clients?|users?|customers?)/gi;
  const ratioPattern = /\d+\.?\d*:\d+\.?\d*|ROAS|ROI|CTR|CVR/gi;
  const growthPattern = /growth|increase|decrease|improve|reduce|optimize|grew|raised|boosted|cut|saved/gi;
  
  const percentageMatches = bullet.match(percentagePattern) || [];
  const currencyMatches = bullet.match(currencyPattern) || [];
  const countMatches = bullet.match(countPattern) || [];
  
  const hasPercentage = percentageMatches.length > 0;
  const hasCurrency = currencyMatches.length > 0;
  const hasCount = countMatches.length > 0;
  const hasRatio = ratioPattern.test(bullet);
  const hasGrowthVerb = growthPattern.test(bullet);
  
  return {
    hasPercentage,
    hasCurrency,
    hasCount,
    hasRatio,
    hasGrowthVerb,
    metricsFound: [...percentageMatches, ...currencyMatches, ...countMatches],
    isValid: hasPercentage || hasCurrency || hasCount,
  };
}

// Keyword match result
export interface KeywordMatchResult {
  jobKeywords: string[];
  matchedKeywords: number;
  totalKeywords: number;
  matchPercentage: number;
  recommendation: 'GOOD' | 'REVIEW - Add more keywords';
}

// Stop words to filter out
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'shall', 'can', 'need', 'dare', 'ought', 'used', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'whom',
  'your', 'our', 'their', 'its', 'my', 'his', 'her', 'about', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same',
  'than', 'too', 'very', 'just', 'also', 'now', 'well', 'work', 'working',
]);

// Extract keywords from text
export function extractKeywords(text: string, limit: number = 20): string[] {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => !STOP_WORDS.has(w) && w.length > 3);
  
  // Count word frequency
  const wordCount = new Map<string, number>();
  words.forEach(word => {
    wordCount.set(word, (wordCount.get(word) || 0) + 1);
  });
  
  // Sort by frequency and return top N unique words
  return [...wordCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

// Calculate keyword match between CV and job description
export function calculateKeywordMatch(cvContent: string, jobDescription: string): KeywordMatchResult {
  const jobKeywords = extractKeywords(jobDescription, 20);
  const cvText = cvContent.toLowerCase();
  
  let matchedCount = 0;
  jobKeywords.forEach(keyword => {
    if (cvText.includes(keyword)) {
      matchedCount++;
    }
  });
  
  const matchPercentage = jobKeywords.length > 0 
    ? (matchedCount / jobKeywords.length) * 100 
    : 0;
  
  return {
    jobKeywords,
    matchedKeywords: matchedCount,
    totalKeywords: jobKeywords.length,
    matchPercentage: Math.round(matchPercentage),
    recommendation: matchPercentage >= 70 ? 'GOOD' : 'REVIEW - Add more keywords',
  };
}

// ATS compatibility result
export interface ATSCompatibilityResult {
  checks: {
    noTables: boolean;
    noTextBoxes: boolean;
    singleColumn: boolean;
    noImages: boolean;
    noGraphics: boolean;
    standardFonts: boolean;
    noSpecialCharacters: boolean;
  };
  atsScore: string;
  recommendation: 'HIGH compatibility' | 'MEDIUM - review issues' | 'LOW - major issues';
  issues: string[];
}

// Standard ATS-safe fonts
const STANDARD_FONTS = new Set([
  'arial', 'helvetica', 'calibri', 'times new roman', 'georgia', 'verdana',
  'tahoma', 'trebuchet ms', 'garamond', 'cambria', 'sans-serif', 'serif',
]);

// Check ATS compatibility
export function checkATSCompatibility(cvContent: string, fonts: string[] = []): ATSCompatibilityResult {
  const issues: string[] = [];
  
  const noTables = !/<table/i.test(cvContent);
  if (!noTables) issues.push('Contains tables - may not parse correctly');
  
  const noTextBoxes = !/textbox|text-box/i.test(cvContent);
  if (!noTextBoxes) issues.push('Contains text boxes - content may be skipped');
  
  const singleColumn = !/columns?:\s*[2-9]|multi-?column/i.test(cvContent);
  if (!singleColumn) issues.push('Multi-column layout detected - may cause parsing issues');
  
  const noImages = !/<img|image|\.png|\.jpg|\.jpeg|\.gif/i.test(cvContent);
  if (!noImages) issues.push('Contains images - will not be parsed by ATS');
  
  const noGraphics = !/svg|canvas|chart|graph/i.test(cvContent);
  if (!noGraphics) issues.push('Contains graphics - will not be parsed by ATS');
  
  const standardFonts = fonts.length === 0 || fonts.every(f => 
    STANDARD_FONTS.has(f.toLowerCase().split(',')[0].trim())
  );
  if (!standardFonts) issues.push('Non-standard fonts detected - may not render correctly');
  
  // Check for problematic special characters
  const noSpecialCharacters = !/[^\x00-\x7F]/.test(cvContent) || 
    !/[│┃┆┇┊┋╎╏║╽╿▏▎▍▌▋▊▉█]/u.test(cvContent);
  if (!noSpecialCharacters) issues.push('Special characters detected - may cause encoding issues');
  
  const checks = {
    noTables,
    noTextBoxes,
    singleColumn,
    noImages,
    noGraphics,
    standardFonts,
    noSpecialCharacters,
  };
  
  const passedChecks = Object.values(checks).filter(Boolean).length;
  const totalChecks = Object.keys(checks).length;
  const score = (passedChecks / totalChecks) * 100;
  
  let recommendation: ATSCompatibilityResult['recommendation'];
  if (score >= 90) {
    recommendation = 'HIGH compatibility';
  } else if (score >= 70) {
    recommendation = 'MEDIUM - review issues';
  } else {
    recommendation = 'LOW - major issues';
  }
  
  return {
    checks,
    atsScore: `${Math.round(score)}%`,
    recommendation,
    issues,
  };
}

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

// Get template specifications by ID
export function getTemplateSpecifications(templateId: string) {
  return TEMPLATE_SPECIFICATIONS[templateId as keyof typeof TEMPLATE_SPECIFICATIONS];
}

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
  
  // Additional information (work authorization, driver's license, etc.)
  additionalInfo?: string[];

  // Smart Insights for Premium UI (Web View Only)
  annotations?: Array<{
    section_id: string;
    insight: string;
  }>;
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
];

export function getTemplateById(id: string): CVTemplate | undefined {
  return CV_TEMPLATE_DEFINITIONS.find(t => t.id === id);
}

export function getTemplatesByRegion(region: CVRegion): CVTemplate[] {
  return CV_TEMPLATE_DEFINITIONS.filter(t => t.region === region);
}
