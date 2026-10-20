import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function withTempFile<T>(bytes: Uint8Array, name: string, fn: (path: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'ats-'));
  const path = join(dir, name);
  await writeFile(path, bytes);
  return fn(path);
}

export type TextMode = 'reading-order' | 'raw' | 'layout';

/** pdftotext in reading order (default), content-stream order (raw) or layout mode. */
export async function pdftotext(bytes: Uint8Array, mode: TextMode): Promise<string> {
  return withTempFile(bytes, 'in.pdf', async (path) => {
    const args = mode === 'raw' ? ['-raw'] : mode === 'layout' ? ['-layout'] : [];
    const { stdout } = await run('pdftotext', [...args, '-enc', 'UTF-8', path, '-'], { maxBuffer: 32 * 1024 * 1024 });
    return stdout;
  });
}

export interface PdfInfo {
  pages: number;
  pageSizePts: { width: number; height: number };
  paperName: string;
  tagged: boolean;
  title: string;
  author: string;
  subject: string;
  producer: string;
  creator: string;
  fileSize: number;
  raw: string;
}

export async function pdfinfo(bytes: Uint8Array): Promise<PdfInfo> {
  return withTempFile(bytes, 'in.pdf', async (path) => {
    const { stdout } = await run('pdfinfo', [path]);
    const field = (name: string) => stdout.match(new RegExp(`^${name}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? '';
    const size = field('Page size').match(/([\d.]+) x ([\d.]+) pts(?: \((\w+)\))?/);
    return {
      pages: Number(field('Pages')),
      pageSizePts: { width: Number(size?.[1] ?? 0), height: Number(size?.[2] ?? 0) },
      paperName: size?.[3] ?? '',
      tagged: field('Tagged') === 'yes',
      title: field('Title'),
      author: field('Author'),
      subject: field('Subject'),
      producer: field('Producer'),
      creator: field('Creator'),
      fileSize: bytes.length,
      raw: stdout,
    };
  });
}

export interface PdfFontRow {
  name: string;
  type: string;
  embedded: boolean;
  unicode: boolean;
}

export async function pdffonts(bytes: Uint8Array): Promise<PdfFontRow[]> {
  return withTempFile(bytes, 'in.pdf', async (path) => {
    const { stdout } = await run('pdffonts', [path]);
    return stdout
      .split('\n')
      .slice(2)
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        // name type [encoding words...] emb sub uni objID gen
        const tail = parts.slice(-5);
        return { name: parts[0], type: parts.slice(1, -5).slice(0, 2).join(' '), embedded: tail[0] === 'yes', unicode: tail[2] === 'yes' };
      });
  });
}

/** Number of raster images in the PDF (the photo). */
export async function pdfImageCount(bytes: Uint8Array): Promise<number> {
  return withTempFile(bytes, 'in.pdf', async (path) => {
    const { stdout } = await run('pdfimages', ['-list', path]);
    return Math.max(0, stdout.split('\n').filter((line) => line.trim()).length - 2);
  });
}

/** Renders one page to a PNG buffer. */
export async function pdfPagePng(bytes: Uint8Array, page: number, dpi: number): Promise<Buffer> {
  return withTempFile(bytes, 'in.pdf', async (path) => {
    const out = join(path, '..', 'page');
    await run('pdftoppm', ['-r', String(dpi), '-f', String(page), '-l', String(page), '-png', '-singlefile', path, out]);
    const { readFile } = await import('node:fs/promises');
    return readFile(`${out}.png`);
  });
}
