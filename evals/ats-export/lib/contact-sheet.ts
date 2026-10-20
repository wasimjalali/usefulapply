import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';

const run = promisify(execFile);

/** Page images of a PDF at `dpi`, as PNG buffers in page order. */
export async function pdfPagePngs(pdfPath: string, dpi: number): Promise<Buffer[]> {
  const dir = await mkdtemp(join(tmpdir(), 'pdfpages-'));
  await run('pdftoppm', ['-r', String(dpi), '-png', pdfPath, join(dir, 'p')]);
  const files = (await readdir(dir)).filter((file) => file.endsWith('.png')).sort();
  return Promise.all(files.map((file) => readFile(join(dir, file))));
}

/** Lays the pages of many PDFs out in a grid, one row per PDF, and returns a PNG. */
export async function contactSheet(rows: Array<{ label: string; pdfPath: string }>, dpi = 45): Promise<Buffer> {
  const pages = await Promise.all(rows.map(async (row) => ({ ...row, pngs: await pdfPagePngs(row.pdfPath, dpi) })));
  const metas = await Promise.all(pages.flatMap((row) => row.pngs.map((png) => sharp(png).metadata())));
  const cellW = Math.max(...metas.map((m) => m.width ?? 0)) + 8;
  const cellH = Math.max(...metas.map((m) => m.height ?? 0)) + 22;
  const cols = Math.max(...pages.map((row) => row.pngs.length));
  const composites: sharp.OverlayOptions[] = [];
  for (let r = 0; r < pages.length; r++) {
    const labelSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW * cols}" height="20"><text x="4" y="14" font-family="Arial" font-size="12" fill="#222">${pages[r].label.replace(/&/g, '&amp;')}</text></svg>`,
    );
    composites.push({ input: labelSvg, left: 0, top: r * cellH });
    for (let c = 0; c < pages[r].pngs.length; c++) {
      composites.push({ input: pages[r].pngs[c], left: c * cellW + 4, top: r * cellH + 20 });
    }
  }
  return sharp({ create: { width: cellW * cols, height: cellH * pages.length, channels: 3, background: '#dddddd' } })
    .composite(composites)
    .png()
    .toBuffer();
}
