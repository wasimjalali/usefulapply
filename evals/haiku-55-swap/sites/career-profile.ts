/**
 * Site: career profile synthesis (src/lib/job-feed/career-profile-synthesis.ts, generateCareerProfile).
 *
 *   npx tsx evals/haiku-55-swap/run.ts career-profile --allow-anthropic-api --gptoss-url http://localhost:8799 [--runs 3]
 *   npx tsx evals/haiku-55-swap/run.ts career-profile --dry
 *
 * 12 structured CVs: a senior backend engineer, a mid analyst (German), a junior marketer, a mid analyst,
 * a career changer (teacher to learning design), a lead, a 25-year director, a new graduate, a career
 * changer (nurse to informatics), a senior PM, a German sales rep, and a freelancer whose CV is over
 * 60,000 characters (70 engagements). Three runs.
 *
 * Primary metric: the shipped validator accepts the profile, the narrative carries no dash, total years
 * land within 3 of the true figure, AND Opus 5.5 (high effort, clean) finds no claim that the CV does not
 * support. Hard constraint: an unsupported claim (invented_claim).
 * Sequence: one group, the 12 CVs in order; the static system prompt is shared across users.
 */
import { CareerProfileParseError, generateCareerProfile } from '@/lib/job-feed/career-profile-synthesis';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
import { PERSONAS, buildProfile, personaCv, type Persona } from '../fixtures/personas';
import { DASH_RE, generationContext } from '../lib/util';
import type { CaseResult, JudgePlan, Site, SiteCase } from '../lib/runner';
import type { Oracle } from '../lib/intercept';

interface Item extends SiteCase {
  persona: Persona;
  index: number;
}

const ITEMS: Item[] = PERSONAS.map((persona, index) => ({ id: persona.id, group: 'profiles', persona, index }));
const YEARS_TOLERANCE = 3;

const RUBRIC = `You check a career profile that an assistant synthesized from a candidate's structured CV, for unsupported claims only.

Source of truth: the CV given below, and nothing else. A claim is unsupported when the profile states or implies something the CV does not show: a title the evidence does not support, a skill or tool that appears nowhere in the CV, an industry the candidate never worked in, an invented company, date, employer, certification or accomplishment, a seniority or years figure far from what the dates show, or a pivot or aspiration with no evidence in the CV.

Fine, and not unsupported: grouping CV skills into named clusters, normalizing a job title to its market-standard form when the CV's role clearly maps to it, reasonable years computed from the CV dates, a cautious low-confidence aspiration that the CV hints at, and an empty field where the CV has no evidence.

Mark hallucinated = true if there is at least one unsupported claim. List each, quoting the profile's words and saying what the CV shows instead. Be strict and specific. Do not judge style.`;

const SCHEMA = {
  type: 'object',
  properties: {
    hallucinated: { type: 'boolean' },
    unsupported_claims: { type: 'array', items: { type: 'string' } },
  },
  required: ['hallucinated', 'unsupported_claims'],
  additionalProperties: false,
};

const judgePlan: JudgePlan<Item> = {
  spec: { name: 'career-profile', rubric: RUBRIC, schema: SCHEMA },
  wants: (o) => o.pass,
  prompt: (o, c) => `<cv>\n${JSON.stringify(personaCv(c.persona, c.index), null, 1)}\n</cv>\n\n<profile>\n${JSON.stringify((o.output as { profile: CareerProfile }).profile, null, 2)}\n</profile>`,
  canned: { hallucinated: false, unsupported_claims: [] },
  apply(verdict, o) {
    const v = verdict as { hallucinated: boolean; unsupported_claims: string[] };
    o.metrics.unsupportedClaims = v.unsupported_claims.length;
    if (v.hallucinated) {
      o.pass = false;
      o.failures.push(`unsupported: ${v.unsupported_claims.slice(0, 3).join(' | ')}`);
      o.hard.push('invented_claim');
    }
  },
};

export const careerProfileSite: Site<Item> = {
  id: 'career_profile',
  title: 'Career profile synthesis, 12 structured CVs (one over 60,000 characters)',
  command: 'npx tsx evals/haiku-55-swap/run.ts career-profile --allow-anthropic-api --gptoss-url <url>',
  runsDefault: 3,
  passRule:
    'The shipped validator accepts the profile, the narrative has no dash, total years are within 3, and the Opus judge finds no unsupported claim.',
  absoluteHard: [],
  cases: () => ITEMS,
  judge: judgePlan,
  selfTest() {
    const problems: string[] = [];
    if (ITEMS.length !== 12) problems.push(`expected 12 CVs, found ${ITEMS.length}`);
    for (const item of ITEMS) {
      const cv = personaCv(item.persona, item.index);
      if (cv.experience.length === 0 && item.persona.id !== 'p08') problems.push(`${item.id}: no experience`);
      if (DASH_RE.test(JSON.stringify(cv))) problems.push(`${item.id}: CV carries a dash character`);
      if (/@(?!example\.com)/.test(JSON.stringify(cv))) problems.push(`${item.id}: non-example.com address`);
    }
    const big = ITEMS.find((i) => i.persona.id === 'p12');
    const chars = big ? JSON.stringify(personaCv(big.persona, big.index)).length : 0;
    if (chars < 60_000) problems.push(`the long CV is ${chars} characters, need over 60,000`);
    return problems;
  },
  oracle: (item): Oracle => () => ({ text: JSON.stringify(buildProfile(item.persona)) }),
  async run(item): Promise<CaseResult> {
    const cv = personaCv(item.persona, item.index);
    const cvChars = JSON.stringify(cv).length;
    try {
      const res = await generateCareerProfile(cv, generationContext('job_feed', 'career_profile'));
      const failures: string[] = [];
      if (DASH_RE.test(res.profile.narrative)) failures.push('narrative carries a dash');
      const yearsError = Math.abs(res.profile.yearsTotal - item.persona.profile.years);
      if (yearsError > YEARS_TOLERANCE) failures.push(`yearsTotal ${res.profile.yearsTotal}, expected about ${item.persona.profile.years}`);
      return { output: { profile: res.profile, cvChars, tokens: { input: res.inputTokens, output: res.outputTokens } }, pass: failures.length === 0, failures, hard: [], metrics: { yearsError, levelMatch: res.profile.seniority.level === item.persona.profile.level ? 1 : 0 } };
    } catch (error) {
      if (!(error instanceof CareerProfileParseError)) throw error;
      return { output: { validatorError: error.message, cvChars, raw: error.raw.slice(0, 2000) }, pass: false, failures: [`validator: ${error.message}`], hard: [], metrics: {} };
    }
  },
};
