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
    String.raw`\b(?:driving|driver['’]?s|drivers?)\s+licen[cs]e`,
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
const LICENCE_WORD = /\b(?:licen[cs]e|permis|patente|carnet|cdl)\b/i;
const LICENCE_CLASS = new RegExp(
  [
    String.raw`\b(?:class|category|cat|klasse|kategorie|catégorie|categoría|categoria)\b`,
    String.raw`\(\s*[a-e][1-9]?e?\s*\)`,
    String.raw`:\s*[a-e][1-9]?e?\b`,
    String.raw`\b(?:licen[cs]e|permis|patente|carnet|cdl)\s+[a-e][1-9]?e?\b`,
  ].join('|'),
  'i',
);

const normalised = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * True when the text states a driving licence. `driverLicense` (the CV's own
 * value, "Class B") also counts next to a licence word: "UK licence, Class B".
 */
export function mentionsDrivingLicence(text: string, driverLicense?: string): boolean {
  if (DRIVING_LICENCE.test(text)) return true;
  if (!LICENCE_WORD.test(text)) return false;
  if (LICENCE_CLASS.test(text)) return true;
  const value = driverLicense ? normalised(driverLicense) : '';
  return value.length > 0 && normalised(text).includes(value);
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
