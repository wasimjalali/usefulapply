/**
 * Candidate extraction for src/lib/agents/claim-grammar-words.ts: the closed
 * class words of English and German, from the pinned Universal Dependencies
 * 2.18 treebanks.
 *
 * This script does NOT write the committed list. It writes the candidates,
 * with their counts and tags, for a person to review. The committed list is
 * the result of that review: every candidate kept, and every one dropped with
 * a reason (EXCLUDED_GRAMMAR_WORDS in claim-grammar-words.ts).
 *
 * A form is a candidate when the treebank tags it with one of the closed class
 * tags (ADP, CCONJ, SCONJ, DET, PRON, AUX, PART) in at least MIN_CLOSED_SHARE of
 * its sightings and sees it at least MIN_COUNT times, in any case. No verbs
 * (other than auxiliaries), adjectives or adverbs are ever candidates.
 *
 * Sources, pinned by URL and sha256 (the script refuses other bytes):
 *   UD_English-EWT r2.18 (Silveira et al.) and UD_German-GSD r2.18 (McDonald et
 *   al., Google), CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).
 *   The candidate files this writes, and the reviewed lists built from them, are
 *   adaptations (word forms with counts and tags) under the same licence.
 * UD_German-HDT (text for academic use only) and GUM and LinES (NonCommercial)
 * are deliberately not used.
 *
 * Usage: download the six files below into one folder (the curl loop in the
 * write-up evals/results/2026-10-21-rewrite-claim-guard.md, Round 3), then
 *   npx tsx scripts/build-grammar-words.ts --corpora <folder> --out <folder>
 * Output: candidates-en.tsv, candidates-de.tsv (form, count, closed share, tags).
 * Deterministic: same inputs, same output.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { claimWords } from '../src/lib/agents/claim-token-normalization';

const UD = 'https://raw.githubusercontent.com/UniversalDependencies';
const SOURCES = {
  en: [
    { file: 'en_ewt-ud-train.conllu', url: `${UD}/UD_English-EWT/r2.18/en_ewt-ud-train.conllu`, sha256: 'd68e06122a702464c613076523d56740f047e5bbe89dd90ec32737e04d952143' },
    { file: 'en_ewt-ud-dev.conllu', url: `${UD}/UD_English-EWT/r2.18/en_ewt-ud-dev.conllu`, sha256: '39239e0a60db3ae68f4b7036189f11b6692741d10ff8240dd91f74f2760d90f8' },
    { file: 'en_ewt-ud-test.conllu', url: `${UD}/UD_English-EWT/r2.18/en_ewt-ud-test.conllu`, sha256: 'fa024f43dc5da3c5ac02563bc9bd0e974f46cbb1560823976a8f342a37dc494a' },
  ],
  de: [
    { file: 'de_gsd-ud-train.conllu', url: `${UD}/UD_German-GSD/r2.18/de_gsd-ud-train.conllu`, sha256: '6cb1b600029292fb7bf60531a1d6d7824544791d732c0f7abae8102a2ac337bf' },
    { file: 'de_gsd-ud-dev.conllu', url: `${UD}/UD_German-GSD/r2.18/de_gsd-ud-dev.conllu`, sha256: '01e8e674973592747ffe9a8c77fcf9d2f5936a8484e731ad4f76254318a8952c' },
    { file: 'de_gsd-ud-test.conllu', url: `${UD}/UD_German-GSD/r2.18/de_gsd-ud-test.conllu`, sha256: '595070aa50b706a91dc66f17c296f7a9a25cbc75269f177c27680fb1c21528ab' },
  ],
} as const;

const CLOSED_POS = new Set(['ADP', 'CCONJ', 'SCONJ', 'DET', 'PRON', 'AUX', 'PART']);
const MIN_COUNT = 3;
const MIN_CLOSED_SHARE = 0.5;

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`--${name} <folder> is required`);
  return process.argv[i + 1];
}

function candidates(dir: string, files: ReadonlyArray<{ file: string; sha256: string }>): string[] {
  const stats = new Map<string, { total: number; closed: number; tags: Map<string, number> }>();
  for (const { file, sha256 } of files) {
    const bytes = fs.readFileSync(path.join(dir, file));
    const actual = crypto.createHash('sha256').update(bytes).digest('hex');
    if (actual !== sha256) throw new Error(`${file}: sha256 ${actual} is not the pinned ${sha256}`);
    // A multiword token ("im" = in + dem, "don't" = do + n't) is one sighting of
    // its surface form, closed class only when every part is.
    let range: { to: number; form: string; closed: boolean } | null = null;
    const count = (form: string, closed: boolean, tag: string) => {
      const s = stats.get(form) ?? { total: 0, closed: 0, tags: new Map() };
      s.total += 1;
      if (closed) s.closed += 1;
      s.tags.set(tag, (s.tags.get(tag) ?? 0) + 1);
      stats.set(form, s);
    };
    for (const line of bytes.toString('utf8').split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const cols = line.split('\t');
      if (cols.length < 4) continue;
      const span = /^(\d+)-(\d+)$/.exec(cols[0]);
      if (span) {
        range = { to: Number(span[2]), form: cols[1], closed: true };
        continue;
      }
      if (!/^\d+$/.test(cols[0])) continue; // empty nodes (1.1)
      const forms = claimWords(cols[1]);
      if (forms.length === 1) count(forms[0], CLOSED_POS.has(cols[3]), cols[3]);
      if (range) {
        range.closed = range.closed && CLOSED_POS.has(cols[3]);
        if (Number(cols[0]) === range.to) {
          const whole = claimWords(range.form);
          if (whole.length === 1) count(whole[0], range.closed, `${range.closed ? 'MWT-closed' : 'MWT-open'}`);
          range = null;
        }
      }
    }
  }
  return [...stats]
    .filter(([form, s]) => form.length >= 2 && s.total >= MIN_COUNT && s.closed / s.total >= MIN_CLOSED_SHARE)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([form, s]) => `${form}\t${s.total}\t${(s.closed / s.total).toFixed(2)}\t${[...s.tags].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}:${n}`).join(' ')}`);
}

const dir = arg('corpora');
const out = arg('out');
fs.mkdirSync(out, { recursive: true });
for (const lang of ['en', 'de'] as const) {
  const rows = candidates(dir, SOURCES[lang]);
  fs.writeFileSync(path.join(out, `candidates-${lang}.tsv`), `form\tcount\tclosed_share\ttags\n${rows.join('\n')}\n`);
  console.log(`${lang}: ${rows.length} candidates`);
}
