import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
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
      let res: Response | null = null;
      for (let attempt = 0; attempt < 4 && !res; attempt++) {
        try {
          res = await fetch(WORKER_URL, { method: 'POST', body: JSON.stringify(body) });
        } catch {
          // The detached worker can be reaped between runs; bring it back and retry.
          await ensureWorker();
        }
      }
      if (!res) throw new Error('The Browser Run eval worker is not answering.');
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

async function workerAlive(): Promise<boolean> {
  try {
    const res = await fetch(WORKER_URL, { method: 'POST', body: JSON.stringify({ html: '<p>ping</p>' }), signal: AbortSignal.timeout(20_000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Makes sure the Browser Run eval worker answers on 8793, starting it when it
 * does not. It runs detached so it outlives this script and a second run
 * reuses it.
 */
export async function ensureWorker(): Promise<void> {
  if (await workerAlive()) return;
  const log = openSync(join(REPO_ROOT, 'evals', 'ats-export', '.worker.log'), 'a');
  const child = spawn(
    'npx',
    ['wrangler', 'dev', '--config', 'evals/ats-export/render-worker/wrangler.jsonc', '--port', new URL(WORKER_URL).port || '8793'],
    { cwd: REPO_ROOT, detached: true, stdio: ['ignore', log, log] },
  );
  child.unref();
  closeSync(log);
  for (let i = 0; i < 45; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (await workerAlive()) return;
  }
  throw new Error('The Browser Run eval worker did not start. See evals/ats-export/.worker.log.');
}
