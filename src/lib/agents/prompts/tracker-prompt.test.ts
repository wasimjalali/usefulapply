import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TRACKER_ANSWER_SCHEMA,
  TRACKER_INTENTS,
  TRACKER_STATUSES,
  TRACKER_SYSTEM_PROMPT,
  buildTrackerMessages,
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
