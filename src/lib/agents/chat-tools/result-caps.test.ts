import assert from 'node:assert/strict';
import test from 'node:test';

import { executeChatTool } from '.';
import { fitListsToBudget, MAX_TOOL_RESULT_CHARS, type ChatToolContext } from './types';
import type { TailoredCV } from '@/lib/cv-structure/types';

// A tool result rides along in every later round of the loop, so it is capped
// at 15k chars serialized. Lists shrink by whole items (never cut JSON) and
// say they're partial; an outline, which can't be cut, refuses instead.

function row(i: number) {
  return {
    application_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    company: `<<Company number ${i} with a long legal name GmbH & Co. KG>>`,
    role: `<<Senior Platform Engineer, Data Infrastructure ${i}>>`,
    status: 'applied',
    match_score: 70 + (i % 30),
    interview_at: null,
    follow_up_due_at: '2026-10-29T10:00:00.000Z',
    follow_up_overdue: false,
    follow_up_due_today: false,
    interview_upcoming: false,
  };
}

test('a result under the cap comes back unchanged', () => {
  const data = { count: 3, applications: [row(1), row(2), row(3)] };
  assert.equal(fitListsToBudget(data, ['applications']), data);
});

test('a 300-row list shrinks by whole items, newest first, and says so', () => {
  const applications = Array.from({ length: 300 }, (_, i) => row(i));
  const data = { count: applications.length, applications };
  assert.ok(JSON.stringify(data).length > MAX_TOOL_RESULT_CHARS * 5);

  const fitted = fitListsToBudget(data, ['applications']);
  const serialized = JSON.stringify(fitted);
  assert.ok(serialized.length <= MAX_TOOL_RESULT_CHARS, `${serialized.length} chars`);
  const parsed = JSON.parse(serialized) as typeof fitted;
  const shown = parsed.applications as ReturnType<typeof row>[];
  assert.ok(shown.length > 10, 'it should not over-trim');
  assert.deepEqual(shown, applications.slice(0, shown.length));
  assert.equal(parsed.count, 300);
  assert.equal(parsed.truncated, true);
  assert.deepEqual(parsed.truncated_lists, { applications: { shown: shown.length, total: 300 } });
  // As full as it can get: one more item would not fit.
  const oneMore = { ...parsed, applications: applications.slice(0, shown.length + 1), truncated_lists: { applications: { shown: shown.length + 1, total: 300 } } };
  assert.ok(JSON.stringify(oneMore).length > MAX_TOOL_RESULT_CHARS);
});

test('several lists: the longest shrinks first, short ones are left whole', () => {
  const data = {
    follow_ups_overdue: Array.from({ length: 120 }, (_, i) => row(i)),
    follow_ups_due_today: [row(500)],
    interviews_upcoming: [row(600), row(601)],
    strong_feed_matches: [],
    total_credits: 12,
  };
  const fitted = fitListsToBudget(data, ['follow_ups_overdue', 'follow_ups_due_today', 'interviews_upcoming', 'strong_feed_matches']);
  assert.ok(JSON.stringify(fitted).length <= MAX_TOOL_RESULT_CHARS);
  assert.equal((fitted.follow_ups_due_today as unknown[]).length, 1);
  assert.equal((fitted.interviews_upcoming as unknown[]).length, 2);
  assert.equal(fitted.total_credits, 12);
  assert.deepEqual(Object.keys(fitted.truncated_lists as object), ['follow_ups_overdue']);
  // Key order of the original result is kept (stable bytes for the cache).
  assert.deepEqual(Object.keys(fitted).slice(0, 5), Object.keys(data));
});

test('a named field that is not a list is a bug, not a silent pass', () => {
  assert.throws(() => fitListsToBudget({ items: 'x'.repeat(MAX_TOOL_RESULT_CHARS + 1) }, ['items']), /not a list/);
});

test('a result still over the cap with every list empty comes back over, for the backstop to refuse', () => {
  const data = { note: 'x'.repeat(MAX_TOOL_RESULT_CHARS + 10), items: [1, 2, 3] };
  const fitted = fitListsToBudget(data, ['items']);
  assert.deepEqual(fitted.items, []);
  assert.ok(JSON.stringify(fitted).length > MAX_TOOL_RESULT_CHARS);
});

function ctxWith(cv: TailoredCV): ChatToolContext {
  return {
    userId: 'user-1',
    userMessage: 'move my Bosch role to the top',
    userMessagePasted: false,
    timeZone: 'Europe/Berlin',
    sessionId: '11111111-1111-4111-8111-111111111111',
    tailoredCV: cv,
    cvOutlineRead: false,
    cvWorking: null,
    cvTemplateId: null,
  };
}

function cvWithBullets(roles: number, bulletsPerRole: number): TailoredCV {
  return {
    experience: Array.from({ length: roles }, (_, r) => ({
      title: `Senior Engineer ${r}`,
      company: `Company ${r}`,
      startDate: '2018',
      endDate: '2020',
      bullets: Array.from(
        { length: bulletsPerRole },
        (_, b) => `Built and ran the data platform piece number ${r}-${b} that served many internal teams well`,
      ),
    })),
    education: [],
    skills: [],
    languages: [],
    certifications: [],
  } as unknown as TailoredCV;
}

test('get_cv_outline refuses an outline over the cap and leaves the edit tools locked', async () => {
  const ctx = ctxWith(cvWithBullets(12, 20));
  const result = await executeChatTool('get_cv_outline', {}, ctx);
  assert.match(String((result.data as { error?: string }).error), /too many entries/);
  assert.equal(ctx.cvOutlineRead, false);
  assert.equal(result.failed, undefined);
});

test('get_cv_outline under the cap returns the whole outline and unlocks edits', async () => {
  const ctx = ctxWith(cvWithBullets(2, 3));
  const result = await executeChatTool('get_cv_outline', {}, ctx);
  assert.equal((result.data as { error?: string }).error, undefined);
  assert.ok(JSON.stringify(result.data).length <= MAX_TOOL_RESULT_CHARS);
  assert.equal(ctx.cvOutlineRead, true);
});
