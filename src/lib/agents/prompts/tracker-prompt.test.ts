import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TRACKER_ANSWER_SCHEMA,
  TRACKER_INTENTS,
  TRACKER_STATUSES,
  TRACKER_SYSTEM_PROMPT,
  TRACKER_WHICH_APPLICATION_REPLY,
  buildTrackerMessages,
  trackerOutcome,
  type TrackerModelAnswer,
} from './tracker-prompt';

// Cache layout (.claude/rules/prompt-caching.md): the system prompt never carries a date, a zone or
// a row, and the user turn puts the repeating applications before what changes every message.

const ROWS_A = 'id=1 company=<<Zapier>> role=<<Engineer>> status=applied';
const ROWS_B = 'id=2 company=<<Bosch>> role=<<Controller>> status=interview interview=2026-10-26T08:00:00.000Z';

test('tracker: the static prompt is byte-identical and holds no per-request data', () => {
  assert.ok(!TRACKER_SYSTEM_PROMPT.includes('Reasoning: low'));
  assert.doesNotMatch(TRACKER_SYSTEM_PROMPT, /\d{4}-\d{2}-\d{2}|Europe\/|UTC|Bosch/);
  assert.doesNotMatch(TRACKER_SYSTEM_PROMPT, /[—–―]/);
  assert.ok(TRACKER_SYSTEM_PROMPT.length / 3.0 > 512, 'under the 512-token cache minimum (English is about 3 chars per token)');
});

test('tracker: the applications block is identical across messages and carries the marker; today and message come after it', () => {
  const first = buildTrackerMessages({ applications: ROWS_A, today: 'Monday 26 October 2026 at 09:15 (times are Europe/Berlin)', message: 'Zapier is in interview, Tuesday 10' });
  const second = buildTrackerMessages({ applications: ROWS_A, today: 'Monday 26 October 2026 at 09:47 (times are Europe/Berlin)', message: 'Hide rejected ones' });
  const other = buildTrackerMessages({ applications: ROWS_B, today: 'x', message: 'y' });

  const blocks = (messages: typeof first) => (messages[0].content as Array<{ text: string; cache_control?: unknown }>);
  assert.deepEqual(blocks(first)[0], blocks(second)[0], 'cached block differs between two messages of one user');
  assert.deepEqual(blocks(first)[0].cache_control, { type: 'ephemeral' });
  assert.notDeepEqual(blocks(first)[0], blocks(other)[0], 'a different tracker is a different block');
  assert.equal(blocks(first)[1].cache_control, undefined, 'the changing block is after the marker and unmarked');
  assert.match(blocks(first)[1].text, /^TODAY: Monday 26 October 2026 at 09:15 \(times are Europe\/Berlin\)\n\nUSER: Zapier is in interview/);
  assert.ok(!blocks(first)[0].text.includes('TODAY'));
});

test('tracker: the answer schema is closed and matches the intent and status sets', () => {
  assert.equal(TRACKER_ANSWER_SCHEMA.additionalProperties, false);
  assert.deepEqual([...TRACKER_ANSWER_SCHEMA.required].sort(), Object.keys(TRACKER_ANSWER_SCHEMA.properties).sort());
  assert.deepEqual(TRACKER_ANSWER_SCHEMA.properties.intent.enum, [...TRACKER_INTENTS]);
  assert.deepEqual(TRACKER_ANSWER_SCHEMA.properties.status.anyOf[0], { type: 'string', enum: [...TRACKER_STATUSES] });
  for (const intent of TRACKER_INTENTS) assert.ok(TRACKER_SYSTEM_PROMPT.includes(intent), `prompt never mentions ${intent}`);
});

// ---------------------------------------------------------------------------
// What the route returns for the model's answer. A status change it can't apply never ships the model's
// "Moved X to Y": the user would read that a row moved when nothing did.
// ---------------------------------------------------------------------------

const ZAPIER = { id: '11111111-1111-4111-8111-111111111111', company: 'Zapier', job_title: 'Data Engineer' };
const BOSCH = { id: '22222222-2222-4222-8222-222222222222', company: 'Bosch', job_title: 'Systems Analyst' };
const answer = (overrides: Partial<TrackerModelAnswer>): TrackerModelAnswer => ({
  intent: 'status_change', sessionId: ZAPIER.id, status: 'interview', dateTime: null, reply: 'Moved Zapier to interview.', ...overrides,
});

test('tracker: a status change for a row that was not shown asks which application, with no action', () => {
  const out = trackerOutcome(answer({ sessionId: '33333333-3333-4333-8333-333333333333', reply: 'Moved Lumen to interview.' }), [ZAPIER, BOSCH], 'Lumen moved to interview', 'Europe/Berlin');
  assert.deepEqual(out, { reply: TRACKER_WHICH_APPLICATION_REPLY, action: { type: 'none' } });
  assert.deepEqual(trackerOutcome(answer({ sessionId: null }), [ZAPIER], 'Zapier moved', 'UTC'), { reply: TRACKER_WHICH_APPLICATION_REPLY, action: { type: 'none' } });
});

test('tracker: a status change with no status asks too, never "Moved X to Y"', () => {
  const out = trackerOutcome(answer({ status: null }), [ZAPIER], 'Zapier update', 'UTC');
  assert.deepEqual(out, { reply: TRACKER_WHICH_APPLICATION_REPLY, action: { type: 'none' } });
  assert.doesNotMatch(TRACKER_WHICH_APPLICATION_REPLY, /Moved|[—–]/);
});

test('tracker: a row the user did not name is refused; a named one moves on the user\'s wall clock', () => {
  const unnamed = trackerOutcome(answer({}), [ZAPIER, BOSCH], 'the second one moved to interview', 'Europe/Berlin');
  assert.equal(unnamed.action.type, 'none');
  assert.match(unnamed.reply, /^Which application do you mean\?/);

  const moved = trackerOutcome(answer({ dateTime: '2026-10-27T10:00' }), [ZAPIER, BOSCH], 'Zapier is in interview, Tuesday 10', 'Europe/Berlin');
  assert.deepEqual(moved, {
    reply: 'Moved Zapier to interview.',
    action: { type: 'status', sessionId: ZAPIER.id, status: 'interview', dateTime: '2026-10-27T09:00:00.000Z', company: 'Zapier' },
  });
});

test('tracker: other intents keep their actions', () => {
  assert.deepEqual(trackerOutcome(answer({ intent: 'prep', status: null, reply: 'Opening prep.' }), [ZAPIER], 'prep me for Zapier', 'UTC'), {
    reply: 'Opening prep.', action: { type: 'prep', sessionId: ZAPIER.id, company: 'Zapier' },
  });
  assert.deepEqual(trackerOutcome(answer({ intent: 'hide_rejected', sessionId: null, status: null, reply: 'Hidden.' }), [ZAPIER], 'hide rejected', 'UTC'), {
    reply: 'Hidden.', action: { type: 'hide_rejected' },
  });
  assert.deepEqual(trackerOutcome(answer({ intent: 'answer', sessionId: null, status: null, reply: 'You have one.' }), [ZAPIER], 'what is due?', 'UTC'), {
    reply: 'You have one.', action: { type: 'none' },
  });
});

test('tracker: a lone surrogate in the user message never reaches the request', () => {
  const messages = buildTrackerMessages({ applications: ROWS_A, today: 'x', message: 'Zapier \ud83d moved' });
  assert.doesNotMatch(JSON.stringify(messages), /\\ud[89a-f][0-9a-f]{2}/i);
});
