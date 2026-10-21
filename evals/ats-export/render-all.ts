/**
 * Renders every fixture through every template (PDF and DOCX) and both letter
 * layouts, through the real Browser Run binding, into one folder. Used to look
 * at the output and as the first stage of the eval.
 *   npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/render-all.ts <outDir>
 */
import { join } from 'node:path';
import { CV_FIXTURES, DIN_LETTER, templatesFor, US_LETTER } from './fixtures';
import { resolveExport, exportCacheHash } from '../../src/lib/services/export/resolve';
import { renderExport } from '../../src/lib/services/export/render';
import type { ExportFormat, ExportKit } from '../../src/lib/services/export/types';
import { loadFontFromDisk, workerBinding, writeOut, type RenderTiming } from './lib/render';

export function kitFor(overrides: Partial<ExportKit>): ExportKit {
  return {
    applicationId: 'eval',
    jobTitle: '',
    company: 'Harbor Freight Technologies',
    templateId: null,
    applicantName: '',
    cv: null,
    originalCv: null,
    coverLetter: null,
    emails: [],
    answers: [],
    photoDataUri: null,
    ...overrides,
  };
}

async function main() {
  const out = process.argv[2] ?? join(process.cwd(), 'verify-render');
  const timings: RenderTiming[] = [];
  const deps = { browser: workerBinding(timings), loadFont: loadFontFromDisk };
  const summary: Array<Record<string, unknown>> = [];

  for (const fixture of CV_FIXTURES) {
    for (const templateId of templatesFor(fixture)) {
      for (const format of ['cv_pdf', 'cv_docx'] as ExportFormat[]) {
        const photo = fixture.data.personal.photoUrl ?? null;
        const kit = kitFor({ cv: fixture.data, originalCv: fixture.data, applicantName: fixture.data.personal.fullName, photoDataUri: photo });
        const resolved = resolveExport(kit, format, { templateId });
        const started = Date.now();
        const rendered = await renderExport(resolved, deps);
        const name = `${fixture.name}__${templateId}.${format === 'cv_pdf' ? 'pdf' : 'docx'}`;
        await writeOut(join(out, 'cv'), name, rendered.bytes);
        summary.push({ name, bytes: rendered.bytes.length, ms: Date.now() - started, hash: (await exportCacheHash(resolved)).slice(0, 10) });
        console.log(name, rendered.bytes.length, `${Date.now() - started}ms`);
      }
    }
  }

  for (const [name, letter, templateId] of [
    ['letter-us-structured', US_LETTER, 'premium-ats'],
    ['letter-din-structured', DIN_LETTER, 'german-ats'],
  ] as const) {
    for (const format of ['cover_letter_pdf', 'cover_letter_docx'] as ExportFormat[]) {
      const kit = kitFor({ applicantName: letter.sender.name, coverLetter: { structured: letter, legacyText: null } });
      const resolved = resolveExport(kit, format, { templateId });
      const rendered = await renderExport(resolved, deps);
      await writeOut(join(out, 'letters'), `${name}.${format === 'cover_letter_pdf' ? 'pdf' : 'docx'}`, rendered.bytes);
      console.log(name, format, rendered.bytes.length);
    }
  }
  await writeOut(out, 'summary.json', JSON.stringify({ summary, timings }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
