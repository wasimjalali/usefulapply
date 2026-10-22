import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COUNT_TOKENS_ABOVE,
  INPUT_HARD_LIMIT,
  INPUT_REFUSE_ABOVE,
  estimateInputTokens,
  estimateTokens,
  estimateTokensFromChars,
  isOverHardLimit,
  isOverRefuseLimit,
  measureInputBudget,
  projectNextInputTokens,
} from './token-budget';

// --- failure cases first ---

test('a count_tokens failure propagates instead of reading as "within budget"', async () => {
  const messages = [{ role: 'user', content: 'x'.repeat(130_000) }];
  await assert.rejects(
    measureInputBudget({ messages }, async () => { throw new Error('count_tokens 529'); }),
    /count_tokens 529/,
  );
});

test('an invalid count from the API is an error, not a number to trust', async () => {
  const messages = [{ role: 'user', content: 'x'.repeat(130_000) }];
  await assert.rejects(measureInputBudget({ messages }, async () => Number.NaN), /invalid count/);
  await assert.rejects(measureInputBudget({ messages }, async () => -5), /invalid count/);
});

test('invalid lengths and previous totals throw', () => {
  assert.throws(() => estimateTokensFromChars(-1), /invalid length/);
  assert.throws(() => estimateTokensFromChars(Number.NaN), /invalid length/);
  assert.throws(() => projectNextInputTokens(-1, []), /invalid previous total/);
  assert.throws(() => projectNextInputTokens(1.5, []), /invalid previous total/);
});

test('refuse limit: 90,000 passes, 90,001 is over', () => {
  assert.equal(INPUT_REFUSE_ABOVE, 90_000);
  assert.equal(isOverRefuseLimit(90_000), false);
  assert.equal(isOverRefuseLimit(90_001), true);
});

test('hard limit: 94,999 passes, 95,000 is over', () => {
  assert.equal(INPUT_HARD_LIMIT, 95_000);
  assert.equal(isOverHardLimit(94_999), false);
  assert.equal(isOverHardLimit(95_000), true);
});

// --- behaviour ---

test('the estimate is ceil(chars / 1.8)', () => {
  assert.equal(estimateTokensFromChars(0), 0);
  assert.equal(estimateTokensFromChars(18), 10);
  assert.equal(estimateTokensFromChars(19), 11);
  assert.equal(estimateTokens('x'.repeat(180)), 100);
});

test('a request estimate covers system, tools and messages', () => {
  const system = 'a'.repeat(360);
  const tools = [{ name: 't', description: 'd', input_schema: { type: 'object' } }];
  const messages = [{ role: 'user', content: 'hi' }];
  const chars = system.length + JSON.stringify(tools).length + JSON.stringify(messages).length;
  assert.equal(estimateInputTokens({ system, tools, messages }), Math.ceil(chars / 1.8));
});

test('at or under 60k estimated tokens there is no count_tokens call', async () => {
  let calls = 0;
  // JSON adds 2 quote chars plus the message wrapper, so size the content to land just under.
  const messages = [{ role: 'user', content: 'x'.repeat(100_000) }];
  const estimate = estimateInputTokens({ messages });
  assert.ok(estimate <= COUNT_TOKENS_ABOVE, `estimate ${estimate}`);
  const check = await measureInputBudget({ messages }, async () => { calls += 1; return 1; });
  assert.equal(calls, 0);
  assert.equal(check.exactTokens, null);
  assert.equal(check.totalTokens, estimate);
});

test('over 60k estimated tokens the exact count decides', async () => {
  const messages = [{ role: 'user', content: 'x'.repeat(130_000) }];
  const estimate = estimateInputTokens({ messages });
  assert.ok(estimate > COUNT_TOKENS_ABOVE, `estimate ${estimate}`);
  const check = await measureInputBudget({ messages }, async () => 41_234);
  assert.equal(check.estimatedTokens, estimate);
  assert.equal(check.exactTokens, 41_234);
  assert.equal(check.totalTokens, 41_234);
});

test('projectNextInputTokens adds the appended blocks to the previous exact total', () => {
  const appended = [{ type: 'text', text: 'x'.repeat(180) }];
  assert.equal(projectNextInputTokens(50_000, appended), 50_000 + estimateTokens(appended[0]));
  assert.equal(projectNextInputTokens(50_000, []), 50_000);
});
