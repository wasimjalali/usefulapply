import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HAIKU_55_PRICING,
  haiku55CostUsd,
  haiku55PricingFor,
  normalizeProviderUsage,
  sumUsageParts,
  usageRecordsOf,
} from './anthropic';

const ZERO_SPLIT = { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 };

function iteration(type: string, input: number, output: number, read = 0, write = 0, split = ZERO_SPLIT) {
  return {
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: read,
    cache_creation_input_tokens: write,
    cache_creation: split,
    type,
  };
}

// The shape P0 measured for an on-demand compaction: top level all 0, the real counts in iterations.
const COMPACTION_USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_creation: ZERO_SPLIT,
  iterations: [iteration('compaction', 2782, 1069)],
};

// --- failure cases first ---

test('compaction usage is billed from iterations, not read as zero from the top level', () => {
  const n = normalizeProviderUsage(COMPACTION_USAGE);
  assert.equal(n.usageReported, true);
  assert.equal(n.inputTokens, 2782);
  assert.equal(n.outputTokens, 1069);
});

test('a malformed iteration leaves the counts null instead of guessing', () => {
  const n = normalizeProviderUsage({
    input_tokens: 10,
    output_tokens: 5,
    iterations: [{ type: 'message', input_tokens: 'ten' }],
  });
  assert.equal(n.usageReported, false);
  assert.equal(n.inputTokens, null);
  assert.equal(n.outputTokens, null);
});

test('cost throws on an unrecognised usage shape instead of returning $0', () => {
  assert.throws(() => haiku55CostUsd(null), /unrecognised usage shape/);
  assert.throws(() => haiku55CostUsd({ input_tokens: 10 }), /unrecognised usage shape/);
  assert.throws(() => haiku55CostUsd({ iterations: [{ type: 'message' }], input_tokens: 1, output_tokens: 1 }), /unrecognised/);
});

// --- iterations: no double count, sums across iterations ---

test('a normal response carries one message iteration equal to the top level: counted once', () => {
  const usage = {
    input_tokens: 1130,
    output_tokens: 42,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_creation: ZERO_SPLIT,
    iterations: [iteration('message', 1130, 42)],
  };
  const n = normalizeProviderUsage(usage);
  assert.equal(n.inputTokens, 1130);
  assert.equal(n.outputTokens, 42);
  const cost = haiku55CostUsd(usage);
  assert.equal(cost.totalCostUsd, (1130 * 0.1 + 42 * 0.5) / 1e6);
});

test('threshold compaction: a compaction and a message iteration are summed, cache fields too', () => {
  const usage = {
    input_tokens: 500,
    output_tokens: 80,
    cache_read_input_tokens: 4000,
    cache_creation_input_tokens: 0,
    cache_creation: ZERO_SPLIT,
    iterations: [
      iteration('compaction', 70_000, 1200, 0, 0),
      iteration('message', 500, 80, 4000, 0),
    ],
  };
  const n = normalizeProviderUsage(usage);
  assert.equal(n.inputTokens, 70_500);
  assert.equal(n.outputTokens, 1280);
  assert.equal(n.cacheReadInputTokens, 4000);
  const expected = ((70_000 * 0.1 + 1200 * 0.5) + (500 * 0.1 + 4000 * 0.01 + 80 * 0.5)) / 1e6;
  assert.ok(Math.abs(haiku55CostUsd(usage).totalCostUsd - expected) < 1e-12);
});

test('without iterations the top level is used as before (Bedrock, Sonnet, Workers AI shapes)', () => {
  const n = normalizeProviderUsage({ input_tokens: 7, output_tokens: 3, cache_read_input_tokens: 2 });
  assert.equal(n.inputTokens, 7);
  assert.equal(n.cacheReadInputTokens, 2);
  assert.equal(n.cacheWriteInputTokens, null);
  const workersAi = normalizeProviderUsage({ prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 });
  assert.equal(workersAi.inputTokens, 9);
  assert.equal(workersAi.providerTotalTokens, 13);
  const empty = normalizeProviderUsage({ input_tokens: 7, output_tokens: 3, iterations: [] });
  assert.equal(empty.inputTokens, 7);
});

test('sumUsageParts adds every field', () => {
  const parts = usageRecordsOf({ iterations: [iteration('compaction', 10, 2, 3, 4), iteration('message', 1, 1, 1, 1)] });
  assert.ok(parts);
  const total = sumUsageParts(parts);
  assert.deepEqual(
    [total.inputTokens, total.outputTokens, total.cacheReadInputTokens, total.cacheCreationInputTokens],
    [11, 3, 4, 5],
  );
});

// --- pricing ---

test('Haiku 5.5 tiers: up to and including 100k is the low tier, 100,001 the high tier', () => {
  assert.equal(haiku55PricingFor(100_000), HAIKU_55_PRICING.upTo100k);
  assert.equal(haiku55PricingFor(100_001), HAIKU_55_PRICING.over100k);
  assert.deepEqual(HAIKU_55_PRICING.upTo100k, {
    inputPerM: 0.1, outputPerM: 0.5, cacheWritePerM: 0.125, cacheWrite1hPerM: 0.2, cacheReadPerM: 0.01,
  });
  assert.equal(HAIKU_55_PRICING.over100k.inputPerM, 0.5);
  assert.equal(HAIKU_55_PRICING.over100k.outputPerM, 2.5);
  assert.equal(HAIKU_55_PRICING.over100k.cacheWritePerM, 0.625);
  assert.equal(HAIKU_55_PRICING.over100k.cacheReadPerM, 0.05);
});

test('cost prices the 5m and 1h writes separately and counts cache reads toward the tier', () => {
  const usage = {
    input_tokens: 100,
    output_tokens: 200,
    cache_read_input_tokens: 1000,
    cache_creation_input_tokens: 3000,
    cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 },
  };
  const expected = (100 * 0.1 + 1000 * 0.01 + 1000 * 0.125 + 2000 * 0.2 + 200 * 0.5) / 1e6;
  assert.ok(Math.abs(haiku55CostUsd(usage).totalCostUsd - expected) < 1e-12);
});

test('a write total with no split is priced as 5m', () => {
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 800 };
  assert.ok(Math.abs(haiku55CostUsd(usage).totalCostUsd - (800 * 0.125) / 1e6) < 1e-12);
});

test('a request over 100k prompt tokens is priced at the high tier', () => {
  const usage = { input_tokens: 40_000, output_tokens: 1000, cache_read_input_tokens: 61_000, cache_creation_input_tokens: 0 };
  const expected = (40_000 * 0.5 + 61_000 * 0.05 + 1000 * 2.5) / 1e6;
  assert.ok(Math.abs(haiku55CostUsd(usage).totalCostUsd - expected) < 1e-12);
});
