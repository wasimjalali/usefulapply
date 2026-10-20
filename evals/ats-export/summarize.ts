/**
 * Prints the before and after numbers from results.json, as the tables the
 * write-up quotes. Reads the scratch run by default, the committed results with
 * `--write` (or ATS_EVAL_OUT to point at another folder).
 *   npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/summarize.ts [--write]
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CV_FIXTURES, TEMPLATE_IDS } from './fixtures';
import { COMMITTED_RAW, RUN_DIR } from './lib/render';
import { expectationsFor, hasToken, norm } from './lib/expect';
import { extractText } from './lib/ats-proxies';

type Extraction = { skills: string; bullets: string; contact: string; headings: string; pairingFailures: string[]; nonAsciiLost: string[] };
const TOOLS = ['pdftotext', 'pdftotextRaw', 'pdfjs', 'tika', 'pymupdf', 'pdfminer'] as const;
type Tool = (typeof TOOLS)[number];
type Scored = { name?: boolean; email?: boolean; phone?: boolean; jobs: { matched: number; total: number }; bullets: { matched: number; total: number }; skills: { matched: number; total: number } };

/** Skills the old templates painted: groups and items were cut with .slice() (render-caps.ts on main). Computed from those constants, not measured: the baseline PDFs are pictures with no text to count. */
function oldVisibleSkills(templateId: string, groups: number[]): number {
  const groupCap = templateId === 'modern-professional' || templateId === 'german-ats' ? Infinity : 5;
  return groups.slice(0, groupCap).reduce((sum, items) => sum + Math.min(items, 5), 0);
}

const frac = (value: string) => value.split('/').map(Number);
const pct = (a: number, b: number) => (b === 0 ? 'n/a' : `${a}/${b}`);

async function main() {
  const results = JSON.parse(await readFile(join(RUN_DIR, 'results.json'), 'utf8'));
  type CvRow = {
    pdf: { fixture: string; templateId: string; ok: boolean; metrics: { fileSizeKB: number; tagged: boolean; pages: number; title: string; fonts: Array<{ embedded: boolean; unicode: boolean }> }; extraction: Record<Tool, Extraction> };
    docx: { ok: boolean };
    openResume: Scored | null;
    ai: Scored | null;
    renders?: number;
  };
  const cv = results.cv as CvRow[];

  const baseline = results.baseline as Array<{ name: string; textChars: number; tagged: boolean; fileSizeKB: number; extraction: Record<Tool, Extraction>; openResume: Scored | null; ai: Scored; tikaSkillsToken: string }>;
  const rows: string[] = [];
  const avg = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) / Math.max(1, values.length));

  rows.push(`CVs: ${cv.length} PDFs and DOCX (${CV_FIXTURES.length} fixtures); baseline PDFs: ${baseline.length}`);
  rows.push(`PDF pass: ${cv.filter((r) => r.pdf.ok).length}/${cv.length}, DOCX pass: ${cv.filter((r) => r.docx.ok).length}/${cv.length}`);
  rows.push(`Mean PDF size KB: before ${avg(baseline.map((b) => b.fileSizeKB))}, after ${avg(cv.map((r) => r.pdf.metrics.fileSizeKB))}`);
  rows.push(`Text layer (non-space characters), mean: before ${avg(baseline.map((b) => b.textChars))}`);
  rows.push(`Tagged PDFs: before ${pct(baseline.filter((b) => b.tagged).length, baseline.length)}, after ${pct(cv.filter((r) => r.pdf.metrics.tagged).length, cv.length)}`);

  rows.push('\nField accuracy per extractor, all fixtures and templates (skills, bullets, headings found / total; jobs with title+employer+dates together):');
  for (const tool of TOOLS) {
    const sum = (list: CvRow[], key: 'skills' | 'bullets' | 'headings') => list.reduce((a, r) => { const [f, t] = frac(r.pdf.extraction[tool][key]); return [a[0] + f, a[1] + t]; }, [0, 0]);
    const after = [sum(cv, 'skills'), sum(cv, 'bullets'), sum(cv, 'headings')];
    const bsum = (key: 'skills' | 'bullets' | 'headings') => baseline.reduce((a, b) => { const [f, t] = frac(b.extraction[tool][key]); return [a[0] + f, a[1] + t]; }, [0, 0]);
    const before = [bsum('skills'), bsum('bullets'), bsum('headings')];
    const fmt = (x: number[][]) => `skills ${x[0][0]}/${x[0][1]}, bullets ${x[1][0]}/${x[1][1]}, headings ${x[2][0]}/${x[2][1]}`;
    const paired = cv.filter((r) => r.pdf.extraction[tool].pairingFailures.length === 0).length;
    const umlauts = cv.filter((r) => r.pdf.extraction[tool].nonAsciiLost.length === 0).length;
    rows.push(`  ${tool.padEnd(13)} before: ${fmt(before)} | after: ${fmt(after)}, pairing ${paired}/${cv.length}, umlauts kept ${umlauts}/${cv.length}`);
  }

  const score = (list: Array<Scored | null>) => {
    const total = (key: 'jobs' | 'bullets' | 'skills') => list.reduce((a, s) => [a[0] + (s?.[key].matched ?? 0), a[1] + (s?.[key].total ?? 0)], [0, 0]);
    const contact = list.filter((s) => s?.name && s.email && s.phone).length;
    return `contact ${contact}/${list.length}, jobs ${total('jobs').join('/')}, bullets ${total('bullets').join('/')}, skills ${total('skills').join('/')}`;
  };
  rows.push('\nOpenResume parser (single-column English only), all rows:');
  rows.push(`  before: ${score(baseline.map((b) => b.openResume))}`);
  rows.push(`  after:  ${score(cv.map((r) => r.openResume))}`);
  rows.push('AI parser stand-in (Tika text into Workers AI gpt-oss-120b), all rows:');
  rows.push(`  before (the old PDFs' OCR text, read by Tika with Tesseract): ${score(baseline.map((b) => b.ai))}`);
  rows.push(`  after:  ${score(cv.map((r) => r.ai))}`);
  const usAi = cv.filter((r) => ['us-one-page', 'us-personal'].includes(r.pdf.fixture));
  rows.push(`  after, English one-page CVs only (gated): ${score(usAi.map((r) => r.ai))}`);
  const u = results.proxies.aiUsage;
  rows.push(`  cost: ${u.calls} calls, ${u.promptTokens} in / ${u.completionTokens} out tokens, $${u.costUsd.toFixed(3)} at list price`);

  // Tika's "before" numbers, strict and token mode. They are scored against the NEW standard headings (Summary, Experience, ...),
  // not the old ones the pictures actually print (PROFESSIONAL SUMMARY, CORE COMPETENCIES), so the headings figure understates what OCR read.
  {
    const strict = baseline.reduce((a, b) => { const [f, t] = frac(b.extraction.tika.skills); return [a[0] + f, a[1] + t]; }, [0, 0]);
    const token = baseline.reduce((a, b) => { const [f, t] = frac(b.tikaSkillsToken); return [a[0] + f, a[1] + t]; }, [0, 0]);
    const heads = baseline.reduce((a, b) => { const [f, t] = frac(b.extraction.tika.headings); return [a[0] + f, a[1] + t]; }, [0, 0]);
    rows.push(`\nTika on the old PDFs (OCR): skills strict (one "Label: a, b, c" line per group) ${strict[0]}/${strict[1]}, skills as whole tokens ${token[0]}/${token[1]}, headings ${heads[0]}/${heads[1]} (scored against the new standard headings)`);
  }

  // Title, employer and dates adjacent (within two lines of the title), per extractor and template, over all fixtures.
  {
    rows.push('\nTitle, employer and dates adjacent, CVs passing per extractor and template (all fixtures that run the template):');
    const templates = [...new Set(cv.map((r) => r.pdf.templateId))];
    for (const tool of TOOLS) {
      const parts = templates.map((id) => {
        const rowsFor = cv.filter((r) => r.pdf.templateId === id);
        return `${id} ${rowsFor.filter((r) => r.pdf.extraction[tool].pairingFailures.length === 0).length}/${rowsFor.length}`;
      });
      rows.push(`  ${tool.padEnd(13)} ${parts.join(', ')}`);
    }
  }

  // The AI parser's misses, for triage.
  {
    const misses = cv.filter((r) => (r.ai as unknown as { missedJobs?: string[]; missedSkills?: string[] } | null)?.missedJobs?.length || (r.ai as unknown as { missedSkills?: string[] } | null)?.missedSkills?.length);
    rows.push(`\nAI parser misses (${misses.length} CVs):`);
    for (const r of misses) {
      const a = r.ai as unknown as { missedJobs: string[]; missedSkills: string[] };
      rows.push(`  ${r.pdf.fixture}__${r.pdf.templateId}: jobs [${a.missedJobs.join('; ')}] skills [${a.missedSkills.join(', ')}]`);
    }
  }

  const over = CV_FIXTURES.find((f) => f.name === 'over-cap')!.data;
  const groups = over.skills.map((g) => g.items.length);
  const total = groups.reduce((a, b) => a + b, 0);
  rows.push('\nover-cap skills on the page (before = computed from the old .slice() caps, not measured; after = measured by every extractor):');
  for (const id of TEMPLATE_IDS) {
    const after = cv.find((r) => r.pdf.fixture === 'over-cap' && r.pdf.templateId === id)!;
    // The old PDFs are pictures. Tika runs Tesseract OCR on a page with no text layer, so its text is what an OCR-ing ATS would read from them.
    const ocr = norm(await extractText('tika', new Uint8Array(await readFile(join(COMMITTED_RAW, 'baseline', `over-cap__${id}.pdf`)))));
    const ocrSkills = over.skills.flatMap((g) => g.items).filter((skill) => hasToken(ocr, skill)).length;
    rows.push(`  ${id}: before ${oldVisibleSkills(id, groups)}/${total} (computed from the caps), ${ocrSkills}/${total} read by Tika with Tesseract OCR; after ${TOOLS.map((t) => `${t} ${after.pdf.extraction[t].skills}`).join(', ')}`);
  }

  rows.push('\nCover letters, before (today jsPDF) and after:');
  for (const b of results.baselineLetters as Array<{ name: string; ok: boolean; failures: string[]; pages: number; tagged: boolean; paper: string }>) {
    rows.push(`  before ${b.name}: ${b.paper}, tagged ${b.tagged}, ${b.failures.length} failed checks (${b.failures.slice(0, 3).join(' | ')})`);
  }
  for (const l of results.letters as Array<{ name: string; ok: boolean; failures: string[] }>) rows.push(`  after ${l.name}: ${l.ok ? 'pass' : `FAIL ${l.failures[0]}`}`);
  for (const l of results.letterDocx as Array<{ name: string; ok: boolean; measured?: Record<string, number> }>) rows.push(`  after ${l.name}: ${l.ok ? 'pass' : 'FAIL'} ${l.measured ? JSON.stringify(l.measured) : ''}`);

  const exp = expectationsFor(CV_FIXTURES.find((f) => f.name === 'us-one-page')!.data);
  rows.push(`\nDate range style: before "Mar 2022 – Present" (en dash, all 6 templates), after "${exp.jobs[0].dateRange}"`);
  rows.push(`Renders: ${results.renders.count}, wall median ${results.renders.wallMsMedian} ms, max ${results.renders.wallMsMax} ms, browser time median ${results.renders.browserMsMedian} ms`);
  console.log(rows.join('\n'));
}

main();
