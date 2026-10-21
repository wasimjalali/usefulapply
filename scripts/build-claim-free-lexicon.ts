/**
 * Builds src/lib/agents/claim-free-lexicon.generated.ts: the English and
 * German words that, by their part of speech, cannot carry a claim about an
 * applicant on their own (function words, verbs, adjectives, adverbs).
 *
 * The section-rewrite claim guard (introducedClaims in
 * src/lib/agents/unified-writer-agent.ts) treats every word NOT in this
 * lexicon as a possible claim. Nouns and proper nouns never enter it, so
 * tools, employers, products, titles, credentials and domain nouns stay
 * claims by construction. The claim-bearing verbs and adjectives that the
 * lexicon would otherwise free (led, senior, certified, fluent, global,
 * clinical, Go, Excel, React and so on) are overridden in code by
 * CLAIM_WORDS, which always wins.
 *
 * Sources, all with licences that allow commercial use:
 *   Open English WordNet 2025 edition (CC BY 4.0): English lemmas by part of
 *   speech, irregular forms, and which adjectives are relational (adj.pert).
 * Universal Dependencies release 2.18, gold part-of-speech annotation on real
 * text:
 *   English: UD_English-EWT (CC BY-SA 4.0)
 *   German:  UD_German-GSD (CC BY-SA 4.0), UD_German-HDT annotation (CC BY-SA 4.0)
 * GUM and LinES are CC BY-NC-SA and are deliberately not used.
 *
 * Usage (corpus files are downloaded separately, see the generated header):
 *   npx tsx scripts/build-claim-free-lexicon.ts --oewn <english-wordnet-2025.xml> --en <conllu...> --de <conllu...>
 *
 * Deterministic: same inputs, same output, sorted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { claimWords } from '../src/lib/agents/claim-token-normalization';

/** Parts of speech that cannot name a tool, employer, product, title or domain. */
const FREE_POS = new Set(['ADJ', 'ADV', 'VERB', 'AUX', 'ADP', 'CCONJ', 'SCONJ', 'DET', 'PRON', 'PART']);

/** A word needs this many sightings; one sighting is too noisy a tag. */
const MIN_COUNT = { en: 2, de: 3 } as const;
/** Share of sightings that must carry a free part of speech. */
const MIN_FREE_SHARE = 0.75;
/** Share of mid-sentence sightings that must be lowercase (rules out names). */
const MIN_LOWER_SHARE = 0.9;

interface Stats {
  total: number;
  pos: Map<string, number>;
  midSentence: number;
  midLower: number;
}

function addSighting(table: Map<string, Stats>, surface: string, pos: string, midSentence: boolean): void {
  const keys = claimWords(surface);
  if (keys.length !== 1) return;          // punctuation, or a form that splits
  const key = keys[0];
  if (key.length < 2 || /\p{N}/u.test(key)) return;
  let stats = table.get(key);
  if (!stats) {
    stats = { total: 0, pos: new Map(), midSentence: 0, midLower: 0 };
    table.set(key, stats);
  }
  stats.total += 1;
  stats.pos.set(pos, (stats.pos.get(pos) ?? 0) + 1);
  if (midSentence) {
    stats.midSentence += 1;
    if (surface[0] === surface[0].toLowerCase()) stats.midLower += 1;
  }
}

function readTreebank(file: string, table: Map<string, Stats>): number {
  let tokens = 0;
  let previousEndsSentence = true;
  let range: { end: number; surface: string; pos: string[]; mid: boolean } | null = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line === '') { previousEndsSentence = true; range = null; continue; }
    if (line.startsWith('#')) continue;
    const cols = line.split('\t');
    if (cols.length !== 10) continue;
    const [id, form, , upos] = cols;
    if (/^\d+-\d+$/.test(id)) {           // multiword token: "am" = "an" + "dem"
      range = { end: Number(id.split('-')[1]), surface: form, pos: [], mid: !previousEndsSentence };
      continue;
    }
    if (!/^\d+$/.test(id)) continue;      // empty nodes
    tokens += 1;
    const mid = !previousEndsSentence;
    if (range) {
      range.pos.push(upos);
      if (Number(id) === range.end) {
        const allFree = range.pos.every((p) => FREE_POS.has(p));
        addSighting(table, range.surface, allFree ? 'ADP' : 'X', range.mid);
        range = null;
      }
    } else {
      addSighting(table, form, upos, mid);
    }
    previousEndsSentence = upos === 'PUNCT' && /^[.!?:;]$/.test(form);
  }
  return tokens;
}

type WordClass = 'adj' | 'verb' | 'other';

function classify(table: Map<string, Stats>, minCount: number): Map<string, WordClass> {
  const out = new Map<string, WordClass>();
  for (const [key, s] of table) {
    if (s.total < minCount) continue;
    let free = 0;
    for (const [pos, n] of s.pos) if (FREE_POS.has(pos)) free += n;
    if (free / s.total < MIN_FREE_SHARE) continue;
    const adj = s.pos.get('ADJ') ?? 0;
    const verb = (s.pos.get('VERB') ?? 0) + (s.pos.get('AUX') ?? 0);
    // Casing only matters for open classes: "Chinese" is an ADJ and a name.
    // A determiner or pronoun ("mein", "our") is never a name, however often
    // a headline capitalises it.
    const open = adj + verb + (s.pos.get('ADV') ?? 0);
    if (open / free >= 0.5 && s.midSentence > 0 && s.midLower / s.midSentence < MIN_LOWER_SHARE) continue;
    const top = Math.max(adj, verb, free - adj - verb);
    out.set(key, top === adj ? 'adj' : top === verb ? 'verb' : 'other');
  }
  return out;
}

// -----------------------------------------------------
// ENGLISH: Open English WordNet
// -----------------------------------------------------

interface WordNetLemma {
  noun: boolean;
  verb: boolean;
  adv: boolean;
  /** Lexicographer file of the adjective's first (most frequent) sense: '00' qualitative, '01' relational. */
  adjFirstLexfile?: string;
  forms: Set<string>;
}

/**
 * Reads lowercase single-word lemmas from the OEWN WN-LMF XML. A sense id
 * carries its lexicographer file after the double underscore ("__3.01" is
 * adj.pert, a relational adjective such as "clinical" or "financial").
 */
function readWordNet(file: string): Map<string, WordNetLemma> {
  const lemmas = new Map<string, WordNetLemma>();
  let current: { lemma: WordNetLemma; pos: string; firstSense: boolean } | null = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const lemmaMatch = line.match(/<Lemma writtenForm="([^"]+)" partOfSpeech="([nvasr])"/);
    if (lemmaMatch) {
      const [, written, pos] = lemmaMatch;
      if (!/^[a-z]+$/.test(written)) { current = null; continue; }   // names, phrases, hyphenations
      let lemma = lemmas.get(written);
      if (!lemma) { lemma = { noun: false, verb: false, adv: false, forms: new Set() }; lemmas.set(written, lemma); }
      if (pos === 'n') lemma.noun = true;
      if (pos === 'v') lemma.verb = true;
      if (pos === 'r') lemma.adv = true;
      current = { lemma, pos, firstSense: true };
      continue;
    }
    if (!current) continue;
    const formMatch = line.match(/<Form writtenForm="([a-z]+)"/);
    if (formMatch && current.pos === 'v') current.lemma.forms.add(formMatch[1]);
    const senseMatch = line.match(/<Sense id="[^"]*__(\d)\.(\d\d)/);
    if (senseMatch && current.firstSense) {
      current.firstSense = false;
      if ((current.pos === 'a' || current.pos === 's') && current.lemma.adjFirstLexfile === undefined) {
        current.lemma.adjFirstLexfile = senseMatch[2];
      }
    }
    if (line.includes('</LexicalEntry>')) current = null;
  }
  return lemmas;
}

const CVC = /[^aeiou][aeiou][bdgklmnprt]$/;

function regularVerbForms(lemma: string): { s: string[]; past: string[]; ing: string[] } {
  const s = /(s|x|z|ch|sh|o)$/.test(lemma) ? [`${lemma}es`] : /[^aeiou]y$/.test(lemma) ? [`${lemma.slice(0, -1)}ies`] : [`${lemma}s`];
  const past = lemma.endsWith('e') ? [`${lemma}d`] : /[^aeiou]y$/.test(lemma) ? [`${lemma.slice(0, -1)}ied`] : [`${lemma}ed`];
  const ing = lemma.endsWith('ie') ? [`${lemma.slice(0, -2)}ying`]
    : /[^eoy]e$/.test(lemma) ? [`${lemma.slice(0, -1)}ing`] : [`${lemma}ing`];
  if (CVC.test(lemma)) {
    const last = lemma[lemma.length - 1];
    past.push(`${lemma}${last}ed`);
    ing.push(`${lemma}${last}ing`);
  }
  return { s, past, ing };
}

/**
 * English forms WordNet alone can vouch for, plus the relational adjectives
 * (and their -ly adverbs) that must never be freed by any source.
 *
 * - A verb-only lemma frees its base and every inflection. A lemma that is
 *   also a noun ("release", "market", "code") frees only its -ed and -ing
 *   forms, and an -ing form that is itself a noun lemma ("marketing",
 *   "engineering", "banking") stays out. Base and -s forms of noun-capable
 *   verbs are left to the corpus to decide.
 * - A qualitative adjective with no noun reading is freed. A relational one
 *   (first sense adj.pert: "clinical", "financial", "technical") names a
 *   domain the way its noun does, so it is a claim.
 * - An adverb is freed unless it is the -ly form of a relational adjective.
 * - A participle ("measured", "orchestrated") is a verb form first, even where
 *   WordNet also lists a relational adjective sense for it.
 */
function wordNetFree(lemmas: Map<string, WordNetLemma>): { free: Map<string, WordClass>; isRelational: (form: string) => boolean; relationalCount: number } {
  const free = new Map<string, WordClass>();
  const isNounLemma = (form: string) => lemmas.get(form)?.noun === true;

  // Participles read as verbs in CV prose: "measured" and "orchestrated" carry
  // a minor relational adjective sense, and must not be held to it.
  const verbForms = new Set<string>();
  for (const [lemma, info] of lemmas) {
    if (!info.verb) continue;
    const { past, ing } = regularVerbForms(lemma);
    for (const form of [...past, ...ing, ...info.forms]) verbForms.add(form);
  }
  const relational = new Set<string>();
  for (const [lemma, info] of lemmas) {
    if (info.adjFirstLexfile === '01' && !verbForms.has(lemma)) relational.add(lemma);
  }
  const isRelational = (form: string) =>
    relational.has(form) ||
    (form.endsWith('ly') &&
      [form.slice(0, -2), form.replace(/ily$/, 'y'), form.replace(/ally$/, 'al'), form.replace(/ly$/, 'le')]
        .some((base) => base !== form && relational.has(base)));

  for (const [lemma, info] of lemmas) {
    if (info.verb) {
      const { s, past, ing } = regularVerbForms(lemma);
      if (!info.noun) {
        free.set(lemma, 'verb');
        for (const form of s) free.set(form, 'verb');
      }
      for (const form of [...past, ...ing, ...info.forms]) {
        if (!isNounLemma(form)) free.set(form, 'verb');
      }
    }
    if (info.adjFirstLexfile !== undefined && info.adjFirstLexfile !== '01' && !info.noun) {
      free.set(lemma, 'adj');
    }
    if (info.adv && !info.noun) free.set(lemma, 'other');
  }
  for (const form of [...free.keys()]) if (isRelational(form)) free.delete(form);
  return { free, isRelational, relationalCount: relational.size };
}

function arg(flag: string): string[] {
  const i = process.argv.indexOf(flag);
  if (i < 0) return [];
  const files: string[] = [];
  for (let j = i + 1; j < process.argv.length && !process.argv[j].startsWith('--'); j++) files.push(process.argv[j]);
  return files;
}

function main(): void {
  const languages = { en: arg('--en'), de: arg('--de') };
  const [wordNetFile] = arg('--oewn');
  if (languages.en.length === 0 || languages.de.length === 0 || !wordNetFile) {
    throw new Error('Usage: --oewn <english-wordnet.xml> --en <conllu...> --de <conllu...>');
  }
  const merged = new Map<string, WordClass>();
  const report: string[] = [];
  const wordNet = wordNetFree(readWordNet(wordNetFile));
  report.push(`oewn: ${wordNet.free.size} claim-free forms, ${wordNet.relationalCount} relational adjectives kept as claims (${path.basename(wordNetFile)})`);
  for (const [key, cls] of wordNet.free) merged.set(key, cls);
  for (const lang of ['en', 'de'] as const) {
    const table = new Map<string, Stats>();
    let tokens = 0;
    for (const file of languages[lang]) tokens += readTreebank(file, table);
    const classes = classify(table, MIN_COUNT[lang]);
    if (lang === 'de') {
      // German CVs are written in the first person ("Betreue", "Erstelle"),
      // which news treebanks barely contain. Derive it from the infinitive,
      // unless the corpus reads that form mostly as a noun ("Pflege", "Lehre").
      for (const [key, cls] of [...classes]) {
        if (cls !== 'verb' || !key.endsWith('en') || /(el|er)n$/.test(key) || key.length < 5) continue;
        const firstPerson = key.slice(0, -1);
        const seen = table.get(firstPerson);
        const nounShare = seen ? ((seen.pos.get('NOUN') ?? 0) + (seen.pos.get('PROPN') ?? 0)) / seen.total : 0;
        if (!classes.has(firstPerson) && nounShare < 0.5) classes.set(firstPerson, 'verb');
      }
    }
    report.push(`${lang}: ${tokens} tokens from ${languages[lang].map((f) => path.basename(f)).join(', ')}; ${classes.size} claim-free forms`);
    for (const [key, cls] of classes) {
      // A relational adjective stays a claim even where a corpus tags it ADJ,
      // in either language: German "digital" and "international" are the
      // same loanwords. Otherwise the first class a form got is kept.
      if (wordNet.isRelational(key)) continue;
      if (!merged.has(key)) merged.set(key, cls);
    }
  }
  const pick = (cls: WordClass) => [...merged].filter(([, c]) => c === cls).map(([k]) => k).sort();
  const adjectives = pick('adj');
  const verbs = pick('verb');
  const other = pick('other');

  const header = `/**
 * GENERATED by scripts/build-claim-free-lexicon.ts. Do not edit by hand.
 *
 * English and German word forms whose part of speech means they cannot carry
 * a claim on their own: function words, verbs, adjectives, adverbs. Nouns and
 * proper nouns are never here. Claim-bearing verbs and adjectives are
 * overridden by CLAIM_WORDS in unified-writer-agent.ts.
 *
 * Derived from Open English WordNet 2025 (CC BY 4.0, https://en-word.net) and
 * Universal Dependencies 2.18 gold annotation: UD_English-EWT (CC BY-SA 4.0),
 * UD_German-GSD (CC BY-SA 4.0), UD_German-HDT annotation (CC BY-SA 4.0).
 * This word list is an adaptation of those resources and is shared under
 * CC BY-SA 4.0. https://universaldependencies.org
 *
 * Rules: at least ${MIN_COUNT.en} (en) / ${MIN_COUNT.de} (de) sightings, at least ${MIN_FREE_SHARE * 100}% of them a free part of
 * speech (${[...FREE_POS].join(', ')}), and for verbs, adjectives and adverbs at
 * least ${MIN_LOWER_SHARE * 100}% of mid-sentence sightings lowercase. Keys use claimWords() normalisation.
 *
 * ${report.join('\n * ')}
 */
`;
  const body = [
    `export const CLAIM_FREE_ADJECTIVES = ${JSON.stringify(adjectives.join(' '))};`,
    `export const CLAIM_FREE_VERBS = ${JSON.stringify(verbs.join(' '))};`,
    `export const CLAIM_FREE_OTHER = ${JSON.stringify(other.join(' '))};`,
    '',
  ].join('\n\n');
  const out = path.resolve(__dirname, '..', 'src', 'lib', 'agents', 'claim-free-lexicon.generated.ts');
  fs.writeFileSync(out, header + '\n' + body);
  console.log(report.join('\n'));
  console.log(`adjectives ${adjectives.length}, verbs ${verbs.length}, other ${other.length}; ${fs.statSync(out).size} bytes -> ${path.relative(process.cwd(), out)}`);
}

main();
