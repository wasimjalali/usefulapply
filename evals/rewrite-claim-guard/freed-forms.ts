/**
 * Every word the shipped guard frees that origin/main refuses (round 3,
 * 2026-10-21), found by trying each word of a large vocabulary in each position:
 * lowercase mid-sentence, capitalised opening a sentence, capitalised
 * mid-sentence, capitalised as a list item and lowercase in a bullet, in English
 * and in German. Free. Usage:
 *   npx tsx evals/rewrite-claim-guard/freed-forms.ts <corpora folder> <out file>
 *
 * The vocabulary is every form in the English Web Treebank and the German GSD
 * treebank, both grammar lists, and the regular forms (+ing, +ed, +es, +s) of
 * every stem the isNeutral match uses. A word outside it is not tried; the stem
 * rule and the grammar lists are closed sets, and this covers both.
 */
import fs from 'node:fs';
import path from 'node:path';
import { baselineIntroducedClaims } from './baseline-guard';
import { grammarWords } from '../../src/lib/agents/claim-grammar-words';
import { claimStem, claimWords } from '../../src/lib/agents/claim-token-normalization';
import { introducedClaims } from '../../src/lib/agents/unified-writer-agent';

const dir = process.argv[2];
const pool = new Set<string>();
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.conllu'))) {
  for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split('\n')) {
    const cols = line.split('\t');
    if (cols.length > 3 && /^\d+$/.test(cols[0])) for (const w of claimWords(cols[1])) pool.add(w);
  }
}
for (const language of ['en', 'de'] as const) for (const w of grammarWords(language)) pool.add(w);
const source = fs.readFileSync(path.resolve(__dirname, '../../src/lib/agents/unified-writer-agent.ts'), 'utf8');
const body = source.slice(source.indexOf('const NEUTRAL_WORDS = new Set(['), source.indexOf(']);', source.indexOf('const NEUTRAL_WORDS = new Set([')));
for (const entry of [...body.matchAll(/'([a-z]+)'/g)].map((m) => m[1])) {
  const stem = claimStem(entry);
  for (const suffix of ['', 'ing', 'ed', 'es', 's']) pool.add(stem + suffix);
}

const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
type Position = { name: string; language: 'en' | 'de'; kind: 'summary' | 'experience_bullets' | 'custom_section_items'; text: (w: string) => string; before: string };
const EN = 'Applied AI engineer.';
const DE = 'Vertriebsingenieurin im Maschinenbau.';
const positions: Position[] = [
  { name: 'en lowercase mid-sentence', language: 'en', kind: 'summary', before: EN, text: (w) => `Applied AI engineer ${w} agents.` },
  { name: 'en capitalised opening a sentence', language: 'en', kind: 'summary', before: EN, text: (w) => `Applied AI engineer. ${cap(w)} agents.` },
  { name: 'en capitalised mid-sentence', language: 'en', kind: 'summary', before: EN, text: (w) => `Applied AI engineer ${cap(w)} agents.` },
  { name: 'en capitalised list item', language: 'en', kind: 'custom_section_items', before: 'English', text: (w) => `English\n${cap(w)}` },
  { name: 'en capitalised bullet', language: 'en', kind: 'experience_bullets', before: EN, text: (w) => `${cap(w)} agents.` },
  { name: 'en lowercase in a bullet', language: 'en', kind: 'experience_bullets', before: EN, text: (w) => `Built agents ${w} clients.` },
  { name: 'de lowercase mid-sentence', language: 'de', kind: 'summary', before: DE, text: (w) => `Vertriebsingenieurin ${w} Maschinenbau.` },
  { name: 'de capitalised opening a sentence', language: 'de', kind: 'summary', before: DE, text: (w) => `Vertriebsingenieurin im Maschinenbau. ${cap(w)} Maschinenbau.` },
  { name: 'de capitalised mid-sentence', language: 'de', kind: 'summary', before: DE, text: (w) => `Vertriebsingenieurin ${cap(w)} Maschinenbau.` },
  { name: 'de capitalised list item', language: 'de', kind: 'custom_section_items', before: 'Deutsch', text: (w) => `Deutsch\n${cap(w)}` },
  { name: 'de lowercase in a bullet', language: 'de', kind: 'experience_bullets', before: DE, text: (w) => `Betreute Kunden ${w} Maschinenbau.` },
  { name: 'de capitalised bullet', language: 'de', kind: 'experience_bullets', before: DE, text: (w) => `${cap(w)} Kunden.` },
];
const SOURCE = 'Vertriebsingenieurin. Betreuung von 40 Kunden im Maschinenbau. Applied AI Engineer. Builds agents.';

const lines: string[] = [`vocabulary: ${pool.size} words`];
const total = new Map<string, Set<string>>();
for (const position of positions) {
  const freed: string[] = [];
  for (const w of [...pool].sort()) {
    if (w.length < 2 || /^\d+$/.test(w)) continue;
    const text = position.text(w);
    const baseline = baselineIntroducedClaims(text, SOURCE, position.before);
    if (!baseline.includes(w)) continue;
    if (introducedClaims(text, SOURCE, position.before, position.language, position.kind).includes(w)) continue;
    freed.push(w);
    total.set(w, (total.get(w) ?? new Set()).add(position.name));
  }
  lines.push(`\n## ${position.name}: ${freed.length} freed`, freed.join(' '));
}
lines.push(`\n## distinct words freed in any position: ${total.size}`);
fs.writeFileSync(process.argv[3], lines.join('\n') + '\n');
console.log(lines.filter((l) => l.startsWith('##') || l.startsWith('vocab')).join('\n'));
