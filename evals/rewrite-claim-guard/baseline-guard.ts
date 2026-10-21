/**
 * BASELINE for evals/rewrite-claim-guard.ts: introducedClaims() exactly as it
 * stands on origin/main (PR #165 plus later merges; the guard has not changed
 * since f1426234, Worker 8b84f1ab), copied verbatim so the eval can score the
 * same rewrites with the old and the new guard. It carries its own copy of
 * origin/main's claim-token-normalization.ts (below), so a change to the app's
 * normalisation can never move the baseline. Not imported by the app.
 *
 * Round 3 note: round 1 and 2 of this eval imported claimWords from the working
 * tree, whose later version joined dotted degrees ("B.S." became "bs"). This
 * copy does not, so the baseline is main's, byte for byte in behaviour.
 */

// ---- origin/main: src/lib/agents/claim-token-normalization.ts (verbatim) ----

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
function words(text: string): string[] {
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
function claimAcronymPluralAliases(text: string): Map<string, string> {
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
function stemOf(word: string): string {
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

// ---- origin/main: the guard in src/lib/agents/unified-writer-agent.ts ----

const NEUTRAL_WORDS = new Set([
  // English grammar and connectives.
  'a', 'an', 'the', 'and', 'or', 'but', 'not', 'no', 'nor', 'of', 'to', 'in',
  'for', 'yet', 'once', 'alongside', 'either', 'neither', 'whether', 'always',
  'never', 'often', 'daily', 'weekly', 'monthly', 'directly', 'closely',
  'quickly', 'early', 'fully', 'clearly', 'say', 'says', 'tell', 'told',
  'fast', 'faster', 'slow', 'slower', 'easy', 'easier', 'hard', 'harder',
  'small', 'smaller', 'large', 'larger', 'big', 'bigger', 'wide', 'wider',
  'broad', 'broader', 'close', 'closer', 'low', 'lower', 'late', 'later',
  'fewer',
  'on', 'at', 'by', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'am', 'it', 'this', 'that', 'these', 'those', 'they', 'them', 'their',
  'there', 'then', 'than', 'we', 'our', 'us', 'you', 'your', 'yours', 'my',
  'me', 'mine', 'he', 'she', 'his', 'her', 'him', 'who', 'whom', 'whose',
  'what', 'when', 'where', 'which', 'while', 'why', 'how', 'with', 'from',
  'into', 'onto', 'about', 'around', 'across', 'within', 'through', 'between', 'after',
  'before', 'during', 'since', 'until', 'upon', 'over', 'under', 'out', 'off',
  'up', 'down', 'again', 'also', 'just', 'only', 'both', 'each', 'every',
  'any', 'all', 'some', 'many', 'much', 'more', 'most', 'less', 'least',
  'other', 'others', 'another', 'such', 'same', 'very', 'too', 'so', 'if',
  'because', 'per', 'via', 'can', 'could', 'will', 'would', 'shall', 'should',
  'may', 'might', 'must', 'do', 'does', 'did', 'doing', 'done', 'dont', 'wont',
  'have', 'has', 'had', 'having', 'here', 'still', 'even', 'well', 'good',
  'great', 'best', 'better', 'real', 'new', 'key', 'main', 'part', 'full',
  'side', 'thing', 'things', 'way', 'ways', 'year', 'years', 'month', 'months',
  'week', 'weeks', 'day', 'days', 'time', 'times', 'date', 'dates', 'said',
  'says', 'sure', 'need', 'needs', 'want', 'like', 'make', 'makes', 'made',
  'keep', 'keeps', 'use', 'uses', 'used', 'using', 'get', 'gets', 'give',
  'given', 'take', 'taken', 'put', 'end', 'next', 'first', 'last', 'now',
  'today', 'high', 'higher',
  // German grammar, so a German rewrite is not refused for saying "durch".
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem',
  'einer', 'und', 'oder', 'nicht', 'von', 'vom', 'mit', 'fuer', 'auf', 'aus',
  'bei', 'beim', 'im', 'ist', 'sind', 'war', 'waren', 'sich', 'als', 'auch',
  'durch', 'ueber', 'zur', 'zum', 'zu', 'wurde', 'wurden', 'sowie', 'dass',
  'wie', 'nach', 'vor', 'unter', 'dabei', 'diese', 'dieser', 'dieses',
  // Asking for an edit.
  'rewrite', 'rewritten', 'reword', 'rephrase', 'rework', 'revise', 'edit',
  'change', 'update', 'improve', 'tighten', 'tighter', 'shorten', 'shorter',
  'short', 'longer', 'long', 'trim', 'concise', 'brief', 'briefer', 'punchy',
  'punchier', 'stronger', 'clean', 'cleaner', 'simple', 'simpler', 'clear',
  'clearer', 'remove', 'removed', 'delete', 'drop', 'mention', 'mentions',
  'include', 'included', 'highlight', 'emphasise', 'emphasize', 'focus',
  'start', 'starting', 'begin', 'move', 'swap', 'split', 'merge', 'reorder',
  'order', 'rest', 'sound', 'sounds', 'sounding', 'read', 'reads', 'please',
  // The things being edited.
  'section', 'sections', 'summary', 'bullet', 'bullets', 'point', 'points',
  'item', 'items', 'line', 'lines', 'word', 'words', 'sentence', 'sentences',
  'paragraph', 'paragraphs', 'description', 'project', 'projects', 'role',
  'roles', 'job', 'experience', 'tone', 'voice', 'style', 'wording',
  'language', 'text', 'content', 'entry', 'title', 'heading', 'list',
  // Plain activity verbs and abstract nouns. None is a claim on its own: the
  // claim is the specific thing they are applied to, and that specific thing is
  // a word this list does not cover.
  'work', 'works', 'working', 'worked', 'team', 'teams', 'help', 'helped',
  'helping', 'build', 'built', 'building', 'grow', 'grew', 'growth', 'result',
  'results', 'impact', 'deliver', 'delivered', 'delivering', 'delivery',
  'support', 'supported', 'supporting', 'create', 'created', 'creating',
  'ship', 'shipped', 'shipping', 'scale', 'scaled', 'scaling', 'improved',
  'improving', 'increase', 'increased', 'reduce', 'reduced', 'launch',
  'launched', 'develop', 'developed', 'developing', 'design', 'designed',
  'designing', 'plan', 'planned', 'planning', 'people', 'company', 'companies',
  'customer', 'customers', 'client', 'clients', 'user', 'users', 'product',
  'products', 'process', 'processes', 'number', 'numbers', 'quality',
  'performance', 'service', 'services', 'report', 'reports', 'feedback',
  'write', 'writes', 'writing', 'wrote', 'written', 'share', 'shared',
  'sharing', 'cut', 'cuts', 'cutting', 'add', 'added', 'adding', 'set', 'sets',
  'setting', 'moved', 'moving', 'bring', 'brought', 'find', 'found', 'show',
  'showed', 'shown', 'see', 'saw', 'seen', 'know', 'known', 'learn', 'learned',
  'learning', 'join', 'joined', 'started', 'continue', 'continued', 'maintain',
  'maintained', 'maintaining', 'provide', 'provided', 'providing', 'ensure',
  'ensured', 'ensuring', 'handle', 'handled', 'handling', 'track', 'tracked',
  'tracking', 'test', 'tested', 'testing', 'fix', 'fixed', 'fixing', 'tool',
  'tools', 'system', 'systems', 'feature', 'features',
  // Not bare 'go': lowercased, it is also the Go language.
  'goes', 'going', 'gone', 'went',
]);

/** Is this word neutral, in its own right or once stemmed? */
function isNeutral(word: string): boolean {
  return NEUTRAL_WORDS.has(word) || NEUTRAL_WORDS.has(stemOf(word));
}

/** Every word, stem and compound-sized part the applicant's documents contain. */
interface SourceIndex {
  tokens: Set<string>;
  stems: Set<string>;
  parts: string[];
}

function indexSource(sourceText: string): SourceIndex {
  const tokens = new Set(words(sourceText));
  for (const alias of claimAcronymPluralAliases(sourceText).values()) tokens.add(alias);
  const stems = new Set<string>();
  const parts = new Set<string>();
  for (const token of tokens) {
    stems.add(stemOf(token));
    if (token.length >= 6) parts.add(token);
  }
  return { tokens, stems, parts: [...parts] };
}

// Role, ownership and title words: the section backs them only word for word.
// By stem, "Generated 200 leads" would back "Leading", "managed" would back
// "manager" and "Architected" would back "architects".
const ROLE_WORDS = new Set([
  'lead', 'leads', 'leading', 'led', 'leader', 'leaders', 'head', 'heads', 'headed', 'heading',
  'own', 'owns', 'owned', 'owner', 'owners', 'owning', 'founder', 'founders', 'founded', 'founding',
  'manager', 'managers', 'managed', 'managing', 'director', 'directors', 'directed', 'directing',
  'senior', 'principal', 'chief', 'chiefs', 'architect', 'architects', 'executive', 'executives',
  'president', 'presidents', 'partner', 'partners', 'associate', 'associates', 'supervisor',
  'supervisors', 'engineer', 'engineers', 'developer', 'developers', 'designer', 'designers',
  'consultant', 'consultants', 'analyst', 'analysts', 'scientist', 'scientists', 'intern', 'interns',
  'vp', 'vps', 'svp', 'evp', 'ceo', 'cto', 'cfo', 'coo', 'cio', 'cpo',
]);

/**
 * Is `word` an inflection ("running", "evaluates") of a word the section
 * already holds? Only an inflected word passes on a shared stem. A bare root
 * needs the exact word: "Goes beyond" must not back the language "Go", nor
 * "Excels at" the tool "Excel", and the section's paraphrases aren't verified
 * text the way the CVs are. Role and title words always need the exact word.
 */
function sectionInflects(word: string, before: SourceIndex): boolean {
  if (ROLE_WORDS.has(word)) return false;
  const stem = stemOf(word);
  return stem !== word && before.stems.has(stem);
}

/**
 * Claims the rewrite introduced: distinctive words that appear in the rewritten
 * section and nowhere in the applicant's own documents.
 *
 * Output-driven on purpose. Keying this check on the instruction meant the
 * loosest brief we ever send (a chip clicked with no note attached, which the
 * chat panel does deliberately) got the weakest verification, and it could only
 * ever catch a fabrication the user had asked for in those exact words. A word
 * that is in the rewrite, is not in either CV and is not ordinary English is an
 * introduced claim whether anyone asked for it or not. It also closes the
 * paraphrase hole: the prompt invites the model to reach for "the closest
 * genuinely documented transferable experience", so asking for Mandarin and
 * being handed "Fluent in Chinese" leaked nothing a literal instruction-term
 * test could see. "Chinese" is not in the CV, so this sees it.
 *
 * What it catches: proper nouns, tools, platforms, frameworks, employers,
 * places, credentials (MBA, AWS, PMP, all of them, because the floor is two
 * characters and not four), and any domain noun the CV never used.
 *
 * What it deliberately does NOT catch, and cannot:
 * - anything in NEUTRAL_WORDS, the tunable knob above
 * - a false claim assembled entirely from words the CV already contains, in a
 *   combination it never made. Word-level checking cannot see a false sentence
 *   built from true words. The prompt's own rules are the only guard there
 * - a one-character name, which the two-character floor drops
 *
 * The haystack is the Primary CV, the Master CV and the verified metrics. The
 * job description and the job's own fields are deliberately NOT in it: the
 * employer asking for a skill has never been the applicant having it.
 *
 * `beforeText` is the section as it stands, trusted as the user's own text: a
 * word it already contains is not one this rewrite introduced, and the rewrite
 * may reuse and recombine it. That's no escalation, since the same client can
 * write the section directly for free, and refusing would leave the word in
 * the CV anyway. It backs nothing it doesn't contain. Without this, every rewrite of a
 * kit-written section is refused, because the kit writer paraphrases ("Tested"
 * in the CV becomes "evaluated" in the summary) and a rewrite keeps the wording.
 */
export function baselineIntroducedClaims(afterText: string, sourceText: string, beforeText: string): string[] {
  const source = indexSource(sourceText);
  // The section's own words only: no acronym-plural aliases, so "VPs" can't back "VP".
  const beforeTokens = new Set(words(beforeText));
  const before: SourceIndex = { tokens: beforeTokens, stems: new Set([...beforeTokens].map(stemOf)), parts: [] };
  const acronymAliases = claimAcronymPluralAliases(afterText);
  const seen = new Set<string>();
  const introduced: string[] = [];

  for (const word of words(afterText)) {
    if (seen.has(word)) continue;
    seen.add(word);
    if (word.length < 2) continue;
    if (/^[\p{Nd}]+$/u.test(word)) continue;   // quantities are the number guard's job
    if (isNeutral(word)) continue;
    if (before.tokens.has(word)) continue;
    if (sectionInflects(word, before)) continue;
    if (source.tokens.has(word)) continue;
    if (source.stems.has(stemOf(word))) continue;
    const acronymBase = acronymAliases.get(word);
    if (acronymBase && (source.tokens.has(acronymBase) || source.stems.has(acronymBase))) continue;
    // A long word built around a word the CV does contain reads as a compound,
    // not a new claim: German and Dutch CVs make these constantly ("Optimierung
    // von Prozessen" rewritten as "Prozessoptimierung"). Only the candidate may
    // be the longer word, never the source, so a CV listing JavaScript still
    // cannot support a rewrite that says Java, and one listing "sales" still
    // cannot support "Salesforce".
    if (word.length >= 10 && source.parts.some((part) => word.includes(part))) continue;
    introduced.push(word);
  }
  return introduced;
}

