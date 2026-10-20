/** Prints the pdf.js text items of a PDF near a search string. npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/debug-pdfjs.ts <pdf> <needle> */
import { readFile } from 'node:fs/promises';
import { extractWithPdfJs } from './lib/pdf-text';

async function main() {
  const [file, needle] = process.argv.slice(2);
  const result = await extractWithPdfJs(new Uint8Array(await readFile(file)));
  const lower = needle.toLowerCase();
  const hits = result.items.map((item, index) => ({ item, index })).filter(({ item }) => item.str.toLowerCase().includes(lower[0]) && Math.abs(item.size - 10.5) < 0.3);
  const seen = new Set<number>();
  for (const { index } of hits) {
    if (seen.has(index)) continue;
    const around = result.items.slice(index, index + 14);
    const joined = around.map((i) => i.str).join('|');
    if (joined.toLowerCase().replace(/\|/g, '').startsWith(lower)) {
      console.log(JSON.stringify(around.map((i) => [i.str, Number(i.x.toFixed(1)), Number(i.w.toFixed(1))])));
      around.forEach((_, k) => seen.add(index + k));
    }
  }
  console.log(result.pageTexts[0].split('\n').slice(0, 14).join('\n'));
}

main();
