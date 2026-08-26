/**
 * Useful Apply - Unified Agent Architecture
 * 
 * Useful Apply is the single intelligent agent that handles:
 * - Context Building: CV parsing, JD parsing, language detection, skill matching
 * - Document Generation: Optimized CV, cover letter, email generation
 * 
 * STREAMLINED FEATURES:
 * - No company research needed (relies on job description context)
 * - AI-native skill matching (no external RAG system)
 * 
 * Useful Apply Workflow:
 * 1. Parse CV and extract applicant profile
 * 2. Analyze job description requirements
 * 3. Detect language (EN/DE)
 * 4. Match skills and identify gaps
 * 5. Optimize CV for the position
 * 6. Compose tailored cover letter
 * 7. Generate application email
 */

import type { MasterContext, AgentEventHandler, AgentResult, TokenUsage } from './types';
import { callModel } from '@/lib/models';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import { loadApplicantDocuments } from '@/lib/storage/applicantStore';
import { fixTypos, sanitizeDashes } from '@/lib/config/typo-corrections';
import { COVER_LETTER_BLACKLIST, getAllBlacklistedPhrases } from '@/lib/config/cover-letter-blacklist';
import {
  extractApplicantProfile,
  parseJobDescription,
  detectLanguage,
  computeSkillMatch,
  extractVerifiedMetrics,
  type WithTokens,
} from './context-builder';
import {
  buildCVOptimizationSystemBlocks,
  buildCVOptimizationUserPrompt,
  buildCVSectionRewriteUserPrompt,
  isListSection,
  type CVSectionKind,
  type ResolvedCVSection,
} from './prompts/cv-prompt';
import { flattenUntrusted, sanitizeAdText } from './chat-tools/untrusted';
import {
  claimAcronymPluralAliases,
  claimStem as stemOf,
  claimWords as words,
} from './claim-token-normalization';
import { buildCoverLetterSystemBlocks, buildCoverLetterUserPrompt } from './prompts/cover-letter-prompt';
import { buildApplicationEmailUserPrompt, buildApplicationEmailSystemBlocks, buildFollowUpEmailUserPrompt, buildFollowUpEmailSystemBlocks } from './prompts/email-prompts';
import { buildFitAssessmentPrompt, buildFitAssessmentSystemBlocks, computeFitLevel } from './prompts/fit-assessment-prompt';
import { normalizeLanguage, type SupportedLanguage } from '@/lib/utils/language-detector';

// Re-export for backward compatibility
export { COVER_LETTER_BLACKLIST };

// =====================================================
// ORCHESTRATION RESULT TYPE
// =====================================================

export interface OrchestrationResult {
  context: MasterContext;
  totalLatencyMs: number;
}

// =====================================================
// SECTION REWRITE TYPES
// =====================================================

export type { CVSectionKind, ResolvedCVSection };

/** Why a rewrite was refused. Both mean the CV was left untouched. */
export type CVSectionRefusalReason = 'unsupported_number' | 'unsupported_claim';

interface CVSectionRewriteBase {
  kind: CVSectionKind;
  id?: string;
  label: string;
  /** Things the instruction asked for that the source CVs do not support. */
  omitted: string[];
  tokens: TokenUsage;
}

/**
 * The three honest outcomes of a section rewrite.
 *
 * `applied` is decided by comparing the returned section against the section as
 * it stands, not by asking the model whether it did anything. Unlike the cover
 * letter path, which has no before/after to diff, this one cannot report a
 * rewrite that did not happen.
 */
export type CVSectionRewriteResult =
  | (CVSectionRewriteBase & { status: 'applied'; content: string | string[] })
  | (CVSectionRewriteBase & { status: 'unchanged' })
  | (CVSectionRewriteBase & { status: 'refused'; reason: CVSectionRefusalReason; terms: string[] });

export interface UnifiedAgentInput {
  sessionId: string;
  jobDescription: string;
  primaryCV: string;
  masterCV?: string;
  jobPreferences?: MasterContext['jobPreferences'];
  generationContext?: LlmGenerationContext;
}

// =====================================================
// SECTION REWRITE: RESOLUTION AND VERIFICATION
// =====================================================

const SECTION_TEXT_MAX = 1600;   // one summary or project description
const SECTION_ITEM_MAX = 400;    // one bullet or custom-section item
const SECTION_MAX_BULLETS = 8;
const SECTION_MAX_ITEMS = 12;
const SECTION_MAX_OMITTED = 5;
const SECTION_OMITTED_MAX_CHARS = 120;

/**
 * Turn a caller's section request into a target resolved against the CV that
 * actually exists. Returns null when the kind is unknown, the id matches
 * nothing, or the section is empty, because there is nothing to rewrite then.
 */
export function resolveCVSectionTarget(
  cvData: NonNullable<MasterContext['optimizedCVData']>,
  request: { kind?: unknown; id?: unknown },
): ResolvedCVSection | null {
  const kind = request.kind;
  const id = typeof request.id === 'string' ? request.id : undefined;

  if (kind === 'summary') {
    const before = typeof cvData.summary === 'string' ? cvData.summary.trim() : '';
    if (!before) return null;
    return { kind, label: sectionLabel(cvData.sectionHeaders?.summary) || 'Summary', before };
  }

  if (kind === 'experience_bullets') {
    if (!id) return null;
    const entry = cvData.experience?.find((exp) => exp.id === id);
    const bullets = (entry?.bullets || []).filter((b) => typeof b === 'string' && b.trim());
    if (!entry || bullets.length === 0) return null;
    return {
      kind,
      id,
      label: `${sectionLabel(entry.position)} at ${sectionLabel(entry.company)}`,
      before: bullets,
    };
  }

  if (kind === 'project_description') {
    if (!id) return null;
    const entry = cvData.projects?.find((proj) => proj.id === id);
    const before = typeof entry?.description === 'string' ? entry.description.trim() : '';
    if (!entry || !before) return null;
    return {
      kind,
      id,
      label: sectionLabel(entry.name),
      before,
    };
  }

  if (kind === 'custom_section_items') {
    if (!id) return null;
    const entry = cvData.customSections?.find((s) => s.id === id);
    const items = (entry?.items || []).filter((i) => typeof i === 'string' && i.trim());
    if (!entry || items.length === 0) return null;
    return { kind, id, label: sectionLabel(entry.title), before: items };
  }

  return null;
}

/**
 * A label lifted out of client-supplied CV data. flattenUntrusted alone strips
 * control characters and angle brackets and caps the length, which leaves
 * "=== " chrome and shouted block labels intact, so it goes through
 * sanitizeAdText first like every other interpolated field. The provenance is
 * the user's own tailored CV rather than an ad, so this is self-inflicted only,
 * but it costs nothing.
 */
function sectionLabel(value: string | null | undefined): string {
  return flattenUntrusted(sanitizeAdText(value));
}

/** One comparable blob for a section, whichever shape it has. */
function sectionText(value: string | string[]): string {
  return Array.isArray(value) ? value.join('\n') : value;
}

// -----------------------------------------------------
// SECTION REWRITE: QUANTITIES
// -----------------------------------------------------

/**
 * The digit families this product actually meets. Dari and Farsi CVs are
 * written with Arabic-Indic and Eastern Arabic-Indic digits, and a guard that
 * only knows 0-9 reads "٤٠٪" as no number at all.
 *
 * A family not listed here is left exactly as it stands, so it still matches an
 * identical run in the source and never matches an ASCII run it is not.
 * Unknown families fail closed, not open.
 */
const DIGIT_FAMILY_ZEROS = [0x30, 0x660, 0x6f0, 0x966, 0x9e6, 0x0e50, 0xff10];

function toAsciiDigits(text: string): string {
  return text.replace(/\p{Nd}/gu, (char) => {
    const code = char.codePointAt(0) as number;
    for (const zero of DIGIT_FAMILY_ZEROS) {
      if (code >= zero && code <= zero + 9) return String(code - zero);
    }
    return char;
  });
}

/**
 * Spelled quantities and multipliers, canonicalised to the token a digit run
 * produces. "forty percent" and "40%" are the same claim, so a CV that supports
 * one supports the other, and "increased conversion by forty percent" can no
 * longer walk past a guard that only reads digits.
 *
 * A Map, not an object literal: a bare object answers to "constructor" and
 * "toString" with something truthy off its prototype.
 *
 * "one" is deliberately absent. In English it is a pronoun and an article far
 * more often than a count ("one of the largest", "no one"), and reading it as a
 * quantity refuses ordinary prose. A count starts inflating a claim at two.
 */
const NUMERAL_WORDS = new Map<string, string>([
  ['two', '2'], ['three', '3'], ['four', '4'], ['five', '5'], ['six', '6'],
  ['seven', '7'], ['eight', '8'], ['nine', '9'], ['ten', '10'],
  ['eleven', '11'], ['twelve', '12'], ['thirteen', '13'], ['fourteen', '14'],
  ['fifteen', '15'], ['sixteen', '16'], ['seventeen', '17'], ['eighteen', '18'],
  ['nineteen', '19'], ['twenty', '20'], ['thirty', '30'], ['forty', '40'],
  ['fourty', '40'], ['fifty', '50'], ['sixty', '60'], ['seventy', '70'],
  ['eighty', '80'], ['ninety', '90'], ['hundred', '100'], ['hundreds', '100'],
  ['thousand', '1000'], ['thousands', '1000'], ['million', '1000000'],
  ['millions', '1000000'], ['billion', '1000000000'], ['dozen', '12'],
  ['dozens', '12'],
  // Multipliers assert a quantity with no numeral in sight.
  ['double', 'x2'], ['doubled', 'x2'], ['doubling', 'x2'],
  ['triple', 'x3'], ['tripled', 'x3'], ['tripling', 'x3'],
  ['quadruple', 'x4'], ['quadrupled', 'x4'], ['quadrupling', 'x4'],
  ['half', 'x0.5'], ['halved', 'x0.5'], ['halving', 'x0.5'],
  // German, because German-language CVs are a supported output.
  ['zwei', '2'], ['drei', '3'], ['vier', '4'], ['fuenf', '5'], ['sechs', '6'],
  ['sieben', '7'], ['acht', '8'], ['neun', '9'], ['zehn', '10'],
  ['elf', '11'], ['zwanzig', '20'], ['dreissig', '30'], ['vierzig', '40'],
  ['fuenfzig', '50'], ['hundert', '100'], ['tausend', '1000'],
  ['millionen', '1000000'], ['verdoppelt', 'x2'], ['verdreifacht', 'x3'],
  ['halbiert', 'x0.5'],
]);

/**
 * Every quantity a piece of text asserts, digits and words alike.
 *
 * Thousands separators are removed so "150,000", "150.000" and "150000" all
 * read as the same number. Everything else stays split, so "3.5" is two runs
 * and cannot be confused with "35".
 */
function quantityTokens(text: string): string[] {
  const normalised = toAsciiDigits(foldUmlauts(text.toLowerCase()))
    .replace(/(\d)[.,   ](?=\d{3}\b)/g, '$1');
  const digits = normalised.match(/[\p{Nd}]+/gu) || [];
  const spelled = (normalised.match(/\p{L}+/gu) || [])
    .map((word) => NUMERAL_WORDS.get(word))
    .filter((value): value is string => Boolean(value));
  return [...digits, ...spelled];
}

// -----------------------------------------------------
// SECTION REWRITE: WORDS
// -----------------------------------------------------

/** German spelling variants fold, so "fünf" and "fuenf" are one word. */
function foldUmlauts(lower: string): string {
  return lower
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

/**
 * Words that carry no claim about the applicant: grammar, the vocabulary of
 * asking for an edit, and the plain verbs and nouns any CV prose is written in.
 * A rewrite may introduce these freely, because rephrasing what the source
 * already says is the intended job.
 *
 * THIS LIST IS THE TUNABLE KNOB, and it is all that stands between a useful
 * rewrite feature and one that refuses every reworded sentence. Say it plainly:
 * every word added here is a word the guard stops checking. The line drawn is
 * that a word stays neutral when it names an activity or an abstract shape, and
 * leaves when it asserts authority, scope, seniority, ownership, standing or a
 * quantity.
 *
 * What is deliberately OUT, and must stay out:
 * - seniority and standing: senior, principal, head, expert, strategic, strong
 * - ownership and scope: lead, led, leading, own, owned, manage, managed,
 *   direct, oversee, spearhead, run, ran, running, drive, drove
 * - every quantity, spelled or otherwise (those are NUMERAL_WORDS' business)
 * - every proper noun: tool, platform, framework, employer, place, credential
 *
 * Those are the words this guard exists to catch. Exempting one for convenience
 * is the weakening the rules forbid.
 */
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
]);

/** Is this word neutral, in its own right or once stemmed? */
function isNeutral(word: string): boolean {
  return NEUTRAL_WORDS.has(word) || NEUTRAL_WORDS.has(stemOf(word));
}

/**
 * Function words that are useless as topical anchors. Short on purpose: the
 * more words count as anchors, the more readily a number in the CV is accepted,
 * and this list only has to stop "the" from tying a street address to a revenue
 * claim.
 */
const ANCHOR_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'was', 'were', 'are',
  'has', 'have', 'had', 'into', 'over', 'than', 'then', 'their', 'there',
  'which', 'while', 'across', 'within', 'about', 'around', 'also', 'more', 'less',
  'other', 'such', 'been', 'being', 'per', 'via', 'not', 'all', 'any',
  'der', 'die', 'das', 'und', 'von', 'mit', 'fuer', 'den', 'dem', 'ein',
  'eine', 'als', 'bei', 'auf', 'aus', 'ist', 'sind', 'sich', 'durch', 'ueber',
]);

/** One sentence, bullet or line: the window a number's context lives in. */
function segments(text: string): string[] {
  return text
    .split(/[\n\r•·|;]+|(?<=[.!?])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Content words in a segment, for deciding whether two are about one thing. */
function anchorWords(text: string): Set<string> {
  return new Set(
    words(text).filter(
      (word) => word.length >= 3 && !ANCHOR_STOPWORDS.has(word) && !/^[\p{Nd}]+$/u.test(word),
    ),
  );
}

/**
 * Numbers the rewrite asserts that the applicant's documents do not support.
 *
 * `free` is what is already verified for THIS section: the section as it
 * stands, the CV entry it belongs to, and any metric the extraction pass pulled
 * out with its own context attached. Those numbers pass unconditionally, which
 * is what keeps a straight reword of an existing bullet cheap.
 *
 * `documents` is the Primary CV and the Master CV, and a number found there
 * supports the rewrite only when the two share at least one content word. A
 * real CV carries dozens of unrelated integers: a postcode, a street number, a
 * graduation year. A bare "does this digit exist anywhere in the document" test
 * hands every one of them to the model as cover for "reduced processing time by
 * 12%", and that is the miss that costs the applicant, so the number has to
 * come from a part of the CV talking about the same thing.
 *
 * Exact token matching, not substring: a substring test would let an invented
 * "50 clients" pass off the back of a "150000" in the Master CV. A number the
 * model reformats on its way out ("150,000" written back as "150K") reads as
 * unsupported and the rewrite is refused. That direction is the safe one: a
 * refusal costs a retry and no credits, a miss costs the applicant an
 * interview.
 */
function unsupportedNumbers(afterText: string, free: string, documents: string): string[] {
  const freeTokens = new Set(quantityTokens(free));

  const nearby = new Map<string, Set<string>>();
  for (const segment of segments(documents)) {
    const anchors = anchorWords(segment);
    if (anchors.size === 0) continue;
    for (const token of quantityTokens(segment)) {
      const bucket = nearby.get(token) ?? new Set<string>();
      for (const anchor of anchors) bucket.add(anchor);
      nearby.set(token, bucket);
    }
  }

  const unsupported = new Set<string>();
  for (const segment of segments(afterText)) {
    const anchors = anchorWords(segment);
    for (const token of quantityTokens(segment)) {
      if (freeTokens.has(token)) continue;
      const context = nearby.get(token);
      if (context && [...anchors].some((anchor) => context.has(anchor))) continue;
      unsupported.add(token);
    }
  }
  return [...unsupported];
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
 * The haystack is the Primary CV, the Master CV, the verified metrics and the
 * section as it stands. The job description and the job's own fields are
 * deliberately NOT in it: the employer asking for a skill has never been the
 * applicant having it.
 */
function introducedClaims(afterText: string, sourceText: string): string[] {
  const source = indexSource(sourceText);
  const acronymAliases = claimAcronymPluralAliases(afterText);
  const seen = new Set<string>();
  const introduced: string[] = [];

  for (const word of words(afterText)) {
    if (seen.has(word)) continue;
    seen.add(word);
    if (word.length < 2) continue;
    if (/^[\p{Nd}]+$/u.test(word)) continue;   // quantities are the number guard's job
    if (isNeutral(word)) continue;
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

/** Numerals that describe the shape of the output, not a claim in it. */
const SHAPE_NUMERAL = (() => {
  const numerals = `[\\p{Nd}]+|${[...NUMERAL_WORDS.keys()].join('|')}`;
  return new RegExp(
    `\\b(?:${numerals})(?:\\s+(?:to|or|and|bis|oder)\\s+(?:${numerals}))?` +
      `\\s+(?:bullets?|items?|sentences?|lines?|points?|paragraphs?|words?|sections?)\\b`,
    'giu',
  );
})();

/**
 * Words that describe the SHAPE of a requested rewrite: how long it should be,
 * how tight, how it should read. They are directions to the writer, never
 * something the applicant's CV has to support, so an instruction containing
 * them is not asking for content the documents can fail to back.
 *
 * SCOPED TO unsupportedInstructionTerms() AND NOTHING ELSE. introducedClaims()
 * does not see this list and must not: a rewrite that actually writes "sharper"
 * into the CV is still refused unless the applicant's own documents use the
 * word. This only stops the advisory list from telling a user their CV "doesn't
 * mention" the word "sharper" when all they asked for was a sharper line.
 *
 * The line drawn is the same one NEUTRAL_WORDS draws, and it is drawn tighter
 * here because this list gets no second look: a word stays out the moment it
 * could read as seniority, ownership, scope or a quantity. "senior", "lead",
 * "strategic", "expert" and every numeral above one are deliberately absent.
 */
const INSTRUCTION_SHAPE_WORDS = new Set([
  // How many, where the count is describing the output and not a team.
  'one', 'single',
  // How it should read.
  'sharp', 'sharper', 'crisp', 'crisper', 'snappy', 'snappier', 'tight',
  'lean', 'leaner', 'compact', 'dense', 'denser', 'wordy', 'verbose',
  'fluff', 'fluffy', 'waffle', 'repetitive', 'generic', 'bland', 'boring',
  'flat', 'formal', 'informal', 'casual', 'conversational', 'plain',
  'polished', 'readable', 'smooth', 'smoother', 'natural', 'tidy', 'tidier',
  // German, alongside the German grammar already in NEUTRAL_WORDS.
  'kuerzer', 'praegnanter', 'knapper', 'praeziser', 'schaerfer',
]);

/**
 * Distinctive words in the instruction that appear nowhere in the applicant's
 * own documents. Advisory now: the output check above is the lock, and this one
 * exists so we can tell the user which part of their request the CV could not
 * back, even when the model quietly dropped it and named nothing.
 *
 * A count that is only describing the shape of the output is stripped first, so
 * "make it five bullets" asks for nothing the CV has to support. The numeral is
 * spared only where a shape noun follows it, never globally: "a team of five"
 * is still a claim about the applicant, and it is still caught.
 *
 * Style words go the same way, via INSTRUCTION_SHAPE_WORDS. "Tighten my summary
 * into one sharper line" used to come back as ["one", "sharper"] and render as
 * "I left out one, sharper, your CV doesn't mention it", which is nonsense: the
 * user asked for a shape, not for content, and nothing was left out. Only
 * concrete content the documents cannot back belongs in this list.
 */
function unsupportedInstructionTerms(instruction: string, sourceText: string): string[] {
  const source = indexSource(sourceText);
  const seen = new Set<string>();
  const terms: string[] = [];
  const asked = instruction
    // "lead with the revenue result" is a shape request. The idiom is stripped
    // here and here only: "lead" stays a claim everywhere it could reach a CV.
    .replace(/\b(?:lead|leading|open|opening|start|starting)\s+with\b/gi, ' ')
    .replace(SHAPE_NUMERAL, ' ');
  const acronymAliases = claimAcronymPluralAliases(asked);
  for (const word of words(asked)) {
    if (seen.has(word)) continue;
    seen.add(word);
    if (word.length < 2) continue;
    if (/^[\p{Nd}]+$/u.test(word)) continue;
    if (isNeutral(word)) continue;
    if (INSTRUCTION_SHAPE_WORDS.has(word) || INSTRUCTION_SHAPE_WORDS.has(stemOf(word))) continue;
    if (source.tokens.has(word) || source.stems.has(stemOf(word))) continue;
    const acronymBase = acronymAliases.get(word);
    if (acronymBase && (source.tokens.has(acronymBase) || source.stems.has(acronymBase))) continue;
    terms.push(word);
  }
  return terms;
}

/** Strip the model's JSON out of whatever wrapping it came back in. */
function parseSectionResponse(raw: string): Record<string, unknown> {
  let jsonContent = raw.trim();
  if (jsonContent.startsWith('```json')) {
    jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonContent.startsWith('```')) {
    jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
  if (jsonMatch) jsonContent = jsonMatch[0];

  const parsed = JSON.parse(jsonContent) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Section rewrite response was not a JSON object');
  }
  return parsed as Record<string, unknown>;
}

type NormalizedOptimizedCvPayload = {
  personal: Record<string, unknown>;
  summary?: unknown;
  experience: Record<string, unknown>[];
  education: Record<string, unknown>[];
  skills: Record<string, unknown>[];
  languages: Record<string, unknown>[];
  certifications: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  customSections: Record<string, unknown>[];
  additionalInfo: unknown[];
  analysis?: Record<string, unknown>;
  sectionHeaders?: unknown;
  localizedStrings?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertStringField(
  record: Record<string, unknown>,
  key: string,
  label: string,
  options: { optional?: boolean; allowEmpty?: boolean; allowNull?: boolean } = {},
): void {
  const value = record[key];
  if (value === undefined || value === null || value === '') {
    if (options.optional || options.allowNull) {
      record[key] = undefined;
      return;
    }
    if (options.allowEmpty) {
      record[key] = '';
      return;
    }
    throw new Error(`${label} is missing`);
  }
  if (typeof value !== 'string' || (!options.allowEmpty && !value.trim())) {
    throw new Error(`${label} must be a${options.allowEmpty ? '' : ' non-empty'} string`);
  }
}

function assertStringArrayField(
  record: Record<string, unknown>,
  key: string,
  label: string,
  options: { optional?: boolean; allowEmpty?: boolean } = {},
): void {
  const value = record[key];
  if ((value === undefined || value === null) && options.optional) {
    record[key] = [];
    return;
  }
  if (!Array.isArray(value) || (!options.allowEmpty && value.length === 0)) {
    throw new Error(`${label} must be a${options.allowEmpty ? '' : ' non-empty'} array`);
  }
  if (!value.every((item) => typeof item === 'string' && Boolean(item.trim()))) {
    throw new Error(`${label} must contain only non-empty strings`);
  }
}

function normalizeOptimizedCvPayload(value: unknown): NormalizedOptimizedCvPayload {
  if (!isRecord(value)) {
    throw new Error('Optimized CV response was not an object');
  }

  const cv = value;
  const personal = cv.personal;
  if (!isRecord(personal)) {
    throw new Error('Optimized CV response has no personal section');
  }
  assertStringField(personal, 'fullName', 'Optimized CV full name');
  assertStringField(personal, 'email', 'Optimized CV email', { optional: true, allowEmpty: true });
  for (const key of ['phone', 'currentTitle', 'address', 'city', 'country', 'linkedIn', 'website', 'github', 'driverLicense', 'driver_license']) {
    assertStringField(personal, key, `Optimized CV personal.${key}`, { optional: true });
  }

  if (cv.summary === null) cv.summary = undefined;
  if (cv.summary !== undefined && typeof cv.summary !== 'string') {
    throw new Error('Optimized CV summary must be a string');
  }

  if (!Array.isArray(cv.experience)) {
    throw new Error('Optimized CV response has invalid experience');
  }
  for (const [index, value] of cv.experience.entries()) {
    if (!isRecord(value)) throw new Error(`Optimized CV experience ${index + 1} was not an object`);
    for (const key of ['company', 'position']) {
      assertStringField(value, key, `Optimized CV experience ${index + 1}.${key}`);
    }
    for (const key of ['id', 'location', 'startDate', 'endDate']) {
      assertStringField(value, key, `Optimized CV experience ${index + 1}.${key}`, { optional: true });
    }
    if (value.current !== undefined && typeof value.current !== 'boolean') {
      throw new Error(`Optimized CV experience ${index + 1}.current must be a boolean`);
    }
    assertStringArrayField(value, 'bullets', `Optimized CV experience ${index + 1}.bullets`, { optional: true, allowEmpty: true });
    assertStringArrayField(value, 'technologies', `Optimized CV experience ${index + 1}.technologies`, { optional: true, allowEmpty: true });
  }

  for (const key of ['education', 'skills', 'languages', 'certifications', 'projects', 'customSections'] as const) {
    if (cv[key] === undefined || cv[key] === null) cv[key] = [];
    if (!Array.isArray(cv[key])) {
      throw new Error(`Optimized CV response has invalid ${key}`);
    }
  }
  if (cv.additionalInfo === undefined || cv.additionalInfo === null) cv.additionalInfo = [];
  assertStringArrayField(cv, 'additionalInfo', 'Optimized CV additionalInfo', { allowEmpty: true });

  for (const [index, value] of (cv.education as unknown[]).entries()) {
    if (!isRecord(value)) throw new Error(`Optimized CV education ${index + 1} was not an object`);
    for (const key of ['institution', 'degree']) {
      assertStringField(value, key, `Optimized CV education ${index + 1}.${key}`);
    }
    for (const key of ['id', 'field', 'location', 'startDate', 'endDate', 'grade']) {
      assertStringField(value, key, `Optimized CV education ${index + 1}.${key}`, { optional: true });
    }
    assertStringArrayField(value, 'highlights', `Optimized CV education ${index + 1}.highlights`, { optional: true, allowEmpty: true });
  }

  for (const [index, value] of (cv.skills as unknown[]).entries()) {
    if (!isRecord(value)) throw new Error(`Optimized CV skill category ${index + 1} was not an object`);
    assertStringField(value, 'category', `Optimized CV skill category ${index + 1}.category`);
    assertStringArrayField(value, 'items', `Optimized CV skill category ${index + 1}.items`);
  }
  for (const [index, value] of (cv.languages as unknown[]).entries()) {
    if (!isRecord(value)) throw new Error(`Optimized CV language ${index + 1} was not an object`);
    assertStringField(value, 'language', `Optimized CV language ${index + 1}.language`);
    assertStringField(value, 'proficiency', `Optimized CV language ${index + 1}.proficiency`, { optional: true, allowEmpty: true });
  }
  for (const [index, value] of (cv.certifications as unknown[]).entries()) {
    if (!isRecord(value)) throw new Error(`Optimized CV certification ${index + 1} was not an object`);
    assertStringField(value, 'name', `Optimized CV certification ${index + 1}.name`);
    assertStringField(value, 'id', `Optimized CV certification ${index + 1}.id`, { optional: true });
    assertStringField(value, 'issuer', `Optimized CV certification ${index + 1}.issuer`, { optional: true, allowEmpty: true });
    assertStringField(value, 'date', `Optimized CV certification ${index + 1}.date`, { optional: true });
  }
  for (const [index, value] of (cv.projects as unknown[]).entries()) {
    if (!isRecord(value)) throw new Error(`Optimized CV project ${index + 1} was not an object`);
    for (const key of ['name', 'description']) {
      assertStringField(value, key, `Optimized CV project ${index + 1}.${key}`);
    }
    assertStringField(value, 'id', `Optimized CV project ${index + 1}.id`, { optional: true });
    assertStringArrayField(value, 'technologies', `Optimized CV project ${index + 1}.technologies`, { optional: true, allowEmpty: true });
    assertStringField(value, 'url', `Optimized CV project ${index + 1}.url`, { optional: true });
  }
  for (const [index, value] of (cv.customSections as unknown[]).entries()) {
    if (!isRecord(value)) throw new Error(`Optimized CV custom section ${index + 1} was not an object`);
    assertStringField(value, 'id', `Optimized CV custom section ${index + 1}.id`, { optional: true });
    assertStringField(value, 'title', `Optimized CV custom section ${index + 1}.title`);
    assertStringArrayField(value, 'items', `Optimized CV custom section ${index + 1}.items`);
  }

  if (!isRecord(cv.analysis)) throw new Error('Optimized CV response has no analysis object');
  assertStringField(cv.analysis, 'summary', 'Optimized CV analysis.summary');
  assertStringArrayField(cv.analysis, 'key_changes', 'Optimized CV analysis.key_changes');
  assertStringArrayField(cv.analysis, 'missing_keywords_added', 'Optimized CV analysis.missing_keywords_added', { allowEmpty: true });
  if (typeof cv.analysis.ats_compatibility !== 'number' || !Number.isFinite(cv.analysis.ats_compatibility) || cv.analysis.ats_compatibility < 0 || cv.analysis.ats_compatibility > 100) {
    throw new Error('Optimized CV analysis.ats_compatibility must be a number from 0 to 100');
  }

  for (const key of ['sectionHeaders', 'localizedStrings'] as const) {
    if (!isRecord(cv[key])) throw new Error(`Optimized CV response has no ${key} object`);
    if (!Object.values(cv[key]).every((entry) => typeof entry === 'string')) {
      throw new Error(`Optimized CV ${key} values must be strings`);
    }
  }

  const hasMeaningfulContent = cv.experience.length > 0
    || (cv.education as unknown[]).length > 0
    || (cv.skills as unknown[]).length > 0
    || (cv.projects as unknown[]).length > 0;
  if (!hasMeaningfulContent) {
    throw new Error('Optimized CV response had no experience, education, skills or projects');
  }

  return cv as unknown as NormalizedOptimizedCvPayload;
}

function countWords(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function validateFitAssessment(value: string): string {
  const assessment = sanitizeDashes(fixTypos(value)).trim();
  if (!assessment) throw new Error('Fit assessment was empty');
  if (countWords(assessment) > 200) throw new Error('Fit assessment exceeded 200 words');
  for (const heading of ['**Strengths:**', '**Gaps:**', '**Recommendation:**']) {
    if (!assessment.includes(heading)) throw new Error(`Fit assessment was missing ${heading}`);
  }
  return assessment;
}

class CoverLetterValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Cover letter validation failed: ${issues.join(', ')}`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findBoundaryBlacklistedPhrases(value: string): string[] {
  const normalized = value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ');
  return getAllBlacklistedPhrases().filter((phrase) => {
    const pattern = escapeRegExp(phrase.normalize('NFKC').toLocaleLowerCase())
      .replace(/\s+/g, '\\s+');
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${pattern}(?=$|[^\\p{L}\\p{N}])`, 'u').test(normalized);
  });
}

function validateCoverLetter(value: string): string {
  const coverLetter = sanitizeDashes(fixTypos(value)).trim();
  if (!coverLetter) throw new Error('Cover letter was empty');
  const issues: string[] = [];
  if (countWords(coverLetter) > 420) issues.push('full letter exceeded 420 words');
  issues.push(...findBoundaryBlacklistedPhrases(coverLetter).map((phrase) => `blacklisted phrase "${phrase}"`));
  if (issues.length > 0) throw new CoverLetterValidationError(issues);
  return coverLetter;
}

function normalizeComparisonText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
}

function parseStrictJsonObject(value: string, label: string): Record<string, unknown> {
  let jsonContent = value.trim();
  if (jsonContent.startsWith('```json')) {
    jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonContent.startsWith('```')) {
    jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
  if (jsonMatch) jsonContent = jsonMatch[0];
  const parsed = JSON.parse(jsonContent) as unknown;
  if (!isRecord(parsed)) throw new Error(`${label} was not a JSON object`);
  return parsed;
}

function countSentences(value: string): number {
  return value.split(/[.!?]+(?=\s|$)/u).map((part) => part.trim()).filter(Boolean).length;
}

function emailContentText(value: string): string {
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
  const contentLines = lines.length >= 4 ? lines.slice(1, -2) : lines;
  return contentLines.join(' ');
}

function contentWordCount(value: string): number {
  return countWords(emailContentText(value));
}

const GENERIC_EMAIL_GREETINGS: Record<SupportedLanguage, string> = {
  en: 'Dear Hiring Team,',
  de: 'Sehr geehrte Damen und Herren,',
  fr: 'Bonjour,',
  es: 'Estimado equipo de selección,',
  pt: 'Exma. Equipa de Recrutamento,',
  it: 'Gentile team di selezione,',
  nl: 'Geacht wervingsteam,',
};

function cleanEmailPlaceholders(value: string, language: SupportedLanguage): string {
  const greeting = GENERIC_EMAIL_GREETINGS[language];
  return value
    .replace(/Hi \[Name\],?/gi, greeting)
    .replace(/Dear \[Name\],?/gi, greeting)
    .replace(/Hallo \[Name\],?/gi, greeting)
    .replace(/Sehr geehrte\/?r? \[Name\],?/gi, greeting)
    .replace(/\[Vorname\]|\[Nachname\]/gi, '')
    .replace(/\[Name\]/gi, language === 'en' ? 'Hiring Team' : greeting.replace(/,$/, ''));
}

function validateApplicationEmail(
  parsed: Record<string, unknown>,
  language: SupportedLanguage,
  applicantName?: string,
): { subject: string; body: string } {
  if (typeof parsed.subject !== 'string' || typeof parsed.body !== 'string') {
    throw new Error('Application email subject and body must be strings');
  }
  const subject = sanitizeDashes(fixTypos(parsed.subject)).trim();
  let body = cleanEmailPlaceholders(parsed.body, language);
  body = sanitizeDashes(fixTypos(body)).trim();
  if (!subject || subject.length > 60) throw new Error('Application email subject was empty or exceeded 60 characters');
  if (!body || countSentences(emailContentText(body)) > 4) throw new Error('Application email body was empty or exceeded four sentences');
  if (/\[[^\]]+\]/u.test(body)) throw new Error('Application email contained a placeholder');
  if (applicantName?.trim() && !normalizeComparisonText(body).includes(normalizeComparisonText(applicantName))) {
    throw new Error('Application email signature was missing the applicant name');
  }
  return { subject, body };
}

function validateFollowUpEmail(
  parsed: Record<string, unknown>,
  language: SupportedLanguage,
  applicantName: string | undefined,
  recommendedDelay: number,
): { subject: string; body: string; recommendedDelay: number } {
  if (typeof parsed.subject !== 'string' || typeof parsed.body !== 'string') {
    throw new Error('Follow-up email subject and body must be strings');
  }
  const subject = sanitizeDashes(fixTypos(parsed.subject)).trim();
  let body = cleanEmailPlaceholders(parsed.body, language);
  body = sanitizeDashes(fixTypos(body)).trim();
  if (!subject || subject.length > 60) throw new Error('Follow-up email subject was empty or exceeded 60 characters');
  if (!body || contentWordCount(body) > 80) throw new Error('Follow-up email body was empty or exceeded 80 words');
  if (Number(parsed.recommendedDelay) !== recommendedDelay) throw new Error('Follow-up email returned an invalid recommended delay');
  if (/\[[^\]]+\]/u.test(body)) throw new Error('Follow-up email contained a placeholder');
  if (applicantName?.trim() && !normalizeComparisonText(body).includes(normalizeComparisonText(applicantName))) {
    throw new Error('Follow-up email signature was missing the applicant name');
  }
  return { subject, body, recommendedDelay };
}

/** Text that lands in the CV gets the same cleanup the other writers apply. */
function cleanSectionText(value: string): string {
  return sanitizeDashes(fixTypos(value)).trim();
}

/**
 * Validate the returned section against the shape its kind requires.
 *
 * Throws rather than salvaging. optimizedCVData drives all six CV templates and
 * the PDF export, so a response that is not exactly the right shape (a whole
 * CVData object, a bare string where bullets belong, an empty array) fails the
 * request. Digging a section out of a malformed response would be guessing at
 * intent with the user's CV.
 */
function validateSectionContent(kind: CVSectionKind, value: unknown): string | string[] {
  if (isListSection(kind)) {
    if (!Array.isArray(value)) {
      throw new Error(`Section rewrite for ${kind} did not return a list`);
    }
    const max = kind === 'experience_bullets' ? SECTION_MAX_BULLETS : SECTION_MAX_ITEMS;
    if (value.length === 0 || value.length > max) {
      throw new Error(`Section rewrite for ${kind} returned ${value.length} items`);
    }
    return value.map((item) => {
      if (typeof item !== 'string') {
        throw new Error(`Section rewrite for ${kind} returned a non-string item`);
      }
      const clean = cleanSectionText(item);
      if (!clean || clean.length > SECTION_ITEM_MAX) {
        throw new Error(`Section rewrite for ${kind} returned an unusable item`);
      }
      return clean;
    });
  }

  if (typeof value !== 'string') {
    throw new Error(`Section rewrite for ${kind} did not return text`);
  }
  const clean = cleanSectionText(value);
  if (!clean || clean.length > SECTION_TEXT_MAX) {
    throw new Error(`Section rewrite for ${kind} returned unusable text`);
  }
  return clean;
}

/**
 * The model's list of things it was asked for and left out. This is the one
 * model-authored string the user reads, so it is capped, flattened and
 * dash-stripped, and it is never allowed near the CV itself.
 */
function cleanOmitted(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => sanitizeDashes(flattenUntrusted(entry.slice(0, SECTION_OMITTED_MAX_CHARS))))
    .filter((entry) => entry && entry !== 'unknown')
    .slice(0, SECTION_MAX_OMITTED);
}

/**
 * The model's list, topped up with instruction terms the source documents do
 * not contain. A detected term already named inside a model entry is skipped,
 * so "your Munich fintech project" does not come back with a bare "munich"
 * beside it.
 *
 * Flat strings, capped in count and length, and both halves are already
 * flattened. The shape is deliberately dumb: whatever renders this cannot be
 * handed a sentence, a link or a rule.
 */
function mergeOmitted(modelAuthored: string[], detected: string[]): string[] {
  const merged = [...modelAuthored];
  const named = merged.join(' ').toLowerCase();
  for (const term of detected) {
    if (merged.length >= SECTION_MAX_OMITTED) break;
    if (named.includes(term)) continue;
    merged.push(term);
  }
  return merged.slice(0, SECTION_MAX_OMITTED);
}

// =====================================================
// UNIFIED WRITER AGENT
// =====================================================

export const unifiedWriterAgent = {
  /**
   * Main entry point - runs the complete workflow
   * Sequential execution: Context Building → Document Generation
   */
  async run(
    input: UnifiedAgentInput,
    emit: AgentEventHandler
  ): Promise<AgentResult<OrchestrationResult>> {
    const startTime = Date.now();
    
    // Initialize MasterContext
    const context: MasterContext = {
      sessionId: input.sessionId,
      jobDescription: input.jobDescription,
      rawCV: input.primaryCV,
      masterCV: input.masterCV,
      jobPreferences: input.jobPreferences,
    };

    try {
      // ============================================
      // PHASE 1: ANALYSIS & MATCHING
      // ============================================
      emit({ type: 'step_started', step: { id: 'analysis', description: 'Useful Apply: Parsing CV and analyzing job requirements' } });
      
      // Step 0: Load documents from storage if not provided
      if (!context.rawCV) {
        emit({ type: 'progress', percent: 5, message: 'Loading documents from storage...' });
        const docs = await loadApplicantDocuments(context.sessionId);
        if (docs.primaryCV) {
          context.rawCV = docs.primaryCV;
          console.log('[UsefulApply] Loaded primaryCV from storage');
        }
        if (docs.masterCV) {
          context.masterCV = docs.masterCV;
          console.log('[UsefulApply] Loaded masterCV from storage');
        }
        if (docs.certifications && docs.certifications.length > 0) {
          const certText = '\n\nCERTIFICATIONS:\n' + docs.certifications.join('\n');
          context.masterCV = (context.masterCV || '') + certText;
        }
      }

      // Validate CV content
      if (!context.rawCV) {
        throw new Error('No CV content available. Please upload a CV first.');
      }

      // Step 1+2: Extract applicant profile and parse JD in parallel — they're independent
      emit({ type: 'progress', percent: 10, message: 'Analyzing CV and job description...' });
      const [applicantSettled, jobSettled, metricsSettled, languageSettled] = await Promise.allSettled([
        this.extractApplicantProfile(context.rawCV, context.masterCV, input.generationContext),
        this.parseJobDescription(context.jobDescription, input.generationContext),
        this.extractVerifiedMetrics(context.rawCV, context.masterCV, input.generationContext),
        this.detectLanguage(context.jobDescription, input.generationContext),
      ]);
      // Critical: applicant and job must succeed
      if (applicantSettled.status === 'rejected') throw applicantSettled.reason;
      if (jobSettled.status === 'rejected') throw jobSettled.reason;
      const applicantResult = applicantSettled.value;
      const jobResult = jobSettled.value;
      context.applicant = applicantResult.result;
      context.job = jobResult.result;
      // Non-critical: metrics extraction failure is non-blocking
      context.verifiedMetrics = metricsSettled.status === 'fulfilled' ? metricsSettled.value.result : [];
      context.detectedLanguage = languageSettled.status === 'fulfilled' ? languageSettled.value : 'en';
      console.log('[UsefulApply] Detected language:', context.detectedLanguage);
      console.log('[UsefulApply] Verified metrics count:', context.verifiedMetrics?.length || 0);
      
      // Log warnings for missing critical fields
      if (!context.applicant?.name || context.applicant.name === 'Unknown') {
        console.warn('[UsefulApply] WARNING: Could not extract applicant name from CV');
      }
      if (!context.applicant?.email) {
        console.warn('[UsefulApply] WARNING: Could not extract applicant email from CV');
      }

      const analysisTokens: TokenUsage = {
        input: applicantResult.tokens.input + jobResult.tokens.input + (metricsSettled.status === 'fulfilled' ? metricsSettled.value.tokens.input : 0),
        output: applicantResult.tokens.output + jobResult.tokens.output + (metricsSettled.status === 'fulfilled' ? metricsSettled.value.tokens.output : 0),
      };
      emit({ type: 'step_completed', step: { id: 'analysis', description: 'CV parsed and job analyzed' }, tokens: analysisTokens });

      // Step 3: Compute skill match (depends on both applicant + job from above)
      emit({ type: 'step_started', step: { id: 'matching', description: 'Useful Apply: Matching skills and identifying gaps' } });
      emit({ type: 'progress', percent: 35, message: 'Analyzing skill match...' });
      const matchResult = await this.computeSkillMatch(context.applicant, context.job, context.rawCV, context.masterCV, input.generationContext);
      context.match = matchResult.result;

      emit({ type: 'step_completed', step: { id: 'matching', description: 'Skills matched' }, tokens: matchResult.tokens });

      // ============================================
      // PHASE 2: DOCUMENT GENERATION (parallelized)
      // CV, cover letter, and application email are independent — none reference each other's output.
      // Only follow-up email depends on application email content.
      // ============================================

      emit({ type: 'step_started', step: { id: 'cv_generation', description: 'Useful Apply: Optimizing CV for the position' } });
      emit({ type: 'step_started', step: { id: 'cover_letter', description: 'Useful Apply: Composing tailored cover letter' } });
      emit({ type: 'step_started', step: { id: 'email', description: 'Useful Apply: Generating application and follow-up emails' } });
      emit({ type: 'progress', percent: 45, message: 'Generating CV, cover letter, and email...' });

      const [cvResult, coverLetterResult, emailResult] = await Promise.all([
        this.generateOptimizedCVData(context, input.generationContext),
        this.generateCoverLetter(context, input.generationContext),
        this.generateApplicationEmail(context, input.generationContext),
      ]);

      const { cvData, legacyCV, tokens: cvTokens } = cvResult;
      context.optimizedCVData = cvData;
      context.optimizedCV = legacyCV;
      emit({ type: 'step_completed', step: { id: 'cv_generation', description: 'CV optimized' }, tokens: cvTokens });

      context.coverLetter = coverLetterResult.result;
      emit({ type: 'step_completed', step: { id: 'cover_letter', description: 'Cover letter ready' }, tokens: coverLetterResult.tokens });

      context.applicationEmail = emailResult.result;

      // Follow-up email depends on application email content
      emit({ type: 'progress', percent: 85, message: 'Composing follow-up email...' });
      let emailStepTokens: TokenUsage = { ...emailResult.tokens };
      let emailStepDescription = 'Email + follow-up ready';
      try {
        const followUpResult = await this.generateFollowUpEmail(context, input.generationContext);
        context.followUpEmail = followUpResult.result;
        emailStepTokens = {
          input: emailResult.tokens.input + followUpResult.tokens.input,
          output: emailResult.tokens.output + followUpResult.tokens.output,
        };
      } catch (error) {
        console.error('[UnifiedAgent] Follow-up generation failed after the application kit completed:', error);
        delete context.followUpEmail;
        emailStepDescription = 'Application email ready. Follow-up unavailable';
      }
      emit({ type: 'step_completed', step: { id: 'email', description: emailStepDescription }, tokens: emailStepTokens });

      emit({ type: 'progress', percent: 100, message: 'Complete!' });

      return {
        success: true,
        data: {
          context,
          totalLatencyMs: Date.now() - startTime,
        },
        latencyMs: Date.now() - startTime,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Agent execution failed';
      console.error('[UsefulApply] Error:', errorMessage);
      emit({ type: 'step_error', step: { id: 'karko_ai' }, error: errorMessage });
      
      return {
        success: false,
        error: errorMessage,
        latencyMs: Date.now() - startTime,
      };
    }
  },

  // =====================================================
  // CONTEXT BUILDING FUNCTIONS (delegated to context-builder.ts)
  // =====================================================

  extractApplicantProfile,
  parseJobDescription,
  detectLanguage,
  computeSkillMatch,
  extractVerifiedMetrics,

  // =====================================================
  // FIT ANALYSIS FUNCTIONS
  // =====================================================

  /**
   * Run fit analysis only (Phase 1 + assessment)
   * Returns the MasterContext with fit analysis populated (for context reuse)
   */
  async runFitAnalysis(
    input: UnifiedAgentInput,
    emit: AgentEventHandler
  ): Promise<AgentResult<OrchestrationResult>> {
    const startTime = Date.now();
    
    const context: MasterContext = {
      sessionId: input.sessionId,
      jobDescription: input.jobDescription,
      rawCV: input.primaryCV,
      masterCV: input.masterCV,
      jobPreferences: input.jobPreferences,
    };

    try {
      // Step 1: Extract applicant profile
      emit({ type: 'step_started', step: { id: 'analysis', description: 'Useful Apply: Parsing CV and analyzing job requirements' } });
      emit({ type: 'progress', percent: 10, message: 'Extracting applicant profile from CV...' });
      
      if (!context.rawCV) {
        const docs = await loadApplicantDocuments(context.sessionId);
        if (docs.primaryCV) context.rawCV = docs.primaryCV;
        if (docs.masterCV) context.masterCV = docs.masterCV;
        if (docs.certifications && docs.certifications.length > 0) {
          const certText = '\n\nCERTIFICATIONS:\n' + docs.certifications.join('\n');
          context.masterCV = (context.masterCV || '') + certText;
        }
      }

      if (!context.rawCV) {
        throw new Error('No CV content available. Please upload a CV first.');
      }

      // Run applicant extraction, JD parsing, and metrics extraction in parallel — they're independent
      const [applicantSettled2, jobSettled2, metricsSettled2, languageSettled2] = await Promise.allSettled([
        this.extractApplicantProfile(context.rawCV, context.masterCV, input.generationContext),
        this.parseJobDescription(context.jobDescription, input.generationContext),
        this.extractVerifiedMetrics(context.rawCV, context.masterCV, input.generationContext),
        this.detectLanguage(context.jobDescription, input.generationContext),
      ]);
      if (applicantSettled2.status === 'rejected') throw applicantSettled2.reason;
      if (jobSettled2.status === 'rejected') throw jobSettled2.reason;
      const applicantResult = applicantSettled2.value;
      const jobResult = jobSettled2.value;
      context.applicant = applicantResult.result;
      context.job = jobResult.result;
      context.verifiedMetrics = metricsSettled2.status === 'fulfilled' ? metricsSettled2.value.result : [];
      context.detectedLanguage = languageSettled2.status === 'fulfilled' ? languageSettled2.value : 'en';
      const analysisTokens2: TokenUsage = {
        input: applicantResult.tokens.input + jobResult.tokens.input + (metricsSettled2.status === 'fulfilled' ? metricsSettled2.value.tokens.input : 0),
        output: applicantResult.tokens.output + jobResult.tokens.output + (metricsSettled2.status === 'fulfilled' ? metricsSettled2.value.tokens.output : 0),
      };
      emit({ type: 'step_completed', step: { id: 'analysis', description: 'CV parsed and job analyzed' }, tokens: analysisTokens2 });

      // Step 2: Skill matching (depends on both applicant + job from above)
      emit({ type: 'step_started', step: { id: 'matching', description: 'Useful Apply: Matching skills and identifying gaps' } });
      
      emit({ type: 'progress', percent: 50, message: 'Analyzing skill match...' });
      const matchResult2 = await this.computeSkillMatch(context.applicant, context.job, context.rawCV, context.masterCV, input.generationContext);
      context.match = matchResult2.result;
      emit({ type: 'step_completed', step: { id: 'matching', description: 'Skills matched' }, tokens: matchResult2.tokens });

      // Step 3: Generate fit assessment
      emit({ type: 'step_started', step: { id: 'fit_assessment', description: 'Useful Apply: Assessing job fit' } });
      emit({ type: 'progress', percent: 70, message: 'Generating fit assessment...' });
      const fitResult = await this.generateFitAssessment(context, input.generationContext);
      context.fitAnalysis = fitResult.result;
      emit({ type: 'step_completed', step: { id: 'fit_assessment', description: 'Fit assessment complete' }, tokens: fitResult.tokens });

      emit({ type: 'progress', percent: 100, message: 'Fit analysis complete!' });

      return {
        success: true,
        data: {
          context,
          totalLatencyMs: Date.now() - startTime,
        },
        latencyMs: Date.now() - startTime,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Fit analysis failed';
      console.error('[UsefulApply] Fit analysis error:', errorMessage);
      emit({ type: 'step_error', step: { id: 'karko_ai' }, error: errorMessage });
      
      return {
        success: false,
        error: errorMessage,
        latencyMs: Date.now() - startTime,
      };
    }
  },

  /**
   * Run full generation with pre-built context (Phase 2 only)
   * Skips Phase 1 (CV parsing, JD parsing, skill matching) - reuses cached context
   */
  async runWithContext(
    context: MasterContext,
    emit: AgentEventHandler,
    generationContext?: LlmGenerationContext,
  ): Promise<AgentResult<OrchestrationResult>> {
    const startTime = Date.now();

    try {
      // Phase 2 only: Document Generation (parallelized)
      // CV, cover letter, and application email are independent — run in parallel.
      // Only follow-up email depends on application email content.

      emit({ type: 'step_started', step: { id: 'cv_generation', description: 'Useful Apply: Optimizing CV for the position' } });
      emit({ type: 'step_started', step: { id: 'cover_letter', description: 'Useful Apply: Composing tailored cover letter' } });
      emit({ type: 'step_started', step: { id: 'email', description: 'Useful Apply: Generating application and follow-up emails' } });
      emit({ type: 'progress', percent: 15, message: 'Generating CV, cover letter, and email...' });

      const [cvResult2, coverLetterResult2, emailResult2] = await Promise.all([
        this.generateOptimizedCVData(context, generationContext),
        this.generateCoverLetter(context, generationContext),
        this.generateApplicationEmail(context, generationContext),
      ]);

      const { cvData: cvData2, legacyCV: legacyCV2, tokens: cvTokens2 } = cvResult2;
      context.optimizedCVData = cvData2;
      context.optimizedCV = legacyCV2;
      emit({ type: 'step_completed', step: { id: 'cv_generation', description: 'CV optimized' }, tokens: cvTokens2 });

      context.coverLetter = coverLetterResult2.result;
      emit({ type: 'step_completed', step: { id: 'cover_letter', description: 'Cover letter ready' }, tokens: coverLetterResult2.tokens });

      context.applicationEmail = emailResult2.result;

      // Follow-up email depends on application email content
      emit({ type: 'progress', percent: 85, message: 'Composing follow-up email...' });
      let emailStepTokens2: TokenUsage = { ...emailResult2.tokens };
      let emailStepDescription2 = 'Email + follow-up ready';
      try {
        const followUpResult2 = await this.generateFollowUpEmail(context, generationContext);
        context.followUpEmail = followUpResult2.result;
        emailStepTokens2 = {
          input: emailResult2.tokens.input + followUpResult2.tokens.input,
          output: emailResult2.tokens.output + followUpResult2.tokens.output,
        };
      } catch (error) {
        console.error('[UnifiedAgent] Follow-up generation failed after the application kit completed:', error);
        delete context.followUpEmail;
        emailStepDescription2 = 'Application email ready. Follow-up unavailable';
      }
      emit({ type: 'step_completed', step: { id: 'email', description: emailStepDescription2 }, tokens: emailStepTokens2 });

      emit({ type: 'progress', percent: 100, message: 'Complete!' });

      return {
        success: true,
        data: {
          context,
          totalLatencyMs: Date.now() - startTime,
        },
        latencyMs: Date.now() - startTime,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Generation failed';
      console.error('[UsefulApply] Generation with context error:', errorMessage);
      emit({ type: 'step_error', step: { id: 'karko_ai' }, error: errorMessage });
      
      return {
        success: false,
        error: errorMessage,
        latencyMs: Date.now() - startTime,
      };
    }
  },

  /**
   * Generate a fit assessment paragraph using LLM
   * Classifies the fit as strong/good/weak and writes a concise assessment
   */
  async generateFitAssessment(
    context: MasterContext,
    generationContext?: LlmGenerationContext,
  ): Promise<WithTokens<NonNullable<MasterContext['fitAnalysis']>>> {
    const { applicant, job, match } = context;
    
    const fitLevel = computeFitLevel(match?.score ?? 0);

    const response = await callModel({
      task: 'fit_assessment',
      prompt: buildFitAssessmentPrompt({ applicant, job, match, masterCV: context.masterCV }),
      systemBlocks: buildFitAssessmentSystemBlocks(),
      generationContext,
    });

    const tokens: TokenUsage = {
      input: response.usage.inputTokens,
      output: response.usage.outputTokens,
    };

    return {
      result: {
        fitLevel,
        score: match?.score ?? 0,
        assessment: validateFitAssessment(response.content),
        matchingSkills: match?.matchedRequirements || [],
        missingSkills: match?.missingSkills || [],
      },
      tokens,
    };
  },

  // =====================================================
  // DOCUMENT GENERATION FUNCTIONS
  // =====================================================

  /**
   * Determine the output language based on detection and user override
   */
  getOutputLanguage(context: MasterContext): SupportedLanguage {
    return normalizeLanguage(context.userLanguageOverride || context.detectedLanguage);
  },

  /**
   * Generate optimized CV as structured JSON (CVData format)
   * AI outputs structured data directly - no text parsing needed
   */
  async generateOptimizedCVData(context: MasterContext, generationContext?: LlmGenerationContext): Promise<{
    cvData: NonNullable<MasterContext['optimizedCVData']>;
    legacyCV: { content: string; changes: Array<{ section: string; before: string; after: string; reason: string }> };
    tokens: TokenUsage;
  }> {
    const { applicant } = context;
    
    const outputLang = this.getOutputLanguage(context);
    const isGerman = outputLang === 'de';
    
    console.log('[UnifiedAgent] Generating structured CV data in language:', outputLang);

    // ---- PROMPT CACHING: Static instructions go into cacheable system blocks ----
    const cvOptimizationSystemBlocks = buildCVOptimizationSystemBlocks();

    const response = await callModel({
      task: 'optimize_cv',
      prompt: buildCVOptimizationUserPrompt(context, outputLang),
      systemBlocks: cvOptimizationSystemBlocks,
      jsonMode: true,
      generationContext,
    });

    const tokens: TokenUsage = {
      input: response.usage.inputTokens,
      output: response.usage.outputTokens,
    };

    try {
      let jsonContent = response.content.trim();
      
      // Remove markdown code blocks if present
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      // Extract only the first complete JSON object (handle AI adding extra text after)
      let braceCount = 0;
      let jsonStart = -1;
      let jsonEnd = -1;
      
      for (let i = 0; i < jsonContent.length; i++) {
        const char = jsonContent[i];
        if (char === '{') {
          if (braceCount === 0) jsonStart = i;
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0 && jsonStart !== -1) {
            jsonEnd = i + 1;
            break; // Found complete JSON object
          }
        }
      }
      
      if (jsonStart !== -1 && jsonEnd !== -1) {
        jsonContent = jsonContent.substring(jsonStart, jsonEnd);
        console.log('[UnifiedAgent] Extracted JSON from position', jsonStart, 'to', jsonEnd);
      } else {
        // Fallback to regex if brace counting fails
        const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonContent = jsonMatch[0];
        }
      }
      
      const parsed = normalizeOptimizedCvPayload(JSON.parse(jsonContent));
      const personal = parsed.personal;

      // Avoid logging PII (applicant name, raw JSON blobs) in production — these
      // land in CloudWatch / PostHog server logs and are not aggregated personal data.
      if (process.env.NODE_ENV !== 'production') {
        console.log('[UnifiedAgent] Parsed structured CV data:');
        console.log('  - Personal name present:', Boolean(personal.fullName));
        console.log('  - Experience entries:', parsed.experience?.length || 0);
        console.log('  - Skill categories:', parsed.skills?.length || 0);
        console.log('  - Projects:', parsed.projects?.length || 0);
        console.log('  - Additional Info:', parsed.additionalInfo?.length || 0);
        console.log('  - Custom Sections:', parsed.customSections?.length || 0);
        console.log('  - Driver License present:', Boolean(personal.driverLicense ?? personal.driver_license));
        console.log('  - sectionHeaders present:', Boolean(parsed.sectionHeaders));
        console.log('  - localizedStrings present:', Boolean(parsed.localizedStrings));
      }
      
      // Validate and provide defaults
      const cvData: NonNullable<MasterContext['optimizedCVData']> = {
        personal: {
          fullName: personal.fullName as string || applicant?.name || 'Unknown',
          email: personal.email as string || applicant?.email || '',
          phone: personal.phone as string | undefined,
          currentTitle: personal.currentTitle as string | undefined,
          address: personal.address as string | undefined,
          city: personal.city as string | undefined,
          country: personal.country as string | undefined,
          linkedIn: personal.linkedIn as string | undefined,
          website: personal.website as string | undefined,
          github: personal.github as string | undefined,
          driverLicense: (personal.driverLicense ?? personal.driver_license) as string | undefined,
        },
        summary: parsed.summary as string || '',
        experience: (parsed.experience || []).map((exp: Record<string, unknown>, idx: number) => ({
          id: exp.id as string || `exp-${idx + 1}`,
          company: exp.company as string || '',
          position: exp.position as string || '',
          location: exp.location as string | undefined,
          startDate: exp.startDate as string || '',
          endDate: typeof exp.endDate === 'string' ? exp.endDate : undefined,
          current: typeof exp.current === 'boolean' ? exp.current : false,
          bullets: (exp.bullets as string[]) || [],
          technologies: (exp.technologies as string[]) || undefined,
        })),
        education: (parsed.education || []).map((edu: Record<string, unknown>, idx: number) => ({
          id: edu.id as string || `edu-${idx + 1}`,
          institution: edu.institution as string || '',
          degree: edu.degree as string || '',
          field: edu.field as string | undefined,
          location: edu.location as string | undefined,
          startDate: edu.startDate as string | undefined,
          endDate: edu.endDate as string | undefined,
          grade: edu.grade as string | undefined,
          highlights: edu.highlights as string[] | undefined,
        })),
        skills: (parsed.skills || []).map((skill: Record<string, unknown>) => ({
          category: skill.category as string || '',
          items: (skill.items as string[]) || [],
        })),
        languages: (parsed.languages || []).map((lang: Record<string, unknown>) => ({
          language: lang.language as string || '',
          proficiency: lang.proficiency as string || '',
        })),
        certifications: (parsed.certifications || []).map((cert: Record<string, unknown>, idx: number) => ({
          id: cert.id as string || `cert-${idx + 1}`,
          name: cert.name as string || '',
          issuer: cert.issuer as string || '',
          date: cert.date as string | undefined,
        })),
        projects: (parsed.projects || []).map((proj: Record<string, unknown>, idx: number) => ({
          id: proj.id as string || `proj-${idx + 1}`,
          name: proj.name as string || '',
          description: proj.description as string || '',
          technologies: (proj.technologies as string[]) || [],
          url: proj.url as string | undefined,
        })),
        additionalInfo: (parsed.additionalInfo as string[])?.filter(Boolean) || undefined,
        customSections: (() => {
          const mapped = (parsed.customSections || []).map((s: Record<string, unknown>, idx: number) => ({
            id: s.id as string || `custom-${idx + 1}`,
            title: s.title as string || '',
            items: ((s.items as string[]) || []).filter(Boolean),
          })).filter((s: { items: string[] }) => s.items.length > 0);
          return mapped.length > 0 ? mapped : undefined;
        })(),
        analysis: parsed.analysis ? {
          summary: parsed.analysis.summary as string || '',
          key_changes: (parsed.analysis.key_changes as string[]) || [],
          ats_compatibility: (parsed.analysis.ats_compatibility as number) || 0,
          missing_keywords_added: (parsed.analysis.missing_keywords_added as string[]) || [],
        } : undefined,
        sectionHeaders: parsed.sectionHeaders as NonNullable<MasterContext['optimizedCVData']>['sectionHeaders'],
        localizedStrings: parsed.localizedStrings as NonNullable<MasterContext['optimizedCVData']>['localizedStrings'],
      };
      
      // Generate legacy text format for backward compatibility
      const legacyContent = this.cvDataToText(cvData, isGerman);
      
      return {
        cvData,
        legacyCV: {
          content: fixTypos(legacyContent),
          changes: [],
        },
        tokens,
      };
    } catch (error) {
      console.error('[UnifiedAgent] Failed to parse structured CV JSON:', error);
      throw new Error('CV generation returned invalid structured data.');
    }
  },

  /**
   * Rewrite ONE section of an already-tailored CV and return just that section.
   *
   * One section per call is a hard rule. A whole-CV rewrite is what
   * generateOptimizedCVData is for, and widening the scope here would put the
   * entire document behind a single free-text instruction.
   *
   * Runs on the same cached anti-hallucination system blocks as the full CV
   * generation. Reuses the `optimize_cv` task so the model, temperature and
   * provider are identical; the route separates the two by `operation`.
   *
   * Never returns a partly trusted result. Either the section validated and
   * both source guards passed, or the CV is left exactly as it was.
   */
  async rewriteCVSection(
    context: MasterContext,
    section: ResolvedCVSection,
    generationContext?: LlmGenerationContext,
  ): Promise<CVSectionRewriteResult> {
    console.log('[UnifiedAgent] Rewriting CV section:', section.kind);
    const outputLang = this.getOutputLanguage(context);

    const response = await callModel({
      task: 'optimize_cv',
      prompt: buildCVSectionRewriteUserPrompt(context, section, outputLang),
      systemBlocks: buildCVOptimizationSystemBlocks(),
      jsonMode: true,
      generationContext,
    });

    const tokens: TokenUsage = {
      input: response.usage.inputTokens,
      output: response.usage.outputTokens,
    };

    // Deliberately not wrapped in a try/catch with a fallback. The other
    // writers can fall back to raw text because a rough letter is still a
    // letter; a rough CVData fragment breaks six templates and the PDF export.
    const parsed = parseSectionResponse(response.content);
    const content = validateSectionContent(section.kind, parsed.content);
    const omitted = cleanOmitted(parsed.omitted);

    const beforeText = sectionText(section.before);
    const afterText = sectionText(content);

    // The applicant's own documents, and nothing employer-authored. The job
    // description and the parsed job fields are absent on purpose.
    const documents = [context.rawCV, context.masterCV].filter(Boolean).join('\n');

    // The current tailored section can be client-edited, so it is wording
    // context only. It never authorizes a number, skill or claim. Verified
    // metrics are server-extracted literal substrings of the same source CVs.
    const verified = (context.verifiedMetrics || []).join('\n');
    const sourceText = `${verified}\n${documents}`;

    // What the user asked for and did not get. The model's own list first,
    // since it is the better-worded half, topped up with instruction terms the
    // documents cannot back. Advisory, and only half of it is verifiable: the
    // model authored its entries and could name anything, so nothing downstream
    // may treat this as proof of what was dropped. It is capped, flattened and
    // dash-stripped, so it cannot carry prose or markup into the UI either way.
    const askedFor = context.userInstruction
      ? unsupportedInstructionTerms(context.userInstruction, sourceText)
      : [];
    const base = {
      kind: section.kind,
      id: section.id,
      label: section.label,
      omitted: mergeOmitted(omitted, askedFor),
      tokens,
    };

    if (afterText === beforeText) {
      return { ...base, status: 'unchanged' };
    }

    const fabricatedNumbers = unsupportedNumbers(afterText, verified, documents);
    if (fabricatedNumbers.length > 0) {
      console.warn('[UnifiedAgent] Section rewrite refused, unverified numbers:', fabricatedNumbers.length);
      return { ...base, status: 'refused', reason: 'unsupported_number', terms: fabricatedNumbers };
    }

    // Unconditional, and driven by what came back rather than by what was
    // asked. A rewrite with no instruction is the loosest brief we send, so it
    // is the last thing that should be running without a claim check.
    const introduced = introducedClaims(afterText, sourceText);
    if (introduced.length > 0) {
      console.warn('[UnifiedAgent] Section rewrite refused, claim not in source CVs:', introduced.length);
      return { ...base, status: 'refused', reason: 'unsupported_claim', terms: introduced };
    }

    return { ...base, status: 'applied', content };
  },

  /**
   * Convert CVData to plain text format (for backward compatibility)
   */
  cvDataToText(cvData: NonNullable<MasterContext['optimizedCVData']>, isGerman: boolean): string {
    const lines: string[] = [];
    
    // Personal info
    lines.push(cvData.personal.fullName);
    if (cvData.personal.currentTitle) lines.push(cvData.personal.currentTitle);
    const contactParts = [
      cvData.personal.email,
      cvData.personal.phone,
      cvData.personal.city,
      cvData.personal.linkedIn,
    ].filter(Boolean);
    if (contactParts.length) lines.push(contactParts.join(' | '));
    lines.push('');
    
    // Summary
    if (cvData.summary) {
      lines.push(isGerman ? 'PROFIL' : 'PROFESSIONAL SUMMARY');
      lines.push(cvData.summary);
      lines.push('');
    }
    
    // Skills
    if (cvData.skills.length) {
      lines.push(isGerman ? 'FÄHIGKEITEN' : 'CORE COMPETENCIES');
      for (const skill of cvData.skills) {
        if (skill.category) {
          lines.push(`${skill.category}: ${skill.items.join(', ')}`);
        } else {
          lines.push(skill.items.join(', '));
        }
      }
      lines.push('');
    }
    
    // Experience
    if (cvData.experience.length) {
      lines.push(isGerman ? 'BERUFSERFAHRUNG' : 'PROFESSIONAL EXPERIENCE');
      for (const exp of cvData.experience) {
        const datePart = exp.current 
          ? `${exp.startDate} – ${isGerman ? 'Gegenwart' : 'Present'}`
          : `${exp.startDate} – ${exp.endDate || ''}`;
        lines.push(`${exp.position} | ${exp.company} | ${datePart}`);
        if (exp.location) lines.push(exp.location);
        for (const bullet of exp.bullets) {
          lines.push(`• ${bullet}`);
        }
        lines.push('');
      }
    }
    
    // Education
    if (cvData.education.length) {
      lines.push(isGerman ? 'AUSBILDUNG' : 'EDUCATION');
      for (const edu of cvData.education) {
        lines.push(`${edu.degree}${edu.field ? ` in ${edu.field}` : ''}`);
        lines.push(`${edu.institution}${edu.endDate ? ` | ${edu.endDate}` : ''}`);
        lines.push('');
      }
    }
    
    // Languages
    if (cvData.languages.length) {
      lines.push(isGerman ? 'SPRACHEN' : 'LANGUAGES');
      for (const lang of cvData.languages) {
        lines.push(lang.proficiency ? `${lang.language}: ${lang.proficiency}` : lang.language);
      }
      lines.push('');
    }
    
    // Certifications
    if (cvData.certifications.length) {
      lines.push(isGerman ? 'ZERTIFIKATE' : 'CERTIFICATIONS');
      for (const cert of cvData.certifications) {
        lines.push(`${cert.name} – ${cert.issuer}${cert.date ? ` | ${cert.date}` : ''}`);
      }
    }

    // Projects
    if (cvData.projects && cvData.projects.length > 0) {
      lines.push('');
      lines.push(isGerman ? 'PROJEKTE' : 'PROJECTS');
      for (const proj of cvData.projects) {
        lines.push(`${proj.name}${proj.url ? ` (${proj.url})` : ''}`);
        if (proj.description) lines.push(proj.description);
        if (proj.technologies && proj.technologies.length > 0) {
          lines.push(`Technologies: ${proj.technologies.join(', ')}`);
        }
        lines.push('');
      }
    }

    // Additional Info (driver's license, etc.)
    const additionalItems: string[] = [];
    if (cvData.additionalInfo && cvData.additionalInfo.length > 0) {
      additionalItems.push(...cvData.additionalInfo);
    }
    if (cvData.personal.driverLicense && !additionalItems.some(item => item.toLowerCase().includes('license') || item.toLowerCase().includes('führerschein'))) {
      additionalItems.push(isGerman ? `Führerschein: ${cvData.personal.driverLicense}` : `Driver's License: ${cvData.personal.driverLicense}`);
    }
    if (additionalItems.length > 0) {
      lines.push('');
      lines.push(isGerman ? 'WEITERE INFORMATIONEN' : 'ADDITIONAL INFORMATION');
      for (const item of additionalItems) {
        lines.push(`• ${item}`);
      }
    }

    // Custom Sections (achievements, references, volunteer, publications, etc.)
    if (cvData.customSections && cvData.customSections.length > 0) {
      for (const section of cvData.customSections) {
        lines.push('');
        lines.push(section.title.toUpperCase());
        for (const item of section.items) {
          lines.push(`• ${item}`);
        }
      }
    }

    return lines.join('\n');
  },

  /**
   * Generate cover letter using Problem-Solution format
   */
  async generateCoverLetter(context: MasterContext, generationContext?: LlmGenerationContext): Promise<WithTokens<string>> {
    const outputLang = this.getOutputLanguage(context);
    
    console.log('[UnifiedAgent] Generating cover letter in language:', outputLang);

    // ---- PROMPT CACHING: Static cover letter rules into cacheable system blocks ----
    const coverLetterSystemBlocks = buildCoverLetterSystemBlocks();
    const basePrompt = buildCoverLetterUserPrompt(context);

    const response = await callModel({
      task: 'write_cover_letter',
      prompt: basePrompt,
      systemBlocks: coverLetterSystemBlocks,
      generationContext,
    });

    let tokens: TokenUsage = {
      input: response.usage.inputTokens,
      output: response.usage.outputTokens,
    };

    try {
      return { result: validateCoverLetter(response.content), tokens };
    } catch (error) {
      if (!(error instanceof CoverLetterValidationError)) throw error;
      console.warn('[UnifiedAgent] Retrying cover letter after validation miss:', error.issues.join(', '));
      const retry = await callModel({
        task: 'write_cover_letter',
        prompt: `${basePrompt}\n\n=== REQUIRED CORRECTION ===\nThe previous draft failed validation for: ${error.issues.join('; ')}. Rewrite the complete letter once. Remove every named phrase and keep the full letter, including header and signature, within 420 words. Preserve every factuality rule.`,
        systemBlocks: coverLetterSystemBlocks,
        generationContext,
      });
      tokens = {
        input: tokens.input + retry.usage.inputTokens,
        output: tokens.output + retry.usage.outputTokens,
      };
      return { result: validateCoverLetter(retry.content), tokens };
    }
  },

  /**
   * Generate application email
   * Returns JSON with separate subject and body fields
   */
  async generateApplicationEmail(context: MasterContext, generationContext?: LlmGenerationContext): Promise<WithTokens<{ subject: string; body: string }>> {
    const outputLang = this.getOutputLanguage(context);
    
    console.log('[UnifiedAgent] Generating email in language:', outputLang);

    const response = await callModel({
      task: 'write_email',
      prompt: buildApplicationEmailUserPrompt(context),
      systemBlocks: buildApplicationEmailSystemBlocks(),
      jsonMode: true,
      generationContext,
    });

    const tokens: TokenUsage = {
      input: response.usage.inputTokens,
      output: response.usage.outputTokens,
    };

    const parsed = parseStrictJsonObject(response.content, 'Application email response');
    return {
      result: validateApplicationEmail(parsed, outputLang, context.applicant?.name),
      tokens,
    };
  },

  /**
   * Generate follow-up email to send 5-7 days after the primary application email
   * Uses a DIFFERENT achievement than the primary email for the value hook
   */
  async generateFollowUpEmail(context: MasterContext, generationContext?: LlmGenerationContext): Promise<WithTokens<{ subject: string; body: string; recommendedDelay: number }>> {
    const { applicant } = context;
    
    const outputLang = this.getOutputLanguage(context);
    const isGerman = outputLang === 'de';
    const recommendedDelay = isGerman ? 7 : 5;
    
    console.log('[UnifiedAgent] Generating follow-up email in language:', outputLang);

    const response = await callModel({
      task: 'write_follow_up_email',
      prompt: buildFollowUpEmailUserPrompt(context),
      systemBlocks: buildFollowUpEmailSystemBlocks(),
      jsonMode: true,
      generationContext,
    });

    const tokens: TokenUsage = {
      input: response.usage.inputTokens,
      output: response.usage.outputTokens,
    };

    const parsed = parseStrictJsonObject(response.content, 'Follow-up email response');
    return {
      result: validateFollowUpEmail(parsed, outputLang, applicant?.name, recommendedDelay),
      tokens,
    };
  },
};

// REMOVED_OLD_CODE_MARKER — the old inline prompts for cover letter, email, and follow-up
// have been extracted to src/lib/agents/prompts/

// =====================================================
// CONVENIENCE FUNCTIONS
// =====================================================

/**
 * Main entry point - runs the unified agent workflow
 */
export async function runJobCopilot(
  input: UnifiedAgentInput,
  emit: AgentEventHandler
): Promise<AgentResult<OrchestrationResult>> {
  return unifiedWriterAgent.run(input, emit);
}

/**
 * Run fit analysis only (Phase 1 + assessment)
 */
export async function runFitAnalysis(
  input: UnifiedAgentInput,
  emit: AgentEventHandler
): Promise<AgentResult<OrchestrationResult>> {
  return unifiedWriterAgent.runFitAnalysis(input, emit);
}

/**
 * Run full generation with pre-built context (Phase 2 only)
 */
export async function runWithContext(
  context: MasterContext,
  emit: AgentEventHandler,
  generationContext?: LlmGenerationContext,
): Promise<AgentResult<OrchestrationResult>> {
  return unifiedWriterAgent.runWithContext(context, emit, generationContext);
}

// END OF FILE — old inline code removed, now in:
// - src/lib/agents/context-builder.ts
// - src/lib/agents/prompts/cv-prompt.ts
// - src/lib/agents/prompts/cover-letter-prompt.ts
// - src/lib/agents/prompts/email-prompts.ts
// - src/lib/agents/prompts/fit-assessment-prompt.ts
