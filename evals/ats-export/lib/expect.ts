import { visibleCvData } from '../../../src/lib/cv-templates/hidden';
import {
  formatDateRange,
  formatSingleDate,
  inferCvLocale,
  sectionHeading,
  type HeadingKey,
} from '../../../src/lib/cv-templates/locale';
import type { CVData } from '../../../src/lib/cv-templates/types';

/** Whitespace, soft hyphens and Unicode forms flattened, so layout cannot cause a false miss. */
export function norm(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\u00AD/g, '')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Like norm, with every space and hyphen gone. A bullet that wraps at a hyphen
 * still matches: pdftotext joins "zero-" and "downtime" into "zerodowntime"
 * when a compound word breaks across lines (its dehyphenation), pdf.js keeps
 * the hyphen. Either way the word is intact for a reader and a keyword match.
 */
export function squash(text: string): string {
  return norm(text).replace(/[ -]/g, '');
}

export interface JobExpectation {
  position: string;
  company: string;
  dateRange: string;
  bullets: string[];
}

export interface CvExpectations {
  name: string;
  email: string;
  phone: string;
  title?: string;
  headings: Array<{ key: HeadingKey; text: string }>;
  skills: string[];
  skillGroups: string[];
  jobs: JobExpectation[];
  education: Array<{ degree: string; institution: string; date: string }>;
  certifications: string[];
  languages: string[];
  summary?: string;
  /** Every non-ASCII character the source holds. All must survive extraction. */
  nonAscii: string[];
}

export function expectationsFor(source: CVData): CvExpectations {
  const data = visibleCvData(source);
  const headings: CvExpectations['headings'] = [];
  const add = (key: HeadingKey, present: boolean) => {
    if (present) headings.push({ key, text: sectionHeading(data, key) });
  };
  add('summary', Boolean(data.summary));
  add('skills', data.skills.length > 0);
  add('experience', data.experience.length > 0);
  add('education', data.education.length > 0);
  add('certifications', data.certifications.length > 0);
  add('projects', (data.projects?.length ?? 0) > 0);

  const jobs = data.experience.map((exp) => ({
    position: exp.position,
    company: exp.company,
    dateRange: formatDateRange(data, exp),
    bullets: exp.bullets,
  }));
  const education = data.education.map((edu) => ({
    degree: edu.degree,
    institution: edu.institution,
    date: formatSingleDate(data, edu.endDate),
  }));

  const all = [
    data.personal.fullName,
    data.personal.currentTitle ?? '',
    data.summary ?? '',
    ...data.skills.flatMap((g) => [g.category, ...g.items]),
    ...jobs.flatMap((j) => [j.position, j.company, ...j.bullets]),
    ...education.flatMap((e) => [e.degree, e.institution]),
    ...data.certifications.map((c) => c.name),
    ...data.languages.map((l) => l.language),
  ].join(' ');
  const nonAscii = [...new Set([...all].filter((char) => char.charCodeAt(0) > 127))];

  return {
    name: data.personal.fullName,
    email: data.personal.email,
    phone: data.personal.phone,
    title: data.personal.currentTitle,
    headings,
    skills: data.skills.flatMap((g) => g.items),
    skillGroups: data.skills.map((g) => g.category),
    jobs,
    education,
    certifications: data.certifications.map((c) => c.name),
    languages: data.languages.map((l) => l.language),
    summary: data.summary,
    nonAscii,
  };
}

export interface TextCheck {
  /** Items checked and items found, per kind. */
  counts: Record<string, { found: number; total: number }>;
  missing: string[];
  /** Jobs whose title, employer and dates do not sit together. */
  pairingFailures: string[];
  headingsFound: number;
  headingsTotal: number;
  nonAsciiLost: string[];
  mojibake: boolean;
  hasDashDates: boolean;
}

function lineMatchesHeading(line: string, heading: string): boolean {
  return norm(line).toLowerCase().replace(/:$/, '') === norm(heading).toLowerCase();
}

/** Checks one extraction of a PDF (or DOCX conversion) against the source CV. */
export function checkText(text: string, exp: CvExpectations): TextCheck {
  const flat = norm(text);
  const counts: TextCheck['counts'] = {};
  const missing: string[] = [];
  const flatLower = flat.toLowerCase();
  const squashed = squash(text);
  const tally = (kind: string, needles: string[], mode: 'exact' | 'caseless' | 'squash' = 'exact') => {
    let found = 0;
    for (const needle of needles) {
      if (!needle) continue;
      const hit =
        mode === 'squash' ? squashed.includes(squash(needle))
        : mode === 'caseless' ? flatLower.includes(norm(needle).toLowerCase())
        : flat.includes(norm(needle));
      if (hit) found++;
      else missing.push(`${kind}: ${needle}`);
    }
    counts[kind] = { found, total: needles.filter(Boolean).length };
  };

  tally('contact', [exp.name, exp.email, exp.phone, ...(exp.title ? [exp.title] : [])]);
  tally('skills', exp.skills);
  // Labels are drawn uppercase, so their glyphs are uppercase in the PDF.
  tally('skillGroups', exp.skillGroups, 'caseless');
  tally('bullets', exp.jobs.flatMap((j) => j.bullets), 'squash');
  tally('jobTitles', exp.jobs.map((j) => j.position));
  tally('companies', exp.jobs.map((j) => j.company));
  tally('dates', [...exp.jobs.map((j) => j.dateRange), ...exp.education.map((e) => e.date)]);
  tally('education', exp.education.flatMap((e) => [e.degree, e.institution]));
  tally('certifications', exp.certifications);
  tally('languages', exp.languages);

  const lines = text.split(/[\n\f]/);
  let headingsFound = 0;
  for (const heading of exp.headings) {
    if (lines.some((line) => lineMatchesHeading(line, heading.text))) headingsFound++;
    else missing.push(`heading: ${heading.text}`);
  }

  // Date-to-employer pairing: between a job's title line and the next job's
  // title line, its employer and its date range must both appear.
  const pairingFailures: string[] = [];
  const expHeading = norm(exp.headings.find((h) => h.key === 'experience')?.text ?? '').toLowerCase();
  const expLine = lines.findIndex((line) => norm(line).toLowerCase() === expHeading);
  let cursor = Math.max(0, expLine + 1);
  const starts = exp.jobs.map((job) => {
    const title = norm(job.position).toLowerCase();
    const at = lines.findIndex((line, index) => {
      if (index < cursor) return false;
      const value = norm(line).toLowerCase();
      return value === title || value.startsWith(`${title} `);
    });
    if (at >= 0) cursor = at + 1;
    return at;
  });
  exp.jobs.forEach((job, index) => {
    const from = starts[index];
    if (from < 0) {
      pairingFailures.push(`${job.position}: title line not found`);
      return;
    }
    const nextStart = starts.slice(index + 1).find((start) => start > from) ?? lines.length;
    const segment = squash(lines.slice(from, nextStart).join(' '));
    if (!segment.includes(squash(job.company))) pairingFailures.push(`${job.position}: employer "${job.company}" not with its title`);
    if (!segment.includes(squash(job.dateRange))) pairingFailures.push(`${job.position}: dates "${job.dateRange}" not with its title`);
  });

  const nonAsciiLost = exp.nonAscii.filter((char) => !text.normalize('NFC').includes(char));
  return {
    counts,
    missing,
    pairingFailures,
    headingsFound,
    headingsTotal: exp.headings.length,
    nonAsciiLost,
    mojibake: /\uFFFD|\u00C3[\u00BC\u00B6\u00A4]|\u00E2\u20AC/.test(text),
    hasDashDates: /[\u2013\u2014]/.test(text),
  };
}

export function localeOf(data: CVData) {
  return inferCvLocale(data);
}
