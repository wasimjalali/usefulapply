/**
 * Section Splitter — Split CV text into named sections
 *
 * Extracted from parse-optimized-cv.ts for modularity.
 * Handles multilingual section headers (EN, DE, FR, ES, PT, IT, NL).
 * Also detects the CV's language from its section headers and generates
 * localized sectionHeaders + localizedStrings for template rendering.
 */

/**
 * Split the CV text into named sections
 */
export function splitIntoSections(text: string): Map<string, string> {
  const sections = new Map<string, string>();
  
  // Common section headers (case-insensitive) - multilingual
  const sectionHeaders = [
    // Profile/Summary (EN + DE + FR + ES + PT + IT + NL)
    'PROFILE', 'PROFIL', 'PROFESSIONAL SUMMARY', 'SUMMARY', 'ABOUT', 'ABOUT ME', 'CAREER OBJECTIVE',
    'ZUSAMMENFASSUNG', 'ÜBER MICH', 'KURZPROFIL',
    'PROFIL PROFESSIONNEL', 'RÉSUMÉ', 'RÉSUMÉ PROFESSIONNEL',
    'PERFIL', 'PERFIL PROFESIONAL', 'RESUMEN', 'RESUMEN PROFESIONAL', 'OBJETIVO',
    'RESUMO', 'RESUMO PROFISSIONAL', 'PERFIL PROFISSIONAL',
    'PROFILO', 'PROFILO PROFESSIONALE', 'RIEPILOGO',
    'PROFIEL', 'SAMENVATTING',
    // Experience (EN + DE + FR + ES + PT + IT + NL)
    'PROFESSIONAL EXPERIENCE', 'EXPERIENCE', 'WORK EXPERIENCE', 'EMPLOYMENT', 'WORK HISTORY',
    'BERUFSERFAHRUNG', 'BERUFLICHE ERFAHRUNG', 'ARBEITSERFAHRUNG', 'WERDEGANG',
    'BERUFLICHER WERDEGANG', 'TÄTIGKEITEN', 'BERUFLICHE TÄTIGKEITEN', 'PRAXISERFAHRUNG',
    'EXPÉRIENCE PROFESSIONNELLE', 'EXPÉRIENCE', 'EXPÉRIENCES',
    'EXPERIENCIA PROFESIONAL', 'EXPERIENCIA LABORAL', 'EXPERIENCIA',
    'EXPERIÊNCIA PROFISSIONAL', 'EXPERIÊNCIA',
    'ESPERIENZA PROFESSIONALE', 'ESPERIENZA LAVORATIVA', 'ESPERIENZA',
    'WERKERVARING', 'ERVARING',
    // Education (EN + DE + FR + ES + PT + IT + NL)
    'EDUCATION', 'ACADEMIC BACKGROUND', 'QUALIFICATIONS',
    'AUSBILDUNG', 'BILDUNG', 'AKADEMISCHE AUSBILDUNG', 'STUDIUM',
    'FORMATION', 'ÉTUDES', 'PARCOURS ACADÉMIQUE',
    'EDUCACIÓN', 'FORMACIÓN', 'FORMACIÓN ACADÉMICA', 'ESTUDIOS',
    'EDUCAÇÃO', 'FORMAÇÃO', 'FORMAÇÃO ACADÊMICA',
    'ISTRUZIONE', 'FORMAZIONE',
    'OPLEIDING', 'ONDERWIJS',
    // Skills (EN + DE + FR + ES + PT + IT + NL)
    'KEY SKILLS', 'SKILLS', 'CORE COMPETENCIES', 'COMPETENCIES', 'TECHNICAL SKILLS', 'SKILLS & COMPETENCIES',
    'FÄHIGKEITEN', 'KENNTNISSE', 'KOMPETENZEN', 'KERNKOMPETENZEN', 'TECHNISCHE FÄHIGKEITEN',
    'QUALIFIKATIONEN', 'SCHLÜSSELQUALIFIKATIONEN', 'IT-KENNTNISSE', 'EDV-KENNTNISSE',
    'COMPÉTENCES', 'COMPÉTENCES CLÉS', 'COMPÉTENCES TECHNIQUES',
    'HABILIDADES', 'COMPETENCIAS', 'APTITUDES',
    'HABILIDADES', 'COMPETÊNCIAS',
    'COMPETENZE', 'COMPETENZE TECNICHE',
    'VAARDIGHEDEN', 'COMPETENTIES',
    // Languages (EN + DE + FR + ES + PT + IT + NL)
    'LANGUAGES', 'LANGUAGE SKILLS',
    'SPRACHEN', 'SPRACHKENNTNISSE',
    'LANGUES', 'COMPÉTENCES LINGUISTIQUES',
    'IDIOMAS',
    'LÍNGUAS',
    'LINGUE', 'COMPETENZE LINGUISTICHE',
    'TALEN',
    // Certifications (EN + DE + FR + ES + PT + IT + NL)
    'CERTIFICATIONS', 'CERTIFICATES', 'CREDENTIALS', 'LICENSES & CERTIFICATIONS',
    'ZERTIFIKATE', 'ZERTIFIZIERUNGEN', 'LIZENZEN', 'WEITERBILDUNGEN', 'FORTBILDUNGEN',
    'CERTIFICATIONS', 'CERTIFICATS',
    'CERTIFICACIONES', 'CERTIFICADOS',
    'CERTIFICAÇÕES', 'CERTIFICADOS',
    'CERTIFICAZIONI',
    'CERTIFICATEN',
    // Projects (EN + DE + FR + ES + PT + IT + NL)
    'PROJECTS', 'PERSONAL PROJECTS', 'KEY PROJECTS',
    'PROJEKTE', 'PERSÖNLICHE PROJEKTE',
    'PROJETS',
    'PROYECTOS',
    'PROJETOS',
    'PROGETTI',
    'PROJECTEN',
    // Additional / Volunteer / Awards / Interests (EN + DE + FR + ES + PT + IT + NL)
    'ADDITIONAL INFORMATION', 'ADDITIONAL', 'OTHER INFORMATION', 'OTHER',
    'ZUSÄTZLICHE INFORMATIONEN', 'WEITERE INFORMATIONEN', 'SONSTIGES',
    'INFORMATIONS COMPLÉMENTAIRES', 'DIVERS',
    'INFORMACIÓN ADICIONAL', 'OTROS',
    'INFORMAÇÕES ADICIONAIS',
    'INFORMAZIONI AGGIUNTIVE', 'ALTRO',
    'OVERIGE INFORMATIE', 'OVERIG',
    // Volunteer / Leadership / Community (multi-lang)
    'VOLUNTEER', 'VOLUNTEER EXPERIENCE', 'VOLUNTEERING',
    'EHRENAMT', 'EHRENAMTLICHE TÄTIGKEITEN',
    'BÉNÉVOLAT',
    'VOLUNTARIADO',
    'LEADERSHIP & ACTIVITIES', 'BOARD & COMMUNITY INVOLVEMENT',
    // Achievements / Awards / Highlights (multi-lang)
    'AWARDS', 'HONORS', 'ACHIEVEMENTS', 'SELECTED ACHIEVEMENTS', 'CAREER HIGHLIGHTS',
    'AUSZEICHNUNGEN', 'PREISE',
    'PRIX', 'DISTINCTIONS',
    'PREMIOS', 'LOGROS',
    // Publications / Presentations (multi-lang)
    'PUBLICATIONS', 'PUBLIKATIONEN', 'VERÖFFENTLICHUNGEN',
    'CONFERENCE PRESENTATIONS', 'PRESENTATIONS',
    // Teaching (multi-lang)
    'TEACHING EXPERIENCE', 'TEACHING',
    'LEHRERFAHRUNG',
    // Research (multi-lang)
    'RESEARCH INTERESTS', 'RESEARCH EXPERIENCE',
    'FORSCHUNG', 'FORSCHUNGSINTERESSEN',
    // Interests / Hobbies (multi-lang)
    'INTERESTS', 'HOBBIES', 'HOBBIES & INTERESTS',
    'INTERESSEN', 'HOBBYS',
    'CENTRES D\'INTÉRÊT', 'LOISIRS',
    // References (multi-lang)
    'REFERENCIAS', 'REFERENCES', 'REFERENZEN', 'REFEREES',
    // Coursework
    'RELEVANT COURSEWORK', 'COURSEWORK',
    // Portfolio / Engagements
    'PORTFOLIO', 'SELECT ENGAGEMENTS', 'SELECTED WORK',
  ];

  // Create regex pattern for section headers (must be on their own line)
  // Allow optional trailing colon, dash, or pipe after header text
  const escapedHeaders = sectionHeaders.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const headerPattern = new RegExp(
    `^\\s*(${escapedHeaders.join('|')})\\s*[:\\-–—|]?\\s*$`,
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
  // Strip trailing colon/dash that may have been captured
  const normalized = header.toUpperCase().trim().replace(/[:\-–—|]+$/, '').trim();

  // Map all variations to standard normalized names
  const mapping: Record<string, string> = {
    // Summary/Profile — all languages
    'PROFILE': 'SUMMARY', 'PROFIL': 'SUMMARY', 'PROFESSIONAL SUMMARY': 'SUMMARY',
    'ABOUT': 'SUMMARY', 'ABOUT ME': 'SUMMARY', 'CAREER OBJECTIVE': 'SUMMARY',
    'ZUSAMMENFASSUNG': 'SUMMARY', 'ÜBER MICH': 'SUMMARY', 'KURZPROFIL': 'SUMMARY',
    'PROFIL PROFESSIONNEL': 'SUMMARY', 'RÉSUMÉ': 'SUMMARY', 'RÉSUMÉ PROFESSIONNEL': 'SUMMARY',
    'PERFIL': 'SUMMARY', 'PERFIL PROFESIONAL': 'SUMMARY', 'RESUMEN': 'SUMMARY',
    'RESUMEN PROFESIONAL': 'SUMMARY', 'OBJETIVO': 'SUMMARY',
    'RESUMO': 'SUMMARY', 'RESUMO PROFISSIONAL': 'SUMMARY', 'PERFIL PROFISSIONAL': 'SUMMARY',
    'PROFILO': 'SUMMARY', 'PROFILO PROFESSIONALE': 'SUMMARY', 'RIEPILOGO': 'SUMMARY',
    'PROFIEL': 'SUMMARY', 'SAMENVATTING': 'SUMMARY',
    // Experience — all languages
    'PROFESSIONAL EXPERIENCE': 'EXPERIENCE', 'WORK EXPERIENCE': 'EXPERIENCE',
    'EMPLOYMENT': 'EXPERIENCE', 'WORK HISTORY': 'EXPERIENCE',
    'BERUFSERFAHRUNG': 'EXPERIENCE', 'BERUFLICHE ERFAHRUNG': 'EXPERIENCE',
    'ARBEITSERFAHRUNG': 'EXPERIENCE', 'WERDEGANG': 'EXPERIENCE',
    'BERUFLICHER WERDEGANG': 'EXPERIENCE', 'TÄTIGKEITEN': 'EXPERIENCE',
    'BERUFLICHE TÄTIGKEITEN': 'EXPERIENCE', 'PRAXISERFAHRUNG': 'EXPERIENCE',
    'EXPÉRIENCE PROFESSIONNELLE': 'EXPERIENCE', 'EXPÉRIENCE': 'EXPERIENCE', 'EXPÉRIENCES': 'EXPERIENCE',
    'EXPERIENCIA PROFESIONAL': 'EXPERIENCE', 'EXPERIENCIA LABORAL': 'EXPERIENCE', 'EXPERIENCIA': 'EXPERIENCE',
    'EXPERIÊNCIA PROFISSIONAL': 'EXPERIENCE', 'EXPERIÊNCIA': 'EXPERIENCE',
    'ESPERIENZA PROFESSIONALE': 'EXPERIENCE', 'ESPERIENZA LAVORATIVA': 'EXPERIENCE', 'ESPERIENZA': 'EXPERIENCE',
    'WERKERVARING': 'EXPERIENCE', 'ERVARING': 'EXPERIENCE',
    // Education — all languages
    'ACADEMIC BACKGROUND': 'EDUCATION', 'QUALIFICATIONS': 'EDUCATION',
    'AUSBILDUNG': 'EDUCATION', 'BILDUNG': 'EDUCATION',
    'AKADEMISCHE AUSBILDUNG': 'EDUCATION', 'STUDIUM': 'EDUCATION',
    'FORMATION': 'EDUCATION', 'ÉTUDES': 'EDUCATION', 'PARCOURS ACADÉMIQUE': 'EDUCATION',
    'EDUCACIÓN': 'EDUCATION', 'FORMACIÓN': 'EDUCATION', 'FORMACIÓN ACADÉMICA': 'EDUCATION', 'ESTUDIOS': 'EDUCATION',
    'EDUCAÇÃO': 'EDUCATION', 'FORMAÇÃO': 'EDUCATION', 'FORMAÇÃO ACADÊMICA': 'EDUCATION',
    'ISTRUZIONE': 'EDUCATION', 'FORMAZIONE': 'EDUCATION',
    'OPLEIDING': 'EDUCATION', 'ONDERWIJS': 'EDUCATION',
    // Skills — all languages
    'KEY SKILLS': 'SKILLS', 'CORE COMPETENCIES': 'SKILLS', 'COMPETENCIES': 'SKILLS',
    'TECHNICAL SKILLS': 'SKILLS', 'SKILLS & COMPETENCIES': 'SKILLS',
    'FÄHIGKEITEN': 'SKILLS', 'KENNTNISSE': 'SKILLS', 'KOMPETENZEN': 'SKILLS',
    'KERNKOMPETENZEN': 'SKILLS', 'TECHNISCHE FÄHIGKEITEN': 'SKILLS',
    'QUALIFIKATIONEN': 'SKILLS', 'SCHLÜSSELQUALIFIKATIONEN': 'SKILLS',
    'IT-KENNTNISSE': 'SKILLS', 'EDV-KENNTNISSE': 'SKILLS',
    'COMPÉTENCES': 'SKILLS', 'COMPÉTENCES CLÉS': 'SKILLS', 'COMPÉTENCES TECHNIQUES': 'SKILLS',
    'HABILIDADES': 'SKILLS', 'COMPETENCIAS': 'SKILLS', 'APTITUDES': 'SKILLS',
    'COMPETÊNCIAS': 'SKILLS',
    'COMPETENZE': 'SKILLS', 'COMPETENZE TECNICHE': 'SKILLS',
    'VAARDIGHEDEN': 'SKILLS', 'COMPETENTIES': 'SKILLS',
    // Languages — all languages
    'LANGUAGE SKILLS': 'LANGUAGES',
    'SPRACHEN': 'LANGUAGES', 'SPRACHKENNTNISSE': 'LANGUAGES',
    'LANGUES': 'LANGUAGES', 'COMPÉTENCES LINGUISTIQUES': 'LANGUAGES',
    'IDIOMAS': 'LANGUAGES',
    'LÍNGUAS': 'LANGUAGES',
    'LINGUE': 'LANGUAGES', 'COMPETENZE LINGUISTICHE': 'LANGUAGES',
    'TALEN': 'LANGUAGES',
    // Certifications — all languages
    'CERTIFICATES': 'CERTIFICATIONS', 'CREDENTIALS': 'CERTIFICATIONS',
    'LICENSES & CERTIFICATIONS': 'CERTIFICATIONS',
    'ZERTIFIKATE': 'CERTIFICATIONS', 'ZERTIFIZIERUNGEN': 'CERTIFICATIONS',
    'LIZENZEN': 'CERTIFICATIONS', 'WEITERBILDUNGEN': 'CERTIFICATIONS',
    'FORTBILDUNGEN': 'CERTIFICATIONS',
    'CERTIFICATS': 'CERTIFICATIONS',
    'CERTIFICACIONES': 'CERTIFICATIONS', 'CERTIFICADOS': 'CERTIFICATIONS',
    'CERTIFICAÇÕES': 'CERTIFICATIONS',
    'CERTIFICAZIONI': 'CERTIFICATIONS',
    'CERTIFICATEN': 'CERTIFICATIONS',
    // Projects — all languages
    'PERSONAL PROJECTS': 'PROJECTS', 'KEY PROJECTS': 'PROJECTS',
    'PROJEKTE': 'PROJECTS', 'PERSÖNLICHE PROJEKTE': 'PROJECTS',
    'PROJETS': 'PROJECTS',
    'PROYECTOS': 'PROJECTS',
    'PROJETOS': 'PROJECTS',
    'PROGETTI': 'PROJECTS',
    'PROJECTEN': 'PROJECTS',
    // Additional info — all languages
    'ADDITIONAL': 'ADDITIONAL INFORMATION', 'OTHER INFORMATION': 'ADDITIONAL INFORMATION',
    'OTHER': 'ADDITIONAL INFORMATION',
    'ZUSÄTZLICHE INFORMATIONEN': 'ADDITIONAL INFORMATION', 'WEITERE INFORMATIONEN': 'ADDITIONAL INFORMATION',
    'SONSTIGES': 'ADDITIONAL INFORMATION',
    'INFORMATIONS COMPLÉMENTAIRES': 'ADDITIONAL INFORMATION', 'DIVERS': 'ADDITIONAL INFORMATION',
    'INFORMACIÓN ADICIONAL': 'ADDITIONAL INFORMATION', 'OTROS': 'ADDITIONAL INFORMATION',
    'INFORMAÇÕES ADICIONAIS': 'ADDITIONAL INFORMATION',
    'INFORMAZIONI AGGIUNTIVE': 'ADDITIONAL INFORMATION', 'ALTRO': 'ADDITIONAL INFORMATION',
    'OVERIGE INFORMATIE': 'ADDITIONAL INFORMATION', 'OVERIG': 'ADDITIONAL INFORMATION',
    // Volunteer — keep distinct
    'VOLUNTEER': 'VOLUNTEER', 'VOLUNTEER EXPERIENCE': 'VOLUNTEER',
    'VOLUNTEERING': 'VOLUNTEER',
    'EHRENAMT': 'VOLUNTEER', 'EHRENAMTLICHE TÄTIGKEITEN': 'VOLUNTEER',
    'BÉNÉVOLAT': 'VOLUNTEER',
    'VOLUNTARIADO': 'VOLUNTEER',
    'LEADERSHIP & ACTIVITIES': 'VOLUNTEER', 'BOARD & COMMUNITY INVOLVEMENT': 'VOLUNTEER',
    // Achievements — keep distinct
    'AWARDS': 'ACHIEVEMENTS', 'HONORS': 'ACHIEVEMENTS',
    'ACHIEVEMENTS': 'ACHIEVEMENTS', 'SELECTED ACHIEVEMENTS': 'ACHIEVEMENTS',
    'CAREER HIGHLIGHTS': 'ACHIEVEMENTS',
    'AUSZEICHNUNGEN': 'ACHIEVEMENTS', 'PREISE': 'ACHIEVEMENTS',
    'PRIX': 'ACHIEVEMENTS', 'DISTINCTIONS': 'ACHIEVEMENTS',
    'PREMIOS': 'ACHIEVEMENTS', 'LOGROS': 'ACHIEVEMENTS',
    // Publications — keep distinct
    'PUBLICATIONS': 'PUBLICATIONS', 'PUBLIKATIONEN': 'PUBLICATIONS',
    'VERÖFFENTLICHUNGEN': 'PUBLICATIONS',
    'CONFERENCE PRESENTATIONS': 'PUBLICATIONS', 'PRESENTATIONS': 'PUBLICATIONS',
    // Interests — keep distinct
    'INTERESTS': 'INTERESTS', 'HOBBIES': 'INTERESTS',
    'HOBBIES & INTERESTS': 'INTERESTS',
    'INTERESSEN': 'INTERESTS', 'HOBBYS': 'INTERESTS',
    "CENTRES D'INTÉRÊT": 'INTERESTS', 'LOISIRS': 'INTERESTS',
    // References — keep distinct
    'REFERENCIAS': 'REFERENCES', 'REFERENCES': 'REFERENCES',
    'REFERENZEN': 'REFERENCES', 'REFEREES': 'REFERENCES',
    // Teaching — keep distinct
    'TEACHING EXPERIENCE': 'TEACHING', 'TEACHING': 'TEACHING',
    'LEHRERFAHRUNG': 'TEACHING',
    // Research — keep distinct
    'RESEARCH INTERESTS': 'RESEARCH', 'RESEARCH EXPERIENCE': 'RESEARCH',
    'FORSCHUNG': 'RESEARCH', 'FORSCHUNGSINTERESSEN': 'RESEARCH',
    // Coursework — keep distinct
    'RELEVANT COURSEWORK': 'COURSEWORK', 'COURSEWORK': 'COURSEWORK',
    // Portfolio — keep distinct
    'PORTFOLIO': 'PORTFOLIO', 'SELECT ENGAGEMENTS': 'PORTFOLIO',
    'SELECTED WORK': 'PORTFOLIO',
  };

  return mapping[normalized] || normalized;
}

/**
 * Extract the user's ORIGINAL section header text from the CV.
 * Returns a Record mapping normalized keys (e.g., 'experience') to the
 * user's actual header text (e.g., 'Work History' or 'Arbeitserfahrung').
 *
 * This preserves the exact text the user wrote instead of replacing it
 * with generic localized headers.
 */
export function extractOriginalHeaders(text: string): Record<string, string> {
  const originalHeaders: Record<string, string> = {};

  // Reuse the same header list and regex pattern from splitIntoSections
  const sectionHeadersList = [
    'PROFILE', 'PROFIL', 'PROFESSIONAL SUMMARY', 'SUMMARY', 'ABOUT', 'ABOUT ME', 'CAREER OBJECTIVE',
    'ZUSAMMENFASSUNG', 'ÜBER MICH', 'KURZPROFIL',
    'PROFIL PROFESSIONNEL', 'RÉSUMÉ', 'RÉSUMÉ PROFESSIONNEL',
    'PERFIL', 'PERFIL PROFESIONAL', 'RESUMEN', 'RESUMEN PROFESIONAL', 'OBJETIVO',
    'RESUMO', 'RESUMO PROFISSIONAL', 'PERFIL PROFISSIONAL',
    'PROFILO', 'PROFILO PROFESSIONALE', 'RIEPILOGO',
    'PROFIEL', 'SAMENVATTING',
    'PROFESSIONAL EXPERIENCE', 'EXPERIENCE', 'WORK EXPERIENCE', 'EMPLOYMENT', 'WORK HISTORY',
    'BERUFSERFAHRUNG', 'BERUFLICHE ERFAHRUNG', 'ARBEITSERFAHRUNG', 'WERDEGANG',
    'BERUFLICHER WERDEGANG', 'TÄTIGKEITEN', 'BERUFLICHE TÄTIGKEITEN', 'PRAXISERFAHRUNG',
    'EXPÉRIENCE PROFESSIONNELLE', 'EXPÉRIENCE', 'EXPÉRIENCES',
    'EXPERIENCIA PROFESIONAL', 'EXPERIENCIA LABORAL', 'EXPERIENCIA',
    'EXPERIÊNCIA PROFISSIONAL', 'EXPERIÊNCIA',
    'ESPERIENZA PROFESSIONALE', 'ESPERIENZA LAVORATIVA', 'ESPERIENZA',
    'WERKERVARING', 'ERVARING',
    'EDUCATION', 'ACADEMIC BACKGROUND', 'QUALIFICATIONS',
    'AUSBILDUNG', 'BILDUNG', 'AKADEMISCHE AUSBILDUNG', 'STUDIUM',
    'FORMATION', 'ÉTUDES', 'PARCOURS ACADÉMIQUE',
    'EDUCACIÓN', 'FORMACIÓN', 'FORMACIÓN ACADÉMICA', 'ESTUDIOS',
    'EDUCAÇÃO', 'FORMAÇÃO', 'FORMAÇÃO ACADÊMICA',
    'ISTRUZIONE', 'FORMAZIONE',
    'OPLEIDING', 'ONDERWIJS',
    'KEY SKILLS', 'SKILLS', 'CORE COMPETENCIES', 'COMPETENCIES', 'TECHNICAL SKILLS', 'SKILLS & COMPETENCIES',
    'FÄHIGKEITEN', 'KENNTNISSE', 'KOMPETENZEN', 'KERNKOMPETENZEN', 'TECHNISCHE FÄHIGKEITEN',
    'QUALIFIKATIONEN', 'SCHLÜSSELQUALIFIKATIONEN', 'IT-KENNTNISSE', 'EDV-KENNTNISSE',
    'COMPÉTENCES', 'COMPÉTENCES CLÉS', 'COMPÉTENCES TECHNIQUES',
    'HABILIDADES', 'COMPETENCIAS', 'APTITUDES',
    'COMPETÊNCIAS',
    'COMPETENZE', 'COMPETENZE TECNICHE',
    'VAARDIGHEDEN', 'COMPETENTIES',
    'LANGUAGES', 'LANGUAGE SKILLS',
    'SPRACHEN', 'SPRACHKENNTNISSE',
    'LANGUES', 'COMPÉTENCES LINGUISTIQUES',
    'IDIOMAS',
    'LÍNGUAS',
    'LINGUE', 'COMPETENZE LINGUISTICHE',
    'TALEN',
    'CERTIFICATIONS', 'CERTIFICATES', 'CREDENTIALS', 'LICENSES & CERTIFICATIONS',
    'ZERTIFIKATE', 'ZERTIFIZIERUNGEN', 'LIZENZEN', 'WEITERBILDUNGEN', 'FORTBILDUNGEN',
    'CERTIFICATS',
    'CERTIFICACIONES', 'CERTIFICADOS',
    'CERTIFICAÇÕES',
    'CERTIFICAZIONI',
    'CERTIFICATEN',
    'PROJECTS', 'PERSONAL PROJECTS', 'KEY PROJECTS',
    'PROJEKTE', 'PERSÖNLICHE PROJEKTE',
    'PROJETS',
    'PROYECTOS',
    'PROJETOS',
    'PROGETTI',
    'PROJECTEN',
    'ADDITIONAL INFORMATION', 'ADDITIONAL', 'OTHER INFORMATION', 'OTHER',
    'ZUSÄTZLICHE INFORMATIONEN', 'WEITERE INFORMATIONEN', 'SONSTIGES',
    'INFORMATIONS COMPLÉMENTAIRES', 'DIVERS',
    'INFORMACIÓN ADICIONAL', 'OTROS',
    'INFORMAÇÕES ADICIONAIS',
    'INFORMAZIONI AGGIUNTIVE', 'ALTRO',
    'OVERIGE INFORMATIE', 'OVERIG',
    'VOLUNTEER', 'VOLUNTEER EXPERIENCE', 'VOLUNTEERING',
    'EHRENAMT', 'EHRENAMTLICHE TÄTIGKEITEN',
    'BÉNÉVOLAT',
    'VOLUNTARIADO',
    'LEADERSHIP & ACTIVITIES', 'BOARD & COMMUNITY INVOLVEMENT',
    'AWARDS', 'HONORS', 'ACHIEVEMENTS', 'SELECTED ACHIEVEMENTS', 'CAREER HIGHLIGHTS',
    'AUSZEICHNUNGEN', 'PREISE',
    'PRIX', 'DISTINCTIONS',
    'PREMIOS', 'LOGROS',
    'PUBLICATIONS', 'PUBLIKATIONEN', 'VERÖFFENTLICHUNGEN',
    'CONFERENCE PRESENTATIONS', 'PRESENTATIONS',
    'TEACHING EXPERIENCE', 'TEACHING', 'LEHRERFAHRUNG',
    'RESEARCH INTERESTS', 'RESEARCH EXPERIENCE', 'FORSCHUNG', 'FORSCHUNGSINTERESSEN',
    'INTERESTS', 'HOBBIES', 'HOBBIES & INTERESTS',
    'INTERESSEN', 'HOBBYS',
    'CENTRES D\'INTÉRÊT', 'LOISIRS',
    'REFERENCIAS', 'REFERENCES', 'REFERENZEN', 'REFEREES',
    'RELEVANT COURSEWORK', 'COURSEWORK',
    'PORTFOLIO', 'SELECT ENGAGEMENTS', 'SELECTED WORK',
  ];

  const escapedHeaders = sectionHeadersList.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const headerPattern = new RegExp(
    `^\\s*(${escapedHeaders.join('|')})\\s*[:\\-–—|]?\\s*$`,
    'gim'
  );

  // Map from normalized keys to the sectionHeaders record keys used by templates
  const normalizedToTemplateKey: Record<string, string> = {
    'SUMMARY': 'summary',
    'EXPERIENCE': 'experience',
    'EDUCATION': 'education',
    'SKILLS': 'skills',
    'LANGUAGES': 'languages',
    'CERTIFICATIONS': 'certifications',
    'PROJECTS': 'projects',
    'ADDITIONAL INFORMATION': 'additionalInfo',
  };

  let match;
  while ((match = headerPattern.exec(text)) !== null) {
    const originalText = match[1].trim();
    const normalizedKey = normalizeHeader(originalText.toUpperCase());
    const templateKey = normalizedToTemplateKey[normalizedKey];
    if (templateKey && !originalHeaders[templateKey]) {
      // Use the FIRST occurrence — preserve exactly what the user wrote
      originalHeaders[templateKey] = originalText;
    }
  }

  return originalHeaders;
}

/**
 * Detect the language of the CV based on which section headers were found.
 * Returns 'en' by default if unable to determine.
 */
export function detectCVLanguage(text: string): 'en' | 'de' | 'fr' | 'es' | 'pt' | 'it' | 'nl' {
  const lower = text.toLowerCase();

  // Count language-specific header matches
  const scores: Record<string, number> = { en: 0, de: 0, fr: 0, es: 0, pt: 0, it: 0, nl: 0 };

  // German headers
  if (/berufserfahrung|berufliche erfahrung|ausbildung|fähigkeiten|kenntnisse|sprachen|zertifikate|berufliches profil/i.test(lower)) scores.de += 3;
  if (/heute|und|oder|bei\b/i.test(lower)) scores.de += 1;

  // French headers
  if (/expérience professionnelle|formation|compétences|langues|profil professionnel/i.test(lower)) scores.fr += 3;
  if (/présent|chez|et\b/i.test(lower)) scores.fr += 1;

  // Spanish headers
  if (/experiencia profesional|experiencia laboral|educación|formación|habilidades|idiomas/i.test(lower)) scores.es += 3;
  if (/actual|en\b/i.test(lower)) scores.es += 1;

  // Portuguese headers
  if (/experiência profissional|formação|educação|competências|línguas/i.test(lower)) scores.pt += 3;

  // Italian headers
  if (/esperienza professionale|istruzione|competenze|lingue|profilo/i.test(lower)) scores.it += 3;

  // Dutch headers
  if (/werkervaring|opleiding|vaardigheden|talen|profiel/i.test(lower)) scores.nl += 3;

  // English headers
  if (/professional experience|work experience|education|skills|core competencies|certifications/i.test(lower)) scores.en += 3;
  if (/present|current/i.test(lower)) scores.en += 1;

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best[1] === 0) return 'en'; // default
  return best[0] as 'en' | 'de' | 'fr' | 'es' | 'pt' | 'it' | 'nl';
}

/**
 * Generate localized section headers and strings for template rendering.
 * Used when rendering the original (non-optimized) CV in templates.
 */
export function generateLocalizedHeaders(lang: 'en' | 'de' | 'fr' | 'es' | 'pt' | 'it' | 'nl') {
  const headers: Record<string, Record<string, string>> = {
    en: {
      summary: 'PROFESSIONAL SUMMARY', skills: 'CORE COMPETENCIES',
      experience: 'PROFESSIONAL EXPERIENCE', education: 'EDUCATION',
      certifications: 'CERTIFICATIONS', languages: 'LANGUAGES',
      contact: 'CONTACT', additionalInfo: 'ADDITIONAL INFORMATION', projects: 'PROJECTS',
    },
    de: {
      summary: 'BERUFLICHES PROFIL', skills: 'KERNKOMPETENZEN',
      experience: 'BERUFSERFAHRUNG', education: 'AUSBILDUNG',
      certifications: 'ZERTIFIZIERUNGEN', languages: 'SPRACHKENNTNISSE',
      contact: 'KONTAKT', additionalInfo: 'WEITERE INFORMATIONEN', projects: 'PROJEKTE',
    },
    fr: {
      summary: 'PROFIL PROFESSIONNEL', skills: 'COMPETENCES CLES',
      experience: 'EXPERIENCE PROFESSIONNELLE', education: 'FORMATION',
      certifications: 'CERTIFICATIONS', languages: 'LANGUES',
      contact: 'CONTACT', additionalInfo: 'INFORMATIONS COMPLEMENTAIRES', projects: 'PROJETS',
    },
    es: {
      summary: 'PERFIL PROFESIONAL', skills: 'COMPETENCIAS',
      experience: 'EXPERIENCIA PROFESIONAL', education: 'EDUCACION',
      certifications: 'CERTIFICACIONES', languages: 'IDIOMAS',
      contact: 'CONTACTO', additionalInfo: 'INFORMACION ADICIONAL', projects: 'PROYECTOS',
    },
    pt: {
      summary: 'PERFIL PROFISSIONAL', skills: 'COMPETENCIAS',
      experience: 'EXPERIENCIA PROFISSIONAL', education: 'EDUCACAO',
      certifications: 'CERTIFICACOES', languages: 'LINGUAS',
      contact: 'CONTACTO', additionalInfo: 'INFORMACOES ADICIONAIS', projects: 'PROJETOS',
    },
    it: {
      summary: 'PROFILO PROFESSIONALE', skills: 'COMPETENZE',
      experience: 'ESPERIENZA PROFESSIONALE', education: 'ISTRUZIONE',
      certifications: 'CERTIFICAZIONI', languages: 'LINGUE',
      contact: 'CONTATTI', additionalInfo: 'INFORMAZIONI AGGIUNTIVE', projects: 'PROGETTI',
    },
    nl: {
      summary: 'PROFIEL', skills: 'VAARDIGHEDEN',
      experience: 'WERKERVARING', education: 'OPLEIDING',
      certifications: 'CERTIFICATEN', languages: 'TALEN',
      contact: 'CONTACT', additionalInfo: 'OVERIGE INFORMATIE', projects: 'PROJECTEN',
    },
  };

  const strings: Record<string, Record<string, string>> = {
    en: { present: 'Present', gradePrefix: 'GPA:', degreeConnector: 'in', photoPlaceholder: 'Photo', dateOfBirthLabel: 'Date of Birth', nationalityLabel: 'Nationality', websiteLabel: 'Website', signatureLabel: 'Signature', cityLabel: 'City', dateLabel: 'Date' },
    de: { present: 'Heute', gradePrefix: 'Note:', degreeConnector: 'in', photoPlaceholder: 'Foto', dateOfBirthLabel: 'Geburtsdatum', nationalityLabel: 'Nationalität', websiteLabel: 'Webseite', signatureLabel: 'Unterschrift', cityLabel: 'Ort', dateLabel: 'Datum' },
    fr: { present: 'Présent', gradePrefix: 'Mention:', degreeConnector: 'en', photoPlaceholder: 'Photo', dateOfBirthLabel: 'Date de naissance', nationalityLabel: 'Nationalité', websiteLabel: 'Site web', signatureLabel: 'Signature', cityLabel: 'Ville', dateLabel: 'Date' },
    es: { present: 'Actual', gradePrefix: 'Nota:', degreeConnector: 'en', photoPlaceholder: 'Foto', dateOfBirthLabel: 'Fecha de nacimiento', nationalityLabel: 'Nacionalidad', websiteLabel: 'Sitio web', signatureLabel: 'Firma', cityLabel: 'Ciudad', dateLabel: 'Fecha' },
    pt: { present: 'Presente', gradePrefix: 'Nota:', degreeConnector: 'em', photoPlaceholder: 'Foto', dateOfBirthLabel: 'Data de nascimento', nationalityLabel: 'Nacionalidade', websiteLabel: 'Website', signatureLabel: 'Assinatura', cityLabel: 'Cidade', dateLabel: 'Data' },
    it: { present: 'Attuale', gradePrefix: 'Voto:', degreeConnector: 'in', photoPlaceholder: 'Foto', dateOfBirthLabel: 'Data di nascita', nationalityLabel: 'Nazionalità', websiteLabel: 'Sito web', signatureLabel: 'Firma', cityLabel: 'Città', dateLabel: 'Data' },
    nl: { present: 'Heden', gradePrefix: 'Cijfer:', degreeConnector: 'in', photoPlaceholder: 'Foto', dateOfBirthLabel: 'Geboortedatum', nationalityLabel: 'Nationaliteit', websiteLabel: 'Website', signatureLabel: 'Handtekening', cityLabel: 'Stad', dateLabel: 'Datum' },
  };

  return {
    sectionHeaders: headers[lang] || headers.en,
    localizedStrings: strings[lang] || strings.en,
  };
}
