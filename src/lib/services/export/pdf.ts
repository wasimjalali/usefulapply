import { PDFDocument, PDFName, PDFBool } from 'pdf-lib';
import type { PaperSize } from '@/lib/cv-templates/print-spec';
import { fontFaceCssInline, type FontFileLoader } from '@/lib/cv-templates/fonts';
import { EXPORT_CSP, escapeHtml } from './cv-html';

/** The part of the Browser Run binding the exporter uses. */
export interface BrowserRunBinding {
  quickAction(action: 'pdf', body: Record<string, unknown>): Promise<Response>;
}

export interface PdfMetadata {
  title: string;
  author: string;
  subject: string;
  /** BCP 47, for example "de-DE". */
  language: string;
  keywords?: string[];
}

export const PDF_PRODUCER = 'Useful Apply';

/** Anything a recruiter's ATS accepts: Greenhouse caps uploads at 2.5 MB. */
export const MAX_EXPORT_BYTES = 2 * 1024 * 1024;

export class ExportRenderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ExportRenderError';
  }
}

/**
 * Renders a standalone HTML page to a tagged PDF with Browser Run. `@page` in
 * the HTML owns size and margins (preferCSSPageSize), so the options here only
 * repeat the paper as a fallback. `tagged` makes an accessible PDF; it is not a
 * parsing guarantee, the text layer is.
 */
export async function renderHtmlToPdf(
  browser: BrowserRunBinding,
  html: string,
  paper: PaperSize,
): Promise<Uint8Array> {
  const body = {
    html,
    // Second layer behind the page's own CSP: nothing but data: URIs may be requested. Checked in the
    // spike: with a remote <img>, the PDF has the image without this and does not with it.
    allowRequestPattern: ['^data:'],
    gotoOptions: { waitUntil: 'load', timeout: 20_000 },
    pdfOptions: {
      format: paper === 'a4' ? 'a4' : 'letter',
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
      displayHeaderFooter: false,
      timeout: 30_000,
    },
  };
  // Browser Run answers "internal error" now and then (seen 3 times in about 70
  // renders in the spike). A render is cheap and has no side effects, so it is
  // retried twice before the failure reaches the caller.
  let lastStatus: number | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await browser.quickAction('pdf', body);
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      lastStatus = response.status;
      // A 4xx is our request and will not improve on a retry.
      if (response.status < 500) break;
    } catch {
      lastStatus = undefined;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  // The response body can echo the request, so it never reaches a log or a client.
  throw new ExportRenderError('Browser Run could not render the page.', lastStatus);
}

/**
 * Chrome writes the page URL as the title and "Skia/PDF" as the producer. An
 * ATS and a recruiter's PDF viewer both read these, so they get real values.
 * The structure tree is kept as it is.
 */
export async function applyPdfMetadata(bytes: Uint8Array, metadata: PdfMetadata): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  doc.setTitle(metadata.title);
  doc.setAuthor(metadata.author);
  doc.setSubject(metadata.subject);
  doc.setProducer(PDF_PRODUCER);
  doc.setCreator(PDF_PRODUCER);
  doc.setLanguage(metadata.language);
  if (metadata.keywords?.length) doc.setKeywords(metadata.keywords);
  const prefs = doc.catalog.getOrCreateViewerPreferences();
  prefs.dict.set(PDFName.of('DisplayDocTitle'), PDFBool.True);
  return doc.save({ useObjectStreams: false });
}

/**
 * Page footers on every page of a multi-page document: "Name · Page 1 of 3". A
 * one-page document carries none.
 *
 * CSS cannot do this in the Chrome that Browser Run runs (no page margin boxes,
 * and `position: fixed` repeats on page 1 too), and an absolutely positioned
 * footer can only sit inside a page's content box. So a second, tiny render
 * draws the footers on transparent pages of the same size and pdf-lib lays them
 * over every page. They are real text in an embedded font, in the bottom
 * margin. Contact details never go here: they stay in the body.
 */
export async function addContinuationFooters(args: {
  browser: BrowserRunBinding;
  pdf: Uint8Array;
  paper: PaperSize;
  name: string;
  /** The footer text for page n of total, in the document's language. */
  footer: (name: string, page: number, total: number) => string;
  loadFont: FontFileLoader;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.load(args.pdf, { updateMetadata: false });
  const total = doc.getPageCount();
  if (total < 2) return args.pdf;

  const label = (n: number) => args.footer(args.name, n, total);
  const size = args.paper === 'a4' ? { w: 210, h: 297 } : { w: 215.9, h: 279.4 };
  const pages = Array.from({ length: total }, (_, index) => `<div class="pg"><div class="f">${escapeHtml(label(index + 1))}</div></div>`).join('');
  const fonts = await fontFaceCssInline(args.loadFont, args.name);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}"><style>${fonts}
@page{size:${size.w}mm ${size.h}mm;margin:0}*{margin:0;padding:0;box-sizing:border-box}html,body{width:${size.w}mm;background:transparent}
.pg{position:relative;width:${size.w}mm;height:${size.h - 0.6}mm;break-after:page;overflow:hidden}
.f{position:absolute;left:0;right:0;bottom:5mm;text-align:center;font:8pt 'Arimo',Arial,sans-serif;color:#555}</style></head><body>${pages}</body></html>`;
  const overlayBytes = await renderHtmlToPdf(args.browser, html, args.paper);
  const overlay = await PDFDocument.load(overlayBytes, { updateMetadata: false });
  const indices = Array.from({ length: total }, (_, index) => index);
  const embedded = await doc.embedPdf(overlay, indices);
  indices.forEach((pageIndex, position) => {
    const target = doc.getPage(pageIndex);
    const { width, height } = target.getSize();
    target.drawPage(embedded[position], { x: 0, y: 0, width, height });
  });
  return doc.save({ useObjectStreams: false });
}
