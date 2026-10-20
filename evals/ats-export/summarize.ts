/**
 * Prints the before and after numbers from results.json and the baseline PDFs,
 * as the tables the write-up quotes.
 *   npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/summarize.ts
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CV_FIXTURES, TEMPLATE_IDS } from './fixtures';
import { REPO_ROOT } from './lib/render';
import { parseWithOpenResume, scoreOpenResume } from './lib/openresume';
import { pdftotext } from './lib/poppler';
import { expectationsFor } from './lib/expect';

const RAW = join(REPO_ROOT, 'evals', 'results', '2026-10-20-ats-export', 'raw');

/** Skills the old templates actually painted: groups and items were cut with .slice() (render-caps.ts on main). */
function oldVisibleSkills(templateId: string, groups: number[]): number {
  const groupCap = templateId === 'modern-professional' || templateId === 'german-ats' ? Infinity : 5;
  return groups.slice(0, groupCap).reduce((sum, items) => sum + Math.min(items, 5), 0);
}

async function main() {
  const results = JSON.parse(await readFile(join(RAW, 'results.json'), 'utf8'));
  type Extraction = { skills: string; bullets: string; headings: string; pairingFailures: string[] };
  type CvRow = {
    pdf: { fixture: string; templateId: string; metrics: { fileSizeKB: number; tagged: boolean; title: string; fonts: Array<{ embedded: boolean; unicode: boolean }> }; extraction: Record<'pdftotext' | 'pdftotextRaw' | 'pdfjs', Extraction> };
    openResume: { name: boolean; email: boolean; phone: boolean; jobs: { matched: number; total: number }; bullets: { matched: number; total: number }; skills: { matched: number; total: number } };
  };
  const cv = results.cv as CvRow[];

  const rows: string[] = [];
  const pct = (a: number, b: number) => `${a}/${b}`;

  // Text layer and tagging.
  const baseline = results.baseline as Array<{ name: string; pages: number; textChars: number; tagged: boolean; fileSizeKB: number; skillsFound: string; bulletsFound: string }>;
  const avg = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) / Math.max(1, values.length));
  rows.push(`PDF size, mean KB: before ${avg(baseline.map((b) => b.fileSizeKB))}, after ${avg(cv.map((r) => r.pdf.metrics.fileSizeKB))}`);
  rows.push(`Text layer (non-space characters), mean: before ${avg(baseline.map((b) => b.textChars))}, after n/a (see extraction counts)`);
  rows.push(`Tagged PDFs: before ${pct(baseline.filter((b) => b.tagged).length, baseline.length)}, after ${pct(cv.filter((r) => r.pdf.metrics.tagged).length, cv.length)}`);
  rows.push(`PDFs with real metadata title (not blank/URL): after ${pct(cv.filter((r) => r.pdf.metrics.title && !/about:blank/.test(r.pdf.metrics.title)).length, cv.length)}`);
  rows.push(`Fonts embedded with Unicode map: after ${pct(cv.filter((r) => r.pdf.metrics.fonts.every((f) => f.embedded && f.unicode)).length, cv.length)}`);

  // Extraction per tool, after.
  for (const tool of ['pdftotext', 'pdftotextRaw', 'pdfjs'] as const) {
    const sk = cv.map((r) => r.pdf.extraction[tool].skills.split('/').map(Number));
    const bu = cv.map((r) => r.pdf.extraction[tool].bullets.split('/').map(Number));
    const he = cv.map((r) => r.pdf.extraction[tool].headings.split('/').map(Number));
    const sum = (list: number[][], i: 0 | 1) => list.reduce((a, b) => a + b[i], 0);
    rows.push(`${tool}: skills ${sum(sk, 0)}/${sum(sk, 1)}, bullets ${sum(bu, 0)}/${sum(bu, 1)}, headings ${sum(he, 0)}/${sum(he, 1)}, jobs with title+employer+dates together ${cv.filter((r) => r.pdf.extraction[tool].pairingFailures.length === 0).length}/${cv.length} CVs`);
  }

  // Before: the baseline PDFs through pdftotext.
  let bSkills = [0, 0];
  let bBullets = [0, 0];
  for (const b of baseline) {
    const s = b.skillsFound.split('/').map(Number);
    const u = b.bulletsFound.split('/').map(Number);
    bSkills = [bSkills[0] + s[0], bSkills[1] + s[1]];
    bBullets = [bBullets[0] + u[0], bBullets[1] + u[1]];
  }
  rows.push(`Baseline pdftotext: skills ${bSkills[0]}/${bSkills[1]}, bullets ${bBullets[0]}/${bBullets[1]}`);

  // Skills painted on the over-cap fixture, before and after.
  const over = CV_FIXTURES.find((f) => f.name === 'over-cap')!.data;
  const groups = over.skills.map((g) => g.items.length);
  const total = groups.reduce((a, b) => a + b, 0);
  for (const id of TEMPLATE_IDS) rows.push(`over-cap skills on the page, ${id}: before ${oldVisibleSkills(id, groups)}/${total}, after ${total}/${total}`);

  // OpenResume: before and after, US one-page fixture.
  rows.push('OpenResume ATS proxy, us-one-page (name, email, phone, jobs, bullets, skills):');
  const usFixture = CV_FIXTURES.find((f) => f.name === 'us-one-page')!.data;
  for (const id of TEMPLATE_IDS) {
    const after = cv.find((r) => r.pdf.fixture === 'us-one-page' && r.pdf.templateId === id)!.openResume;
    const bytes = new Uint8Array(await readFile(join(RAW, 'baseline', `us-one-page__${id}.pdf`)));
    let before = 'parse failed';
    try {
      const score = scoreOpenResume(await parseWithOpenResume(bytes), usFixture);
      before = `${score.name ? 'name' : '-'} ${score.email ? 'email' : '-'} ${score.phone ? 'phone' : '-'} jobs ${score.jobs.matched}/${score.jobs.total} bullets ${score.bullets.matched}/${score.bullets.total} skills ${score.skills.matched}/${score.skills.total}`;
    } catch {
      // keep "parse failed"
    }
    rows.push(`  ${id}: before [${before}] after [${after.name ? 'name' : '-'} ${after.email ? 'email' : '-'} ${after.phone ? 'phone' : '-'} jobs ${after.jobs.matched}/${after.jobs.total} bullets ${after.bullets.matched}/${after.bullets.total} skills ${after.skills.matched}/${after.skills.total}]`);
  }

  // Dashes in dates, before: every old template used an en dash between the dates (source scan of main).
  const exp = expectationsFor(usFixture);
  rows.push(`Date range style: before "Mar 2022 – Present" (en dash, all 6 templates), after "${exp.jobs[0].dateRange}"`);
  rows.push(`Renders: ${results.renders.count}, wall median ${results.renders.wallMsMedian} ms, max ${results.renders.wallMsMax} ms, browser time median ${results.renders.browserMsMedian} ms`);
  console.log(rows.join('\n'));
  void pdftotext;
}

main();
