/**
 * Full Re-parse Architecture for Optimized CV
 * 
 * This replaces the patching approach with a clean full parse.
 * The optimized CV text is parsed into a complete CVData object.
 */

import { CVData } from '../cv-templates/types';

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

/**
 * Split the CV text into named sections
 */
function splitIntoSections(text: string): Map<string, string> {
  const sections = new Map<string, string>();
  
  // Common section headers (case-insensitive)
  const sectionHeaders = [
    'PROFILE', 'PROFESSIONAL SUMMARY', 'SUMMARY', 'ABOUT', 'CAREER OBJECTIVE',
    'PROFESSIONAL EXPERIENCE', 'EXPERIENCE', 'WORK EXPERIENCE', 'EMPLOYMENT', 'WORK HISTORY',
    'EDUCATION', 'ACADEMIC BACKGROUND', 'QUALIFICATIONS',
    'KEY SKILLS', 'SKILLS', 'CORE COMPETENCIES', 'COMPETENCIES', 'TECHNICAL SKILLS', 'SKILLS & COMPETENCIES',
    'LANGUAGES', 'LANGUAGE SKILLS',
    'CERTIFICATIONS', 'CERTIFICATES', 'CREDENTIALS', 'LICENSES & CERTIFICATIONS',
    'PROJECTS', 'PERSONAL PROJECTS', 'KEY PROJECTS',
    'ADDITIONAL INFORMATION', 'ADDITIONAL', 'OTHER INFORMATION', 'OTHER',
  ];
  
  // Create regex pattern for section headers (must be on their own line)
  const headerPattern = new RegExp(
    `^\\s*(${sectionHeaders.join('|')})\\s*$`,
    'gim'
  );
  
  // Find all section boundaries
  const matches: { header: string; start: number; headerEnd: number }[] = [];
  let match;
  
  while ((match = headerPattern.exec(text)) !== null) {
    matches.push({
      header: match[1].toUpperCase().trim(),
      start: match.index,
      headerEnd: match.index + match[0].length,
    });
  }
  
  // Extract content between headers
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];
    
    const contentStart = current.headerEnd;
    const contentEnd = next ? next.start : text.length;
    const content = text.slice(contentStart, contentEnd).trim();
    
    // Normalize header names
    const normalizedHeader = normalizeHeader(current.header);
    
    // If we already have this section, append to it (for duplicates)
    if (sections.has(normalizedHeader)) {
      sections.set(normalizedHeader, sections.get(normalizedHeader) + '\n\n' + content);
    } else {
      sections.set(normalizedHeader, content);
    }
  }
  
  return sections;
}

function normalizeHeader(header: string): string {
  const normalized = header.toUpperCase().trim();
  
  // Map variations to standard names
  const mapping: Record<string, string> = {
    'PROFILE': 'SUMMARY',
    'PROFESSIONAL SUMMARY': 'SUMMARY',
    'ABOUT': 'SUMMARY',
    'CAREER OBJECTIVE': 'SUMMARY',
    'PROFESSIONAL EXPERIENCE': 'EXPERIENCE',
    'WORK EXPERIENCE': 'EXPERIENCE',
    'EMPLOYMENT': 'EXPERIENCE',
    'WORK HISTORY': 'EXPERIENCE',
    'ACADEMIC BACKGROUND': 'EDUCATION',
    'QUALIFICATIONS': 'EDUCATION',
    'KEY SKILLS': 'SKILLS',
    'CORE COMPETENCIES': 'SKILLS',
    'COMPETENCIES': 'SKILLS',
    'TECHNICAL SKILLS': 'SKILLS',
    'SKILLS & COMPETENCIES': 'SKILLS',
    'LANGUAGE SKILLS': 'LANGUAGES',
    'CERTIFICATES': 'CERTIFICATIONS',
    'CREDENTIALS': 'CERTIFICATIONS',
    'LICENSES & CERTIFICATIONS': 'CERTIFICATIONS',
    'PERSONAL PROJECTS': 'PROJECTS',
    'KEY PROJECTS': 'PROJECTS',
    'ADDITIONAL': 'ADDITIONAL INFORMATION',
    'OTHER INFORMATION': 'ADDITIONAL INFORMATION',
    'OTHER': 'ADDITIONAL INFORMATION',
  };
  
  return mapping[normalized] || normalized;
}

// ============================================
// SECTION PARSERS
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

function parseExperienceSection(
  sections: Map<string, string>,
  originalExperience?: CVData['experience']
): CVData['experience'] {
  const content = sections.get('EXPERIENCE');
  if (!content) return originalExperience || [];
  
  const experiences: CVData['experience'] = [];
  
  // Strategy: Split by patterns that indicate new job entries
  // A new entry starts with "Position | Company" pattern (contains pipe separator)
  
  const lines = content.split('\n');
  let currentEntry: {
    headerLines: string[];
    bullets: string[];
  } | null = null;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    
    // Check if this is a bullet point
    const isBullet = trimmedLine.startsWith('•') || 
                     trimmedLine.startsWith('-') || 
                     trimmedLine.startsWith('*') ||
                     trimmedLine.startsWith('–');
    
    if (isBullet) {
      // Add to current entry's bullets
      if (currentEntry) {
        const bulletText = trimmedLine.replace(/^[•\-\*–]\s*/, '').trim();
        if (bulletText.length > 5) {
          currentEntry.bullets.push(bulletText);
        }
      }
    } else {
      // Check if this is a NEW job entry (must have pipe separator = "Position | Company")
      // This is the key indicator that separates entries
      const isNewEntry = trimmedLine.includes('|') && 
                         !trimmedLine.startsWith('|') && 
                         trimmedLine.length > 10;
      
      if (isNewEntry) {
        // Save previous entry if exists
        if (currentEntry && currentEntry.headerLines.length > 0) {
          const parsed = parseExperienceFromLines(currentEntry.headerLines, currentEntry.bullets);
          if (parsed) experiences.push(parsed);
        }
        
        // Start new entry
        currentEntry = {
          headerLines: [trimmedLine],
          bullets: [],
        };
      } else if (currentEntry) {
        // This is additional info for current entry (date line, location, etc.)
        // Only add to header if we haven't started bullets yet
        if (currentEntry.bullets.length === 0) {
          // Check if it's a date line or other metadata
          const isDateLine = trimmedLine.match(/\d{4}/) || trimmedLine.match(/Present/i);
          const isShortLine = trimmedLine.length < 60 && !trimmedLine.endsWith('.');
          
          if (isDateLine || isShortLine) {
            currentEntry.headerLines.push(trimmedLine);
          }
        }
      }
    }
  }
  
  // Don't forget the last entry
  if (currentEntry && currentEntry.headerLines.length > 0) {
    const parsed = parseExperienceFromLines(currentEntry.headerLines, currentEntry.bullets);
    if (parsed) experiences.push(parsed);
  }
  
  // Deduplicate by company name (in case of parsing errors)
  const seen = new Set<string>();
  const deduped = experiences.filter(exp => {
    const key = `${exp.company.toLowerCase()}-${exp.position.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  console.log('[ParseOptimizedCV] Parsed', deduped.length, 'experience entries (after dedup)');
  
  return deduped.length > 0 ? deduped : (originalExperience || []);
}

function parseExperienceFromLines(
  headerLines: string[],
  bullets: string[]
): CVData['experience'][0] | null {
  if (headerLines.length === 0) return null;
  
  let position = '';
  let company = '';
  let location = '';
  let startDate = '';
  let endDate: string | undefined;
  
  // Process header lines
  for (const line of headerLines) {
    // Try to extract dates first
    const dateMatch = line.match(/(\w+\.?\s*\d{4}|\d{4})\s*[–\-—]\s*(\w+\.?\s*\d{4}|\d{4}|Present|Current)/i);
    if (dateMatch) {
      startDate = dateMatch[1].trim();
      endDate = dateMatch[2].trim();
    }
    
    // Try to parse "Position | Company" or "Position | Company, Location"
    if (line.includes('|')) {
      const parts = line.split('|').map(p => p.trim());
      
      // Remove dates from parts
      const cleanParts = parts.map(p => 
        p.replace(/(\w+\.?\s*\d{4}|\d{4})\s*[–\-—]\s*(\w+\.?\s*\d{4}|\d{4}|Present|Current)/i, '').trim()
      ).filter(p => p.length > 0);
      
      if (cleanParts.length >= 1 && !position) {
        position = cleanParts[0];
      }
      if (cleanParts.length >= 2 && !company) {
        // Company might include location: "Company, City"
        const companyPart = cleanParts[1];
        if (companyPart.includes(',')) {
          const companyParts = companyPart.split(',');
          company = companyParts[0].trim();
          location = companyParts.slice(1).join(',').trim();
        } else {
          company = companyPart;
        }
      }
      if (cleanParts.length >= 3 && !location) {
        location = cleanParts[2];
      }
    }
  }
  
  // Fallback: use first non-empty header line as position if not found
  if (!position && headerLines.length > 0) {
    position = headerLines[0].replace(/\|.*$/, '').trim();
  }
  
  // Clean up company name - remove "(Side Project)" etc.
  company = company.replace(/\s*\(Side Project\)/gi, '').trim();
  
  if (!position) return null;
  
  return {
    id: `exp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    position,
    company: company || '',
    location: location || undefined,
    startDate: startDate || '',
    endDate,
    current: endDate?.toLowerCase().includes('present') || endDate?.toLowerCase().includes('current'),
    bullets,
  };
}

function parseEducationSection(
  sections: Map<string, string>,
  original?: CVData['education']
): CVData['education'] {
  const content = sections.get('EDUCATION');
  
  // Education rarely changes significantly, use original if no content
  if (!content) return original || [];
  
  const education: CVData['education'] = [];
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  
  let currentEntry: Partial<CVData['education'][0]> & { highlights: string[] } = { highlights: [] };
  
  for (const line of lines) {
    // Check if it's a bullet point (highlight)
    if (line.startsWith('•') || line.startsWith('-')) {
      const highlight = line.replace(/^[•\-]\s*/, '').trim();
      if (highlight) currentEntry.highlights.push(highlight);
      continue;
    }
    
    // Check if this looks like a new education entry
    const hasDate = line.match(/\d{4}/);
    const hasDegree = line.match(/bachelor|master|abitur|diploma|degree|certificate|bsc|msc|ba|ma|phd/i);
    const hasInstitution = line.match(/university|school|college|hochschule|institut|academy/i);
    
    // If we have a date and already have some entry data, this might be a new entry
    if (hasDate && (currentEntry.degree || currentEntry.institution)) {
      // Save current entry
      if (currentEntry.degree || currentEntry.institution) {
        education.push({
          id: `edu-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          degree: currentEntry.degree || '',
          institution: currentEntry.institution || '',
          field: currentEntry.field,
          location: currentEntry.location,
          startDate: currentEntry.startDate,
          endDate: currentEntry.endDate,
          grade: currentEntry.grade,
          highlights: currentEntry.highlights.length > 0 ? currentEntry.highlights : undefined,
        });
      }
      currentEntry = { highlights: [] };
    }
    
    // Extract degree
    if (hasDegree && !currentEntry.degree) {
      currentEntry.degree = line;
    }
    // Extract institution
    else if (hasInstitution && !currentEntry.institution) {
      currentEntry.institution = line;
    }
    // Extract date
    else if (hasDate) {
      const yearMatch = line.match(/(\d{4})\s*[–\-]?\s*(\d{4})?/);
      if (yearMatch) {
        currentEntry.startDate = yearMatch[1];
        currentEntry.endDate = yearMatch[2] || yearMatch[1];
      }
    }
  }
  
  // Add last entry
  if (currentEntry.degree || currentEntry.institution) {
    education.push({
      id: `edu-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      degree: currentEntry.degree || '',
      institution: currentEntry.institution || '',
      field: currentEntry.field,
      location: currentEntry.location,
      startDate: currentEntry.startDate,
      endDate: currentEntry.endDate,
      grade: currentEntry.grade,
      highlights: currentEntry.highlights.length > 0 ? currentEntry.highlights : undefined,
    });
  }
  
  console.log('[ParseOptimizedCV] Parsed', education.length, 'education entries');
  
  return education.length > 0 ? education : (original || []);
}

/**
 * Check if a string looks like a language entry
 */
function isLanguageEntry(text: string): boolean {
  const languagePatterns = [
    /^(german|deutsch|english|englisch|french|français|spanish|español|italian|italiano|portuguese|português|russian|chinese|mandarin|japanese|korean|arabic|persian|farsi|dari|urdu|hindi|turkish|polish|dutch|swedish|norwegian|danish|finnish|greek|hebrew|vietnamese|thai|indonesian|malay)/i,
    /\b(native|fluent|proficient|intermediate|beginner|basic|advanced|B1|B2|C1|C2|A1|A2|muttersprache|verhandlungssicher|fließend|grundkenntnisse)\b/i,
  ];
  
  return languagePatterns.some(pattern => pattern.test(text));
}

/**
 * Parse skills section and extract languages separately
 */
function parseSkillsSection(sections: Map<string, string>): CVData['skills'] {
  const content = sections.get('SKILLS');
  if (!content) return [];
  
  const skills: CVData['skills'] = [];
  
  // Look for category patterns: "Category Name:" or "**Category Name:**"
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  
  for (const line of lines) {
    // Skip lines that look like languages (they'll be extracted separately)
    if (isLanguageEntry(line)) continue;
    
    // Pattern: "Category Name: skill1, skill2, skill3" or "**Category:** skill1, skill2"
    const categoryMatch = line.match(/^\*?\*?([A-Za-z\s&\/\-]+)\*?\*?\s*:\s*(.+)$/);
    
    if (categoryMatch) {
      const category = categoryMatch[1].trim();
      const itemsText = categoryMatch[2].trim();
      
      // Split items by comma, bullet, or other separators
      const items = itemsText
        .split(/[,•·]/)
        .map(i => i.trim().replace(/^\*\*|\*\*$/g, ''))  // Remove markdown bold
        .filter(i => i.length > 0 && i.length < 100)
        .filter(i => !isLanguageEntry(i));  // Filter out language entries
      
      if (items.length > 0) {
        skills.push({ category, items });
      }
    }
  }
  
  // If no categories found, try to parse as flat list
  if (skills.length === 0) {
    const allItems = content
      .split(/[,\n•·]/)
      .map(i => i.trim())
      .filter(i => i.length > 0 && i.length < 100 && !i.includes(':'))
      .filter(i => !isLanguageEntry(i));  // Filter out language entries
    
    if (allItems.length > 0) {
      // Group into chunks of 6-8 for display
      const chunkSize = 6;
      for (let i = 0; i < allItems.length; i += chunkSize) {
        skills.push({
          category: '',
          items: allItems.slice(i, i + chunkSize),
        });
      }
    }
  }
  
  console.log('[ParseOptimizedCV] Parsed', skills.length, 'skill categories');
  
  return skills;
}

/**
 * Extract languages from skills section content
 */
function extractLanguagesFromSkills(sections: Map<string, string>): CVData['languages'] {
  const content = sections.get('SKILLS');
  if (!content) return [];
  
  const languages: CVData['languages'] = [];
  
  // Split by lines and look for language patterns
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  
  for (const line of lines) {
    if (!isLanguageEntry(line)) continue;
    
    // Pattern 1: "Language (Level)" - e.g., "German (B2 Certified – Verhandlungssicher)"
    const parenMatch = line.match(/^([^(]+)\s*\(([^)]+)\)/);
    if (parenMatch) {
      languages.push({
        language: parenMatch[1].trim(),
        proficiency: parenMatch[2].trim(),
      });
      continue;
    }
    
    // Pattern 2: "Language – Level" or "Language - Level"
    const dashMatch = line.match(/^(.+?)\s*[–\-—]\s*(.+)$/);
    if (dashMatch && !dashMatch[1].includes('(')) {
      languages.push({
        language: dashMatch[1].trim(),
        proficiency: dashMatch[2].trim(),
      });
      continue;
    }
    
    // Pattern 3: Just "Language (Level)" at end of line
    if (line.length > 2 && line.length < 80) {
      languages.push({
        language: line,
        proficiency: '',
      });
    }
  }
  
  return languages;
}

function parseLanguagesSection(sections: Map<string, string>): CVData['languages'] {
  const content = sections.get('LANGUAGES');
  if (!content) return [];
  
  const languages: CVData['languages'] = [];
  
  // Split by common separators
  const entries = content.split(/[,\n•]/).map(e => e.trim()).filter(Boolean);
  
  for (const entry of entries) {
    // Skip section headers
    if (entry.toUpperCase() === 'LANGUAGES' || entry.toUpperCase() === 'LANGUAGE SKILLS') continue;
    
    // Pattern 1: "Language (Level)" - e.g., "German (B2 Certified – Verhandlungssicher)"
    const parenMatch = entry.match(/^([^(]+)\s*\(([^)]+)\)/);
    if (parenMatch) {
      languages.push({
        language: parenMatch[1].trim(),
        proficiency: parenMatch[2].trim(),
      });
      continue;
    }
    
    // Pattern 2: "Language – Level" or "Language - Level" or "Language — Level"
    const dashMatch = entry.match(/^(.+?)\s*[–\-—]\s*(.+)$/);
    if (dashMatch && !dashMatch[1].includes('(')) {
      languages.push({
        language: dashMatch[1].trim(),
        proficiency: dashMatch[2].trim(),
      });
      continue;
    }
    
    // Pattern 3: Just language name (if short enough)
    if (entry.length > 2 && entry.length < 50) {
      languages.push({
        language: entry,
        proficiency: '',
      });
    }
  }
  
  console.log('[ParseOptimizedCV] Parsed', languages.length, 'languages');
  
  return languages;
}

function parseCertificationsSection(sections: Map<string, string>): CVData['certifications'] {
  const content = sections.get('CERTIFICATIONS');
  if (!content) return [];
  
  const certifications: CVData['certifications'] = [];
  
  // Split by bullet points or newlines
  const entries = content.split(/[•\n]/).map(e => e.trim()).filter(e => e.length > 5);
  
  for (const entry of entries) {
    // Skip section headers
    if (entry.toUpperCase() === 'CERTIFICATIONS' || entry.toUpperCase() === 'CERTIFICATES') continue;
    
    let name = entry;
    let issuer = '';
    let date = '';
    
    // Pattern 1: "Name – Issuer | Date (Score)" - keep everything including score
    const fullMatch = entry.match(/^(.+?)\s*[–\-—]\s*(.+?)(?:\s*\|\s*(.+))?$/);
    if (fullMatch) {
      name = fullMatch[1].replace(/^[•\-]\s*/, '').trim();
      issuer = fullMatch[2].trim();
      date = fullMatch[3]?.trim() || '';
    } else {
      // Pattern 2: Try parentheses format: "Name (Issuer)"
      const issuerMatch = entry.match(/^(.+?)\s*\(([^)]+)\)/);
      if (issuerMatch) {
        name = issuerMatch[1].replace(/^[•\-]\s*/, '').trim();
        // Check if it's actually a score in parentheses
        if (!issuerMatch[2].match(/\d+%|\d+\/\d+/)) {
          issuer = issuerMatch[2].trim();
        }
      }
    }
    
    // Clean up name
    name = name.replace(/^[•\-]\s*/, '').trim();
    
    if (name.length > 3) {
      certifications.push({
        id: `cert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        issuer,
        date: date || undefined,
      });
    }
  }
  
  console.log('[ParseOptimizedCV] Parsed', certifications.length, 'certifications');
  
  return certifications;
}

function parseProjectsSection(sections: Map<string, string>): CVData['projects'] | undefined {
  const content = sections.get('PROJECTS');
  if (!content) return undefined;
  
  const projects: NonNullable<CVData['projects']> = [];
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  
  let currentProject: {
    name: string;
    description: string;
    bullets: string[];
    technologies: string[];
    url?: string;
  } | null = null;
  
  for (const line of lines) {
    // Check if it's a bullet point
    if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
      const bullet = line.replace(/^[•\-\*]\s*/, '').trim();
      if (currentProject && bullet) {
        currentProject.bullets.push(bullet);
      }
    } else if (line.length > 0 && line.length < 150) {
      // New project header
      if (currentProject && currentProject.name) {
        projects.push({
          id: `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: currentProject.name,
          description: currentProject.bullets.join(' ') || currentProject.description,
          technologies: currentProject.technologies,
          url: currentProject.url,
        });
      }
      currentProject = {
        name: line,
        description: '',
        bullets: [],
        technologies: [],
      };
    }
  }
  
  // Add last project
  if (currentProject && currentProject.name) {
    projects.push({
      id: `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: currentProject.name,
      description: currentProject.bullets.join(' ') || currentProject.description,
      technologies: currentProject.technologies,
      url: currentProject.url,
    });
  }
  
  console.log('[ParseOptimizedCV] Parsed', projects.length, 'projects');
  
  return projects.length > 0 ? projects : undefined;
}

function parseAdditionalInfoSection(sections: Map<string, string>): string[] | undefined {
  const content = sections.get('ADDITIONAL INFORMATION');
  if (!content) return undefined;
  
  // Split by common separators and clean up
  const items = content
    .split(/[,\n•]/)
    .map(i => i.trim())
    .filter(i => i.length > 2 && i.length < 200)
    .filter(i => !i.match(/^additional\s+information$/i));
  
  // Deduplicate
  const unique = [...new Set(items)];
  
  console.log('[ParseOptimizedCV] Parsed', unique.length, 'additional info items');
  
  return unique.length > 0 ? unique : undefined;
}
