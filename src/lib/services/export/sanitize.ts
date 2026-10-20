import { isStructuredCoverLetter, type StructuredCoverLetter } from '@/lib/cover-letter/contract';
import type { CVData } from '@/lib/cv-templates/types';
import type { ExportAnswer, ExportEmail } from './types';

/**
 * The web app sends what the canvas shows so a download matches the screen. It
 * is the signed-in user's own text, but it still crosses a trust boundary, so
 * it is rebuilt field by field: known fields only, lengths capped, links
 * limited to http(s), photos never taken from it.
 */

const SHORT = 400;
const MEDIUM = 2_000;
const LONG = 6_000;

const SECTION_KEYS = new Set(['summary', 'experience', 'education', 'skills', 'certifications', 'languages', 'projects', 'additionalInfo']);

const HEADER_KEYS = ['summary', 'skills', 'experience', 'education', 'certifications', 'languages', 'contact', 'additionalInfo', 'projects'] as const;
const STRING_KEYS = [
  'present', 'gradePrefix', 'degreeConnector', 'photoPlaceholder', 'dateOfBirthLabel', 'nationalityLabel',
  'websiteLabel', 'signatureLabel', 'cityLabel', 'dateLabel',
] as const;

type Raw = Record<string, unknown>;

function obj(value: unknown): Raw | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null;
}

function str(value: unknown, max = MEDIUM): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function optStr(value: unknown, max = MEDIUM): string | undefined {
  const text = str(value, max);
  return text ? text : undefined;
}

function link(value: unknown): string | undefined {
  const text = str(value, SHORT).trim();
  return /^https?:\/\/[^\s]+$/i.test(text) ? text : undefined;
}

function list<T>(value: unknown, max: number, map: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value.slice(0, max)) {
    const mapped = map(item);
    if (mapped !== null) out.push(mapped);
  }
  return out;
}

function strings(value: unknown, max: number, maxLen = MEDIUM): string[] {
  return list(value, max, (item) => (typeof item === 'string' && item.trim() ? item.slice(0, maxLen) : null));
}

function flag(value: unknown): { hidden: true } | Record<string, never> {
  return value === true ? { hidden: true } : {};
}

/** Returns null when the value is not a CV at all. */
export function sanitizeCvData(input: unknown): CVData | null {
  const raw = obj(input);
  const personal = obj(raw?.personal);
  if (!raw || !personal || typeof personal.fullName !== 'string') return null;

  const sectionHeaders: Record<string, string> = {};
  const rawHeaders = obj(raw.sectionHeaders);
  for (const key of HEADER_KEYS) {
    const value = optStr(rawHeaders?.[key], 120);
    if (value) sectionHeaders[key] = value;
  }
  const localizedStrings: Record<string, string> = {};
  const rawStrings = obj(raw.localizedStrings);
  for (const key of STRING_KEYS) {
    const value = optStr(rawStrings?.[key], 120);
    if (value) localizedStrings[key] = value;
  }

  const signature = obj(raw.signature);

  return {
    language: optStr(raw.language, 8),
    personal: {
      fullName: str(personal.fullName, SHORT),
      email: str(personal.email, SHORT),
      phone: str(personal.phone, 80),
      currentTitle: optStr(personal.currentTitle, SHORT),
      targetJobTitle: optStr(personal.targetJobTitle, SHORT),
      address: optStr(personal.address, SHORT),
      city: optStr(personal.city, SHORT),
      country: optStr(personal.country, SHORT),
      linkedIn: link(personal.linkedIn),
      website: link(personal.website),
      portfolio: link(personal.portfolio),
      github: link(personal.github),
      dateOfBirth: optStr(personal.dateOfBirth, 40),
      nationality: optStr(personal.nationality, 80),
    },
    signature: signature
      ? {
          city: str(signature.city, 80),
          date: str(signature.date, 40),
          includeSignature: signature.includeSignature === true,
        }
      : undefined,
    summary: optStr(raw.summary, LONG),
    experience: list(raw.experience, 40, (item) => {
      const e = obj(item);
      if (!e) return null;
      return {
        id: str(e.id, 80),
        company: str(e.company, SHORT),
        position: str(e.position, SHORT),
        location: optStr(e.location, SHORT),
        startDate: str(e.startDate, 40),
        endDate: optStr(e.endDate, 40),
        current: e.current === true,
        bullets: strings(e.bullets, 60),
        ...flag(e.hidden),
      };
    }),
    education: list(raw.education, 20, (item) => {
      const e = obj(item);
      if (!e) return null;
      return {
        id: str(e.id, 80),
        institution: str(e.institution, SHORT),
        degree: str(e.degree, SHORT),
        field: optStr(e.field, SHORT),
        location: optStr(e.location, SHORT),
        startDate: optStr(e.startDate, 40),
        endDate: optStr(e.endDate, 40),
        grade: optStr(e.grade, 80),
        highlights: strings(e.highlights, 20),
        ...flag(e.hidden),
      };
    }),
    skills: list(raw.skills, 40, (item) => {
      const g = obj(item);
      if (!g) return null;
      return {
        category: str(g.category, SHORT),
        items: strings(g.items, 120, SHORT),
        hiddenItems: strings(g.hiddenItems, 120, SHORT),
        ...flag(g.hidden),
      };
    }),
    languages: list(raw.languages, 20, (item) => {
      const l = obj(item);
      if (!l) return null;
      return { language: str(l.language, 80), proficiency: str(l.proficiency, 120), ...flag(l.hidden) };
    }),
    certifications: list(raw.certifications, 40, (item) => {
      const c = obj(item);
      if (!c) return null;
      return {
        id: str(c.id, 80),
        name: str(c.name, SHORT),
        issuer: str(c.issuer, SHORT),
        date: optStr(c.date, 40),
        credentialId: optStr(c.credentialId, 120),
        ...flag(c.hidden),
      };
    }),
    projects: Array.isArray(raw.projects)
      ? list(raw.projects, 30, (item) => {
          const p = obj(item);
          if (!p) return null;
          return {
            id: str(p.id, 80),
            name: str(p.name, SHORT),
            description: str(p.description, MEDIUM),
            technologies: strings(p.technologies, 30, 80),
            url: link(p.url),
            ...flag(p.hidden),
          };
        })
      : undefined,
    additionalInfo: Array.isArray(raw.additionalInfo) ? strings(raw.additionalInfo, 40) : undefined,
    customSections: Array.isArray(raw.customSections)
      ? list(raw.customSections, 20, (item) => {
          const s = obj(item);
          if (!s) return null;
          return { id: str(s.id, 80), title: str(s.title, SHORT), items: strings(s.items, 60), ...flag(s.hidden) };
        })
      : undefined,
    sectionHeaders: Object.keys(sectionHeaders).length > 0 ? sectionHeaders : undefined,
    localizedStrings: Object.keys(localizedStrings).length > 0 ? localizedStrings : undefined,
    renamedHeadings: Array.isArray(raw.renamedHeadings)
      ? (raw.renamedHeadings.filter((key): key is NonNullable<CVData['renamedHeadings']>[number] => typeof key === 'string' && SECTION_KEYS.has(key)))
      : undefined,
    hiddenSections: Array.isArray(raw.hiddenSections)
      ? (raw.hiddenSections.filter((key): key is NonNullable<CVData['hiddenSections']>[number] => typeof key === 'string' && SECTION_KEYS.has(key)))
      : undefined,
  };
}

export function sanitizeStructuredLetter(input: unknown): StructuredCoverLetter | null {
  if (!isStructuredCoverLetter(input)) return null;
  const v = input as StructuredCoverLetter;
  const sender = obj(v.sender);
  const recipient = obj(v.recipient);
  if (!sender || !recipient) return null;
  return {
    version: 2,
    language: str(v.language, 8) || 'en',
    market: v.market === 'dach' ? 'dach' : 'us',
    sender: {
      name: str(sender.name, SHORT),
      addressLines: strings(sender.addressLines, 6, SHORT),
      phone: optStr(sender.phone, 80),
      email: optStr(sender.email, SHORT),
      links: strings(sender.links, 4, SHORT),
    },
    recipient: {
      companyName: optStr(recipient.companyName, SHORT),
      contactPerson: optStr(recipient.contactPerson, SHORT),
      department: optStr(recipient.department, SHORT),
      addressLines: strings(recipient.addressLines, 6, SHORT),
    },
    place: optStr(v.place, SHORT),
    date: str(v.date, 80),
    subject: str(v.subject, SHORT),
    salutation: str(v.salutation, SHORT),
    paragraphs: strings(v.paragraphs, 20, LONG),
    closing: str(v.closing, SHORT),
    signatureName: str(v.signatureName, SHORT),
  };
}

export function sanitizeEmails(input: unknown): ExportEmail[] {
  return list(input, 4, (item) => {
    const e = obj(item);
    if (!e) return null;
    const subject = str(e.subject, SHORT);
    const body = str(e.body, 20_000);
    if (!subject.trim() && !body.trim()) return null;
    return { label: str(e.label, 80) || 'Email', subject, body };
  });
}

export function sanitizeAnswers(input: unknown): ExportAnswer[] {
  return list(input, 30, (item) => {
    const a = obj(item);
    if (!a || typeof a.question !== 'string' || typeof a.answer !== 'string') return null;
    return { question: a.question.slice(0, MEDIUM), answer: a.answer.slice(0, 10_000) };
  });
}
