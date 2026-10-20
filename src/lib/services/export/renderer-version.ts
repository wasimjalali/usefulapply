import { hashRendererSources, type HashDeps } from './renderer-source-hash';

/**
 * Bump only for a change that is not in any source file the hash covers (a hand-edited data table
 * outside those folders). Everything else changes the version by itself.
 */
export const RENDERER_REVISION = 3;

/**
 * The hash of every file that shapes an export (see renderer-source-hash.ts). next.config.ts computes it
 * at build time and bakes it in as RENDERER_SOURCE_HASH. Outside Next (the eval, scripts) Node reads the
 * same files from disk. Neither available is an error, never a silent constant: a cache that cannot tell
 * one renderer from the next would serve stale documents.
 */
function sourceHash(): string {
  const baked = process.env.RENDERER_SOURCE_HASH;
  if (baked) return baked;
  const load = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
  if (load) {
    try {
      const fs = load('node:fs') as HashDeps['fs'];
      const path = load('node:path') as HashDeps['path'] & { dirname(p: string): string };
      const crypto = load('node:crypto') as HashDeps['crypto'];
      // The repo root is the nearest folder above the working directory that has a package.json with the app's sources.
      let root = process.cwd();
      for (let i = 0; i < 6; i++) {
        try {
          fs.readdirSync(path.join(root, 'src/lib/services/export'), { withFileTypes: true });
          return hashRendererSources(root, { fs, path, crypto });
        } catch {
          root = path.dirname(root);
        }
      }
    } catch {
      // fall through to the error below
    }
  }
  throw new Error('RENDERER_SOURCE_HASH is not set. next.config.ts sets it at build time; outside Next run from the repo root.');
}

/**
 * In development the version also carries a per-process random value. The baked hash is computed when the dev
 * server starts, so a template edit made after that would otherwise be served from the cache as the old render;
 * a new value on every start (and on every module reload) means a dev export is never a stale one.
 */
const DEV_SUFFIX = process.env.NODE_ENV === 'development' ? `.dev${Math.random().toString(36).slice(2, 8)}` : '';

export const RENDERER_VERSION = `${RENDERER_REVISION}.${sourceHash()}${DEV_SUFFIX}`;
