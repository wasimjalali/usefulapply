import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
  TextWrappingType,
  VerticalPositionRelativeFrom,
  convertMillimetersToTwip,
} from 'docx';
import type { CVData } from '@/lib/cv-templates/types';
import { visibleCvData } from '@/lib/cv-templates/hidden';
import {
  formatDateRange,
  formatSingleDate,
  inferCvLocale,
  sectionHeading,
  uiText,
  type HeadingKey,
} from '@/lib/cv-templates/locale';
import { PAPER_MM, getPrintSpec, type PaperSize } from '@/lib/cv-templates/print-spec';
import { CV_TEMPLATE_DEFINITIONS } from '@/lib/cv-templates/types';
import { displayUrl, fullUrl } from '@/lib/cv-templates/url';
import { formatBirthDate } from '@/lib/cv-templates/birthdate';
import { exportText } from './export-text';
import { PDF_PRODUCER } from './pdf';

/**
 * CV as a Word document. Native paragraphs and heading styles only: no layout
 * tables, no text boxes, so every parser reads it in document order. The same
 * section order and headings as the PDF. DACH templates carry the photo as one
 * floating picture anchored to the top right.
 *
 * Fonts are Arial and Georgia, which every Word install has. The PDF uses
 * Arimo and Gelasio, their metric-compatible twins.
 */

const BODY_FONT = 'Arial';
const HEADING_FONT = 'Georgia';
const BODY_SIZE = 20; // half-points: 10 pt
const SMALL_SIZE = 20;

/** Linear reading order of each template, matching the order of its PDF. */
export const SECTION_ORDER: Record<string, Array<HeadingKey | 'custom'>> = {
  'premium-ats': ['summary', 'skills', 'experience', 'education', 'certifications', 'languages', 'projects', 'additionalInfo', 'custom'],
  executive: ['summary', 'skills', 'experience', 'education', 'certifications', 'languages', 'projects', 'additionalInfo', 'custom'],
  'classic-green': ['summary', 'skills', 'experience', 'education', 'certifications', 'languages', 'projects', 'additionalInfo', 'custom'],
  'german-classic': ['summary', 'skills', 'experience', 'education', 'certifications', 'languages', 'projects', 'additionalInfo', 'custom'],
  'modern-professional': ['summary', 'experience', 'education', 'skills', 'certifications', 'languages', 'projects', 'additionalInfo', 'custom'],
  'german-ats': ['summary', 'experience', 'education', 'skills', 'languages', 'certifications', 'projects', 'additionalInfo', 'custom'],
};

function templateColor(templateId: string): string {
  const template = CV_TEMPLATE_DEFINITIONS.find((entry) => entry.id === templateId) ?? CV_TEMPLATE_DEFINITIONS[0];
  return template.colors.primary.replace('#', '').toUpperCase();
}

/** Contact items in the order the PDF prints them. Links carry their address as the visible text. */
function contactItems(data: CVData): Array<{ text: string; link?: string }> {
  const p = data.personal;
  const place = [p.address, p.city, p.country]
    .filter((part, index, all): part is string => Boolean(part) && all.indexOf(part) === index)
    .join(', ');
  const links = [p.linkedIn, p.github, p.portfolio, p.website].filter((part): part is string => Boolean(part));
  return [
    ...[p.email, p.phone, place].filter((part): part is string => Boolean(part)).map((text) => ({ text })),
    ...links.map((link) => ({ text: displayUrl(link), link: fullUrl(link) })),
  ];
}

function parsePhoto(photoUrl: string | undefined): { type: 'jpg' | 'png'; data: Uint8Array } | null {
  const match = photoUrl?.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (!match) return null;
  return { type: match[1].toLowerCase() === 'png' ? 'png' : 'jpg', data: Uint8Array.from(Buffer.from(match[2], 'base64')) };
}

function run(text: string, options: { bold?: boolean; italics?: boolean; color?: string; size?: number; font?: string } = {}): TextRun {
  return new TextRun({ text, bold: options.bold, italics: options.italics, color: options.color, size: options.size, font: options.font });
}

export interface CvDocxInput {
  data: CVData;
  templateId: string;
  paper?: PaperSize;
  title: string;
  author: string;
}

export async function buildCvDocx(input: CvDocxInput): Promise<Uint8Array> {
  const data = visibleCvData(input.data);
  const spec = getPrintSpec(input.templateId, input.paper);
  const color = templateColor(input.templateId);
  const locale = inferCvLocale(data);
  const paper = PAPER_MM[spec.paper];
  const margin = spec.marginMm;
  const contentWidthTwip = convertMillimetersToTwip(paper.width - margin.left - margin.right);
  const photo = spec.market === 'dach' ? parsePhoto(data.personal.photoUrl) : null;

  const h1 = (key: HeadingKey) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      keepNext: true,
      spacing: { before: 240, after: 100 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color, space: 2 } },
      children: [run(sectionHeading(data, key), { bold: true, color, font: HEADING_FONT, size: 21 })],
    });

  const bullet = (text: string) =>
    new Paragraph({
      numbering: { reference: 'bullets', level: 0 },
      spacing: { after: 40 },
      children: [run(text)],
    });

  const body = (children: Array<TextRun | ExternalHyperlink>, after = 60) =>
    new Paragraph({ spacing: { after }, children });

  const paragraphs: Paragraph[] = [];

  // Name, title and contact details: always in the body, never in a header or footer.
  paragraphs.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 40 },
      children: [
        run(data.personal.fullName || 'Your Name', { bold: true, color, font: HEADING_FONT, size: 48 }),
        ...(photo
          ? [
              new ImageRun({
                type: photo.type,
                data: photo.data,
                transformation: { width: 132, height: 178 },
                altText: { name: 'Photo', title: 'Photo', description: `Photo of ${data.personal.fullName}` },
                floating: {
                  horizontalPosition: { relative: HorizontalPositionRelativeFrom.MARGIN, align: HorizontalPositionAlign.RIGHT },
                  verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: 0 },
                  wrap: { type: TextWrappingType.SQUARE, margins: { distL: 114300 } },
                },
              }),
            ]
          : []),
      ],
    }),
  );
  if (data.personal.currentTitle) {
    paragraphs.push(body([run(data.personal.currentTitle, { color, font: HEADING_FONT, size: 26 })], 80));
  }
  for (const item of contactItems(data)) {
    paragraphs.push(
      body([
        item.link
          ? new ExternalHyperlink({ link: item.link, children: [new TextRun({ text: item.text, style: 'Hyperlink' })] })
          : run(item.text),
      ], 20),
    );
  }
  // Date of birth and nationality belong to the DACH CV. A US CV never prints them, as in the PDF.
  const personalFacts = spec.market !== 'dach' ? [] : [
    data.personal.dateOfBirth ? `${uiText(data, 'dateOfBirthLabel')}: ${formatBirthDate(data)}` : '',
    data.personal.nationality ? `${uiText(data, 'nationalityLabel')}: ${data.personal.nationality}` : '',
  ].filter(Boolean);
  if (personalFacts.length > 0) paragraphs.push(body([run(personalFacts.join('   '))], 20));

  const sections: Record<HeadingKey | 'custom', () => Paragraph[]> = {
    summary: () => (data.summary ? [h1('summary'), body([run(data.summary)], 80)] : []),
    skills: () => {
      if (data.skills.length === 0) return [];
      return [
        h1('skills'),
        ...data.skills.map((group) => body([run(`${group.category}: `, { bold: true }), run(group.items.join(', '))], 40)),
      ];
    },
    experience: () => {
      if (data.experience.length === 0) return [];
      const out: Paragraph[] = [h1('experience')];
      for (const exp of data.experience) {
        out.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            keepNext: true,
            spacing: { before: 120, after: 20 },
            tabStops: [{ type: TabStopType.RIGHT, position: contentWidthTwip }],
            children: [
              run(exp.position, { bold: true, font: HEADING_FONT, size: 21 }),
              new TextRun({ children: [new Tab(), formatDateRange(data, exp)], color: '4A5568', font: BODY_FONT, size: BODY_SIZE }),
            ],
          }),
          new Paragraph({
            keepNext: exp.bullets.length > 0,
            spacing: { after: 40 },
            children: [run(exp.company, { color }), ...(exp.location ? [run(` | ${exp.location}`, { color: '4A5568' })] : [])],
          }),
          ...exp.bullets.map(bullet),
        );
      }
      return out;
    },
    education: () => {
      if (data.education.length === 0) return [];
      const out: Paragraph[] = [h1('education')];
      for (const edu of data.education) {
        const degree = edu.field ? `${edu.degree} ${uiText(data, 'degreeConnector')} ${edu.field}` : edu.degree;
        out.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            keepNext: true,
            spacing: { before: 80, after: 20 },
            tabStops: [{ type: TabStopType.RIGHT, position: contentWidthTwip }],
            children: [
              run(degree, { bold: true, font: HEADING_FONT, size: 21 }),
              ...(edu.endDate ? [new TextRun({ children: [new Tab(), formatSingleDate(data, edu.endDate)], color: '4A5568', font: BODY_FONT, size: BODY_SIZE })] : []),
            ],
          }),
          body([run(edu.institution + (edu.grade ? ` | ${uiText(data, 'gradePrefix')} ${edu.grade}` : ''), { color: '4A5568' })], 40),
        );
      }
      return out;
    },
    certifications: () =>
      data.certifications.length === 0
        ? []
        : [
            h1('certifications'),
            ...data.certifications.map((cert) =>
              body([run(cert.name, { bold: true }), run(cert.issuer ? ` (${cert.issuer})` : ''), run(cert.date ? `, ${formatSingleDate(data, cert.date)}` : '')], 40),
            ),
          ],
    languages: () =>
      data.languages.length === 0
        ? []
        : [
            h1('languages'),
            body(data.languages.flatMap((lang, index) => [
              ...(index > 0 ? [run(', ')] : []),
              run(lang.language + (lang.proficiency ? ':' : ''), { bold: true }),
              ...(lang.proficiency ? [run(` ${lang.proficiency}`)] : []),
            ]), 60),
          ],
    projects: () =>
      !data.projects || data.projects.length === 0
        ? []
        : [
            h1('projects'),
            ...data.projects.map((project) => {
              const description = project.description?.trim();
              return body([
                run(project.name, { bold: true }),
                ...(description && description.toLowerCase() !== project.name.trim().toLowerCase() ? [run(`: ${description}`)] : []),
                ...(project.technologies?.length ? [run(` (${project.technologies.join(', ')})`, { color: '4A5568' })] : []),
              ], 40);
            }),
          ],
    additionalInfo: () =>
      !data.additionalInfo || data.additionalInfo.length === 0 ? [] : [h1('additionalInfo'), body([run(data.additionalInfo.join(' • '))], 60)],
    custom: () =>
      (data.customSections ?? []).flatMap((section) => [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          keepNext: true,
          spacing: { before: 240, after: 100 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color, space: 2 } },
          children: [run(section.title, { bold: true, color, font: HEADING_FONT, size: 21 })],
        }),
        ...section.items.map(bullet),
      ]),
  };

  for (const key of SECTION_ORDER[input.templateId] ?? SECTION_ORDER['premium-ats']) {
    paragraphs.push(...sections[key]());
  }

  if (data.signature?.includeSignature) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 400 },
        children: [run(`${data.signature.city || uiText(data, 'cityLabel')}, ${data.signature.date || uiText(data, 'dateLabel')}`, { color: '4A5568' })],
      }),
    );
  }

  const doc = new Document({
    creator: PDF_PRODUCER,
    title: input.title,
    subject: exportText(locale).cvSubject,
    description: input.author,
    styles: {
      default: {
        document: {
          run: { font: BODY_FONT, size: BODY_SIZE, language: { value: exportText(locale).bcp47 } },
          paragraph: { spacing: { line: 264 } },
        },
        heading1: { run: { font: HEADING_FONT, bold: true, size: 21, color } },
        heading2: { run: { font: HEADING_FONT, bold: true, size: 21 } },
        title: { run: { font: HEADING_FONT, bold: true, size: 48, color } },
      },
      characterStyles: [{ id: 'Hyperlink', name: 'Hyperlink', run: { color: '1F4E79', size: SMALL_SIZE } }],
    },
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 240 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: convertMillimetersToTwip(paper.width), height: convertMillimetersToTwip(paper.height) },
            margin: {
              top: convertMillimetersToTwip(margin.top),
              right: convertMillimetersToTwip(margin.right),
              bottom: convertMillimetersToTwip(margin.bottom),
              left: convertMillimetersToTwip(margin.left),
            },
          },
        },
        children: paragraphs,
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
