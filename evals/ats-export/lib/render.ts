import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FontFileLoader } from '../../../src/lib/cv-templates/fonts';
import type { BrowserRunBinding } from '../../../src/lib/services/export/pdf';

export const REPO_ROOT = join(__dirname, '..', '..', '..');
export const WORKER_URL = process.env.ATS_EVAL_WORKER_URL ?? 'http://localhost:8793';

export const loadFontFromDisk: FontFileLoader = async (file) =>
  new Uint8Array(await readFile(join(REPO_ROOT, 'public', 'fonts', file)));

export interface RenderTiming {
  wallMs: number;
  browserMs: number | null;
}

/**
 * A BrowserRunBinding that talks to evals/ats-export/render-worker, which holds
 * the real Browser Run binding (wrangler dev, remote). It is the production
 * quickAction call with one HTTP hop in front.
 */
export function workerBinding(timings: RenderTiming[] = []): BrowserRunBinding {
  return {
    async quickAction(_action, body) {
      const started = Date.now();
      const res = await fetch(WORKER_URL, { method: 'POST', body: JSON.stringify(body) });
      const bytes = await res.arrayBuffer();
      timings.push({
        wallMs: Date.now() - started,
        browserMs: Number(res.headers.get('x-browser-ms-used')) || null,
      });
      return new Response(bytes, { status: res.status, headers: res.headers });
    },
  };
}

export async function ensureDir(path: string): Promise<string> {
  await mkdir(path, { recursive: true });
  return path;
}

export async function writeOut(dir: string, name: string, data: Uint8Array | string): Promise<string> {
  await ensureDir(dir);
  const path = join(dir, name);
  await writeFile(path, data);
  return path;
}
