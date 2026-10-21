/**
 * Which words can carry a claim about the applicant, for the section-rewrite
 * claim guard (introducedClaims in unified-writer-agent.ts).
 *
 * The guard used to treat every word as a claim unless a hand-written list of
 * about 400 English words said otherwise, so any ordinary word a rewrite added
 * ("including", "additional", "evaluated") was refused. The line is now drawn
 * in three layers:
 *
 * 1. CLAIM WORDS, below: words that always count as claims. Seniority and
 *    standing, ownership and authority, scope, language proficiency,
 *    credentials, domain words, and tools or employers spelled like ordinary
 *    words (Go, Excel, React). They outrank everything else, NEUTRAL_WORDS
 *    included, and the German inflection fold never backs them.
 * 2. THE CLAIM-FREE LEXICON (claim-free-lexicon.generated.ts): function words,
 *    and the inflected verbs and the adverbs that the UD treebanks attest AND
 *    that passed a hand review (scripts/claim-lexicon-review.ts). A word the
 *    review rejected, or a rare word nobody reviewed ("orchestrated",
 *    "preeminent"), is never freed. Nouns, proper nouns and adjectives are
 *    never freed: standing, proficiency, traits, scope and domains live in
 *    adjectives, and "manual" turns the neutral "testing" into a skill claim.
 * 3. EVERYTHING ELSE is a claim: nouns, names, acronyms, adjectives, unknown
 *    words.
 *
 * Capitalisation also counts (claimCapitalisedWords): a word written as a name
 * is a claim, and a capital at the start of a sentence or bullet frees only a
 * function word or an inflected verb form ("Built", "Betreue"). Verbs are only
 * ever freed inflected: a bare verb ("resolve", "grab") may be a product.
 */
import {
  CLAIM_FREE_ADVERBS,
  CLAIM_FREE_FUNCTION,
  CLAIM_FREE_VERBS,
  FREE_IN_INSTRUCTIONS,
  REVIEWED_CLAIM_FORMS,
} from './claim-free-lexicon.generated';

const EN_IRREGULAR: Record<string, string[]> = {
  run: ['ran'], drive: ['drove', 'driven'], oversee: ['oversaw', 'overseen'], win: ['won'],
  hold: ['held'], lead: ['led'], swear: ['swore', 'sworn'], speak: ['spoke', 'spoken'],
  teach: ['taught'], bar: ['barred', 'barring'], admit: ['admitted', 'admitting'],
  excel: ['excelled', 'excelling'], control: ['controlled', 'controlling'],
};

/** Every English form of a verb lemma: -s, -ed, -ing and listed irregulars. Built from the lemma, never by stripping. */
function enVerbForms(lemma: string): string[] {
  const stem = lemma.endsWith('e') ? lemma.slice(0, -1) : lemma;
  const s = /(s|x|z|ch|sh)$/.test(lemma) ? `${lemma}es` : /[^aeiou]y$/.test(lemma) ? `${lemma.slice(0, -1)}ies` : `${lemma}s`;
  const ed = /[^aeiou]y$/.test(lemma) ? `${lemma.slice(0, -1)}ied` : `${stem}ed`;
  return [lemma, s, ed, `${stem}ing`, ...(EN_IRREGULAR[lemma] ?? [])];
}

/**
 * English claim verbs, as lemmas: every form counts. Most of these are not in
 * the lexicon anyway (the review rejected them or they are rare); listing them
 * here also makes them outrank NEUTRAL_WORDS.
 */
const EN_CLAIM_VERBS = [
  // Ownership and authority.
  'manage', 'direct', 'oversee', 'spearhead', 'run', 'drive', 'supervise', 'chair', 'steer', 'mentor',
  'coach', 'hire', 'recruit', 'champion', 'delegate', 'command', 'orchestrate', 'mastermind', 'preside',
  'administer', 'govern', 'coordinate', 'control', 'head', 'helm', 'captain', 'appoint',
  // Credentials, awards and standing events.
  'certify', 'license', 'licence', 'accredit', 'graduate', 'publish', 'patent', 'promote', 'elect',
  'nominate', 'award', 'win', 'rank', 'honor', 'honour', 'recognize', 'recognise', 'qualify', 'ordain',
  'notarize', 'notarise', 'apprentice', 'intern', 'swear', 'hold', 'earn', 'obtain', 'attain', 'possess',
  'bar', 'admit', 'train', 'pioneer', 'tenure',
  // Proficiency.
  'master', 'speak', 'excel',
];

/** English claim words that are not verbs, every form spelled out. */
const EN_CLAIM_WORDS = [
  // Seniority and standing.
  'senior', 'seniors', 'junior', 'juniors', 'principal', 'chief', 'expert', 'experts', 'expertise',
  'seasoned', 'veteran', 'veterans', 'accomplished', 'distinguished', 'renowned', 'recognized',
  'recognised', 'acclaimed', 'proven', 'extensive', 'experienced', 'deep', 'strategic', 'strong',
  'top', 'elite', 'prestigious', 'skilled', 'proficient', 'adept', 'versed', 'expertly', 'extensively',
  'deeply', 'strategically', 'knowledgeable', 'masterful', 'masterly', 'excellent', 'eminent',
  'prominent', 'celebrated', 'competent', 'conversant', 'acquainted', 'consummate', 'gifted', 'talented',
  'famous', 'foremost', 'preeminent', 'highest', 'exceptional', 'outstanding', 'impeccable', 'formally',
  // Ownership and authority.
  'management', 'oversight', 'supervision', 'cofounded', 'cofounder', 'cofounders', 'responsible',
  'responsibility', 'responsibilities', 'accountable', 'accountability', 'sole', 'singlehandedly',
  'independently', 'autonomously', 'commanding', 'controlling',
  // Scope.
  'global', 'international', 'worldwide', 'multinational', 'nationwide', 'countrywide', 'regional',
  'enterprise', 'enterprises', 'cross', 'companywide', 'organisationwide', 'organizationwide',
  'citywide', 'countywide', 'statewide', 'universal', 'globally', 'internationally', 'regionally', 'solely',
  // Language and proficiency.
  'fluent', 'fluently', 'fluency', 'native', 'natively', 'bilingual', 'trilingual', 'multilingual',
  'proficiency', 'advanced', 'intermediate', 'basic', 'conversational', 'professional', 'elementary',
  // Credentials and standing.
  'certification', 'certifications', 'accreditation', 'chartered', 'registered', 'postgraduate',
  'undergraduate', 'doctoral', 'tenured', 'bonded',
  // Domain words the lexicon would otherwise free. Relational adjectives
  // ("clinical", "financial") are already claims via WordNet; these are the
  // domain adjectives whose most frequent WordNet sense is qualitative ("legal"
  // as lawful).
  'consulting', 'distributed', 'embedded', 'mobile', 'agile', 'lean', 'remote', 'generative',
  'predictive', 'concurrent', 'functional', 'reactive', 'quantitative', 'qualitative',
  'legal', 'legally', 'commercial', 'governmental', 'nuclear', 'mechanical', 'civil', 'forensic',
  'regulatory', 'judicial', 'political', 'psychological', 'genetic', 'renewable', 'residential',
  'custodial',
  // Tools, products and employers spelled like ordinary words (bare form only:
  // "goes" is not the language Go).
  'go', 'excel', 'react', 'express', 'swift', 'flutter', 'elastic', 'ionic', 'linear', 'slack',
  'zoom', 'sketch', 'remix', 'compose', 'hibernate', 'struts', 'render', 'svelte', 'unreal', 'nuke',
  'spark', 'angular', 'bash', 'braze', 'retool', 'loom', 'rippling', 'intuit', 'meta', 'affirm',
  'concur', 'grab', 'rust', 'scratch', 'convex', 'redux', 'perforce', 'sage',
];

/**
 * German claim words as stems: every adjective ending (-e, -en, -er, -es, -em)
 * folds onto them, so "leitende", "zertifizierter" and "medizinischen" all
 * count. Umlauts are folded the way claimWords() folds them.
 */
const DE_CLAIM_STEMS = [
  // Seniority and standing.
  'leitend', 'fuehrend', 'federfuehrend', 'senior', 'junior', 'erfahren', 'langjaehrig', 'mehrjaehrig',
  'vieljaehrig', 'jahrzehntelang', 'fundiert', 'umfassend', 'tiefgehend', 'tiefgreifend', 'ausgewiesen',
  'nachweislich', 'versiert', 'routiniert', 'strategisch', 'ausgezeichnet', 'hochqualifiziert',
  'hochkaraetig', 'exzellent', 'hervorragend', 'herausragend', 'renommiert', 'professionell', 'hoechst',
  // Ownership and authority.
  'verantwortlich', 'eigenverantwortlich', 'alleinverantwortlich', 'selbststaendig', 'selbstaendig',
  // Scope.
  'international', 'global', 'weltweit', 'konzernweit', 'bundesweit', 'europaweit', 'unternehmensweit',
  // Language and proficiency.
  'fliessend', 'muttersprachlich', 'verhandlungssicher', 'sicher', 'zweisprachig', 'mehrsprachig',
  'fortgeschritten', 'kompetent', 'geschult', 'deutsch', 'englisch', 'franzoesisch', 'spanisch',
  'italienisch', 'portugiesisch', 'niederlaendisch', 'polnisch', 'russisch', 'tuerkisch', 'arabisch',
  'chinesisch', 'japanisch', 'koreanisch', 'persisch', 'ukrainisch', 'schwedisch', 'daenisch',
  'norwegisch', 'finnisch', 'griechisch', 'tschechisch', 'ungarisch', 'rumaenisch', 'kroatisch',
  'serbisch', 'bulgarisch', 'hebraeisch', 'walisisch',
  // Credentials.
  'zertifiziert', 'staatlich', 'anerkannt', 'examiniert', 'approbiert', 'diplomiert', 'promoviert',
  'habilitiert', 'vereidigt', 'geprueft', 'akkreditiert', 'lizenziert', 'ausgebildet', 'qualifiziert',
  'studiert', 'abgeschlossen', 'veroeffentlicht', 'befoerdert',
  // Domain.
  'medizinisch', 'klinisch', 'pharmazeutisch', 'juristisch', 'rechtlich', 'regulatorisch',
  'finanziell', 'steuerlich', 'kaufmaennisch', 'betriebswirtschaftlich', 'volkswirtschaftlich',
  'akademisch', 'wissenschaftlich', 'militaerisch', 'behoerdlich', 'industriell', 'elektrisch',
  'mechanisch', 'chemisch', 'statistisch', 'mathematisch', 'technisch', 'digital', 'mobil', 'agil',
  'verteilt', 'pflegerisch', 'therapeutisch', 'logistisch', 'vertrieblich', 'sozial',
  'wirtschaftlich', 'politisch', 'gewerblich', 'kuenstlerisch', 'redaktionell',
  'landwirtschaftlich', 'elektronisch',
];

/** German claim verbs, every form spelled out (verbs don't fold like adjectives). */
const DE_CLAIM_WORDS = [
  'leiten', 'leite', 'leitest', 'leitet', 'leitete', 'leiteten', 'geleitet', 'fuehren', 'fuehre',
  'fuehrst', 'fuehrt', 'fuehrte', 'fuehrten', 'gefuehrt', 'verantworten', 'verantworte',
  'verantwortet', 'verantwortete', 'verantworteten', 'manage', 'managte', 'managten', 'gemanagt',
  'steuere', 'steuerte', 'steuerten', 'gesteuert', 'gruende', 'gruendete', 'gruendeten', 'gegruendet',
  'mitgegruendet', 'beaufsichtigte', 'beaufsichtigt', 'coachte', 'gecoacht', 'rekrutierte',
  'rekrutiert', 'gewann', 'beherrschen', 'beherrsche', 'beherrschst', 'beherrscht', 'beherrschte',
  'beherrschten',
];

const CLAIM_WORDS = new Set([...EN_CLAIM_VERBS.flatMap(enVerbForms), ...EN_CLAIM_WORDS, ...DE_CLAIM_WORDS]);
const DE_STEMS = new Set(DE_CLAIM_STEMS);
const DE_ENDINGS = ['em', 'en', 'er', 'es', 'e'];

/** Does this word, in any of its forms, carry a claim regardless of part of speech? */
export function isClaimWord(word: string): boolean {
  if (CLAIM_WORDS.has(word) || DE_STEMS.has(word)) return true;
  for (const ending of DE_ENDINGS) {
    if (word.endsWith(ending) && DE_STEMS.has(word.slice(0, -ending.length))) return true;
  }
  // A language or a domain named in a compound adjective: "englischsprachigen",
  // "zahnmedizinische", "informationstechnisch", "arbeitsrechtlich".
  return /(?:sprachig|technisch|medizinisch|wissenschaftlich|wirtschaftlich|rechtlich)(?:e|en|er|es|em)?$/.test(word);
}

const FUNCTION = 1;
const FREE = 2;
const VERB = 4;
const REJECTED = 8;
const INSTRUCTION = 16;
let lexicon: Map<string, number> | null = null;

/**
 * The generated lexicon as one flag map. Built on first use, not at module
 * load, so a Worker that never rewrites a section never pays for it.
 */
function flags(word: string): number {
  if (!lexicon) {
    const map = new Map<string, number>();
    const mark = (list: string, flag: number) => {
      for (const w of list.split(' ')) map.set(w, (map.get(w) ?? 0) | flag);
    };
    mark(CLAIM_FREE_FUNCTION, FUNCTION | FREE);
    mark(CLAIM_FREE_VERBS, FREE | VERB);
    mark(CLAIM_FREE_ADVERBS, FREE);
    mark(REVIEWED_CLAIM_FORMS, REJECTED);
    mark(FREE_IN_INSTRUCTIONS, INSTRUCTION);
    lexicon = map;
  }
  return lexicon.get(word) ?? 0;
}

/**
 * Is this word form in the claim-free lexicon? `instruction`: reading a chat
 * request for the advisory "left out" list, where adjectives ("relevant") and
 * imperatives ("Tailor") are directions, not content. Never for a rewrite.
 */
export function isClaimFreeForm(word: string, instruction = false): boolean {
  const f = flags(word);
  return (f & FREE) !== 0 || (instruction && (f & INSTRUCTION) !== 0);
}

/** A closed-class word (article, pronoun, preposition, conjunction, auxiliary): never a name. */
export function isFunctionWord(word: string): boolean {
  return (flags(word) & FUNCTION) !== 0;
}

/**
 * May this word stand capitalised at the start of a sentence, line or bullet
 * without counting as a name? Function words and freed verb forms, which are
 * always inflected, may ("The", "Built", "Betreue"). An adjective, an adverb, a
 * noun or anything else may not: "Convex", "Seamless", "Avid" are products.
 */
export function isOpenerSafe(word: string): boolean {
  return (flags(word) & (FUNCTION | VERB)) !== 0;
}

/**
 * Must this word be backed word for word? Claim words, and every form of a
 * lemma the lexicon review rejected ("leite", "kompetente", "beherrsche"):
 * no inflection fold may back them from a different form.
 */
export function needsExactBacking(word: string): boolean {
  return isClaimWord(word) || (flags(word) & REJECTED) !== 0;
}
