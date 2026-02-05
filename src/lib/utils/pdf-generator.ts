/**
 * PDF Generator Utilities
 * Helper functions for CV PDF generation
 * Extracted from CVPanel.tsx and generate-pdf API route
 */

import type { CVData } from '@/lib/cv-templates/types';

/**
 * Page size configurations
 */
export const PAGE_SIZES = {
  letter: {
    width: '8.5in',
    height: '11in',
    name: 'US Letter',
  },
  a4: {
    width: '210mm',
    height: '297mm',
    name: 'A4',
  },
} as const;

export type PageSize = keyof typeof PAGE_SIZES;

/**
 * Determine page size based on template ID
 */
export function getPageSizeForTemplate(templateId: string): PageSize {
  // German/EU templates use A4
  if (templateId.includes('german') || templateId.includes('eu-')) {
    return 'a4';
  }
  // US templates use Letter
  return 'letter';
}

/**
 * Format date for CV display
 * Handles various input formats and outputs consistent format
 */
export function formatDateForCV(date: string | null | undefined, locale: 'en' | 'de' = 'en'): string {
  if (!date) return '';
  
  // Handle "Present" or "Gegenwart"
  const presentTerms = ['present', 'current', 'now', 'gegenwart', 'heute', 'aktuell'];
  if (presentTerms.some(term => date.toLowerCase().includes(term))) {
    return locale === 'de' ? 'Gegenwart' : 'Present';
  }
  
  // Try to parse as date
  try {
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      const options: Intl.DateTimeFormatOptions = { 
        month: 'long', 
        year: 'numeric' 
      };
      return parsed.toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', options);
    }
  } catch {
    // Fall through to return original
  }
  
  // Return original if parsing fails
  return date;
}

/**
 * Format date range for CV (e.g., "January 2020 – Present")
 */
export function formatDateRange(
  startDate: string | null | undefined, 
  endDate: string | null | undefined,
  locale: 'en' | 'de' = 'en'
): string {
  const start = formatDateForCV(startDate, locale);
  const end = formatDateForCV(endDate, locale) || (locale === 'de' ? 'Gegenwart' : 'Present');
  
  if (!start) return end;
  return `${start} – ${end}`;
}

/**
 * Sanitize text for PDF generation
 * Removes special characters that may break PDF rendering
 */
export function sanitizeTextForPDF(text: string): string {
  if (!text) return '';
  
  return text
    // Remove zero-width characters
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Replace smart quotes with regular quotes
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    // Replace em/en dashes with regular dashes
    .replace(/[\u2013\u2014]/g, '-')
    // Remove other problematic unicode
    .replace(/[^\x00-\x7F\u00C0-\u024F\u1E00-\u1EFF]/g, '')
    // Trim whitespace
    .trim();
}

/**
 * Calculate approximate page count for CV
 * Based on content length heuristics
 */
export function estimatePageCount(cvData: CVData): number {
  let contentScore = 0;
  
  // Personal info and summary
  contentScore += cvData.summary ? Math.ceil(cvData.summary.length / 500) : 0;
  
  // Experience (each entry ~0.3-0.5 pages)
  if (cvData.experience) {
    cvData.experience.forEach(exp => {
      contentScore += 0.3;
      contentScore += (exp.bullets?.length || 0) * 0.08;
    });
  }
  
  // Education (~0.15 pages each)
  contentScore += (cvData.education?.length || 0) * 0.15;
  
  // Skills (~0.2 pages per category)
  contentScore += (cvData.skills?.length || 0) * 0.2;
  
  // Certifications (~0.1 pages each)
  contentScore += (cvData.certifications?.length || 0) * 0.1;
  
  // Languages (~0.1 pages)
  contentScore += (cvData.languages?.length || 0) * 0.05;
  
  return Math.max(1, Math.ceil(contentScore));
}

/**
 * Generate filename for CV PDF
 */
export function generateCVFilename(cvData: CVData, suffix?: string): string {
  const name = cvData.personal.fullName || 'CV';
  const safeName = name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
  
  const date = new Date().toISOString().split('T')[0];
  const suffixPart = suffix ? `_${suffix}` : '';
  
  return `${safeName}_Resume${suffixPart}_${date}.pdf`;
}

/**
 * Get print window HTML template
 * Returns the HTML structure for the print window
 */
export function getPrintWindowHTML(
  cvContent: string, 
  cvData: CVData, 
  templateId: string
): string {
  const pageSize = getPageSizeForTemplate(templateId);
  const pageWidth = PAGE_SIZES[pageSize].width;
  const pageSizeName = pageSize === 'letter' ? 'letter' : 'A4';
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${cvData.personal.fullName || 'CV'} - Resume</title>
      <link rel="stylesheet" href="/styles/cv-print.css">
      <style>
        @page {
          size: ${pageSizeName};
          margin: 0.5in 0.75in;
        }
        .cv-container {
          max-width: ${pageWidth};
        }
      </style>
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    </head>
    <body>
      <div class="cv-container ${pageSize}">
        ${cvContent}
      </div>
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
            setTimeout(function() { window.close(); }, 100);
          }, 800);
        };
      </script>
    </body>
    </html>
  `;
}

/**
 * Truncate text to fit within character limit
 * Useful for ensuring content fits on page
 */
export function truncateText(text: string, maxLength: number, suffix = '...'): string {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - suffix.length).trim() + suffix;
}

/**
 * Character limits for CV sections (ATS 2026 standards)
 */
export const CV_CHARACTER_LIMITS = {
  headline: { min: 120, max: 220 },
  summary: { min: 500, max: 700 },
  bulletPoint: { min: 75, max: 160 },
  skillsPerCategory: 5,
  maxCategories: 5,
  maxExperienceEntries: 4,
  maxBulletsPerEntry: 4,
} as const;
