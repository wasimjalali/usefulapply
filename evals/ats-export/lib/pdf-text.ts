/**
 * Text extraction with pdf.js, the engine behind most browser-based and many
 * server-side parsers. Positions are returned in points from the TOP-left of
 * the page, which is how a reader thinks about margins.
 */

export interface PdfItem {
  str: string;
  /** Left edge, pt. */
  x: number;
  /** Baseline, pt from the top of the page. */
  y: number;
  /** Width, pt. */
  w: number;
  /** Font size, pt. */
  size: number;
  fontName: string;
  page: number;
  hasEOL: boolean;
}

export interface PdfJsResult {
  pages: Array<{ width: number; height: number }>;
  items: PdfItem[];
  /** Items joined in content-stream order, one line per text row. */
  text: string;
  /** The same, one string per page. */
  pageTexts: string[];
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsPromise: Promise<PdfJs> | null = null;

async function pdfjs(): Promise<PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

export async function extractWithPdfJs(bytes: Uint8Array): Promise<PdfJsResult> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, verbosity: 0 }).promise;
  const pages: PdfJsResult['pages'] = [];
  const items: PdfItem[] = [];
  const lines: string[] = [];
  const pageTexts: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({ width: viewport.width, height: viewport.height });
    const content = await page.getTextContent();
    await page.getOperatorList();
    let line = '';
    let lastY: number | null = null;
    for (const raw of content.items) {
      if (!('str' in raw)) continue;
      const transform = raw.transform as number[];
      const size = Math.hypot(transform[0], transform[1]);
      const x = transform[4];
      const y = viewport.height - transform[5];
      let fontName = raw.fontName;
      try {
        fontName = page.commonObjs.get(raw.fontName).name ?? raw.fontName;
      } catch {
        // keep the loaded name
      }
      if (raw.str.length === 0 && !raw.hasEOL) continue;
      items.push({ str: raw.str, x, y, w: raw.width, size, fontName, page: pageNumber, hasEOL: Boolean(raw.hasEOL) });
      if (lastY !== null && Math.abs(y - lastY) > size * 0.5) {
        lines.push(line);
        line = '';
      }
      if (line && raw.str && !line.endsWith(' ') && !raw.str.startsWith(' ')) line += ' ';
      line += raw.str;
      lastY = y;
      if (raw.hasEOL) {
        lines.push(line);
        line = '';
        lastY = null;
      }
    }
    if (line) lines.push(line);
    pageTexts.push(lines.join('\n'));
    lines.length = 0;
  }
  await doc.destroy();
  return { pages, items, text: pageTexts.join('\n\f'), pageTexts };
}

export const PT_PER_MM = 72 / 25.4;
export const mmToPt = (mm: number) => mm * PT_PER_MM;
export const ptToMm = (pt: number) => pt / PT_PER_MM;
