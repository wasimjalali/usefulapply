import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream, type PDFPage } from 'pdf-lib';

/**
 * The fit pass: a CV whose last page holds only a few lines is re-rendered a little tighter, and kept if
 * that takes it onto fewer pages.
 *
 * How the last page is measured: pdf-lib, which the Worker already runs, reads the page's content stream
 * and tracks the transformation matrix through `q`, `Q` and `cm` to find where the lowest line of text sits
 * (Skia, which Browser Run's Chrome prints with, positions every text run with `Tm` under nested `cm`
 * scales). pdf.js would measure the same thing but is a large dependency that expects a browser; Browser Run
 * sessions would add a connection and a second protocol for one number. The measurement is checked against
 * pdf.js in the eval (service check "fit-measure").
 */

/** A last page with less than this share of the printable height used is a near-empty page. */
export const FIT_THRESHOLD = 0.15;

/**
 * Spacing and line height scale by these factors (the `--cv-d` and `--cv-ld` custom properties the
 * templates read). The first step is about 3% tighter, the second about 6%, and never more. Text size and
 * margins do not change.
 */
export const DENSITY_STEPS: ReadonlyArray<{ spacing: number; lineHeight: number }> = [
  { spacing: 0.97, lineHeight: 0.97 },
  { spacing: 0.94, lineHeight: 0.94 },
];

type Matrix = [number, number, number, number, number, number];

/** a then b, as PDF writes them: a.concat(b) is "a, then b". */
function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

const TOKEN = /<[0-9A-Fa-f\s]*>|\((?:\\[\s\S]|[^\\()])*\)|\[|\]|\/[^\s[\]()<>/%]*|[^\s[\]()<>/%]+/g;

/** The y of each text run on a page's content stream, in PDF user space (origin bottom left). */
export function textBaselines(content: string): number[] {
  const out: number[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  let tm: Matrix = [1, 0, 0, 1, 0, 0];
  let nums: number[] = [];
  const record = () => {
    // The text origin (e, f) of the text matrix, mapped through the current transformation matrix.
    out.push(tm[4] * ctm[1] + tm[5] * ctm[3] + ctm[5]);
  };
  for (const token of content.match(TOKEN) ?? []) {
    const c = token.charCodeAt(0);
    // Numbers collect as operands; strings, names and array brackets are skipped.
    if ((c >= 48 && c <= 57) || c === 45 || c === 46 || c === 43) {
      const value = Number(token);
      if (!Number.isNaN(value)) {
        nums.push(value);
        continue;
      }
    }
    switch (token) {
      case 'q':
        stack.push([...ctm] as Matrix);
        break;
      case 'Q':
        ctm = stack.pop() ?? ctm;
        break;
      case 'cm':
        if (nums.length >= 6) ctm = multiply(nums.slice(-6) as Matrix, ctm);
        break;
      case 'Tm':
        if (nums.length >= 6) {
          tm = nums.slice(-6) as Matrix;
          record();
        }
        break;
      case 'Td':
      case 'TD':
        if (nums.length >= 2) {
          const [tx, ty] = nums.slice(-2);
          tm = [tm[0], tm[1], tm[2], tm[3], tm[4] + tx * tm[0] + ty * tm[2], tm[5] + tx * tm[1] + ty * tm[3]];
          if (ty !== 0) record();
        }
        break;
      default:
        break;
    }
    if (!/^[[\]/<(]/.test(token)) nums = [];
  }
  return out;
}

function contentOf(doc: PDFDocument, page: PDFPage): string {
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : contents ? [contents] : [];
  let text = '';
  for (const stream of streams) {
    if (stream instanceof PDFRawStream) text += `${Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')}\n`;
  }
  return text;
}

export interface LastPage {
  pages: number;
  /** Share of the printable height the last page's text reaches, 0 to 1. */
  fill: number;
}

/**
 * How many pages a PDF has and how much of the last one carries text. `marginMm` is the page's top and
 * bottom margin, which bound the printable height.
 */
export async function measureLastPage(pdf: Uint8Array, margins: { top: number; bottom: number }): Promise<LastPage> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const pages = doc.getPageCount();
  const page = doc.getPage(pages - 1);
  const { height } = page.getSize();
  const topPt = (margins.top / 25.4) * 72;
  const bottomPt = (margins.bottom / 25.4) * 72;
  const ys = textBaselines(contentOf(doc, page));
  if (ys.length === 0) return { pages, fill: 0 };
  const lowestFromTop = height - Math.min(...ys);
  const printable = height - topPt - bottomPt;
  return { pages, fill: Math.max(0, Math.min(1, (lowestFromTop - topPt) / printable)) };
}

export interface FitResult {
  pdf: Uint8Array;
  /** Browser renders the pass added (0 to 2). */
  extraRenders: number;
  /** The step that was kept, or null when the first render stands. */
  step: number | null;
  pagesBefore: number;
  pagesAfter: number;
}

/**
 * If the last page is nearly empty, tries up to two tighter renders and keeps the first that has fewer
 * pages. `render(density)` returns a PDF at that density.
 */
export async function fitToFewerPages(args: {
  first: Uint8Array;
  margins: { top: number; bottom: number };
  render: (density: { spacing: number; lineHeight: number }) => Promise<Uint8Array>;
}): Promise<FitResult> {
  const before = await measureLastPage(args.first, args.margins);
  if (before.pages < 2 || before.fill >= FIT_THRESHOLD) {
    return { pdf: args.first, extraRenders: 0, step: null, pagesBefore: before.pages, pagesAfter: before.pages };
  }
  let extra = 0;
  for (let step = 0; step < DENSITY_STEPS.length; step++) {
    const tighter = await args.render(DENSITY_STEPS[step]);
    extra++;
    const after = await measureLastPage(tighter, args.margins);
    if (after.pages < before.pages) {
      return { pdf: tighter, extraRenders: extra, step: step + 1, pagesBefore: before.pages, pagesAfter: after.pages };
    }
  }
  return { pdf: args.first, extraRenders: extra, step: null, pagesBefore: before.pages, pagesAfter: before.pages };
}
