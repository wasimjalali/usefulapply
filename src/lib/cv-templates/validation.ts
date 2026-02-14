/**
 * CV Validation Functions
 * 
 * Extracted from types.ts for modularity.
 * Contains all validate*() functions, field validation, ATS compatibility checks,
 * language formatting, and page estimation.
 */

import {
  TAGLINE_LIMITS,
  SUMMARY_LIMITS,
  SKILLS_LIMITS,
  EXPERIENCE_BULLET_LIMITS,
  PAGE_CHARACTER_BUDGETS,
  CEFR_TO_DESCRIPTIVE,
  GERMAN_PROFICIENCY_LABELS,
  TEMPLATE_SPECIFICATIONS,
  type TargetRegion,
  type ExperienceLevel,
} from './types';

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
// FIELD VALIDATION
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

// ============================================
// ATS COMPATIBILITY
// ============================================

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

// Get template specifications by ID
export function getTemplateSpecifications(templateId: string) {
  return TEMPLATE_SPECIFICATIONS[templateId as keyof typeof TEMPLATE_SPECIFICATIONS];
}
