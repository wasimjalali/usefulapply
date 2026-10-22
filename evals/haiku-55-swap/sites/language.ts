/**
 * Site: language detection (src/lib/utils/language-detector.ts, detectLanguageResult).
 *
 *   npx tsx evals/haiku-55-swap/run.ts language --allow-anthropic-api --gptoss-url http://localhost:8799 [--runs 3]
 *   npx tsx evals/haiku-55-swap/run.ts language --dry
 *
 * 70 documents, three runs. Primary metric: accuracy against the label. Hard constraint: the shipped
 * code fell back to English (provider error or an unusable reply) on a document that is not English.
 * Sequence: one group, in file order; the system prompt is too short to cache, so there is no cache
 * to warm and the order does not matter.
 */
import { detectLanguageResult } from '@/lib/utils/language-detector';
import { EXPECTED_DOC_COUNT, LANGS, LANGUAGE_DOCS, type LanguageDoc } from '../fixtures/language';
import { generationContext } from '../lib/util';
import type { Site } from '../lib/runner';

export function gradeLanguage(doc: LanguageDoc, got: { language: string; usedFallback: boolean }): { pass: boolean; failures: string[]; hard: string[] } {
  const failures: string[] = [];
  const hard: string[] = [];
  if (got.usedFallback && doc.label !== 'en') {
    hard.push('fallback_on_non_english');
    failures.push('fell back to English');
  }
  if (got.language !== doc.label) failures.push(`said ${got.language}, label ${doc.label}`);
  return { pass: failures.length === 0, failures, hard };
}

export const languageSite: Site<LanguageDoc> = {
  id: 'language',
  title: 'Language detection, 70 documents in 7 languages',
  command: 'npx tsx evals/haiku-55-swap/run.ts language --allow-anthropic-api --gptoss-url <url>',
  runsDefault: 3,
  passRule:
    'The detected language equals the label and the shipped code did not fall back to English.',
  absoluteHard: [],
  cases: () => LANGUAGE_DOCS,
  selfTest() {
    const problems: string[] = [];
    if (LANGUAGE_DOCS.length !== EXPECTED_DOC_COUNT) problems.push(`expected ${EXPECTED_DOC_COUNT} documents, found ${LANGUAGE_DOCS.length}`);
    const ids = new Set(LANGUAGE_DOCS.map((d) => d.id));
    if (ids.size !== LANGUAGE_DOCS.length) problems.push('duplicate document ids');
    for (const lang of LANGS) {
      const n = LANGUAGE_DOCS.filter((d) => d.label === lang).length;
      if (n < 8) problems.push(`only ${n} documents labelled ${lang}`);
    }
    for (const d of LANGUAGE_DOCS) {
      if (d.text.length < 60) problems.push(`${d.id} is shorter than 60 characters`);
      if (d.text.includes('example.com') === false && /@[a-z0-9.-]+\.[a-z]{2,}/i.test(d.text)) problems.push(`${d.id} carries a real-looking email address`);
      const right = gradeLanguage(d, { language: d.label, usedFallback: false });
      const wrong = gradeLanguage(d, { language: LANGS.find((l) => l !== d.label)!, usedFallback: false });
      if (!right.pass || wrong.pass) problems.push(`grader does not separate right from wrong on ${d.id}`);
    }
    if (!LANGUAGE_DOCS.some((d) => d.kind === 'over-24k' && d.text.length > 24_000)) problems.push('no document over the 24,000 character cut');
    return problems;
  },
  oracle: (doc) => () => ({ text: JSON.stringify({ language: doc.label }) }),
  async run(doc) {
    const res = await detectLanguageResult(doc.text, generationContext('language_detection', 'language_classification'));
    const graded = gradeLanguage(doc, res);
    return { output: { language: res.language, usedFallback: res.usedFallback, label: doc.label, kind: doc.kind }, metrics: {}, ...graded };
  },
};
