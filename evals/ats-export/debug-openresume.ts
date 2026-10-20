/** Shows how the OpenResume parser sees a PDF: line grouping and sections. */
import { readFile } from 'node:fs/promises';
import { groupTextItemsIntoLines } from 'lib/parse-resume-from-pdf/group-text-items-into-lines';
import { groupLinesIntoSections } from 'lib/parse-resume-from-pdf/group-lines-into-sections';
import type { TextItem } from 'lib/parse-resume-from-pdf/types';

async function main() {
  const bytes = new Uint8Array(await readFile(process.argv[2]));
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, verbosity: 0 }).promise;
  let items: TextItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    await page.getOperatorList();
    for (const item of content.items) {
      if (!('str' in item)) continue;
      let fontName = item.fontName;
      try { fontName = page.commonObjs.get(item.fontName).name ?? fontName; } catch { /* keep */ }
      items.push({ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height, fontName, hasEOL: item.hasEOL });
    }
  }
  items = items.filter((i) => i.hasEOL || i.text.trim() !== '');
  const lines = groupTextItemsIntoLines(items);
  const sections = groupLinesIntoSections(lines);
  for (const [name, sectionLines] of Object.entries(sections)) {
    console.log(`## ${name} (${sectionLines.length} lines)`);
    for (const line of sectionLines.slice(0, 5)) console.log('   ', JSON.stringify(line.map((i) => i.text).join('|')));
  }
}

main();
