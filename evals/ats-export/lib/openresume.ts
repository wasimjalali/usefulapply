/**
 * ATS proxy: the OpenResume PDF parser (xitanggg/open-resume, pinned commit in
 * vendor/open-resume/PINNED_COMMIT, fetched by fetch-open-resume.sh). It reads
 * a PDF the way a naive ATS does: text items grouped into lines, lines into
 * sections by heading, then fields by scoring rules. It only handles
 * single-column English CVs, so single-column templates are the fair test.
 *
 * Step 1 (reading the PDF) is reimplemented here against pdf.js 5, because the
 * original is written for pdf.js 3 in the browser. The conversion of each text
 * item is copied from read-pdf.ts.
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
import { norm } from './expect';

export const OPENRESUME_COMMIT = readFileSync(join(__dirname, '..', 'vendor', 'open-resume', 'PINNED_COMMIT'), 'utf8').trim();

export async function parseWithOpenResume(bytes: Uint8Array): Promise<Resume> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  let textItems: TextItem[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    await page.getOperatorList();
    const items = content.items
      .filter((item): item is Extract<typeof item, { str: string }> => 'str' in item)
      .map((item) => {
        let fontName = item.fontName;
        try {
          fontName = page.commonObjs.get(item.fontName).name ?? item.fontName;
        } catch {
          // keep the loaded name
        }
        return {
          text: item.str.replace(/-\u00AD\u2010/g, '-'),
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
          fontName,
          hasEOL: item.hasEOL,
        } satisfies TextItem;
      });
    // OpenResume reads all pages as one stream and glues the last item of a page to
    // the first of the next when pdf.js sets no end-of-line flag. That is a limit of
    // its reader, not of the document, so a page end is marked as a line end here.
    if (items.length > 0) items[items.length - 1] = { ...items[items.length - 1], hasEOL: true };
    textItems.push(...items);
  }
  textItems = textItems.filter((item) => item.hasEOL || item.text.trim() !== '');
  const lines = groupTextItemsIntoLines(textItems);
  const sections = groupLinesIntoSections(lines);
  return extractResumeFromSections(sections);
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
  const skillText = lower([...resume.skills.descriptions, ...resume.skills.featuredSkills.map((s) => s.skill)].join(' '));
  const allSkills = data.skills.flatMap((g) => g.items);
  const skills = allSkills.filter((skill) => skillText.includes(lower(skill)));
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
