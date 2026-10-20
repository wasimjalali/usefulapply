/**
 * Page geometry for the CV templates. One source for the canvas and the PDF:
 * the template root reads its width and padding from here in screen mode, and
 * the export writes the same numbers into `@page` (the single owner of the PDF
 * margins), so what the user sees is what is exported.
 */

export type PaperSize = 'letter' | 'a4';
export type CvMarket = 'us' | 'dach';
export type CvRenderMode = 'screen' | 'print';

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CvPrintSpec {
  paper: PaperSize;
  market: CvMarket;
  /** Page margins in millimetres. */
  marginMm: Margins;
}

const IN = 25.4;

/** US and North America: Letter, 0.5in top and bottom, 0.75in sides. */
const US_SPEC: CvPrintSpec = {
  paper: 'letter',
  market: 'us',
  marginMm: { top: 0.5 * IN, right: 0.75 * IN, bottom: 0.5 * IN, left: 0.75 * IN },
};

/** DACH: A4, 25 mm left and 20 mm right (DIN 5008 binding margin), 20 mm top, 18 mm bottom. */
const DACH_SPEC: CvPrintSpec = {
  paper: 'a4',
  market: 'dach',
  marginMm: { top: 20, right: 20, bottom: 18, left: 25 },
};

const DACH_TEMPLATES = new Set(['german-ats', 'german-classic']);

export function isDachTemplate(templateId: string): boolean {
  return DACH_TEMPLATES.has(templateId);
}

export function getPrintSpec(templateId: string, paperOverride?: PaperSize): CvPrintSpec {
  const base = isDachTemplate(templateId) ? DACH_SPEC : US_SPEC;
  return paperOverride && paperOverride !== base.paper ? { ...base, paper: paperOverride } : base;
}

export const PAPER_MM: Record<PaperSize, { width: number; height: number }> = {
  letter: { width: 215.9, height: 279.4 },
  a4: { width: 210, height: 297 },
};

const mm = (value: number) => `${Number(value.toFixed(2))}mm`;

/**
 * The template root's box. Screen draws the page as a fixed-size sheet with the
 * margins as padding. Print drops both: the page box and `@page` margins do it.
 * `paper` is the CV's paper (see paper.ts), not the template's.
 */
export function rootBox(templateId: string, mode: CvRenderMode | undefined, paper?: PaperSize): {
  width?: string;
  minHeight?: string;
  padding: string;
} {
  if (mode === 'print') return { padding: '0' };
  const spec = getPrintSpec(templateId, paper);
  const size = PAPER_MM[spec.paper];
  const m = spec.marginMm;
  return {
    width: mm(size.width),
    minHeight: mm(size.height),
    padding: `${mm(m.top)} ${mm(m.right)} ${mm(m.bottom)} ${mm(m.left)}`,
  };
}

/** The `@page` rule for the export. */
export function pageRule(templateId: string, paperOverride?: PaperSize): string {
  const spec = getPrintSpec(templateId, paperOverride);
  const m = spec.marginMm;
  return `@page { size: ${spec.paper === 'a4' ? 'A4' : 'Letter'}; margin: ${mm(m.top)} ${mm(m.right)} ${mm(m.bottom)} ${mm(m.left)}; }`;
}
