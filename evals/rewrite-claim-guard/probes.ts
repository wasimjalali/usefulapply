/**
 * Reviewer probes from PR #170 (the rejected lexicon attempt), kept as refusal
 * tests for every later guard. Each one is a rewrite that adds a claim the
 * applicant's documents do not make. origin/main's guard refuses all of them;
 * the gate is that the shipped guard refuses them too, naming at least one word
 * of `claim`.
 *
 * Provenance. PR #170's own record of "106/106 reviewer probes refused" was a
 * working list in the author's session that was not committed. This file is the
 * rebuilt list: every probe in the PR's test file and in the review outputs
 * (round 1: Opus and Sonnet; round 2: Opus, Sonnet and the second reader),
 * written out as a full rewrite, plus the probes named in the round 3 brief.
 * The count printed by the score run is the count of this file.
 *
 * `claim` words are claimWords() keys: lowercase, umlauts and ß folded.
 */
export interface Probe {
  id: string;
  language: 'en' | 'de';
  kind: 'summary' | 'experience_bullets' | 'custom_section_items';
  source: string;
  before: string;
  after: string;
  claim: string[];
  from: string;
}

const EN_SOURCE = [
  'Applied AI Engineer. Builds LLM apps and agents end to end and measures them with fixed tests before anyone relies on them.',
  '- Useful Brain: company knowledge assistant using hybrid RAG on Cloudflare Workers.',
  "- Safwa: live Q&A filter for a teacher's stream. Tested 28 AI models on 1,002 hand-labelled cases from real broadcasts.",
  "- Useful Apply: built and launched a paid AI product with paying customers, working directly with users' needs.",
  'Languages: English (C1), German (B2, certified).',
].join('\n');
const EN_BEFORE = 'Applied AI engineer.';
const DE_SOURCE = 'Vertriebsingenieurin. Betreuung von 40 Kunden im Maschinenbau. Unterstützte das Team bei Projekten.';
const DE_BEFORE = 'Vertriebsingenieurin im Maschinenbau.';

export const PROBES: Probe[] = [];

function add(
  from: string,
  language: 'en' | 'de',
  after: string,
  claim: string[],
  options: { kind?: Probe['kind']; source?: string; before?: string } = {},
): void {
  PROBES.push({
    id: `probe-${String(PROBES.length + 1).padStart(3, '0')}`,
    language,
    kind: options.kind ?? 'summary',
    source: options.source ?? (language === 'en' ? EN_SOURCE : DE_SOURCE),
    before: options.before ?? (language === 'en' ? EN_BEFORE : DE_BEFORE),
    after,
    claim,
    from,
  });
}
const lower = (w: string) => w.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

// ---- Test file of PR #170: proficiency, standing, credential, scope, authority words (round 2 high 2) ----
for (const word of `knowledgeable masterful excellent eminent prominent celebrated competent conversant acquainted
  masterly consummate gifted talented famous foremost preeminent highest exceptional outstanding impeccable
  conversational professional elementary bonded notarized ordained admitted barred apprenticed interned
  administered governed commanding controlling citywide countywide universal licenced sworn coordinated
  orchestrated presided masterminded articulate committed devoted sought`.split(/\s+/)) {
  add('PR170 test: standing and authority words', 'en', `Applied AI engineer, ${word} in agents.`, [word]);
}
for (const word of ['mehrjährige', 'hochqualifizierte', 'kompetent', 'kompetente', 'kompetenten', 'geschult', 'hervorragende', 'herausragende', 'höchste', 'vernetzte', 'bemüht', 'eingehende']) {
  add('PR170 test: German standing words', 'de', `Vertriebsingenieurin im Maschinenbau, ${word} im Team.`, [lower(word)]);
}

// ---- Every form of a claim verb; dotted degrees ----
for (const word of `championing championed commanded licensing accredit accredits accrediting publish publishes
  patenting promote promoting nominate appoint delegated hold holding held`.split(/\s+/)) {
  add('PR170 test: claim verbs', 'en', `Applied AI engineer, ${word} agents.`, [word]);
}
add('PR170 test: dotted degree', 'en', 'Applied AI engineer who completed an M.S. in agents.', ['ms']);
add('PR170 test: dotted degree', 'en', 'Applied AI engineer. I hold a B.S. in agents.', ['hold', 'bs']);

// ---- Names at the start of a sentence, bullet, list item; lowercase (round 1 high 1, round 2 high 1) ----
const items = (after: string, before: string, claim: string[], from: string) =>
  add(from, 'en', after, claim, { kind: 'custom_section_items', before });
items('Python\nReact\nRedux\nConvex\nPerforce', 'Python\nReact', ['redux', 'convex', 'perforce'], 'PR170 round 1 Opus: items');
items('English\nGerman\nWelsh\nGreek', 'English\nGerman', ['welsh', 'greek'], 'PR170 round 1 Opus: languages');
for (const name of ['Sage', 'Make', 'Next', 'Close', 'Resolve', 'Avid', 'United', 'Seamless', 'Later', 'Google', 'Convex', 'Notion']) {
  items(`English\n${name}`, 'English', [name.toLowerCase()], 'PR170 round 2: name as item');
}
add('PR170 round 1 Opus: after a colon', 'en', 'Applied AI engineer. Tools: Convex, Python.', ['convex', 'python']);
add('PR170 round 1 Opus: new line', 'en', 'Applied AI engineer.\nPhotoshop retouching for product pages.', ['photoshop']);
add('PR170 round 1 Sonnet: Google at the start', 'en', 'Google engineer building agents for clients.', ['google']);
add('PR170 round 1 Sonnet: lowercase employer', 'en', 'Applied AI engineer at google.', ['google']);
for (const name of ['Resolve', 'Avid', 'United', 'Seamless', 'Sage', 'Convex', 'Welsh']) {
  add('PR170 round 2: name opening a sentence', 'en', `Applied AI engineer. ${name} for clients.`, [name.toLowerCase()]);
}
add('PR170 round 2 Opus: Slack, Rust, Express at the start', 'en', 'Slack integration for clients. Rust services. Express backend.', ['slack', 'rust', 'express']);

// ---- Tools, employers, titles, credentials in any position ----
for (const [after, claim] of [
  ['Applied AI engineer shipping agents with React.', ['react']],
  ['React agents shipped end to end.', ['react']],
  ['Applied AI engineer at Siemens.', ['siemens']],
  ['Applied AI engineer at Total.', ['total']],
  ['Applied AI engineer and accredited Scrum Master.', ['accredited', 'scrum']],
  ['Applied AI engineer, PMP and MBA.', ['pmp', 'mba']],
  ['Applied AI engineer with a PhD.', ['phd']],
  ['Senior applied AI engineer.', ['senior']],
  ['Applied AI engineer who spearheaded and oversaw agents.', ['spearheaded', 'oversaw']],
  ['Applied AI engineer for global teams.', ['global']],
  ['Applied AI engineer, fluent and native in English.', ['fluent', 'native']],
  ['Applied AI engineer for clinical and financial users.', ['clinical', 'financial']],
  ['Applied AI engineer in distributed systems and machine learning.', ['distributed', 'machine']],
] as Array<[string, string[]]>) add('PR170 test: tools, employers, titles', 'en', after, claim);

// ---- German titles, ownership, credentials, proficiency, domain ----
for (const [after, claim] of [
  ['Leitete das Team im Maschinenbau.', ['leitete']],
  ['Vertriebsingenieurin im Maschinenbau, als Teamleiterin.', ['teamleiterin']],
  ['Zertifizierte Vertriebsingenieurin im Maschinenbau.', ['zertifizierte']],
  ['Vertriebsingenieurin im Maschinenbau, verhandlungssicher in englischsprachigen Teams.', ['verhandlungssicher']],
  ['Vertriebsingenieurin für medizinische und internationale Kunden.', ['medizinische', 'internationale']],
  ['Vertriebsingenieurin im Maschinenbau mit SAP.', ['sap']],
  ['Vertriebsingenieurin im Maschinenbau. Bildete das Team aus.', ['bildete', 'ausbildete']],
] as Array<[string, string[]]>) add('PR170 test: German titles, ownership, credentials', 'de', after, claim);

// ---- German fold backing a claim word from another form (round 1 high 3) ----
add('PR170 round 1 Opus: leiten backs leite', 'de', 'Leite ich das Team.', ['leite'], { source: 'Ziel: ein Team zu leiten.', before: 'Entwicklerin.' });
add('PR170 round 1 Opus: leitenden backs leitende', 'de', 'Leitende Entwicklerin.', ['leitende'], { source: 'Berichtete an die leitenden Angestellten.', before: 'Entwicklerin.' });
add('PR170 round 1 Opus: geprüft backs geprüfte', 'de', 'Als geprüfte Bilanzbuchhalterin.', ['gepruefte'], { source: 'Rechnungen geprüft. Bilanzbuchhalterin.', before: 'Entwicklerin.' });
add('PR170 round 1 Opus: Leitern backs Leiter', 'de', 'Als Leiter im Lager.', ['leiter'], { source: 'Lager. Arbeit mit Leitern.', before: 'Entwicklerin.' });
add('PR170 test: ruhigen backs ruhigem', 'de', 'Mit ruhigem Verkaufsstil.', ['ruhigem'], { source: 'Ein ruhiger, beratender Verkaufsstil. Wir beraten Kunden.', before: 'Vertriebsingenieurin.' });

// ---- Round 2 Opus: German separable verbs split across the clause ----
for (const after of [
  'Ich bildete Kollegen aus und unterstützte Kunden.',
  'Ich stellte das Team ein und betreute Kunden.',
  'Ich bildete das Team aus sowie Kunden.',
  'Das Team bildete ich aus und betreute Kunden.',
  'Ich bildete das Team aus 2020.',
]) add('PR170 round 2 Opus: separable verbs', 'de', after, ['bildete', 'stellte', 'ausbildete', 'einstellte']);

// ---- Round 2 Opus and brief: ownership and authority from freed verbs and function words ----
for (const [after, claim] of [
  ['Ich übernahm das Team.', ['uebernahm']],
  ['Das Team berichtete an mich.', ['berichtete']],
  ['Ich baute das Team auf.', ['baute', 'aufbaute']],
  ['Ich stellte das Team zusammen.', ['stellte']],
  ['Ich entwickelte das Team weiter.', ['entwickelte']],
  ['Ich setzte das Team ein.', ['setzte']],
  ['Ich vergab Aufgaben an das Team.', ['vergab']],
] as Array<[string, string[]]>) add('PR170 round 2 Opus and brief: ownership verbs', 'de', after, claim);
add('PR170 round 2 Opus: took over', 'en', 'Took over the team.', ['took']);
add('PR170 round 2 Opus: took on', 'en', 'Took on the team.', ['took']);
add('Brief: took over', 'en', 'Applied AI engineer who took over the team.', ['took']);

// ---- Round 2 Opus: gelernt backs gelernte (a credential) ----
add('PR170 round 2 Opus: gelernte Kauffrau', 'de', 'Ich bin gelernte Kauffrau.', ['gelernte', 'kauffrau'], { source: 'Ausbildung als Kauffrau abgebrochen. Ich habe viel gelernt.' });
add('PR170 round 2 Opus: gelernter Elektriker', 'de', 'Ich bin gelernter Elektriker.', ['gelernter', 'elektriker'], { source: 'Ausbildung zum Elektriker, nicht abgeschlossen. Viel gelernt.' });

// ---- Round 2 Opus: function words of the other language spelled like a product ----
add('PR170 round 2 Opus: Nix mid-sentence', 'en', 'Built services with Nix.', ['nix']);
add('PR170 round 2 Opus: Nix mid-sentence (German)', 'de', 'Ich habe Dashboards mit Nix gebaut.', ['nix']);
items('English\nNix', 'English', ['nix'], 'PR170 round 2 Opus: Nix as item');
add('PR170 round 2 Opus: Pro mid-sentence', 'en', 'Pro integration for clients.', ['pro']);
items('English\nPlus', 'English', ['plus'], 'PR170 round 2 Opus: Plus as item');
items('English\nPro', 'English', ['pro'], 'PR170 round 2 Opus: Pro as item');
add('PR170 round 2 reader: Via, Plus, Pro', 'en', 'Worked at Via and Plus and Pro with the team.', ['via', 'plus', 'pro']);
add('Brief: Nix, Pro, Plus in German text', 'de', 'Vertriebsingenieurin mit Nix, Pro und Plus.', ['nix', 'pro', 'plus']);
add('Brief: die, man in English text', 'en', 'Applied AI engineer. Die Man.', ['die', 'man']);

// ---- Round 2 reader: practice verbs, participles, degree adverbs, standing verbs ----
for (const [after, claim] of [
  ['Ich verschrieb Medikamente und verteidigte Mandanten.', ['verschrieb', 'verteidigte']],
  ['Ich bescheinigte Gutachten.', ['bescheinigte']],
  ['Ich verurteilte Täter.', ['verurteilte']],
  ['Ich betreute das Team.', ['betreute']],
  ['Ich fuhr das Team.', ['fuhr']],
  ['Das Team, gefragt, gesucht, geübt, entschlossen, angesehen, geachtet, gewohnt, gelungen.', ['gefragt', 'gesucht', 'geuebt', 'entschlossen', 'angesehen', 'geachtet', 'gewohnt', 'gelungen']],
  ['Ich bin interessiert und gebildet.', ['interessiert', 'gebildet']],
] as Array<[string, string[]]>) add('PR170 round 2 reader: German verbs and participles', 'de', after, claim);
for (const [after, claim] of [
  ['The team significantly improved.', ['significantly']],
  ['Worked personally with the team.', ['personally']],
  ['The team substantially improved.', ['substantially']],
  ['The team greatly improved.', ['greatly']],
  ['The team heavily improved.', ['heavily']],
  ['The team primarily improved.', ['primarily']],
  ['The team mainly improved.', ['mainly']],
  ['The team extremely improved.', ['extremely']],
  ['The team totally improved.', ['totally']],
  ['The team completely improved.', ['completely']],
  ['The team entirely improved.', ['entirely']],
  ['The team largely improved.', ['largely']],
  ['Thrived with the team.', ['thrived']],
  ['Applied AI engineer who thrives and flourished.', ['thrives', 'flourished']],
  ['Decided with the team.', ['decided']],
  ['Applied AI engineer who negotiated, acknowledged and appreciated the team.', ['negotiated', 'acknowledged', 'appreciated']],
  ['Applied AI engineer, focused and engaged.', ['focused', 'engaged']],
  ['Applied AI engineer who cured, healed and examined clients.', ['cured', 'healed', 'examined']],
  ['Applied AI engineer who arrested and convicted clients.', ['arrested', 'convicted']],
  ['Applied AI engineer who facilitated, conducted and hosted the team.', ['facilitated', 'conducted', 'hosted']],
  ['Applied AI engineer who sold and performed for the team.', ['sold', 'performed']],
] as Array<[string, string[]]>) add('PR170 round 2 reader and brief: adverbs and standing verbs', 'en', after, claim);
add('PR170 round 2 reader: German verbs spelling English nouns', 'en', 'Team legend.', ['legend']);
add('PR170 round 2 reader: plant', 'en', 'Applied AI engineer at a plant.', ['plant']);
add('PR170 round 2 reader: war', 'en', 'Applied AI engineer during the war.', ['war']);
add('PR170 round 2 reader: legend, plant, war in bullets', 'en', 'Led the plant.\nHole in the war.', ['plant', 'war'], { kind: 'experience_bullets' });
add('Brief: knowledgeable', 'en', 'Applied AI engineer, knowledgeable in agents.', ['knowledgeable']);
add('Brief: masterminded', 'en', 'Applied AI engineer who masterminded the launch.', ['masterminded']);
