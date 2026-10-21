import assert from 'node:assert/strict';
import test from 'node:test';

import { baselineIntroducedClaims } from '../../../evals/rewrite-claim-guard/baseline-guard';
import { PROBES } from '../../../evals/rewrite-claim-guard/probes';
import { EXCLUDED_GRAMMAR_WORDS, freedGrammarWords, grammarWords } from './claim-grammar-words';
import { claimWords } from './claim-token-normalization';
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
  // Refused, the safe direction: a bare root from another form could be a homograph.
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

// ---------------------------------------------------------------------------
// Round 3 (2026-10-21): the narrow fix. The production refusals were ordinary
// words ("including", "went", "evaluated", "additional"). Two changes: an
// inflected form of a listed word is neutral too (isNeutral stem match), and
// the closed class words of the output language need no backing. Everything
// else stays as it was on main.
// ---------------------------------------------------------------------------

test('production case: the section holds the paraphrase and the rewrite adds "including"', () => {
  // "evaluated" and "additional" are in the section, "including" is not. Main
  // refused this for "including"; the stem of the listed "included" frees it.
  const before = 'Applied AI engineer who builds LLM apps. Safwa, a live Q&A filter evaluated on 1,002 hand-labelled cases. Works in English (C1) with German (B2, certified) as an additional language.';
  const after = 'Applied AI engineer who builds LLM apps, including Safwa, a live Q&A filter evaluated on 1,002 hand-labelled cases. Works in English (C1) with German (B2, certified) as an additional language.';
  assert.deepEqual(baselineIntroducedClaims(after, SOURCE_CV, before), ['including']);
  assert.deepEqual(introducedClaims(after, SOURCE_CV, before, 'en', 'summary'), []);
  assert.deepEqual(introducedClaims(after, SOURCE_CV, before), []);
});

test('the stem match frees inflections of listed words, and only those', () => {
  const before = 'Applied AI engineer.';
  const free = (after: string) => introducedClaims(after, SOURCE_CV, before, 'en', 'summary');
  assert.deepEqual(free('Applied AI engineer including, it includes and creates and provides, reducing and removing, making things.'), []);
  // Never a role or title word, and never a form with a claim of its own.
  for (const word of ['headed', 'heads', 'featured', 'featuring', 'sentenced', 'sentencing', 'writs']) {
    assert.deepEqual(free(`Applied AI engineer ${word} agents.`), [word], word);
  }
  // "-ly" is not an inflection: "directly" is listed, "direct" and "directs" are not.
  assert.deepEqual(introducedClaims('Applied AI engineer who directs agents.', 'Applied AI engineer. Builds agents.', before, 'en', 'summary'), ['directs']);
  assert.deepEqual(free('Applied AI engineer, extensively.'), ['extensively']);
  // The bare root is not freed by its own inflection: Go the language, Excel the tool.
  assert.deepEqual(free('Applied AI engineer who goes to Go.'), ['go']);
});

test('a stem-matched form follows the case rule: not a name mid-sentence or as a list item', () => {
  const before = 'Applied AI engineer.';
  const run = (after: string, kind: 'summary' | 'experience_bullets' | 'custom_section_items') => introducedClaims(after, SOURCE_CV, before, 'en', kind);
  assert.deepEqual(run('Reducing agents. Applied AI engineer, including agents.', 'summary'), []);
  assert.deepEqual(run('Applied AI engineer at Scales.', 'summary'), ['scales']);
  assert.deepEqual(run('Applied AI engineer, handles agents and Handles.', 'summary'), ['handles']);
  assert.deepEqual(run('English\nScales', 'custom_section_items'), ['scales']);
  assert.deepEqual(run('Reducing agents', 'custom_section_items'), ['reducing']);
  // A bullet opens with a verb, so a capital opening a bullet is fine there, and only there.
  assert.deepEqual(run('Reducing agents\n- Increasing agents', 'experience_bullets'), []);
  assert.deepEqual(run('Built agents at Moves', 'experience_bullets'), ['moves']);
});

test('grammar words are free in the output language only', () => {
  const before = 'Applied AI engineer.';
  assert.deepEqual(introducedClaims('Applied AI engineer although against others, though among them and whereas toward it.', SOURCE_CV, before, 'en', 'summary'), []);
  // The same words are claims with no language, or in another language.
  assert.deepEqual(introducedClaims('Applied AI engineer although against others.', SOURCE_CV, before), ['although', 'against']);
  assert.deepEqual(introducedClaims('Applied AI engineer although against others.', SOURCE_CV, before, 'fr', 'summary'), ['although', 'against']);
  // German words are not free in English, English words not in German.
  assert.deepEqual(introducedClaims('Applied AI engineer, obwohl wegen sodass.', SOURCE_CV, before, 'en', 'summary'), ['obwohl', 'wegen', 'sodass']);
  const source = 'Vertriebsingenieurin. Betreuung von 40 Kunden im Maschinenbau.';
  const beforeDe = 'Vertriebsingenieurin im Maschinenbau.';
  // "mich" stays a claim word (first-person object, see EXCLUDED_GRAMMAR_WORDS).
  assert.deepEqual(introducedClaims('Vertriebsingenieurin im Maschinenbau, obwohl wegen sodass er mich sieht.', source, beforeDe, 'de', 'summary'), ['mich', 'sieht']);
  assert.deepEqual(introducedClaims('Vertriebsingenieurin im Maschinenbau, although against.', source, beforeDe, 'de', 'summary'), ['although', 'against']);
});

test('a grammar word is free in lowercase or opening a sentence of prose, never as a name or list item', () => {
  const before = 'Applied AI engineer.';
  const prose = (after: string) => introducedClaims(after, SOURCE_CV, before, 'en', 'summary');
  assert.deepEqual(prose('Applied AI engineer. Although agents. Whereas that.'), []);
  assert.deepEqual(prose('Although agents.'), []);
  // Capitalised mid-sentence, in capitals, or after a line break.
  assert.deepEqual(prose('Applied AI engineer at Among.'), ['among']);
  assert.deepEqual(prose('Applied AI engineer at AMONG.'), ['among']);
  assert.deepEqual(prose('Applied AI engineer.\nAlthough agents.'), ['although']);
  // One capitalised use keeps the word checked everywhere.
  assert.deepEqual(prose('Although agents, then Although.'), ['although']);
  assert.deepEqual(prose('Although agents, although Toward.'), ['toward']);
  // After an abbreviation or inside a name, no sentence starts.
  assert.deepEqual(prose('Applied AI engineer, e.g. Although agents.'), ['although']);
  assert.deepEqual(prose('Applied AI engineer in Node.Although agents.'), ['node', 'although']);
  // Never capitalised in a list: bullets, skills, tools, languages.
  const items = (after: string, kind: 'experience_bullets' | 'custom_section_items') => introducedClaims(after, SOURCE_CV, before, 'en', kind);
  assert.deepEqual(items('Although agents', 'experience_bullets'), ['although']);
  assert.deepEqual(items('English\nAlthough', 'custom_section_items'), ['although']);
  assert.deepEqual(items('built agents although unsure', 'experience_bullets'), ['unsure']);
  assert.deepEqual(items('Built agents although', 'experience_bullets'), []);
});

test('Nix, Pro, Plus and Art are never freed, in either language', () => {
  const before = 'Applied AI engineer.';
  // ("via" and "per" are listed in NEUTRAL_WORDS and stay free exactly as on main.)
  for (const name of ['Nix', 'Pro', 'Plus', 'Art']) {
    for (const language of ['en', 'de']) {
      assert.deepEqual(introducedClaims(`Applied AI engineer with ${name}.`, SOURCE_CV, before, language, 'summary'), [name.toLowerCase()], `${language} ${name} mid-sentence`);
      assert.deepEqual(introducedClaims(`Applied AI engineer with ${name.toLowerCase()}.`, SOURCE_CV, before, language, 'summary'), [name.toLowerCase()], `${language} ${name} lowercase`);
      assert.deepEqual(introducedClaims(`English\n${name}`, SOURCE_CV, 'English', language, 'custom_section_items'), [name.toLowerCase()], `${language} ${name} item`);
    }
  }
});

test('the grammar lists hold one word per entry, none excluded, none a role, claim or name', () => {
  for (const language of ['en', 'de'] as const) {
    const list = grammarWords(language);
    assert.ok(list.size > 100, language);
    const excluded = new Set(EXCLUDED_GRAMMAR_WORDS.filter((e) => e.language === language).flatMap((e) => e.words.flatMap((w) => claimWords(w))));
    for (const word of list) {
      assert.deepEqual(claimWords(word), [word], `${language} ${word} is not stable under claimWords`);
      assert.equal(excluded.has(word), false, `${language} ${word} is listed and excluded`);
      // A grammar word never backs a title, a credential or an ownership claim.
      assert.deepEqual(freedGrammarWords(word, language, 'summary'), new Set([word]), `${language} ${word}`);
    }
  }
  // The words the brief names as products.
  for (const word of ['nix', 'pro', 'plus', 'art']) {
    assert.equal(grammarWords('en').has(word) || grammarWords('de').has(word), false, word);
  }
  // No verb other than an auxiliary, no adjective, no adverb: spot checks of the classes that carry claims.
  for (const word of ['led', 'managed', 'senior', 'personally', 'significantly', 'including', 'during-the', 'without', 'myself', 'everyone', 'beyond', 'selber', 'nichts', 'viele', 'ohne']) {
    assert.equal(grammarWords('en').has(word) || grammarWords('de').has(word), false, word);
  }
});

// Every probe is a claim origin/main refuses. The narrow guard must still refuse
// it, naming one of the probe's claim words. The probes are the PR #170 reviewers'
// findings, rebuilt in evals/rewrite-claim-guard/probes.ts.
test('every reviewer probe origin/main refuses is still refused', () => {
  assert.ok(PROBES.length >= 106, `only ${PROBES.length} probes`);
  let mainRefused = 0;
  for (const probe of PROBES) {
    const main = baselineIntroducedClaims(probe.after, probe.source, probe.before);
    if (!main.some((term) => probe.claim.includes(term))) continue;
    mainRefused += 1;
    const now = introducedClaims(probe.after, probe.source, probe.before, probe.language, probe.kind);
    assert.ok(now.some((term) => probe.claim.includes(term)), `${probe.id} (${probe.from}) passes: ${JSON.stringify(probe.after)} -> ${JSON.stringify(now)}`);
  }
  assert.ok(mainRefused >= 106, `main refuses only ${mainRefused} probes`);
});

// main freed these: "found" is a neutral word and the listed match is by stem.
test('founding claims are never neutral', () => {
  assert.deepEqual(introducedClaims('Founded the agents team.', SOURCE_CV, 'Built the agents team.'), ['founded']);
  assert.deepEqual(introducedClaims('Founding engineer for agents.', SOURCE_CV, 'Engineer for agents.'), ['founding']);
});

// Review of #171 (Opus): a German first-person pronoun was the only gate on a supervision claim.
test('German first-person objects and possessives are not freed', () => {
  const cv = 'Vertriebsingenieurin im Maschinenbau. Arbeit im Team.';
  const before = 'Vertriebsingenieurin im Maschinenbau.';
  assert.deepEqual(introducedClaims('Vertriebsingenieurin im Maschinenbau, mit dem Team unter mir.', cv, before, 'de', 'summary'), ['mir']);
  assert.deepEqual(introducedClaims('Vertriebsingenieurin im Maschinenbau, mein Team.', cv, before, 'de', 'summary'), ['mein']);
  // A lowercase CLI tool spelled like a preposition.
  assert.deepEqual(introducedClaims('Tests\nab', 'Tests im Team.', 'Tests', 'de', 'custom_section_items'), ['ab']);
});

// Review of #171 (Sonnet): role words stay claims on the new stem path too, not only founded/founding.
test('role words are never freed through the stem match', () => {
  for (const [after, word] of [['Heads the agents team.', 'heads'], ['Headed the agents team.', 'headed'], ['Heading the agents team.', 'heading'], ['Managing the agents team.', 'managing']] as const) {
    assert.deepEqual(introducedClaims(after, SOURCE_CV, 'Built the agents team.', 'en', 'summary'), [word], after);
  }
});

// Review of #171 (Opus): a capital after a longer abbreviation is mid-sentence, not a sentence start.
test('a capitalised grammar word after inkl. or Mio. is not treated as a sentence start', () => {
  assert.deepEqual(introducedClaims('Umsatz inkl. Weil im Team.', 'Umsatz im Team.', 'Umsatz im Team.', 'de', 'summary'), ['inkl', 'weil']);
});
