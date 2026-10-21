/**
 * Grammar words the section-rewrite claim guard (introducedClaims in
 * unified-writer-agent.ts) never treats as a claim: the closed class words of
 * English and German. Prepositions, conjunctions, articles and determiners,
 * pronouns, auxiliaries and particles. No verb (other than an auxiliary), no
 * adjective and no adverb is on these lists, and none is ever added here:
 * that is where claims live ("led", "senior", "personally").
 *
 * HOW THE LISTS WERE MADE. scripts/build-grammar-words.ts reads the Universal
 * Dependencies 2.18 treebanks below and writes every form the treebank tags
 * ADP, CCONJ, SCONJ, DET, PRON, AUX or PART at least half the time and sees at
 * least three times (209 English and 313 German candidates). A person then read
 * every candidate. The lists below are what survived (136 English and 195 German
 * forms, 37 and 145 of them refused on main, after the review of #171), and the exclusions, each
 * with its reason, are in EXCLUDED_GRAMMAR_WORDS, so nothing was dropped
 * silently. A word the build did not list is not on a list.
 *
 * HOW THEY ARE USED. The lists are language-scoped: English words are freed only
 * when the rewrite is in English, German words only when it is in German ("Nix",
 * "die", "man", "Pro" mean something else in the other language), and a rewrite
 * in any other language frees none. A word is freed only where it is
 * written in lowercase, or capitalised as the first word of a sentence in prose
 * (summary, project description). A word capitalised mid-sentence, in capitals,
 * or capitalised anywhere in a list section (bullets, skills, tools, languages)
 * is read as a name and is checked like any other word. See freedGrammarWords.
 *
 * Words already in NEUTRAL_WORDS (unified-writer-agent.ts) stay free in every
 * case and position, exactly as before. These lists only add.
 *
 * freedByStemCase applies the same case rule to the words isNeutralByStem frees by
 * their stem ("including", "creates"), with one difference: a capital opening a
 * bullet of an experience section is allowed, because every bullet opens with a
 * verb.
 *
 * SOURCES (an adaptation: the word forms were selected by tag and frequency,
 * then hand-reviewed, and the lists contain only those forms, no sentences):
 *   UD_English-EWT, release r2.18. Silveira et al. English Web Treebank,
 *     Universal Dependencies. https://github.com/UniversalDependencies/UD_English-EWT
 *     CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/
 *     en_ewt-ud-train.conllu sha256 d68e06122a702464c613076523d56740f047e5bbe89dd90ec32737e04d952143
 *     en_ewt-ud-dev.conllu   sha256 39239e0a60db3ae68f4b7036189f11b6692741d10ff8240dd91f74f2760d90f8
 *     en_ewt-ud-test.conllu  sha256 fa024f43dc5da3c5ac02563bc9bd0e974f46cbb1560823976a8f342a37dc494a
 *   UD_German-GSD, release r2.18. McDonald et al., Google, German Universal
 *     Dependency Treebank, Universal Dependencies.
 *     https://github.com/UniversalDependencies/UD_German-GSD
 *     CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/
 *     de_gsd-ud-train.conllu sha256 6cb1b600029292fb7bf60531a1d6d7824544791d732c0f7abae8102a2ac337bf
 *     de_gsd-ud-dev.conllu   sha256 01e8e674973592747ffe9a8c77fcf9d2f5936a8484e731ad4f76254318a8952c
 *     de_gsd-ud-test.conllu  sha256 595070aa50b706a91dc66f17c296f7a9a25cbc75269f177c27680fb1c21528ab
 * UD_German-HDT (text for academic use only), GUM and LinES (NonCommercial) are
 * not used.
 */
import type { CVSectionKind } from './prompts/cv-prompt';
import { claimWords } from './claim-token-normalization';

/** Written as a person writes them: umlauts and ß are folded by claimWords() when loaded. */
const GRAMMAR_WORDS_SOURCE = {
  en: [
    // Prepositions.
    'about', 'across', 'after', 'against', 'along', 'among', 'around', 'at', 'before', 'behind',
    'between', 'by', 'down', 'during', 'for', 'from', 'in', 'into', 'of', 'off', 'on', 'onto',
    'out', 'over', 'since', 'through', 'toward', 'towards', 'under', 'up', 'upon', 'with', 'within',
    // Conjunctions.
    'and', 'or', 'but', 'nor', 'although', 'though', 'because', 'if', 'unless', 'until', 'whereas',
    'whether', 'while', 'whilst', 'than', 'as',
    // Articles and determiners.
    'an', 'the', 'this', 'that', 'these', 'those', 'each', 'every', 'either', 'neither',
    'some', 'any', 'no', 'all', 'both', 'another', 'what', 'whatever', 'which', 'whose',
    // Pronouns.
    'me', 'my', 'mine', 'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'it', 'its',
    'we', 'our', 'they', 'them', 'their', 'who', 'whom', 'there',
    // Auxiliaries.
    'am', 'are', 'be', 'been', 'being', 'is', 'was', 'were', 'do', 'does', 'did', 'has', 'could',
    'should', 'would', 'shall',
    // Particles.
    'to', 'not',
    // Contractions of the above, as claimWords() reads them: "don't" is "dont".
    'dont', 'wont', 'cant', 'cannot', 'isnt', 'arent', 'wasnt', 'werent', 'doesnt', 'didnt',
    'hasnt', 'havent', 'wouldnt', 'couldnt', 'shouldnt', 'thats', 'whats', 'theyre', 'youre',
    'weve', 'youve', 'theyve', 'theyd', 'youd', 'itll', 'thatll', 'theyll', 'youll',
  ],
  de: [
    // Prepositions, and their contractions with the article (im, zum, zur, vom).
    'am', 'an', 'ans', 'anhand', 'auf', 'aufgrund', 'aufs', 'aus', 'bei', 'beim', 'bis',
    'durch', 'entlang', 'für', 'gegen', 'hinter', 'im', 'in', 'ins', 'mit', 'mittels', 'nach',
    'neben', 'seit', 'über', 'um', 'ums', 'unter', 'vom', 'von', 'vor', 'während', 'wegen', 'zu',
    'zum', 'zur', 'zwischen',
    // Conjunctions.
    'und', 'oder', 'sondern', 'denn', 'sowie', 'sowohl', 'weder', 'entweder', 'dass', 'ob', 'weil',
    'wenn', 'als', 'wie', 'bevor', 'nachdem', 'obwohl', 'indem', 'sobald', 'solange', 'sodass',
    'sofern', 'soweit', 'falls',
    // Articles and determiners.
    'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
    'kein', 'keine', 'keinem', 'keinen', 'keiner', 'dies', 'diese', 'diesem', 'diesen', 'dieser',
    'dieses', 'jene', 'jenem', 'jenen', 'jener', 'jenes', 'andere', 'anderem', 'anderen', 'anderer',
    'anderes', 'solch', 'solche', 'solchen', 'solcher', 'solches', 'selben', 'derselben',
    'desselben', 'dieselbe', 'dieselben', 'demjenigen', 'diejenigen', 'welche', 'welchem', 'welchen', 'welcher', 'welches',
    'seine', 'seinem', 'seinen', 'seiner', 'seines', 'ihre',
    'ihrem', 'ihren', 'ihrer', 'ihres',
    // Pronouns.
    'ich', 'er', 'ihm', 'ihn', 'es', 'sie', 'ihnen', 'ihr', 'wir', 'euch',
    'sich', 'man', 'wer', 'was', 'dessen', 'deren', 'derer', 'denen',
    // Auxiliaries, including their subjunctive forms.
    'sein', 'ist', 'sind', 'bin', 'bist', 'sei', 'seien', 'war', 'waren', 'wäre', 'wären',
    'gewesen', 'werden', 'wird', 'werde', 'wurde', 'wurden', 'worden', 'würde', 'würden', 'haben',
    'habe', 'hat', 'hatte', 'hatten', 'hätte', 'hätten', 'können', 'kann', 'könne', 'könnte',
    'könnten', 'konnte', 'konnten', 'müssen', 'müsste', 'müssten', 'musste', 'mussten', 'müsse',
    'sollen', 'sollte', 'sollten', 'solle', 'wollen', 'wollte', 'wollten', 'dürfen', 'darf',
    'dürfe', 'dürfte', 'dürften', 'durfte', 'durften', 'möchte',
    // Particles.
    'nicht',
  ],
} as const;

/**
 * What the build offered and the review dropped, with the reason. Kept in the
 * source so the next reader can see the call, and a test checks that no word is
 * both on a list and excluded. Words are listed as the treebank writes them.
 */
export const EXCLUDED_GRAMMAR_WORDS: ReadonlyArray<{ language: 'en' | 'de'; reason: string; words: readonly string[] }> = [
  {
    language: 'de',
    reason: 'first-person object or possessive: "mit dem Team unter mir", "mein Team" carry a supervision or ownership claim with no verb to catch it (review of #171)',
    words: ['mich', 'mir', 'uns', 'mein', 'meine', 'meinem', 'meinen', 'meiner', 'meines', 'unser', 'unsere', 'unserem', 'unseren', 'unserer', 'unseres'],
  },
  {
    language: 'de',
    reason: 'also the name of a lowercase CLI tool (ab, Apache Bench), which the case rule cannot tell apart (review of #171)',
    words: ['ab'],
  },
  {
    language: 'de',
    reason: 'a universal quantifier: "Betreuung aller Kunden" scopes a claim to everything, like the excluded viele and saemtliche (review of #171)',
    words: ['alle', 'allem', 'allen', 'aller', 'jede', 'jedem', 'jeden', 'jeder', 'jedes'],
  },
  {
    language: 'en',
    reason: 'possessive pronoun: "the product is ours" claims ownership, like the excluded German possessives (review of #171)',
    words: ['ours'],
  },
  {
    language: 'en',
    reason: 'a product, tier, brand or other name in either language (Nix, Pro, Plus, Via, Art, Per)',
    words: ['plus', 'via', 'per', 'vs', 'pro'],
  },
  {
    language: 'de',
    reason: 'a product, tier, brand or other name in either language (Nix, Pro, Plus, Via, Art, Per)',
    words: ['nix', 'pro', 'per', 'plus', 'via', 'art'],
  },
  {
    language: 'en',
    reason: 'reflexive: "did it myself" claims sole ownership',
    words: ['myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'themselves'],
  },
  {
    language: 'de',
    reason: 'reflexive or intensive: "selber" and "selbst" claim sole ownership',
    words: ['selber', 'selbst'],
  },
  {
    language: 'en',
    reason: 'indefinite pronoun: it quantifies or scopes ("everything from X to Y", "nothing was lost")',
    words: [
      'anybody', 'anyone', 'anything', 'everybody', 'everyone', 'everything', 'nobody', 'none',
      'nothing', 'somebody', 'someone', 'something', 'anyones', 'everyones',
    ],
  },
  {
    language: 'de',
    reason: 'indefinite pronoun or quantifier: it quantifies or scopes ("viele", "mehrere", "alles", "niemand")',
    words: [
      'alles', 'vieles', 'einiges', 'beides', 'jemand', 'niemand', 'nichts', 'viel', 'viele',
      'vielen', 'vieler', 'wenige', 'wenigen', 'mehrere', 'mehreren', 'mehrerer', 'einige',
      'einigen', 'einiger', 'einig', 'etliche', 'etlichen', 'saemtliche', 'meisten', 'meiste',
      'manche', 'manchen', 'beide', 'beiden', 'beider', 'jegliche', 'irgendwelche', 'keinerlei',
      'zuviel', 'soviel', 'voller',
    ],
  },
  {
    language: 'en',
    reason: 'preposition of contrast, exception, exclusion or scope ("without help", "beyond scope", "throughout")',
    words: ['beyond', 'despite', 'except', 'besides', 'throughout', 'unlike', 'without', 'lest'],
  },
  {
    language: 'de',
    reason: 'preposition of contrast, exception, exclusion, source or scope (ohne, trotz, laut, innerhalb)',
    words: [
      'ohne', 'trotz', 'ausser', 'statt', 'anstatt', 'anstelle', 'gegenueber', 'entgegen', 'laut',
      'zufolge', 'samt', 'inklusive', 'einschliesslich', 'innerhalb', 'ausserhalb', 'oberhalb',
      'unterhalb', 'unweit', 'jenseits', 'abseits', 'nahe', 'namens', 'voran', 'hinsichtlich',
      'angesichts', 'anlaesslich', 'infolge', 'zugunsten', 'seitens', 'inmitten', 'gemaess', 'bzgl',
    ],
  },
  {
    language: 'en',
    reason: 'also an ordinary noun or a name (can, may, will, might, must, till, ill, id, Ive); each stays free as before where NEUTRAL_WORDS lists it',
    words: ['can', 'may', 'will', 'might', 'must', 'till', 'ill', 'id', 'hed', 'hes', 'shes', 'ive', 'im', 'aint'],
  },
  {
    language: 'de',
    reason: 'also an ordinary noun (Soll, Muss, Wille) or an adverb or adjective (da, nahe, mag)',
    words: ['soll', 'muss', 'will', 'wolle', 'mag', 'da', 'zumal', 'beziehungsweise', 'bzw'],
  },
  {
    language: 'en',
    reason: 'a verb, adjective or adverb the treebank also tags as a closed class word',
    words: ['like', 'near'],
  },
  {
    language: 'en',
    reason: 'a typo, slang, an elision or a fragment of a contraction in the corpus, not a word a CV uses',
    words: [
      'adn', 'ar', 'becuse', 'du', 'em', 'gen', 'na', 'outta', 'se', 'ta', 'thy', 'thru', 'ur', 'whos',
      'ya', 'ye', 'yo', 'll', 'nt', 're', 've', 'ca', 'wo', 'ai',
    ],
  },
  {
    language: 'de',
    reason: 'an English token, an informal form or a typo in the corpus',
    words: [
      'and', 'the', 'it', 'is', 'my', 'gen', 'hab', 'du', 'deinen', 'eurer', 'wen', 'nein',
    ],
  },
];

/** The normalised word set per language, built on first use. */
let normalised: { en: ReadonlySet<string>; de: ReadonlySet<string> } | null = null;

function loaded(language: 'en' | 'de'): ReadonlySet<string> {
  normalised ??= {
    en: new Set(GRAMMAR_WORDS_SOURCE.en.flatMap((word) => claimWords(word))),
    de: new Set(GRAMMAR_WORDS_SOURCE.de.flatMap((word) => claimWords(word))),
  };
  return normalised[language];
}

/** The grammar words of a language, as claimWords() writes them. */
export function grammarWords(language: 'en' | 'de'): ReadonlySet<string> {
  return loaded(language);
}

/** Section kinds written as running prose; every other kind is a list of items. */
function isProse(kind: CVSectionKind | undefined): boolean {
  return kind === 'summary' || kind === 'project_description';
}

/** Words before a full stop that do not end a sentence. */
const ABBREVIATIONS = new Set([
  'etc', 'vs', 'inc', 'ltd', 'corp', 'approx', 'dept', 'govt', 'est', 'prof', 'bzw', 'ca', 'ggf', 'usw',
  // A capitalised grammar word after these is mid-sentence, not a sentence start (review of #171).
  'inkl', 'evtl', 'mio', 'mrd', 'abt', 'univ', 'mrs', 'eng', 'sog', 'vgl', 'max', 'min', 'nr', 'tel',
]);

/**
 * Does a sentence begin at `index` of `text`? Only at the very start of the text,
 * or after . ! ? and a space on the same line (a closing or opening quote or
 * bracket may sit between). A line break is no sentence start: a new line is an
 * item, and an item opens like a name. Neither is a full stop that ends an
 * abbreviation ("e.g.", "B.S.", "etc.", "Q3.").
 */
function startsSentence(text: string, index: number): boolean {
  const lead = text.slice(0, index);
  if (/^[\s"“„‘(\[]*$/u.test(lead)) return true;
  const end = /([.!?])["”)\]]*[^\S\r\n]+["“„‘(\[]*$/u.exec(lead);
  if (!end) return false;
  if (end[1] !== '.') return true;
  const previous = /([\p{L}\p{N}]+)["”)\]]*\.["”)\]]*[^\S\r\n]+["“„‘(\[]*$/u.exec(lead)?.[1]?.toLowerCase() ?? '';
  return previous.length >= 3 && !ABBREVIATIONS.has(previous);
}

/** Does `index` start a line of `text`, after at most a bullet marker or a number? */
function startsLine(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  return /^\s*(?:[-•·*]|\d{1,2}[.)])?\s*$/u.test(text.slice(lineStart, index));
}

/**
 * The words of `candidates` that `text` may use because of how they are
 * written: every place a word occurs must be lowercase, or capitalised as the
 * first word of a sentence of prose, or (only when `bulletStarts` is set, and
 * only in experience bullets, which the prompt makes start with a verb)
 * capitalised as the first word of a line. One capitalised mid-sentence,
 * all-capitals or list-item occurrence keeps the word checked everywhere.
 *
 * Fails closed: if this scan and claimWords() don't find the same number of
 * occurrences of a word (an exotic character, a symbol rewritten to a name), the
 * word is not freed.
 */
function caseSafeWords(
  text: string,
  candidates: ReadonlySet<string>,
  kind: CVSectionKind | undefined,
  bulletStarts: boolean,
): Set<string> {
  const freed = new Set<string>();
  const expected = new Map<string, number>();
  for (const word of claimWords(text)) if (candidates.has(word)) expected.set(word, (expected.get(word) ?? 0) + 1);
  if (expected.size === 0) return freed;

  // The same text claimWords() reads: compatibility-normalised, apostrophes gone.
  const raw = text.normalize('NFKC').replace(/['’]/g, '');
  const prose = isProse(kind);
  const bullets = bulletStarts && kind === 'experience_bullets';
  const seen = new Map<string, number>();
  const refused = new Set<string>();
  for (const match of raw.matchAll(/[\p{L}\p{N}]+/gu)) {
    const token = match[0];
    const keys = claimWords(token);
    if (keys.length !== 1 || !candidates.has(keys[0])) continue;
    const word = keys[0];
    seen.set(word, (seen.get(word) ?? 0) + 1);
    const lower = token === token.toLowerCase();
    const capitalised =
      token.length >= 2 && token.slice(1) === token.slice(1).toLowerCase() && token[0] !== token[0].toLowerCase();
    if (lower) continue;
    const index = match.index ?? 0;
    if (capitalised && prose && startsSentence(raw, index)) continue;
    if (capitalised && bullets && startsLine(raw, index)) continue;
    refused.add(word);
  }
  for (const [word, count] of expected) {
    if (seen.get(word) === count && !refused.has(word)) freed.add(word);
  }
  return freed;
}

/**
 * The grammar words of `language` that `text` may use without backing: lowercase,
 * or capitalised opening a sentence of prose, never capitalised mid-sentence and
 * never capitalised in a list section. A language other than English or German,
 * or no language, frees nothing.
 */
export function freedGrammarWords(text: string, language: string | undefined, kind: CVSectionKind | undefined): Set<string> {
  if (language !== 'en' && language !== 'de') return new Set();
  // A list item is not prose: no grammar word there, in any case ("man" is also a
  // tool name, review of #171).
  if (kind === 'custom_section_items') return new Set();
  return caseSafeWords(text, loaded(language), kind, false);
}

/**
 * The same case rule for words freed by their stem (an inflection of a listed
 * word, see isNeutralByStem in unified-writer-agent.ts): lowercase, or opening a sentence of prose, or opening a
 * bullet of an experience section. Not capitalised mid-sentence or as a list item
 * ("Scales", "Handles" read as names there).
 */
export function freedByStemCase(text: string, candidates: ReadonlySet<string>, kind: CVSectionKind | undefined): Set<string> {
  return caseSafeWords(text, candidates, kind, true);
}
