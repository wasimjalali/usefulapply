/**
 * Which words can carry a claim about the applicant, for the section-rewrite
 * claim guard (introducedClaims in unified-writer-agent.ts).
 *
 * The guard used to treat every word as a claim unless a hand-written list of
 * about 400 English words said otherwise, so any ordinary word a rewrite added
 * ("including", "additional", "rigorously") was refused. The line is now drawn
 * by part of speech, in three layers:
 *
 * 1. CLAIM WORDS, below: verbs and adjectives that DO carry a claim even though
 *    their part of speech usually doesn't. Seniority and standing, ownership
 *    and authority, scope, language proficiency, credentials, domain words and
 *    tools or employers spelled like ordinary words (Go, Excel, React).
 *    These always count as claims. This list is the tunable knob now, and
 *    every word added here is a word the guard checks more strictly.
 * 2. THE CLAIM-FREE LEXICON (claim-free-lexicon.generated.ts): English and
 *    German function words, verbs, qualitative adjectives and adverbs, built
 *    from Open English WordNet and Universal Dependencies treebanks by
 *    scripts/build-claim-free-lexicon.ts. Nouns, proper nouns and relational
 *    adjectives ("clinical", "financial") are never in it.
 * 3. EVERYTHING ELSE is a claim: nouns, names, acronyms, unknown words. Tools,
 *    employers, products, titles, certifications, degrees and domain nouns
 *    live here, and unknown is the safe default for them.
 *
 * The guard also reads capitalisation (claimCapitalisedWords): a word written
 * with a capital in the middle of a sentence is a name, so the lexicon cannot
 * free it.
 */
import {
  CLAIM_FREE_ADJECTIVES,
  CLAIM_FREE_OTHER,
  CLAIM_FREE_VERBS,
} from './claim-free-lexicon.generated';

/**
 * English claim words, every form spelled out, adverbs included. Forms are
 * never derived by stripping suffixes: a stripped "goes" would reach the
 * language Go, and a stripped "directly" would reach "direct".
 */
const EN_CLAIM_WORDS = [
  // Seniority and standing.
  'senior', 'seniors', 'junior', 'juniors', 'principal', 'chief', 'expert', 'experts', 'expertise',
  'seasoned', 'veteran', 'veterans', 'accomplished', 'distinguished', 'renowned', 'recognized',
  'recognised', 'acclaimed', 'proven', 'extensive', 'experienced', 'deep', 'strategic', 'strong',
  'top', 'elite', 'prestigious', 'skilled', 'proficient', 'adept', 'versed', 'pioneer', 'pioneers',
  'pioneered', 'pioneering', 'expertly', 'extensively', 'deeply', 'strategically',
  // Ownership and authority.
  'manage', 'manages', 'management', 'direct', 'directs', 'oversee', 'oversees', 'oversaw',
  'overseen', 'overseeing', 'oversight', 'spearhead', 'spearheads', 'spearheaded', 'spearheading',
  'run', 'runs', 'ran', 'running', 'drive', 'drives', 'drove', 'driven', 'driving', 'supervise',
  'supervises', 'supervised', 'supervising', 'supervision', 'chair', 'chairs', 'chaired', 'chairing',
  'steer', 'steers', 'steered', 'steering', 'mentor', 'mentors', 'mentored', 'mentoring', 'coach',
  'coaches', 'coached', 'coaching', 'hire', 'hires', 'hired', 'hiring', 'recruit', 'recruits',
  'recruited', 'recruiting', 'recruitment', 'cofounded', 'cofounder', 'cofounders', 'responsible',
  'responsibility', 'responsibilities', 'accountable', 'accountability', 'sole', 'singlehandedly',
  'independently', 'autonomously', 'championed', 'delegated', 'command', 'commanded',
  // Scope.
  'global', 'international', 'worldwide', 'multinational', 'nationwide', 'countrywide', 'regional',
  'enterprise', 'enterprises', 'cross', 'companywide', 'organisationwide', 'organizationwide',
  'globally', 'internationally', 'regionally', 'solely',
  // Language and proficiency.
  'fluent', 'fluently', 'fluency', 'native', 'natively', 'bilingual', 'trilingual', 'multilingual', 'proficiency',
  'advanced', 'intermediate', 'basic',
  // Credentials, awards and standing events.
  'certified', 'certify', 'certifies', 'certifying', 'certification', 'certifications', 'licensed',
  'accredited', 'accreditation', 'chartered', 'registered', 'qualified', 'graduated', 'graduate',
  'graduates', 'postgraduate', 'undergraduate', 'doctoral', 'published', 'patented', 'tenured',
  'promoted', 'elected', 'appointed', 'nominated', 'awarded', 'won', 'win', 'wins', 'winning',
  'ranked', 'honored', 'honoured',
  // Domain words the lexicon would otherwise free. Relational adjectives
  // ("clinical", "financial") are already claims via WordNet; these are the
  // domain adjectives whose most frequent WordNet sense is qualitative ("legal"
  // as lawful), found by sweeping the domain vocabulary through the lexicon.
  'consulting', 'distributed', 'embedded', 'mobile', 'agile', 'lean', 'remote', 'generative',
  'predictive', 'concurrent', 'functional', 'reactive', 'quantitative', 'qualitative',
  'legal', 'legally', 'commercial', 'governmental', 'nuclear', 'mechanical', 'civil', 'forensic',
  'regulatory', 'judicial', 'political', 'psychological', 'genetic', 'renewable', 'residential',
  'custodial',
  // Tools, products and employers spelled like ordinary words.
  'go', 'excel', 'react', 'express', 'swift', 'flutter', 'elastic', 'ionic', 'linear', 'slack',
  'zoom', 'sketch', 'remix', 'compose', 'hibernate', 'struts', 'render', 'svelte', 'unreal', 'nuke',
  'spark', 'angular', 'bash', 'braze', 'retool', 'loom', 'rippling', 'intuit', 'meta',
];

/**
 * German claim words as stems: every adjective ending (-e, -en, -er, -es, -em)
 * folds onto them, so "leitende", "zertifizierter" and "medizinischen" all
 * count. Umlauts are folded the way claimWords() folds them.
 */
const DE_CLAIM_STEMS = [
  // Seniority and standing.
  'leitend', 'fuehrend', 'federfuehrend', 'senior', 'junior', 'erfahren', 'langjaehrig', 'fundiert',
  'umfassend', 'tiefgehend', 'tiefgreifend', 'ausgewiesen', 'nachweislich', 'versiert', 'routiniert',
  'strategisch', 'ausgezeichnet',
  // Ownership and authority.
  'verantwortlich', 'eigenverantwortlich', 'alleinverantwortlich', 'selbststaendig',
  // Scope.
  'international', 'global', 'weltweit', 'konzernweit', 'bundesweit', 'europaweit', 'unternehmensweit',
  // Language and proficiency.
  'fliessend', 'muttersprachlich', 'verhandlungssicher', 'sicher', 'zweisprachig', 'mehrsprachig',
  'fortgeschritten', 'deutsch', 'englisch', 'franzoesisch', 'spanisch', 'italienisch', 'portugiesisch',
  'niederlaendisch', 'polnisch', 'russisch', 'tuerkisch', 'arabisch', 'chinesisch', 'japanisch',
  'koreanisch', 'persisch', 'ukrainisch', 'schwedisch', 'daenisch', 'norwegisch', 'finnisch',
  'griechisch', 'tschechisch', 'ungarisch', 'rumaenisch', 'kroatisch', 'serbisch', 'bulgarisch',
  'hebraeisch',
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

/** German ownership verbs, every form spelled out (verbs don't fold like adjectives). */
const DE_CLAIM_WORDS = [
  'leiten', 'leite', 'leitet', 'leitete', 'leiteten', 'geleitet', 'fuehren', 'fuehre', 'fuehrt',
  'fuehrte', 'fuehrten', 'gefuehrt', 'verantworten', 'verantworte', 'verantwortet', 'verantwortete',
  'verantworteten', 'manage', 'managte', 'managten', 'gemanagt', 'steuere', 'steuerte', 'steuerten',
  'gesteuert', 'gruende', 'gruendete', 'gruendeten',
  'gegruendet', 'mitgegruendet', 'beaufsichtigte', 'beaufsichtigt', 'coachte', 'gecoacht',
  'rekrutierte', 'rekrutiert', 'gewann',
];

const CLAIM_WORDS = new Set([...EN_CLAIM_WORDS, ...DE_CLAIM_WORDS]);
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

let claimFree: Set<string> | null = null;

/**
 * Is this word form in the claim-free lexicon? Built on first use, not at
 * module load, so a Worker that never rewrites a section never pays for it.
 */
export function isClaimFreeForm(word: string): boolean {
  if (!claimFree) {
    claimFree = new Set(`${CLAIM_FREE_ADJECTIVES} ${CLAIM_FREE_VERBS} ${CLAIM_FREE_OTHER}`.split(' '));
  }
  return claimFree.has(word);
}
