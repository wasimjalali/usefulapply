/**
 * The ATS and layout eval for the CV and cover letter export.
 *
 *   npm run eval --prefix evals/ats-export     (or)
 *   npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/run.ts
 *
 * Renders every fixture through every template with the real Browser Run
 * binding (via the eval worker on port 8793), checks the PDFs and DOCX files,
 * runs the OpenResume ATS proxy, checks both cover letter layouts, then runs the
 * same checks on the html2canvas baseline PDFs if baseline.ts has produced them.
 * Writes raw files and results.json to evals/results/2026-10-20-ats-export/raw/.
 */
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { isDachTemplate } from '../../src/lib/cv-templates/print-spec';
import { resolveExport, exportCacheHash } from '../../src/lib/services/export/resolve';
import { renderExport, type RenderedExport } from '../../src/lib/services/export/render';
import type { ExportFormat } from '../../src/lib/services/export/types';
import type { CVData } from '../../src/lib/cv-templates/types';
import type { StructuredCoverLetter } from '../../src/lib/cover-letter/contract';
import { CV_FIXTURES, DIN_LETTER, TEMPLATE_IDS, US_LETTER, US_ONE_PAGE } from './fixtures';
import { checkCvPdf, type CvPdfReport } from './lib/cv-checks';
import { checkCvDocx, checkLetterDocx, type DocxReport, type LetterDocxReport } from './lib/docx-checks';
import { checkLetterPdf, type LetterReport } from './lib/letter-checks';
import { OPENRESUME_COMMIT, parseWithOpenResume, scoreOpenResume, type OpenResumeScore } from './lib/openresume';
import { ensureWorker, loadFontFromDisk, workerBinding, writeOut, REPO_ROOT, type RenderTiming } from './lib/render';
import { kitFor } from './render-all';
import { runServiceChecks, type ServiceReport } from './service-checks';
import { extractWithPdfJs } from './lib/pdf-text';
import { pdftotext } from './lib/poppler';
import { norm } from './lib/expect';

const run = promisify(execFile);
const OUT = join(REPO_ROOT, 'evals', 'results', '2026-10-20-ats-export', 'raw');

interface CvRow {
  pdf: CvPdfReport;
  docx: DocxReport;
  openResume: OpenResumeScore | null;
  openResumeError?: string;
}

async function renderCv(
  fixtureData: CVData,
  templateId: string,
  format: ExportFormat,
  deps: Parameters<typeof renderExport>[1],
  options: { paper?: 'a4' | 'letter' } = {},
): Promise<RenderedExport> {
  const kit = kitFor({
    cv: fixtureData,
    originalCv: fixtureData,
    applicantName: fixtureData.personal.fullName,
    photoDataUri: fixtureData.personal.photoUrl ?? null,
  });
  return renderExport(resolveExport(kit, format, { templateId, ...options }), deps);
}

async function main() {
  await ensureWorker();
  const timings: RenderTiming[] = [];
  const deps = { browser: workerBinding(timings), loadFont: loadFontFromDisk };
  const cvRows: CvRow[] = [];

  // 1. CV PDFs and DOCX for every fixture and template.
  for (const fixture of CV_FIXTURES) {
    for (const templateId of TEMPLATE_IDS) {
      const expectPhoto = isDachTemplate(templateId) && Boolean(fixture.data.personal.photoUrl);
      const pdf = await renderCv(fixture.data, templateId, 'cv_pdf', deps);
      const docx = await renderCv(fixture.data, templateId, 'cv_docx', deps);
      const base = `${fixture.name}__${templateId}`;
      await writeOut(join(OUT, 'cv'), `${base}.pdf`, pdf.bytes);
      await writeOut(join(OUT, 'cv'), `${base}.docx`, docx.bytes);
      const pdfReport = await checkCvPdf(pdf.bytes, {
        fixture: fixture.name,
        templateId,
        source: fixture.data,
        expectPhoto,
        expectedPages: fixture.expectedUsPages,
      });
      const docxReport = await checkCvDocx(docx.bytes, { fixture: fixture.name, templateId, source: fixture.data, expectPhoto });
      let openResume: OpenResumeScore | null = null;
      let openResumeError: string | undefined;
      try {
        openResume = scoreOpenResume(await parseWithOpenResume(pdf.bytes), fixture.data);
      } catch (error) {
        openResumeError = error instanceof Error ? error.message.slice(0, 120) : 'error';
      }
      cvRows.push({ pdf: pdfReport, docx: docxReport, openResume, openResumeError });
      console.log(`${pdfReport.ok ? 'PASS' : 'FAIL'} pdf  ${base}  ${pdfReport.failures[0] ?? ''}`);
      console.log(`${docxReport.ok ? 'PASS' : 'FAIL'} docx ${base}  ${docxReport.failures[0] ?? ''}`);
    }
  }

  // 2. Cover letters: both layouts as PDF and DOCX, plus the legacy body.
  const letterRows: LetterReport[] = [];
  const letterDocxRows: LetterDocxReport[] = [];
  const letterCases: Array<{ name: string; letter: StructuredCoverLetter; layout: 'us' | 'din'; templateId: string }> = [
    { name: 'letter-us', letter: US_LETTER, layout: 'us', templateId: 'premium-ats' },
    { name: 'letter-din', letter: DIN_LETTER, layout: 'din', templateId: 'german-ats' },
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

  // 3. Overrides and hidden items.
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
    const pdf = await renderCv(hidden, 'premium-ats', 'cv_pdf', deps);
    const docx = await renderCv(hidden, 'premium-ats', 'cv_docx', deps);
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
      const fixture = templateId === 'premium-ats' ? US_ONE_PAGE : CV_FIXTURES[1].data;
      const rendered = await renderCv(fixture, templateId, 'cv_pdf', deps, { paper });
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

  // 4. Service checks: cache key, signing, sanitizing, layout choice.
  const services: ServiceReport[] = await runServiceChecks();
  for (const s of services) console.log(`${s.ok ? 'PASS' : 'FAIL'} service ${s.name} ${s.failures[0] ?? ''}`);

  // 5. Baseline: the same checks on today's html2canvas export.
  const baselineDir = join(OUT, 'baseline');
  const baseline: Array<{ name: string; pages: number; textChars: number; tagged: boolean; fileSizeKB: number; skillsFound: string; bulletsFound: string; headingsFound: string; failures: number }> = [];
  if (existsSync(baselineDir)) {
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
      baseline.push({
        name: file,
        pages: report.metrics.pages,
        textChars: text.replace(/\s/g, '').length,
        tagged: report.metrics.tagged,
        fileSizeKB: report.metrics.fileSizeKB,
        skillsFound: report.extraction.pdftotext.skills,
        bulletsFound: report.extraction.pdftotext.bullets,
        headingsFound: report.extraction.pdftotext.headings,
        failures: report.failures.length,
      });
    }
  }

  const results = {
    date: '2026-10-20',
    openResumeCommit: OPENRESUME_COMMIT,
    renders: { count: timings.length, wallMsMedian: median(timings.map((t) => t.wallMs)), wallMsMax: Math.max(...timings.map((t) => t.wallMs)), browserMsMedian: median(timings.flatMap((t) => (t.browserMs ? [t.browserMs] : []))) },
    cv: cvRows,
    letters: letterRows,
    letterDocx: letterDocxRows,
    extra,
    services,
    baseline,
  };
  await writeOut(OUT, 'results.json', JSON.stringify(results, null, 2));

  const failedPdf = cvRows.filter((r) => !r.pdf.ok).length;
  const failedDocx = cvRows.filter((r) => !r.docx.ok).length;
  const failedLetters = letterRows.filter((r) => !r.ok).length;
  // The ATS proxy must read every single-column US CV completely. Two-column and German CVs are reported, not gated: OpenResume documents that it handles single-column English only.
  const proxyFailures = cvRows.filter((r) => {
    if (r.pdf.fixture !== 'us-one-page') return false;
    const o = r.openResume;
    return !o || !o.name || !o.email || !o.phone || o.jobs.matched < o.jobs.total || o.bullets.matched < o.bullets.total || o.skills.matched < o.skills.total;
  });
  for (const row of proxyFailures) console.log(`FAIL ats-proxy ${row.pdf.fixture}__${row.pdf.templateId}`);
  const failedLetterDocx = letterDocxRows.filter((r) => !r.ok).length;
  const failedExtra = proxyFailures.length + failedLetterDocx + extra.filter((r) => !r.ok).length + services.filter((s) => !s.ok).length;
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
