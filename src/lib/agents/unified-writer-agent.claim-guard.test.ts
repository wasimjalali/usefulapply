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

// The number guard has the same blind spot. Here the kit writer rounded "28 AI
// models" to "nearly 30 models", which no CV says. A rewrite that keeps that
// line must not be refused for it, but the number can't jump to a new claim.
const BEFORE_ROUNDED = 'Shipped Safwa, a live Q&A filter, after comparing nearly 30 models on hand-labelled cases.';
const DOCUMENTS = SOURCE_CV;

test('a number already in the section, beside the same words, is not introduced', () => {
  const after = 'Compared nearly 30 models on hand-labelled cases to ship Safwa, a live Q&A filter.';
  assert.deepEqual(unsupportedNumbers(after, '', DOCUMENTS, BEFORE_ROUNDED), []);
});

test('a number from the section moved onto a new claim is still refused', () => {
  const after = 'Built and launched Useful Apply for 30 paying customers.';
  assert.deepEqual(unsupportedNumbers(after, '', DOCUMENTS, BEFORE_ROUNDED), ['30']);
});

test('without the section, the kit-written number is refused (the old behaviour)', () => {
  const after = 'Compared nearly 30 models on hand-labelled cases to ship Safwa, a live Q&A filter.';
  assert.deepEqual(unsupportedNumbers(after, '', DOCUMENTS, ''), ['30']);
});

// Review round 1 (Opus): a section number must keep its unit, or shared words
// like "years" and "Python" let it slide onto a new claim.
const BEFORE_EIGHT = 'Backend engineer with 8 years in Python. Evaluated payment APIs serving 2 million users.';

test('a section number moved onto a new unit is refused', () => {
  assert.ok(unsupportedNumbers('Python engineer whose payment APIs serve 8 million users.', '', DOCUMENTS, BEFORE_EIGHT).includes('8'));
  assert.ok(unsupportedNumbers('Led 8 engineers over two years in Python.', '', DOCUMENTS, BEFORE_EIGHT).includes('8'));
});

test('a section number that keeps its unit passes', () => {
  assert.deepEqual(unsupportedNumbers('Python backend engineer with 8+ years of experience.', '', DOCUMENTS, BEFORE_EIGHT), []);
});

test('vague wording in the section does not become a precise number', () => {
  assert.deepEqual(unsupportedNumbers('Supported 12 clients.', '', DOCUMENTS, 'Supported dozens of clients.'), ['12']);
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
