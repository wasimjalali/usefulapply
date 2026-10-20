/**
 * Re-runs the CV PDF checks on PDFs already rendered (no Browser Run, no AI calls), printing every failure.
 *   npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/check-dir.ts <dir with cv/*.pdf> [fixtureFilter]
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CV_FIXTURES, TEMPLATE_IDS } from './fixtures';
import { checkCvPdf } from './lib/cv-checks';
import { isDachTemplate, type PaperSize } from '../../src/lib/cv-templates/print-spec';

const PAPER: Record<string, PaperSize> = { 'us-one-page': 'letter', 'de-two-page': 'a4', 'over-cap': 'letter', 'long-entry': 'letter', 'us-personal': 'letter', hostile: 'letter', 'fr-one-page': 'a4' };

async function main() {
  const [dir, filter] = process.argv.slice(2);
  for (const fixture of CV_FIXTURES.filter((f) => !filter || f.name === filter)) {
    for (const templateId of TEMPLATE_IDS) {
      const bytes = new Uint8Array(await readFile(join(dir, 'cv', `${fixture.name}__${templateId}.pdf`)));
      const report = await checkCvPdf(bytes, {
        fixture: fixture.name,
        templateId,
        source: fixture.data,
        expectPhoto: isDachTemplate(templateId) && Boolean(fixture.data.personal.photoUrl),
        expectedPages: fixture.expectedUsPages,
        expectedPaper: PAPER[fixture.name],
      });
      console.log(report.ok ? 'PASS' : 'FAIL', fixture.name, templateId, `pages ${report.metrics.pages}`, `band ${report.emptyBand.join('/')}`);
      for (const failure of report.failures) console.log('   -', failure);
      for (const warning of report.warnings) console.log('   ~', warning);
    }
  }
}
main();
