import { PDFDocument, PDFName, PDFString, PDFHexString, PDFBool } from 'pdf-lib';
import type { CVData } from '../../../src/lib/cv-templates/types';
import { cvPaper } from '../../../src/lib/cv-templates/paper';
import { getPrintSpec, isDachTemplate, PAPER_MM, type PaperSize } from '../../../src/lib/cv-templates/print-spec';
import { visibleCvData } from '../../../src/lib/cv-templates/hidden';
import { inferCvLocale, type CvTextLocale } from '../../../src/lib/cv-templates/locale';
import type { LocaleExpectation } from '../fixtures';
import { checkPersonalAndLinks, checkText, expectationsFor, norm, sameUrl, squash, type TextCheck, type CvExpectations } from './expect';
import { extractAll, type Extractor } from './ats-proxies';
import { extractWithPdfJs, mmToPt, type PdfItem } from './pdf-text';
import { pdfImageCount, pdfinfo, pdffonts, pdftotext } from './poppler';

export interface CvPdfContext {
  fixture: string;
  templateId: string;
  source: CVData;
  /** The photo is in the render's input and the template prints one. */
  expectPhoto: boolean;
  expectedPages?: number;
  /** The `paper` the export was asked for. Without one the paper follows the CV's market. */
  paper?: PaperSize;
  /** The paper the fixture is built to need, written down by hand (not derived by the code under test). */
  expectedPaper?: PaperSize;
  /** The language of the export (file name, metadata, footer), as the service resolved it. */
  locale?: CvTextLocale;
  /** What a CV in this language must print, written by hand. */
  localeExpect?: LocaleExpectation;
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
    headingOrder: Record<'pdfjs' | 'raw' | 'readingOrder' | Extractor, string[]>;
  };
  extraction: Record<'pdftotext' | 'pdftotextRaw' | 'pdfjs' | Extractor, ExtractionSummary>;
  /** Share of the printable height left empty at the foot of each page but the last. */
  emptyBand: number[];
  /** Share of the printable height the last page's text reaches. */
  lastPageFill: number;
  footers: string[];
}

export const HEADING_ORDER: Record<string, string[]> = {
  'premium-ats': ['summary', 'skills', 'experience', 'education', 'certifications', 'languages', 'projects'],
  executive: ['summary', 'skills', 'experience', 'education', 'certifications', 'languages', 'projects'],
  'classic-green': ['summary', 'skills', 'experience', 'education', 'certifications', 'languages', 'projects'],
  'german-classic': ['summary', 'skills', 'experience', 'education', 'certifications', 'languages', 'projects'],
  'modern-professional': ['summary', 'experience', 'education', 'skills', 'certifications', 'languages', 'projects'],
  'german-ats': ['summary', 'experience', 'education', 'skills', 'languages', 'certifications', 'projects'],
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
  const paper = ctx.paper ?? ctx.expectedPaper ?? cvPaper(visibleCvData(ctx.source));
  const spec = getPrintSpec(ctx.templateId, paper);
  const dach = isDachTemplate(ctx.templateId);
  const locale = ctx.locale ?? inferCvLocale(visibleCvData(ctx.source));
  const failures: string[] = [];
  const warnings: string[] = [];

  const [info, fonts, images, readingOrder, raw, pdfjs, catalog, proxies] = await Promise.all([
    pdfinfo(bytes),
    pdffonts(bytes),
    pdfImageCount(bytes),
    pdftotext(bytes, 'reading-order'),
    pdftotext(bytes, 'raw'),
    extractWithPdfJs(bytes),
    readCatalog(bytes),
    extractAll(bytes),
  ]);

  // Every reader must find each skill group as one "Label: a, b, c" line.
  const checks = {
    pdftotext: checkText(readingOrder, exp, { contiguous: true }),
    pdftotextRaw: checkText(raw, exp, { contiguous: true }),
    pdfjs: checkText(pdfjs.text, exp, { contiguous: true }),
    tika: checkText(proxies.tika, exp, { contiguous: true }),
    pymupdf: checkText(proxies.pymupdf, exp, { contiguous: true }),
    pdfminer: checkText(proxies.pdfminer, exp, { contiguous: true }),
  };
  const texts: Record<keyof typeof checks, string> = { pdftotext: readingOrder, pdftotextRaw: raw, pdfjs: pdfjs.text, ...proxies };

  // Content: every extractor, stream or layout reader, must find every word, in the right place, with umlauts.
  // Every template is a single column, so there is no exemption for any reader.
  for (const [tool, check] of Object.entries(checks)) {
    // pdfminer.six sets a title and its right-aligned date in separate text boxes, so for that reader alone
    // title, employer and dates adjacent is reported (the per-template numbers are in the write-up), not gated.
    const pairSink = tool === 'pdfminer' ? warnings : failures;
    if (check.missing.length > 0) failures.push(`${tool}: missing ${check.missing.length} (${check.missing.slice(0, 3).join(' | ')})`);
    if (check.pairingFailures.length > 0) pairSink.push(`${tool}: ${check.pairingFailures.length} job(s) lost title, employer and date pairing (${check.pairingFailures[0]})`);
    if (check.nonAsciiLost.length > 0) failures.push(`${tool}: lost characters ${check.nonAsciiLost.join('')}`);
    if (check.mojibake) failures.push(`${tool}: mojibake in extracted text`);
    if (check.hasDashDates) failures.push(`${tool}: en or em dash in the text`);
    for (const problem of checkPersonalAndLinks(texts[tool as keyof typeof checks], exp, dach, { ignoreUrlOnlyLines: tool === 'tika' })) failures.push(`${tool}: ${problem}`);
  }

  // Link annotations: each link opens its full https URL and its visible text is the clean address, not a label.
  for (const link of exp.links) {
    const annotation = pdfjs.links.find((l) => sameUrl(l.url, link.full));
    if (!annotation) failures.push(`no clickable link to ${link.full}`);
    else if (squash(annotation.text) !== squash(link.display)) failures.push(`the link to ${link.full} shows "${annotation.text}", expected "${link.display}"`);
  }
  if (pdfjs.links.some((l) => !/^https:\/\//.test(l.url) && !/^mailto:/.test(l.url) && !/^tel:/.test(l.url))) failures.push('a link annotation does not open an https URL');

  // Reading order: the headings come in the template's order in EVERY extractor (content stream, page geometry,
  // text boxes), on every template.
  const domOrder = HEADING_ORDER[ctx.templateId] ?? HEADING_ORDER['premium-ats'];
  const expectedSequence = domOrder.filter((key) => exp.headings.some((h) => h.key === key));
  const sequences = {
    raw: headingSequence(raw, exp),
    pdfjs: headingSequence(pdfjs.text, exp),
    readingOrder: headingSequence(readingOrder, exp),
    tika: headingSequence(proxies.tika, exp),
    pymupdf: headingSequence(proxies.pymupdf, exp),
    pdfminer: headingSequence(proxies.pdfminer, exp),
  };
  for (const [tool, sequence] of Object.entries(sequences)) {
    if (sequence.join() !== expectedSequence.join()) failures.push(`reading order (${tool}): ${sequence.join(' > ')} expected ${expectedSequence.join(' > ')}`);
  }

  // Content must sit under its own heading in every reader. A positioned element paints late, which once
  // pushed every experience entry behind the certifications in the text layer: the headings were in
  // order, the content was not.
  if (exp.headings.some((h) => h.key === 'experience')) {
    for (const [tool, text] of [['raw', raw], ['pdfjs', pdfjs.text], ['tika', proxies.tika], ['pymupdf', proxies.pymupdf], ['pdftotext', readingOrder], ['pdfminer', proxies.pdfminer]] as const) {
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
  const paperMm = PAPER_MM[spec.paper];
  const expectW = mmToPt(paperMm.width);
  const expectH = mmToPt(paperMm.height);
  if (Math.abs(info.pageSizePts.width - expectW) > 2 || Math.abs(info.pageSizePts.height - expectH) > 2) {
    failures.push(`page size ${info.pageSizePts.width}x${info.pageSizePts.height}pt, expected ${spec.paper}`);
  }
  if (ctx.expectedPages !== undefined && info.pages !== ctx.expectedPages) {
    failures.push(`${info.pages} pages, expected ${ctx.expectedPages}`);
  }
  // The continuation footer sits in the bottom margin by design; the margin check covers the body.
  const footerZone = mmToPt(8);
  const isFooter = (item: PdfItem) => info.pages > 1 && item.y > pdfjs.pages[item.page - 1].height - footerZone;
  const margins = observedMargins(pdfjs.items.filter((item) => !isFooter(item)), pdfjs.pages);
  const m = spec.marginMm;
  const tol = 0.8;
  if (margins.left < m.left - tol) failures.push(`text ${margins.left} mm from the left edge, margin is ${m.left.toFixed(1)}`);
  if (margins.right < m.right - tol) failures.push(`text ${margins.right} mm from the right edge, margin is ${m.right.toFixed(1)}`);
  if (margins.top < m.top - tol) failures.push(`text ${margins.top} mm from the top, margin is ${m.top.toFixed(1)}`);
  if (margins.bottom < m.bottom - tol) failures.push(`text ${margins.bottom} mm from the bottom, margin is ${m.bottom.toFixed(1)}`);

  // Body size: nothing under 10 pt.
  const minFontPt = Math.min(...pdfjs.items.filter((i) => i.str.trim() && !isFooter(i)).map((i) => i.size));
  if (minFontPt < 9.95) failures.push(`smallest text is ${minFontPt.toFixed(2)} pt, body minimum is 10 pt`);

  // Metadata, tagging, fonts, size, photo.
  if (!info.tagged) failures.push('PDF is not tagged');
  if (!info.title || /about:blank|^http/i.test(info.title)) failures.push(`title is "${info.title}"`);
  if (info.author !== exp.name) failures.push(`author is "${info.author}", expected the applicant`);
  if (info.producer !== 'Useful Apply') failures.push(`producer is "${info.producer}"`);
  // The document language follows the CV's content, not the template's market.
  const wantLang = locale === 'other' ? 'en' : locale;
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

  // Page footer on EVERY page of a multi-page CV, in the document's language, and none on a one-page CV.
  // The words are written out here, not read back from the export code.
  const footerWords: Record<string, [string, string]> = {
    en: ['Page', 'of'], de: ['Seite', 'von'], fr: ['Page', 'sur'], es: ['Página', 'de'], pt: ['Página', 'de'], it: ['Pagina', 'di'], nl: ['Pagina', 'van'],
  };
  const [pageWord, ofWord] = footerWords[locale === 'other' ? 'en' : locale];
  const footers: string[] = [];
  const footerPattern = /(Page|Seite|Página|Pagina) \d+ (of|von|sur|de|di|van) \d+/;
  pdfjs.pageTexts.forEach((pageText, index) => {
    const n = index + 1;
    const want = `${exp.name} · ${pageWord} ${n} ${ofWord} ${info.pages}`;
    if (info.pages === 1) {
      if (footerPattern.test(pageText)) failures.push('a one-page CV carries a page footer');
      return;
    }
    footers.push(want);
    if (!squash(pageText).toLowerCase().includes(squash(want).toLowerCase())) failures.push(`page ${n} has no footer "${want}"`);
  });
  for (const [tool, text] of [['tika', proxies.tika], ['raw', raw]] as const) {
    if (info.pages === 1 && footerPattern.test(text)) failures.push(`${tool}: a one-page CV carries a page footer`);
  }
  // Contact details stay in the body: the footer line is only the name and the page count.
  if (info.pages > 1) {
    for (const item of pdfjs.items.filter(isFooter)) {
      if (/@|\+\d|https?:/.test(item.str)) failures.push(`contact detail in the page footer: ${item.str.slice(0, 30)}`);
    }
  }

  // Pagination: no big empty band at the foot of a page that has more to come, and Experience starts on page 1.
  const printableH = info.pageSizePts.height - mmToPt(spec.marginMm.top) - mmToPt(spec.marginMm.bottom);
  const emptyBand: number[] = [];
  for (let page = 1; page < info.pages; page++) {
    const body = pdfjs.items.filter((item) => item.page === page && item.str.trim() && !isFooter(item));
    const bottom = Math.max(...body.map((item) => item.y));
    emptyBand.push(Number(((info.pageSizePts.height - mmToPt(spec.marginMm.bottom) - bottom) / printableH).toFixed(2)));
  }
  emptyBand.forEach((band, index) => {
    if (band > 0.15) failures.push(`page ${index + 1} ends with ${(band * 100).toFixed(0)}% of the page empty`);
  });
  const expHeading = exp.headings.find((h) => h.key === 'experience');
  // A heading LINE on page 1, not a substring: "Experience" would otherwise match any bullet that says it.
  const pageOneLines = pdfjs.pageTexts[0].split('\n').map((line) => norm(line).toLowerCase());
  if (expHeading && info.pages > 1 && !pageOneLines.includes(norm(expHeading.text).toLowerCase())) failures.push('Experience starts on page 2');
  // No near-empty last page: it must carry at least 15% of the printable height.
  let lastPageFill = 1;
  if (info.pages > 1) {
    const lastBody = pdfjs.items.filter((item) => item.page === info.pages && item.str.trim() && !isFooter(item));
    const lowest = lastBody.length ? Math.max(...lastBody.map((item) => item.y)) : mmToPt(spec.marginMm.top);
    lastPageFill = Number(((lowest - mmToPt(spec.marginMm.top)) / printableH).toFixed(2));
    if (lastPageFill < 0.15) failures.push(`the last page is ${(lastPageFill * 100).toFixed(0)}% full`);
  }

  // A CV in another language prints its own headings, present label and degree connector, none of them English.
  if (ctx.localeExpect) {
    const lx = ctx.localeExpect;
    for (const [tool, text] of Object.entries(texts)) {
      const lines = text.split(/[\n\f]/).map((line) => norm(line).toLowerCase().replace(/:$/, ''));
      for (const [key, heading] of Object.entries(lx.headings)) {
        if (!lines.includes(norm(heading).toLowerCase())) failures.push(`${tool}: ${lx.language} heading "${heading}" (${key}) is missing`);
      }
      for (const english of ['summary', 'experience', 'education', 'skills', 'languages']) {
        if (!Object.values(lx.headings).some((h) => norm(h).toLowerCase() === english) && lines.includes(english)) failures.push(`${tool}: the English heading "${english}" is on a ${lx.language} CV`);
      }
      const flat = squash(text).toLowerCase();
      if (!flat.includes(squash(` - ${lx.present}`).toLowerCase())) failures.push(`${tool}: "${lx.present}" is missing from the date range of the current role`);
      if (/\bPresent\b/.test(text)) failures.push(`${tool}: "Present" is on a ${lx.language} CV`);
      for (const edu of ctx.source.education) {
        if (lx.connector !== 'in' && edu.field && flat.includes(squash(`${edu.degree} in ${edu.field}`).toLowerCase())) failures.push(`${tool}: the degree reads "${edu.degree} in ${edu.field}"`);
      }
    }
  }

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
      tika: summarize(checks.tika),
      pymupdf: summarize(checks.pymupdf),
      pdfminer: summarize(checks.pdfminer),
    },
    emptyBand,
    lastPageFill,
    footers,
  };
}
