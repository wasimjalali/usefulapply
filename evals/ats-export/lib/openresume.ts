/**
 * ATS proxy: the OpenResume PDF parser (xitanggg/open-resume, AGPL-3.0). Its
 * parsing source is NOT in this repository. fetch-open-resume.sh downloads it
 * at the pinned commit in vendor/open-resume/PINNED_COMMIT (gitignored) and the
 * three steps below call it from there, unmodified. What is committed is this
 * adapter, which is our own code: it reads a PDF with pdf.js, hands the parser
 * the shape of input it documents (position, size, font and end-of-line flag per
 * text item) and scores the result against the CV. Nothing from OpenResume's own
 * PDF reader is copied.
 *
 * It reads a PDF the way a naive ATS does: items into lines, lines into sections
 * by heading, then fields by scoring rules. It only handles single-column
 * English CVs, so single-column templates are the fair test.
 */
import { groupTextItemsIntoLines } from 'lib/parse-resume-from-pdf/group-text-items-into-lines';
import { groupLinesIntoSections } from 'lib/parse-resume-from-pdf/group-lines-into-sections';
import { extractResumeFromSections } from 'lib/parse-resume-from-pdf/extract-resume-from-sections';
import type { TextItem } from 'lib/parse-resume-from-pdf/types';
import type { Resume } from 'lib/redux/types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CVData } from '../../../src/lib/cv-templates/types';
import { visibleCvData } from '../../../src/lib/cv-templates/hidden';
import { formatDateRange } from '../../../src/lib/cv-templates/locale';
import { hasToken, norm } from './expect';

export const OPENRESUME_COMMIT = readFileSync(join(__dirname, '..', 'vendor', 'open-resume', 'PINNED_COMMIT'), 'utf8').trim();

export async function parseWithOpenResume(bytes: Uint8Array): Promise<Resume> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const stream: TextItem[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    // pdf.js names fonts by an internal id; the parser looks for "bold" in the real name, which the page loads once its operator list has run.
    await page.getOperatorList();
    const realFontName = (id: string): string => {
      try {
        return page.commonObjs.get(id).name ?? id;
      } catch {
        return id;
      }
    };
    const pageItems: TextItem[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const [, , , , x, y] = item.transform;
      pageItems.push({ text: item.str, x, y, width: item.width, height: item.height, fontName: realFontName(item.fontName), hasEOL: item.hasEOL });
    }
    // The parser reads all pages as one stream and would glue the last item of a
    // page to the first of the next. That is a limit of the reader, not of the
    // document, so the end of a page counts as the end of a line.
    if (pageItems.length > 0) pageItems[pageItems.length - 1].hasEOL = true;
    stream.push(...pageItems);
  }
  const items = stream.filter((item) => item.hasEOL || item.text.trim() !== '');
  return extractResumeFromSections(groupLinesIntoSections(groupTextItemsIntoLines(items)));
}

export interface OpenResumeScore {
  name: boolean;
  email: boolean;
  phone: boolean;
  jobs: { matched: number; total: number };
  bullets: { matched: number; total: number };
  education: { matched: number; total: number };
  skills: { matched: number; total: number };
  parsed: { name: string; email: string; phone: string; jobs: number; bullets: number; educations: number };
}

const digits = (value: string) => value.replace(/\D/g, '');
const lower = (value: string) => norm(value).toLowerCase();

/** Compares what the parser read with what the CV holds. */
export function scoreOpenResume(resume: Resume, source: CVData): OpenResumeScore {
  const data = visibleCvData(source);
  const jobTexts = resume.workExperiences.map((job) => `${job.company} ${job.jobTitle} ${job.date}`);
  const parsedBullets = norm(resume.workExperiences.flatMap((job) => job.descriptions).join(' '));
  const jobs = data.experience.filter((exp) =>
    jobTexts.some((text) => lower(text).includes(lower(exp.company)) && lower(text).includes(lower(exp.position)) && norm(text).includes(formatDateRange(data, exp))),
  );
  const bullets = data.experience.flatMap((exp) => exp.bullets).filter((bullet) => parsedBullets.includes(norm(bullet)));
  const totalBullets = data.experience.flatMap((exp) => exp.bullets).length;
  const schools = norm(resume.educations.map((edu) => `${edu.school} ${edu.degree}`).join(' ')).toLowerCase();
  const education = data.education.filter((edu) => schools.includes(lower(edu.institution)));
  const skillText = norm([...resume.skills.descriptions, ...resume.skills.featuredSkills.map((s) => s.skill)].join(' '));
  const allSkills = data.skills.flatMap((g) => g.items);
  // Whole tokens: "Go" is not found inside "Google", "SQL" not inside "PostgreSQL".
  const skills = allSkills.filter((skill) => hasToken(skillText, skill));
  return {
    name: lower(resume.profile.name) === lower(data.personal.fullName),
    email: lower(resume.profile.email) === lower(data.personal.email),
    // The parser drops a leading country code, so compare the trailing digits.
    phone: digits(resume.profile.phone).length >= 7 && digits(data.personal.phone).endsWith(digits(resume.profile.phone)),
    jobs: { matched: jobs.length, total: data.experience.length },
    bullets: { matched: bullets.length, total: totalBullets },
    education: { matched: education.length, total: data.education.length },
    skills: { matched: skills.length, total: allSkills.length },
    parsed: {
      name: resume.profile.name,
      email: resume.profile.email,
      phone: resume.profile.phone,
      jobs: resume.workExperiences.length,
      bullets: resume.workExperiences.reduce((n, job) => n + job.descriptions.length, 0),
      educations: resume.educations.length,
    },
  };
}
