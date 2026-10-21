/** Runs the CV PDF checks on one existing file. npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/check-file.ts <pdf> <fixture> <templateId> */
import { readFile } from 'node:fs/promises';
import { CV_FIXTURES } from './fixtures';
import { checkCvPdf } from './lib/cv-checks';
import { isDachTemplate } from '../../src/lib/cv-templates/print-spec';

async function main() {
  const [file, fixtureName, templateId] = process.argv.slice(2);
  const fixture = CV_FIXTURES.find((f) => f.name === fixtureName);
  if (!fixture) throw new Error(`unknown fixture ${fixtureName}`);
  const report = await checkCvPdf(new Uint8Array(await readFile(file)), {
    fixture: fixtureName,
    templateId,
    source: fixture.data,
    expectPhoto: isDachTemplate(templateId) && Boolean(fixture.data.personal.photoUrl),
    expectedPages: fixture.expectedUsPages,
  });
  console.log(report.ok ? 'PASS' : 'FAIL', report.failures);
}

main();
