/**
 * Deterministic guards for the parts of a cover letter the model writes about
 * the employer: the recipient (company, contact, department, postal address),
 * the salutation, the subject and the closing.
 *
 * Every recipient detail must be the ad's own text. Every salutation that
 * names a person must name the one contact the letter is addressed to, and a
 * gendered form (Frau, Ms., Madame, geehrter, Estimada...) needs that title
 * stated for that same person. These fields are optional, so a miss never
 * costs the letter: each resolver falls back to a fixed form (a generic or
 * neutral greeting, a code-built subject, a default closing, no address).
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
// Postal address
// ---------------------------------------------------------------------------

// "Industriestraße 14", "Alexanderplatz 1", "Hauptstr. 5a", "Weg 3-5"
const STREET_NAME_FIRST = /^\p{L}[\p{L}.'\- ]*\s\d{1,4}\s?[a-z]?(?:\s?[-/]\s?\d{1,4}\s?[a-z]?)?$/iu;
// "220 West Lake Street, Suite 1400", "12 rue de la République"
const STREET_NUMBER_FIRST = /^\d{1,6}[a-z]?,?\s+\p{L}[\p{L}\p{N}.,'#\- ]*$/iu;
// "90431 Nürnberg", "D-90431 Nürnberg", "1010 Wien", "8001 Zürich"
const POSTCODE_CITY_EU = /^(?:[A-Z]{1,2}-)?\d{4,5}\s+\p{L}[\p{L}.'\- ]*$/u;
// "Chicago, IL 60606", "San Francisco, CA 94107-1234"
const POSTCODE_CITY_US = /^\p{L}[\p{L}.'\- ]*,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?$/u;
// Email, web, labelled phone or fax, or a line of digits and phone punctuation only.
const CONTACT_LINE = /@|https?:\/\/|www\.|\+\d|^(?:tel|telefon|phone|fax|mobil|e-?mail)\b|^[\d\s()+/.-]+$/iu;
const UNIT_LINE = /^[\p{L}\p{N}.,#'\- ]{1,40}$/u;
const COUNTRY_LINE = /^\p{L}[\p{L} .'-]{1,29}$/u;

const ADDRESS_ANCHOR = /bewerbung|anschrift|kontakt|ansprechpartner|senden sie|richten sie|schicken sie|apply|application|send your|send us|mail to|mail your|address|adresse|candidature|envoyez|postuler|solicitud|candidatura|env[ií]a|sollicitatie|stuur|invia/iu;
// Text an employer address in an ad usually sits in when it is not where
// applications go: accommodation and equal-opportunity notices, privacy and
// legal notices.
const ADDRESS_BOILERPLATE = /accommodation|disabilit|equal (?:employment|opportunity)|\beeo\b|veteran|privacy|datenschutz|impressum|handelsregister|registergericht|amtsgericht|copyright|©|barrierefrei|schwerbehindert/iu;
const ANCHOR_WINDOW = 250;
const BOILERPLATE_BEFORE = 300;
const BOILERPLATE_AFTER = 60;
const LINE_GAP = '[\\s,]{1,6}';

export interface AddressAnchors {
  companyName?: string;
  contactPerson?: string;
  department?: string;
}

function isStreetLine(line: string): boolean {
  return STREET_NAME_FIRST.test(line) || STREET_NUMBER_FIRST.test(line);
}

function isPostcodeCityLine(line: string): boolean {
  return POSTCODE_CITY_EU.test(line) || POSTCODE_CITY_US.test(line);
}

/**
 * The employer's postal address as the ad writes it, or [] (all or nothing).
 *
 * 1. Contact lines (email, web, phone, fax, digits only) and lines repeating
 *    the company, contact or department are set aside. A one-line German
 *    address is split before its postcode.
 * 2. Shape: a street line with a house number, then a postcode-plus-city line
 *    (4-5 digit postcode, or "City, ST 12345"), with at most one unit line
 *    between them and one country line after; four lines at most.
 * 3. The lines appear in the ad as ONE block, in this order, separated only by
 *    whitespace, commas or line breaks, so lines from two offices can't be
 *    spliced together.
 * 4. The block sits shortly after the company name, the contact person or
 *    application wording, and not inside accommodation, equal-opportunity,
 *    privacy or legal boilerplate.
 * The lines returned are the ad's own text.
 */
export function extractAdAddress(value: unknown, adText: string, anchors: AddressAnchors = {}): string[] {
  if (!Array.isArray(value)) return [];
  const repeats = [anchors.companyName, anchors.contactPerson, anchors.department]
    .filter((field): field is string => Boolean(field))
    .map((field) => cleanLetterText(field).toLocaleLowerCase());
  const lines = value
    .filter((line): line is string => typeof line === 'string')
    .flatMap((line) => cleanLetterText(line).split(/,\s*(?=(?:[A-Z]{1,2}-)?\d{4,5}\s+\p{L})/u))
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !CONTACT_LINE.test(line))
    .filter((line) => !repeats.includes(line.toLocaleLowerCase()));
  if (lines.length < 2 || lines.length > 4) return [];

  // "90431 Nürnberg" also reads as number-first street, so the street line is
  // the first line that is not a postcode line.
  const street = lines.findIndex((line) => isStreetLine(line) && !isPostcodeCityLine(line));
  const postcode = lines.findIndex(isPostcodeCityLine);
  if (street !== 0 || postcode <= street || postcode - street > 2) return [];
  if (postcode - street === 2 && !UNIT_LINE.test(lines[1])) return [];
  const trailing = lines.slice(postcode + 1);
  if (trailing.length > 1 || trailing.some((line) => !COUNTRY_LINE.test(line))) return [];

  const ad = adText.normalize('NFKC');
  const block = new RegExp(`${BEFORE}${lines.map((line) => `(${phrasePattern(line)})`).join(LINE_GAP)}${AFTER}`, 'iu');
  const match = block.exec(ad);
  if (!match) return [];

  const start = match.index;
  const end = start + match[0].length;
  const before = ad.slice(Math.max(0, start - ANCHOR_WINDOW), start);
  const anchored = ADDRESS_ANCHOR.test(before)
    || [anchors.companyName, anchors.contactPerson].some((anchor) => Boolean(anchor && adPhrase(before, anchor)));
  const boilerplate = ADDRESS_BOILERPLATE.test(ad.slice(Math.max(0, start - BOILERPLATE_BEFORE), Math.min(ad.length, end + BOILERPLATE_AFTER)));
  if (!anchored || boilerplate) return [];
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
  'geachte', 'beste', 'wervingsteam', 'goedendag', 'heer/mevrouw',
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

/** Titles of one gender as a regex alternation (with the optional dot). */
function titlesOf(gender: Gender, language: SupportedLanguage): string {
  const titles = Object.entries(TITLE_GENDER).filter(([, g]) => g === gender).map(([title]) => escapeRegExp(title));
  if (gender === 'm' && language === 'fr') titles.push('m');
  if (gender === 'f') titles.push('sig\\.ra');
  return titles.join('|');
}

/** A source states a title of this gender directly before this person's name. */
function titleStatedFor(person: string, gender: Gender, language: SupportedLanguage, sources: string[]): boolean {
  const parts = personName(person).split(' ').filter(Boolean);
  const surname = parts.at(-1);
  if (!surname) return false;
  const given = parts.slice(0, -1).filter((part) => !NAME_PARTICLES.has(part.toLocaleLowerCase()));
  const particles = parts.slice(0, -1).filter((part) => NAME_PARTICLES.has(part.toLocaleLowerCase()));
  const optional = (list: string[]) => list.map((part) => `(?:${phrasePattern(part)}\\s+)?`).join('');
  const pattern = new RegExp(
    `${BEFORE}(?:${titlesOf(gender, language)})\\.?\\s+(?:(?:dr|prof)\\.?\\s+)*${optional(given)}${optional(particles)}${phrasePattern(surname)}${AFTER}`,
    'iu',
  );
  return sources.some((source) => pattern.test(cleanLetterText(source.normalize('NFKC'))));
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
 * The model's salutation when it passes every rule, otherwise a fixed greeting:
 * the neutral full-name form for the contact when there is one, else the
 * generic greeting.
 */
export function resolveSalutation(input: SalutationInput): Resolved {
  const { language, contactPerson } = input;
  const fallback = (reason: string): Resolved => ({
    value: contactPerson && personName(contactPerson)
      ? neutralLetterGreeting(language, personName(contactPerson))
      : GENERIC_LETTER_GREETINGS[language],
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
  const tokens = words(salutation);
  const genders = new Set<Gender>();
  let hasTitle = false;
  const nameTokens: string[] = [];
  for (const token of tokens) {
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

export function resolveSubject(input: {
  subject: unknown;
  language: SupportedLanguage;
  adText: string;
  jobTitle?: string;
  isPlaceholder: (text: string) => boolean;
}): Resolved {
  const fallback = (reason: string): Resolved => ({ value: fallbackLetterSubject(input.language, input.jobTitle), fallbackReason: reason });
  if (typeof input.subject !== 'string') return fallback('not text');
  const subject = cleanLetterText(input.subject).replace(/^(?:betreff|subject|re|objet|asunto|assunto|oggetto|onderwerp)\s*:\s*/iu, '');
  if (!subject || input.isPlaceholder(subject)) return fallback('empty or placeholder');
  if (subject.length > 200) return fallback('longer than one line');
  if (hasUnverifiedBrackets(subject, input.adText, input.jobTitle)) return fallback('placeholder');
  if (input.language === 'de' && !/^bewerbung\b/iu.test(subject)) return fallback('German subject without "Bewerbung"');
  // A reference number in the subject must be the ad's own.
  const numbers = subject.match(/(?<!\d)\d{3,}(?!\d)/gu) ?? [];
  if (numbers.some((digits) => !new RegExp(`(?<!\\d)${digits}(?!\\d)`, 'u').test(input.adText))) {
    return fallback('a number the ad does not state');
  }
  return { value: subject };
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
    closing = cleanLetterText(closing.replace(new RegExp(escapeRegExp(name), 'iu'), ''));
  }
  if (!closing || input.isPlaceholder(closing) || !/\p{L}/u.test(closing)) return fallback('empty or placeholder');
  if (closing.length > 60 || /\[[^\]]+\]/u.test(closing)) return fallback('not a sign-off');
  if (input.isBlacklisted(closing)) return fallback('stock phrase');
  return { value: closing };
}
