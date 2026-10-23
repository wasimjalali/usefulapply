import assert from 'node:assert/strict';
import test from 'node:test';

import { HAIKU_SITE_EFFORT, haikuEffortEnvName, resolveHaikuEffort } from './haiku-effort';
import type { HaikuSite } from './haiku';

const SITES: HaikuSite[] = ['chat', 'chat_compaction', 'screening', 'tracker', 'language', 'ranking', 'search_strategy', 'career_profile'];

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

test('every site runs the effort the 2026-10-22 eval picked, never with thinking disabled', () => {
  const picked = {
    chat: 'low',
    // Not from the eval: the chat's own effort, so the compaction request shares the chat's cache (compaction.ts).
    chat_compaction: 'low',
    screening: 'medium',
    tracker: 'medium',
    language: 'low',
    ranking: 'medium',
    search_strategy: 'low',
    career_profile: 'medium',
  } as const;
  for (const site of SITES) {
    assert.equal(HAIKU_SITE_EFFORT[site], picked[site], site);
    assert.equal(resolveHaikuEffort(site, {}), picked[site], site);
    assert.notEqual(HAIKU_SITE_EFFORT[site], 'low-nothink', site);
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

// The compaction request must read the chat's cached tools and system, so it runs the chat's own effort (and thinking),
// and it gets its own longer timeout because it writes a summary over a long history.
test('chat_compaction runs the chat effort, with its own 90 s timeout', async () => {
  const { HAIKU_SITE_TIMEOUT_MS } = await import('./haiku');
  assert.equal(HAIKU_SITE_EFFORT.chat_compaction, HAIKU_SITE_EFFORT.chat);
  assert.equal(HAIKU_SITE_TIMEOUT_MS.chat_compaction, 90_000);
});
