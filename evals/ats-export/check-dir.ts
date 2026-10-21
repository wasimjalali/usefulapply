/**
 * Re-runs the CV PDF checks on PDFs already rendered (no Browser Run, no AI calls), printing every failure.
 *   npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/check-dir.ts <dir with cv/*.pdf> [fixtureFilter]
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CV_FIXTURES, templatesFor } from './fixtures';
import { checkCvPdf } from './lib/cv-checks';
import { isDachTemplate } from '../../src/lib/cv-templates/print-spec';


async function main() {
  const [dir, filter] = process.argv.slice(2);
  for (const fixture of CV_FIXTURES.filter((f) => !filter || f.name === filter)) {
    for (const templateId of templatesFor(fixture)) {
      const bytes = new Uint8Array(await readFile(join(dir, 'cv', `${fixture.name}__${templateId}.pdf`)));
      const report = await checkCvPdf(bytes, {
        fixture: fixture.name,
        templateId,
        source: fixture.data,
        expectPhoto: isDachTemplate(templateId) && Boolean(fixture.data.personal.photoUrl),
        expectedPages: fixture.expectedUsPages,
        expectedPaper: fixture.paper,
        localeExpect: fixture.locale,
      });
      console.log(report.ok ? 'PASS' : 'FAIL', fixture.name, templateId, `pages ${report.metrics.pages}`, `band ${report.emptyBand.join('/')}`);
      for (const failure of report.failures) console.log('   -', failure);
      for (const warning of report.warnings) console.log('   ~', warning);
    }
  }
}
main();
