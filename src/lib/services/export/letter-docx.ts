import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  LineRuleType,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
  convertMillimetersToTwip,
} from 'docx';
import { displayUrl, fullUrl, pickLetterLinks } from '@/lib/cv-templates/url';
import type { StructuredCoverLetter } from '@/lib/cover-letter/contract';
import { DIN, dinClosing, recipientLinesFor, type LetterInput, type LetterLayout } from './letter-html';
import { PDF_PRODUCER } from './pdf';

/**
 * Cover letter as a Word document, from the same structure as the PDF.
 * Native paragraphs only. The DIN layout positions the address field with
 * exact line heights and spacing (Word has no page-absolute placement without
 * text boxes, which this export avoids), so the zones land within a
 * millimetre or two of the PDF.
 */

const FONT = 'Arial';
const BODY = 22; // 11 pt

const mm = convertMillimetersToTwip;

function line(text: string, options: { bold?: boolean; size?: number } = {}): TextRun {
  return new TextRun({ text, bold: options.bold, size: options.size ?? BODY, font: FONT });
}

function p(text: string, spacingAfter = 0, options: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}): Paragraph {
  return new Paragraph({
    alignment: options.align,
    spacing: { after: spacingAfter, line: 276 },
    children: [line(text, { bold: options.bold })],
  });
}

function blank(): Paragraph {
  return new Paragraph({ spacing: { after: 0, line: 276 }, children: [line('')] });
}

function exact(children: TextRun[], heightMm: number, before = 0, border = false): Paragraph {
  return new Paragraph({
    spacing: { before, after: 0, line: mm(heightMm), lineRule: LineRuleType.EXACT },
    border: border ? { bottom: { style: BorderStyle.SINGLE, size: 2, color: '444444', space: 0 } } : undefined,
    children,
  });
}

/** The sender's contact lines as runs: address, phone, email, then at most two clean links, clickable. */
function senderLines(letter: StructuredCoverLetter, size = BODY): Array<Array<TextRun | ExternalHyperlink>> {
  const { sender } = letter;
  const plain = [...sender.addressLines, sender.phone, sender.email].filter((x): x is string => Boolean(x && x.trim()));
  return [
    ...plain.map((text) => [line(text, { size })] as Array<TextRun | ExternalHyperlink>),
    ...pickLetterLinks(sender.links).map(
      (link) =>
        [
          new ExternalHyperlink({ link: fullUrl(link), children: [new TextRun({ text: displayUrl(link), size, font: FONT, color: '1F4E79' })] }),
        ] as Array<TextRun | ExternalHyperlink>,
    ),
  ];
}

function usChildren(letter: StructuredCoverLetter): Paragraph[] {
  const subject = letter.subject.trim();
  const recipient = recipientLinesFor(letter, 'us');
  return [
    p(letter.sender.name, 0, { bold: true }),
    ...senderLines(letter).map((runs) => new Paragraph({ spacing: { after: 0, line: 276 }, children: runs })),
    blank(),
    p(letter.date),
    blank(),
    ...recipient.map((text) => p(text)),
    ...(recipient.length > 0 ? [blank()] : []),
    ...(subject ? [p(/^re:/i.test(subject) ? subject : `Re: ${subject}`, 0, { bold: true }), blank()] : []),
    p(letter.salutation),
    blank(),
    ...letter.paragraphs.flatMap((paragraph) => [p(paragraph), blank()]),
    p(letter.closing),
    blank(),
    blank(),
    blank(),
    p(letter.signatureName || letter.sender.name, 0, { bold: true }),
  ];
}

/**
 * DIN 5008 Form B in Word. Word has no page-absolute placement without text
 * boxes, which this export avoids, so the zones are built with exact line
 * heights and spacing, measured from a LibreOffice render in the eval:
 *   letterhead lines at the top margin (15 mm), the return line in the top 5 mm
 *   of the address field (45 to 50 mm), then the 12.7 mm that finish the
 *   Zusatz- und Vermerkzone (17.7 mm with the return line), then the
 *   Anschriftzone, whose first line carries the date on a right tab, as the
 *   PDF has it. The address field sits 5 mm into the left margin (20 mm).
 */
function dinChildren(letter: StructuredCoverLetter): Paragraph[] {
  const topMargin = 15;
  const contactRuns = senderLines(letter, 20);
  const headCount = 1 + contactRuns.length;
  // Never overprint the address field: past 7 lines the letterhead shrinks to fit its 31 mm.
  const available = DIN.addressTop - topMargin - 1;
  const lineHeight = headCount <= 7 ? 4.45 : Math.floor((available / headCount) * 100) / 100;
  const headSize = headCount <= 7 ? 20 : Math.max(13, Math.round(lineHeight * 4.4));
  const recipient = recipientLinesFor(letter, 'din').slice(0, 6);
  const returnLine = [letter.sender.name, ...letter.sender.addressLines].filter(Boolean).join(' · ');
  const dateLine = [letter.place, letter.date].filter((part) => part && part.trim()).join(', ');

  const headHeight = headCount * lineHeight;
  const beforeReturn = Math.max(0, DIN.addressTop - topMargin - headHeight);
  const recipientHeight = recipient.length * 4.5;
  const afterRecipient = Math.max(0, DIN.addressTop + DIN.addressHeight - (DIN.recipientTop + recipientHeight));
  const subject = letter.subject.trim();
  const fieldIndent = -mm(DIN.marginLeft - DIN.addressLeft);
  const contentWidth = mm(210 - DIN.marginLeft - DIN.marginRight);

  const recipientParagraphs = recipient.map((text, index) =>
    new Paragraph({
      indent: { left: fieldIndent },
      tabStops: [{ type: TabStopType.RIGHT, position: contentWidth }],
      spacing: { before: index === 0 ? mm(DIN.noteZoneHeight - DIN.returnLineHeight) : 0, after: 0, line: mm(4.5), lineRule: LineRuleType.EXACT },
      children: index === 0 && dateLine ? [line(text), new TextRun({ children: [new Tab(), dateLine], font: FONT, size: BODY })] : [line(text)],
    }),
  );

  return [
    exact([line(letter.sender.name, { bold: true, size: headSize })], lineHeight),
    ...contactRuns.map((runs) => new Paragraph({ spacing: { after: 0, line: mm(lineHeight), lineRule: LineRuleType.EXACT }, children: runs })),
    new Paragraph({
      indent: { left: fieldIndent, right: mm(DIN.marginRight) },
      spacing: { before: mm(beforeReturn), after: 0, line: mm(DIN.returnLineHeight), lineRule: LineRuleType.EXACT },
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: '444444', space: 0 } },
      children: [new TextRun({ text: returnLine, size: 14, font: FONT })],
    }),
    ...recipientParagraphs,
    ...(subject
      ? [new Paragraph({ spacing: { before: mm(afterRecipient + 9), after: 0, line: 276 }, children: [line(subject, { bold: true })] }), blank()]
      : [new Paragraph({ spacing: { before: mm(afterRecipient), after: 0, line: 276 }, children: [line('')] })]),
    p(letter.salutation),
    blank(),
    ...letter.paragraphs.flatMap((paragraph) => [p(paragraph), blank()]),
    p(dinClosing(letter.closing)),
    blank(),
    blank(),
    blank(),
    p(letter.signatureName || letter.sender.name),
  ];
}

function legacyChildren(text: string): Paragraph[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(
      (part) =>
        new Paragraph({
          spacing: { after: 200, line: 276 },
          children: part.split('\n').flatMap((row, index) => [
            ...(index > 0 ? [new TextRun({ break: 1, font: FONT, size: BODY })] : []),
            line(row),
          ]),
        }),
    );
}

export interface LetterDocxInput {
  input: LetterInput;
  layout: LetterLayout;
  title: string;
  language: string;
}

export async function buildLetterDocx(args: LetterDocxInput): Promise<Uint8Array> {
  const { input, layout } = args;
  const children =
    input.kind === 'legacy' ? legacyChildren(input.text) : layout === 'din' ? dinChildren(input.letter) : usChildren(input.letter);

  const page =
    layout === 'din'
      ? {
          size: { width: mm(210), height: mm(297) },
          margin: { top: mm(15), right: mm(DIN.marginRight), bottom: mm(DIN.marginBottom), left: mm(DIN.marginLeft) },
        }
      : {
          size: { width: mm(215.9), height: mm(279.4) },
          margin: { top: mm(25.4), right: mm(25.4), bottom: mm(25.4), left: mm(25.4) },
        };

  const doc = new Document({
    creator: PDF_PRODUCER,
    title: args.title,
    styles: {
      default: { document: { run: { font: FONT, size: BODY, language: { value: args.language.startsWith('de') ? 'de-DE' : 'en-US' } } } },
    },
    sections: [{ properties: { page }, children }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
