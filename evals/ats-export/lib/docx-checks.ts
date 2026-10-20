import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { CVData } from '../../../src/lib/cv-templates/types';
import { getPrintSpec, isDachTemplate } from '../../../src/lib/cv-templates/print-spec';
import { cvPaper } from '../../../src/lib/cv-templates/paper';
import { visibleCvData } from '../../../src/lib/cv-templates/hidden';
import { HEADING_ORDER } from './cv-checks';
import { checkDinDocxPositions } from './letter-checks';
import type { StructuredCoverLetter } from '../../../src/lib/cover-letter/contract';
import { checkPersonalAndLinks, checkText, expectationsFor, norm, squash } from './expect';
import { pdfinfo, pdftotext } from './poppler';

const run = promisify(execFile);
const SOFFICE = process.env.SOFFICE ?? '/Applications/LibreOffice.app/Contents/MacOS/soffice';

export interface DocxReport {
  fixture: string;
  templateId: string;
  ok: boolean;
  failures: string[];
  warnings: string[];
  metrics: {
    paragraphs: number;
    headingParagraphs: number;
    tables: number;
    textBoxes: number;
    anchoredImages: number;
    pageTwips: { w: number; h: number };
    lo: { pages: number; skills: string; bullets: string; contact: string; headings: string; missing: string[] } | null;
  };
}

async function unzipEntry(path: string, entry: string): Promise<string> {
  const { stdout } = await run('unzip', ['-p', path, entry], { maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

function decode(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

interface Paragraph {
  style: string;
  text: string;
}

function paragraphsOf(xml: string): Paragraph[] {
  const out: Paragraph[] = [];
  for (const match of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const block = match[0];
    const style = block.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? '';
    const text = [...block.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>/g)]
      .map((m) => (m[0] === '<w:tab/>' ? '\t' : decode(m[1] ?? '')))
      .join('');
    out.push({ style, text });
  }
  return out;
}

export async function checkCvDocx(
  bytes: Uint8Array,
  ctx: { fixture: string; templateId: string; source: CVData; expectPhoto: boolean },
): Promise<DocxReport> {
  const dir = await mkdtemp(join(tmpdir(), 'docx-'));
  const path = join(dir, 'cv.docx');
  await writeFile(path, bytes);
  const [xml, core] = await Promise.all([unzipEntry(path, 'word/document.xml'), unzipEntry(path, 'docProps/core.xml')]);
  const failures: string[] = [];
  const warnings: string[] = [];
  const spec = getPrintSpec(ctx.templateId, cvPaper(visibleCvData(ctx.source)));
  const exp = expectationsFor(ctx.source);

  const paragraphs = paragraphsOf(xml);
  const text = paragraphs.map((p) => p.text).join('\n');
  const check = checkText(text, exp, { contiguous: true });
  if (check.missing.length > 0) failures.push(`docx text: missing ${check.missing.length} (${check.missing.slice(0, 3).join(' | ')})`);
  if (check.pairingFailures.length > 0) failures.push(`docx: ${check.pairingFailures[0]}`);
  if (check.nonAsciiLost.length > 0) failures.push(`docx lost characters ${check.nonAsciiLost.join('')}`);
  if (check.hasDashDates) failures.push('docx: en or em dash in the text');
  // Date of birth and nationality print on DACH templates only, as in the PDF; links show a clean address.
  for (const problem of checkPersonalAndLinks(text, exp, isDachTemplate(ctx.templateId))) failures.push(`docx: ${problem}`);
  // Links are real DOCX hyperlinks to the full https URL.
  const rels = await unzipEntry(path, 'word/_rels/document.xml.rels');
  const targets = [...rels.matchAll(/Target="([^"]+)"[^>]*TargetMode="External"|TargetMode="External"[^>]*Target="([^"]+)"/g)].map((m) => decode(m[1] ?? m[2]));
  for (const link of exp.links) {
    if (!targets.includes(link.full)) failures.push(`docx: no hyperlink to ${link.full}`);
  }
  if (exp.links.length > 0 && (xml.match(/<w:hyperlink /g) ?? []).length < exp.links.length) failures.push('docx: fewer w:hyperlink elements than links');

  const tables = (xml.match(/<w:tbl>/g) ?? []).length;
  const textBoxes = (xml.match(/<w:txbxContent|<wps:txbx|<v:textbox/g) ?? []).length;
  const anchored = (xml.match(/<wp:anchor/g) ?? []).length;
  const headings = paragraphs.filter((p) => /^Heading1$/i.test(p.style));
  if (tables > 0) failures.push(`${tables} table(s): layout tables are not allowed`);
  if (textBoxes > 0) failures.push(`${textBoxes} text box(es): text boxes are not allowed`);
  if (ctx.expectPhoto && spec.market === 'dach' && anchored < 1) failures.push('expected an anchored photo');
  if (!ctx.expectPhoto && anchored > 0) failures.push('image where none is expected');

  // Section headings are Heading 1 paragraphs, with the standard text, in document order.
  const headingTexts = headings.map((h) => norm(h.text).toLowerCase());
  // The same order the PDF stream has (HEADING_ORDER is the PDF check's template order).
  const wantOrder = (HEADING_ORDER[ctx.templateId] ?? HEADING_ORDER['premium-ats']).filter((key) => exp.headings.some((h) => h.key === key));
  const gotOrder = exp.headings
    .map((h) => ({ key: h.key, at: headingTexts.indexOf(norm(h.text).toLowerCase()) }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((h) => h.key);
  if (gotOrder.join() !== wantOrder.join()) failures.push(`docx section order ${gotOrder.join(' > ')} differs from the PDF's ${wantOrder.join(' > ')}`);
  for (const heading of exp.headings) {
    if (!headingTexts.includes(norm(heading.text).toLowerCase())) failures.push(`no Heading 1 paragraph "${heading.text}"`);
  }
  if (!paragraphs.some((p) => /^Title$/i.test(p.style) && norm(p.text).startsWith(norm(exp.name)))) failures.push('the name is not a Title paragraph');

  const pgSz = xml.match(/<w:pgSz [^>]*w:w="(\d+)"[^>]*w:h="(\d+)"/);
  const pageTwips = { w: Number(pgSz?.[1] ?? 0), h: Number(pgSz?.[2] ?? 0) };
  const expectW = spec.paper === 'a4' ? 11906 : 12240;
  if (Math.abs(pageTwips.w - expectW) > 20) failures.push(`page width ${pageTwips.w} twips, expected ${expectW}`);
  const mar = xml.match(/<w:pgMar [^>]*w:left="(\d+)"[^>]*\/>/);
  const leftTwips = Number(mar?.[1] ?? 0);
  const expectLeft = Math.round((spec.marginMm.left / 25.4) * 1440);
  if (Math.abs(leftTwips - expectLeft) > 25) failures.push(`left margin ${leftTwips} twips, expected ${expectLeft}`);

  const title = core.match(/<dc:title>([^<]*)<\/dc:title>/)?.[1] ?? '';
  if (!title) failures.push('document title is empty');
  if (!/Useful Apply/.test(core)) failures.push('creator is not set');

  // Round trip: LibreOffice converts the DOCX to PDF, then that PDF is text-checked.
  let lo: DocxReport['metrics']['lo'] = null;
  try {
    const profile = `file://${join(dir, 'profile')}`;
    await run(SOFFICE, ['--headless', `-env:UserInstallation=${profile}`, '--convert-to', 'pdf', '--outdir', dir, path], { timeout: 120_000 });
    const pdf = new Uint8Array(await readFile(join(dir, 'cv.pdf')));
    const [info, loText] = await Promise.all([pdfinfo(pdf), pdftotext(pdf, 'reading-order')]);
    const loCheck = checkText(loText, exp);
    for (const problem of checkPersonalAndLinks(loText, exp, isDachTemplate(ctx.templateId))) failures.push(`LibreOffice render: ${problem}`);
    const c = loCheck.counts;
    lo = {
      pages: info.pages,
      skills: `${c.skills?.found}/${c.skills?.total}`,
      bullets: `${c.bullets?.found}/${c.bullets?.total}`,
      contact: `${c.contact?.found}/${c.contact?.total}`,
      headings: `${loCheck.headingsFound}/${loCheck.headingsTotal}`,
      missing: loCheck.missing,
    };
    if (loCheck.missing.length > 0) failures.push(`LibreOffice render: missing ${loCheck.missing.length} (${loCheck.missing.slice(0, 3).join(' | ')})`);
    if (loCheck.nonAsciiLost.length > 0) failures.push(`LibreOffice render lost characters ${loCheck.nonAsciiLost.join('')}`);
  } catch (error) {
    // A conversion that cannot run is a failed check, never a skipped one.
    failures.push(`LibreOffice conversion failed: ${error instanceof Error ? error.message.slice(0, 80) : 'error'}`);
  }

  return {
    fixture: ctx.fixture,
    templateId: ctx.templateId,
    ok: failures.length === 0,
    failures,
    warnings,
    metrics: {
      paragraphs: paragraphs.length,
      headingParagraphs: headings.length,
      tables,
      textBoxes,
      anchoredImages: anchored,
      pageTwips,
      lo,
    },
  };
}

export interface LetterDocxReport {
  name: string;
  ok: boolean;
  failures: string[];
  loPages: number | null;
  /** DIN layout: millimetres measured on the LibreOffice render of the DOCX. */
  measured?: Record<string, number>;
}

/** A cover letter DOCX: no tables or text boxes, and a LibreOffice render that still holds every field. */
export async function checkLetterDocx(bytes: Uint8Array, name: string, fields: string[], expectDinClosing: string | null, din?: StructuredCoverLetter): Promise<LetterDocxReport> {
  const dir = await mkdtemp(join(tmpdir(), 'letterdocx-'));
  const path = join(dir, 'letter.docx');
  await writeFile(path, bytes);
  const xml = await unzipEntry(path, 'word/document.xml');
  const failures: string[] = [];
  if (/<w:tbl>/.test(xml)) failures.push('the letter has a table');
  if (/<w:txbxContent|<wps:txbx|<v:textbox/.test(xml)) failures.push('the letter has a text box');
  let loPages: number | null = null;
  let measured: Record<string, number> | undefined;
  try {
    await run(SOFFICE, ['--headless', `-env:UserInstallation=file://${join(dir, 'profile')}`, '--convert-to', 'pdf', '--outdir', dir, path], { timeout: 120_000 });
    const pdf = new Uint8Array(await readFile(join(dir, 'letter.pdf')));
    const [info, text] = await Promise.all([pdfinfo(pdf), pdftotext(pdf, 'reading-order')]);
    loPages = info.pages;
    const squashed = squash(text);
    for (const field of fields) {
      if (!squashed.includes(squash(field))) failures.push(`LibreOffice render is missing: ${field.slice(0, 50)}`);
    }
    if (expectDinClosing && !norm(text).includes(expectDinClosing)) failures.push('DIN closing is missing');
    if (expectDinClosing && new RegExp(`${expectDinClosing},`).test(text)) failures.push('DIN closing has a comma');
    if (din) {
      const result = await checkDinDocxPositions(pdf, din);
      failures.push(...result.failures.map((f) => `DOCX position: ${f}`));
      measured = result.measured;
    }
  } catch (error) {
    failures.push(`LibreOffice conversion failed: ${error instanceof Error ? error.message.slice(0, 80) : 'error'}`);
  }
  return { name, ok: failures.length === 0, failures, loPages, measured };
}
