/**
 * A CV keeps its driving licence in `personal.driverLicense`, and the writer
 * often also keeps the source line ("Driving licence: Class B") in
 * additionalInfo. Every renderer that prints a licence line of its own checks
 * here first and stays quiet when an item already states one. Nothing here
 * removes or rewrites the user's own lines.
 */
import type { SupportedLanguage } from '@/lib/utils/language-detector';

/**
 * A driving licence specifically. A licence word alone ("Licensed pharmacist",
 * "Pilot licence (PPL)") or a driving word alone ("Driving force", "Driver for
 * change") is not one, and "patented" is not Italian "patente B".
 */
const DRIVING_LICENCE = new RegExp(
  [
    // Straight or curly apostrophe: CV text parsed from Word or PDF has "Driver’s".
    String.raw`\b(?:driving|driver['’]?s|drivers?)\s+(?:licen[cs]es?|permits?)\b`,
    String.raw`\b(?:international|valid)\s+driving\s+permit\b`,
    String.raw`\blicen[çc]a\s+de\s+condu(?:ção|cao|zir)\b`,
    String.raw`\bfull\s+(?:clean\s+)?(?:uk\s+)?licen[cs]e\b`,
    String.raw`\blicen[cs]e\s+to\s+drive\b`,
    'f(?:ü|ue|u)hrerschein',
    'fahrerlaubnis',
    String.raw`\bpermis\s+de\s+conduire\b`,
    String.raw`\b(?:carnet|permiso)\s+de\s+conduc(?:ir|ción|cion)\b`,
    String.raw`\bpatente\s+(?:di\s+guida|[a-e]\d?)\b`,
    String.raw`\bcarta\s+de\s+condu(?:ção|cao)\b`,
    String.raw`\brijbewijs\b`,
  ].join('|'),
  'i',
);

// A bare licence word ("Licence: B", "Class B licence", "CDL Class A", "Permis B") counts only
// with a licence class next to it, so "Pilot licence (PPL)" or "Software license" never does.
const LICENCE_WORD = /\b(?:licen[cs]es?|permis|patente|carnet|cdl)\b/i;
// The class words are any case; a class LETTER must be a capital (B, BE, C1, "B, BE"), so the
// French and Spanish word "de" ("Permis de travail", "Carnet de identidad") is never a class.
const CLASS_WORD = /\b(?:class|category|cat|klasse|kategorie|catégorie|categoría|categoria)\b/i;
const CLASS_LETTERS = String.raw`[A-E][1-9]?E?(?:\s*,\s*[A-E][1-9]?E?)*`;
const CLASS_LETTER = new RegExp(
  [
    String.raw`\(\s*${CLASS_LETTERS}\s*\)`,
    String.raw`:\s*${CLASS_LETTERS}(?![\p{L}\p{N}])`,
    String.raw`\b(?:[Ll]icen[cs]es?|[Pp]ermis|[Pp]atente|[Cc]arnet|CDL|cdl)\s+${CLASS_LETTERS}(?![\p{L}\p{N}])`,
  ].join('|'),
  'u',
);
// Other permits and licences that also come with a class or category: never a driving licence.
const OTHER_PERMIT = /\b(?:work|working|residence|resident|travail|séjour|sejour|aufenthalt\p{L}*|arbeit\p{L}*|identidad|identity|firearms?|gun|security|sia|real\s+estate|fishing|hunting|shares?|liquor|pilot|corso|software|trading)\b/iu;

const normalised = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * True when the text states a driving licence. `driverLicense` (the CV's own
 * value, "Class B") also counts, as a whole word, next to a licence word:
 * "UK licence, Class B".
 */
export function mentionsDrivingLicence(text: string, driverLicense?: string): boolean {
  if (DRIVING_LICENCE.test(text)) return true;
  if (!LICENCE_WORD.test(text) || OTHER_PERMIT.test(text)) return false;
  if (CLASS_WORD.test(text) || CLASS_LETTER.test(text)) return true;
  const value = driverLicense ? normalised(driverLicense) : '';
  if (!value) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(value)}(?![\\p{L}\\p{N}])`, 'u').test(normalised(text));
}

/** True when any item of the list states a driving licence. */
export function listMentionsDrivingLicence(items: readonly string[] | undefined, driverLicense?: string): boolean {
  return (items ?? []).some((item) => mentionsDrivingLicence(item, driverLicense));
}

const LICENCE_LABEL: Record<SupportedLanguage, string> = {
  en: "Driver's License",
  de: 'Führerschein',
  fr: 'Permis de conduire',
  es: 'Carnet de conducir',
  pt: 'Carta de condução',
  it: 'Patente di guida',
  nl: 'Rijbewijs',
};

/** "Führerschein: Klasse B" for a German CV, "Driver's License: Class B" for an English one. */
export function drivingLicenceLine(driverLicense: string, language: string | undefined): string {
  const label = LICENCE_LABEL[(language ?? 'en') as SupportedLanguage] ?? LICENCE_LABEL.en;
  return `${label}: ${driverLicense}`;
}

/**
 * additionalInfo with the licence printed once: the user's items unchanged, plus
 * a licence line in the CV's language only when no item states one already.
 */
export function withDrivingLicenceLine(
  items: readonly string[] | undefined,
  driverLicense: string | undefined,
  language: string | undefined,
): string[] | undefined {
  const licence = driverLicense?.trim();
  if (!licence || listMentionsDrivingLicence(items, licence)) return items ? [...items] : undefined;
  return [...(items ?? []), drivingLicenceLine(licence, language)];
}
