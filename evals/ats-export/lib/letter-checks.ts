import sharp from 'sharp';
import type { StructuredCoverLetter } from '../../../src/lib/cover-letter/contract';
import { DIN } from '../../../src/lib/services/export/letter-html';
import { norm, squash } from './expect';
import { extractWithPdfJs, mmToPt, ptToMm, type PdfItem } from './pdf-text';
import { pdfPagePng, pdfinfo, pdftotext } from './poppler';

export interface LetterReport {
  name: string;
  layout: 'us' | 'din';
  ok: boolean;
  failures: string[];
  warnings: string[];
  measured: Record<string, number | string>;
}

interface Line {
  text: string;
  /** mm from the left edge. */
  x: number;
  /** Right edge, mm. */
  right: number;
  /** Baseline, mm from the top of page 1. */
  y: number;
  sizePt: number;
  bold: boolean;
  page: number;
}

function toLines(items: PdfItem[]): Line[] {
  const rows: PdfItem[][] = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const row = rows.find((r) => r[0].page === item.page && Math.abs(r[0].y - item.y) < 1.2);
    if (row) row.push(item);
    else rows.push([item]);
  }
  // A row can hold two columns (the recipient and the date share a baseline), so a wide gap splits it.
  const segments: PdfItem[][] = [];
  for (const row of rows) {
    const sortedRow = [...row].sort((a, b) => a.x - b.x);
    let current: PdfItem[] = [sortedRow[0]];
    for (const item of sortedRow.slice(1)) {
      const prev = current[current.length - 1];
      if (item.x - (prev.x + prev.w) > Math.max(12, item.size * 2)) {
        segments.push(current);
        current = [item];
      } else {
        current.push(item);
      }
    }
    segments.push(current);
  }
  return segments
    .map((row) => {
      const sorted = row.sort((a, b) => a.x - b.x);
      return {
        text: sorted.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim(),
        x: ptToMm(sorted[0].x),
        right: ptToMm(Math.max(...sorted.map((i) => i.x + i.w))),
        y: ptToMm(sorted[0].y),
        sizePt: sorted[0].size,
        bold: /bold/i.test(sorted[0].fontName),
        page: sorted[0].page,
      };
    })
    .sort((a, b) => a.page - b.page || a.y - b.y);
}

function allFields(letter: StructuredCoverLetter): string[] {
  return [
    letter.sender.name,
    ...letter.sender.addressLines,
    letter.sender.phone ?? '',
    letter.sender.email ?? '',
    letter.recipient.companyName ?? '',
    letter.recipient.contactPerson ?? '',
    letter.recipient.department ?? '',
    ...letter.recipient.addressLines,
    letter.date,
    letter.subject,
    letter.salutation,
    ...letter.paragraphs,
    letter.signatureName,
  ].filter(Boolean);
}

async function markRows(bytes: Uint8Array, dpi: number, yMm: number): Promise<number> {
  const png = await pdfPagePng(bytes, 1, dpi);
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const toPx = (mm: number) => Math.round((mm / 25.4) * dpi);
  let darkest = 255;
  for (let y = toPx(yMm) - 3; y <= toPx(yMm) + 3; y++) {
    for (let x = 0; x < toPx(5); x++) darkest = Math.min(darkest, data[y * info.width + x]);
  }
  return darkest;
}

export async function checkLetterPdf(bytes: Uint8Array, name: string, layout: 'us' | 'din', letter: StructuredCoverLetter): Promise<LetterReport> {
  const failures: string[] = [];
  const warnings: string[] = [];
  const measured: LetterReport['measured'] = {};
  const [info, pdfjs, text] = await Promise.all([pdfinfo(bytes), extractWithPdfJs(bytes), pdftotext(bytes, 'reading-order')]);
  const lines = toLines(pdfjs.items);
  const flat = norm(text);

  const squashed = squash(text);
  void flat;
  for (const field of allFields(letter)) {
    if (!squashed.includes(squash(field))) failures.push(`text is missing: ${field.slice(0, 60)}`);
  }
  if (/Betreff/i.test(text)) failures.push('"Betreff:" is printed');
  if (!info.tagged) failures.push('PDF is not tagged');
  if (info.producer !== 'Useful Apply') warnings.push(`producer is "${info.producer}" (set by the export service, not the renderer)`);

  const find = (needle: string) => lines.find((line) => norm(line.text).includes(norm(needle)));
  const approx = (label: string, actual: number, expected: number, tol: number) => {
    measured[label] = Number(actual.toFixed(1));
    if (Math.abs(actual - expected) > tol) failures.push(`${label} is ${actual.toFixed(1)} mm, expected ${expected} (+/- ${tol})`);
  };

  if (layout === 'us') {
    if (Math.abs(info.pageSizePts.width - 612) > 2 || Math.abs(info.pageSizePts.height - 792) > 2) failures.push('page is not Letter');
    const left = Math.min(...lines.map((l) => l.x));
    const right = Math.min(...lines.map((l) => 215.9 - l.right));
    measured.leftMarginMm = Number(left.toFixed(1));
    measured.rightMarginMm = Number(right.toFixed(1));
    if (left < 25.4 - 0.8) failures.push(`text starts ${left.toFixed(1)} mm from the left, margin is 25.4`);
    if (right < 25.4 - 0.8) failures.push(`text ends ${right.toFixed(1)} mm from the right, margin is 25.4`);
    // Block format: every line starts at the left margin.
    const indented = lines.filter((l) => l.x > 25.4 + 1);
    if (indented.length > 0) failures.push(`${indented.length} line(s) are indented, block format has none (${indented[0].text.slice(0, 30)})`);
    const date = find(letter.date);
    const recipient = find(letter.recipient.companyName ?? '');
    const salutation = find(letter.salutation);
    const closing = find(letter.closing);
    if (!date || !recipient || !salutation || !closing) failures.push('a letter block is missing from the page');
    else if (!(date.y < recipient.y && recipient.y < salutation.y && salutation.y < closing.y)) failures.push('block order is not date, recipient, salutation, closing');
  } else {
    if (Math.abs(info.pageSizePts.width - mmToPt(210)) > 2 || Math.abs(info.pageSizePts.height - mmToPt(297)) > 2) failures.push('page is not A4');
    const ret = lines.find((l) => l.page === 1 && l.sizePt <= 8.2 && l.y > 40 && l.y < 55);
    if (!ret) failures.push('return line (Ruecksendeangabe) not found in the top 5 mm of the address field');
    else {
      approx('returnLine.x', ret.x, DIN.addressLeft, 1.2);
      if (ret.y < DIN.addressTop || ret.y > DIN.addressTop + DIN.returnLineHeight + 0.5) failures.push(`return line baseline ${ret.y.toFixed(1)} mm is outside ${DIN.addressTop}-${DIN.addressTop + DIN.returnLineHeight}`);
      measured['returnLine.y'] = Number(ret.y.toFixed(1));
      measured['returnLine.pt'] = Number(ret.sizePt.toFixed(1));
    }
    const first = find(letter.recipient.companyName ?? '');
    const lastRecipientLine = find(letter.recipient.addressLines[letter.recipient.addressLines.length - 1]);
    if (!first || !lastRecipientLine) failures.push('recipient block not found');
    else {
      approx('recipient.x', first.x, DIN.addressLeft, 1.2);
      const top = first.y - first.sizePt * 0.3528 * 0.8;
      measured['recipient.firstTop'] = Number(top.toFixed(1));
      if (top < DIN.recipientTop - 1.5) failures.push(`recipient starts ${top.toFixed(1)} mm from the top, the Anschriftzone starts at ${DIN.recipientTop}`);
      if (lastRecipientLine.y > DIN.addressTop + DIN.addressHeight + 0.5) failures.push(`recipient ends at ${lastRecipientLine.y.toFixed(1)} mm, past the 90 mm bottom of the address field`);
      if (first.right > DIN.addressLeft + DIN.addressWidth + 0.5) failures.push('recipient line is wider than the 85 mm field');
    }
    const dateLine = find(letter.date);
    if (!dateLine) failures.push('date line not found');
    else {
      approx('date.rightEdge', dateLine.right, 210 - DIN.marginRight, 1.5);
      if (dateLine.x < DIN.infoLeft - 0.8) failures.push(`date starts at ${dateLine.x.toFixed(1)} mm, the information block starts at ${DIN.infoLeft}`);
      measured['date.x'] = Number(dateLine.x.toFixed(1));
      if (letter.place && !norm(dateLine.text).startsWith(norm(letter.place))) failures.push('date line does not start with the place');
    }
    const subject = find(letter.subject);
    if (!subject) failures.push('subject line not found');
    else {
      if (!subject.bold) failures.push('subject is not bold');
      // Two blank lines under the address block, which ends at 90 mm.
      const gapLines = (subject.y - (DIN.addressTop + DIN.addressHeight)) / 4.9;
      measured['subject.y'] = Number(subject.y.toFixed(1));
      measured['subject.blankLinesBelowAddress'] = Number((gapLines - 1).toFixed(1));
      if (subject.y < 96 || subject.y > 106) failures.push(`subject baseline at ${subject.y.toFixed(1)} mm, expected about 99-104 (two blank lines under the 90 mm address field)`);
      approx('subject.x', subject.x, DIN.marginLeft, 1.2);
    }
    const salutation = find(letter.salutation);
    const firstParagraph = lines.find((l) => norm(l.text).startsWith(norm(letter.paragraphs[0]).slice(0, 24)));
    if (!salutation || !firstParagraph) failures.push('salutation or first paragraph not found');
    else {
      const gap = firstParagraph.y - salutation.y;
      measured['salutation.gap'] = Number(gap.toFixed(1));
      if (Math.abs(gap - 2 * 4.9) > 1.5) failures.push(`${gap.toFixed(1)} mm between salutation and text, one blank line is ${(2 * 4.9).toFixed(1)}`);
    }
    if (subject && salutation) {
      const gap = salutation.y - subject.y;
      measured['subject.toSalutation'] = Number(gap.toFixed(1));
      if (Math.abs(gap - 2 * 4.9) > 1.5) failures.push(`${gap.toFixed(1)} mm between subject and salutation, one blank line is ${(2 * 4.9).toFixed(1)}`);
    }
    const closing = lines.find((l) => norm(l.text) === norm(letter.closing.replace(/[,;:]+$/, '')));
    if (!closing) failures.push(`closing "${letter.closing}" not found without a comma`);
    if (/Grüßen,/.test(text)) failures.push('the closing has a comma');
    // Body margins: 25 mm left, 20 mm right. The address field and return line sit in the left margin by design.
    const body = lines.filter((l) => l.y > 96 && l.page === 1 || l.page > 1);
    if (body.length > 0) {
      const left = Math.min(...body.map((l) => l.x));
      const rightMargin = Math.min(...body.map((l) => 210 - l.right));
      measured['body.leftMm'] = Number(left.toFixed(1));
      measured['body.rightMm'] = Number(rightMargin.toFixed(1));
      if (left < DIN.marginLeft - 0.8) failures.push(`body starts ${left.toFixed(1)} mm from the left, margin is ${DIN.marginLeft}`);
      if (rightMargin < DIN.marginRight - 0.8) failures.push(`body ends ${rightMargin.toFixed(1)} mm from the right, margin is ${DIN.marginRight}`);
    }
    // Fold and hole marks, from pixels: dark within 5 mm of the left edge at the DIN heights.
    for (const y of [...DIN.foldMarks, DIN.holeMark]) {
      const darkest = await markRows(bytes, 300, y);
      measured[`mark@${y}mm`] = darkest;
      if (darkest > 200) failures.push(`no fold or hole mark at ${y} mm`);
    }
    const control = await markRows(bytes, 300, 130);
    if (control < 200) failures.push('unexpected mark at 130 mm');
  }

  return { name, layout, ok: failures.length === 0, failures, warnings, measured };
}
