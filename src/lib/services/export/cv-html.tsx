import { renderToStaticMarkup } from './static-markup';
import { CvTemplateSwitch } from '@/components/cv-templates/render';
import type { CVData } from '@/lib/cv-templates/types';
import { inferCvLocale } from '@/lib/cv-templates/locale';
import { pageRule, type PaperSize } from '@/lib/cv-templates/print-spec';
import { visibleCvData } from '@/lib/cv-templates/hidden';
import { fontFaceCssInline, type FontFileLoader } from '@/lib/cv-templates/fonts';
import { PRINT_BASE_CSS } from './print-css';

/**
 * The page is a standalone document: no network, no scripts. The CSP makes
 * that a rule the browser enforces, so a hostile string in a CV can never turn
 * the render into a request to somewhere else.
 */
export const EXPORT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface CvHtmlInput {
  data: CVData;
  templateId: string;
  /** Overrides the template's own paper. The layout reflows to the new width. */
  paper?: PaperSize;
  loadFont: FontFileLoader;
  /** The fit pass: spacing and line height scale by these factors (see fit.ts). Omitted, the page is as designed. */
  density?: { spacing: number; lineHeight: number };
}

export interface CvHtmlResult {
  html: string;
  /** Text of the whole document, for the font subset decision and the eval. */
  text: string;
}

/** Only inlined images may enter the page. Anything else is dropped, not fetched. */
function inlineImagesOnly(data: CVData): CVData {
  const photo = data.personal.photoUrl;
  if (!photo || /^data:image\/(png|jpe?g|webp);base64,/i.test(photo)) return data;
  return { ...data, personal: { ...data.personal, photoUrl: undefined } };
}

export async function renderCvHtml(input: CvHtmlInput): Promise<CvHtmlResult> {
  const data = inlineImagesOnly(visibleCvData(input.data));
  const markup = renderToStaticMarkup(
    <CvTemplateSwitch data={data} templateId={input.templateId} mode="print" />,
  );
  const text = markup.replace(/<[^>]+>/g, ' ');
  const fonts = await fontFaceCssInline(input.loadFont, text);
  const locale = inferCvLocale(data);
  const lang = locale === 'other' ? (data.language ?? 'en') : locale;
  const title = `${data.personal.fullName || 'CV'}`;
  const density = input.density ? ` style="--cv-d:${input.density.spacing};--cv-ld:${input.density.lineHeight}"` : '';
  const html = `<!doctype html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}"><title>${escapeHtml(title)}</title><style>${fonts}\n${PRINT_BASE_CSS}\n${pageRule(input.templateId, input.paper)}</style></head><body${density}>${markup}</body></html>`;
  return { html, text };
}
