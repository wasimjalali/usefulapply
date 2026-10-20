import {
  AlignmentType,
  BorderStyle,
  Document,
  LineRuleType,
  Packer,
  Paragraph,
  TextRun,
  convertMillimetersToTwip,
} from 'docx';
import type { StructuredCoverLetter } from '@/lib/cover-letter/contract';
import { DIN, dinClosing, type LetterInput, type LetterLayout } from './letter-html';
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

function usChildren(letter: StructuredCoverLetter): Paragraph[] {
  const subject = letter.subject.trim();
  const sender = [letter.sender.name, ...letter.sender.addressLines, letter.sender.phone, letter.sender.email, ...(letter.sender.links ?? [])].filter((x): x is string => Boolean(x && x.trim()));
  const recipient = [letter.recipient.companyName, letter.recipient.department, letter.recipient.contactPerson, ...letter.recipient.addressLines].filter((x): x is string => Boolean(x && x.trim()));
  return [
    ...sender.map((text, index) => p(text, 0, { bold: index === 0 })),
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

function dinChildren(letter: StructuredCoverLetter): Paragraph[] {
  const lineHeight = 4.45;
  const topMargin = 15;
  const headLines = [letter.sender.name, ...letter.sender.addressLines, letter.sender.phone, letter.sender.email].filter((x): x is string => Boolean(x && x.trim()));
  const recipient = [letter.recipient.companyName, letter.recipient.department, letter.recipient.contactPerson, ...letter.recipient.addressLines].filter((x): x is string => Boolean(x && x.trim()));
  const returnLine = [letter.sender.name, ...letter.sender.addressLines].filter(Boolean).join(' · ');
  const dateLine = [letter.place, letter.date].filter((part) => part && part.trim()).join(', ');

  const headHeight = headLines.length * lineHeight;
  const beforeReturn = Math.max(0, DIN.addressTop - topMargin - headHeight);
  const recipientHeight = Math.min(recipient.length, 6) * 4.5;
  const afterRecipient = Math.max(0, DIN.addressTop + DIN.addressHeight - (DIN.recipientTop + recipientHeight));
  const subject = letter.subject.trim();

  return [
    ...headLines.map((text, index) => exact([line(text, { bold: index === 0, size: 20 })], lineHeight)),
    exact([new TextRun({ text: returnLine, size: 14, font: FONT })], DIN.returnLineHeight, mm(beforeReturn), true),
    ...recipient.map((text, index) =>
      exact([line(text)], 4.5, index === 0 ? mm(DIN.noteZoneHeight) : 0),
    ),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: mm(afterRecipient), after: 0, line: mm(4.9), lineRule: LineRuleType.EXACT },
      children: [line(dateLine)],
    }),
    ...(subject
      ? [new Paragraph({ spacing: { before: mm(9.8), after: 0, line: 276 }, children: [line(subject, { bold: true })] }), blank()]
      : [blank()]),
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
