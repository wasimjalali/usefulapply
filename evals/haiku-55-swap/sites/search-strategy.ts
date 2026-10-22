/**
 * Site: job feed search strategy (src/lib/job-feed/search-strategy.ts, generateSearchStrategy).
 *
 *   npx tsx evals/haiku-55-swap/run.ts search-strategy --allow-anthropic-api --gptoss-url http://localhost:8799 [--runs 3]
 *   npx tsx evals/haiku-55-swap/run.ts search-strategy --dry
 *
 * 12 fictional profiles with feed settings (four multi-country, two German-only, two remote-only, a
 * career changer, a new graduate, a 25-year director, a 17-year freelancer). Three runs.
 *
 * Primary metric: the shipped validator accepts the strategy (allowed countries, a short-tail query per
 * country, no operators or quotes, valid fallbacks) AND Opus 5.5 (high effort, clean) scores the queries at
 * least 4 of 5 on relevance, localisation and variety. Hard constraint: a query for a country outside the
 * settings (the validator throws on it, so this counts the throws that name a country).
 * Sequence: one group, the 12 profiles in order; the static system prompt is shared across users.
 */
import { generateSearchStrategy, SearchStrategyParseError, type SearchStrategy } from '@/lib/job-feed/search-strategy';
import { PERSONAS, buildProfile, buildSettings, type Persona } from '../fixtures/personas';
import { DASH_RE, generationContext } from '../lib/util';
import type { CaseResult, JudgePlan, Site, SiteCase } from '../lib/runner';
import type { Oracle } from '../lib/intercept';

interface Item extends SiteCase {
  persona: Persona;
}

const ITEMS: Item[] = PERSONAS.map((persona) => ({ id: persona.id, group: 'strategy', persona }));
export const JUDGE_PASS_SCORE = 4;

const RUBRIC = `You grade a job search strategy: the list of web job-search queries an assistant produced for one candidate.

You get the candidate's inferred career profile, their feed settings and the strategy. Score 1 to 5, whole numbers, on the strategy as a whole:
- relevance: the queries target roles the candidate can realistically get, given their seniority, skills, target roles and direction; no query for a role they are clearly not suited for, and no query that drops the target roles
- localisation: queries for a country use the language and job titles people use there (a German market query in German where the candidate works in German; English for English-speaking markets); each query's country matches the settings. Cities never belong in a query: the search code sends the target city or country as a separate location parameter with every query, so a query without a city name is correct and is never a weakness
- variety and recall: a sensible mix of short, long and localized queries that would surface different postings, not ten near-copies
- hygiene: no quotes, boolean operators or filler words in the queries

5 = strong on all four; 4 = one small weakness; 3 = a clear weakness or a missing market; 2 = several weaknesses; 1 = mostly unusable. List the specific problems you found. Do not reward length.`;

const SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    problems: { type: 'array', items: { type: 'string' } },
  },
  required: ['score', 'problems'],
  additionalProperties: false,
};

const judgePlan: JudgePlan<Item> = {
  spec: { name: 'search-strategy', rubric: RUBRIC, schema: SCHEMA },
  wants: (o) => o.pass,
  prompt: (o, c) => `<career_profile>\n${JSON.stringify(buildProfile(c.persona), null, 2)}\n</career_profile>\n\n<settings>\n${JSON.stringify(buildSettings(c.persona), null, 2)}\n</settings>\n\n<strategy>\n${JSON.stringify((o.output as { strategy: SearchStrategy }).strategy, null, 2)}\n</strategy>`,
  canned: { score: 5, problems: [] },
  apply(verdict, o) {
    const v = verdict as { score: number; problems: string[] };
    o.metrics.relevance = v.score;
    if (v.score < JUDGE_PASS_SCORE) {
      o.pass = false;
      o.failures.push(`judge scored ${v.score}: ${v.problems.slice(0, 2).join(' | ')}`);
    }
  },
};

/** A strategy that passes the shipped validator, for the dry run. */
function oracleStrategy(p: Persona): string {
  const s = buildSettings(p);
  const role = s.target_roles[0] ?? 'Engineer';
  const queries = s.target_countries.flatMap((country, i) => [
    { type: 'short_tail', query: role, targetCountry: country, rationale: `Direct title match in ${country}.`, expectedRecall: 'high', fallbackTo: null },
    ...(i === 0 ? [{ type: 'long_tail', query: `${role} ${s.target_cities[0] ?? ''}`.trim(), targetCountry: country, rationale: 'Title plus the preferred city.', expectedRecall: 'medium', fallbackTo: 0 }] : []),
  ]);
  return JSON.stringify({ queries, negativeTerms: p.profile.negative.slice(0, 3) });
}

export const searchStrategySite: Site<Item> = {
  id: 'search_strategy',
  title: 'Search strategy, 12 profiles with settings',
  command: 'npx tsx evals/haiku-55-swap/run.ts search-strategy --allow-anthropic-api --gptoss-url <url>',
  runsDefault: 3,
  passRule:
    'The shipped validator accepts the strategy and the Opus judge scores relevance, localisation and variety at 4 or more of 5.',
  absoluteHard: [],
  cases: () => ITEMS,
  judge: judgePlan,
  selfTest() {
    const problems: string[] = [];
    if (ITEMS.length !== 12) problems.push(`expected 12 profiles, found ${ITEMS.length}`);
    const multi = ITEMS.filter((i) => i.persona.settings.target_countries && i.persona.settings.target_countries.length > 1).length;
    const german = ITEMS.filter((i) => i.persona.tags.includes('german-only')).length;
    const remote = ITEMS.filter((i) => i.persona.settings.remote_preferences?.length === 1 && i.persona.settings.remote_preferences[0] === 'remote_only').length;
    if (multi < 3) problems.push(`only ${multi} multi-country profiles, need 3`);
    if (german < 2) problems.push(`only ${german} German-only profiles, need 2`);
    if (remote < 1) problems.push('no remote-only profile');
    for (const { persona } of ITEMS) {
      const profile = buildProfile(persona);
      if (profile.yearsInFunction > profile.yearsTotal) problems.push(`${persona.id}: yearsInFunction exceeds yearsTotal`);
      const settings = buildSettings(persona);
      if (settings.target_countries.length === 0) problems.push(`${persona.id}: no target countries`);
      if (DASH_RE.test(JSON.stringify(persona))) problems.push(`${persona.id}: fixture carries a dash character`);
    }
    return problems;
  },
  oracle: (item): Oracle => () => ({ text: oracleStrategy(item.persona) }),
  async run(item): Promise<CaseResult> {
    const profile = buildProfile(item.persona);
    const settings = buildSettings(item.persona);
    try {
      const res = await generateSearchStrategy({ profile, settings, generationContext: generationContext('job_feed', 'search_strategy') });
      return { output: { strategy: res.strategy, tokens: { input: res.inputTokens, output: res.outputTokens } }, pass: true, failures: [], hard: [], metrics: { queries: res.strategy.queries.length } };
    } catch (error) {
      if (!(error instanceof SearchStrategyParseError)) throw error;
      const outsideCountry = /not in settings\.target_countries/.test(error.message);
      return { output: { validatorError: error.message, raw: error.raw.slice(0, 2000) }, pass: false, failures: [`validator: ${error.message}`], hard: outsideCountry ? ['query_outside_target_countries'] : [], metrics: {} };
    }
  },
};
