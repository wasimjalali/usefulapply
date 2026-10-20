import type { FontFileLoader } from '@/lib/cv-templates/fonts';
import { buildCvDocx } from './cv-docx';
import { renderCvHtml } from './cv-html';
import { renderAnswersHtml, answersPlainText, answersTitle } from './answers-html';
import { CONTENT_TYPES, exportFileName, extensionFor } from './filenames';
import { buildLetterDocx } from './letter-docx';
import { renderLetterHtml } from './letter-html';
import {
  ExportRenderError,
  MAX_EXPORT_BYTES,
  applyPdfMetadata,
  renderHtmlToPdf,
  type BrowserRunBinding,
} from './pdf';
import type { ResolvedExport } from './resolve';

export interface RenderDeps {
  browser: BrowserRunBinding | null;
  loadFont: FontFileLoader;
}

export interface RenderedExport {
  bytes: Uint8Array;
  contentType: string;
  fileName: string;
}

/** The document is bigger than an ATS upload limit allows. Returned as a failure, never as a degraded file. */
export class ExportTooLargeError extends Error {
  constructor(readonly size: number) {
    super('The export is larger than 2 MB.');
    this.name = 'ExportTooLargeError';
  }
}

function pdfLanguage(resolved: ResolvedExport): string {
  if (resolved.locale === 'de' || resolved.layout === 'din') return 'de-DE';
  return 'en-US';
}

function requireBrowser(deps: RenderDeps): BrowserRunBinding {
  if (!deps.browser) throw new ExportRenderError('The browser renderer is not available.');
  return deps.browser;
}

function emailsText(resolved: ResolvedExport): string {
  return resolved.emails
    .map((email) => `${resolved.emails.length > 1 ? `${email.label}\n\n` : ''}Subject: ${email.subject}\n\n${email.body}`)
    .join('\n\n----------------------------------------\n\n');
}

/** Renders one export to bytes. No storage, no signing: those belong to the caller. */
export async function renderExport(resolved: ResolvedExport, deps: RenderDeps): Promise<RenderedExport> {
  const { format } = resolved;
  const ext = extensionFor(format);
  const contentType = CONTENT_TYPES[ext];
  const de = resolved.locale === 'de' || resolved.layout === 'din';
  const fileName = exportFileName(format, resolved.applicantName, de ? 'de' : resolved.locale);
  const name = resolved.applicantName;
  let bytes: Uint8Array;

  switch (format) {
    case 'cv_pdf': {
      const cv = resolved.cv!;
      const { html } = await renderCvHtml({ data: cv, templateId: resolved.templateId, paper: resolved.paper, loadFont: deps.loadFont });
      const raw = await renderHtmlToPdf(requireBrowser(deps), html, resolved.paper);
      bytes = await applyPdfMetadata(raw, {
        title: de ? `Lebenslauf - ${name}` : `${name} - CV`,
        author: name,
        subject: de ? 'Lebenslauf' : 'Curriculum vitae',
        language: pdfLanguage(resolved),
      });
      break;
    }
    case 'cv_docx':
      bytes = await buildCvDocx({
        data: resolved.cv!,
        templateId: resolved.templateId,
        paper: resolved.paper,
        title: de ? `Lebenslauf - ${name}` : `${name} - CV`,
        author: name,
      });
      break;
    case 'cover_letter_pdf': {
      const layout = resolved.layout!;
      const { html } = await renderLetterHtml({
        input: resolved.letter!,
        layout,
        loadFont: deps.loadFont,
        title: de ? `Anschreiben - ${name}` : `${name} - Cover Letter`,
        language: de ? 'de' : 'en',
      });
      const raw = await renderHtmlToPdf(requireBrowser(deps), html, resolved.paper);
      bytes = await applyPdfMetadata(raw, {
        title: de ? `Anschreiben - ${name}` : `${name} - Cover Letter`,
        author: name,
        subject: de ? 'Anschreiben' : 'Cover letter',
        language: pdfLanguage(resolved),
      });
      break;
    }
    case 'cover_letter_docx':
      bytes = await buildLetterDocx({
        input: resolved.letter!,
        layout: resolved.layout!,
        title: de ? `Anschreiben - ${name}` : `${name} - Cover Letter`,
        language: de ? 'de' : 'en',
      });
      break;
    case 'emails_txt':
      bytes = new TextEncoder().encode(emailsText(resolved));
      break;
    case 'answers_txt':
      bytes = new TextEncoder().encode(`${answersTitle(resolved.company, de)}\n\n${answersPlainText(resolved.answers)}`);
      break;
    case 'answers_pdf': {
      const { html } = await renderAnswersHtml({
        answers: resolved.answers,
        company: resolved.company,
        de,
        paper: resolved.paper,
        loadFont: deps.loadFont,
      });
      const raw = await renderHtmlToPdf(requireBrowser(deps), html, resolved.paper);
      bytes = await applyPdfMetadata(raw, {
        title: answersTitle(resolved.company, de),
        author: name,
        subject: de ? 'Screening-Antworten' : 'Screening answers',
        language: pdfLanguage(resolved),
      });
      break;
    }
  }

  if (bytes.length > MAX_EXPORT_BYTES) throw new ExportTooLargeError(bytes.length);
  return { bytes, contentType, fileName };
}

