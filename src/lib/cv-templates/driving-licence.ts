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
    String.raw`\b(?:driving|driver'?s|drivers?)\s+licen[cs]e`,
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

/** True when the text states a driving licence. */
export function mentionsDrivingLicence(text: string): boolean {
  return DRIVING_LICENCE.test(text);
}

/** True when any item of the list states a driving licence. */
export function listMentionsDrivingLicence(items: readonly string[] | undefined): boolean {
  return (items ?? []).some(mentionsDrivingLicence);
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
  if (!licence || listMentionsDrivingLicence(items)) return items ? [...items] : undefined;
  return [...(items ?? []), drivingLicenceLine(licence, language)];
}
