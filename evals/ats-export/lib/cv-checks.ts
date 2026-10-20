import { PDFDocument, PDFName, PDFString, PDFHexString, PDFBool } from 'pdf-lib';
import type { CVData } from '../../../src/lib/cv-templates/types';
import { getPrintSpec, PAPER_MM } from '../../../src/lib/cv-templates/print-spec';
import { checkText, expectationsFor, norm, type TextCheck, type CvExpectations } from './expect';
import { extractWithPdfJs, mmToPt, type PdfItem } from './pdf-text';
import { pdfImageCount, pdfinfo, pdffonts, pdftotext } from './poppler';

export interface CvPdfContext {
  fixture: string;
  templateId: string;
  source: CVData;
  /** The photo is in the render's input and the template prints one. */
  expectPhoto: boolean;
  expectedPages?: number;
}

export interface ExtractionSummary {
  skills: string;
  bullets: string;
  contact: string;
  headings: string;
  jobsPaired: string;
  nonAsciiLost: string[];
  missing: string[];
  pairingFailures: string[];
}

export interface CvPdfReport {
  fixture: string;
  templateId: string;
  ok: boolean;
  failures: string[];
  warnings: string[];
  metrics: {
    pages: number;
    pageSizePts: { width: number; height: number };
    fileSizeKB: number;
    tagged: boolean;
    title: string;
    author: string;
    subject: string;
    producer: string;
    lang: string;
    displayDocTitle: boolean;
    fonts: Array<{ name: string; type: string; embedded: boolean; unicode: boolean }>;
    imageCount: number;
    minFontPt: number;
    marginsMm: { left: number; right: number; top: number; bottom: number };
    headingOrder: { pdfjs: string[]; raw: string[]; readingOrder: string[] };
  };
  extraction: { pdftotext: ExtractionSummary; pdftotextRaw: ExtractionSummary; pdfjs: ExtractionSummary };
}

const HEADING_ORDER: Record<string, string[]> = {
  'premium-ats': ['summary', 'skills', 'experience', 'education', 'certifications', 'projects'],
  executive: ['summary', 'skills', 'experience', 'education', 'certifications', 'projects'],
  'classic-green': ['summary', 'skills', 'experience', 'education', 'certifications', 'projects'],
  'german-classic': ['summary', 'skills', 'experience', 'education', 'certifications', 'projects'],
  'modern-professional': ['summary', 'experience', 'education', 'projects', 'skills', 'certifications'],
  'german-ats': ['summary', 'experience', 'education', 'projects', 'skills', 'certifications'],
};

function summarize(check: TextCheck): ExtractionSummary {
  const c = check.counts;
  const ratio = (kind: string) => `${c[kind]?.found ?? 0}/${c[kind]?.total ?? 0}`;
  return {
    skills: ratio('skills'),
    bullets: ratio('bullets'),
    contact: ratio('contact'),
    headings: `${check.headingsFound}/${check.headingsTotal}`,
    jobsPaired: `${Object.keys(check.counts).length ? (c.jobTitles?.total ?? 0) - check.pairingFailures.length : 0}/${c.jobTitles?.total ?? 0}`,
    nonAsciiLost: check.nonAsciiLost,
    missing: check.missing,
    pairingFailures: check.pairingFailures,
  };
}

function textLines(text: string): string[] {
  return text.split(/[\n\f]/);
}

const TWO_COLUMN = new Set(['modern-professional', 'german-ats']);
const MAIN_SECTIONS = ['summary', 'experience', 'education', 'projects'];

/**
 * Two-column templates are main column first, sidebar second, on every page:
 * a page fragments the main column and the sidebar, and each page's stream
 * holds the main part before the sidebar part. So the check is per page, and
 * across pages each column keeps its own order.
 */
function twoColumnOrderProblems(pages: string[], exp: CvExpectations, domOrder: string[]): string[] {
  const problems: string[] = [];
  const mainOrder = domOrder.filter((k) => MAIN_SECTIONS.includes(k));
  const sideOrder = domOrder.filter((k) => !MAIN_SECTIONS.includes(k));
  const seenMain: string[] = [];
  const seenSide: string[] = [];
  pages.forEach((pageText, index) => {
    const sequence = headingSequence(pageText, exp);
    const firstSide = sequence.findIndex((k) => sideOrder.includes(k));
    const lastMain = sequence.map((k) => MAIN_SECTIONS.includes(k)).lastIndexOf(true);
    if (firstSide >= 0 && lastMain > firstSide) problems.push(`page ${index + 1}: a sidebar section comes before a main section (${sequence.join(' > ')})`);
    seenMain.push(...sequence.filter((k) => MAIN_SECTIONS.includes(k)));
    seenSide.push(...sequence.filter((k) => !MAIN_SECTIONS.includes(k)));
  });
  if (seenMain.join() !== mainOrder.filter((k) => seenMain.includes(k)).join()) problems.push(`main sections out of order: ${seenMain.join(' > ')}`);
  if (seenSide.join() !== sideOrder.filter((k) => seenSide.includes(k)).join()) problems.push(`sidebar sections out of order: ${seenSide.join(' > ')}`);
  return problems;
}

/** Order in which the section headings appear in an extraction. */
function headingSequence(text: string, exp: CvExpectations): string[] {
  const lines = textLines(text);
  const found: Array<{ key: string; index: number }> = [];
  for (const heading of exp.headings) {
    const index = lines.findIndex((line) => norm(line).toLowerCase() === norm(heading.text).toLowerCase());
    if (index >= 0) found.push({ key: heading.key, index });
  }
  return found.sort((a, b) => a.index - b.index).map((entry) => entry.key);
}

async function readCatalog(bytes: Uint8Array): Promise<{ lang: string; displayDocTitle: boolean }> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const lang = doc.catalog.lookup(PDFName.of('Lang'));
  const prefs = doc.catalog.lookup(PDFName.of('ViewerPreferences'));
  let display = false;
  if (prefs && 'lookup' in prefs) {
    const value = (prefs as unknown as { lookup(name: PDFName): unknown }).lookup(PDFName.of('DisplayDocTitle'));
    display = value === PDFBool.True;
  }
  const text = lang instanceof PDFString || lang instanceof PDFHexString ? lang.decodeText() : '';
  return { lang: text, displayDocTitle: display };
}

function observedMargins(items: PdfItem[], pages: Array<{ width: number; height: number }>) {
  let left = Infinity;
  let right = Infinity;
  let top = Infinity;
  let bottom = Infinity;
  for (const item of items) {
    if (!item.str.trim()) continue;
    const page = pages[item.page - 1];
    left = Math.min(left, item.x);
    right = Math.min(right, page.width - (item.x + item.w));
    top = Math.min(top, item.y - item.size * 0.8);
    bottom = Math.min(bottom, page.height - item.y);
  }
  const mm = (pt: number) => Number(((pt * 25.4) / 72).toFixed(1));
  return { left: mm(left), right: mm(right), top: mm(top), bottom: mm(bottom) };
}

/** Everything the eval asserts about one CV PDF. Failures are blocking; warnings are reported only. */
export async function checkCvPdf(bytes: Uint8Array, ctx: CvPdfContext): Promise<CvPdfReport> {
  const exp = expectationsFor(ctx.source);
  const spec = getPrintSpec(ctx.templateId);
  const failures: string[] = [];
  const warnings: string[] = [];

  const [info, fonts, images, readingOrder, raw, pdfjs, catalog] = await Promise.all([
    pdfinfo(bytes),
    pdffonts(bytes),
    pdfImageCount(bytes),
    pdftotext(bytes, 'reading-order'),
    pdftotext(bytes, 'raw'),
    extractWithPdfJs(bytes),
    readCatalog(bytes),
  ]);

  const checks = {
    pdftotext: checkText(readingOrder, exp),
    pdftotextRaw: checkText(raw, exp),
    pdfjs: checkText(pdfjs.text, exp),
  };

  // Content: every tool must find every word, in the right place, with umlauts.
  for (const [tool, check] of Object.entries(checks)) {
    if (check.missing.length > 0) failures.push(`${tool}: missing ${check.missing.length} (${check.missing.slice(0, 3).join(' | ')})`);
    if (check.pairingFailures.length > 0) failures.push(`${tool}: ${check.pairingFailures.length} job(s) lost title, employer and date pairing (${check.pairingFailures[0]})`);
    if (check.nonAsciiLost.length > 0) failures.push(`${tool}: lost characters ${check.nonAsciiLost.join('')}`);
    if (check.mojibake) failures.push(`${tool}: mojibake in extracted text`);
    if (check.hasDashDates) failures.push(`${tool}: en or em dash in the text`);
  }

  // Reading order: stream order (raw, pdf.js) must follow the DOM order of the template.
  const domOrder = HEADING_ORDER[ctx.templateId] ?? HEADING_ORDER['premium-ats'];
  const expectedSequence = domOrder.filter((key) => exp.headings.some((h) => h.key === key));
  const sequences = {
    raw: headingSequence(raw, exp),
    pdfjs: headingSequence(pdfjs.text, exp),
    readingOrder: headingSequence(readingOrder, exp),
  };
  if (TWO_COLUMN.has(ctx.templateId)) {
    for (const [tool, pages] of [['raw', raw.split('\f')], ['pdfjs', pdfjs.pageTexts]] as const) {
      for (const problem of twoColumnOrderProblems(pages, exp, domOrder)) failures.push(`reading order (${tool}): ${problem}`);
    }
  } else {
    for (const tool of ['raw', 'pdfjs'] as const) {
      if (sequences[tool].join() !== expectedSequence.join()) {
        failures.push(`reading order (${tool}): ${sequences[tool].join(' > ')} expected ${expectedSequence.join(' > ')}`);
      }
    }
  }
  if (sequences.readingOrder.join() !== expectedSequence.join()) {
    warnings.push(`pdftotext reading order follows the page geometry: ${sequences.readingOrder.join(' > ')}`);
  }

  // Content must sit under its own heading in the stream. A positioned element
  // paints late, which once pushed every experience entry behind the
  // certifications in the text layer: the headings were in order, the content was not.
  if (!TWO_COLUMN.has(ctx.templateId) && exp.headings.some((h) => h.key === 'experience')) {
    for (const [tool, text] of [['raw', raw], ['pdfjs', pdfjs.text]] as const) {
      const lines = textLines(text).map((line) => norm(line).toLowerCase());
      const at = (heading: string) => lines.findIndex((line) => line === norm(heading).toLowerCase());
      const expAt = at(exp.headings.find((h) => h.key === 'experience')!.text);
      const nextKey = domOrder.slice(domOrder.indexOf('experience') + 1).find((key) => exp.headings.some((h) => h.key === key));
      const nextAt = nextKey ? at(exp.headings.find((h) => h.key === nextKey)!.text) : lines.length;
      const titleAt = (position: string) => lines.findIndex((line, index) => index > expAt && (line === norm(position).toLowerCase() || line.startsWith(`${norm(position).toLowerCase()} `)));
      const jobLines = exp.jobs.map((job) => titleAt(job.position));
      if (jobLines.some((line) => line < 0 || line > nextAt || line < expAt)) failures.push(`stream order (${tool}): experience entries are not between the Experience heading and the next section`);
      else if (jobLines.some((line, index) => index > 0 && line < jobLines[index - 1])) failures.push(`stream order (${tool}): experience entries are out of order`);
    }
  }

  // Page geometry.
  const paper = PAPER_MM[spec.paper];
  const expectW = mmToPt(paper.width);
  const expectH = mmToPt(paper.height);
  if (Math.abs(info.pageSizePts.width - expectW) > 2 || Math.abs(info.pageSizePts.height - expectH) > 2) {
    failures.push(`page size ${info.pageSizePts.width}x${info.pageSizePts.height}pt, expected ${spec.paper}`);
  }
  if (ctx.expectedPages !== undefined && info.pages !== ctx.expectedPages) {
    failures.push(`${info.pages} pages, expected ${ctx.expectedPages}`);
  }
  const margins = observedMargins(pdfjs.items, pdfjs.pages);
  const m = spec.marginMm;
  const tol = 0.8;
  if (margins.left < m.left - tol) failures.push(`text ${margins.left} mm from the left edge, margin is ${m.left.toFixed(1)}`);
  if (margins.right < m.right - tol) failures.push(`text ${margins.right} mm from the right edge, margin is ${m.right.toFixed(1)}`);
  if (margins.top < m.top - tol) failures.push(`text ${margins.top} mm from the top, margin is ${m.top.toFixed(1)}`);
  if (margins.bottom < m.bottom - tol) failures.push(`text ${margins.bottom} mm from the bottom, margin is ${m.bottom.toFixed(1)}`);

  // Body size: nothing under 10 pt.
  const minFontPt = Math.min(...pdfjs.items.filter((i) => i.str.trim()).map((i) => i.size));
  if (minFontPt < 9.95) failures.push(`smallest text is ${minFontPt.toFixed(2)} pt, body minimum is 10 pt`);

  // Metadata, tagging, fonts, size, photo.
  if (!info.tagged) failures.push('PDF is not tagged');
  if (!info.title || /about:blank|^http/i.test(info.title)) failures.push(`title is "${info.title}"`);
  if (info.author !== exp.name) failures.push(`author is "${info.author}", expected the applicant`);
  if (info.producer !== 'Useful Apply') failures.push(`producer is "${info.producer}"`);
  // The document language follows the CV's content, not the template's market.
  const wantLang = ctx.source.language === 'de' ? 'de' : 'en';
  if (!catalog.lang.toLowerCase().startsWith(wantLang)) failures.push(`language is "${catalog.lang}", expected ${wantLang}`);
  if (!catalog.displayDocTitle) warnings.push('DisplayDocTitle is not set');
  if (bytes.length > 2 * 1024 * 1024) failures.push(`file is ${(bytes.length / 1024 / 1024).toFixed(2)} MB, limit 2 MB`);
  for (const font of fonts) {
    if (!font.embedded) failures.push(`font ${font.name} is not embedded`);
    if (!font.unicode) failures.push(`font ${font.name} has no Unicode map`);
    if (/Type 3/i.test(font.type)) failures.push(`font ${font.name} is Type 3`);
  }
  if (ctx.expectPhoto && images < 1) failures.push('expected a photo and found none');
  if (!ctx.expectPhoto && images > 0) failures.push(`${images} image(s) where the template prints none`);
  if (/Page \d+ of \d+/i.test(pdfjs.text)) failures.push('a page number footer is in the text');

  return {
    fixture: ctx.fixture,
    templateId: ctx.templateId,
    ok: failures.length === 0,
    failures,
    warnings,
    metrics: {
      pages: info.pages,
      pageSizePts: info.pageSizePts,
      fileSizeKB: Math.round(bytes.length / 1024),
      tagged: info.tagged,
      title: info.title,
      author: info.author,
      subject: info.subject,
      producer: info.producer,
      lang: catalog.lang,
      displayDocTitle: catalog.displayDocTitle,
      fonts,
      imageCount: images,
      minFontPt: Number(minFontPt.toFixed(2)),
      marginsMm: margins,
      headingOrder: sequences,
    },
    extraction: {
      pdftotext: summarize(checks.pdftotext),
      pdftotextRaw: summarize(checks.pdftotextRaw),
      pdfjs: summarize(checks.pdfjs),
    },
  };
}
