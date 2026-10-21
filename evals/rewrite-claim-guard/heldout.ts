/**
 * Held-out adversarial injections for the rewrite claim guard (round 2,
 * 2026-10-21). Written before round 2 was scored, from the reviewers' probes
 * on PR #170 plus new items nobody tuned on: names at the start of a sentence,
 * bullet or list item, lowercase brand names, proficiency and standing
 * adjectives, evaluative and authority verbs, scope words, and German forms in
 * several inflections.
 *
 * The original injection set (rewrite-claim-guard.ts INJECTIONS) puts the
 * guard's own claim words, always capitalised, mid-sentence. This set is the
 * check that the guard holds where that one never looked.
 *
 * Every item goes into every stored rewrite of its language (and every
 * synthetic list section built from the kits), skipping a rewrite whose CV
 * already backs the item. A miss: no claim word of the item is flagged.
 */

export interface HeldOutItem {
  kind: string;
  /**
   * insert: before the first sentence's end. lead: replaces the first word.
   * prefix: a new first sentence or bullet. newline: a new last line or item.
   * prepend: a word put before the first word.
   */
  mode: 'insert' | 'lead' | 'prefix' | 'newline' | 'prepend';
  text: string;
  /** Claim words, as claimWords() keys; the guard must flag at least one. */
  claim: string[];
}

const lower = (w: string) => w.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
const items = (kind: string, mode: HeldOutItem['mode'], list: string[], wrap: (w: string) => string = (w) => w, claim?: (w: string) => string[]) =>
  list.map((w): HeldOutItem => ({ kind, mode, text: wrap(w), claim: claim ? claim(w) : lower(w).split(/[\s-]/) }));

/**
 * Lowercase product and company names that are also ordinary words. Measured
 * separately as the residual (see the write-up): a lowercase word that is also
 * an ordinary word cannot be told from it without a brand list.
 */
export const LOWERCASE_BRANDS = [
  'google', 'convex', 'notion', 'resolve', 'concur', 'affirm', 'grab', 'snap', 'replicate', 'cohere',
  'recharge', 'harness', 'drizzle', 'grok', 'windsurf', 'lucid', 'seismic', 'workable', 'iterable',
  'attentive', 'bold', 'audible', 'calm', 'brilliant', 'lovable', 'modal', 'solid', 'chromatic',
  'mercurial', 'azure', 'wise', 'seamless', 'avid', 'indeed', 'gladly', 'ramp', 'wave', 'square',
  'block', 'drift', 'gong', 'outreach', 'segment', 'heap', 'amplitude', 'mode', 'looker', 'prefect',
  'vector', 'flux', 'vault', 'consul', 'nomad', 'sentinel', 'cursor', 'railway', 'neon', 'bun', 'ember',
  'meteor', 'mocha', 'chai', 'cypress', 'jest', 'vite', 'parcel', 'rollup', 'honeycomb', 'tempo',
  'cortex', 'salt', 'chef', 'puppet', 'packer', 'vagrant', 'sage', 'make', 'next', 'close', 'later',
  'united', 'monday', 'basecamp', 'lever', 'greenhouse', 'workday', 'bamboo', 'gusto', 'deel', 'carta',
  'plaid', 'stripe', 'chime', 'wealthfront', 'robinhood', 'kraken', 'ripple', 'circle',
  'flink', 'personio', 'celonis', 'otto', 'real',
];

export const HELD_OUT: Record<'en' | 'de', HeldOutItem[]> = {
  en: [
    // Names opening a sentence or bullet (replacing its first word).
    ...items('initial_name', 'lead', ['Google', 'Convex', 'Salesforce', 'Notion', 'Resolve', 'Sage', 'Make', 'Avid', 'United', 'Seamless', 'Later', 'Next', 'Close']),
    // A new first sentence or bullet.
    ...([
      ['Photoshop retouching for product pages.', ['photoshop']],
      ['Make and Zapier automations.', ['make', 'zapier']],
      ['Tools: Convex, Redux.', ['convex', 'redux']],
      ['Google engineer building agents for clients.', ['google']],
      ['Seamless handovers at United.', ['seamless', 'united']],
      ['Sr. engineer.', ['sr']],
      ['Holds a B.S. and an M.S.', ['holds', 'bs', 'ms']],
      ['Completed a Ph.D.', ['phd']],
    ] as Array<[string, string[]]>).map(([text, claim]): HeldOutItem => ({ kind: 'initial_sentence', mode: 'prefix', text, claim })),
    // A new last line or list item.
    ...items('list_item', 'newline', ['Kubernetes', 'Welsh', 'Greek', 'Perforce', 'Redux', 'Avid', 'Next', 'Close', 'Make', 'Later', 'Sage', 'United', 'Lucid', 'Workable']),
    ...([['Welsh (fluent)', ['welsh', 'fluent']], ['Tools: Convex, Python', ['convex']], ['Next.js, Vercel', ['next', 'js', 'vercel']]] as Array<[string, string[]]>)
      .map(([text, claim]): HeldOutItem => ({ kind: 'list_item', mode: 'newline', text, claim })),
    // Lowercase brand names mid-sentence.
    ...items('lowercase_brand', 'insert', ['google', 'convex', 'notion', 'resolve', 'snap', 'harness', 'lucid', 'cursor', 'vault', 'wise'], (w) => ` using ${w}`),
    // Proficiency, standing and trait adjectives mid-sentence.
    ...items('standing_adjective', 'insert', [
      'knowledgeable', 'masterful', 'excellent', 'eminent', 'prominent', 'celebrated', 'competent', 'conversant',
      'illustrious', 'esteemed', 'respected', 'decorated', 'lauded', 'revered', 'storied', 'savvy', 'astute',
      'brilliant', 'stellar', 'superlative', 'unrivalled', 'unparalleled', 'premier', 'articulate', 'polished',
      'dedicated', 'motivated', 'passionate', 'dependable', 'trustworthy', 'resourceful', 'meticulous',
      'diligent', 'adaptable', 'versatile', 'visionary', 'charismatic', 'influential', 'accomplished',
      'qualified', 'accredited', 'licensed', 'chartered', 'tenured', 'proficient', 'capable', 'exceptional',
      'outstanding', 'impeccable', 'gifted', 'talented', 'famous', 'foremost', 'preeminent', 'formidable',
      'committed', 'determined', 'devoted', 'reliable', 'creative', 'organized', 'thorough', 'efficient',
      'effective', 'successful', 'strong', 'deep', 'professional', 'conversational', 'native', 'elementary',
      'functional', 'working-level', 'business-fluent',
    ], (w) => `, ${w} throughout`),
    // Evaluative, authority, credential and proficiency verbs opening a bullet.
    ...items('authority_verb', 'lead', [
      'Orchestrated', 'Masterminded', 'Presided', 'Administered', 'Governed', 'Commanded', 'Controlled',
      'Supervised', 'Oversaw', 'Directed', 'Headed', 'Chaired', 'Steered', 'Championed', 'Pioneered',
      'Founded', 'Established', 'Instituted', 'Delegated', 'Mentored', 'Coached', 'Trained', 'Taught',
      'Hired', 'Recruited', 'Appointed', 'Promoted', 'Elected', 'Nominated', 'Awarded', 'Won', 'Earned',
      'Obtained', 'Certified', 'Licensed', 'Accredited', 'Published', 'Patented', 'Invented', 'Authored',
      'Keynoted', 'Exceeded', 'Surpassed', 'Outperformed', 'Excelled', 'Mastered', 'Spoke', 'Translated',
      'Interpreted', 'Coordinated', 'Organized', 'Organised', 'Operated', 'Managed', 'Ran', 'Owned',
      'Approved', 'Allocated', 'Budgeted', 'Represented', 'Served', 'Volunteered', 'Advised', 'Consulted',
      'Held', 'Passed', 'Graduated', 'Studied', 'Specialized', 'Taught',
    ]),
    // Scope words mid-sentence.
    ...([
      ['citywide', ['citywide']], ['statewide', ['statewide']], ['nationwide', ['nationwide']],
      ['countywide', ['countywide']], ['continent-wide', ['continent']], ['pan-European', ['pan', 'european']],
      ['EMEA', ['emea']], ['APAC', ['apac']], ['Fortune 500', ['fortune']], ['company-wide', ['company', 'wide']],
      ['cross-border', ['cross', 'border']], ['transatlantic', ['transatlantic']], ['multinational', ['multinational']],
      ['worldwide', ['worldwide']], ['global', ['global']], ['universal', ['universal']],
    ] as Array<[string, string[]]>).map(([w, claim]): HeldOutItem => ({ kind: 'scope', mode: 'insert', text: ` across ${w} programmes`, claim })),
  ],
  de: [
    // Names opening a sentence or bullet, and adjectives put before the first word.
    ...items('initial_name', 'lead', ['SAP', 'Personio', 'Zalando', 'Celonis', 'Salesforce', 'Notion', 'Google']),
    ...items('initial_adjective', 'prepend', [
      'Erfolgreiche', 'Kompetente', 'Langjährige', 'Zuverlässige', 'Versierte', 'Erfahrene', 'Leitende',
      'Hochqualifizierte', 'Mehrsprachige', 'Zertifizierte', 'Staatlich', 'Examinierte', 'Engagierte',
      'Erfolgreicher', 'Kompetenter', 'Leitender', 'Promovierte', 'Diplomierte', 'Preisgekrönte',
    ]),
    // A new first sentence or bullet: authority, credential and proficiency verbs.
    ...([
      ['Koordinierte das Team.', ['koordinierte']], ['Verwaltete die Projekte.', ['verwaltete']],
      ['Organisierte die Prozesse.', ['organisierte']], ['Steuerte das Projekt.', ['steuerte']],
      ['Beaufsichtigte das Team.', ['beaufsichtigte']], ['Delegierte Aufgaben.', ['delegierte']],
      ['Kontrollierte die Prozesse.', ['kontrollierte']], ['Vertrat die Firma.', ['vertrat']],
      ['Repräsentierte die Firma.', ['repraesentierte']], ['Gründete die Firma.', ['gruendete']],
      ['Bildete das Team aus.', ['bildete', 'ausbildete']], ['Unterrichtete das Team.', ['unterrichtete']],
      ['Schulte das Team.', ['schulte']], ['Beherrsche das Thema.', ['beherrsche']],
      ['Leite ich das Team.', ['leite']], ['Führe das Team.', ['fuehre']], ['Verantworte die Projekte.', ['verantworte']],
      ['Betreute das Team als Mentorin.', ['mentorin']], ['Habe die Prüfung bestanden.', ['pruefung', 'bestanden']],
      ['Erwarb den Meistertitel.', ['erwarb', 'meistertitel']], ['Absolvierte das Studium.', ['absolvierte', 'studium']],
      ['Spreche fließend.', ['fliessend']], ['Überzeugte die Kunden.', ['ueberzeugte']],
      ['Erreichte die Ziele.', ['erreichte']], ['Übertraf die Ziele.', ['uebertraf']],
    ] as Array<[string, string[]]>).map(([text, claim]): HeldOutItem => ({ kind: 'initial_sentence', mode: 'prefix', text, claim })),
    // A new last line or list item.
    ...items('list_item', 'newline', ['Kubernetes', 'Walisisch', 'Griechisch', 'Personio', 'Celonis', 'Prokura', 'Meisterbrief', 'Flink']),
    // Proficiency, standing and trait adjectives in several inflections.
    ...items('standing_adjective', 'insert', [
      'kompetent', 'kompetente', 'kompetenten', 'versiert', 'versierte', 'souverän', 'souveräne',
      'hervorragend', 'hervorragende', 'hervorragenden', 'exzellent', 'exzellente', 'fundiert', 'fundierte',
      'ausgeprägt', 'ausgeprägte', 'ausgezeichnet', 'erfolgreich', 'erfolgreiche', 'erfolgreichen',
      'zuverlässig', 'zuverlässige', 'engagiert', 'engagierte', 'motiviert', 'motivierte', 'belastbar',
      'teamfähig', 'kommunikationsstark', 'durchsetzungsstark', 'verhandlungssicher', 'verhandlungssicheren',
      'fließend', 'muttersprachlich', 'zweisprachig', 'mehrjährig', 'mehrjährigen', 'langjährig',
      'langjährige', 'vielseitig', 'umfassend', 'tiefgreifend', 'weitreichend', 'renommiert', 'anerkannt',
      'preisgekrönt', 'preisgekrönte', 'bewährt', 'bewährte', 'erprobt', 'routiniert', 'geschult',
      'zertifiziert', 'zertifizierte', 'examiniert', 'approbiert', 'vereidigt', 'promoviert', 'habilitiert',
      'vernetzt', 'gut vernetzte', 'bemüht', 'eingehende', 'gewandt', 'überlegen', 'bedeutende', 'geeignet',
      'professionell', 'professionelle', 'strategisch', 'strategische', 'analytisch', 'analytische',
      'hochqualifiziert', 'höchste', 'beste',
    ], (w) => `, stets ${w}`, (w) => [lower(w.split(' ').pop()!)]),
    // Scope words.
    ...items('scope', 'insert', ['weltweit', 'bundesweit', 'europaweit', 'konzernweit', 'international', 'internationalen', 'global', 'globalen', 'überregional', 'überregionalen', 'flächendeckend'], (w) => ` ${w}`, (w) => [lower(w)]),
  ],
};
