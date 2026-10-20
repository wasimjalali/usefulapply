/**
 * Locale-aware text for the CV templates and exports: standard ATS section
 * headings, date formats and date ranges. Pure functions, no React, so the
 * templates, the DOCX builder and the eval all use the same text.
 *
 * Product rule: date ranges use a plain hyphen, never an en or em dash.
 */

import type { CVData } from './types';

export type CvLocale = 'en' | 'de';

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
};

/** Wordings the AI and the parser produce for each section. They normalize to the standard heading. */
const SYNONYMS: Record<HeadingKey, string[]> = {
  summary: [
    'summary', 'professional summary', 'executive summary', 'career summary', 'profile', 'professional profile',
    'about me', 'objective', 'career objective', 'profil', 'berufsprofil', 'kurzprofil', 'zusammenfassung',
    'persönliches profil', 'berufliches profil', 'über mich', 'kurzvorstellung',
  ],
  experience: [
    'experience', 'professional experience', 'work experience', 'employment history', 'work history',
    'career history', 'relevant experience', 'employment', 'berufserfahrung', 'beruflicher werdegang',
    'berufliche erfahrung', 'werdegang', 'praxiserfahrung', 'berufliche laufbahn', 'beruflicher hintergrund',
  ],
  education: [
    'education', 'education & training', 'education and training', 'academic background', 'academic qualifications',
    'ausbildung', 'bildungsweg', 'akademischer werdegang', 'schulbildung', 'studium', 'ausbildung & studium',
    'bildung', 'akademische ausbildung',
  ],
  skills: [
    'skills', 'core competencies', 'technical skills', 'key skills', 'competencies', 'core skills',
    'skills & competencies', 'skills and competencies', 'areas of expertise', 'kenntnisse', 'fähigkeiten',
    'kompetenzen', 'kernkompetenzen', 'fachkenntnisse', 'it-kenntnisse', 'kenntnisse & fähigkeiten',
    'kenntnisse und fähigkeiten', 'fertigkeiten',
  ],
  certifications: [
    'certifications', 'certificates', 'licenses & certifications', 'licenses and certifications',
    'certifications & licenses', 'zertifikate', 'zertifizierungen', 'weiterbildungen', 'weiterbildung',
    'fortbildungen', 'fortbildung',
  ],
  languages: ['languages', 'language skills', 'sprachen', 'sprachkenntnisse'],
  projects: ['projects', 'selected projects', 'projekte', 'ausgewählte projekte'],
  additionalInfo: [
    'additional information', 'additional info', 'weitere angaben', 'zusätzliche angaben', 'sonstiges',
    'weitere informationen',
  ],
};

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

/** The language the CV text is written in, for headings and dates. Explicit `data.language` wins. */
export function inferCvLocale(data: CVData): CvTextLocale {
  const explicit = data.language?.toLowerCase();
  if (explicit) {
    if (explicit.startsWith('de')) return 'de';
    return explicit.startsWith('en') ? 'en' : 'other';
  }
  const headers = Object.values(data.sectionHeaders ?? {}).join(' ');
  if (GERMAN_HEADER_HINT.test(headers)) return 'de';
  if (/^(heute|aktuell|gegenwart|derzeit)$/i.test(data.localizedStrings?.present ?? '')) return 'de';
  const sample = [data.summary ?? '', ...data.experience.flatMap((exp) => exp.bullets.slice(0, 3))]
    .join(' ')
    .toLowerCase()
    .match(/[\p{L}]+/gu);
  if (sample && sample.length >= 12) {
    const { german, other } = languageShares(sample);
    // The other languages are checked first: French and Dutch share words with German and English.
    if (other > 0.12 && other > german * 1.1) return 'other';
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
  if (args.locale !== 'other' && SYNONYMS[args.key].includes(stripLabel(provided))) return standard;
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
  ['jan', 'january', 'januar', 'janvier', 'enero', 'gennaio', 'januari'],
  ['feb', 'february', 'februar', 'février', 'fevrier', 'febrero', 'febbraio', 'februari'],
  ['mar', 'march', 'märz', 'maerz', 'mrz', 'mars', 'marzo', 'maart'],
  ['apr', 'april', 'avril', 'abril', 'aprile'],
  ['may', 'mai', 'mayo', 'maggio', 'mei'],
  ['jun', 'june', 'juni', 'juin', 'junio', 'giugno'],
  ['jul', 'july', 'juli', 'juillet', 'julio', 'luglio'],
  ['aug', 'august', 'août', 'aout', 'agosto', 'augustus'],
  ['sep', 'sept', 'september', 'septembre', 'septiembre', 'settembre'],
  ['oct', 'october', 'okt', 'oktober', 'octobre', 'octubre', 'ottobre', 'okt'],
  ['nov', 'november', 'novembre', 'noviembre'],
  ['dec', 'december', 'dez', 'dezember', 'décembre', 'decembre', 'diciembre', 'dicembre', 'dic'],
].forEach((names, index) => names.forEach((name) => { MONTH_LOOKUP[name] = index + 1; }));

const PRESENT_TOKENS = /^(present|current|now|ongoing|today|heute|aktuell|gegenwart|derzeit|bis heute|présent|actuel|actualidad|presente|heden)$/i;

function normalizeDashes(value: string): string {
  return value.replace(/\s*[‐-―−]\s*/g, ' - ').replace(/\s{2,}/g, ' ').trim();
}

function formatMonthYear(month: number, year: number, locale: CvLocale): string {
  if (locale === 'de') return `${String(month).padStart(2, '0')}/${year}`;
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

/** What the CV says for an open-ended role. */
export function presentLabel(data: CVData, locale: CvTextLocale): string {
  if (locale === 'de') return 'heute';
  if (locale === 'en') return 'Present';
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
};

/** A small label the templates print. What the parser localized wins; the default follows the CV language. */
export function uiText(data: CVData, key: UiTextKey): string {
  const locale = inferCvLocale(data);
  return data.localizedStrings?.[key] || UI_DEFAULTS[locale === 'de' ? 'de' : 'en'][key];
}
