/**
 * Baseline: today's export, before this work. The browser export on main
 * (html2canvas takes a picture of the rendered template, jsPDF slices it into
 * pages) is rebuilt from the git history at BASELINE_COMMIT, bundled with
 * esbuild, and run in headless Chromium for every fixture and template. The
 * PDFs it produces are then put through the same checks as the new export.
 *
 *   npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/baseline.ts <outDir>
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { CV_FIXTURES, DIN_LETTER, templatesFor, US_LETTER } from './fixtures';
import { COMMITTED_RAW, REPO_ROOT, writeOut } from './lib/render';
import type { StructuredCoverLetter } from '../../src/lib/cover-letter/contract';
import { PRINT_BASE_CSS } from '../../src/lib/services/export/print-css';

const run = promisify(execFile);

/** main at the start of PR 3: the last commit with the old templates and the html2canvas export. */
export const BASELINE_COMMIT = '8bc7dda5';

const WORK = join(REPO_ROOT, 'evals', 'ats-export', 'baseline-work');

async function prepareSources(): Promise<string> {
  const src = join(WORK, 'src');
  if (existsSync(join(src, 'lib', 'utils', 'cover-letter-export.ts')) && existsSync(join(WORK, 'bundle.js'))) return join(WORK, 'bundle.js');
  await mkdir(WORK, { recursive: true });
  const tar = join(WORK, 'baseline.tar');
  await run('git', [
    'archive', '--format=tar', '-o', tar, BASELINE_COMMIT,
    'src/components/cv-templates', 'src/lib/cv-templates', 'src/lib/utils/cv-pdf.ts', 'src/lib/utils/download-pdf.ts', 'src/lib/utils/cover-letter-export.ts',
  ], { cwd: REPO_ROOT });
  await run('tar', ['-xf', tar, '-C', WORK]);
  await writeFile(join(WORK, 'settings-stub.ts'), 'export const openSettings = () => {};\n');
  // The letter exporter also builds a DOCX; the PDF path never touches it, and docx needs Node's buffer module.
  await writeFile(join(WORK, 'docx-stub.ts'), 'export class Document {}\nexport class Paragraph {}\nexport class TextRun {}\nexport const Packer = {};\n');
  await writeFile(
    join(WORK, 'entry.tsx'),
    `import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { CVTemplateRenderer } from '@/components/cv-templates';
import { generateCvPdfBlob } from '@/lib/utils/cv-pdf';
import { buildCoverLetterPdfBlob } from '@/lib/utils/cover-letter-export';

declare global { interface Window { renderBaseline: (data: unknown, templateId: string) => Promise<string>; renderBaselineLetter: (letter: unknown) => Promise<string>; } }

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

window.renderBaselineLetter = (letter) => toBase64(buildCoverLetterPdfBlob(letter as never));

window.renderBaseline = async (data, templateId) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const wrapper = document.createElement('div');
  host.appendChild(wrapper);
  flushSync(() => createRoot(wrapper).render(<CVTemplateRenderer data={data as never} templateId={templateId} />));
  await new Promise((resolve) => setTimeout(resolve, 150));
  const blob = await generateCvPdfBlob(wrapper, { templateId });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  host.remove();
  return btoa(binary);
};
`,
  );
  await build({
    entryPoints: [join(WORK, 'entry.tsx')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    outfile: join(WORK, 'bundle.js'),
    jsx: 'automatic',
    nodePaths: [join(REPO_ROOT, 'node_modules')],
    alias: { '@/store/useSettingsStore': join(WORK, 'settings-stub.ts'), docx: join(WORK, 'docx-stub.ts'), '@': src },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'error',
  });
  return join(WORK, 'bundle.js');
}

/**
 * Today's letter: the agent writes the whole letter into `body` and jsPDF prints
 * it line by line (the body-only format). Built from the same fields the new
 * export gets, in the order a letter reads.
 */
function legacyLetter(letter: StructuredCoverLetter) {
  const lines = [
    letter.sender.name,
    ...letter.sender.addressLines,
    letter.sender.phone ?? '',
    letter.sender.email ?? '',
    '',
    letter.date,
    '',
    letter.recipient.companyName ?? '',
    letter.recipient.contactPerson ?? '',
    letter.recipient.department ?? '',
    ...letter.recipient.addressLines,
    '',
    letter.salutation,
    '',
    ...letter.paragraphs.flatMap((paragraph) => [paragraph, '']),
    letter.closing,
    letter.signatureName,
  ];
  return {
    applicantAddress: { name: '', street: '', city: '', country: '', phone: '', email: '' },
    date: letter.date,
    companyAddress: { companyName: letter.recipient.companyName ?? '' },
    salutation: letter.salutation,
    body: lines.join('\n'),
    closing: letter.closing,
    signatureName: letter.signatureName,
  };
}

async function main() {
  const out = process.argv[2] ?? join(COMMITTED_RAW, 'baseline');
  const bundle = await prepareSources();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${PRINT_BASE_CSS}</style></head><body></body></html>`);
  await page.addScriptTag({ content: await readFile(bundle, 'utf8') });
  const results: Array<{ name: string; bytes: number; ms: number }> = [];
  for (const fixture of CV_FIXTURES) {
    for (const templateId of templatesFor(fixture)) {
      const started = Date.now();
      const base64 = await page.evaluate(
        ([data, id]) => (window as unknown as { renderBaseline: (d: unknown, t: string) => Promise<string> }).renderBaseline(data, id as string),
        [fixture.data, templateId] as const,
      );
      const bytes = Buffer.from(base64, 'base64');
      const name = `${fixture.name}__${templateId}.pdf`;
      await writeOut(out, name, bytes);
      results.push({ name, bytes: bytes.length, ms: Date.now() - started });
      console.log(name, bytes.length, `${Date.now() - started}ms`);
    }
  }
  for (const [name, letter] of [['letter-us', US_LETTER], ['letter-din', DIN_LETTER]] as const) {
    const base64 = await page.evaluate((l) => (window as unknown as { renderBaselineLetter: (x: unknown) => Promise<string> }).renderBaselineLetter(l), legacyLetter(letter));
    await writeOut(join(out, 'letters'), `${name}.pdf`, Buffer.from(base64, 'base64'));
    console.log(`${name}.pdf (today's jsPDF letter)`);
  }
  await writeOut(out, 'baseline-summary.json', JSON.stringify({ commit: BASELINE_COMMIT, results }, null, 2));
  await browser.close();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
