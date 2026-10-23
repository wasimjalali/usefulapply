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

test('refuse limit: 93,000 passes, 93,001 is over', () => {
  assert.equal(INPUT_REFUSE_ABOVE, 93_000);
  assert.equal(isOverRefuseLimit(93_000), false);
  assert.equal(isOverRefuseLimit(93_001), true);
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

test('CJK and Thai text counts about one token per character, not 1.8 characters per token', () => {
  const japaneseCv = '職務経歴書。株式会社サンプルにて営業企画を担当し、売上を前年比百二十パーセントに伸ばしました。'.repeat(40);
  const wide = [...japaneseCv].filter((ch) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch)).length;
  const old = Math.ceil(japaneseCv.length / 1.8);
  const estimate = estimateTokens(japaneseCv);
  assert.ok(estimate >= wide, `estimate ${estimate} must cover the ${wide} Han/kana characters`);
  assert.ok(estimate > old * 1.4, `estimate ${estimate} must be well above the old ${old}`);
  const thai = 'ประสบการณ์การทำงานด้านการตลาดดิจิทัล'.repeat(50);
  assert.ok(estimateTokens(thai) >= thai.length, 'Thai is one token per character or more');
  // A whole request: the Japanese messages drive the request estimate the same way.
  const messages = [{ role: 'user', content: japaneseCv }];
  assert.ok(estimateInputTokens({ messages }) >= wide);
});

test('Latin, Greek and Cyrillic text keeps the 1.8 characters per token estimate', () => {
  for (const text of ['x'.repeat(180), 'Привет мир '.repeat(30), 'Καλημέρα κόσμε '.repeat(20), 'Größe, Straße, Übung '.repeat(20), '12345 ,.;: '.repeat(30)]) {
    assert.equal(estimateTokens(text), Math.ceil(text.length / 1.8), text.slice(0, 12));
  }
});

test('a Japanese CV over the count_tokens line asks the API for the exact count', async () => {
  // 40,000 Han characters is about 40k tokens: under the old estimate (22k) it would have skipped the count and,
  // at 60k+ characters, been trusted at about 33k when the real number is above 60k.
  const messages = [{ role: 'user', content: '経'.repeat(65_000) }];
  assert.ok(estimateInputTokens({ messages }) > COUNT_TOKENS_ABOVE);
  let counted = 0;
  const check = await measureInputBudget({ messages }, async () => { counted += 1; return 66_000; });
  assert.equal(counted, 1);
  assert.equal(check.totalTokens, 66_000);
});
