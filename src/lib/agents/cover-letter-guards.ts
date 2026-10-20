/**
 * Deterministic guards for the parts of a cover letter the model writes about
 * the employer: the recipient (company, contact, department, postal address),
 * the salutation, the subject and the closing.
 *
 * Every recipient detail must be the ad's own text, placed where an ad tells
 * applicants where to write. Every salutation that names a person must name
 * the one contact the letter is addressed to, and a gendered form (Frau, Ms.,
 * Madame, geehrter, Estimada...) needs that title stated for that same person.
 * These fields are optional, so a miss never costs the letter: each resolver
 * falls back to a fixed form (a titled, neutral or generic greeting, a
 * code-built subject, a default closing, no address).
 * Pure functions, no model calls, so the eval can exercise them offline.
 */

import type { SupportedLanguage } from '@/lib/utils/language-detector';

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const DASHES = new RegExp(`[${EM_DASH}${EN_DASH}]`, 'gu');

/** One line, collapsed whitespace, en and em dashes as plain hyphens. */
export function cleanLetterText(value: string | null | undefined): string {
  return (value ?? '').replace(DASHES, '-').replace(/[\s\p{Cc}]+/gu, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A regex source for a phrase: any whitespace run, ß or ss, any dash, any case (with the iu flags). */
function phrasePattern(phrase: string): string {
  return cleanLetterText(phrase.normalize('NFKC'))
    .split(' ')
    .filter(Boolean)
    .map((token) => escapeRegExp(token).replace(/ß|ss/giu, '(?:ß|ss)').replace(/-/gu, `[-${EN_DASH}${EM_DASH}]`))
    .join('\\s+');
}

const BEFORE = '(?<![\\p{L}\\p{N}])';
const AFTER = '(?![\\p{L}\\p{N}])';

/**
 * The ad's own text for a phrase the model copied from it, or undefined when
 * the ad doesn't contain it. Matching ignores case, whitespace, ß/ss and dash
 * style; the result keeps the ad's spelling and casing, dashes as hyphens.
 */
export function adPhrase(adText: string, phrase: string | null | undefined): string | undefined {
  const source = phrasePattern(phrase ?? '');
  if (!source) return undefined;
  const match = adText.normalize('NFKC').match(new RegExp(`${BEFORE}${source}${AFTER}`, 'iu'));
  return match ? cleanLetterText(match[0]) : undefined;
}

// ---------------------------------------------------------------------------
// Where in the ad: application wording, workplaces, boilerplate, legal footers
// ---------------------------------------------------------------------------

// An explicit "send your application to" instruction. Within 80 characters
// before a detail it wins over everything else.
const SUBMISSION = new RegExp([
  '(?:send|mail|submit|e-?mail|forward|direct)\\s+(?:us\\s+)?(?:your\\s+)?(?:application|applications|resume|resumes|résumé|résumés|cv|cvs|cover\\s+letter)\\b[^.!?\\n]{0,70}?\\bto\\b',
  'bewerbung(?:en)?\\b[^.!?\\n]{0,70}?\\ban\\b',
  'bewerbungen\\s+richten\\s+sie',
  'ihre\\s+(?:bewerbungs)?unterlagen\\b[^.!?\\n]{0,70}?\\ban\\b',
  'adresser\\s+votre\\s+candidature[^.!?\\n]{0,70}?(?<!\\p{L})à(?!\\p{L})',
  'env[ií]a(?:r|nos)?\\s+(?:tu|su)\\s+(?:solicitud|cv|candidatura)[^.!?\\n]{0,70}?\\ba\\b',
  'stuur\\s+(?:je|uw)\\s+(?:sollicitatie|cv)[^.!?\\n]{0,70}?\\bnaar\\b',
].join('|'), 'giu');
const SUBMISSION_REACH = 80;

// Wording that tells applicants where to write or who to contact.
const PLACEMENT_ANCHOR = /(?:contact|kontakt)\s*:|ansprechpartner|anschrift|our\s+office|headquarters|hauptsitz|firmensitz|address|adresse|apply|application|candidature|postuler|solicitud|sollicitatie|send\s+(?:your|us)|(?:mail|submit)\s+(?:resumes|applications)\s+to|mail\s+to|mail\s+your/iu;
const ANCHOR_WINDOW = 250;
// A place of work or a client site is not where applications go.
const WORKPLACE = /einsatzort|arbeitsort|dienstort|work\s+location|job\s*site|on[-\s]site\s+at|place\s+of\s+work|workplace/iu;
const WORKPLACE_WINDOW = 120;
// Accommodation, equal-opportunity, privacy and legal notices: an address or
// name there is not where applications go. Checked before the detail only.
const BOILERPLATE = /accommodation|disabilit|equal\s+(?:employment|opportunity)|\beeo\b|veteran|privacy|datenschutz|impressum|handelsregister|registergericht|amtsgericht|copyright|©|barrierefrei|schwerbehindert/iu;
const BOILERPLATE_WINDOW = 300;
// Imprint and legal names: an officer of the company is not an application contact.
const LEGAL_NAME = /geschäftsführ|geschaeftsfuehr|impressum|vorstand|aufsichtsrat|registergericht|handelsregister|amtsgericht|\bceo\b|managing\s+director|board\s+of\s+directors|chairman|vorsitzende/iu;
const LEGAL_BEFORE = 150;
const LEGAL_AFTER = 60;

function submissionWithinReach(ad: string, start: number): boolean {
  const windowStart = Math.max(0, start - SUBMISSION_REACH - 140);
  const before = ad.slice(windowStart, start);
  let lastEnd = -1;
  for (const match of before.matchAll(SUBMISSION)) lastEnd = (match.index ?? 0) + match[0].length;
  return lastEnd >= 0 && before.length - lastEnd <= SUBMISSION_REACH;
}

/**
 * A detail at [start, end) in the ad sits where applications go: an explicit
 * submission instruction within reach wins; otherwise it must not follow a
 * workplace label or sit in boilerplate, and must follow a company name, the
 * contact person or application wording.
 */
function placedForApplications(ad: string, start: number, end: number, anchors: Array<string | undefined>, isPerson: boolean): boolean {
  if (submissionWithinReach(ad, start)) return true;
  if (WORKPLACE.test(ad.slice(Math.max(0, start - WORKPLACE_WINDOW), start))) return false;
  if (BOILERPLATE.test(ad.slice(Math.max(0, start - BOILERPLATE_WINDOW), start))) return false;
  if (isPerson && LEGAL_NAME.test(ad.slice(Math.max(0, start - LEGAL_BEFORE), Math.min(ad.length, end + LEGAL_AFTER)))) return false;
  const before = ad.slice(Math.max(0, start - ANCHOR_WINDOW), start);
  return PLACEMENT_ANCHOR.test(before) || anchors.some((anchor) => Boolean(anchor && adPhrase(before, anchor)));
}

/**
 * The ad's own text for the application contact person, or undefined. The
 * name must appear in the ad where applicants are told to write (the same
 * placement test as the address), never only in an imprint or legal footer.
 */
export function adContactPerson(adText: string, phrase: string | null | undefined, anchors: Array<string | undefined> = []): string | undefined {
  const source = phrasePattern(phrase ?? '');
  if (!source) return undefined;
  const ad = adText.normalize('NFKC');
  for (const match of ad.matchAll(new RegExp(`${BEFORE}${source}${AFTER}`, 'giu'))) {
    const start = match.index ?? 0;
    if (placedForApplications(ad, start, start + match[0].length, anchors, true)) return cleanLetterText(match[0]);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Postal address
// ---------------------------------------------------------------------------

const MAX_ADDRESS_LINE = 100;

const STREET_SUFFIX = '(?:street|st|avenue|ave|road|rd|boulevard|blvd|expressway|expy|freeway|drive|dr|lane|ln|way|court|ct|place|pl|parkway|pkwy|highway|hwy|terrace|square|sq|straße|strasse|str|weg|gasse|platz|allee|ring|damm|ufer|chaussee|steig|pfad|rue|calle|avenida|via|viale|straat|laan|plein)\\.?';

// "Industriestraße 14", "Alexanderplatz 1", "Hauptstr. 5a", "Weg 3-5"
const STREET_NAME_FIRST = /^\p{L}[\p{L}.'\- ]*\s\d{1,4}\s?[a-z]?(?:\s?[-/]\s?\d{1,4}\s?[a-z]?)?$/iu;
// "220 West Lake Street, Suite 1400", "10000 North Central Expressway", "12 rue de la République"
const STREET_NUMBER_FIRST = /^\d{1,6}[a-z]?,?\s+\p{L}[\p{L}\p{N}.,'#\- ]*$/iu;
// "Postfach 12 34 56", "PO Box 12345", "P.O. Box 123456"
const PO_BOX = /^(?:postfach\s+\d{1,6}(?:\s\d{1,3}){0,3}|p\.?\s?o\.?\s?box\s+\d{1,6})$/iu;
// "90431 Nürnberg", "D-90431 Nürnberg", "1010 Wien": ends in a city, never a street suffix.
const POSTCODE_CITY_EU = new RegExp(`^(?:[A-Z]{1,2}-)?\\d{4,5}\\s+(?!.*(?<!\\p{L})${STREET_SUFFIX}$)\\p{L}[\\p{L}.'\\- ]*$`, 'iu');
// "1100-053 Lisboa"
const POSTCODE_CITY_PT = /^\d{4}-\d{3}\s+\p{L}[\p{L}.'\- ]*$/u;
// "Toronto, ON M5X 1A9"
const POSTCODE_CITY_CA = /^\p{L}[\p{L}.'\- ]*,?\s+(?:AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d$/u;
// "London SW1A 2AA", "Manchester, M1 1AE"
const POSTCODE_CITY_UK = /^\p{L}[\p{L}.'\- ]*,?\s+[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/u;
// "Chicago, IL 60606", "Chicago IL 60606", "Chicago, Illinois 60606"
const POSTCODE_CITY_US = /^(\p{L}[\p{L}.'\- ]*?),?\s+(\p{L}[\p{L} ]*?)\s+\d{5}(?:-\d{4})?$/u;

export const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC', 'PR', 'GU', 'VI', 'AS', 'MP',
]);
const US_STATE_NAMES = new Set([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'georgia',
  'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland',
  'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire',
  'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania',
  'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington',
  'west virginia', 'wisconsin', 'wyoming', 'district of columbia', 'puerto rico', 'guam',
]);

// Email, web, labelled phone or fax, or a line of digits and phone punctuation only.
const CONTACT_LINE = /@|https?:\/\/|www\.|\+\d|^(?:tel|telefon|phone|fax|mobil|e-?mail)\b|^[\d\s()+/.-]+$/iu;
// "c/o Regus", "Haus 3", "Gebäude B", "Building 2" (before the street)
const PREFIX_LINE = /^(?:c\/o\s+\S.{0,80}|(?:haus|gebäude|geb\.|building|bldg\.?|block|tower|turm)\s+[\p{L}\p{N}-]{1,6})$/iu;
// "Suite 1400", "3. OG", "Haus 3", "c/o Regus" (between street and postcode)
const UNIT_LINE = /^[\p{L}\p{N}.,#'/\- ]{1,40}$/u;
const COUNTRY_LINE = /^\p{L}[\p{L} .'-]{1,29}$/u;
const LINE_SEPARATOR = /\s+\|\s+|\s+·\s+|\s+-\s+|\s*;\s*/u;
const LINE_GAP = '(?:[\\s,;|·*_]|\\s-\\s){1,10}';

function isUsCityLine(line: string): boolean {
  const match = line.match(POSTCODE_CITY_US);
  if (!match) return false;
  const state = match[2].trim();
  return US_STATE_CODES.has(state) || US_STATE_NAMES.has(state.toLocaleLowerCase());
}

/** A postcode-plus-city line in any supported format. */
export function isPostcodeCityLine(line: string): boolean {
  return POSTCODE_CITY_EU.test(line) || POSTCODE_CITY_PT.test(line) || POSTCODE_CITY_CA.test(line)
    || POSTCODE_CITY_UK.test(line) || isUsCityLine(line);
}

function isStreetLine(line: string): boolean {
  return (STREET_NAME_FIRST.test(line) || STREET_NUMBER_FIRST.test(line) || PO_BOX.test(line)) && !isPostcodeCityLine(line);
}

/** A model line split into address lines: markdown stripped, separators and a trailing "City, ST 12345" split off. */
function splitModelLine(line: string): string[] {
  return cleanLetterText(line.replace(/[*_]+/gu, ' '))
    .split(LINE_SEPARATOR)
    .flatMap((part) => {
      const segments = part.split(/\s*,\s*/u);
      if (segments.length < 2 || isPostcodeCityLine(part)) return [part];
      for (let take = 1; take <= Math.min(3, segments.length - 1); take++) {
        const tail = segments.slice(-take).join(', ');
        if (isPostcodeCityLine(tail)) return [segments.slice(0, -take).join(', '), tail];
      }
      return [part];
    })
    .map((part) => part.trim())
    .filter(Boolean);
}

export interface AddressAnchors {
  companyName?: string;
  contactPerson?: string;
  department?: string;
}

/**
 * The employer's postal address as the ad writes it, or [] (all or nothing).
 *
 * 1. Each model line is split on separators (" | ", " · ", " - ", ";"), with
 *    markdown stripped and a trailing postcode-plus-city part split off.
 *    Contact lines (email, web, phone, fax, digits only) and lines repeating
 *    the company, contact or department are set aside. Lines over 100
 *    characters drop the address.
 * 2. Shape: an optional c/o or building line, a street line with a house
 *    number (or a PO box), at most one unit line, a postcode-plus-city line
 *    (DE/AT/CH/NL/FR 4-5 digits, PT 1234-567, US "City, ST 12345" or a full
 *    state name, Canada, UK) and at most one country line.
 * 3. The lines appear in the ad as ONE block, in this order, separated only by
 *    whitespace, commas, separators or markdown, so lines from two offices
 *    can't be spliced together.
 * 4. The block sits where applications go (see placedForApplications).
 * The lines returned are the ad's own text.
 */
export function extractAdAddress(value: unknown, adText: string, anchors: AddressAnchors = {}): string[] {
  if (!Array.isArray(value)) return [];
  const raw = value.filter((line): line is string => typeof line === 'string');
  if (raw.some((line) => line.length > MAX_ADDRESS_LINE * 2)) return [];
  const repeats = [anchors.companyName, anchors.contactPerson, anchors.department]
    .filter((field): field is string => Boolean(field))
    .map((field) => cleanLetterText(field).toLocaleLowerCase());
  const lines = raw
    .flatMap(splitModelLine)
    .filter((line) => !CONTACT_LINE.test(line))
    .filter((line) => !repeats.includes(line.toLocaleLowerCase()));
  if (lines.length < 2 || lines.length > 5 || lines.some((line) => line.length > MAX_ADDRESS_LINE)) return [];

  let i = 0;
  if (PREFIX_LINE.test(lines[i]) && !isStreetLine(lines[i])) i++;
  if (!lines[i] || !isStreetLine(lines[i])) return [];
  i++;
  if (lines[i] && !isPostcodeCityLine(lines[i]) && UNIT_LINE.test(lines[i])) i++;
  if (!lines[i] || !isPostcodeCityLine(lines[i])) return [];
  i++;
  if (lines[i] && COUNTRY_LINE.test(lines[i])) i++;
  if (i !== lines.length) return [];

  const ad = adText.normalize('NFKC');
  const block = new RegExp(`${BEFORE}${lines.map((line) => `(${phrasePattern(line)})`).join(LINE_GAP)}${AFTER}`, 'iu');
  const match = block.exec(ad);
  if (!match) return [];
  if (!placedForApplications(ad, match.index, match.index + match[0].length, [anchors.companyName, anchors.contactPerson], false)) return [];
  return match.slice(1).map((line) => cleanLetterText(line));
}

// ---------------------------------------------------------------------------
// Salutation
// ---------------------------------------------------------------------------

type Gender = 'f' | 'm' | 'n';

// Titles. "m" (M. Dupont) counts only in French.
const TITLE_GENDER: Record<string, Gender> = {
  frau: 'f', herr: 'm',
  ms: 'f', mrs: 'f', miss: 'f', mr: 'm', mx: 'n',
  madame: 'f', mme: 'f', mademoiselle: 'f', mlle: 'f', monsieur: 'm',
  sr: 'm', sra: 'f', srta: 'f', 'señor': 'm', 'señora': 'f', 'señorita': 'f',
  senhor: 'm', senhora: 'f',
  sig: 'm', signor: 'm', signore: 'm', signora: 'f', signorina: 'f',
  heer: 'm', mevrouw: 'f', dhr: 'm', mevr: 'f',
};

// Adjectives that agree with the person addressed. "Gentile" is neutral.
const ADJECTIVE_GENDER: Record<string, Gender> = {
  geehrter: 'm', geehrte: 'f',
  lieber: 'm', liebe: 'f',
  estimado: 'm', estimada: 'f',
  querido: 'm', querida: 'f',
  caro: 'm', cara: 'f',
  prezado: 'm', prezada: 'f',
  exmo: 'm', exma: 'f',
  egregio: 'm', egregia: 'f',
  cher: 'm', 'chère': 'f', chere: 'f',
};

// Words a salutation may use that are neither a person's name nor gendered.
const NEUTRAL_WORDS = new Set([
  'dear', 'hello', 'hi', 'good', 'morning', 'hiring', 'manager', 'managers', 'team', 'recruiting', 'recruitment',
  'talent', 'acquisition', 'people', 'hr', 'and', 'the', 'of', 'at', 'dr', 'prof',
  'sehr', 'geehrtes', 'guten', 'tag', 'hallo', 'damen', 'und', 'herren', 'liebes', 'personalabteilung',
  'bonjour', 'équipe', 'equipe', 'recrutement', 'de', 'la', 'du', 'des', 'l', 'à', 'a',
  'estimados', 'estimadas', 'equipo', 'selección', 'seleccion', 'señores', 'senores', 'hola', 'buenos', 'días', 'dias', 'recursos', 'humanos', 'y',
  'exmos', 'exmas', 'senhores', 'equipa', 'recrutamento', 'prezados', 'bom', 'dia', 'e',
  'gentile', 'spettabile', 'di', 'selezione', 'azienda', 'buongiorno', 'ufficio', 'personale',
  'geachte', 'beste', 'wervingsteam', 'goedendag',
]);

/** The fixed greeting when nobody is named. */
export const GENERIC_LETTER_GREETINGS: Record<SupportedLanguage, string> = {
  en: 'Dear Hiring Team,',
  de: 'Sehr geehrte Damen und Herren,',
  fr: 'Madame, Monsieur,',
  es: 'Estimado equipo de selección,',
  pt: 'Exma. Equipa de Recrutamento,',
  it: 'Gentile team di selezione,',
  nl: 'Geachte heer/mevrouw,',
};

// Other generic greetings accepted as written.
const OTHER_GENERIC_GREETINGS: string[] = [
  'Dear Hiring Manager,', 'Dear Hiring Team,', 'Dear Recruiting Team,',
  'Sehr geehrte Damen und Herren,', 'Madame, Monsieur,', 'Madame, Monsieur', 'Estimados señores:', 'Estimados señores,',
  'Exmos. Senhores,', 'Spettabile Azienda,', 'Geacht wervingsteam,',
];

/** A neutral greeting by full name, for a contact whose title no source states. */
export function neutralLetterGreeting(language: SupportedLanguage, name: string): string {
  const forms: Record<SupportedLanguage, string> = {
    en: `Dear ${name},`,
    de: `Guten Tag ${name},`,
    fr: `Bonjour ${name},`,
    es: `Buenos días ${name},`,
    pt: `Bom dia ${name},`,
    it: `Gentile ${name},`,
    nl: `Geachte ${name},`,
  };
  return forms[language];
}

/** A titled greeting with the title a source states for the contact. */
function titledLetterGreeting(language: SupportedLanguage, gender: 'f' | 'm', surname: string): string {
  const forms: Record<SupportedLanguage, Record<'f' | 'm', string>> = {
    en: { f: `Dear Ms. ${surname},`, m: `Dear Mr. ${surname},` },
    de: { f: `Sehr geehrte Frau ${surname},`, m: `Sehr geehrter Herr ${surname},` },
    fr: { f: `Madame ${surname},`, m: `Monsieur ${surname},` },
    es: { f: `Estimada Sra. ${surname},`, m: `Estimado Sr. ${surname},` },
    pt: { f: `Prezada Sra. ${surname},`, m: `Prezado Sr. ${surname},` },
    it: { f: `Gentile Signora ${surname},`, m: `Gentile Signor ${surname},` },
    nl: { f: `Geachte mevrouw ${surname},`, m: `Geachte heer ${surname},` },
  };
  return forms[language][gender];
}

const NAME_PARTICLES = new Set(['von', 'van', 'der', 'den', 'de', 'la', 'le', 'du', 'del', 'di', 'da', 'zu']);

function words(value: string): string[] {
  return value.replace(/\bsig\.ra\b/giu, 'signora').match(/\p{L}+/gu) ?? [];
}

/** The person's name without titles: "Frau Dr. Melanie Brandl" -> "Melanie Brandl". */
export function personName(contact: string): string {
  return cleanLetterText(contact)
    .split(' ')
    .filter((token) => {
      const bare = token.replace(/[.,]/gu, '').toLocaleLowerCase();
      return !(bare in TITLE_GENDER) && bare !== 'dr' && bare !== 'prof';
    })
    .join(' ');
}

/** The surname with any particles before it ("Anne de Vries" -> "de Vries"). */
function surnameOf(name: string): { given: string[]; surname: string } {
  const parts = name.split(' ').filter(Boolean);
  let cut = parts.length - 1;
  while (cut > 0 && NAME_PARTICLES.has(parts[cut - 1].toLocaleLowerCase())) cut--;
  return { given: parts.slice(0, cut), surname: parts.slice(cut).join(' ') };
}

/** Titles of one gender as a regex alternation (with the optional dot). */
function titlesOf(gender: Gender, language: SupportedLanguage): string {
  const titles = Object.entries(TITLE_GENDER).filter(([, g]) => g === gender).map(([title]) => escapeRegExp(title));
  if (gender === 'm' && language === 'fr') titles.push('m');
  if (gender === 'f') titles.push('sig\\.ra');
  return titles.join('|');
}

/** A source states a title of this gender directly before this person's name. */
function titleStatedFor(person: string, gender: Gender, language: SupportedLanguage, sources: string[]): boolean {
  const { given, surname } = surnameOf(personName(person));
  if (!surname) return false;
  const optionalGiven = given.map((part) => `(?:${phrasePattern(part)}\\s+)?`).join('');
  const pattern = new RegExp(
    `${BEFORE}(?:${titlesOf(gender, language)})\\.?\\s+(?:(?:dr|prof)\\.?\\s+)*${optionalGiven}${phrasePattern(surname)}${AFTER}`,
    'iu',
  );
  return sources.some((source) => pattern.test(cleanLetterText(source.normalize('NFKC'))));
}

/** The one gender a source states for this person, if exactly one is stated. */
function statedGender(person: string, language: SupportedLanguage, sources: string[]): 'f' | 'm' | undefined {
  const female = titleStatedFor(person, 'f', language, sources);
  const male = titleStatedFor(person, 'm', language, sources);
  if (female === male) return undefined;
  return female ? 'f' : 'm';
}

export interface SalutationInput {
  salutation: unknown;
  language: SupportedLanguage;
  adText: string;
  /** Job title, so a bracketed phrase from the title is not a placeholder. */
  jobTitle?: string;
  /** The one person the letter is addressed to (saved contact, else the ad's verified contact). */
  contactPerson?: string;
  /** Company names the salutation may use ("Dear Datadog team,"). */
  companyNames: string[];
  /** Phrases the salutation may not contain (the cover letter blacklist). */
  isBlacklisted: (text: string) => boolean;
  isPlaceholder: (text: string) => boolean;
}

export interface Resolved {
  value: string;
  /** Why the model's value was replaced; undefined when it was kept. */
  fallbackReason?: string;
}

/** A bracketed phrase is a placeholder unless the ad or the job title writes it. */
export function hasUnverifiedBrackets(text: string, adText: string, jobTitle = ''): boolean {
  return (text.match(/\[[^\]]+\]/gu) ?? []).some((bracketed) => !adText.includes(bracketed) && !jobTitle.includes(bracketed));
}

/**
 * The fixed greeting for a contact: with the title a source states for them
 * (a wrong-gender title is corrected, not dropped), else the neutral full-name
 * form, else (no contact, or a one-word name) the generic greeting.
 */
export function fallbackGreeting(language: SupportedLanguage, contactPerson: string | undefined, sources: string[]): string {
  if (!contactPerson) return GENERIC_LETTER_GREETINGS[language];
  const name = personName(contactPerson);
  const gender = statedGender(contactPerson, language, [contactPerson, ...sources]);
  if (gender && name) return titledLetterGreeting(language, gender, surnameOf(name).surname);
  if (name.split(' ').filter(Boolean).length < 2) return GENERIC_LETTER_GREETINGS[language];
  return neutralLetterGreeting(language, name);
}

/** The model's salutation when it passes every rule, otherwise fallbackGreeting. */
export function resolveSalutation(input: SalutationInput): Resolved {
  const { language, contactPerson } = input;
  const fallback = (reason: string): Resolved => ({
    value: fallbackGreeting(language, contactPerson, [input.adText]),
    fallbackReason: reason,
  });

  if (typeof input.salutation !== 'string') return fallback('not text');
  let salutation = cleanLetterText(input.salutation);
  if (!salutation || input.isPlaceholder(salutation) || !/\p{L}/u.test(salutation)) return fallback('empty or placeholder');
  if (salutation.length > 120) return fallback('longer than one line');
  if (hasUnverifiedBrackets(salutation, input.adText, input.jobTitle)) return fallback('placeholder');
  if (input.isBlacklisted(salutation)) return fallback('stock phrase');
  if ((language === 'en' || language === 'de') && !salutation.endsWith(',')) {
    salutation = `${salutation.replace(/[.:;!]+$/u, '')},`;
  }

  const normalized = salutation.toLocaleLowerCase();
  if ([GENERIC_LETTER_GREETINGS[language], ...OTHER_GENERIC_GREETINGS].some((generic) => generic.toLocaleLowerCase() === normalized)) {
    return { value: salutation };
  }

  const companyWords = new Set(input.companyNames.flatMap((name) => words(name).map((word) => word.toLocaleLowerCase())));
  const genders = new Set<Gender>();
  let hasTitle = false;
  const nameTokens: string[] = [];
  for (const token of words(salutation)) {
    const lower = token.toLocaleLowerCase();
    const title = lower === 'm' ? (language === 'fr' ? 'm' as const : undefined) : TITLE_GENDER[lower];
    if (title) {
      hasTitle = true;
      if (title !== 'n') genders.add(title);
      continue;
    }
    if (lower in ADJECTIVE_GENDER) {
      genders.add(ADJECTIVE_GENDER[lower]);
      continue;
    }
    if (NEUTRAL_WORDS.has(lower) || companyWords.has(lower)) continue;
    nameTokens.push(lower);
  }

  if (nameTokens.length === 0) {
    // A title with nobody named ("Dear Sir", "Sehr geehrter Herr") guesses a gender.
    return hasTitle ? fallback('title without a named contact') : { value: salutation };
  }
  if (!contactPerson) return fallback('names a person while no contact is known');
  const personWords = new Set(words(personName(contactPerson)).map((word) => word.toLocaleLowerCase()));
  if (nameTokens.some((token) => !personWords.has(token))) return fallback('names someone other than the contact');
  if (genders.size > 1) return fallback('mixed gendered forms');
  const [gender] = [...genders];
  if (gender && !titleStatedFor(contactPerson, gender, language, [contactPerson, input.adText])) {
    return fallback('gendered form without a title stated for the contact');
  }
  // "Dear Brandl," addresses nobody properly: a one-word name needs its title.
  if (!gender && personWords.size < 2) return fallback('a one-word name without a title');
  return { value: salutation };
}

// ---------------------------------------------------------------------------
// Subject and closing
// ---------------------------------------------------------------------------

const SUBJECT_PREFIXES: Record<SupportedLanguage, string> = {
  en: 'Application for',
  de: 'Bewerbung als',
  fr: 'Candidature au poste de',
  es: 'Candidatura al puesto de',
  pt: 'Candidatura para',
  it: 'Candidatura per la posizione di',
  nl: 'Sollicitatie voor de functie',
};

const SUBJECT_BARE: Record<SupportedLanguage, string> = {
  en: 'Application',
  de: 'Bewerbung',
  fr: 'Candidature',
  es: 'Candidatura',
  pt: 'Candidatura',
  it: 'Candidatura',
  nl: 'Sollicitatie',
};

/** The code-built subject: "<prefix> <job title>", or the bare word without a title. */
export function fallbackLetterSubject(language: SupportedLanguage, jobTitle: string | undefined): string {
  const title = cleanLetterText(jobTitle);
  return title ? `${SUBJECT_PREFIXES[language]} ${title}` : SUBJECT_BARE[language];
}

/**
 * A reference in a subject: a run of 2+ digits, a token mixing digits and
 * letters ("KAM-2026-17", "#NW-4471", "S/4HANA") or an uppercase-hyphen code
 * ("ABC-XYZ"). Each must appear verbatim in the ad.
 */
function subjectReferences(subject: string): Array<{ token: string; index: number }> {
  const references: Array<{ token: string; index: number }> = [];
  for (const match of subject.matchAll(/[^\s,;:()[\]]+/gu)) {
    const token = match[0].replace(/[.!?]+$/u, '');
    const digits = (token.match(/\d/gu) ?? []).length;
    const isReference = digits >= 2 || (digits >= 1 && /\p{L}/u.test(token)) || /^[A-Z]{2,}(?:-[A-Z0-9]{2,})+$/u.test(token);
    if (isReference) references.push({ token, index: match.index ?? 0 });
  }
  return references;
}

export function resolveSubject(input: {
  subject: unknown;
  language: SupportedLanguage;
  adText: string;
  jobTitle?: string;
  isPlaceholder: (text: string) => boolean;
}): Resolved {
  const fallback = (reason: string): Resolved => ({ value: fallbackLetterSubject(input.language, input.jobTitle), fallbackReason: reason });
  if (typeof input.subject !== 'string') return fallback('missing');
  let subject = cleanLetterText(input.subject).replace(/^(?:betreff|subject|re|objet|asunto|assunto|oggetto|onderwerp)\s*:\s*/iu, '');
  if (!subject || input.isPlaceholder(subject)) return fallback('empty or placeholder');
  if (subject.length > 200) return fallback('longer than one line');
  if (hasUnverifiedBrackets(subject, input.adText, input.jobTitle)) return fallback('placeholder');
  if (input.language === 'de' && !/^bewerbung\b/iu.test(subject)) return fallback('German subject without "Bewerbung"');
  // A reference the ad doesn't state is dropped: cut at the comma before it,
  // or rebuild the subject from the job title when there is no such comma.
  let reason: string | undefined;
  const unstated = subjectReferences(subject).find(({ token }) => !input.adText.includes(token) && !input.adText.includes(token.replace(/^#/u, '')));
  if (unstated) {
    const comma = subject.lastIndexOf(',', unstated.index);
    if (comma <= 0) return fallback('a reference the ad does not state');
    subject = subject.slice(0, comma).trim();
    reason = 'dropped a reference the ad does not state';
    if (subjectReferences(subject).some(({ token }) => !input.adText.includes(token) && !input.adText.includes(token.replace(/^#/u, '')))) {
      return fallback('a reference the ad does not state');
    }
  }
  return { value: subject, fallbackReason: reason };
}

const DEFAULT_CLOSINGS: Record<SupportedLanguage, string> = {
  en: 'Sincerely,',
  de: 'Mit freundlichen Grüßen',
  fr: 'Cordialement,',
  es: 'Atentamente,',
  pt: 'Com os melhores cumprimentos,',
  it: 'Cordiali saluti,',
  nl: 'Met vriendelijke groet,',
};

const KNOWN_CLOSINGS: Record<SupportedLanguage, string[]> = {
  en: ['sincerely', 'yours sincerely', 'sincerely yours', 'yours faithfully', 'kind regards', 'best regards', 'warm regards', 'warmest regards', 'regards', 'best', 'with best regards', 'with kind regards', 'respectfully', 'thank you', 'many thanks'],
  de: ['mit freundlichen grüßen'],
  fr: ['cordialement', 'bien cordialement', 'sincères salutations', 'meilleures salutations', 'respectueusement', 'bien à vous'],
  es: ['atentamente', 'saludos cordiales', 'un cordial saludo', 'cordialmente', 'un saludo'],
  pt: ['atenciosamente', 'com os melhores cumprimentos', 'melhores cumprimentos', 'cumprimentos', 'cordialmente'],
  it: ['cordiali saluti', 'distinti saluti', 'cordialmente', 'saluti'],
  nl: ['met vriendelijke groet', 'met vriendelijke groeten', 'hoogachtend', 'vriendelijke groet'],
};

/** German always closes with "Mit freundlichen Grüßen"; others keep a clean model closing without the name. */
export function resolveClosing(input: {
  closing: unknown;
  language: SupportedLanguage;
  applicantName?: string;
  isBlacklisted: (text: string) => boolean;
  isPlaceholder: (text: string) => boolean;
}): Resolved {
  const fallback = (reason: string): Resolved => ({ value: DEFAULT_CLOSINGS[input.language], fallbackReason: reason });
  if (input.language === 'de') return { value: DEFAULT_CLOSINGS.de };
  if (typeof input.closing !== 'string') return fallback('not text');
  let closing = cleanLetterText(input.closing);
  const name = cleanLetterText(input.applicantName);
  if (name && closing.toLocaleLowerCase().includes(name.toLocaleLowerCase())) {
    // Strip the name, then trailing separators and honorifics; keep what's
    // left only when it is a known closing.
    closing = cleanLetterText(closing.replace(new RegExp(escapeRegExp(name), 'iu'), ''))
      .replace(/(?:[\s,;:|/-]|(?<!\p{L})(?:mr|ms|mrs|dr|herr|frau|mme|m|sr|sra)\.?)+$/iu, '')
      .trim();
    if (!KNOWN_CLOSINGS[input.language].includes(closing.toLocaleLowerCase())) return fallback('not a known closing after removing the name');
    return { value: `${closing},`, fallbackReason: 'removed the signature name' };
  }
  if (!closing || input.isPlaceholder(closing) || !/\p{L}/u.test(closing)) return fallback('empty or placeholder');
  if (closing.length > 60 || /\[[^\]]+\]/u.test(closing)) return fallback('not a sign-off');
  if (input.isBlacklisted(closing)) return fallback('stock phrase');
  return { value: closing };
}
