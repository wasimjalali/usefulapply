import { PDFDocument, PDFName, PDFBool } from 'pdf-lib';
import type { PaperSize } from '@/lib/cv-templates/print-spec';

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
  const response = await browser.quickAction('pdf', {
    html,
    gotoOptions: { waitUntil: 'load', timeout: 20_000 },
    pdfOptions: {
      format: paper === 'a4' ? 'a4' : 'letter',
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
      displayHeaderFooter: false,
      timeout: 30_000,
    },
  });
  if (!response.ok) {
    // The body can echo the request, so it never reaches a log or a client.
    throw new ExportRenderError('Browser Run returned an error.', response.status);
  }
  return new Uint8Array(await response.arrayBuffer());
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
