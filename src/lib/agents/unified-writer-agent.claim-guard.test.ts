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

test('other forms of a section word pass: inflections, singulars, "-d" pasts', () => {
  assert.deepEqual(introducedClaims('Evaluating agents.', SOURCE_CV, 'Evaluated agents.'), []);
  assert.deepEqual(introducedClaims('Evaluate agents.', SOURCE_CV, 'Evaluated agents.'), []);
  assert.deepEqual(introducedClaims('Built a dashboard.', SOURCE_CV, 'Built dashboards.'), []);
});

test('the section does not back a title or role word by stem', () => {
  // "architected" is in the section, "architect" (a job title) is not.
  assert.deepEqual(introducedClaims('Payment architect.', SOURCE_CV, 'Architected payment flows.'), ['architect']);
  assert.deepEqual(introducedClaims('Leading growth.', SOURCE_CV, 'Generated leads for growth.'), ['leading']);
  assert.deepEqual(introducedClaims('Sales manager.', SOURCE_CV, 'Managed sales.'), ['manager']);
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
