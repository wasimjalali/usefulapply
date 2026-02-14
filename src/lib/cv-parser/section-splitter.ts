/**
 * Section Splitter — Split CV text into named sections
 * 
 * Extracted from parse-optimized-cv.ts for modularity.
 * Handles both English and German section headers.
 */

/**
 * Split the CV text into named sections
 */
export function splitIntoSections(text: string): Map<string, string> {
  const sections = new Map<string, string>();
  
  // Common section headers (case-insensitive) - includes both English AND German
  const sectionHeaders = [
    // Profile/Summary (EN + DE)
    'PROFILE', 'PROFIL', 'PROFESSIONAL SUMMARY', 'SUMMARY', 'ABOUT', 'CAREER OBJECTIVE',
    'ZUSAMMENFASSUNG', 'ÜBER MICH', 'KURZPROFIL',
    // Experience (EN + DE)
    'PROFESSIONAL EXPERIENCE', 'EXPERIENCE', 'WORK EXPERIENCE', 'EMPLOYMENT', 'WORK HISTORY',
    'BERUFSERFAHRUNG', 'BERUFLICHE ERFAHRUNG', 'ARBEITSERFAHRUNG', 'WERDEGANG',
    // Education (EN + DE)
    'EDUCATION', 'ACADEMIC BACKGROUND', 'QUALIFICATIONS',
    'AUSBILDUNG', 'BILDUNG', 'AKADEMISCHE AUSBILDUNG', 'STUDIUM',
    // Skills (EN + DE)
    'KEY SKILLS', 'SKILLS', 'CORE COMPETENCIES', 'COMPETENCIES', 'TECHNICAL SKILLS', 'SKILLS & COMPETENCIES',
    'FÄHIGKEITEN', 'KENNTNISSE', 'KOMPETENZEN', 'KERNKOMPETENZEN', 'TECHNISCHE FÄHIGKEITEN',
    // Languages (EN + DE)
    'LANGUAGES', 'LANGUAGE SKILLS',
    'SPRACHEN', 'SPRACHKENNTNISSE',
    // Certifications (EN + DE)
    'CERTIFICATIONS', 'CERTIFICATES', 'CREDENTIALS', 'LICENSES & CERTIFICATIONS',
    'ZERTIFIKATE', 'ZERTIFIZIERUNGEN', 'LIZENZEN',
    // Projects (EN + DE)
    'PROJECTS', 'PERSONAL PROJECTS', 'KEY PROJECTS',
    'PROJEKTE', 'PERSÖNLICHE PROJEKTE',
    // Additional (EN + DE)
    'ADDITIONAL INFORMATION', 'ADDITIONAL', 'OTHER INFORMATION', 'OTHER',
    'ZUSÄTZLICHE INFORMATIONEN', 'WEITERE INFORMATIONEN', 'SONSTIGES',
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

export function normalizeHeader(header: string): string {
  const normalized = header.toUpperCase().trim();
  
  // Map variations to standard names (English AND German)
  const mapping: Record<string, string> = {
    // Summary/Profile mappings
    'PROFILE': 'SUMMARY',
    'PROFIL': 'SUMMARY',
    'PROFESSIONAL SUMMARY': 'SUMMARY',
    'ABOUT': 'SUMMARY',
    'CAREER OBJECTIVE': 'SUMMARY',
    'ZUSAMMENFASSUNG': 'SUMMARY',
    'ÜBER MICH': 'SUMMARY',
    'KURZPROFIL': 'SUMMARY',
    // Experience mappings
    'PROFESSIONAL EXPERIENCE': 'EXPERIENCE',
    'WORK EXPERIENCE': 'EXPERIENCE',
    'EMPLOYMENT': 'EXPERIENCE',
    'WORK HISTORY': 'EXPERIENCE',
    'BERUFSERFAHRUNG': 'EXPERIENCE',
    'BERUFLICHE ERFAHRUNG': 'EXPERIENCE',
    'ARBEITSERFAHRUNG': 'EXPERIENCE',
    'WERDEGANG': 'EXPERIENCE',
    // Education mappings
    'ACADEMIC BACKGROUND': 'EDUCATION',
    'QUALIFICATIONS': 'EDUCATION',
    'AUSBILDUNG': 'EDUCATION',
    'BILDUNG': 'EDUCATION',
    'AKADEMISCHE AUSBILDUNG': 'EDUCATION',
    'STUDIUM': 'EDUCATION',
    // Skills mappings
    'KEY SKILLS': 'SKILLS',
    'CORE COMPETENCIES': 'SKILLS',
    'COMPETENCIES': 'SKILLS',
    'TECHNICAL SKILLS': 'SKILLS',
    'SKILLS & COMPETENCIES': 'SKILLS',
    'FÄHIGKEITEN': 'SKILLS',
    'KENNTNISSE': 'SKILLS',
    'KOMPETENZEN': 'SKILLS',
    'KERNKOMPETENZEN': 'SKILLS',
    'TECHNISCHE FÄHIGKEITEN': 'SKILLS',
    // Languages mappings
    'LANGUAGE SKILLS': 'LANGUAGES',
    'SPRACHEN': 'LANGUAGES',
    'SPRACHKENNTNISSE': 'LANGUAGES',
    // Certifications mappings
    'CERTIFICATES': 'CERTIFICATIONS',
    'CREDENTIALS': 'CERTIFICATIONS',
    'LICENSES & CERTIFICATIONS': 'CERTIFICATIONS',
    'ZERTIFIKATE': 'CERTIFICATIONS',
    'ZERTIFIZIERUNGEN': 'CERTIFICATIONS',
    'LIZENZEN': 'CERTIFICATIONS',
    // Projects mappings
    'PERSONAL PROJECTS': 'PROJECTS',
    'KEY PROJECTS': 'PROJECTS',
    'PROJEKTE': 'PROJECTS',
    'PERSÖNLICHE PROJEKTE': 'PROJECTS',
    // Additional info mappings
    'ADDITIONAL': 'ADDITIONAL INFORMATION',
    'OTHER INFORMATION': 'ADDITIONAL INFORMATION',
    'OTHER': 'ADDITIONAL INFORMATION',
    'ZUSÄTZLICHE INFORMATIONEN': 'ADDITIONAL INFORMATION',
    'WEITERE INFORMATIONEN': 'ADDITIONAL INFORMATION',
    'SONSTIGES': 'ADDITIONAL INFORMATION',
  };
  
  return mapping[normalized] || normalized;
}
