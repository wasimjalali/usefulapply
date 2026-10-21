/**
 * Builds src/lib/agents/claim-free-lexicon.generated.ts: the English and
 * German word forms that cannot carry a claim about an applicant on their own.
 *
 * The section-rewrite claim guard (introducedClaims in
 * src/lib/agents/unified-writer-agent.ts) treats every word NOT in this
 * lexicon as a possible claim. What goes in:
 *
 * - Function words: forms the treebanks tag as a closed class (DET, PRON, ADP,
 *   CCONJ, SCONJ, AUX, PART) at least 75% of the time.
 * - Verbs and adverbs, but only lemmas the treebanks attest (verbs twice,
 *   adverbs five times) AND that passed the hand review in
 *   scripts/claim-lexicon-review.ts. A rare word is never freed, so the long
 *   tail of claim words ("orchestrated", "notarized", "preeminent") stays a
 *   claim without anyone listing it.
 * - Adjectives are never freed. Standing, proficiency, scope, traits and
 *   domains live there, and an adjective can turn a neutral noun into a claim
 *   ("manual testing"). They are still reviewed (five sightings or more): the
 *   forms of a rejected adjective are backed only word for word.
 *
 * Every candidate list is hashed and checked against the review: a corpus or
 * threshold change that adds a candidate stops the build until it is reviewed.
 *
 * Forms of a lemma: what the treebank saw, plus regular inflections (English
 * from Open English WordNet, German weak-verb and adjective endings).
 * A form is dropped when the treebank reads it mostly as a noun or name, or
 * capitalises it in mid-sentence, or (English) when it is a relational
 * adjective in WordNet ("clinical") or an -ing form that is a noun lemma
 * ("marketing"). Superlatives are never freed ("highest", "best").
 *
 * A verb is freed in its inflected forms only. The bare lemma ("resolve",
 * "ramp", "grab"), a form that is also a noun lemma, and a form the treebank
 * reads as a name in 5% of sightings or more ("United") stay claims: that is
 * where products and brands collide with ordinary verbs, in lowercase too.
 * Every freed verb form may open a sentence or bullet. Single forms whose
 * adjective reading is a claim ("committed", "vernetzt") are excluded by the
 * review too, and a form a kept and a rejected lemma share goes where most of
 * its treebank sightings go (an unseen one stays rejected).
 *
 * Also emitted: REVIEWED_CLAIM_FORMS, every form of a lemma the review
 * rejected (plus particle + base-verb forms of rejected German separable
 * verbs, "abschloss"), which the guard backs only with the exact word; and
 * FREE_IN_INSTRUCTIONS, kept adjectives and bare kept verbs, freed only for
 * the advisory check of a chat instruction.
 *
 * Sources, pinned below by URL and sha256 (the build refuses other bytes):
 *   Open English WordNet 2025 edition (CC BY 4.0)
 *   Universal Dependencies 2.18: UD_English-EWT, UD_German-GSD (CC BY-SA 4.0)
 * GUM and LinES (NonCommercial) and UD_German-HDT (text for academic use only)
 * are deliberately not used.
 *
 * Usage: download the files below into one folder (gunzip the WordNet XML), then
 *   npx tsx scripts/build-claim-free-lexicon.ts --corpora <folder>
 *
 * Deterministic: same inputs, same output, sorted.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { claimWords } from '../src/lib/agents/claim-token-normalization';
import { EXCLUDED, EXCLUDED_FORMS, REVIEWED } from './claim-lexicon-review';

const UD = 'https://raw.githubusercontent.com/UniversalDependencies';
const SOURCES = {
  oewn: [{
    file: 'oewn-2025.xml',
    url: 'https://github.com/globalwordnet/english-wordnet/releases/download/2025-edition/english-wordnet-2025.xml.gz (gunzipped)',
    sha256: '6f49adeec174ab3092169fb25cf4a925226b63975a5d29a691a5dff88f0673b2',
  }],
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
};

type Lang = 'en' | 'de';
type OpenClass = 'verb' | 'adj' | 'adv';

const CLOSED_POS = new Set(['DET', 'PRON', 'ADP', 'CCONJ', 'SCONJ', 'AUX', 'PART']);
const UPOS: Record<OpenClass, string[]> = { verb: ['VERB', 'AUX'], adj: ['ADJ'], adv: ['ADV'] };
/** Candidate floors: sightings of the lemma with that part of speech. */
const MIN_LEMMA: Record<OpenClass, number> = { verb: 2, adj: 5, adv: 5 };
/** Function words: sightings of the form. */
const MIN_FUNCTION = { en: 2, de: 3 } as const;
const MIN_CLOSED_SHARE = 0.75;
/** Share of mid-sentence sightings that must be lowercase (rules out names). */
const MIN_LOWER_SHARE = 0.9;
/** Share of sightings as a name that holds a verb form back (see readsAsName). */
const MIN_NAME_SHARE = 0.05;

// -----------------------------------------------------
// Treebanks
// -----------------------------------------------------

interface FormStats {
  total: number;
  pos: Map<string, number>;
  mid: number;
  midLower: number;
}

interface Treebank {
  tokens: number;
  forms: Map<string, FormStats>;
  /** lemma (raw, lowercase) -> part of speech -> count */
  lemmas: Map<string, Map<string, number>>;
  /** `${UPOS}|${lemma}` -> form key -> sightings (superlatives left out) */
  formsOf: Map<string, Map<string, number>>;
}

function key(surface: string): string | null {
  const keys = claimWords(surface);
  if (keys.length !== 1) return null;
  const k = keys[0];
  return k.length < 2 || /\p{N}/u.test(k) ? null : k;
}

function readTreebanks(files: string[]): Treebank {
  const tb: Treebank = { tokens: 0, forms: new Map(), lemmas: new Map(), formsOf: new Map() };
  const sight = (surface: string, pos: string, mid: boolean) => {
    const k = key(surface);
    if (!k) return;
    let s = tb.forms.get(k);
    if (!s) tb.forms.set(k, (s = { total: 0, pos: new Map(), mid: 0, midLower: 0 }));
    s.total += 1;
    s.pos.set(pos, (s.pos.get(pos) ?? 0) + 1);
    if (mid) {
      s.mid += 1;
      if (surface[0] === surface[0].toLowerCase()) s.midLower += 1;
    }
  };
  for (const file of files) {
    let sentenceStart = true;
    let range: { end: number; surface: string; pos: string[]; mid: boolean } | null = null;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (line === '') { sentenceStart = true; range = null; continue; }
      if (line.startsWith('#')) continue;
      const cols = line.split('\t');
      if (cols.length !== 10) continue;
      const [id, form, lemma, upos, , feats] = cols;
      if (/^\d+-\d+$/.test(id)) {          // multiword token: "am" = "an" + "dem"
        range = { end: Number(id.split('-')[1]), surface: form, pos: [], mid: !sentenceStart };
        continue;
      }
      if (!/^\d+$/.test(id)) continue;     // empty nodes
      tb.tokens += 1;
      const mid = !sentenceStart;
      if (range) {
        range.pos.push(upos);
        if (Number(id) === range.end) {
          sight(range.surface, range.pos.every((p) => CLOSED_POS.has(p)) ? 'ADP' : 'X', range.mid);
          range = null;
        }
      } else {
        sight(form, upos, mid);
        const lem = lemma.toLowerCase();
        if (/^\p{L}+$/u.test(lem)) {
          let byPos = tb.lemmas.get(lem);
          if (!byPos) tb.lemmas.set(lem, (byPos = new Map()));
          byPos.set(upos, (byPos.get(upos) ?? 0) + 1);
          const k = key(form);
          if (k && !/Degree=Sup/.test(feats)) {
            const slot = `${upos}|${lem}`;
            if (!tb.formsOf.has(slot)) tb.formsOf.set(slot, new Map());
            const seen = tb.formsOf.get(slot)!;
            seen.set(k, (seen.get(k) ?? 0) + 1);
          }
        }
      }
      sentenceStart = upos === 'PUNCT' && /^[.!?:;]$/.test(form);
    }
  }
  return tb;
}

function candidates(tb: Treebank, cls: OpenClass): string[] {
  const out: string[] = [];
  for (const [lemma, byPos] of tb.lemmas) {
    let n = 0;
    let total = 0;
    for (const [pos, c] of byPos) {
      total += c;
      if (UPOS[cls].includes(pos)) n += c;
    }
    if (n >= MIN_LEMMA[cls] && n / total >= 0.5) out.push(lemma);
  }
  return out.sort();
}

function functionWords(tb: Treebank, lang: Lang): string[] {
  const out: string[] = [];
  for (const [k, s] of tb.forms) {
    if (s.total < MIN_FUNCTION[lang]) continue;
    let closed = 0;
    for (const [pos, n] of s.pos) if (CLOSED_POS.has(pos)) closed += n;
    if (closed / s.total >= MIN_CLOSED_SHARE) out.push(k);
  }
  return out.sort();
}

/** Does the treebank read this form mostly as a noun or a name, or capitalise it mid-sentence? */
function nameOrNoun(tb: Treebank, form: string): boolean {
  const s = tb.forms.get(form);
  if (!s) return false;
  const nouns = (s.pos.get('NOUN') ?? 0) + (s.pos.get('PROPN') ?? 0);
  if (nouns / s.total >= 0.5) return true;
  return s.mid > 0 && s.midLower / s.mid < MIN_LOWER_SHARE;
}

/**
 * Does the treebank read this form as a name often enough to matter: at least
 * 5% of its sightings tagged PROPN, or (English) capitalised in at least 5% of
 * mid-sentence sightings ("United")? German capitalises nominalised verbs
 * ("das Arbeiten"), so there only the PROPN share counts. One stray headline tag
 * ("Hat" in a title) doesn't make "hat" a name.
 */
function readsAsName(tb: Treebank, form: string, lang: Lang): boolean {
  const s = tb.forms.get(form);
  if (!s) return false;
  if ((s.pos.get('PROPN') ?? 0) / s.total >= MIN_NAME_SHARE) return true;
  return lang === 'en' && s.mid > 0 && (s.mid - s.midLower) / s.mid >= MIN_NAME_SHARE;
}

// -----------------------------------------------------
// English: Open English WordNet
// -----------------------------------------------------

interface WordNetLemma {
  noun: boolean;
  verb: boolean;
  adj: boolean;
  adv: boolean;
  /** Lexicographer file of the adjective's first (most frequent) sense: '00' qualitative, '01' relational. */
  adjFirstLexfile?: string;
  forms: Set<string>;
}

/**
 * Lowercase single-word lemmas from the OEWN WN-LMF XML. A sense id carries
 * its lexicographer file after the double underscore ("__3.01" is adj.pert, a
 * relational adjective such as "clinical" or "financial").
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
      if (!lemma) lemmas.set(written, (lemma = { noun: false, verb: false, adj: false, adv: false, forms: new Set() }));
      if (pos === 'n') lemma.noun = true;
      if (pos === 'v') lemma.verb = true;
      if (pos === 'a' || pos === 's') lemma.adj = true;
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

function englishVerbForms(lemma: string): { base: string[]; ed: string[]; ing: string[] } {
  const s = /(s|x|z|ch|sh|o)$/.test(lemma) ? `${lemma}es` : /[^aeiou]y$/.test(lemma) ? `${lemma.slice(0, -1)}ies` : `${lemma}s`;
  const ed = [lemma.endsWith('e') ? `${lemma}d` : /[^aeiou]y$/.test(lemma) ? `${lemma.slice(0, -1)}ied` : `${lemma}ed`];
  const ing = [lemma.endsWith('ie') ? `${lemma.slice(0, -2)}ying` : /[^eoy]e$/.test(lemma) ? `${lemma.slice(0, -1)}ing` : `${lemma}ing`];
  if (CVC.test(lemma)) {
    const last = lemma[lemma.length - 1];
    ed.push(`${lemma}${last}ed`);
    ing.push(`${lemma}${last}ing`);
  }
  return { base: [lemma, s], ed, ing };
}

function relationalTest(lemmas: Map<string, WordNetLemma>): (form: string) => boolean {
  const verbForms = new Set<string>();
  for (const [lemma, info] of lemmas) {
    if (!info.verb) continue;
    const { ed, ing } = englishVerbForms(lemma);
    for (const form of [...ed, ...ing, ...info.forms]) verbForms.add(form);
  }
  const relational = new Set<string>();
  for (const [lemma, info] of lemmas) {
    if (info.adjFirstLexfile === '01' && !verbForms.has(lemma)) relational.add(lemma);
  }
  return (form) =>
    relational.has(form) ||
    (form.endsWith('ly') &&
      [form.slice(0, -2), form.replace(/ily$/, 'y'), form.replace(/ally$/, 'al'), form.replace(/ly$/, 'le')]
        .some((base) => base !== form && relational.has(base)));
}

// -----------------------------------------------------
// German inflection
// -----------------------------------------------------

const DE_ADJ_ENDINGS = ['', 'e', 'en', 'er', 'es', 'em'];
/** Particles of German separable verbs, longest first. */
const DE_PARTICLES = ['zusammen', 'zurück', 'weiter', 'wieder', 'vorbei', 'heraus', 'voran', 'hinzu', 'durch', 'fort',
  'fest', 'frei', 'auf', 'aus', 'bei', 'dar', 'ein', 'her', 'hin', 'los', 'mit', 'nach', 'vor', 'weg', 'ab', 'an', 'zu'];
const DE_INSEPARABLE = /^(be|emp|ent|er|ge|miss|miß|ver|zer|über|unter|durch|um|wider|hinter|voll)/;
const DE_SEPARABLE = /^(ab|an|auf|aus|bei|dar|ein|fest|fort|her|heraus|hin|hinzu|los|mit|nach|vor|voran|vorbei|weg|weiter|wieder|zu|zurück|zusammen)(?=..)/;

/**
 * Weak-verb paradigm of a German infinitive: present (ich/du/er/ihr), past,
 * participle, and present participle with adjective endings. Strong verbs get
 * a few non-words here, which match nothing. No bare stem is generated, so no
 * form can end in "-er" and meet an agent noun ("meistern" never yields "meister").
 */
function germanVerbForms(inf: string): string[] {
  let stem: string;
  if (/[^e](el|er)n$/.test(inf)) stem = inf.slice(0, -1);
  else if (inf.endsWith('en')) stem = inf.slice(0, -2);
  else return [];
  if (stem.length < 2) return [];
  // "arbeitet", "öffnet", "rechnet": an e before -t/-st after d, t, or a consonant + m/n
  // (not after l, r or a lengthening h: "lernt", "filmt", "wohnt").
  const e = /[td]$/.test(stem) || /(?:ch|[^aeioulrh])[mn]$/.test(stem) ? 'e' : '';
  const forms = [
    inf, `${stem}e`, `${stem}${e}st`, `${stem}${e}t`,
    `${stem}${e}te`, `${stem}${e}test`, `${stem}${e}ten`, `${stem}${e}tet`,
  ];
  if (inf.endsWith('ieren') || DE_INSEPARABLE.test(inf)) forms.push(`${stem}${e}t`);
  else {
    const prefix = inf.match(DE_SEPARABLE)?.[1];
    if (prefix) forms.push(`${prefix}ge${stem.slice(prefix.length)}${e}t`);
    else forms.push(`ge${stem}${e}t`);
  }
  for (const ending of DE_ADJ_ENDINGS) forms.push(`${inf}d${ending}`);
  return forms;
}

// -----------------------------------------------------
// Build
// -----------------------------------------------------

function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function loadSources(dir: string): Record<keyof typeof SOURCES, string[]> {
  const out = { oewn: [] as string[], en: [] as string[], de: [] as string[] };
  for (const [group, files] of Object.entries(SOURCES) as Array<[keyof typeof SOURCES, typeof SOURCES.en]>) {
    for (const source of files) {
      const file = path.join(dir, source.file);
      const actual = sha256(fs.readFileSync(file));
      if (actual !== source.sha256) throw new Error(`${source.file}: sha256 ${actual}, expected ${source.sha256} (${source.url})`);
      out[group].push(file);
    }
  }
  return out;
}

function reviewed(lang: Lang, cls: OpenClass | 'function'): Set<string> {
  return new Set(Object.values(EXCLUDED[lang][cls]).flatMap((list) => (list ?? '').split(/\s+/).filter(Boolean)));
}

function checkReview(name: string, list: string[], problems: string[]): void {
  const hash = sha256(list.join('\n'));
  if (REVIEWED[name] !== hash) {
    problems.push(`${name}: candidate list changed (sha256 ${hash}, reviewed ${REVIEWED[name]}). ${list.length} candidates:\n${list.join(' ')}`);
  }
}

function main(): void {
  const i = process.argv.indexOf('--corpora');
  if (i < 0 || !process.argv[i + 1]) throw new Error('Usage: --corpora <folder holding the pinned files>');
  const files = loadSources(process.argv[i + 1]);

  const wordNet = readWordNet(files.oewn[0]);
  const isRelational = relationalTest(wordNet);
  const banks = { en: readTreebanks(files.en), de: readTreebanks(files.de) };

  const problems: string[] = [];
  // Adjectives are reviewed (the rejected ones need exact backing) but never freed.
  const free = { function: new Set<string>(), verb: new Set<string>(), adv: new Set<string>() };
  /** Verb forms that are bare lemmas, noun lemmas or were seen as names: never freed as verbs. */
  const nameLike = new Set<string>();
  /**
   * Freed only when reading a chat instruction, which is advisory: kept
   * adjectives ("relevant") and bare kept verbs, the imperative ("Tailor").
   */
  const instructionOnly = new Set<string>();
  const rejectedForms = new Set<string>();
  const report: string[] = [];
  /** Per language: every lemma's status, and every verb lemma's forms (for separable verbs). */
  const status = { en: new Map<string, 'kept' | 'rejected'>(), de: new Map<string, 'kept' | 'rejected'>() };
  const verbForms = { en: new Map<string, Set<string>>(), de: new Map<string, Set<string>>() };

  for (const lang of ['en', 'de'] as const) {
    const tb = banks[lang];
    const fw = functionWords(tb, lang);
    checkReview(`${lang}:function`, fw, problems);
    const fwExcluded = reviewed(lang, 'function');
    for (const form of fwExcluded) if (!fw.includes(form)) problems.push(`${lang}:function: excluded "${form}" is not a candidate`);
    for (const form of fw) {
      if (fwExcluded.has(form)) { rejectedForms.add(form); continue; }
      free.function.add(form);
    }

    const counts: string[] = [`${fw.length} function words`];
    for (const cls of ['verb', 'adj', 'adv'] as const) {
      const list = candidates(tb, cls);
      checkReview(`${lang}:${cls}`, list, problems);
      const excluded = reviewed(lang, cls);
      for (const lemma of excluded) if (!list.includes(lemma)) problems.push(`${lang}:${cls}: excluded "${lemma}" is not a candidate`);

      let kept = 0;
      for (const lemma of list) {
        const forms = new Set<string>();
        for (const upos of UPOS[cls]) for (const f of tb.formsOf.get(`${upos}|${lemma}`)?.keys() ?? []) forms.add(f);
        const lemmaKey = key(lemma);
        if (lemmaKey && cls !== 'verb') forms.add(lemmaKey);
        if (lang === 'en' && cls === 'verb' && lemmaKey) {
          const wn = wordNet.get(lemmaKey);
          const gen = englishVerbForms(lemmaKey);
          // A verb that is also a noun ("release", "market") frees its base and
          // -s forms only where the treebank tagged them, never by derivation.
          for (const f of [...(wn?.noun ? [] : gen.base), ...gen.ed, ...gen.ing, ...(wn?.forms ?? [])]) forms.add(f);
        }
        if (lang === 'de' && cls === 'verb') for (const f of germanVerbForms(lemma)) { const k = key(f); if (k) forms.add(k); }
        if (lang === 'de' && cls === 'adj') for (const ending of DE_ADJ_ENDINGS) { const k = key(lemma + ending); if (k) forms.add(k); }

        const valid = [...forms].filter((f) => {
          if (nameOrNoun(tb, f)) return false;
          if (lang === 'en' && isRelational(f)) return false;
          if (lang === 'en' && f.endsWith('ing') && wordNet.get(f)?.noun) return false;
          return true;
        });
        if (cls === 'verb') verbForms[lang].set(lemma, forms);
        if (excluded.has(lemma)) {
          status[lang].set(`${cls}|${lemma}`, 'rejected');
          for (const f of forms) rejectedForms.add(f);
          continue;
        }
        status[lang].set(`${cls}|${lemma}`, 'kept');
        kept += 1;
        if (cls === 'adj') {
          for (const f of valid) instructionOnly.add(f);
          continue;
        }
        if (cls === 'verb' && lemmaKey && valid.includes(lemmaKey)) instructionOnly.add(lemmaKey);
        for (const f of valid) {
          // A verb is freed only in an inflected form ("built", "betreue"). The
          // bare lemma is where products live ("resolve", "ramp", "grab", "make"),
          // and a form that is also a noun lemma or was ever seen as a name is
          // one too. Those stay claims, in every position and in lowercase.
          if (cls === 'verb' && (f === lemmaKey || (lang === 'en' && wordNet.get(f)?.noun) || readsAsName(tb, f, lang))) {
            nameLike.add(f);
            continue;
          }
          free[cls as 'verb' | 'adv'].add(f);
        }
      }
      counts.push(cls === 'adj' ? `adj ${kept} of ${list.length} lemmas pass review (adjectives are never freed)` : `${cls} ${kept} of ${list.length} lemmas kept`);
    }
    report.push(`${lang}: ${tb.tokens} tokens from ${files[lang].map((f) => path.basename(f)).join(', ')}; ${counts.join(', ')}`);
  }

  if (problems.length > 0) {
    console.error(problems.join('\n\n'));
    throw new Error(`${problems.length} review problem(s): review the candidates in scripts/claim-lexicon-review.ts, then update REVIEWED.`);
  }

  // Single forms whose adjective reading carries a claim ("committed", "vernetzt").
  for (const lang of ['en', 'de'] as const) {
    for (const stem of Object.values(EXCLUDED_FORMS[lang]).flatMap((list) => (list ?? '').split(/\s+/).filter(Boolean))) {
      const forms = lang === 'de' ? DE_ADJ_ENDINGS.map((ending) => stem + ending) : [stem];
      if (!forms.some((f) => free.verb.has(f) || free.adv.has(f))) problems.push(`${lang}: excluded form "${stem}" is not freed`);
      for (const f of forms) {
        for (const set of [free.verb, free.adv]) set.delete(f);
        rejectedForms.add(f);
      }
    }
  }
  if (problems.length > 0) {
    console.error(problems.join('\n\n'));
    throw new Error(`${problems.length} stale form exclusion(s) in scripts/claim-lexicon-review.ts.`);
  }

  // German separable verbs split in a main clause ("schloss ... ab"). For a
  // rejected particle verb, particle + every form of its base verb is a
  // rejected form too, so the guard can join and check them ("abschloss").
  for (const lemma of verbForms.de.keys()) {
    if (status.de.get(`verb|${lemma}`) !== 'rejected') continue;
    const particle = DE_PARTICLES.find((p) => lemma.startsWith(p) && verbForms.de.has(lemma.slice(p.length)));
    if (!particle) continue;
    const prefix = key(particle);
    for (const f of verbForms.de.get(lemma.slice(particle.length))!) rejectedForms.add(`${prefix}${f}`);
  }

  // A form both a kept and a rejected lemma produce goes where the treebank
  // mostly puts it: "found" is mostly find's past (free), "erreichte" mostly
  // erreichen's (rejected). A form the treebank never saw stays rejected.
  const sightings = new Map<string, { kept: number; rejected: number }>();
  for (const lang of ['en', 'de'] as const) {
    for (const [slot, forms] of banks[lang].formsOf) {
      const [upos, lemma] = slot.split('|');
      const cls = (Object.keys(UPOS) as OpenClass[]).find((c) => UPOS[c].includes(upos));
      const verdict = cls && status[lang].get(`${cls}|${lemma}`);
      if (!verdict) continue;
      for (const [f, n] of forms) {
        const t = sightings.get(f) ?? { kept: 0, rejected: 0 };
        t[verdict] += n;
        sightings.set(f, t);
      }
    }
  }
  for (const f of [...rejectedForms]) {
    if (!(free.verb.has(f) || free.adv.has(f))) continue;
    const t = sightings.get(f);
    if (t && t.kept > t.rejected) rejectedForms.delete(f);
    else for (const set of [free.verb, free.adv]) set.delete(f);
  }
  for (const f of free.function) rejectedForms.delete(f);
  for (const f of [...instructionOnly]) if (rejectedForms.has(f) || free.verb.has(f) || free.adv.has(f) || free.function.has(f)) instructionOnly.delete(f);

  const sorted = (s: Set<string>) => [...s].sort();
  const header = `/**
 * GENERATED by scripts/build-claim-free-lexicon.ts. Do not edit by hand.
 *
 * English and German word forms that cannot carry a claim about an applicant
 * on their own, for the section-rewrite claim guard (claim-vocabulary.ts):
 * function words, and the forms of verbs and adverbs whose lemma the treebanks
 * attest and a person reviewed (scripts/claim-lexicon-review.ts). Adjectives
 * are never freed.
 * Verbs are freed in inflected forms only ("built", "betreue"), never as the
 * bare lemma, so every freed verb form may also open a sentence or bullet.
 * FREE_IN_INSTRUCTIONS: kept adjectives and bare kept verbs, freed only when
 * reading a chat instruction for the advisory "left out" list.
 * REVIEWED_CLAIM_FORMS: forms
 * of the lemmas the review rejected; the guard backs these only word for word.
 * Nouns and proper nouns are never freed.
 *
 * This list is an adaptation of the works below (word forms, part-of-speech
 * tags and lemmas extracted, counted, filtered by hand review and inflected)
 * and is shared under CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/
 *
 * - Open English WordNet, 2025 edition, by the Open English WordNet
 *   maintainers and contributors (english-wordnet@googlegroups.com).
 *   https://github.com/globalwordnet/english-wordnet, release tag 2025-edition.
 *   Licence CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
 * - UD_English-EWT, Universal Dependencies release 2.18 (tag r2.18), by
 *   Natalia Silveira, Timothy Dozat, Christopher Manning, Sebastian Schuster,
 *   Ethan Chi, John Bauer, Miriam Connor, Marie-Catherine de Marneffe, Nathan
 *   Schneider, Sam Bowman, Hanzhi Zhu and Daniel Galbraith.
 *   https://github.com/UniversalDependencies/UD_English-EWT
 *   Licence CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/
 * - UD_German-GSD, Universal Dependencies release 2.18 (tag r2.18), by Slav
 *   Petrov, Wolfgang Seeker, Ryan McDonald, Joakim Nivre, Daniel Zeman, Adriane
 *   Boyd and Verena Blaschke, from "Universal Dependency Annotation for
 *   Multilingual Parsing" (McDonald et al., ACL 2013). Annotations licence
 *   CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/
 *   https://github.com/UniversalDependencies/UD_German-GSD
 *
 * Exact files and sha256 checksums are pinned in the build script.
 * Keys use claimWords() normalisation.
 *
 * ${report.join('\n * ')}
 */
`;
  const body = [
    `export const CLAIM_FREE_FUNCTION = ${JSON.stringify(sorted(free.function).join(' '))};`,
    `export const CLAIM_FREE_VERBS = ${JSON.stringify(sorted(free.verb).join(' '))};`,
    `export const CLAIM_FREE_ADVERBS = ${JSON.stringify(sorted(free.adv).join(' '))};`,
    `export const REVIEWED_CLAIM_FORMS = ${JSON.stringify(sorted(rejectedForms).join(' '))};`,
    `export const FREE_IN_INSTRUCTIONS = ${JSON.stringify(sorted(instructionOnly).join(' '))};`,
    '',
  ].join('\n\n');
  const out = path.resolve(__dirname, '..', 'src', 'lib', 'agents', 'claim-free-lexicon.generated.ts');
  fs.writeFileSync(out, header + '\n' + body);
  console.log(report.join('\n'));
  console.log(`function ${free.function.size}, verbs ${free.verb.size}, adverbs ${free.adv.size}, instruction-only ${instructionOnly.size}, name-like verb forms held back ${nameLike.size}, rejected forms ${rejectedForms.size}; ${fs.statSync(out).size} bytes -> ${path.relative(process.cwd(), out)}`);
}

main();
