/**
 * Lexical normalization for the section-rewrite claim guard.
 *
 * These helpers only collapse spelling forms of the same word. They never add
 * semantic aliases, JD keywords or inferred acronyms, because any of those
 * would let a new applicant claim through without a source-CV match.
 */

const SYMBOL_NAMES: Array<[RegExp, string]> = [
  [/c\+\+/g, 'cplusplus'],
  [/c#/g, 'csharp'],
  [/f#/g, 'fsharp'],
  [/\.net\b/g, 'dotnet'],
];

// Exact exceptions for short verbs that the five-character safety floor would
// otherwise leave split. Keep this allowlist narrow to avoid new collisions.
const SHORT_VERB_STEMS = new Map([
  ['own', 'own'],
  ['owns', 'own'],
  ['owning', 'own'],
  ['owned', 'own'],
  ['run', 'run'],
  ['runs', 'run'],
  ['running', 'run'],
]);

/** German spelling variants fold, so "fünf" and "fuenf" are one word. */
function foldUmlauts(lower: string): string {
  return lower
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

/**
 * Dotted abbreviations become one word: "B.S." -> "BS", "Ph.D." -> "PhD",
 * "M.B.A." -> "MBA". Split at the dots they were one-letter tokens, which the
 * guard's two-character floor drops, so "Hold a B.S." claimed a degree with
 * nothing left to check. The final dot stays: it may end the sentence.
 * Lowercase ones ("e.g.", "i.e.", "z.B.") are left alone.
 */
function joinDottedAbbreviations(text: string): string {
  return text.replace(
    /(?<![\p{L}\p{N}.])\p{Lu}\p{Ll}{0,2}(?:\.\p{Lu}\p{Ll}{0,2})+(?![\p{L}\p{N}])/gu,
    (match) => match.replace(/\./g, ''),
  );
}

/** Text as the guard reads it, before case folding. */
function normalized(text: string): string {
  return joinDottedAbbreviations(text.normalize('NFKC')).replace(/['’]/g, '');
}

/**
 * Lowercased word tokens. Unicode compatibility normalization makes visually
 * equivalent parenthesized and full-width forms compare the same, while the
 * word matcher naturally ignores the parentheses themselves.
 */
export function claimWords(text: string): string[] {
  let lower = foldUmlauts(normalized(text).toLowerCase());
  for (const [pattern, name] of SYMBOL_NAMES) lower = lower.replace(pattern, name);
  return lower.match(/[\p{L}\p{N}]+/gu) || [];
}

/** How capitals at the start of a sentence, line or item read. */
export type CapitalMode = 'prose' | 'items' | 'instruction';

export interface CapitalisedWords {
  /** Written as a name: capitalised mid-sentence, an acronym, or (items) any capital. */
  names: Set<string>;
  /** Acronyms ("AWS", "IT", "BS"): names even where the word is also a function word. */
  acronyms: Set<string>;
  /** Capitalised only at the start of a sentence, line or bullet, where a capital says nothing. */
  initial: Set<string>;
}

/**
 * Which words the text writes as names. Keys match claimWords().
 *
 * - Mid-sentence capitals ("built on React", "joined Linear") and acronyms
 *   ("AWS", "PMP") are names.
 * - A capital at the start of a sentence, line or bullet is ambiguous: the
 *   word goes to `initial`, and the guard decides (a function word or an
 *   inflected verb form may open a sentence; "Convex", "Make" or "Google" may
 *   not). Leading list numbers ("1)") don't count as the first word.
 * - `items`: list items such as skills, tools and languages are names by
 *   nature, so every capital counts as a name, at the start of an item too.
 * - `instruction`: a request typed in chat opens with an imperative ("Make it
 *   shorter"), so its segment-initial capitals are ignored.
 *
 * German capitalises every noun; the guard reads German capitals separately.
 */
export function claimCapitalisedWords(text: string, mode: CapitalMode = 'prose'): CapitalisedWords {
  let cased = normalized(text);
  for (const [pattern, name] of SYMBOL_NAMES) cased = cased.replace(new RegExp(pattern.source, 'gi'), name);
  const out: CapitalisedWords = { names: new Set(), acronyms: new Set(), initial: new Set() };
  for (const segment of cased.split(/[\n\r•·|;:.!?]+/u)) {
    const tokens = segment.match(/[\p{L}\p{N}]+/gu) || [];
    let first = 0;
    while (first < tokens.length && /^\p{N}+$/u.test(tokens[first])) first += 1;
    tokens.slice(first).forEach((token, i) => {
      const word = foldUmlauts(token.toLowerCase());
      if (/^\p{Lu}[\p{Lu}\p{N}]+$/u.test(token)) {
        out.acronyms.add(word);
        out.names.add(word);
        return;
      }
      if (!/^\p{Lu}/u.test(token)) return;
      if (i > 0 || mode === 'items') out.names.add(word);
      else if (mode === 'prose') out.initial.add(word);
    });
  }
  return out;
}

const GERMAN_ADJECTIVE_ENDINGS = ['em', 'en', 'er', 'es', 'e'];
const GERMAN_NOUN_ENDINGS = ['en', 'es', 'e', 'n', 's'];

/**
 * German inflection bases (word -> base), split by how the word is written
 * mid-sentence.
 * German capitalises every noun, so a lowercase mid-sentence word is a verb,
 * adjective or function word, and a capitalised one is a noun. Folding only
 * within each class lets "ruhigem" meet the CV's "ruhigen" and "Kontakt" meet
 * "Kontakte" while "Berater" (a title) can never meet "beraten" (a verb).
 * Nouns never fold "-er": that ending makes agent nouns.
 *
 * German text only. In English the same folds would back "researcher" with
 * "researches" and "lecturer" with "lectures". Sentence-initial words say
 * nothing about their class and are left out.
 */
export function claimGermanBases(text: string): { lower: Map<string, string>; capital: Map<string, string> } {
  const lower = new Map<string, string>();
  const capital = new Map<string, string>();
  const cased = normalized(text);
  for (const segment of cased.split(/[\n\r•·|;:.!?]+/u)) {
    const tokens = segment.match(/[\p{L}\p{N}]+/gu) || [];
    tokens.forEach((token, i) => {
      if (i === 0 || /\p{N}/u.test(token) || /^\p{Lu}[\p{Lu}\p{N}]+$/u.test(token)) return;
      const word = foldUmlauts(token.toLowerCase());
      if (/^\p{Lu}/u.test(token)) capital.set(word, germanBase(word, GERMAN_NOUN_ENDINGS));
      else lower.set(word, germanBase(word, GERMAN_ADJECTIVE_ENDINGS));
    });
  }
  return { lower, capital };
}

/** The word with its longest German ending removed, keeping at least four letters. */
function germanBase(word: string, endings: string[]): string {
  for (const ending of endings) {
    if (word.endsWith(ending) && word.length - ending.length >= 4) return word.slice(0, -ending.length);
  }
  return word;
}

/**
 * Conventional acronym plurals use a lowercase trailing s after an uppercase
 * acronym, for example PRD/PRDs. Preserve the original casing long enough to
 * recognize only that narrow form, then return lowercase aliases for the
 * case-folded claim index. Ordinary words such as "does" and "axes" never
 * enter this path.
 */
export function claimAcronymPluralAliases(text: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const rawWords = normalized(text).match(/[\p{L}\p{N}]+/gu) || [];
  for (const rawWord of rawWords) {
    const match = rawWord.match(/^([A-Z]{2,8})s$/);
    if (match) aliases.set(rawWord.toLowerCase(), match[1].toLowerCase());
  }
  return aliases;
}

/**
 * A conservative morphology fold for ordinary words. Apart from the exact
 * short-verb allowlist above, the five-character floor prevents collisions
 * such as does/DOE and axes/axe.
 *
 * Deliberately does not strip "-er": collapsing "leader" onto "lead" would
 * let a CV saying "leading the migration" support the stronger claim "team
 * leader".
 */
export function claimStem(word: string): string {
  const shortVerbStem = SHORT_VERB_STEMS.get(word);
  if (shortVerbStem) return shortVerbStem;
  if (word.length < 5) return word;
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  for (const suffix of ['ing', 'ed', 'es', 'ly', 's']) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}
