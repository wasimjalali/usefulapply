/**
 * Local ATS proxies. No real ATS is involved and no CV data goes to a third
 * party: every extractor here runs on this machine. They stand in for the text
 * layer an ATS reads before it parses fields.
 *
 *   tika      Apache Tika, the extraction engine inside many ATS and search
 *             products. Reads the content stream in document order (like pdf.js).
 *   pymupdf   PyMuPDF (MuPDF), `page.get_text()` with its defaults: blocks in file order.
 *   pdfminer  pdfminer.six with its layout analysis (text boxes in reading order).
 *
 * Plus pdf.js and pdftotext, which the PDF checks already use. Setup:
 * `bash evals/ats-export/ats/setup.sh` (venv, pinned Tika jar with a checked
 * SHA-512, a JDK).
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { withTempFile } from './poppler';

const run = promisify(execFile);
const ROOT = join(__dirname, '..');

export const EXTRACTORS = ['tika', 'pymupdf', 'pdfminer'] as const;
export type Extractor = (typeof EXTRACTORS)[number];

export const TIKA_VERSION = '3.3.3';
const TIKA_JAR = join(ROOT, 'vendor', 'tika', `tika-app-${TIKA_VERSION}.jar`);
const PYTHON = join(ROOT, '.venv', 'bin', 'python');
const EXTRACT_PY = join(ROOT, 'ats', 'extract.py');

function javaBin(): string {
  if (process.env.JAVA_BIN) return process.env.JAVA_BIN;
  for (const candidate of ['/opt/homebrew/opt/openjdk@21/bin/java', '/opt/homebrew/opt/openjdk/bin/java', '/usr/local/opt/openjdk/bin/java']) {
    if (existsSync(candidate)) return candidate;
  }
  return 'java';
}

export function proxiesAvailable(): string | null {
  if (!existsSync(TIKA_JAR)) return `Tika jar missing (${TIKA_JAR}). Run: bash evals/ats-export/ats/setup.sh`;
  if (!existsSync(PYTHON)) return `Python venv missing (${PYTHON}). Run: bash evals/ats-export/ats/setup.sh`;
  return null;
}

/** Extracts the text of one PDF with one proxy. Pages are separated by a form feed. A failure throws: an extractor that cannot run is a failed check, never a pass. */
export async function extractText(extractor: Extractor, bytes: Uint8Array): Promise<string> {
  const missing = proxiesAvailable();
  if (missing) throw new Error(missing);
  return withTempFile(bytes, 'cv.pdf', async (path) => {
    if (extractor === 'tika') {
      // XHTML output keeps the page boundaries (one <div class="page"> each), which plain text drops.
      const { stdout } = await run(javaBin(), ['-Djava.awt.headless=true', '-jar', TIKA_JAR, '--xml', '--encoding=UTF-8', path], { maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
      return tikaPages(stdout);
    }
    const { stdout } = await run(PYTHON, [EXTRACT_PY, extractor, path], { maxBuffer: 64 * 1024 * 1024, timeout: 120_000, encoding: 'utf8' });
    return stdout;
  });
}

/** The text of Tika's XHTML, one block per page joined with a form feed. */
function tikaPages(xhtml: string): string {
  const body = xhtml.slice(xhtml.indexOf('<body>'));
  const decode = (text: string) =>
    text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&amp;/g, '&');
  return body
    .split('<div class="page">')
    .slice(1)
    .map((page) => decode(page.replace(/<\/(p|div|li)>/g, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n'))
    .join('\f');
}

export async function extractAll(bytes: Uint8Array): Promise<Record<Extractor, string>> {
  const texts = await Promise.all(EXTRACTORS.map((extractor) => extractText(extractor, bytes)));
  return Object.fromEntries(EXTRACTORS.map((extractor, index) => [extractor, texts[index]])) as Record<Extractor, string>;
}
