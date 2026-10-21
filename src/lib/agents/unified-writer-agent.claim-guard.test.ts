import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLAIM_FREE_ADVERBS,
  CLAIM_FREE_FUNCTION,
  CLAIM_FREE_VERBS,
  FREE_IN_INSTRUCTIONS,
  REVIEWED_CLAIM_FORMS,
} from './claim-free-lexicon.generated';
import { claimCapitalisedWords, claimWords } from './claim-token-normalization';
import { introducedClaims, unsupportedInstructionTerms, unsupportedNumbers } from './unified-writer-agent';

// The production case of 2026-10-21. The applicant's CVs say "Tested", and the
// kit writer paraphrased it as "evaluated". It also wrote "additional language"
// itself. Neither word is in either CV, and both are already in the summary.
const SOURCE_CV = [
  'Applied AI Engineer. Builds LLM apps and agents end to end and measures them with fixed tests before anyone relies on them.',
  '- Useful Brain: company knowledge assistant using hybrid RAG on Cloudflare Workers.',
  '- Safwa: live Q&A filter for a teacher\'s stream. Tested 28 AI models on 1,002 hand-labelled cases from real broadcasts.',
  '- Useful Apply: built and launched a paid AI product with paying customers, working directly with users\' needs.',
  'Languages: English (C1), German (B2, certified).',
].join('\n');

const BEFORE = "Applied AI engineer who builds LLM apps and agents end to end and measures them with fixed tests before anyone relies on them. Shipped Useful Brain, a company knowledge assistant using hybrid RAG on Cloudflare Workers, and Safwa, a live Q&A filter evaluated on 1,002 hand-labelled cases from real broadcasts. Built and launched Useful Apply, a paid AI product with paying customers, working directly with users' needs. Works in English (C1) with German (B2, certified) as an additional language.";

// Only reorders and rephrases the summary above. "went" is the one word the
// rewrite brings in that the summary did not already have.
const REPHRASED = "Applied AI engineer who builds LLM apps and agents end to end and measures them with fixed tests before they went live. Shipped Safwa, a live Q&A filter evaluated on 1,002 hand-labelled cases from real broadcasts, and Useful Brain, a company knowledge assistant using hybrid RAG on Cloudflare Workers. Built and launched Useful Apply, a paid AI product with paying customers, working directly with users' needs. Works in English (C1) with German (B2, certified) as an additional language.";

test('a rewrite that only rephrases the current summary introduces no claim', () => {
  assert.deepEqual(introducedClaims(REPHRASED, SOURCE_CV, BEFORE), []);
});

test('a rewrite that adds a tool no source mentions is still refused', () => {
  const added = REPHRASED.replace('on Cloudflare Workers', 'on Cloudflare Workers and Kubernetes');
  assert.deepEqual(introducedClaims(added, SOURCE_CV, BEFORE), ['kubernetes']);
});

test('Go the language is a claim, not a neutral verb; went stays neutral', () => {
  // "backend" and "engineer" are in the section; "went" is neutral. Python and Go are in no CV.
  assert.deepEqual(introducedClaims('Backend engineer who went from Python to Go.', SOURCE_CV, 'Backend engineer.'), ['python', 'go']);
});

// The accepted trade-off, pinned: a word the user put in the section by hand
// may stay through a rewrite. It is already in the CV; refusing removes nothing.
test('a client-added word already in the section survives a rewrite', () => {
  const before = 'Applied AI engineer. Runs agents on Kubernetes.';
  assert.deepEqual(introducedClaims('Applied AI engineer running agents on Kubernetes.', SOURCE_CV, before), []);
});

test('inflections of a section word pass; a bare root needs the exact word', () => {
  assert.deepEqual(introducedClaims('Evaluating agents.', SOURCE_CV, 'Evaluated agents.'), []);
  assert.deepEqual(introducedClaims('Evaluates agents.', SOURCE_CV, 'Evaluated agents.'), []);
  // Refused: a bare verb is never freed, because that is where products live
  // ("Resolve", "Ramp", "Grab"), and the section's "Evaluated" doesn't back it.
  assert.deepEqual(introducedClaims('Evaluate agents.', SOURCE_CV, 'Evaluated agents.'), ['evaluate']);
});

test('the section does not back a title, role, tool or language from another word', () => {
  assert.deepEqual(introducedClaims('Payment architect.', SOURCE_CV, 'Architected payment flows.'), ['architect']);
  assert.deepEqual(introducedClaims('Payment architects.', SOURCE_CV, 'Architected payment flows.'), ['architects']);
  assert.deepEqual(introducedClaims('Leading growth.', SOURCE_CV, 'Generated leads for growth.'), ['leading']);
  assert.deepEqual(introducedClaims('Sales manager.', SOURCE_CV, 'Managed sales.'), ['manager']);
  assert.deepEqual(introducedClaims('Writes Go.', SOURCE_CV, 'Goes beyond.'), ['go']);
  assert.deepEqual(introducedClaims('Excel.', SOURCE_CV, 'Excels at it.'), ['excel']);
  assert.deepEqual(introducedClaims('A VP.', SOURCE_CV, 'Briefed VPs.'), ['vp']);
});

// The production refusals of 2026-10-21, after PR #165: a two-sentence
// rewrite refused for "including". The verbs production refused (went,
// evaluated, including) now need no backing at all; "additional" is an
// adjective and passes because the section already holds it (first test).
test('ordinary English words carry no claim and need no backing', () => {
  const before = 'Applied AI engineer who builds LLM apps and agents end to end.';
  // These pass: inflected verbs, function words and reviewed adverbs.
  assert.deepEqual(
    introducedClaims('Evaluated agents, including Useful Brain, and remained there as each went live.', SOURCE_CV, before),
    [],
  );
  // These are refused: "release" is a noun, "additional" an adjective (never
  // freed), and "rigorously" has no reviewed source.
  const after = 'Applied AI engineer with experience shipping LLM apps and agents, including Useful Brain, evaluated rigorously before release to additional users.';
  assert.deepEqual(introducedClaims(after, SOURCE_CV, before), ['rigorously', 'release', 'additional']);
});

test('ordinary German words carry no claim and need no backing', () => {
  const source = 'Vertriebsingenieurin. Betreuung von 40 Kunden im Maschinenbau. Angebote erstellt.';
  const before = 'Vertriebsingenieurin mit Betreuung von 40 Kunden im Maschinenbau.';
  assert.deepEqual(
    introducedClaims('Vertriebsingenieurin, die im Maschinenbau 40 Kunden betreut und dabei Angebote erstellt hat.', source, before, 'de'),
    [],
  );
  // A trait or a standing is a claim the CV has to make: "zuverlässig", "erfolgreich".
  assert.deepEqual(
    introducedClaims('Vertriebsingenieurin, die zuverlässig und erfolgreich 40 Kunden betreut.', source, before, 'de'),
    ['zuverlaessig', 'erfolgreich'],
  );
  // German nouns stay claims: a domain the CV never names is still refused.
  assert.deepEqual(introducedClaims('Vertriebsingenieurin im Maschinenbau und in der Medizintechnik.', source, before, 'de'), ['medizintechnik']);
});

test('tools, employers, titles and credentials are still refused, in any position', () => {
  const before = 'Applied AI engineer.';
  const refuse = (after: string) => introducedClaims(after, SOURCE_CV, before);
  assert.deepEqual(refuse('Applied AI engineer shipping agents with React.'), ['react']);
  assert.deepEqual(refuse('React agents shipped end to end.'), ['react']);
  assert.deepEqual(refuse('Applied AI engineer at Siemens.'), ['siemens']);
  assert.deepEqual(refuse('Applied AI engineer at Total.'), ['total']);
  assert.deepEqual(refuse('Applied AI engineer and accredited Scrum Master.'), ['accredited', 'scrum', 'master']);
  assert.deepEqual(refuse('Applied AI engineer, PMP and MBA.'), ['pmp', 'mba']);
  assert.deepEqual(refuse('Applied AI engineer with a PhD.'), ['phd']);
  assert.deepEqual(refuse('Senior applied AI engineer.'), ['senior']);
  assert.deepEqual(refuse('Applied AI engineer who spearheaded and oversaw agents.'), ['spearheaded', 'oversaw']);
  assert.deepEqual(refuse('Applied AI engineer for global teams.'), ['global']);
  assert.deepEqual(refuse('Applied AI engineer, fluent and native in English.'), ['fluent', 'native']);
  assert.deepEqual(refuse('Applied AI engineer for clinical and financial users.'), ['clinical', 'financial']);
  assert.deepEqual(refuse('Applied AI engineer in distributed systems and machine learning.'), ['distributed', 'machine']);
});

test('German titles, ownership, credentials, proficiency and domain are still refused', () => {
  const source = 'Vertriebsingenieurin. Betreuung von 40 Kunden im Maschinenbau.';
  const before = 'Vertriebsingenieurin im Maschinenbau.';
  const refuse = (after: string) => introducedClaims(after, source, before, 'de');
  assert.deepEqual(refuse('Leitete das Team im Maschinenbau.'), ['leitete']);
  assert.deepEqual(refuse('Vertriebsingenieurin im Maschinenbau, als Teamleiterin.'), ['teamleiterin']);
  assert.deepEqual(refuse('Zertifizierte Vertriebsingenieurin im Maschinenbau.'), ['zertifizierte']);
  assert.deepEqual(refuse('Vertriebsingenieurin im Maschinenbau, verhandlungssicher in englischsprachigen Teams.'), ['verhandlungssicher', 'englischsprachigen']);
  assert.deepEqual(refuse('Vertriebsingenieurin für medizinische und internationale Kunden.'), ['medizinische', 'internationale']);
  assert.deepEqual(refuse('Vertriebsingenieurin im Maschinenbau mit SAP.'), ['sap']);
  // A separable verb split across the clause is joined: "bildete ... aus" is "ausbilden".
  assert.deepEqual(refuse('Vertriebsingenieurin im Maschinenbau. Bildete das Team aus.'), ['ausbildete']);
  assert.deepEqual(introducedClaims('Bildete das Team aus.', 'Bildete Lehrlinge aus.', 'Vertriebsingenieurin.', 'de'), []);
});

test('German re-inflections of CV words are backed; claim words and titles need the exact word', () => {
  const source = 'Verkauf erklärungsbedürftiger Produkte. Pflege alle Kontakte im CRM. Wir beraten Kunden. Ein ruhiger, beratender Verkaufsstil.';
  const before = 'Vertriebsingenieurin.';
  // The same word in another case: "erklärungsbedürftigen" for the CV's
  // "erklärungsbedürftiger", the noun "Kontakt" for "Kontakte".
  assert.deepEqual(introducedClaims('Betreue Kunden mit erklärungsbedürftigen Produkten und halte den Kontakt.', source, before, 'de'), []);
  // Without the language the fold is off, so nothing English can lean on it,
  // and a capitalised German noun reads as a name.
  assert.deepEqual(introducedClaims('Verkauf erklärungsbedürftigen Produkten.', source, before), ['erklaerungsbeduerftigen', 'produkten']);
  // A trait the review rejected needs the CV's exact form: "ruhigen" doesn't back "ruhigem".
  assert.deepEqual(introducedClaims('Mit ruhigem Verkaufsstil.', source, before, 'de'), ['ruhigem']);
  // A noun never meets a verb: "Berater" is a title, "beraten" an activity.
  assert.deepEqual(introducedClaims('Arbeite als Berater für Kunden.', source, before, 'de'), ['berater']);
  // English agent nouns stay refused in English text: no German fold there.
  assert.deepEqual(introducedClaims('Applied AI researcher.', 'Researches agents.', 'Applied AI engineer.', 'en'), ['researcher']);
});

// PR #170 round 2, HIGH 1: a name at the start of a sentence, line, bullet or
// list item was freed when its lowercase form was an ordinary word.
test('names are refused at the start of a sentence, bullet or list item, and in lowercase', () => {
  const items = (after: string, before: string) => introducedClaims(after, SOURCE_CV, before, 'en', 'custom_section_items');
  assert.deepEqual(items('Python\nReact\nRedux\nConvex\nPerforce', 'Python\nReact'), ['redux', 'convex', 'perforce']);
  assert.deepEqual(items('English\nGerman\nWelsh\nGreek', 'English\nGerman'), ['welsh', 'greek']);
  for (const name of ['Sage', 'Make', 'Next', 'Close', 'Resolve', 'Avid', 'United', 'Seamless', 'Later']) {
    assert.deepEqual(items(`English\n${name}`, 'English'), [name.toLowerCase()], name);
  }
  const before = 'Applied AI engineer.';
  const prose = (after: string) => introducedClaims(after, SOURCE_CV, before, 'en', 'summary');
  // "Tools" is a neutral word, free at the start of a line as before; the names after the colon are not.
  assert.deepEqual(prose('Applied AI engineer. Tools: Convex, Python.'), ['convex', 'python']);
  assert.deepEqual(prose('Applied AI engineer.\nPhotoshop retouching for product pages.'), ['photoshop', 'retouching', 'pages']);
  assert.deepEqual(prose('Google engineer building agents for clients.'), ['google']);
  assert.deepEqual(prose('Applied AI engineer at google.'), ['google']);
  for (const name of ['Resolve', 'Avid', 'United', 'Seamless', 'Sage']) {
    assert.deepEqual(prose(`Applied AI engineer. ${name} for clients.`), [name.toLowerCase()], name);
  }
  // A neutral word may still open a sentence, as before: "Keep", "Cut", "Built".
  assert.deepEqual(introducedClaims('Keep families informed. Cut close from 9 days to 6. Built agents.', SOURCE_CV, 'Keeps families informed. Shortened close from 9 days to 6. Built agents.'), []);
});

// PR #170 round 2, HIGH 2: the lexicon freed proficiency, standing, credential,
// scope and authority words. Now only reviewed, attested lemmas are freed.
test('proficiency, standing, credential, scope and authority words are refused', () => {
  const source = 'Applied AI engineer. Builds agents.';
  const before = 'Applied AI engineer.';
  const words = `knowledgeable masterful excellent eminent prominent celebrated competent conversant acquainted
    masterly consummate gifted talented famous foremost preeminent highest exceptional outstanding impeccable
    conversational professional elementary bonded notarized ordained admitted barred apprenticed interned
    administered governed commanding controlling citywide countywide universal licenced sworn coordinated
    orchestrated presided masterminded articulate committed devoted sought`.split(/\s+/);
  for (const word of words) {
    assert.deepEqual(introducedClaims(`Applied AI engineer, ${word} in agents.`, source, before), [word], word);
  }
  const deSource = 'Vertriebsingenieurin. Betreuung von 40 Kunden im Maschinenbau.';
  const deBefore = 'Vertriebsingenieurin im Maschinenbau.';
  for (const word of ['mehrjährige', 'hochqualifizierte', 'kompetent', 'kompetente', 'kompetenten', 'geschult', 'hervorragende', 'herausragende', 'höchste', 'vernetzte', 'bemüht', 'eingehende']) {
    const terms = introducedClaims(`Vertriebsingenieurin im Maschinenbau, ${word} im Team.`, deSource, deBefore, 'de');
    assert.equal(terms.length, 1, word);
  }
});

// PR #170 round 2, HIGH 3: the German fold backed a claim word from another form.
test('a German claim word is backed only by the exact word', () => {
  const before = 'Entwicklerin.';
  assert.deepEqual(introducedClaims('Leite ich das Team.', 'Ziel: ein Team zu leiten.', before, 'de'), ['leite']);
  assert.deepEqual(introducedClaims('Leitende Entwicklerin.', 'Berichtete an die leitenden Angestellten.', before, 'de'), ['leitende']);
  assert.deepEqual(introducedClaims('Als geprüfte Bilanzbuchhalterin.', 'Rechnungen geprüft. Bilanzbuchhalterin.', before, 'de'), ['gepruefte']);
  // An agent noun is a title: "Leitern" (ladders) doesn't back "Leiter".
  assert.deepEqual(introducedClaims('Als Leiter im Lager.', 'Lager. Arbeit mit Leitern.', before, 'de'), ['leiter']);
  // The exact word still backs it.
  assert.deepEqual(introducedClaims('Leitende Entwicklerin.', 'Leitende Entwicklerin bei Acme.', before, 'de'), []);
});

test('every form of a claim verb is a claim, and dotted degrees are checked', () => {
  const before = 'Applied AI engineer.';
  for (const word of `championing championed commanding commanded licensing licenced accredit accredits accrediting
    publish publishes patenting promote promoting nominate appoint delegated hold holding held`.split(/\s+/)) {
    assert.deepEqual(introducedClaims(`Applied AI engineer, ${word} agents.`, SOURCE_CV, before), [word], word);
  }
  // "B.S." used to split into two one-letter words that the floor dropped.
  assert.deepEqual(introducedClaims('Applied AI engineer who completed an M.S. in agents.', SOURCE_CV, before), ['ms']);
  assert.deepEqual(introducedClaims('Applied AI engineer. I hold a B.S. in agents.', SOURCE_CV, before), ['hold', 'bs']);
});

test('claimCapitalisedWords reads names, sentence openers and list items apart', () => {
  const prose = claimCapitalisedWords('Built on React. Convex and AWS. 1) Shipped it\nGoogle Ph.D.', 'prose');
  assert.deepEqual([...prose.names].sort(), ['aws', 'phd', 'react']);
  assert.deepEqual([...prose.acronyms].sort(), ['aws']);
  assert.deepEqual([...prose.initial].sort(), ['built', 'convex', 'google', 'shipped']);
  const items = claimCapitalisedWords('Python\nMake\nWelsh (fluent)', 'items');
  assert.deepEqual([...items.names].sort(), ['make', 'python', 'welsh']);
  assert.deepEqual([...items.initial], []);
  const instruction = claimCapitalisedWords('Make it shorter and mention Kubernetes', 'instruction');
  assert.deepEqual([...instruction.names], ['kubernetes']);
  assert.deepEqual([...instruction.initial], []);
  assert.deepEqual(claimWords('Holds a B.S., an M.B.A. and a Ph.D., e.g. here.'), ['holds', 'a', 'bs', 'an', 'mba', 'and', 'a', 'phd', 'e', 'g', 'here']);
});

test('the instruction check reports claims the CV cannot back, not the shape of the request', () => {
  assert.deepEqual(unsupportedInstructionTerms('Say I am knowledgeable in welsh', SOURCE_CV, 'en'), ['knowledgeable', 'welsh']);
  assert.deepEqual(unsupportedInstructionTerms('Make it two sentences and lead with the most relevant experience.', SOURCE_CV, 'en'), []);
  assert.deepEqual(unsupportedInstructionTerms('Rewrite it for this job and highlight the skills they asked for.', SOURCE_CV, 'en'), ['skills']);
  assert.deepEqual(unsupportedInstructionTerms('Mention that I used Convex', SOURCE_CV, 'en'), ['convex']);
});

test('lexicon keys are stable under claimWords() normalisation', () => {
  for (const list of [CLAIM_FREE_FUNCTION, CLAIM_FREE_VERBS, CLAIM_FREE_ADVERBS, FREE_IN_INSTRUCTIONS, REVIEWED_CLAIM_FORMS]) {
    for (const key of list.split(' ')) {
      const normalised = claimWords(key);
      if (normalised.length !== 1 || normalised[0] !== key) assert.fail(`lexicon key "${key}" normalises to ${JSON.stringify(normalised)}`);
    }
  }
});

// Numbers: the section backs none, only the verified metrics and the CVs do.
// Three review rounds found ways for a kit number to move onto a new claim
// through any section-based rule, so a kit-rounded number refuses instead.
test('a number only the section has is refused, wherever it goes', () => {
  const kept = 'Compared nearly 30 models on hand-labelled cases to ship Safwa, a live Q&A filter.';
  assert.deepEqual(unsupportedNumbers(kept, '', SOURCE_CV), ['30']);
  assert.deepEqual(unsupportedNumbers('Grew revenue by 40%.', '', SOURCE_CV), ['40']);
  assert.deepEqual(unsupportedNumbers('Grew revenue 40 percent.', '', SOURCE_CV), ['40']);
});

test('a CV number stays on its claim; moved to a new claim it is refused', () => {
  assert.deepEqual(unsupportedNumbers('Shipped Safwa after testing 28 AI models on 1,002 hand-labelled cases.', '', SOURCE_CV), []);
  assert.deepEqual(unsupportedNumbers('Useful Apply has 1,002 paying customers.', '', SOURCE_CV), ['1002']);
});
