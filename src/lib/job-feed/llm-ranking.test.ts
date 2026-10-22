import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RANKING_EXCERPT_CHARS,
  RANKING_EXCERPT_FLOOR_CHARS,
  RANKING_INPUT_BUDGET_TOKENS,
  RANKING_SYSTEM_PROMPT,
  buildCandidatesMessage,
  buildUserProfileMessage,
  fitCandidatesToBudget,
  validateModelRankingResponse,
} from './llm-ranking-prompt';
import type { JobFeedRankingCandidate } from './types';
import type { JobFeedSettings } from '@/lib/supabase/types';

function candidate(index: number, descriptionChars: number): JobFeedRankingCandidate {
  return {
    jobId: `job-${index}`,
    title: `Engineer ${index}`,
    company: 'Acme',
    location: 'Berlin',
    workMode: 'hybrid',
    employmentType: 'full_time',
    salaryText: null,
    description: 'x'.repeat(descriptionChars),
    applyUrl: null,
    freshnessDays: 2,
    deterministicRank: index,
    deterministicScore: 50 - index,
    deterministicFitLabel: 'good',
    scoreBreakdown: {
      targetRoleScore: 1, adjacentRoleScore: 0, freshnessScore: 1, salaryScore: 0,
      remoteAlignmentScore: 0, preferredLocationMatched: true, hasApplyUrl: false,
      hasEmploymentType: true, skillOverlapScore: 0,
    },
  } as JobFeedRankingCandidate;
}

function settings(targetRoles: string[]): JobFeedSettings {
  return {
    target_roles: targetRoles,
    user_skills: ['TypeScript'],
    preferred_locations: ['Berlin'],
    remote_preference: 'hybrid',
    remote_preferences: ['hybrid'],
    seniority_targets: ['senior'],
    target_countries: ['de'],
    target_cities: ['Berlin'],
    salary_floor: null,
    employment_types: ['full_time'],
    work_authorization_status: null,
    target_market: 'de',
    languages: ['en', 'de'],
  } as unknown as JobFeedSettings;
}

// A linear token model: a fixed part plus the excerpt text at `ratio` chars per token.
function linearCounter(candidates: JobFeedRankingCandidate[], fixedTokens: number, ratio: number) {
  const calls: number[] = [];
  const countTokens = async (excerptChars: number) => {
    calls.push(excerptChars);
    const chars = candidates.reduce((sum, c) => sum + Math.min(excerptChars, c.description?.length ?? 0), 0);
    return Math.ceil(fixedTokens + chars / ratio);
  };
  return { countTokens, calls };
}

test('excerpt shrink: under budget keeps the full excerpt and counts once', async () => {
  const candidates = Array.from({ length: 20 }, (_, i) => candidate(i, 6000));
  const { countTokens, calls } = linearCounter(candidates, 22_000, 3);
  const fit = await fitCandidatesToBudget({ candidates, countTokens });
  assert.equal(fit.fits, true);
  assert.equal(fit.shrunk, false);
  assert.equal(fit.excerptChars, RANKING_EXCERPT_CHARS);
  assert.deepEqual(calls, [RANKING_EXCERPT_CHARS]);
});

test('excerpt shrink: German-density Max run is cut proportionally, recounted once, and fits', async () => {
  // 40 jobs x 3500 chars at 1.9 chars/token = ~73.7k excerpt tokens, plus 22k fixed = ~95.7k.
  const candidates = Array.from({ length: 40 }, (_, i) => candidate(i, 6000));
  const { countTokens, calls } = linearCounter(candidates, 22_000, 1.9);
  const full = await countTokens(RANKING_EXCERPT_CHARS);
  assert.ok(full > RANKING_INPUT_BUDGET_TOKENS, `setup must start over budget, got ${full}`);
  calls.length = 0;

  const fit = await fitCandidatesToBudget({ candidates, countTokens });
  assert.equal(fit.shrunk, true);
  assert.equal(fit.fits, true);
  assert.ok(fit.excerptChars < RANKING_EXCERPT_CHARS);
  assert.ok(fit.excerptChars >= RANKING_EXCERPT_FLOOR_CHARS);
  assert.ok(fit.tokens <= RANKING_INPUT_BUDGET_TOKENS);
  assert.equal(calls.length, 2, 'one count at full length, one recount after shrinking');
  assert.equal(calls[1], fit.excerptChars);
});

test('excerpt shrink: never goes below the 1,500 char floor and reports no fit', async () => {
  // Fixed part alone is over the budget, so no excerpt length can fit.
  const candidates = Array.from({ length: 40 }, (_, i) => candidate(i, 6000));
  const { countTokens } = linearCounter(candidates, 95_000, 1.9);
  const fit = await fitCandidatesToBudget({ candidates, countTokens });
  assert.equal(fit.excerptChars, RANKING_EXCERPT_FLOOR_CHARS);
  assert.equal(fit.fits, false);
  assert.equal(fit.shrunk, true);
});

test('excerpt shrink: the shrunk length is what the candidates message actually carries', () => {
  const candidates = [candidate(1, 6000)];
  const long = JSON.parse(buildCandidatesMessage(candidates, 10, RANKING_EXCERPT_CHARS));
  const short = JSON.parse(buildCandidatesMessage(candidates, 10, 1500));
  assert.equal(long.candidates[0].descriptionExcerpt.length, RANKING_EXCERPT_CHARS);
  assert.equal(short.candidates[0].descriptionExcerpt.length, 1500);
});

test('static prefix is byte-identical across users, tiers and runs', () => {
  // Everything before the candidates message is the cached prefix. Two different
  // users on different tiers with different candidate sets must produce the same
  // static block, and visibleCap must live only in the candidates message.
  const systemA = RANKING_SYSTEM_PROMPT;
  assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(systemA), 'no timestamp in the static prompt');
  // Long enough to clear Haiku 5.5's 512 token cache minimum, at the worst 1.8 chars/token.
  assert.ok(systemA.length / 1.8 > 2800);

  const plusRun = buildCandidatesMessage([candidate(1, 100)], 25);
  const maxRun = buildCandidatesMessage(Array.from({ length: 5 }, (_, i) => candidate(i, 100)), 25);
  assert.ok(plusRun.includes('at most 25'));
  assert.ok(maxRun.includes('at most 25'));
  assert.ok(!systemA.includes('at most 25'), 'visibleCap is in the candidates message only');
  assert.notEqual(plusRun, maxRun);
});

test('stable context is identical for one user across runs and differs between users', () => {
  const one = buildUserProfileMessage(settings(['AI Engineer']), 6, null, ['sales'], []);
  const again = buildUserProfileMessage(settings(['AI Engineer']), 6, null, ['sales'], []);
  const other = buildUserProfileMessage(settings(['Data Analyst']), 3, null, [], []);
  assert.equal(one, again);
  assert.notEqual(one, other);
  assert.ok(!one.includes('job-'), 'no candidate data in the per-user block');
});

test('validator keeps the 60% coverage floor', () => {
  const candidates = Array.from({ length: 10 }, (_, i) => candidate(i, 100));
  const item = (i: number) => ({ jobId: `job-${i}`, decision: 'good' as const, rank: i + 1, reason: null, companyDisplay: null });
  assert.equal(validateModelRankingResponse({ items: [0, 1, 2, 3, 4].map(item) }, candidates, 10), null);
  const ok = validateModelRankingResponse({ items: [0, 1, 2, 3, 4, 5].map(item) }, candidates, 10);
  assert.ok(ok);
  assert.equal(ok.length, 6);
  assert.equal(ok[0].rankingSource, 'llm');
});
