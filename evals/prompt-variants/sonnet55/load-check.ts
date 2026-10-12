/**
 * Offline load check for the sonnet55 prompt variant. No API calls.
 *
 *   npx tsx evals/prompt-variants/sonnet55/load-check.ts
 *
 * Loads the production prompt modules, installs the eval hook (evals/lib/hooks.ts)
 * with the sonnet55 variant, and loads them again through the same specifiers. It
 * then checks that the hook swapped every module, that export names, kinds and
 * arities match, that the cached system blocks are byte-stable, and it lists every
 * rendered variant prompt line that contains a dash glyph (all of them should be
 * the punctuation rules themselves).
 */
import fs from 'node:fs';
import path from 'node:path';
import type * as CvPrompt from '@/lib/agents/prompts/cv-prompt';
import type * as CoverLetterPrompt from '@/lib/agents/prompts/cover-letter-prompt';
import type * as EmailPrompts from '@/lib/agents/prompts/email-prompts';
import type * as FitPrompt from '@/lib/agents/prompts/fit-assessment-prompt';
import type { MasterContext } from '@/lib/agents/types';
import type { SupportedLanguage } from '@/lib/utils/language-detector';

interface PromptSet {
  cv: typeof CvPrompt;
  letter: typeof CoverLetterPrompt;
  email: typeof EmailPrompts;
  fit: typeof FitPrompt;
}

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FILES = { cv: 'cv-prompt', letter: 'cover-letter-prompt', email: 'email-prompts', fit: 'fit-assessment-prompt' } as const;

// The eval hook patches CommonJS Module._load, so the modules have to be loaded
// with require() for the hook to see them (same reason as evals/lib/hooks.ts).
function load(): PromptSet {
  const req = (name: string): unknown => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path.join(ROOT, 'src', 'lib', 'agents', 'prompts', name));
  };
  return {
    cv: req(FILES.cv) as typeof CvPrompt,
    letter: req(FILES.letter) as typeof CoverLetterPrompt,
    email: req(FILES.email) as typeof EmailPrompts,
    fit: req(FILES.fit) as typeof FitPrompt,
  };
}

const production = load();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const hooks = require(path.join(ROOT, 'evals', 'lib', 'hooks')) as { installHooks: (variant: string, shim: unknown) => void; loadedPromptFiles: string[] };
hooks.installHooks('sonnet55', {});
const variant = load();

console.log('hook loaded:', hooks.loadedPromptFiles.map((f) => path.relative(ROOT, f)));
for (const key of Object.keys(FILES) as Array<keyof PromptSet>) {
  const p = production[key] as unknown as Record<string, unknown>;
  const v = variant[key] as unknown as Record<string, unknown>;
  const pk = Object.keys(p).sort();
  const vk = Object.keys(v).sort();
  const sameKinds = pk.every((k) => {
    const a = p[k];
    const b = v[k];
    if (typeof a !== typeof b) return false;
    return typeof a !== 'function' || (a as (...x: unknown[]) => unknown).length === (b as (...x: unknown[]) => unknown).length;
  });
  console.log(`${FILES[key]}: same export names=${JSON.stringify(pk) === JSON.stringify(vk)} same kinds/arity=${sameKinds} distinct module=${p !== v}`);
}

// Fixture: a committed synthetic CV and the first synthetic English public ad.
const cv = fs.readFileSync(path.join(ROOT, 'evals', 'dataset', 'cvs', 'cv-en-finance-analyst.txt'), 'utf8');
const row = fs.readFileSync(path.join(ROOT, 'evals', 'dataset', 'cases.jsonl'), 'utf8')
  .split('\n').filter(Boolean)
  .map((l) => JSON.parse(l) as { origin: string; language: string; jd?: string })
  .find((r) => r.origin === 'synthetic' && r.language === 'en' && r.jd);
if (!row?.jd) throw new Error('No synthetic English case with an inline ad found');
const jd = row.jd;

function fixture(lang: SupportedLanguage): MasterContext {
  return {
    sessionId: 'load-check',
    jobDescription: jd,
    rawCV: cv,
    masterCV: `${cv}\nOpen to relocation within the EU.`,
    detectedLanguage: lang,
    applicant: {
      name: 'Test Person', email: 'test@example.com', phone: '1', address: 'Berlin',
      skills: ['Excel', 'SQL'], tools: ['Power BI'], languages: ['German C1'],
      experiences: [{ company: 'A', title: 'Analyst', startDate: '2020', endDate: '2024', bullets: [] }],
      certifications: [],
    },
    job: { title: 'Analyst', companyName: 'Co', location: 'Berlin', requiredSkills: ['SQL', 'Python'], niceToHaveSkills: ['Tableau'], responsibilities: ['Report'] },
    match: { score: 72, matchedRequirements: ['SQL'], claimableEvidence: ['SQL', 'Excel'], missingSkills: ['Python'] },
    verifiedMetrics: ['12%'],
    applicationEmail: { subject: 'Application: Analyst, Test Person', body: 'Hello' },
  };
}

const DASH = new RegExp(`[${[0x2012, 0x2013, 0x2014, 0x2015].map((c) => String.fromCharCode(c)).join('')}]`);
const variantDashLines = new Set<string>();

function report(set: string, label: string, text: string): void {
  const lines = text.split('\n').filter((l) => DASH.test(l));
  console.log(`  ${label}: ${text.length} chars, lines containing a dash glyph: ${lines.length}`);
  if (set === 'sonnet55') for (const l of lines) variantDashLines.add(`[${label}] ${l.trim().slice(0, 160)}`);
}

for (const [name, set] of [['production', production], ['sonnet55', variant]] as const) {
  console.log(`--- ${name}`);
  const build = () => ({
    cv: set.cv.buildCVOptimizationSystemBlocks()[0].text,
    letter: set.letter.buildCoverLetterSystemBlocks()[0].text,
    email: set.email.buildApplicationEmailSystemBlocks()[0].text,
    followup: set.email.buildFollowUpEmailSystemBlocks()[0].text,
    fit: set.fit.buildFitAssessmentSystemBlocks()[0].text,
  });
  const sys = build();
  console.log('  system blocks byte-stable across builds:', JSON.stringify(sys) === JSON.stringify(build()));
  for (const [k, v] of Object.entries(sys)) report(name, `system ${k}`, v);
  for (const lang of ['en', 'de'] as const) {
    const c = fixture(lang);
    const users = {
      cv: set.cv.buildCVOptimizationUserPrompt(c, lang),
      letter: set.letter.buildCoverLetterUserPrompt(c),
      email: set.email.buildApplicationEmailUserPrompt(c),
      followup: set.email.buildFollowUpEmailUserPrompt(c),
      fit: set.fit.buildFitAssessmentPrompt({ applicant: c.applicant, job: c.job, match: c.match, masterCV: c.masterCV }),
    };
    // The ad and CV text are data, not prompt prose, so they are cut before counting.
    for (const [k, v] of Object.entries(users)) report(name, `user ${k} (${lang})`, v.split(jd).join('').split(cv).join(''));
  }
}

console.log('--- sonnet55 prompt lines containing a dash glyph (expected: only the punctuation rules):');
for (const l of variantDashLines) console.log(`  ${l}`);
