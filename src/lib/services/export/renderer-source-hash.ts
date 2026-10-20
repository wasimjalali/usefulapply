/**
 * A hash of every source file that shapes an export: the templates, the shared pieces, the CV and letter
 * and answers HTML, both DOCX builders, the PDF and render steps, the print CSS, the locale tables, the
 * helpers, and the bytes of every shipped font. It is computed at build time (next.config.ts bakes it into
 * the bundle as RENDERER_SOURCE_HASH), so any edit that can change an export changes the cache key without
 * anyone remembering to bump a number.
 *
 * Node's modules are injected instead of imported so this file stays out of the app bundle's import graph
 * and the same code can run from next.config.ts and from the eval.
 */

export interface HashDeps {
  fs: {
    readdirSync(path: string, options: { withFileTypes: true }): Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    readFileSync(path: string): Uint8Array;
  };
  path: { join(...parts: string[]): string };
  crypto: { createHash(algorithm: string): { update(data: string | Uint8Array): unknown; digest(encoding: 'hex'): string } };
}

/** Directories hashed whole, relative to the repo root. */
export const RENDERER_SOURCE_DIRS = [
  'src/components/cv-templates',
  'src/lib/cv-templates',
  'src/lib/services/export',
  'public/fonts',
] as const;

function walk(root: string, dir: string, deps: HashDeps, out: string[]) {
  for (const entry of deps.fs.readdirSync(deps.path.join(root, dir), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(root, relative, deps, out);
    else if (entry.isFile() && !/\.(test|spec)\.[tj]sx?$/.test(entry.name)) out.push(relative);
  }
}

export function hashRendererSources(root: string, deps: HashDeps): string {
  const files: string[] = [];
  for (const dir of RENDERER_SOURCE_DIRS) walk(root, dir, deps, files);
  files.sort();
  const hash = deps.crypto.createHash('sha256');
  for (const file of files) {
    hash.update(`${file}\n`);
    hash.update(deps.fs.readFileSync(deps.path.join(root, file)));
    hash.update('\n');
  }
  return hash.digest('hex').slice(0, 12);
}
