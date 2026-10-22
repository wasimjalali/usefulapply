import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CV_TRUNCATED_MARKER,
  SLIM_CV_MAX_CHARS,
  SYSTEM_TEXT,
  buildSynthesisUserPrompt,
  capSlimCvToChars,
} from './career-profile-synthesis';
import { SYSTEM_TEXT as STRATEGY_SYSTEM_TEXT, buildStrategyUserPrompt } from './search-strategy';
import type { StructuredCV } from '@/lib/types/cv-schema';
import type { CareerProfile } from './career-profile';
import type { JobFeedSettings } from '@/lib/supabase/types';

function role(start: string | null, bulletCount: number, bulletChars: number) {
  return {
    startDate: start,
    bullets: Array.from({ length: bulletCount }, (_, i) => `${start ?? 'undated'}-${i}-${'b'.repeat(bulletChars)}`),
  };
}

test('profile cap: a CV under the cap is returned untouched', () => {
  const slim = { experience: [role('2020-01', 3, 100)] };
  assert.equal(capSlimCvToChars(slim, SLIM_CV_MAX_CHARS), slim);
});

test('profile cap: drops the oldest roles bullets first and marks them', () => {
  // Newest first, as a CV lists them. Each role is ~12k chars, 5 roles ~ 60k+.
  const slim = {
    experience: [role('2024-03', 40, 280), role('2021-06', 40, 280), role('2018-02', 40, 280), role('2015-09', 40, 280), role('2012-01', 40, 280)],
  };
  const before = JSON.stringify(slim, null, 2).length;
  assert.ok(before > 50_000);
  const max = before - 20_000;
  const capped = capSlimCvToChars(slim, max);
  assert.ok(JSON.stringify(capped, null, 2).length <= max);
  // Oldest role went first, newest role is untouched.
  assert.deepEqual(capped.experience[4].bullets, [CV_TRUNCATED_MARKER]);
  assert.equal(capped.experience[0].bullets.length, 40);
  // The input was not mutated.
  assert.equal(slim.experience[4].bullets.length, 40);
});

test('profile cap: stops as soon as it fits, keeping newer roles intact', () => {
  const slim = { experience: [role('2024-03', 10, 500), role('2016-01', 10, 500), role('2010-01', 10, 500)] };
  const total = JSON.stringify(slim, null, 2).length;
  const capped = capSlimCvToChars(slim, total - 3000);
  assert.deepEqual(capped.experience[2].bullets, [CV_TRUNCATED_MARKER]);
  assert.equal(capped.experience[1].bullets.length, 10);
  assert.equal(capped.experience[0].bullets.length, 10);
});

test('profile cap: undated roles go after dated ones, bottom of the list first', () => {
  const slim = { experience: [role(null, 10, 500), role('2022-01', 10, 500), role(null, 10, 500)] };
  const total = JSON.stringify(slim, null, 2).length;
  const capped = capSlimCvToChars(slim, total - 3000);
  // Dated role is dropped first, then the bottom undated one.
  assert.deepEqual(capped.experience[1].bullets, [CV_TRUNCATED_MARKER]);
  assert.equal(capped.experience[0].bullets.length, 10);
});

test('profile cap: fails loud when bullets are not the problem', () => {
  const slim = { experience: [role('2020-01', 2, 10)], skills: 'x'.repeat(5000) };
  assert.throws(() => capSlimCvToChars(slim, 1000), /too large/);
});

test('static prefix: system text carries no per-user or per-request data', () => {
  const cvA = { personal: { currentTitle: 'Engineer A' }, experience: [], education: [], skills: [], certifications: [], languages: [], projects: [], additionalSections: [] } as unknown as StructuredCV;
  const cvB = { personal: { currentTitle: 'Designer B' }, experience: [], education: [], skills: [], certifications: [], languages: [], projects: [], additionalSections: [] } as unknown as StructuredCV;
  const today = new Date().toISOString().slice(0, 10);
  const userA = buildSynthesisUserPrompt(cvA);
  const userB = buildSynthesisUserPrompt(cvB);
  assert.notEqual(userA, userB);
  assert.ok(userA.includes('Engineer A') && !SYSTEM_TEXT.includes('Engineer A'));
  assert.ok(userA.includes(today) && !SYSTEM_TEXT.includes(today), 'the date lives in the user turn');
  assert.ok(SYSTEM_TEXT.length / 1.8 > 512, 'clears the 512 token cache minimum');

  const profile = { generatedAt: '2026-10-22T00:00:00.000Z', inferredTitles: [] } as unknown as CareerProfile;
  const settings = { target_countries: ['de'], target_roles: ['Engineer'], remote_preference: 'hybrid' } as unknown as JobFeedSettings;
  const strategyUser = buildStrategyUserPrompt(profile, settings);
  assert.ok(strategyUser.includes(today) && !STRATEGY_SYSTEM_TEXT.includes(today));
  assert.ok(STRATEGY_SYSTEM_TEXT.length / 1.8 > 512);
});
