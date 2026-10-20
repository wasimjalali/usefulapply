/**
 * The ATS and layout eval for the CV and cover letter export.
 *
 *   npm run eval --prefix evals/ats-export            (writes to verify/ats-export-run, or ATS_EVAL_OUT)
 *   npm run eval:write --prefix evals/ats-export      (replaces the committed results, the only way to)
 *   npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/run.ts [--write]
 *
 * Renders every fixture through every template with the real Browser Run
 * binding (via the eval worker on port 8793), checks the PDFs and DOCX files
 * against the source data, runs the local ATS proxies (Tika, PyMuPDF,
 * pdfminer.six, pdf.js, pdftotext, OpenResume and an AI parser stand-in),
 * checks the cover letters, then runs the same checks on the html2canvas
 * baseline from baseline.ts. Setup: `bash evals/ats-export/ats/setup.sh` and
 * `bash evals/ats-export/fetch-open-resume.sh`.
 */
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { cvPaper } from '../../src/lib/cv-templates/paper';
import { isDachTemplate, type PaperSize } from '../../src/lib/cv-templates/print-spec';
import { resolveExport } from '../../src/lib/services/export/resolve';
import { renderExport, type RenderedExport } from '../../src/lib/services/export/render';
import { renderHtmlToPdf } from '../../src/lib/services/export/pdf';
import type { ExportFormat } from '../../src/lib/services/export/types';
import type { CVData } from '../../src/lib/cv-templates/types';
import type { CvTextLocale } from '../../src/lib/cv-templates/locale';
import type { StructuredCoverLetter } from '../../src/lib/cover-letter/contract';
import {
  CV_FIXTURES,
  DE_TWO_PAGE,
  DIN_LETTER,
  DIN_LETTER_LONG_SENDER,
  HOSTILE_TEXT,
  MANY_CERTS,
  TEMPLATE_IDS,
  US_LETTER,
  US_LETTER_ON_GERMAN_CV,
  US_ONE_PAGE,
} from './fixtures';
import { aiUsage, AI_MODEL, parseWithAi, scoreAi, type AiScore } from './lib/ai-parser';
import { EXTRACTORS, TIKA_VERSION, extractText, proxiesAvailable } from './lib/ats-proxies';
import { checkCvPdf, type CvPdfReport } from './lib/cv-checks';
import { checkCvDocx, checkLetterDocx, type DocxReport, type LetterDocxReport } from './lib/docx-checks';
import { checkLetterPdf, type LetterReport } from './lib/letter-checks';
import { OPENRESUME_COMMIT, parseWithOpenResume, scoreOpenResume, type OpenResumeScore } from './lib/openresume';
import { COMMITTED_RAW, RUN_DIR, WRITE_RESULTS, ensureWorker, loadFontFromDisk, workerBinding, writeOut, type RenderTiming } from './lib/render';
import { kitFor } from './render-all';
import { runServiceChecks, type ServiceReport } from './service-checks';
import { extractWithPdfJs } from './lib/pdf-text';
import { pdfImageCount, pdfinfo, pdftotext } from './lib/poppler';
import { norm, squash } from './lib/expect';

const run = promisify(execFile);
const OUT = RUN_DIR;

interface CvRow {
  pdf: CvPdfReport;
  docx: DocxReport;
  openResume: OpenResumeScore | null;
  openResumeError?: string;
  ai: AiScore | null;
}

async function renderCv(
  fixtureData: CVData,
  templateId: string,
  format: ExportFormat,
  deps: Parameters<typeof renderExport>[1],
  options: { paper?: PaperSize } = {},
): Promise<{ rendered: RenderedExport; locale: CvTextLocale }> {
  const kit = kitFor({
    cv: fixtureData,
    originalCv: fixtureData,
    applicantName: fixtureData.personal.fullName,
    photoDataUri: fixtureData.personal.photoUrl ?? null,
  });
  const resolved = resolveExport(kit, format, { templateId, ...options });
  return { rendered: await renderExport(resolved, deps), locale: resolved.locale };
}

/** A small pool, so the AI parser calls overlap with the renders without flooding the model. */
function pool(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function <T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

const PAPER_BY_FIXTURE: Record<string, PaperSize> = {
  'us-one-page': 'letter',
  'de-two-page': 'a4',
  'over-cap': 'letter',
  'long-entry': 'letter',
  'us-personal': 'letter',
  hostile: 'letter',
  'fr-one-page': 'a4',
};

async function main() {
  const missing = proxiesAvailable();
  if (missing) throw new Error(missing);
  await ensureWorker();
  console.log(`Results go to ${OUT}${WRITE_RESULTS ? ' (committed folder, --write)' : ' (scratch; pass --write to replace the committed results)'}`);
  const timings: RenderTiming[] = [];
  const deps = { browser: workerBinding(timings), loadFont: loadFontFromDisk };
  const cvRows: CvRow[] = [];
  const pdfBytes = new Map<string, Uint8Array>();
  const aiLimit = pool(4);
  const aiWork: Array<Promise<void>> = [];

  // 1. CV PDFs and DOCX for every fixture and template.
  for (const fixture of CV_FIXTURES) {
    for (const templateId of TEMPLATE_IDS) {
      const expectPhoto = isDachTemplate(templateId) && Boolean(fixture.data.personal.photoUrl);
      const pdf = await renderCv(fixture.data, templateId, 'cv_pdf', deps);
      const docx = await renderCv(fixture.data, templateId, 'cv_docx', deps);
      const base = `${fixture.name}__${templateId}`;
      pdfBytes.set(base, pdf.rendered.bytes);
      await writeOut(join(OUT, 'cv'), `${base}.pdf`, pdf.rendered.bytes);
      await writeOut(join(OUT, 'cv'), `${base}.docx`, docx.rendered.bytes);
      const pdfReport = await checkCvPdf(pdf.rendered.bytes, {
        fixture: fixture.name,
        templateId,
        source: fixture.data,
        expectPhoto,
        expectedPages: fixture.expectedUsPages,
        expectedPaper: PAPER_BY_FIXTURE[fixture.name],
        locale: pdf.locale,
      });
      const docxReport = await checkCvDocx(docx.rendered.bytes, { fixture: fixture.name, templateId, source: fixture.data, expectPhoto });
      let openResume: OpenResumeScore | null = null;
      let openResumeError: string | undefined;
      try {
        openResume = scoreOpenResume(await parseWithOpenResume(pdf.rendered.bytes), fixture.data);
      } catch (error) {
        openResumeError = error instanceof Error ? error.message.slice(0, 120) : 'error';
      }
      const row: CvRow = { pdf: pdfReport, docx: docxReport, openResume, openResumeError, ai: null };
      cvRows.push(row);
      // The AI parser reads what Tika extracted, the way a pipeline of Tika and a model would.
      const tikaText = await extractText('tika', pdf.rendered.bytes);
      aiWork.push(aiLimit(async () => void (row.ai = scoreAi(await parseWithAi(tikaText), fixture.data))));
      console.log(`${pdfReport.ok ? 'PASS' : 'FAIL'} pdf  ${base}  ${pdfReport.failures[0] ?? ''}`);
      console.log(`${docxReport.ok ? 'PASS' : 'FAIL'} docx ${base}  ${docxReport.failures[0] ?? ''}`);
    }
  }

  // 2. Cover letters: both layouts as PDF and DOCX, the long forms, the legacy body.
  const letterRows: LetterReport[] = [];
  const letterDocxRows: LetterDocxReport[] = [];
  const letterCases: Array<{ name: string; letter: StructuredCoverLetter; layout: 'us' | 'din'; templateId: string }> = [
    { name: 'letter-us', letter: US_LETTER, layout: 'us', templateId: 'premium-ats' },
    { name: 'letter-din', letter: DIN_LETTER, layout: 'din', templateId: 'german-ats' },
    { name: 'letter-din-long-sender', letter: DIN_LETTER_LONG_SENDER, layout: 'din', templateId: 'german-ats' },
  ];
  for (const c of letterCases) {
    const kit = kitFor({ applicantName: c.letter.sender.name, coverLetter: { structured: c.letter, legacyText: null } });
    const pdf = await renderExport(resolveExport(kit, 'cover_letter_pdf', { templateId: c.templateId }), deps);
    const docx = await renderExport(resolveExport(kit, 'cover_letter_docx', { templateId: c.templateId }), deps);
    await writeOut(join(OUT, 'letters'), `${c.name}.pdf`, pdf.bytes);
    await writeOut(join(OUT, 'letters'), `${c.name}.docx`, docx.bytes);
    const report = await checkLetterPdf(pdf.bytes, c.name, c.layout, c.letter);
    letterRows.push(report);
    const letterDocx = await checkLetterDocx(
      docx.bytes,
      `${c.name}.docx`,
      [c.letter.sender.name, c.letter.recipient.companyName ?? '', c.letter.subject, c.letter.salutation, c.letter.paragraphs[0], c.letter.signatureName, c.letter.date],
      c.layout === 'din' ? 'Mit freundlichen Grüßen' : null,
      c.layout === 'din' ? c.letter : undefined,
    );
    letterDocxRows.push(letterDocx);
    console.log(`${letterDocx.ok ? 'PASS' : 'FAIL'} ${letterDocx.name}  ${letterDocx.failures[0] ?? ''}`);
    console.log(`${report.ok ? 'PASS' : 'FAIL'} ${c.name}  ${report.failures[0] ?? ''}`);
  }

  // A long letter must keep its margins on the second page.
  const longDin: StructuredCoverLetter = { ...DIN_LETTER, paragraphs: Array.from({ length: 9 }, () => DIN_LETTER.paragraphs[0] + ' ' + DIN_LETTER.paragraphs[1]) };
  const longPdf = await renderExport(resolveExport(kitFor({ applicantName: longDin.sender.name, coverLetter: { structured: longDin, legacyText: null } }), 'cover_letter_pdf', { templateId: 'german-ats' }), deps);
  await writeOut(join(OUT, 'letters'), 'letter-din-long.pdf', longPdf.bytes);
  const longReport = await checkLetterPdf(longPdf.bytes, 'letter-din-long', 'din', longDin);
  letterRows.push(longReport);
  console.log(`${longReport.ok ? 'PASS' : 'FAIL'} letter-din-long  ${longReport.failures[0] ?? ''}`);

  // Legacy letter: the body is printed as written, with no header added.
  const legacyText = `Jordan Ellis\n1204 Congress Avenue\nAustin, TX 78701\n\nOctober 20, 2026\n\nDear Hiring Team,\n\nI am applying for the role of Senior Backend Engineer.\n\nSincerely,\nJordan Ellis`;
  const legacyPdf = await renderExport(resolveExport(kitFor({ applicantName: 'Jordan Ellis', coverLetter: { structured: null, legacyText } }), 'cover_letter_pdf', { templateId: 'premium-ats' }), deps);
  await writeOut(join(OUT, 'letters'), 'letter-legacy.pdf', legacyPdf.bytes);
  const legacyText2 = norm(await pdftotext(legacyPdf.bytes, 'reading-order'));
  const legacyFailures: string[] = [];
  if (!legacyText2.includes(norm(legacyText))) legacyFailures.push('legacy body is not printed as written');
  if ((legacyText2.match(/Jordan Ellis/g) ?? []).length !== 2) legacyFailures.push('a second header was added to the legacy letter');
  letterRows.push({ name: 'letter-legacy', layout: 'us', ok: legacyFailures.length === 0, failures: legacyFailures, warnings: [], measured: {} });
  console.log(`${legacyFailures.length === 0 ? 'PASS' : 'FAIL'} letter-legacy ${legacyFailures[0] ?? ''}`);

  // 3. Overrides, hidden items, hostile text, request blocking, a US letter on a German CV.
  const extra: Array<{ name: string; ok: boolean; failures: string[]; detail?: Record<string, unknown> }> = [];
  {
    const hidden: CVData = {
      ...US_ONE_PAGE,
      experience: [US_ONE_PAGE.experience[0], { ...US_ONE_PAGE.experience[1], hidden: true }, US_ONE_PAGE.experience[2]],
      skills: [{ ...US_ONE_PAGE.skills[0], hiddenItems: ['SQL'] }, { ...US_ONE_PAGE.skills[1], hidden: true }],
      hiddenSections: ['certifications'],
    };
    const failures: string[] = [];
    const absent = ['Lumen Payments', 'Terraform', 'Certified Kubernetes Administrator'];
    const present = ['Northwind Freight', 'Brightpath Analytics', 'Python'];
    const pdf = (await renderCv(hidden, 'premium-ats', 'cv_pdf', deps)).rendered;
    const docx = (await renderCv(hidden, 'premium-ats', 'cv_docx', deps)).rendered;
    await writeOut(join(OUT, 'overrides'), 'hidden.pdf', pdf.bytes);
    const docxPath = await writeOut(join(OUT, 'overrides'), 'hidden.docx', docx.bytes);
    const { stdout: docxXml } = await run('unzip', ['-p', docxPath, 'word/document.xml'], { maxBuffer: 16 * 1024 * 1024 });
    for (const [label, text] of [['PDF', await pdftotext(pdf.bytes, 'raw')], ['DOCX', docxXml.replace(/<[^>]+>/g, ' ')]] as const) {
      for (const needle of absent) if (text.includes(needle)) failures.push(`hidden text "${needle}" is in the ${label}`);
      if (/\bSQL\b/.test(text)) failures.push(`hidden skill "SQL" is in the ${label}`);
      for (const needle of present) if (!text.includes(needle)) failures.push(`visible text "${needle}" is missing from the ${label}`);
    }
    extra.push({ name: 'hidden-items', ok: failures.length === 0, failures });
    console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'} hidden-items ${failures[0] ?? ''}`);
  }
  {
    const failures: string[] = [];
    const detail: Record<string, unknown> = {};
    for (const [templateId, paper] of [['premium-ats', 'a4'], ['german-classic', 'letter']] as const) {
      const fixture = templateId === 'premium-ats' ? US_ONE_PAGE : DE_TWO_PAGE;
      const rendered = (await renderCv(fixture, templateId, 'cv_pdf', deps, { paper })).rendered;
      await writeOut(join(OUT, 'overrides'), `${templateId}__${paper}.pdf`, rendered.bytes);
      const pdfjs = await extractWithPdfJs(rendered.bytes);
      const page = pdfjs.pages[0];
      const expectW = paper === 'a4' ? 595.3 : 612;
      if (Math.abs(page.width - expectW) > 2) failures.push(`${templateId} on ${paper}: page is ${page.width}pt wide`);
      const rightEdge = Math.max(...pdfjs.items.filter((i) => i.str.trim()).map((i) => i.x + i.w));
      const rightMarginMm = ((page.width - rightEdge) * 25.4) / 72;
      detail[`${templateId}@${paper}.rightMarginMm`] = Number(rightMarginMm.toFixed(1));
      const wanted = isDachTemplate(templateId) ? 20 : 19.05;
      if (rightMarginMm < wanted - 0.8) failures.push(`${templateId} on ${paper}: text runs ${rightMarginMm.toFixed(1)} mm from the right edge (clipped or overflowing)`);
      for (const needle of [fixture.personal.fullName, fixture.experience[0].company, fixture.experience[0].bullets[0].slice(0, 30)]) {
        if (!norm(pdfjs.text).includes(norm(needle))) failures.push(`${templateId} on ${paper}: "${needle}" is missing after the reflow`);
      }
    }
    extra.push({ name: 'paper-override-reflow', ok: failures.length === 0, failures, detail });
    console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'} paper-override-reflow ${failures[0] ?? ''}`);
  }
  {
    // Hostile text: markup in a CV comes out as literal text in every extractor, and nothing is fetched from the network.
    const failures: string[] = [];
    for (const templateId of TEMPLATE_IDS) {
      const bytes = pdfBytes.get(`hostile__${templateId}`)!;
      const texts: Array<[string, string]> = [
        ['raw', await pdftotext(bytes, 'raw')],
        ['pdfjs', (await extractWithPdfJs(bytes)).text],
        ['tika', await extractText('tika', bytes)],
        ['pymupdf', await extractText('pymupdf', bytes)],
        ['pdfminer', await extractText('pdfminer', bytes)],
      ];
      for (const [tool, text] of texts) {
        for (const [label, literal] of Object.entries(HOSTILE_TEXT)) {
          if (!squash(text).includes(squash(literal))) failures.push(`${templateId}/${tool}: the ${label} text is not literal in the text layer`);
        }
      }
      const images = await pdfImageCount(bytes);
      if (images > 0) failures.push(`${templateId}: ${images} image(s) in the hostile CV, so something was fetched`);
    }
    // Second layer: Browser Run's request blocking, with no meta CSP on the page. A remote image reports whether it
    // loaded into the page text (the load event waits for it), so the result is readable in the PDF. The same page
    // without the request pattern must load it, or the check proves nothing.
    const probe = `<!doctype html><html><body><p id="out">probe</p><img src="https://www.cloudflare.com/img/logo-web-badges/cf-logo-on-white-bg.svg" width="120" onload="document.getElementById('out').textContent='REMOTE_IMAGE_LOADED'" onerror="document.getElementById('out').textContent='REMOTE_IMAGE_BLOCKED'"></body></html>`;
    const open = await deps.browser.quickAction('pdf', { html: probe, gotoOptions: { waitUntil: 'load' }, pdfOptions: { format: 'a4' } });
    const openText = await pdftotext(new Uint8Array(await open.arrayBuffer()), 'raw');
    const blockedPdf = await renderHtmlToPdf(deps.browser, probe, 'a4');
    const blockedText = await pdftotext(blockedPdf, 'raw');
    if (!openText.includes('REMOTE_IMAGE_LOADED')) failures.push('the control render did not load the remote image, so the check cannot show blocking');
    if (!blockedText.includes('REMOTE_IMAGE_BLOCKED')) failures.push(`request blocking did not stop the remote image (page says "${blockedText.trim().slice(0, 40)}")`);
    const fetched = blockedText.includes('REMOTE_IMAGE_LOADED') ? 1 : 0;
    extra.push({ name: 'hostile-text-and-request-blocking', ok: failures.length === 0, failures, detail: { controlLoadedRemoteImage: openText.includes('REMOTE_IMAGE_LOADED'), blockedRender: blockedText.trim().slice(0, 40), remoteImagesInBlockedRender: fetched } });
    console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'} hostile-text-and-request-blocking ${failures[0] ?? ''}`);
  }
  {
    // A US-layout letter on a German CV is English: file name, PDF title, language and the lang of the document.
    const failures: string[] = [];
    const kit = kitFor({
      applicantName: US_LETTER_ON_GERMAN_CV.sender.name,
      cv: DE_TWO_PAGE,
      originalCv: DE_TWO_PAGE,
      coverLetter: { structured: US_LETTER_ON_GERMAN_CV, legacyText: null },
    });
    const resolved = resolveExport(kit, 'cover_letter_pdf', { templateId: 'german-ats' });
    const rendered = await renderExport(resolved, deps);
    await writeOut(join(OUT, 'letters'), 'letter-us-on-german-cv.pdf', rendered.bytes);
    const info = await pdfinfo(rendered.bytes);
    if (rendered.fileName !== 'Juergen_Mueller-Schaefer_Cover_Letter.pdf') failures.push(`file name "${rendered.fileName}"`);
    if (!/Cover Letter/.test(info.title) || /Anschreiben/.test(info.title)) failures.push(`title "${info.title}"`);
    if (info.pageSizePts.width < 600) failures.push('a US layout letter is not on Letter paper');
    const lang = (await readFile(join(OUT, 'letters', 'letter-us-on-german-cv.pdf'))).toString('latin1').match(/\/Lang\s*\(([^)]*)\)/)?.[1] ?? '';
    if (!lang.toLowerCase().startsWith('en')) failures.push(`language "${lang}"`);
    extra.push({ name: 'us-letter-on-german-cv', ok: failures.length === 0, failures, detail: { fileName: rendered.fileName, title: info.title, lang } });
    console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'} us-letter-on-german-cv ${failures[0] ?? ''}`);
  }
  {
    // A sidebar section that runs past a page repeats its heading at the top of each later page.
    const failures: string[] = [];
    const detail: Record<string, unknown> = {};
    for (const templateId of ['modern-professional', 'german-ats'] as const) {
      const rendered = (await renderCv(MANY_CERTS, templateId, 'cv_pdf', deps)).rendered;
      await writeOut(join(OUT, 'overrides'), `many-certs__${templateId}.pdf`, rendered.bytes);
      const pdfjs = await extractWithPdfJs(rendered.bytes);
      const heading = 'zertifikate';
      const withHeading = pdfjs.pageTexts.map((page) => page.toLowerCase().includes(heading));
      detail[templateId] = { pages: pdfjs.pageTexts.length, headingOnPage: withHeading };
      const sidebarPages = pdfjs.pageTexts.map((page, index) => ({ index, hasCert: /Zertifizierung Nummer \d+/.test(page) })).filter((p) => p.hasCert);
      for (const { index } of sidebarPages) if (!withHeading[index]) failures.push(`${templateId}: page ${index + 1} continues the certifications without their heading`);
      if (sidebarPages.length < 2) failures.push(`${templateId}: the certifications did not run past a page, so the check proved nothing`);
      // Every certification is still there, once.
      const text = await extractText('tika', rendered.bytes);
      for (let n = 1; n <= 60; n++) if (!new RegExp(`Zertifizierung Nummer ${n} im`).test(text)) failures.push(`${templateId}: certification ${n} is missing`);
    }
    extra.push({ name: 'sidebar-continuation-heading', ok: failures.length === 0, failures, detail });
    console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'} sidebar-continuation-heading ${failures[0] ?? ''}`);
  }
  {
    // A French CV: no German dates, headings or footers, on A4.
    const failures: string[] = [];
    for (const templateId of ['premium-ats', 'german-ats'] as const) {
      const text = await pdftotext(pdfBytes.get(`fr-one-page__${templateId}`)!, 'raw');
      if (/\bheute\b|Berufserfahrung|Kenntnisse|Seite \d/.test(text)) failures.push(`${templateId}: German text on a French CV`);
    }
    if (cvPaper(CV_FIXTURES.find((f) => f.name === 'fr-one-page')!.data) !== 'a4') failures.push('a French CV is not on A4');
    extra.push({ name: 'french-cv-not-german', ok: failures.length === 0, failures });
    console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'} french-cv-not-german ${failures[0] ?? ''}`);
  }

  // 4. Service checks: cache key, signing, sanitizing, layout choice, hidden state, headings.
  const services: ServiceReport[] = await runServiceChecks();
  for (const s of services) console.log(`${s.ok ? 'PASS' : 'FAIL'} service ${s.name} ${s.failures[0] ?? ''}`);

  // 5. The AI parser stand-in finishes.
  await Promise.all(aiWork);
  console.log(`AI parser: ${aiUsage.calls} calls, ${aiUsage.promptTokens} in / ${aiUsage.completionTokens} out tokens, about $${aiUsage.costUsd.toFixed(3)} at list price`);

  // 6. Baseline: the same checks on today's html2canvas export and jsPDF letter.
  const baselineDir = join(COMMITTED_RAW, 'baseline');
  if (!existsSync(baselineDir)) throw new Error(`No baseline PDFs in ${baselineDir}. Extract baseline.tar.gz there or run baseline.ts.`);
  const baseline: Array<{
    name: string;
    pages: number;
    textChars: number;
    tagged: boolean;
    fileSizeKB: number;
    extraction: CvPdfReport['extraction'];
    openResume: OpenResumeScore | null;
    ai: AiScore;
    failures: number;
  }> = [];
  for (const file of (await readdir(baselineDir)).filter((f) => f.endsWith('.pdf')).sort()) {
    const [fixtureName, tpl] = file.replace(/\.pdf$/, '').split('__');
    const fixture = CV_FIXTURES.find((f) => f.name === fixtureName)!;
    const bytes = new Uint8Array(await readFile(join(baselineDir, file)));
    const report = await checkCvPdf(bytes, {
      fixture: fixtureName,
      templateId: tpl,
      source: fixture.data,
      expectPhoto: isDachTemplate(tpl) && Boolean(fixture.data.personal.photoUrl),
      expectedPages: fixture.expectedUsPages,
    });
    const text = await pdftotext(bytes, 'reading-order');
    let openResume: OpenResumeScore | null = null;
    try {
      openResume = scoreOpenResume(await parseWithOpenResume(bytes), fixture.data);
    } catch {
      // a picture has no text to parse
    }
    baseline.push({
      name: file,
      pages: report.metrics.pages,
      textChars: text.replace(/\s/g, '').length,
      tagged: report.metrics.tagged,
      fileSizeKB: report.metrics.fileSizeKB,
      extraction: report.extraction,
      openResume,
      // A page that is a picture has no text for the model to read.
      ai: scoreAi({ parsed: null, error: 'no text layer' }, fixture.data),
      failures: report.failures.length,
    });
  }
  const baselineLetters: Array<{ name: string; ok: boolean; failures: string[]; pages: number; tagged: boolean; paper: string }> = [];
  for (const [name, letter, layout] of [['letter-us', US_LETTER, 'us'], ['letter-din', DIN_LETTER, 'din']] as const) {
    const file = join(baselineDir, 'letters', `${name}.pdf`);
    if (!existsSync(file)) continue;
    const bytes = new Uint8Array(await readFile(file));
    const report = await checkLetterPdf(bytes, name, layout, letter);
    const info = await pdfinfo(bytes);
    baselineLetters.push({ name, ok: report.ok, failures: report.failures, pages: info.pages, tagged: info.tagged, paper: info.paperName || `${info.pageSizePts.width}x${info.pageSizePts.height}` });
  }

  const results = {
    date: '2026-10-20',
    openResumeCommit: OPENRESUME_COMMIT,
    proxies: { tika: TIKA_VERSION, extractors: EXTRACTORS, aiModel: AI_MODEL, aiUsage },
    renders: { count: timings.length, wallMsMedian: median(timings.map((t) => t.wallMs)), wallMsMax: Math.max(...timings.map((t) => t.wallMs)), browserMsMedian: median(timings.flatMap((t) => (t.browserMs ? [t.browserMs] : []))) },
    cv: cvRows,
    letters: letterRows,
    letterDocx: letterDocxRows,
    extra,
    services,
    baseline,
    baselineLetters,
  };
  await writeOut(OUT, 'results.json', JSON.stringify(results, null, 2));

  const failedPdf = cvRows.filter((r) => !r.pdf.ok).length;
  const failedDocx = cvRows.filter((r) => !r.docx.ok).length;
  const failedLetters = letterRows.filter((r) => !r.ok).length;
  // OpenResume handles single-column English only: it gates the US fixtures and is reported for the rest.
  const proxyFailures = cvRows.filter((r) => {
    if (r.pdf.fixture !== 'us-one-page') return false;
    const o = r.openResume;
    return !o || !o.name || !o.email || !o.phone || o.jobs.matched < o.jobs.total || o.bullets.matched < o.bullets.total || o.skills.matched < o.skills.total;
  });
  for (const row of proxyFailures) console.log(`FAIL ats-proxy (OpenResume) ${row.pdf.fixture}__${row.pdf.templateId}`);
  // The AI parser must read name, email, phone and at least 90% of jobs, bullets and skills on the English one-page CVs. A model can differ run to run, so it is not held to 100%.
  const aiFailures = cvRows.filter((r) => {
    if (!['us-one-page', 'us-personal'].includes(r.pdf.fixture)) return false;
    const a = r.ai;
    const share = (x: { matched: number; total: number }) => (x.total === 0 ? 1 : x.matched / x.total);
    return !a || !a.name || !a.email || !a.phone || share(a.jobs) < 0.9 || share(a.bullets) < 0.9 || share(a.skills) < 0.9;
  });
  for (const row of aiFailures) console.log(`FAIL ats-proxy (AI parser) ${row.pdf.fixture}__${row.pdf.templateId}`);
  const failedLetterDocx = letterDocxRows.filter((r) => !r.ok).length;
  const failedExtra = proxyFailures.length + aiFailures.length + failedLetterDocx + extra.filter((r) => !r.ok).length + services.filter((s) => !s.ok).length;
  console.log(`\nCV PDFs ${cvRows.length - failedPdf}/${cvRows.length} pass, DOCX ${cvRows.length - failedDocx}/${cvRows.length}, letters ${letterRows.length - failedLetters}/${letterRows.length}, other ${failedExtra} failing`);
  process.exit(failedPdf + failedDocx + failedLetters + failedExtra === 0 ? 0 : 1);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
