import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CV_TRUNCATED_MARKER,
  SLIM_CV_MAX_CHARS,
  SYSTEM_TEXT,
  applyCvFacts,
  buildCareerProfileCall,
  buildSynthesisUserPrompt,
  capSlimCvToChars,
  computeExperienceDurations,
  filterWorkingLanguages,
} from './career-profile-synthesis';
import { SYSTEM_TEXT as STRATEGY_SYSTEM_TEXT, buildStrategyUserPrompt } from './search-strategy';
import { buildHaikuRequest } from '@/lib/models/haiku';
import { resolveHaikuEffort } from '@/lib/models/haiku-effort';
import type { StructuredCV } from '@/lib/types/cv-schema';
import type { CareerProfile } from './career-profile';
import type { JobFeedSettings } from '@/db/types';
import { PERSONAS, buildProfile, personaCv } from '../../../evals/haiku-55-swap/fixtures/personas';

// The eval's fixture CVs, as of the eval run date. p01 has roles 2014-10 to present, p03 two short
// roles in 2024 and 2025, p08 one 4-month internship, p12 70 overlapping freelance engagements.
const EVAL_NOW = new Date('2026-10-22T09:00:00Z');
function fixture(id: string) {
  const index = PERSONAS.findIndex((p) => p.id === id);
  assert.ok(index >= 0, `fixture ${id} exists`);
  const persona = PERSONAS[index];
  const cv = personaCv(persona, index);
  return { persona, cv, durations: computeExperienceDurations(cv, EVAL_NOW) };
}

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
  const now = new Date();
  const userA = buildSynthesisUserPrompt(cvA, computeExperienceDurations(cvA, now));
  const userB = buildSynthesisUserPrompt(cvB, computeExperienceDurations(cvB, now));
  assert.notEqual(userA, userB);
  assert.ok(userA.includes('Engineer A') && !SYSTEM_TEXT.includes('Engineer A'));
  const yearMonth = now.toISOString().slice(0, 7);
  assert.ok(userA.includes(`Today (year-month): ${yearMonth}`) && !SYSTEM_TEXT.includes(yearMonth), 'the date lives in the user turn');
  assert.ok(SYSTEM_TEXT.length / 1.8 > 512, 'clears the 512 token cache minimum');

  const today = now.toISOString().slice(0, 10);

  const profile = { generatedAt: '2026-10-22T00:00:00.000Z', inferredTitles: [] } as unknown as CareerProfile;
  const settings = { target_countries: ['de'], target_roles: ['Engineer'], remote_preference: 'hybrid' } as unknown as JobFeedSettings;
  const strategyUser = buildStrategyUserPrompt(profile, settings);
  assert.ok(strategyUser.includes(today) && !STRATEGY_SYSTEM_TEXT.includes(today));
  assert.ok(STRATEGY_SYSTEM_TEXT.length / 1.8 > 512);
});

test('durations: role and total years come from the fixture CV dates, month precision', () => {
  const p01 = fixture('p01');
  assert.equal(p01.durations.today, '2026-10');
  // Tidewater 2020-04 to present is 79 months, not the "about four years" a model wrote.
  assert.equal(p01.durations.roles[0].months, 79);
  assert.equal(p01.durations.roles[0].end, 'present');
  // 2014-10 to 2026-10 is 145 months, about 12 years, not the "eight years" a model wrote.
  assert.equal(p01.durations.totalMonths, 145);

  // 2024-09 to 2025-05 plus 2025-06 to 2025-12: 16 months, which rounds to 1 year, not 2.
  assert.equal(fixture('p03').durations.totalMonths, 16);
  // One internship, 2025-05 to 2025-08 inclusive: 4 months, 0 years.
  assert.equal(fixture('p08').durations.totalMonths, 4);
  // Overlapping freelance engagements count once: summing them would claim 77 years.
  const p12 = fixture('p12');
  const summed = p12.durations.roles.reduce((sum, r) => sum + (r.months ?? 0), 0);
  assert.equal(summed, 928);
  assert.equal(p12.durations.totalMonths, 191);

  // Every fixture lands inside the eval's 3-year tolerance.
  for (const persona of PERSONAS) {
    const { durations } = fixture(persona.id);
    const years = Math.round((durations.totalMonths ?? 0) / 12);
    assert.ok(Math.abs(years - persona.profile.years) <= 3, `${persona.id}: ${years} vs ${persona.profile.years}`);
  }
});

test('durations: undated, reversed and future-ending roles', () => {
  const cv = {
    experience: [
      { company: 'A', position: 'Now', startDate: { raw: '2026-01' }, current: true, bullets: [] },
      { company: 'B', position: 'Undated', current: false, bullets: [] },
      { company: 'C', position: 'Reversed', startDate: { raw: '2020-06' }, endDate: { raw: '2019-01' }, current: false, bullets: [] },
      { company: 'D', position: 'Contract', startDate: { raw: '2026-09' }, endDate: { raw: '2027-03' }, current: false, bullets: [] },
    ],
  } as unknown as StructuredCV;
  const d = computeExperienceDurations(cv, EVAL_NOW);
  assert.deepEqual(d.roles.map((r) => r.months), [10, null, 0, 2]);
  assert.equal(d.totalMonths, 10, 'D sits inside A, cut at today');
  assert.equal(computeExperienceDurations({ experience: [] } as unknown as StructuredCV, EVAL_NOW).totalMonths, 0);
  const onlyUndated = { experience: [{ company: 'B', position: 'Undated', current: false, bullets: [] }] } as unknown as StructuredCV;
  assert.equal(computeExperienceDurations(onlyUndated, EVAL_NOW).totalMonths, null);
  assert.match(buildSynthesisUserPrompt(onlyUndated, computeExperienceDurations(onlyUndated, EVAL_NOW)), /Total experience: unknown/);
});

test('facts: yearsTotal is overwritten from the dates and caps yearsInFunction', () => {
  const p03 = fixture('p03');
  const modelSaid = { ...buildProfile(p03.persona), yearsTotal: 2, yearsInFunction: 2 };
  const fixed = applyCvFacts(modelSaid, p03.cv, p03.durations);
  assert.equal(fixed.yearsTotal, 1);
  assert.equal(fixed.yearsInFunction, 1);

  const p01 = fixture('p01');
  const p01Fixed = applyCvFacts({ ...buildProfile(p01.persona), yearsTotal: 8, yearsInFunction: 6 }, p01.cv, p01.durations);
  assert.equal(p01Fixed.yearsTotal, 12);
  assert.equal(p01Fixed.yearsInFunction, 6, 'the model picks which roles are in function');

  // No dated role: the model's figure stands (code has nothing better), still capped.
  const undated = { experience: [{ company: 'B', position: 'X', current: false, bullets: [] }] } as unknown as StructuredCV;
  const kept = applyCvFacts({ ...buildProfile(p01.persona), yearsTotal: 3, yearsInFunction: 5 }, undated, computeExperienceDurations(undated, EVAL_NOW));
  assert.equal(kept.yearsTotal, 3);
  assert.equal(kept.yearsInFunction, 3);
});

test('languages: programming languages go, listed human languages stay, in any naming', () => {
  // p08 lists English and Malayalam; a model returned programming languages.
  assert.deepEqual(filterWorkingLanguages(['English', 'Java', 'JavaScript', 'SQL'], fixture('p08').cv), ['English']);
  assert.deepEqual(filterWorkingLanguages(['English', 'Malayalam', 'Python'], fixture('p08').cv), ['English', 'Malayalam']);
  // p07 lists German, English, French; a model returned C and C++.
  assert.deepEqual(filterWorkingLanguages(['C', 'C++', 'German', 'English'], fixture('p07').cv), ['German', 'English']);
  // p02 lists "Deutsch" and "Englisch": English names still match.
  assert.deepEqual(filterWorkingLanguages(['German', 'English', 'SQL', 'Python'], fixture('p02').cv), ['German', 'English']);
  // p03 lists Twi, matched verbatim. A language the CV does not list goes.
  assert.deepEqual(filterWorkingLanguages(['English', 'Twi', 'SEO', 'Spanish'], fixture('p03').cv), ['English', 'Twi']);
  // No languages section: known language names stay, everything else goes.
  const noSection = { experience: [], languages: [] } as unknown as StructuredCV;
  assert.deepEqual(filterWorkingLanguages(['German', 'Python', 'SQL', 'Go'], noSection), ['German']);
  // The filter runs on the shipped path.
  const p08 = fixture('p08');
  const profile = applyCvFacts({ ...buildProfile(p08.persona), workingLanguages: ['English', 'SQL', 'Java', 'JavaScript'] }, p08.cv, p08.durations);
  assert.deepEqual(profile.workingLanguages, ['English']);
});

test('prompt: today and the durations are in the user turn, the rules are in the static prompt', () => {
  const p01 = fixture('p01');
  const call = buildCareerProfileCall(p01.cv, p01.durations);
  const user = call.messages[0].content as string;
  assert.ok(user.includes('Today (year-month): 2026-10'));
  assert.ok(user.includes('Total experience: 12.1 years (overlapping roles counted once)'));
  assert.ok(user.includes('- Senior Backend Engineer at Tidewater Pay GmbH, 2020-04 to present: 6.6 years'));
  assert.ok(user.indexOf('Today (year-month)') < user.indexOf('\nCV:\n'), 'the facts come before the CV');
  assert.ok(!SYSTEM_TEXT.includes('2026'), 'no date in the cached prefix');
  // The rules that answer the eval's failure groups.
  assert.match(SYSTEM_TEXT, /Do no date arithmetic of your own/);
  assert.match(SYSTEM_TEXT, /Never programming, query or markup languages/);
  assert.match(SYSTEM_TEXT, /Never state a goal, target role, location, work arrangement or other preference the CV does not state/);
  assert.match(SYSTEM_TEXT, /Numbers \(counts, amounts, percentages, team sizes, maxima, ranges\) appear exactly as the CV states them/);
  assert.match(SYSTEM_TEXT, /A tool that appears only in the skills list is a listed skill/);
  assert.ok(!/what they are looking for/.test(SYSTEM_TEXT), 'the narrative no longer asks for a goal');
  assert.ok(!/[\u2013\u2014]/.test(SYSTEM_TEXT.split('# Field guidance')[0]), 'no dashes in the rules block');
  assert.ok(!/[\u2013\u2014]/.test(SYSTEM_TEXT.split('## narrative')[1].split('##')[0]), 'no dashes in the narrative guidance');
});

test('static prefix: two users send a byte-identical cached prefix', () => {
  const a = fixture('p01');
  const b = fixture('p11');
  const context = { requestExecutionId: 'r', route: 'test', feature: 'job_feed', operation: 'career_profile_synthesis' } as const;
  const effort = resolveHaikuEffort('career_profile');
  const reqA = buildHaikuRequest({ ...buildCareerProfileCall(a.cv, a.durations), generationContext: context }, effort);
  const reqB = buildHaikuRequest({ ...buildCareerProfileCall(b.cv, b.durations), generationContext: context }, effort);
  // Everything up to and including the marked system block: model, tools, system, thinking, effort, format.
  const prefix = (r: typeof reqA) => JSON.stringify({ model: r.model, tools: r.tools, system: r.system, thinking: r.thinking, output_config: r.output_config });
  assert.equal(prefix(reqA), prefix(reqB));
  const system = reqA.system as Array<{ cache_control?: unknown }>;
  assert.equal(system.length, 1);
  assert.deepEqual(system[0].cache_control, { type: 'ephemeral' }, 'the 5m marker sits on the static system block');
  assert.notEqual(JSON.stringify(reqA.messages), JSON.stringify(reqB.messages));
  for (const text of [a.cv.personal.fullName, b.cv.personal.fullName, a.cv.experience[0].company, '2026-10']) {
    assert.ok(!JSON.stringify(reqA.system).includes(text), `per-user or per-request data in the prefix: ${text}`);
  }
});
