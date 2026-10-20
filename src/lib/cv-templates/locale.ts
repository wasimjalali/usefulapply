/**
 * Locale-aware text for the CV templates and exports: standard ATS section
 * headings, date formats and date ranges. Pure functions, no React, so the
 * templates, the DOCX builder and the eval all use the same text.
 *
 * Product rule: date ranges use a plain hyphen, never an en or em dash.
 */

import type { CVData } from './types';

/** The seven languages the product writes CVs in (the parser's base codes). */
export const CV_LOCALES = ['en', 'de', 'fr', 'es', 'pt', 'it', 'nl'] as const;
export type CvLocale = (typeof CV_LOCALES)[number];

/** `other` is a CV in a language the exports have no standard headings for. Its text is left as written. */
export type CvTextLocale = CvLocale | 'other';

export type HeadingKey =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'certifications'
  | 'languages'
  | 'projects'
  | 'additionalInfo';

const STANDARD_HEADINGS: Record<CvLocale, Record<HeadingKey, string>> = {
  en: {
    summary: 'Summary',
    experience: 'Experience',
    education: 'Education',
    skills: 'Skills',
    certifications: 'Certifications',
    languages: 'Languages',
    projects: 'Projects',
    additionalInfo: 'Additional Information',
  },
  de: {
    summary: 'Profil',
    experience: 'Berufserfahrung',
    education: 'Ausbildung',
    skills: 'Kenntnisse',
    certifications: 'Zertifikate',
    languages: 'Sprachen',
    projects: 'Projekte',
    additionalInfo: 'Weitere Angaben',
  },
  fr: {
    summary: 'Profil',
    experience: 'Expérience',
    education: 'Formation',
    skills: 'Compétences',
    certifications: 'Certifications',
    languages: 'Langues',
    projects: 'Projets',
    additionalInfo: 'Informations complémentaires',
  },
  es: {
    summary: 'Perfil',
    experience: 'Experiencia',
    education: 'Formación',
    skills: 'Competencias',
    certifications: 'Certificaciones',
    languages: 'Idiomas',
    projects: 'Proyectos',
    additionalInfo: 'Información adicional',
  },
  pt: {
    summary: 'Perfil',
    experience: 'Experiência',
    education: 'Formação',
    skills: 'Competências',
    certifications: 'Certificações',
    languages: 'Línguas',
    projects: 'Projetos',
    additionalInfo: 'Informações adicionais',
  },
  it: {
    summary: 'Profilo',
    experience: 'Esperienza',
    education: 'Formazione',
    skills: 'Competenze',
    certifications: 'Certificazioni',
    languages: 'Lingue',
    projects: 'Progetti',
    additionalInfo: 'Informazioni aggiuntive',
  },
  nl: {
    summary: 'Profiel',
    experience: 'Werkervaring',
    education: 'Opleiding',
    skills: 'Vaardigheden',
    certifications: 'Certificeringen',
    languages: 'Talen',
    projects: 'Projecten',
    additionalInfo: 'Aanvullende informatie',
  },
};

/** Lowercase, accents removed, so "COMPÉTENCES CLÉS" and "competences cles" are the same wording. */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase();
}

/** Wordings the AI and the parser produce for each section, in every supported language. They normalize to the standard heading. */
const SYNONYMS: Record<HeadingKey, string[]> = {
  summary: [
    'summary', 'professional summary', 'executive summary', 'career summary', 'profile', 'professional profile',
    'about me', 'objective', 'career objective', 'profil', 'berufsprofil', 'kurzprofil', 'zusammenfassung',
    'persönliches profil', 'berufliches profil', 'über mich', 'kurzvorstellung',
    'profil professionnel', 'résumé', 'résumé professionnel', 'synthèse', 'à propos', 'objectif professionnel',
    'perfil', 'perfil profesional', 'resumen', 'resumen profesional', 'objetivo profesional',
    'perfil profissional', 'resumo', 'resumo profissional', 'objetivo profissional',
    'profilo', 'profilo professionale', 'sommario', 'riepilogo', 'obiettivo professionale',
    'profiel', 'persoonlijk profiel', 'professioneel profiel', 'samenvatting',
  ],
  experience: [
    'experience', 'professional experience', 'work experience', 'employment history', 'work history',
    'career history', 'relevant experience', 'employment', 'berufserfahrung', 'beruflicher werdegang',
    'berufliche erfahrung', 'werdegang', 'praxiserfahrung', 'berufliche laufbahn', 'beruflicher hintergrund',
    'expérience', 'expérience professionnelle', 'expériences professionnelles', 'parcours professionnel', 'expérience de travail',
    'experiencia', 'experiencia profesional', 'experiencia laboral', 'historial laboral', 'trayectoria profesional',
    'experiência', 'experiência profissional', 'histórico profissional', 'percurso profissional',
    'esperienza', 'esperienza professionale', 'esperienze lavorative', 'esperienza lavorativa', 'percorso professionale',
    'werkervaring', 'ervaring', 'beroepservaring', 'professionele ervaring', 'loopbaan',
  ],
  education: [
    'education', 'education & training', 'education and training', 'academic background', 'academic qualifications',
    'ausbildung', 'bildungsweg', 'akademischer werdegang', 'schulbildung', 'studium', 'ausbildung & studium',
    'bildung', 'akademische ausbildung',
    'formation', 'formations', 'études', 'parcours académique', 'éducation', 'diplômes', 'formation et diplômes',
    'educación', 'formación', 'formación académica', 'estudios',
    'formação', 'formação académica', 'formação acadêmica', 'educação', 'escolaridade',
    'formazione', 'istruzione', 'titoli di studio', 'istruzione e formazione',
    'opleiding', 'opleidingen', 'onderwijs', 'opleiding en training',
  ],
  skills: [
    'skills', 'core competencies', 'technical skills', 'key skills', 'competencies', 'core skills',
    'skills & competencies', 'skills and competencies', 'areas of expertise', 'kenntnisse', 'fähigkeiten',
    'kompetenzen', 'kernkompetenzen', 'fachkenntnisse', 'it-kenntnisse', 'kenntnisse & fähigkeiten',
    'kenntnisse und fähigkeiten', 'fertigkeiten',
    'compétences', 'compétences clés', 'compétences techniques', 'savoir-faire', 'aptitudes',
    'competencias', 'habilidades', 'competencias clave', 'conocimientos', 'aptitudes y competencias',
    'competências', 'competências principais', 'aptidões',
    'competenze', 'competenze tecniche', 'abilità', 'capacità', 'competenze chiave',
    'vaardigheden', 'competenties', 'kennis', 'kernvaardigheden', 'kennis en vaardigheden',
  ],
  certifications: [
    'certifications', 'certificates', 'licenses & certifications', 'licenses and certifications',
    'certifications & licenses', 'zertifikate', 'zertifizierungen', 'weiterbildungen', 'weiterbildung',
    'fortbildungen', 'fortbildung',
    'certificats', 'certifications et licences', 'formations complémentaires',
    'certificaciones', 'certificados', 'cursos',
    'certificações', 'cursos e certificações',
    'certificazioni', 'certificati', 'corsi',
    'certificeringen', 'certificaten', 'cursussen',
  ],
  languages: [
    'languages', 'language skills', 'sprachen', 'sprachkenntnisse',
    'langues', 'compétences linguistiques', 'idiomas', 'línguas', 'idiomas e línguas',
    'lingue', 'conoscenze linguistiche', 'talen', 'taalvaardigheid', 'talenkennis',
  ],
  projects: [
    'projects', 'selected projects', 'projekte', 'ausgewählte projekte',
    'projets', 'projets personnels', 'proyectos', 'projetos', 'projectos', 'progetti', 'projecten',
  ],
  additionalInfo: [
    'additional information', 'additional info', 'weitere angaben', 'zusätzliche angaben', 'sonstiges',
    'weitere informationen',
    'informations complémentaires', 'autres informations', 'divers',
    'información adicional', 'otros datos', 'informaciones adicionales',
    'informações adicionais', 'outras informações',
    'informazioni aggiuntive', 'altre informazioni',
    'aanvullende informatie', 'overige informatie', 'extra informatie',
  ],
};

const FOLDED_SYNONYMS: Record<HeadingKey, Set<string>> = Object.fromEntries(
  (Object.keys(SYNONYMS) as HeadingKey[]).map((key) => [key, new Set(SYNONYMS[key].map(fold))]),
) as Record<HeadingKey, Set<string>>;

const GERMAN_STOPWORDS = new Set([
  'und', 'der', 'die', 'das', 'mit', 'für', 'von', 'im', 'bei', 'zur', 'zum', 'den', 'dem', 'ein', 'eine',
  'einer', 'als', 'auf', 'ist', 'sich', 'durch', 'bis', 'über', 'unter', 'nach', 'aus', 'wie', 'zu',
]);

const GERMAN_HEADER_HINT = /berufserfahrung|werdegang|ausbildung|kenntnisse|sprachen|zertifikat|fähigkeiten|kompetenzen/i;

/** Function words of the other supported languages, so French, Spanish, Italian, Portuguese and Dutch are not read as German or English. */
const OTHER_STOPWORDS: Record<string, Set<string>> = {
  fr: new Set(['le', 'la', 'les', 'des', 'du', 'un', 'une', 'et', 'en', 'pour', 'avec', 'dans', 'sur', 'par', 'au', 'aux', 'est', 'qui', 'que', 'ses', 'son', 'sa', 'chez']),
  es: new Set(['el', 'los', 'las', 'del', 'y', 'en', 'para', 'con', 'por', 'una', 'un', 'es', 'se', 'que', 'su', 'sus', 'al', 'como', 'más']),
  it: new Set(['il', 'lo', 'gli', 'di', 'del', 'della', 'dei', 'e', 'in', 'per', 'con', 'una', 'un', 'che', 'è', 'nel', 'nella', 'alla', 'sono']),
  pt: new Set(['os', 'as', 'do', 'da', 'dos', 'das', 'e', 'em', 'para', 'com', 'uma', 'um', 'que', 'não', 'na', 'no', 'por', 'são']),
  nl: new Set(['de', 'het', 'een', 'en', 'van', 'op', 'met', 'voor', 'is', 'dat', 'niet', 'aan', 'bij', 'naar', 'ook', 'zijn', 'door']),
};

function stopwordRatio(words: string[], set: Set<string>): number {
  return words.filter((word) => set.has(word)).length / words.length;
}

/** The share of function words that mark German, and the best of the other languages, for a bag of words. */
function languageShares(words: string[]): { german: number; other: number } {
  const german = stopwordRatio(words, GERMAN_STOPWORDS);
  const other = Math.max(...Object.values(OTHER_STOPWORDS).map((set) => stopwordRatio(words, set)));
  return { german, other };
}

function stripLabel(value: string): string {
  return value.replace(/[:\s]+$/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const GERMAN_PHRASES = /\b(sehr geehrte[rs]?|mit freundlichen gr(?:ü|ue)(?:ß|ss)en|hiermit bewerbe ich|bewerbung als)\b/i;

/**
 * Is this free text German? An offline heuristic (German function words and the
 * stock phrases of a Bewerbung), so the answer is deterministic and the export
 * cache key can depend on it. It needs about a dozen words to judge.
 */
export function looksGerman(text: string): boolean {
  if (GERMAN_PHRASES.test(text)) return true;
  const words = text.toLowerCase().match(/[\p{L}]+/gu);
  if (!words || words.length < 12) return false;
  const { german, other } = languageShares(words);
  return german > 0.12 && german >= other;
}

/** The best-matching supported language other than German and English for a bag of words. */
function bestOtherLanguage(words: string[]): { language: Exclude<CvLocale, 'en' | 'de'>; share: number } {
  let best: Exclude<CvLocale, 'en' | 'de'> = 'fr';
  let share = 0;
  for (const [language, set] of Object.entries(OTHER_STOPWORDS)) {
    const ratio = stopwordRatio(words, set);
    if (ratio > share) {
      share = ratio;
      best = language as Exclude<CvLocale, 'en' | 'de'>;
    }
  }
  return { language: best, share };
}

/** A language code or name ("fr", "pt-PT", "english") as one of the supported languages, or `other`. */
export function localeFromLanguageCode(code: string | null | undefined): CvTextLocale {
  const value = code?.trim().toLowerCase();
  if (!value) return 'other';
  return CV_LOCALES.find((known) => value === known || value.startsWith(`${known}-`) || value.startsWith(`${known}_`)) ?? 'other';
}

/**
 * The language free text is written in, by function words: any of the seven, English when nothing
 * stands out. Offline and deterministic, like looksGerman, so the export cache key can depend on it.
 */
export function detectTextLocale(text: string): CvTextLocale {
  if (GERMAN_PHRASES.test(text)) return 'de';
  const words = text.toLowerCase().match(/[\p{L}]+/gu);
  if (!words || words.length < 12) return 'en';
  const german = stopwordRatio(words, GERMAN_STOPWORDS);
  const other = bestOtherLanguage(words);
  if (other.share > 0.12 && other.share > german * 1.1) return other.language;
  return german > 0.12 ? 'de' : 'en';
}

/** The language the CV text is written in, for headings and dates. Explicit `data.language` wins. */
export function inferCvLocale(data: CVData): CvTextLocale {
  const explicit = data.language?.trim();
  if (explicit) return localeFromLanguageCode(explicit);
  const headers = Object.values(data.sectionHeaders ?? {}).join(' ');
  if (GERMAN_HEADER_HINT.test(headers)) return 'de';
  if (/^(heute|aktuell|gegenwart|derzeit)$/i.test(data.localizedStrings?.present ?? '')) return 'de';
  const sample = [data.summary ?? '', ...data.experience.flatMap((exp) => exp.bullets.slice(0, 3))]
    .join(' ')
    .toLowerCase()
    .match(/[\p{L}]+/gu);
  if (sample && sample.length >= 12) {
    const german = stopwordRatio(sample, GERMAN_STOPWORDS);
    const other = bestOtherLanguage(sample);
    // The other languages are checked first: French and Dutch share words with German and English.
    if (other.share > 0.12 && other.share > german * 1.1) return other.language;
    if (german > 0.12) return 'de';
  }
  return 'en';
}

/**
 * The heading a section shows. A heading the user or the chat renamed
 * (`renamed`) is shown exactly as chosen. Otherwise, for English and German
 * CVs, a known wording ("Core Competencies", "Werdegang") on an unrenamed
 * section becomes the standard ATS heading, and any other wording is kept.
 * Other languages keep what the parser produced, with the English standard as
 * the fallback.
 */
export function resolveHeading(args: { provided?: string | null; renamed?: boolean; key: HeadingKey; locale: CvTextLocale }): string {
  const provided = args.provided?.trim();
  const standard = STANDARD_HEADINGS[args.locale === 'other' ? 'en' : args.locale][args.key];
  if (!provided) return standard;
  if (args.renamed) return provided;
  if (args.locale !== 'other' && FOLDED_SYNONYMS[args.key].has(fold(stripLabel(provided)))) return standard;
  return provided;
}

export function sectionHeading(data: CVData, key: HeadingKey): string {
  return resolveHeading({
    provided: data.sectionHeaders?.[key as keyof NonNullable<CVData['sectionHeaders']>],
    renamed: data.renamedHeadings?.includes(key),
    key,
    locale: inferCvLocale(data),
  });
}

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MONTH_LOOKUP: Record<string, number> = {};
[
  ['jan', 'january', 'januar', 'janvier', 'janv', 'enero', 'ene', 'janeiro', 'gennaio', 'gen', 'januari'],
  ['feb', 'february', 'februar', 'février', 'fevrier', 'févr', 'febrero', 'fevereiro', 'fev', 'febbraio', 'februari'],
  ['mar', 'march', 'märz', 'maerz', 'mrz', 'mars', 'marzo', 'março', 'marco', 'maart', 'mrt'],
  ['apr', 'april', 'avril', 'avr', 'abril', 'abr', 'aprile'],
  ['may', 'mai', 'mayo', 'maio', 'maggio', 'mag', 'mei'],
  ['jun', 'june', 'juni', 'juin', 'junio', 'junho', 'giugno', 'giu'],
  ['jul', 'july', 'juli', 'juillet', 'juil', 'julio', 'julho', 'luglio', 'lug'],
  ['aug', 'august', 'août', 'aout', 'agosto', 'ago', 'augustus', 'aug'],
  ['sep', 'sept', 'september', 'septembre', 'septiembre', 'setembro', 'set', 'settembre'],
  ['oct', 'october', 'okt', 'oktober', 'octobre', 'octubre', 'outubro', 'out', 'ottobre', 'ott'],
  ['nov', 'november', 'novembre', 'noviembre', 'novembro'],
  ['dec', 'december', 'dez', 'dezember', 'décembre', 'decembre', 'diciembre', 'dezembro', 'dicembre', 'dic', 'déc'],
].forEach((names, index) => names.forEach((name) => { MONTH_LOOKUP[name] = index + 1; }));

/** Full month names, for dates printed in words (a date of birth). */
export const MONTH_NAMES: Record<CvLocale, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  it: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
  nl: ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'],
};

/** 1 to 12 for a month name or abbreviation in any supported language, or null. */
export function monthFromWord(word: string): number | null {
  return MONTH_LOOKUP[word.toLowerCase().replace(/\.$/, '')] ?? null;
}

/** Wordings for "still in this role" in every supported language, compared lowercase, accents and apostrophes ignored. */
const PRESENT_WORDS = new Set(
  [
    // en
    'present', 'current', 'currently', 'now', 'ongoing', 'today', 'to date', 'till date',
    // de
    'heute', 'aktuell', 'gegenwart', 'derzeit', 'bis heute', 'bis jetzt', 'laufend',
    // fr
    'présent', 'actuel', "aujourd'hui", "aujourd’hui", 'à ce jour', 'en cours', 'actuellement', 'à présent', "jusqu'à aujourd'hui", "jusqu’à aujourd’hui",
    // es
    'actualidad', 'actual', 'actualmente', 'hoy', 'hasta la actualidad', 'hasta hoy', 'presente',
    // pt
    'atual', 'atualmente', 'atualidade', 'até ao presente', 'até hoje', 'até à data',
    // it
    'attuale', 'attualmente', 'oggi', 'ad oggi', 'fino ad oggi', 'in corso',
    // nl
    'heden', 'nu', 'huidig', 'momenteel', 'tot heden', 'tot nu', 'tot op heden',
  ].map((word) => fold(word.replace(/[’]/g, "'"))),
);

const PRESENT_TOKENS = { test: (value: string): boolean => PRESENT_WORDS.has(fold(value.trim().replace(/[’]/g, "'")).replace(/\s+/g, ' ')) };

function normalizeDashes(value: string): string {
  return value.replace(/\s*[‐-―−]\s*/g, ' - ').replace(/\s{2,}/g, ' ').trim();
}

function formatMonthYear(month: number, year: number, locale: CvLocale): string {
  // English prints a short month name; every other supported language prints MM/YYYY.
  if (locale !== 'en') return `${String(month).padStart(2, '0')}/${year}`;
  return `${EN_MONTHS[month - 1]} ${year}`;
}

/** One date as the CV prints it. Unrecognised text is returned unchanged, with dashes made plain hyphens. */
export function formatCvDate(raw: string | undefined, locale: CvTextLocale): string {
  const value = normalizeDashes((raw ?? '').trim());
  if (!value || locale === 'other') return value;
  let match = value.match(/^(\d{1,2})\s*[./-]\s*(\d{4})$/);
  if (match) {
    const month = Number(match[1]);
    if (month >= 1 && month <= 12) return formatMonthYear(month, Number(match[2]), locale);
  }
  // DD.MM.YYYY: only the month and year are kept.
  match = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (match) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return formatMonthYear(month, Number(match[3]), locale);
  }
  match = value.match(/^(\d{4})\s*[./-]\s*(\d{1,2})$/);
  if (match) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return formatMonthYear(month, Number(match[1]), locale);
  }
  match = value.match(/^([\p{L}]+)\.?,?\s+(\d{4})$/u);
  if (match) {
    const month = MONTH_LOOKUP[match[1].toLowerCase()];
    if (month) return formatMonthYear(month, Number(match[2]), locale);
  }
  return value;
}

/** What each language prints for an open-ended role. */
const PRESENT_LABELS: Record<CvLocale, string> = {
  en: 'Present',
  de: 'heute',
  fr: 'Aujourd’hui',
  es: 'Actualidad',
  pt: 'Atualmente',
  it: 'Presente',
  nl: 'Heden',
};

/** What the CV says for an open-ended role. */
export function presentLabel(data: CVData, locale: CvTextLocale): string {
  if (locale !== 'other') return PRESENT_LABELS[locale];
  return data.localizedStrings?.present || 'Present';
}

/** "Mar 2022 - Present" or "03/2022 - heute". */
export function formatDateRange(
  data: CVData,
  range: { startDate?: string; endDate?: string; current?: boolean },
): string {
  const locale = inferCvLocale(data);
  const start = formatCvDate(range.startDate, locale);
  const rawEnd = (range.endDate ?? '').trim();
  const end = range.current || PRESENT_TOKENS.test(rawEnd)
    ? presentLabel(data, locale)
    : formatCvDate(rawEnd, locale);
  if (start && end) return `${start} - ${end}`;
  return start || end;
}

/** A single graduation or issue date. */
export function formatSingleDate(data: CVData, raw: string | undefined): string {
  return formatCvDate(raw, inferCvLocale(data));
}

export type UiTextKey =
  | 'gradePrefix'
  | 'degreeConnector'
  | 'websiteLabel'
  | 'dateOfBirthLabel'
  | 'nationalityLabel'
  | 'cityLabel'
  | 'dateLabel'
  | 'signatureLabel'
  | 'photoPlaceholder';

const UI_DEFAULTS: Record<CvLocale, Record<UiTextKey, string>> = {
  en: {
    gradePrefix: 'GPA:',
    degreeConnector: 'in',
    websiteLabel: 'Website',
    dateOfBirthLabel: 'Date of Birth',
    nationalityLabel: 'Nationality',
    cityLabel: 'City',
    dateLabel: 'Date',
    signatureLabel: 'Signature',
    photoPlaceholder: 'Photo',
  },
  de: {
    gradePrefix: 'Note:',
    degreeConnector: 'in',
    websiteLabel: 'Webseite',
    dateOfBirthLabel: 'Geburtsdatum',
    nationalityLabel: 'Staatsangehörigkeit',
    cityLabel: 'Ort',
    dateLabel: 'Datum',
    signatureLabel: 'Unterschrift',
    photoPlaceholder: 'Foto',
  },
  fr: {
    gradePrefix: 'Mention\u202F:',
    degreeConnector: 'en',
    websiteLabel: 'Site web',
    dateOfBirthLabel: 'Date de naissance',
    nationalityLabel: 'Nationalité',
    cityLabel: 'Ville',
    dateLabel: 'Date',
    signatureLabel: 'Signature',
    photoPlaceholder: 'Photo',
  },
  es: {
    gradePrefix: 'Nota:',
    degreeConnector: 'en',
    websiteLabel: 'Sitio web',
    dateOfBirthLabel: 'Fecha de nacimiento',
    nationalityLabel: 'Nacionalidad',
    cityLabel: 'Ciudad',
    dateLabel: 'Fecha',
    signatureLabel: 'Firma',
    photoPlaceholder: 'Foto',
  },
  pt: {
    gradePrefix: 'Nota:',
    degreeConnector: 'em',
    websiteLabel: 'Sítio Web',
    dateOfBirthLabel: 'Data de nascimento',
    nationalityLabel: 'Nacionalidade',
    cityLabel: 'Cidade',
    dateLabel: 'Data',
    signatureLabel: 'Assinatura',
    photoPlaceholder: 'Foto',
  },
  it: {
    gradePrefix: 'Voto:',
    degreeConnector: 'in',
    websiteLabel: 'Sito web',
    dateOfBirthLabel: 'Data di nascita',
    nationalityLabel: 'Nazionalità',
    cityLabel: 'Città',
    dateLabel: 'Data',
    signatureLabel: 'Firma',
    photoPlaceholder: 'Foto',
  },
  nl: {
    gradePrefix: 'Cijfer:',
    degreeConnector: 'in',
    websiteLabel: 'Website',
    dateOfBirthLabel: 'Geboortedatum',
    nationalityLabel: 'Nationaliteit',
    cityLabel: 'Plaats',
    dateLabel: 'Datum',
    signatureLabel: 'Handtekening',
    photoPlaceholder: 'Foto',
  },
};

/** The small labels and the open-ended word of one language, in the shape the parser stores them (`localizedStrings`). */
export function localizedStrings(locale: CvLocale): Record<string, string> {
  return { present: PRESENT_LABELS[locale], ...UI_DEFAULTS[locale] };
}

/**
 * A small label the templates print. For the seven supported languages the table above is
 * authoritative (it has the proper accents and wording); what the parser localized is used only
 * for a language outside them.
 */
/**
 * The colon after a label ("Langages :"). French sets a narrow no-break space (U+202F) before it, so the colon
 * never starts a line; every other supported language writes it directly after the word.
 */
export function labelColon(data: CVData): string {
  return inferCvLocale(data) === 'fr' ? '\u202F:' : ':';
}

/** Prepositions that join a degree to its field, by language, as whole words (an apostrophe prefix counts: d’, l'). A word that only starts with one ("Diplom", "Informatik") does not. */
const DEGREE_PREPOSITIONS = /(?:^|[\s(])(?:(?:in|of|on|en|de|del|du|des|em|do|da|di|van|voor|für|zu)(?=[\s),]|$)|[dl]['’])/iu;

/**
 * A degree and its field: "B.S. in Computer Science", "Diplôme d’ingénieur, Informatique". The connector word goes
 * between them only when the degree does not already hold a preposition phrase ("Grado en Ingeniería"), and never in
 * Spanish or German, which write the field after a comma. A connector is never doubled.
 */
export function degreeText(data: CVData, edu: { degree: string; field?: string }): string {
  const degree = edu.degree.trim();
  const field = edu.field?.trim();
  if (!field) return degree;
  const locale = inferCvLocale(data);
  if (locale === 'es' || locale === 'de' || DEGREE_PREPOSITIONS.test(degree)) return `${degree}, ${field}`;
  return `${degree} ${uiText(data, 'degreeConnector')} ${field}`;
}

export function uiText(data: CVData, key: UiTextKey): string {
  const locale = inferCvLocale(data);
  if (locale !== 'other') return UI_DEFAULTS[locale][key];
  return data.localizedStrings?.[key] || UI_DEFAULTS.en[key];
}
