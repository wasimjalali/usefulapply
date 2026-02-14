/**
 * Full Re-parse Architecture for Optimized CV
 * 
 * This replaces the patching approach with a clean full parse.
 * The optimized CV text is parsed into a complete CVData object.
 * 
 * Section parsers have been extracted into separate modules:
 * - section-splitter.ts — splitIntoSections, normalizeHeader
 * - parse-experience.ts — parseExperienceSection, parseExperienceFromLines
 * - parse-education.ts — parseEducationSection
 * - parse-skills.ts — parseSkillsSection, parseLanguagesSection, extractLanguagesFromSkills, isLanguageEntry
 * - parse-other.ts — parseCertificationsSection, parseProjectsSection, parseAdditionalInfoSection
 */

import { CVData } from '../cv-templates/types';
import { splitIntoSections } from './section-splitter';
import { parseExperienceSection } from './parse-experience';
import { parseEducationSection } from './parse-education';
import { parseSkillsSection, parseLanguagesSection, extractLanguagesFromSkills } from './parse-skills';
import { parseCertificationsSection, parseProjectsSection, parseAdditionalInfoSection } from './parse-other';

/**
 * Parse the complete optimized CV text into a CVData object.
 * This replaces the patching approach with a clean full parse.
 */
export function parseOptimizedCVToData(
  optimizedText: string,
  originalCVData?: CVData
): CVData {
  // Start with original personal info (name, email, phone don't change)
  const personal = originalCVData?.personal || {
    fullName: '',
    email: '',
    phone: '',
  };

  // Parse each section from the optimized text
  const sections = splitIntoSections(optimizedText);
  
  console.log('[ParseOptimizedCV] Found sections:', Array.from(sections.keys()));

  // Extract personal info updates if present
  const personalUpdates = parsePersonalSection(sections, optimizedText);
  
  // Parse languages - first try dedicated section, then extract from skills
  let languages = parseLanguagesSection(sections);
  if (languages.length === 0) {
    // Fallback: extract languages from skills section (AI sometimes puts them there)
    languages = extractLanguagesFromSkills(sections);
    if (languages.length > 0) {
      console.log('[ParseOptimizedCV] Extracted', languages.length, 'languages from skills section');
    }
  }

  return {
    personal: {
      ...personal,
      ...personalUpdates,
    },
    summary: parseSummarySection(sections),
    experience: parseExperienceSection(sections, originalCVData?.experience),
    education: parseEducationSection(sections, originalCVData?.education),
    skills: parseSkillsSection(sections),
    languages,
    certifications: parseCertificationsSection(sections),
    projects: parseProjectsSection(sections),
    additionalInfo: parseAdditionalInfoSection(sections),
    signature: originalCVData?.signature,
  };
}

// ============================================
// SECTION PARSERS (kept in main file — small, orchestrator-specific)
// ============================================

function parsePersonalSection(
  sections: Map<string, string>,
  fullText: string
): Partial<CVData['personal']> {
  const updates: Partial<CVData['personal']> = {};
  
  // Find the first section start to get the header area
  let firstSectionStart = fullText.length;
  for (const content of sections.values()) {
    const idx = fullText.indexOf(content);
    if (idx > 0 && idx < firstSectionStart) {
      firstSectionStart = idx;
    }
  }
  
  const headerArea = fullText.slice(0, firstSectionStart);
  
  // Look for headline pattern in header area
  const lines = headerArea.split('\n').map(l => l.trim()).filter(Boolean);
  
  // Skip the name (first line) and look for title
  for (let i = 1; i < Math.min(lines.length, 5); i++) {
    const line = lines[i];
    
    // Skip contact info lines
    if (line.includes('@') || line.match(/^\+?\d[\d\s\-()]+$/) || line.match(/linkedin|github/i)) {
      continue;
    }
    
    // Check if it looks like a title (contains | or is short descriptive text)
    if (line.includes('|') || (line.length > 10 && line.length < 150)) {
      updates.currentTitle = line;
      break;
    }
  }
  
  return updates;
}

function parseSummarySection(sections: Map<string, string>): string | undefined {
  const content = sections.get('SUMMARY');
  if (!content) return undefined;
  
  // Clean up the summary text
  return content
    .replace(/^[\s\n]+/, '')  // Remove leading whitespace
    .replace(/[\s\n]+$/, '')  // Remove trailing whitespace
    .replace(/\n{3,}/g, '\n\n')  // Normalize multiple newlines
    .trim();
}
