/**
 * Visual parity: the canvas next to the exported PDF, for every template and
 * fixture. The canvas is the real template component in screen mode, bundled
 * and shown in headless Chromium with the same font files the app loads, at 96
 * dpi. The PDF is page 1 of the export at 96 dpi. Left to right in each image:
 * the canvas (the whole sheet), then every PDF page.
 *
 *   npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/parity.ts [outDir]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { CV_FIXTURES, templatesFor } from './fixtures';
import { pdfPagePngs } from './lib/contact-sheet';
import { COMMITTED_RAW, REPO_ROOT } from './lib/render';
import { fontFaceCssFromUrls } from '../../src/lib/cv-templates/fonts';
import { PRINT_BASE_CSS } from '../../src/lib/services/export/print-css';
import { PAPER_MM, getPrintSpec } from '../../src/lib/cv-templates/print-spec';

const WORK = join(REPO_ROOT, 'evals', 'ats-export', 'parity-work');

async function bundle(): Promise<string> {
  await mkdir(WORK, { recursive: true });
  const entry = join(WORK, 'entry.tsx');
  await writeFile(
    entry,
    `import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { CvTemplateSwitch } from '@/components/cv-templates/render';
(window as unknown as { mountCv: (data: unknown, templateId: string) => void }).mountCv = (data, templateId) => {
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  flushSync(() => createRoot(host).render(<CvTemplateSwitch data={data as never} templateId={templateId} />));
};
`,
  );
  const outfile = join(WORK, 'bundle.js');
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    outfile,
    jsx: 'automatic',
    nodePaths: [join(REPO_ROOT, 'node_modules')],
    alias: { '@': join(REPO_ROOT, 'src') },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'error',
  });
  return outfile;
}

async function main() {
  const out = process.argv[2] ?? process.env.PARITY_OUT ?? join(REPO_ROOT, 'verify', 'parity');
  const pdfDir = join(process.env.ATS_EVAL_OUT ?? COMMITTED_RAW, 'cv');
  await mkdir(out, { recursive: true });
  const script = await readFile(await bundle(), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 1 });
  // The app serves the fonts from /fonts; here the same files come from public/ through a route.
  await page.route('**/fonts/*.woff2', async (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop()!;
    await route.fulfill({ body: await readFile(join(REPO_ROOT, 'public', 'fonts', file)), contentType: 'font/woff2' });
  });
  await page.route('http://parity.invalid/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaceCssFromUrls('/fonts/')}\n${PRINT_BASE_CSS}\nbody{background:#fff}</style></head><body><div id="root"></div></body></html>`,
    }),
  );
  await page.goto('http://parity.invalid/');
  await page.addScriptTag({ content: script });

  const rows: Array<{ name: string; page1Diff: number }> = [];
  for (const fixture of CV_FIXTURES) {
    for (const templateId of templatesFor(fixture)) {
      await page.evaluate(([data, id]) => (window as unknown as { mountCv: (d: unknown, t: string) => void }).mountCv(data, id as string), [fixture.data, templateId] as const);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      const spec = getPrintSpec(templateId);
      const sheet = await page.locator('.cv-template').first().screenshot();
      const pdfPages = await pdfPagePngs(join(pdfDir, `${fixture.name}__${templateId}.pdf`), 96);

      // Page 1 against the matching top slice of the canvas, as a number to track.
      const pageHeightPx = Math.round((PAPER_MM[spec.paper].height / 25.4) * 96);
      const canvasTop = await sharp(sheet).extract({ left: 0, top: 0, width: Math.min((await sharp(sheet).metadata()).width ?? 0, Math.round((PAPER_MM[spec.paper].width / 25.4) * 96)), height: Math.min(pageHeightPx, (await sharp(sheet).metadata()).height ?? pageHeightPx) }).greyscale().raw().toBuffer({ resolveWithObject: true });
      const pdfTop = await sharp(pdfPages[0]).resize(canvasTop.info.width, canvasTop.info.height, { fit: 'fill' }).greyscale().raw().toBuffer();
      let diff = 0;
      for (let i = 0; i < pdfTop.length; i++) diff += Math.abs(pdfTop[i] - canvasTop.data[i]);
      rows.push({ name: `${fixture.name}__${templateId}`, page1Diff: Number((diff / pdfTop.length).toFixed(2)) });

      // Side by side: canvas, then each PDF page, on a grey ground.
      const gap = 16;
      const canvasMeta = await sharp(sheet).metadata();
      const metas = await Promise.all(pdfPages.map((p) => sharp(p).metadata()));
      const width = (canvasMeta.width ?? 0) + metas.reduce((sum, m) => sum + (m.width ?? 0) + gap, gap * 2);
      const height = Math.max(canvasMeta.height ?? 0, ...metas.map((m) => m.height ?? 0)) + gap * 2;
      const composites: sharp.OverlayOptions[] = [{ input: sheet, left: gap, top: gap }];
      let x = gap + (canvasMeta.width ?? 0) + gap;
      pdfPages.forEach((png, index) => {
        composites.push({ input: png, left: x, top: gap });
        x += (metas[index].width ?? 0) + gap;
      });
      await sharp({ create: { width, height, channels: 3, background: '#c9c9c9' } })
        .composite(composites)
        .png()
        .toFile(join(out, `${fixture.name}__${templateId}.png`));
      console.log(`${fixture.name}__${templateId}`, `canvas ${canvasMeta.width}x${canvasMeta.height}`, `pdf pages ${pdfPages.length}`, `page1 diff ${rows[rows.length - 1].page1Diff}`);
    }
  }
  await writeFile(join(out, 'parity-summary.json'), JSON.stringify(rows, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
