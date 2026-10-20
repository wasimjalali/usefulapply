/**
 * Deterministic half of the structured cover letter (PLAN.md section 5).
 *
 * The model writes only subject, salutation, paragraphs, closing and the
 * recipient details the job description states (company, contact person,
 * department, postal address). The writer keeps those only when the ad
 * contains them verbatim. Everything else on the letter comes from here:
 * - sender: the applicant's verified name, address, email and phone, plus
 *   profile links read from the Primary CV header;
 * - recipient: the application session row (company, company_address,
 *   company_contact_person) wins, then the verbatim extract from the ad, then
 *   empty; never an invented address;
 * - date (today, ISO), place (the city in the applicant's own address),
 *   language and market.
 *
 * `renderCoverLetterBody` turns the structure into the plain-text `body` the
 * canvas, copy and the legacy export keep using.
 */

import type { MasterContext } from './types';
import type { CoverLetterRecipient, CoverLetterSender, StructuredCoverLetter } from '@/lib/cover-letter/contract';
import { cleanLetterText, US_STATE_CODES } from './cover-letter-guards';

/** Recipient details from the application session row, set by the routes. */
export interface LetterRecipientSource {
  companyName?: string | null;
  address?: string | null;
  contactPerson?: string | null;
}

/** The fields the model writes, already validated and cleaned. */
export interface CoverLetterModelFields {
  subject: string;
  salutation: string;
  paragraphs: string[];
  closing: string;
  /** Kept only when the job description states it verbatim. */
  contactPerson?: string;
  /** Kept only when the job description states it verbatim. */
  department?: string;
  /** The ad's own text for the company: the parsed job company when the ad contains it, else the model's verbatim copy. */
  companyName?: string;
  /** The employer's postal address as one verbatim, anchored block from the job description (cover-letter-guards.ts). */
  addressLines?: string[];
}

const LETTER_LOCALES: Record<string, string> = {
  en: 'en-US',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  pt: 'pt-PT',
  it: 'it-IT',
  nl: 'nl-NL',
};

// Matched on letter boundaries, so "Bern" never matches inside "Berner".
const DACH_COUNTRY = /(?:^|[^\p{L}])(deutschland|germany|österreich|oesterreich|austria|schweiz|switzerland|suisse|svizzera)(?=$|[^\p{L}])/iu;
const DACH_CITY = /(?:^|[^\p{L}])(berlin|hamburg|münchen|muenchen|munich|köln|koeln|cologne|frankfurt|stuttgart|düsseldorf|duesseldorf|leipzig|dresden|hannover|nürnberg|nuernberg|nuremberg|bremen|dortmund|bonn|mannheim|karlsruhe|wien|vienna|graz|linz|salzburg|innsbruck|zürich|zurich|basel|bern|genf|geneva|lausanne|luzern|lucerne)(?=$|[^\p{L}])/iu;
// A two-letter code after a comma ("Vienna, VA", "Berlin, DE", "Bern, BE"),
// with an optional US ZIP.
const REGION_SUFFIX = /,\s*([A-Z]{2})(\s+\d{5}(?:-\d{4})?)?(?=$|[\s,;)])/u;
const DACH_COUNTRY_CODES = new Set(['DE', 'AT', 'CH']);
// Swiss canton codes that are not also US state codes.
const SWISS_CANTON_CODES = new Set(['AG', 'AI', 'BE', 'BL', 'BS', 'FR', 'GE', 'GL', 'GR', 'JU', 'LU', 'NW', 'OW', 'SG', 'SH', 'SO', 'SZ', 'TG', 'TI', 'UR', 'VD', 'VS', 'ZG', 'ZH']);

function collapse(value: string | null | undefined): string {
  return (value ?? '').replace(/[\s\p{Cc}]+/gu, ' ').trim();
}

/**
 * `dach` for a German letter, or a job located in Germany, Austria or
 * Switzerland. A DACH city counts only beside a DACH country (name, or the
 * code DE/AT/CH or a Swiss canton code) or with a German-language ad, and
 * never with a US state code or ZIP ("Vienna, VA", "Geneva, IL 60134"). "DE"
 * is Delaware unless a DACH city stands before it. An English letter for a
 * DACH job gets the DIN layout but keeps its English subject and closing.
 */
export function resolveLetterMarket(language: string, jobLocation: string | undefined, adLanguage?: string): 'us' | 'dach' {
  if (language === 'de') return 'dach';
  const location = jobLocation ?? '';
  const region = location.match(REGION_SUFFIX);
  if (region) {
    const [, code, zip] = region;
    const dachCity = DACH_CITY.test(location.slice(0, region.index));
    if (zip) return 'us';
    if (dachCity && (DACH_COUNTRY_CODES.has(code) || SWISS_CANTON_CODES.has(code))) return 'dach';
    if (US_STATE_CODES.has(code)) return 'us';
  }
  if (DACH_COUNTRY.test(location)) return 'dach';
  return adLanguage === 'de' && DACH_CITY.test(location) ? 'dach' : 'us';
}

/**
 * Address lines, layout only: the text is the source's own. Newlines are kept;
 * a one-line address splits once after a street part ("Musterstraße 1, 10115
 * Berlin"), while "Berlin, Germany" stays whole.
 */
export function splitAddressLines(address: string | null | undefined): string[] {
  const lines = (address ?? '').split(/\r?\n/).map(collapse).filter(Boolean);
  if (lines.length !== 1) return lines;
  const single = lines[0];
  const comma = single.indexOf(',');
  if (comma === -1) return [single];
  const first = single.slice(0, comma).trim();
  const rest = single.slice(comma + 1).trim();
  return /\d/u.test(first) && rest ? [first, rest] : [single];
}

/**
 * The city in the applicant's address, or undefined. A part that starts with a
 * postal code ("10115 Berlin") gives its city, except a first part of several
 * (a US street such as "1234 Main St"); otherwise the first part with no digits.
 */
export function cityFromAddress(address: string | null | undefined): string | undefined {
  const parts = (address ?? '').split(/[\n,]/u).map(collapse).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    if (i === 0 && parts.length > 1) continue;
    const match = parts[i].match(/^\d{4,5}\s+(\p{L}[\p{L}\s.'-]*)$/u);
    if (match) return match[1].trim();
  }
  return parts.find((part) => !/\d/u.test(part));
}

// Profile links on the CV header: explicit URLs and scheme-less LinkedIn,
// GitHub and XING profile paths.
const PROFILE_LINK = /\bhttps?:\/\/[^\s|,;()<>]+|\b(?:www\.)?(?:linkedin\.com\/in\/[\w%-]+|github\.com\/[\w-]+|xing\.com\/profile\/[\w-]+)\/?/giu;
const HEADER_LINES = 10;
const MAX_LINKS = 3;

/** Profile links from the first lines of the Primary CV, verbatim, at most three. */
export function profileLinksFromCv(rawCV: string): string[] {
  const header = rawCV.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, HEADER_LINES).join('\n');
  const seen = new Set<string>();
  const links: string[] = [];
  for (const match of header.matchAll(PROFILE_LINK)) {
    const link = match[0].replace(/[.)\]]+$/u, '');
    const key = link.toLowerCase().replace(/^https?:\/\//u, '').replace(/^www\./u, '').replace(/\/$/u, '');
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(link);
    if (links.length === MAX_LINKS) break;
  }
  return links;
}

/** Today in UTC as YYYY-MM-DD (the server clock is UTC on Workers). */
export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "October 20, 2026" or "20. Oktober 2026" for an ISO date. */
export function formatLetterDate(isoDate: string, language: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(LETTER_LOCALES[language] || 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Combine the model's fields with the verified details into the contract. */
export function assembleStructuredCoverLetter(
  context: MasterContext,
  language: string,
  fields: CoverLetterModelFields,
  date: string = isoToday(),
): StructuredCoverLetter {
  const applicant = context.applicant;
  const session = context.letterRecipient;

  const sender: CoverLetterSender = {
    name: collapse(applicant?.name),
    addressLines: splitAddressLines(applicant?.address),
  };
  const phone = collapse(applicant?.phone);
  const email = collapse(applicant?.email);
  const links = profileLinksFromCv(context.rawCV || '');
  if (phone) sender.phone = phone;
  if (email) sender.email = email;
  if (links.length > 0) sender.links = links;

  // Precedence for each recipient detail: the session row, then the verbatim
  // extract from the ad (the writer already checked the ad, including the
  // parsed company name), then empty. Dashes become hyphens.
  const savedAddress = splitAddressLines(session?.address).map(cleanLetterText).filter(Boolean);
  const recipient: CoverLetterRecipient = {
    addressLines: savedAddress.length > 0 ? savedAddress : (fields.addressLines ?? []).map(cleanLetterText).filter(Boolean),
  };
  const companyName = cleanLetterText(session?.companyName) || cleanLetterText(fields.companyName);
  // A contact person saved on the application wins over one read from the ad.
  const contactPerson = cleanLetterText(session?.contactPerson) || cleanLetterText(fields.contactPerson);
  const department = cleanLetterText(fields.department);
  if (companyName) recipient.companyName = companyName;
  if (contactPerson) recipient.contactPerson = contactPerson;
  if (department) recipient.department = department;

  const letter: StructuredCoverLetter = {
    version: 2,
    language,
    market: resolveLetterMarket(language, context.job?.location, context.detectedLanguage),
    sender,
    recipient,
    date,
    subject: fields.subject,
    salutation: fields.salutation,
    paragraphs: fields.paragraphs,
    closing: fields.closing,
    signatureName: sender.name,
  };
  const place = cityFromAddress(applicant?.address);
  if (place) letter.place = place;
  return letter;
}

/**
 * Plain-text rendering of a structured letter: the same content in reading
 * order, one blank line between blocks, the closing directly above the name.
 * US: sender, date, recipient. DACH: sender, recipient, then "<place>, <date>"
 * as DIN 5008 orders it.
 */
export function renderCoverLetterBody(letter: StructuredCoverLetter): string {
  const { sender, recipient } = letter;
  const senderBlock = [
    sender.name,
    ...sender.addressLines,
    sender.email ?? '',
    sender.phone ?? '',
    ...(sender.links ?? []),
  ].filter(Boolean);
  const recipientBlock = (letter.market === 'dach'
    ? [recipient.companyName, recipient.department, recipient.contactPerson, ...recipient.addressLines]
    : [recipient.contactPerson, recipient.department, recipient.companyName, ...recipient.addressLines]
  ).filter((line): line is string => Boolean(line));
  const formattedDate = formatLetterDate(letter.date, letter.language);
  const dateLine = letter.market === 'dach' && letter.place ? `${letter.place}, ${formattedDate}` : formattedDate;

  const blocks: string[][] = letter.market === 'dach'
    ? [senderBlock, recipientBlock, [dateLine]]
    : [senderBlock, [dateLine], recipientBlock];
  blocks.push(
    [letter.subject],
    [letter.salutation],
    ...letter.paragraphs.map((paragraph) => [paragraph]),
    [letter.closing, letter.signatureName],
  );
  return blocks
    .map((block) => block.filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n');
}
