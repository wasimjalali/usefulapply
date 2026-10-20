/**
 * Contact sheet of every template for one fixture.
 *   npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/sheet.ts <renderDir> <fixture> <out.png>
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TEMPLATE_IDS } from './fixtures';
import { contactSheet } from './lib/contact-sheet';

async function main() {
  const [dir, fixture, out] = process.argv.slice(2);
  const rows = TEMPLATE_IDS.map((id) => ({ label: `${fixture} / ${id}`, pdfPath: join(dir, 'cv', `${fixture}__${id}.pdf`) }));
  await writeFile(out, await contactSheet(rows, Number(process.env.DPI ?? 45)));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
