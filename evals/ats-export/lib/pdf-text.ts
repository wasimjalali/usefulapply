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

export interface PdfLink {
  page: number;
  url: string;
  /** The visible text under the link's rectangle. */
  text: string;
}

export interface PdfJsResult {
  pages: Array<{ width: number; height: number }>;
  items: PdfItem[];
  /** Link annotations with the text printed under each. */
  links: PdfLink[];
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
  const links: PdfLink[] = [];
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
    for (const annotation of await page.getAnnotations()) {
      if (annotation.subtype !== 'Link' || !annotation.url) continue;
      const [x1, y1, x2, y2] = annotation.rect as number[];
      const top = viewport.height - y2;
      const bottom = viewport.height - y1;
      const under = items
        .filter((item) => item.page === pageNumber && item.y - item.size * 0.3 >= top && item.y - item.size * 0.3 <= bottom && item.x >= x1 - 2 && item.x + item.w <= x2 + 2)
        .sort((a, b) => a.x - b.x)
        .map((item) => item.str)
        .join('');
      links.push({ page: pageNumber, url: annotation.url as string, text: under.trim() });
    }
    pageTexts.push(lines.join('\n'));
    lines.length = 0;
  }
  await doc.destroy();
  return { pages, items, links, text: pageTexts.join('\n\f'), pageTexts };
}

export const PT_PER_MM = 72 / 25.4;
export const mmToPt = (mm: number) => mm * PT_PER_MM;
export const ptToMm = (pt: number) => pt / PT_PER_MM;
