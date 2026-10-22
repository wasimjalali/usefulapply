import assert from 'node:assert/strict';
import test from 'node:test';

import { HAIKU_SITE_EFFORT, haikuEffortEnvName, resolveHaikuEffort } from './haiku-effort';
import type { HaikuSite } from './haiku';

const SITES: HaikuSite[] = ['chat', 'screening', 'tracker', 'language', 'ranking', 'search_strategy', 'career_profile'];

// --- failure cases first ---

test('an invalid override throws and names the variable and the allowed values', () => {
  assert.throws(
    () => resolveHaikuEffort('chat', { HAIKU_EFFORT_CHAT: 'xhigh' }),
    /HAIKU_EFFORT_CHAT="xhigh" is not a valid effort.*low-nothink, low, medium, high/,
  );
});

test('an empty override is invalid, not "unset"', () => {
  assert.throws(() => resolveHaikuEffort('tracker', { HAIKU_EFFORT_TRACKER: '' }), /not a valid effort/);
});

test('a wrong-case override is invalid', () => {
  assert.throws(() => resolveHaikuEffort('ranking', { HAIKU_EFFORT_RANKING: 'LOW' }), /not a valid effort/);
});

test('a site missing from the map throws', () => {
  assert.throws(() => resolveHaikuEffort('nope' as HaikuSite, {}), /No Haiku effort configured/);
});

// --- behaviour ---

test('every site has an effort, low until the evals pick', () => {
  for (const site of SITES) {
    assert.equal(HAIKU_SITE_EFFORT[site], 'low', site);
    assert.equal(resolveHaikuEffort(site, {}), 'low', site);
  }
});

test('the override variable is HAIKU_EFFORT_ plus the upper-case site', () => {
  assert.equal(haikuEffortEnvName('chat'), 'HAIKU_EFFORT_CHAT');
  assert.equal(haikuEffortEnvName('search_strategy'), 'HAIKU_EFFORT_SEARCH_STRATEGY');
  assert.equal(haikuEffortEnvName('career_profile'), 'HAIKU_EFFORT_CAREER_PROFILE');
});

test('each valid value works as an override and only affects its own site', () => {
  for (const value of ['low-nothink', 'low', 'medium', 'high'] as const) {
    assert.equal(resolveHaikuEffort('screening', { HAIKU_EFFORT_SCREENING: value }), value);
  }
  assert.equal(resolveHaikuEffort('chat', { HAIKU_EFFORT_SCREENING: 'high' }), 'low');
});
