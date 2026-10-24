import type { FontFileLoader } from '@/lib/cv-templates/fonts';
import { buildCvDocx } from './cv-docx';
import { exportText } from './export-text';
import { renderCvHtml } from './cv-html';
import { fitToFewerPages } from './fit';
import { getPrintSpec } from '@/lib/cv-templates/print-spec';
import { renderAnswersHtml, answersPlainText, answersTitle } from './answers-html';
import { CONTENT_TYPES, exportDisplayFileName, exportFileName, extensionFor } from './filenames';
import { buildLetterDocx } from './letter-docx';
import { renderLetterHtml } from './letter-html';
import {
  addContinuationFooters,
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
  /** Called for every Browser Run call, as it happens, so a render that fails halfway is still counted. */
  onRender?: () => void;
}

export interface RenderedExport {
  bytes: Uint8Array;
  contentType: string;
  fileName: string;
  displayName: string;
  /** Browser Run calls this export used, retries included. */
  renders: number;
  /** The fit pass, for a CV: pages before and after, the density step kept (null when the first render stands). */
  fit?: { pagesBefore: number; pagesAfter: number; step: number | null; extraRenders: number };
}

/** The document is bigger than an ATS upload limit allows. Returned as a failure, never as a degraded file. */
export class ExportTooLargeError extends Error {
  constructor(readonly size: number) {
    super('The export is larger than 2 MB.');
    this.name = 'ExportTooLargeError';
  }
}

function pdfLanguage(resolved: ResolvedExport): string {
  return exportText(resolved.locale).bcp47;
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
export async function renderExport(resolved: ResolvedExport, rawDeps: RenderDeps): Promise<RenderedExport> {
  const { format } = resolved;
  // Every Browser Run call goes through one counter, and the caller hears about it as it happens.
  let renders = 0;
  const base = rawDeps.browser;
  const deps: RenderDeps = {
    ...rawDeps,
    browser: base
      ? {
          quickAction: async (action, body) => {
            renders++;
            rawDeps.onRender?.();
            return base.quickAction(action, body);
          },
        }
      : null,
  };
  let fitResult: RenderedExport['fit'];
  const ext = extensionFor(format);
  const contentType = CONTENT_TYPES[ext];
  const words = exportText(resolved.locale);
  const fileName = exportFileName(format, resolved.applicantName, resolved.locale, resolved.company);
  const name = resolved.applicantName;
  let bytes: Uint8Array;

  switch (format) {
    case 'cv_pdf': {
      const cv = resolved.cv!;
      const browser = requireBrowser(deps);
      const build = async (density?: { spacing: number; lineHeight: number }) => {
        const { html } = await renderCvHtml({ data: cv, templateId: resolved.templateId, paper: resolved.paper, loadFont: deps.loadFont, density });
        return renderHtmlToPdf(browser, html, resolved.paper);
      };
      const first = await build();
      // A last page with only a few lines is re-rendered a little tighter and kept if that saves a page.
      const fit = await fitToFewerPages({ first, margins: getPrintSpec(resolved.templateId, resolved.paper).marginMm, render: build });
      if (fit.extraRenders > 0) {
        console.log('[export] fit pass', JSON.stringify({ template: resolved.templateId, pagesBefore: fit.pagesBefore, pagesAfter: fit.pagesAfter, step: fit.step, extraRenders: fit.extraRenders }));
      }
      const rendered = fit.pdf;
      fitResult = { pagesBefore: fit.pagesBefore, pagesAfter: fit.pagesAfter, step: fit.step, extraRenders: fit.extraRenders };
      const raw = await addContinuationFooters({ browser: requireBrowser(deps), pdf: rendered, paper: resolved.paper, name, footer: words.footer, loadFont: deps.loadFont });
      bytes = await applyPdfMetadata(raw, {
        title: words.cvTitle(name),
        author: name,
        subject: words.cvSubject,
        language: pdfLanguage(resolved),
      });
      break;
    }
    case 'cv_docx':
      bytes = await buildCvDocx({
        data: resolved.cv!,
        templateId: resolved.templateId,
        paper: resolved.paper,
        title: words.cvTitle(name),
        author: name,
      });
      break;
    case 'cover_letter_pdf': {
      const layout = resolved.layout!;
      const { html } = await renderLetterHtml({
        input: resolved.letter!,
        layout,
        loadFont: deps.loadFont,
        title: words.letterTitle(name),
        language: words.htmlLang,
      });
      const raw = await renderHtmlToPdf(requireBrowser(deps), html, resolved.paper);
      bytes = await applyPdfMetadata(raw, {
        title: words.letterTitle(name),
        author: name,
        subject: words.letterSubject,
        language: pdfLanguage(resolved),
      });
      break;
    }
    case 'cover_letter_docx':
      bytes = await buildLetterDocx({
        input: resolved.letter!,
        layout: resolved.layout!,
        title: words.letterTitle(name),
        language: words.htmlLang,
      });
      break;
    case 'emails_txt':
      bytes = new TextEncoder().encode(emailsText(resolved));
      break;
    case 'answers_txt':
      bytes = new TextEncoder().encode(`${answersTitle(resolved.company, resolved.locale)}\n\n${answersPlainText(resolved.answers)}`);
      break;
    case 'answers_pdf': {
      const { html } = await renderAnswersHtml({
        answers: resolved.answers,
        company: resolved.company,
        locale: resolved.locale,
        paper: resolved.paper,
        loadFont: deps.loadFont,
      });
      const raw = await renderHtmlToPdf(requireBrowser(deps), html, resolved.paper);
      bytes = await applyPdfMetadata(raw, {
        title: answersTitle(resolved.company, resolved.locale),
        author: name,
        subject: words.answersTitle,
        language: pdfLanguage(resolved),
      });
      break;
    }
  }

  if (bytes.length > MAX_EXPORT_BYTES) throw new ExportTooLargeError(bytes.length);
  return { bytes, contentType, fileName, displayName: exportDisplayFileName(format, resolved.applicantName, resolved.locale, resolved.company), renders, fit: fitResult };
}

