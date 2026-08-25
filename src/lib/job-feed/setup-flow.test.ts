import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSetupLine } from './setup-intent';
import {
  buildConfirmSearchPlan,
  buildUserConfirmedStrategy,
  isCitySkipLine,
  isUserConfirmedStrategy,
  planCapForTier,
  resolveSavedTargetRoles,
  resolveSearchStrategyMode,
  rolesFromCareerProfile,
  rolesFromConfirmedQueries,
  shouldGenerateStrategyOnSettingsSave,
  shouldReuseUserConfirmedStrategy,
  validateConfirmedQueries,
} from './search-plan';
import { serpApiLocationValue } from './serpapi';
import { buildJobFeedSearchPlan, buildJobFeedSearchPlanFromStrategy } from './ingestion';
import { getJobFeedOverviewState } from './helpers';
import { formatSetupPlanSummary } from '../../components/job-feed/feed-format';
import type { JobFeedSettings } from '@/lib/supabase/types';
import type { CareerProfile } from './career-profile';
import type { SearchStrategy } from './search-strategy';

const ROLES = [
  'Senior Product Manager',
  'Product Manager, API and Integrations',
  'Product Manager, B2B SaaS',
  'Group Product Manager',
];

test('parseSetupLine maps typed countries and fails unknown ones as empty', () => {
  const known = parseSetupLine('US and Canada');
  assert.equal(known.countries.includes('us'), true);
  assert.equal(known.countries.includes('ca'), true);
  const unknown = parseSetupLine('Narnia');
  assert.deepEqual(unknown.countries, []);
  assert.deepEqual(unknown.cities, []);
});

test('parseSetupLine maps typed cities and fails unknown cities as empty', () => {
  const known = parseSetupLine('Berlin and NYC');
  assert.deepEqual(known.cities, ['Berlin', 'New York']);
  const unknown = parseSetupLine('Springfield');
  assert.deepEqual(unknown.cities, []);
  assert.equal(isCitySkipLine('skip'), true);
  assert.equal(isCitySkipLine('country only'), true);
  assert.equal(isCitySkipLine('Berlin'), false);
});

test('cities are optional: empty city list is a valid confirm plan', () => {
  const plan = buildConfirmSearchPlan({
    roles: ['Product Manager'],
    countries: ['us'],
    cities: [],
    cap: 2,
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].cityHint, null);
  assert.equal(plan[0].query, 'Product Manager');
});

test('plan cap is Plus 2 and Max 4', () => {
  assert.equal(planCapForTier('plus'), 2);
  assert.equal(planCapForTier('max'), 4);
  assert.equal(planCapForTier('free'), 1);
  const plus = buildConfirmSearchPlan({ roles: ROLES, countries: ['us'], cap: 2 });
  const max = buildConfirmSearchPlan({ roles: ROLES, countries: ['us'], cap: 4 });
  assert.equal(plus.length, 2);
  assert.equal(max.length, 4);
});

test('over-cap takes the first N from career profile order, no LLM ranker', () => {
  const profile = {
    inferredTitles: ROLES.map((canonical) => ({ canonical, confidence: 'high' as const, rationale: '' })),
  } as CareerProfile;
  const roles = rolesFromCareerProfile(profile);
  assert.deepEqual(roles, ROLES);
  const plan = buildConfirmSearchPlan({ roles, countries: ['us', 'de'], cap: 2 });
  assert.equal(plan.length, 2);
  assert.equal(plan[0].query, 'Senior Product Manager');
  assert.equal(plan[0].targetCountry, 'us');
  assert.equal(plan[1].query, 'Senior Product Manager');
  assert.equal(plan[1].targetCountry, 'de');
});

test('cities do not add extra SerpAPI rows on the confirm plan or the legacy planner', () => {
  const cities = ['New York', 'Austin', 'Seattle'];
  const confirm = buildConfirmSearchPlan({
    roles: ['PM', 'EM'],
    countries: ['us'],
    cities,
    cap: 2,
  });
  assert.equal(confirm.length, 2);

  const settings = fixtureSettings({
    target_roles: ['PM', 'EM'],
    target_countries: ['us'],
    target_cities: cities,
  });
  const planned = buildJobFeedSearchPlan(settings, 2);
  assert.equal(planned.length, 2);
});

test('empty city uses the country name as SerpAPI location', () => {
  assert.equal(serpApiLocationValue('us', null), 'United States');
  assert.equal(serpApiLocationValue('us', ''), 'United States');
  assert.equal(serpApiLocationValue('de', 'Berlin'), 'Berlin, Germany');
});

test('settings save never generates a search strategy', () => {
  assert.equal(shouldGenerateStrategyOnSettingsSave(), false);
});

test('later runs reuse a user-confirmed list and do not silently re-pick', () => {
  assert.equal(resolveSearchStrategyMode({ userConfirmed: true }), 'reuse_confirmed');
  assert.equal(resolveSearchStrategyMode({ userConfirmed: false }), 'generate');
  const strategy = buildUserConfirmedStrategy({
    queries: [{ query: 'Product Manager', targetCountry: 'us' }],
  });
  assert.equal(isUserConfirmedStrategy(strategy), true);
  assert.equal(strategy.userConfirmed, true);
  assert.equal(strategy.queries[0].query, 'Product Manager');
  // Settings save never posts generateSearchStrategy, and a confirmed list
  // must not fall through to generate even if the caller only has this flag.
  assert.equal(shouldGenerateStrategyOnSettingsSave(), false);
  assert.notEqual(resolveSearchStrategyMode({ userConfirmed: isUserConfirmedStrategy(strategy) }), 'generate');
  // Stale schema, hash or profile must still reuse. Silent re-pick is a spec break.
  assert.equal(shouldReuseUserConfirmedStrategy({ strategy, version: 0 }), true);
  assert.equal(shouldReuseUserConfirmedStrategy({ strategy, version: 999 }), true);
  assert.equal(
    shouldReuseUserConfirmedStrategy({ strategy: { userConfirmed: true, queries: [] }, version: 1 }),
    false,
  );
  assert.equal(
    shouldReuseUserConfirmedStrategy({ strategy: { userConfirmed: false, queries: strategy.queries }, version: 1 }),
    false,
  );
});

test('confirmed queries persist as target_roles in career-profile order', () => {
  const roles = rolesFromConfirmedQueries([
    { query: 'Senior Product Manager', targetCountry: 'us' },
    { query: 'Senior Product Manager', targetCountry: 'de' },
    { query: 'Data Engineer', targetCountry: 'us' },
  ]);
  assert.deepEqual(roles, ['Senior Product Manager', 'Data Engineer']);
  assert.deepEqual(
    resolveSavedTargetRoles(['Confirmed PM'], ['Old PM'], ['Mirrored PM']),
    ['Confirmed PM'],
  );
  assert.deepEqual(
    resolveSavedTargetRoles([], ['Saved PM'], ['Mirrored PM']),
    ['Saved PM'],
  );
});

test('plan persist fails loud on empty keyword, unknown country and over-cap', () => {
  assert.equal(validateConfirmedQueries([], 2).ok, false);
  assert.equal(validateConfirmedQueries([{ query: '  ', targetCountry: 'us' }], 2).ok, false);
  assert.equal(validateConfirmedQueries([{ query: 'PM', targetCountry: 'xx' }], 2).ok, false);
  assert.equal(
    validateConfirmedQueries(
      [
        { query: 'A', targetCountry: 'us' },
        { query: 'B', targetCountry: 'us' },
        { query: 'C', targetCountry: 'us' },
      ],
      2,
    ).ok,
    false,
  );
  const ok = validateConfirmedQueries([{ query: 'PM', targetCountry: 'us' }], 2);
  assert.equal(ok.ok, true);
});

test('ingestion applies a confirmed list as-is and still attaches a city hint', () => {
  const strategy = buildUserConfirmedStrategy({
    queries: [
      { query: 'Product Manager', targetCountry: 'us' },
      { query: 'Data Engineer', targetCountry: 'us' },
    ],
  }) as SearchStrategy;
  const settings = fixtureSettings({
    target_roles: ['Product Manager', 'Data Engineer'],
    target_countries: ['us'],
    target_cities: ['Austin'],
  });
  const plan = buildJobFeedSearchPlanFromStrategy(strategy, settings, 2);
  assert.equal(plan.length, 2);
  assert.equal(plan[0].query, 'Product Manager');
  assert.equal(plan[1].query, 'Data Engineer');
  assert.equal(plan[0].location, 'Austin');
});

test('Free users never enter the paid setup wizard', () => {
  const freeNoCv = getJobFeedOverviewState({
    canAccess: true,
    settings: null,
    latestRun: null,
    isFreeUser: true,
    hasPrimaryCv: false,
  });
  assert.equal(freeNoCv, 'no_cv_required');

  const freeWithCv = getJobFeedOverviewState({
    canAccess: true,
    settings: null,
    latestRun: null,
    isFreeUser: true,
    hasPrimaryCv: true,
  });
  assert.notEqual(freeWithCv, 'setup_required');
  assert.equal(freeWithCv, 'awaiting_first_run');

  const plusNeedsSetup = getJobFeedOverviewState({
    canAccess: true,
    settings: null,
    latestRun: null,
    isFreeUser: false,
  });
  assert.equal(plusNeedsSetup, 'setup_required');
});

test('consent plan summary is one search per line with no trailing comma', () => {
  const text = formatSetupPlanSummary([
    { query: 'Senior Product Manager', targetCountry: 'us' },
    { query: 'Product Manager, API and Integrations', targetCountry: 'us' },
  ]);
  assert.equal(
    text,
    'Senior Product Manager in United States\n\nProduct Manager, API and Integrations in United States',
  );
  assert.equal(text.includes('United States,'), false);
});

function fixtureSettings(overrides: Partial<JobFeedSettings>): JobFeedSettings {
  return {
    user_id: 'test-user',
    enabled: true,
    consent_accepted_at: '2026-08-25T00:00:00.000Z',
    user_timezone: 'America/New_York',
    target_market: 'us',
    target_countries: ['us'],
    target_cities: [],
    target_roles: ['Product Manager'],
    preferred_locations: [],
    remote_preference: 'remote_first',
    remote_preferences: ['remote_first'],
    salary_floor: null,
    languages: ['English'],
    seniority_target: 'senior',
    seniority_targets: ['senior'],
    employment_types: ['full_time'],
    work_authorization_status: 'open_to_both',
    user_skills: [],
    excluded_terms: [],
    created_at: '2026-08-25T00:00:00.000Z',
    updated_at: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}
