import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Where LibreOffice's `soffice` is. The SOFFICE environment variable wins; then the macOS app bundle; then
 * whatever `soffice` the PATH finds (Linux, a Homebrew cask link). A missing LibreOffice is a loud error
 * with the fix in it: the DOCX round trip is a gate, never something skipped.
 */
export function sofficePath(): string {
  const candidates = [process.env.SOFFICE, '/Applications/LibreOffice.app/Contents/MacOS/soffice'].filter((p): p is string => Boolean(p));
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  try {
    const found = execFileSync('which', ['soffice'], { encoding: 'utf8' }).trim();
    if (found) return found;
  } catch {
    // not on the PATH
  }
  throw new Error(
    `LibreOffice (soffice) was not found. Install it (brew install --cask libreoffice) or set SOFFICE to its path. Looked at: ${candidates.join(', ') || '(SOFFICE unset)'} and PATH.`,
  );
}
