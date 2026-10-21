/**
 * Lists every surface form the isNeutral stem fix newly frees (round 3, 2026-10-21):
 * a form whose claimStem() is the stem of a NEUTRAL_WORDS entry but is not
 * neutral on origin/main. Candidates are the English Web Treebank's word forms
 * plus the regular forms of each new stem (stem + ing/ed/es/s). Usage:
 *   npx tsx evals/rewrite-claim-guard/stem-audit.ts <corpora folder> <out file>
 * Free. The review of the list is in the write-up.
 */
import fs from 'node:fs';
import path from 'node:path';
import { claimStem, claimWords } from '../../src/lib/agents/claim-token-normalization';

const source = fs.readFileSync(path.resolve(__dirname, '../../src/lib/agents/unified-writer-agent.ts'), 'utf8');
const body = source.slice(source.indexOf('const NEUTRAL_WORDS = new Set(['), source.indexOf(']);', source.indexOf('const NEUTRAL_WORDS = new Set([')));
const entries = [...body.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
const NEUTRAL = new Set(entries);
const roleBody = source.slice(source.indexOf('const ROLE_WORDS = new Set(['), source.indexOf(']);', source.indexOf('const ROLE_WORDS = new Set([')));
const ROLE = new Set([...roleBody.matchAll(/'([a-z]+)'/g)].map((m) => m[1]));

const denyBody = source.slice(source.indexOf('const NOT_NEUTRAL_BY_STEM = new Set(['), source.indexOf(']);', source.indexOf('const NOT_NEUTRAL_BY_STEM = new Set([')));
const DENIED = new Set([...denyBody.matchAll(/'([a-z]+)'/g)].map((m) => m[1]));

const stems = new Set(entries.filter((e) => !e.endsWith('ly')).map(claimStem));
const baselineNeutral = (w: string) => NEUTRAL.has(w) || NEUTRAL.has(claimStem(w));
const newlyNeutral = (w: string) => !baselineNeutral(w) && !ROLE.has(w) && !DENIED.has(w) && !w.endsWith('ly') && claimStem(w) !== w && stems.has(claimStem(w));

const pool = new Set<string>();
for (const file of fs.readdirSync(process.argv[2]).filter((f) => f.startsWith('en_ewt'))) {
  for (const line of fs.readFileSync(path.join(process.argv[2], file), 'utf8').split('\n')) {
    const cols = line.split('\t');
    if (cols.length > 3 && /^\d+$/.test(cols[0])) for (const w of claimWords(cols[1])) pool.add(w);
  }
}
const newStems = [...stems].filter((s) => !NEUTRAL.has(s)).sort();
for (const stem of newStems) {
  for (const suffix of ['ing', 'ed', 'es', 's']) pool.add(stem + suffix);
  // claimStem() also reads "-ies" as "-y" ("alwaies" is stem "alway"), review of #171.
  if (stem.endsWith('y')) pool.add(stem.slice(0, -1) + 'ies');
}
for (const entry of entries) pool.add(entry);

const freed = [...pool].filter(newlyNeutral).sort();
const byStem = new Map<string, string[]>();
for (const w of freed) byStem.set(claimStem(w), [...(byStem.get(claimStem(w)) ?? []), w]);
const wouldFree = [...pool].filter((w) => DENIED.has(w) && !baselineNeutral(w) && claimStem(w) !== w && stems.has(claimStem(w))).sort();
const lines = [`entries: ${entries.length}, stems: ${stems.size}, stems that are not entries: ${newStems.length}`, `stems that are not entries: ${newStems.join(' ')}`, `stem-matched but kept out by NOT_NEUTRAL_BY_STEM: ${wouldFree.join(' ')}`, `newly freed forms (${freed.length}), by stem:`];
for (const [stem, forms] of [...byStem].sort()) lines.push(`${stem}: ${forms.join(' ')}`);
fs.writeFileSync(process.argv[3], lines.join('\n') + '\n');
console.log(lines.slice(0, 3).join('\n'));
