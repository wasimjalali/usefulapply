/**
 * Section Splitter — Split CV text into named sections
 *
 * Extracted from parse-optimized-cv.ts for modularity.
 * Handles multilingual section headers (EN, DE, FR, ES, PT, IT, NL).
 * Generates localized sectionHeaders + localizedStrings for template rendering.
 */

import { localizedStrings } from '@/lib/cv-templates/locale';
import type { SupportedLanguage } from '@/lib/utils/language-detector';

export type CvHeaderLanguage = SupportedLanguage;

/** The seven languages, in the order ties are broken. */
export const CV_HEADER_LANGUAGES: readonly CvHeaderLanguage[] = ['en', 'de', 'fr', 'es', 'pt', 'it', 'nl'];

/**
 * Every section heading the parser recognises, grouped by the language it
 * belongs to.
 *
 * This list used to be inlined twice, verbatim, inside splitIntoSections and
 * extractOriginalHeaders. It is one constant now so the two cannot drift.
 *
 * The grouping by language is what headingOptions() reads: a rename offered on
 * a German CV has to be a German heading. The parser itself only ever uses the
 * flattened set below, and the header regex is anchored at both ends, so the
 * order of the alternatives never decides which one matches.
 *
 * A heading that is genuinely the same word in two languages (CERTIFICATIONS in
 * English and French, HABILIDADES in Spanish and Portuguese) is listed under
 * both; the flattened set dedupes it.
 */
const HEADERS_BY_LANGUAGE: Record<CvHeaderLanguage, readonly string[]> = {
  en: [
    'PROFILE', 'PROFESSIONAL SUMMARY', 'SUMMARY', 'ABOUT', 'ABOUT ME', 'CAREER OBJECTIVE',
    'PROFESSIONAL EXPERIENCE', 'EXPERIENCE', 'WORK EXPERIENCE', 'EMPLOYMENT', 'WORK HISTORY',
    'EDUCATION', 'ACADEMIC BACKGROUND', 'QUALIFICATIONS',
    'KEY SKILLS', 'SKILLS', 'CORE COMPETENCIES', 'COMPETENCIES', 'TECHNICAL SKILLS', 'SKILLS & COMPETENCIES',
    'LANGUAGES', 'LANGUAGE SKILLS',
    'CERTIFICATIONS', 'CERTIFICATES', 'CREDENTIALS', 'LICENSES & CERTIFICATIONS',
    'PROJECTS', 'PERSONAL PROJECTS', 'KEY PROJECTS',
    'ADDITIONAL INFORMATION', 'ADDITIONAL', 'OTHER INFORMATION', 'OTHER',
    'VOLUNTEER', 'VOLUNTEER EXPERIENCE', 'VOLUNTEERING',
    'LEADERSHIP & ACTIVITIES', 'BOARD & COMMUNITY INVOLVEMENT',
    'AWARDS', 'HONORS', 'ACHIEVEMENTS', 'SELECTED ACHIEVEMENTS', 'CAREER HIGHLIGHTS',
    'PUBLICATIONS', 'CONFERENCE PRESENTATIONS', 'PRESENTATIONS',
    'TEACHING EXPERIENCE', 'TEACHING',
    'RESEARCH INTERESTS', 'RESEARCH EXPERIENCE',
    'INTERESTS', 'HOBBIES', 'HOBBIES & INTERESTS',
    'REFERENCES', 'REFEREES',
    'RELEVANT COURSEWORK', 'COURSEWORK',
    'PORTFOLIO', 'SELECT ENGAGEMENTS', 'SELECTED WORK',
  ],
  de: [
    'PROFIL', 'ZUSAMMENFASSUNG', 'ÜBER MICH', 'KURZPROFIL',
    'BERUFSERFAHRUNG', 'BERUFLICHE ERFAHRUNG', 'ARBEITSERFAHRUNG', 'WERDEGANG',
    'BERUFLICHER WERDEGANG', 'TÄTIGKEITEN', 'BERUFLICHE TÄTIGKEITEN', 'PRAXISERFAHRUNG',
    'AUSBILDUNG', 'BILDUNG', 'AKADEMISCHE AUSBILDUNG', 'STUDIUM',
    'FÄHIGKEITEN', 'KENNTNISSE', 'KOMPETENZEN', 'KERNKOMPETENZEN', 'TECHNISCHE FÄHIGKEITEN',
    'QUALIFIKATIONEN', 'SCHLÜSSELQUALIFIKATIONEN', 'IT-KENNTNISSE', 'EDV-KENNTNISSE',
    'SPRACHEN', 'SPRACHKENNTNISSE',
    'ZERTIFIKATE', 'ZERTIFIZIERUNGEN', 'LIZENZEN', 'WEITERBILDUNGEN', 'FORTBILDUNGEN',
    'PROJEKTE', 'PERSÖNLICHE PROJEKTE',
    'ZUSÄTZLICHE INFORMATIONEN', 'WEITERE INFORMATIONEN', 'SONSTIGES',
    'EHRENAMT', 'EHRENAMTLICHE TÄTIGKEITEN',
    'AUSZEICHNUNGEN', 'PREISE',
    'PUBLIKATIONEN', 'VERÖFFENTLICHUNGEN',
    'LEHRERFAHRUNG',
    'FORSCHUNG', 'FORSCHUNGSINTERESSEN',
    'INTERESSEN', 'HOBBYS',
    'REFERENZEN',
  ],
  fr: [
    'PROFIL', 'PROFIL PROFESSIONNEL', 'RÉSUMÉ', 'RÉSUMÉ PROFESSIONNEL',
    'EXPÉRIENCE PROFESSIONNELLE', 'EXPÉRIENCE', 'EXPÉRIENCES',
    'FORMATION', 'ÉTUDES', 'PARCOURS ACADÉMIQUE',
    'COMPÉTENCES', 'COMPÉTENCES CLÉS', 'COMPÉTENCES TECHNIQUES',
    'LANGUES', 'COMPÉTENCES LINGUISTIQUES',
    'CERTIFICATIONS', 'CERTIFICATS',
    'PROJETS',
    'INFORMATIONS COMPLÉMENTAIRES', 'DIVERS',
    'BÉNÉVOLAT',
    'PRIX', 'DISTINCTIONS',
    'CENTRES D\'INTÉRÊT', 'LOISIRS',
  ],
  es: [
    'PERFIL', 'PERFIL PROFESIONAL', 'RESUMEN', 'RESUMEN PROFESIONAL', 'OBJETIVO',
    'EXPERIENCIA PROFESIONAL', 'EXPERIENCIA LABORAL', 'EXPERIENCIA',
    'EDUCACIÓN', 'FORMACIÓN', 'FORMACIÓN ACADÉMICA', 'ESTUDIOS',
    'HABILIDADES', 'COMPETENCIAS', 'APTITUDES',
    'IDIOMAS',
    'CERTIFICACIONES', 'CERTIFICADOS',
    'PROYECTOS',
    'INFORMACIÓN ADICIONAL', 'OTROS',
    'VOLUNTARIADO',
    'PREMIOS', 'LOGROS',
    'REFERENCIAS',
  ],
  pt: [
    'RESUMO', 'RESUMO PROFISSIONAL', 'PERFIL PROFISSIONAL',
    'EXPERIÊNCIA PROFISSIONAL', 'EXPERIÊNCIA',
    'EDUCAÇÃO', 'FORMAÇÃO', 'FORMAÇÃO ACADÊMICA',
    'HABILIDADES', 'COMPETÊNCIAS',
    'LÍNGUAS',
    'CERTIFICAÇÕES', 'CERTIFICADOS',
    'PROJETOS',
    'INFORMAÇÕES ADICIONAIS',
  ],
  it: [
    'PROFILO', 'PROFILO PROFESSIONALE', 'RIEPILOGO',
    'ESPERIENZA PROFESSIONALE', 'ESPERIENZA LAVORATIVA', 'ESPERIENZA',
    'ISTRUZIONE', 'FORMAZIONE',
    'COMPETENZE', 'COMPETENZE TECNICHE',
    'LINGUE', 'COMPETENZE LINGUISTICHE',
    'CERTIFICAZIONI',
    'PROGETTI',
    'INFORMAZIONI AGGIUNTIVE', 'ALTRO',
  ],
  nl: [
    'PROFIEL', 'SAMENVATTING',
    'WERKERVARING', 'ERVARING',
    'OPLEIDING', 'ONDERWIJS',
    'VAARDIGHEDEN', 'COMPETENTIES',
    'TALEN',
    'CERTIFICATEN',
    'PROJECTEN',
    'OVERIGE INFORMATIE', 'OVERIG',
  ],
};

/** The flattened, deduped set the header regex is built from. */
export const SECTION_HEADERS: readonly string[] = Array.from(
  new Set(CV_HEADER_LANGUAGES.flatMap((lang) => HEADERS_BY_LANGUAGE[lang])),
);

// Section headers must be on their own line. An optional trailing colon, dash
// or pipe is allowed after the header text. Both anchors are load-bearing: they
// are why the order of the alternatives cannot change which header matches.
const HEADER_PATTERN_SOURCE = `^\\s*(${SECTION_HEADERS
  .map((header) => header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')})\\s*[:\\-–—|]?\\s*$`;

/** A fresh regex per call: the /g flag carries lastIndex between exec loops. */
function sectionHeaderPattern(): RegExp {
  return new RegExp(HEADER_PATTERN_SOURCE, 'gim');
}

/** Normalized section name to the sectionHeaders key the templates render. */
const TEMPLATE_KEY_BY_NORMALIZED: Record<string, string> = {
  'SUMMARY': 'summary',
  'EXPERIENCE': 'experience',
  'EDUCATION': 'education',
  'SKILLS': 'skills',
  'LANGUAGES': 'languages',
  'CERTIFICATIONS': 'certifications',
  'PROJECTS': 'projects',
  'ADDITIONAL INFORMATION': 'additionalInfo',
};

/** The sectionHeaders keys a template actually renders as a heading. */
export const RENAMEABLE_SECTION_KEYS = [
  'summary', 'skills', 'experience', 'education',
  'certifications', 'languages', 'projects', 'additionalInfo',
] as const;

export type RenameableSectionKey = (typeof RENAMEABLE_SECTION_KEYS)[number];

export function isRenameableSectionKey(value: unknown): value is RenameableSectionKey {
  return typeof value === 'string' && (RENAMEABLE_SECTION_KEYS as readonly string[]).includes(value);
}

/**
 * Split the CV text into named sections
 */
export function splitIntoSections(text: string): Map<string, string> {
  const sections = new Map<string, string>();

  const headerPattern = sectionHeaderPattern();

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

// Map all variations to standard normalized names.
const NORMALIZED_HEADER_MAPPING: Record<string, string> = {
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

export function normalizeHeader(header: string): string {
  // Strip trailing colon/dash that may have been captured
  const normalized = header.toUpperCase().trim().replace(/[:\-–—|]+$/, '').trim();
  return NORMALIZED_HEADER_MAPPING[normalized] || normalized;
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

  const headerPattern = sectionHeaderPattern();

  let match;
  while ((match = headerPattern.exec(text)) !== null) {
    const originalText = match[1].trim();
    const normalizedKey = normalizeHeader(originalText.toUpperCase());
    const templateKey = TEMPLATE_KEY_BY_NORMALIZED[normalizedKey];
    if (templateKey && !originalHeaders[templateKey]) {
      // Use the FIRST occurrence — preserve exactly what the user wrote
      originalHeaders[templateKey] = originalText;
    }
  }

  return originalHeaders;
}

/**
 * Generate localized section headers and strings for template rendering.
 * Used when rendering the original (non-optimized) CV in templates.
 */
export function generateLocalizedHeaders(lang: CvHeaderLanguage) {
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
      summary: 'PROFIL PROFESSIONNEL', skills: 'COMPÉTENCES CLÉS',
      experience: 'EXPÉRIENCE PROFESSIONNELLE', education: 'FORMATION',
      certifications: 'CERTIFICATIONS', languages: 'LANGUES',
      contact: 'CONTACT', additionalInfo: 'INFORMATIONS COMPLÉMENTAIRES', projects: 'PROJETS',
    },
    es: {
      summary: 'PERFIL PROFESIONAL', skills: 'COMPETENCIAS',
      experience: 'EXPERIENCIA PROFESIONAL', education: 'EDUCACIÓN',
      certifications: 'CERTIFICACIONES', languages: 'IDIOMAS',
      contact: 'CONTACTO', additionalInfo: 'INFORMACIÓN ADICIONAL', projects: 'PROYECTOS',
    },
    // The base `pt` product code consistently renders European Portuguese.
    pt: {
      summary: 'PERFIL PROFISSIONAL', skills: 'COMPETÊNCIAS',
      experience: 'EXPERIÊNCIA PROFISSIONAL', education: 'EDUCAÇÃO',
      certifications: 'CERTIFICAÇÕES', languages: 'LÍNGUAS',
      contact: 'CONTACTO', additionalInfo: 'INFORMAÇÕES ADICIONAIS', projects: 'PROJETOS',
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

  // The small labels and the open-ended word come from the export's own tables (cv-templates/locale.ts), so a rename
  // option, the canvas and the PDF can never word them differently.
  const strings = { [lang]: localizedStrings(lang) };

  return {
    sectionHeaders: headers[lang] || headers.en,
    localizedStrings: strings[lang],
  };
}

/**
 * The headings a section may be renamed to, in one language.
 *
 * This is a closed enum, not a suggestion. It is every heading the parser
 * already recognises for that section in that language, plus the canonical
 * localized heading, so a rename can only ever swap one recognised heading for
 * another. It is language-dependent, which is why it ships per CV in the chat
 * outline rather than sitting in a static tool description.
 *
 * Returned uppercase, matching how every template renders a heading.
 */
export function headingOptions(sectionKey: string, lang: CvHeaderLanguage): string[] {
  if (!isRenameableSectionKey(sectionKey)) return [];
  const fromList = HEADERS_BY_LANGUAGE[lang].filter(
    (header) => TEMPLATE_KEY_BY_NORMALIZED[normalizeHeader(header)] === sectionKey,
  );
  const canonical = generateLocalizedHeaders(lang).sectionHeaders[sectionKey];
  const all = canonical ? [canonical, ...fromList] : [...fromList];
  return Array.from(new Set(all.map((header) => header.toUpperCase())));
}

/**
 * Which language a tailored CV's headings are written in.
 *
 * The headings themselves are the direct evidence and they are already on the
 * object, so this never re-reads the CV body or makes a language judgment.
 *
 * A heading counts for a language when it is one the parser recognises for that
 * language, or when it is that language's canonical localized heading (which is
 * often unaccented, so it is not in the recognised list). Modal winner; ties go
 * to the first language in CV_HEADER_LANGUAGES, which is English.
 */
/** Uppercase with accents removed, so "EXPÉRIENCE" and "EXPERIENCE" count as the same heading. */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036F]/g, '').trim().toUpperCase();
}

export function inferCvLanguageFromHeaders(
  headers: Record<string, string | undefined> | null | undefined,
): CvHeaderLanguage {
  if (!headers) return 'en';
  const values = Object.values(headers)
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .map((value) => fold(value));
  if (values.length === 0) return 'en';

  let best: CvHeaderLanguage = 'en';
  let bestScore = 0;
  for (const lang of CV_HEADER_LANGUAGES) {
    const recognised = new Set(HEADERS_BY_LANGUAGE[lang].map((header) => fold(header)));
    const canonical = new Set(
      Object.values(generateLocalizedHeaders(lang).sectionHeaders).map((header) => fold(header)),
    );
    const score = values.filter((value) => recognised.has(value) || canonical.has(value)).length;
    if (score > bestScore) {
      bestScore = score;
      best = lang;
    }
  }
  return best;
}
