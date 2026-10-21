import assert from 'node:assert/strict';
import test from 'node:test';

import { introducedClaims, unsupportedNumbers } from './unified-writer-agent';

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
  // "evaluate" used to be refused here as a possible homograph. It is an
  // ordinary verb and carries no claim, so it now passes without backing; the
  // homographs that are tools (Go, Excel, React) are claim words instead, below.
  assert.deepEqual(introducedClaims('Evaluate agents.', SOURCE_CV, 'Evaluated agents.'), []);
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
// rewrite refused for "including". Ordinary words need no backing at all now,
// so these pass even against a section that never used them.
test('ordinary English words carry no claim and need no backing', () => {
  const before = 'Applied AI engineer who builds LLM apps and agents end to end.';
  const after = 'Applied AI engineer with experience shipping LLM apps and agents, including Useful Brain, evaluated rigorously before release to additional users.';
  assert.deepEqual(introducedClaims(after, SOURCE_CV, before), ['release']);
  assert.deepEqual(
    introducedClaims('Consistently measured and streamlined agents, ensuring each went live reliably and remained relevant.', SOURCE_CV, before),
    [],
  );
});

test('ordinary German words carry no claim and need no backing', () => {
  const source = 'Vertriebsingenieurin. Betreuung von 40 Kunden im Maschinenbau. Angebote erstellt.';
  const before = 'Vertriebsingenieurin mit Betreuung von 40 Kunden im Maschinenbau.';
  assert.deepEqual(
    introducedClaims('Vertriebsingenieurin, die zuverlässig und erfolgreich 40 Kunden im Maschinenbau betreut und dabei passende Angebote erstellt hat.', source, before),
    [],
  );
  // German nouns stay claims: a domain the CV never names is still refused.
  assert.deepEqual(introducedClaims('Vertriebsingenieurin im Maschinenbau und in der Medizintechnik.', source, before), ['medizintechnik']);
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
  const refuse = (after: string) => introducedClaims(after, source, before);
  assert.deepEqual(refuse('Leitete das Team im Maschinenbau.'), ['leitete']);
  assert.deepEqual(refuse('Vertriebsingenieurin im Maschinenbau, als Teamleiterin.'), ['teamleiterin']);
  assert.deepEqual(refuse('Zertifizierte Vertriebsingenieurin im Maschinenbau.'), ['zertifizierte']);
  assert.deepEqual(refuse('Vertriebsingenieurin im Maschinenbau, verhandlungssicher in englischsprachigen Teams.'), ['verhandlungssicher', 'englischsprachigen']);
  assert.deepEqual(refuse('Vertriebsingenieurin für medizinische und internationale Kunden.'), ['medizinische', 'internationale']);
  assert.deepEqual(refuse('Vertriebsingenieurin im Maschinenbau mit SAP.'), ['sap']);
});

test('German re-inflections of CV words are backed; a title is never backed by a verb', () => {
  const source = 'Ich verbinde einen ruhigen, beratenden Verkaufsstil mit Erfahrung. Pflege alle Kontakte im CRM. Wir beraten Kunden.';
  const before = 'Vertriebsingenieurin.';
  assert.deepEqual(introducedClaims('Betreue Kunden mit ruhigem, beratendem Verkaufsstil und halte den Kontakt.', source, before, 'de'), []);
  // Without the language the fold is off, so nothing English can lean on it.
  assert.deepEqual(introducedClaims('Betreue Kunden mit ruhigem Verkaufsstil.', source, before), ['ruhigem']);
  // A noun never meets a verb: "Berater" is a title, "beraten" an activity.
  assert.deepEqual(introducedClaims('Arbeite als Berater für Kunden.', source, before, 'de'), ['berater']);
  // English agent nouns stay refused in English text: no German fold there.
  assert.deepEqual(introducedClaims('Applied AI researcher.', 'Researches agents.', 'Applied AI engineer.', 'en'), ['researcher']);
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
