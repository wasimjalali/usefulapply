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
 * Lowercased word tokens. Unicode compatibility normalization makes visually
 * equivalent parenthesized and full-width forms compare the same, while the
 * word matcher naturally ignores the parentheses themselves.
 */
export function claimWords(text: string): string[] {
  let lower = foldUmlauts(text.normalize('NFKC').toLowerCase()).replace(/['’]/g, '');
  for (const [pattern, name] of SYMBOL_NAMES) lower = lower.replace(pattern, name);
  return lower.match(/[\p{L}\p{N}]+/gu) || [];
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
  const rawWords = text.normalize('NFKC').replace(/['’]/g, '').match(/[\p{L}\p{N}]+/gu) || [];
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
