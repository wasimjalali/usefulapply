import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import type Anthropic from '@anthropic-ai/sdk';
import AnthropicSdk, { APIError } from '@anthropic-ai/sdk';
import { ModelStopError, setStreamIdleTimeoutForTests } from './anthropic';
import {
  HAIKU_SITE_TIMEOUT_MS,
  InputBudgetError,
  buildHaikuRequest,
  callHaiku,
  defaultBedrockHaikuClient,
  defaultHaikuClient,
  measureHaikuRequest,
  readHaikuContent,
  type HaikuCallOptions,
  type HaikuClient,
  type HaikuDeps,
  type HaikuMessage,
  type HaikuRequest,
} from './haiku';
import { isFailoverError, resetProviderCachesForTests } from './providers';

const CONTEXT = {
  requestExecutionId: 'req-1',
  userId: 'user-1',
  route: '/api/test',
  feature: 'test',
  operation: 'unit',
};

const ZERO_SPLIT = { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 };

function usage(input: number, output: number, read = 0, write = 0, split = ZERO_SPLIT): Anthropic.Beta.BetaUsage {
  return {
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: read,
    cache_creation_input_tokens: write,
    cache_creation: split,
    fallback_credit: null,
    inference_geo: null,
    iterations: null,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: null,
    speed: null,
  };
}

function reply(text: string, u = usage(100, 20), extra: Partial<HaikuMessage> = {}): HaikuMessage {
  return {
    id: 'msg_1',
    content: [{ type: 'text', text, citations: null } as never],
    stop_reason: 'end_turn',
    usage: u,
    _request_id: 'req_provider_1',
    ...extra,
  };
}

function options(over: Partial<HaikuCallOptions> = {}): HaikuCallOptions {
  return {
    site: 'tracker',
    system: { static: 'You are a tracker assistant.' },
    messages: [{ role: 'user', content: 'hello' }],
    maxTokens: 500,
    generationContext: CONTEXT,
    ...over,
  };
}

interface Harness {
  deps: HaikuDeps;
  sent: HaikuRequest[];
  counted: Parameters<HaikuClient['countTokens']>[0][];
  started: unknown[];
  completed: Record<string, unknown>[];
  failed: Record<string, unknown>[];
  events: Record<string, unknown>[];
}

function harness(client: Partial<HaikuClient> = {}): Harness {
  const h: Harness = { sent: [], counted: [], started: [], completed: [], failed: [], events: [], deps: null as never };
  h.deps = {
    getClient: () => ({
      createMessage: async (params) => {
        h.sent.push(params);
        return reply('ok');
      },
      countTokens: async (params) => {
        h.counted.push(params);
        return 1000;
      },
      ...client,
    }),
    startLedger: (async (params: unknown) => {
      h.started.push(params);
      return { id: 'gen-1', startedAt: '2026-10-22T00:00:00.000Z' };
    }) as HaikuDeps['startLedger'],
    completeLedger: (async (params: Record<string, unknown>) => {
      h.completed.push(params);
    }) as HaikuDeps['completeLedger'],
    failLedger: (async (params: Record<string, unknown>) => {
      h.failed.push(params);
    }) as HaikuDeps['failLedger'],
    capture: async ({ properties }) => {
      h.events.push(properties);
    },
  };
  return h;
}

// A message big enough that the local estimate (chars / 1.8) is over 60k, so count_tokens decides.
const BIG = [{ role: 'user' as const, content: 'x'.repeat(130_000) }];

// --- failure cases first ---

test('over 90,000 counted tokens: refused before sending, ledger error_kind input_budget', async () => {
  const h = harness({ countTokens: async () => 90_001 });
  await assert.rejects(
    callHaiku(options({ messages: BIG }), h.deps),
    (error: unknown) => error instanceof InputBudgetError && error.site === 'tracker' && error.projectedTokens === 90_001,
  );
  assert.equal(h.sent.length, 0);
  assert.equal(h.failed.length, 1);
  assert.equal(h.failed[0].errorKind, 'input_budget');
  assert.equal(h.completed.length, 0);
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].error_kind, 'input_budget');
  assert.equal(h.events[0].$ai_is_error, true);
  assert.equal(h.events[0].counted_input_tokens, 90_001);
});

test('exactly 90,000 counted tokens is sent', async () => {
  const h = harness({ countTokens: async () => 90_000 });
  const response = await callHaiku(options({ messages: BIG }), h.deps);
  assert.equal(h.sent.length, 1);
  assert.equal(response.content, 'ok');
  assert.equal(h.failed.length, 0);
});

test('95,000 counted tokens is refused too', async () => {
  const h = harness({ countTokens: async () => 95_000 });
  await assert.rejects(callHaiku(options({ messages: BIG }), h.deps), InputBudgetError);
  assert.equal(h.sent.length, 0);
});

test('a count_tokens failure fails the call loud and nothing is sent', async () => {
  const h = harness({ countTokens: async () => { throw new Error('count boom'); } });
  await assert.rejects(callHaiku(options({ messages: BIG }), h.deps), /count boom/);
  assert.equal(h.sent.length, 0);
  assert.equal(h.failed.length, 1);
  // The row says the count failed, not that the message was sent and failed.
  assert.equal(h.failed[0].errorKind, 'count_tokens_failed');
});

test('a small request never calls count_tokens', async () => {
  const h = harness();
  await callHaiku(options(), h.deps);
  assert.equal(h.counted.length, 0);
});

test('empty content is a loud ModelStopError, billed usage kept on the failed ledger row', async () => {
  // P0: tool_choice none on a first round ended with empty content and 1 output token.
  const h = harness({
    createMessage: async () => ({ id: 'msg_e', content: [], stop_reason: 'end_turn', usage: usage(1130, 1), _request_id: 'req_e' }),
  });
  await assert.rejects(
    callHaiku(options({ tools: [{ name: 't', description: 'd', input_schema: { type: 'object' } }], toolChoice: 'none' }), h.deps),
    (error: unknown) => error instanceof ModelStopError && error.errorKind === 'provider_empty_content',
  );
  assert.equal(h.completed.length, 0);
  assert.equal(h.failed.length, 1);
  assert.equal(h.failed[0].errorKind, 'provider_empty_content');
  assert.equal(h.failed[0].inputTokens, 1130);
  assert.equal(h.failed[0].outputTokens, 1);
  assert.equal(h.failed[0].providerRequestId, 'req_e');
  assert.equal(h.events[0].error_kind, 'provider_empty_content');
  assert.equal(h.events[0].input_tokens, 1130);
});

test('thinking-only or whitespace-only content is empty too', async () => {
  const thinkingOnly = harness({
    createMessage: async () => ({
      id: 'm', stop_reason: 'end_turn', usage: usage(10, 5),
      content: [{ type: 'thinking', thinking: '', signature: 'sig' } as never],
    }),
  });
  await assert.rejects(callHaiku(options(), thinkingOnly.deps), ModelStopError);
  const blank = harness({ createMessage: async () => reply('   \n') });
  await assert.rejects(callHaiku(options(), blank.deps), ModelStopError);
});

test('a tool_use block with no text is a valid reply', async () => {
  const h = harness({
    createMessage: async () => ({
      id: 'm', stop_reason: 'tool_use', usage: usage(50, 10),
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'lookup', input: { q: 'x' } } as never],
    }),
  });
  const response = await callHaiku(options(), h.deps);
  assert.equal(response.content, '');
  assert.deepEqual(response.toolCalls, [{ id: 'toolu_1', name: 'lookup', arguments: { q: 'x' } }]);
  assert.equal(response.stopReason, 'tool_use');
});

test('a max_tokens stop and a refusal fail loud even for Haiku', async () => {
  const truncated = harness({ createMessage: async () => reply('{"a":', usage(10, 500), { stop_reason: 'max_tokens' }) });
  await assert.rejects(
    callHaiku(options(), truncated.deps),
    (error: unknown) => error instanceof ModelStopError && error.errorKind === 'provider_max_tokens',
  );
  assert.equal(truncated.failed[0].errorKind, 'provider_max_tokens');

  const refused = harness({ createMessage: async () => reply('', usage(10, 0), { stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: null, fallback_credit_token: null, fallback_has_prefill_claim: null, recommended_model: null } }) });
  await assert.rejects(
    callHaiku(options(), refused.deps),
    (error: unknown) => error instanceof ModelStopError && error.errorKind === 'provider_refusal',
  );
});

test('a provider HTTP error is recorded with its status and rethrown unchanged', async () => {
  const providerError = Object.assign(new Error('overloaded'), { status: 529 });
  const h = harness({ createMessage: async () => { throw providerError; } });
  await assert.rejects(callHaiku(options(), h.deps), (error: unknown) => error === providerError);
  assert.equal(h.failed[0].httpStatus, 529);
  // A failover-class error names its kind in the ledger instead of the generic provider_error.
  assert.equal(h.failed[0].errorKind, 'overloaded');
});

test('a missing ANTHROPIC_API_KEY throws at call time and is recorded on the ledger', async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    assert.throws(() => defaultHaikuClient(), /ANTHROPIC_API_KEY is not set/);
    const h = harness();
    h.deps.getClient = defaultHaikuClient;
    await assert.rejects(callHaiku(options(), h.deps), /ANTHROPIC_API_KEY is not set/);
    assert.equal(h.failed.length, 1);
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});

test('an invalid HAIKU_EFFORT override fails before anything is sent or recorded', async () => {
  process.env.HAIKU_EFFORT_TRACKER = 'ultra';
  try {
    const h = harness();
    await assert.rejects(callHaiku(options(), h.deps), /HAIKU_EFFORT_TRACKER/);
    assert.equal(h.sent.length, 0);
    assert.equal(h.started.length, 0);
  } finally {
    delete process.env.HAIKU_EFFORT_TRACKER;
  }
});

test('options that cannot make a valid request throw', () => {
  assert.throws(() => buildHaikuRequest(options({ system: { static: '  ' } }), 'low'), /system.static is empty/);
  assert.throws(() => buildHaikuRequest(options({ messages: [] }), 'low'), /messages is empty/);
  assert.throws(() => buildHaikuRequest(options({ maxTokens: 0 }), 'low'), /maxTokens/);
  assert.throws(() => buildHaikuRequest(options({ maxTokens: 1.5 }), 'low'), /maxTokens/);
  assert.throws(() => buildHaikuRequest(options({ toolChoice: 'none' }), 'low'), /needs tools/);
});

// --- request shape ---

const TOOL_A = { name: 'a_tool', description: 'first', input_schema: { type: 'object', properties: { z: { type: 'string' }, a: { type: 'number' } }, required: ['z'] } };
const TOOL_B = { name: 'b_tool', description: 'second', input_schema: { type: 'object', properties: { q: { type: 'string' } } } };

interface Marker { where: string; ttl: '5m' | '1h' }

/** Cache markers in the order the API reads the prefix: tools, system, then messages, then top level. */
function markers(params: HaikuRequest): Marker[] {
  const out: Marker[] = [];
  const ttlOf = (cc: unknown) => ((cc as { ttl?: string }).ttl === '1h' ? '1h' : '5m') as '5m' | '1h';
  params.tools?.forEach((t) => {
    if ('cache_control' in t && t.cache_control) out.push({ where: `tool:${'name' in t ? t.name : '?'}`, ttl: ttlOf(t.cache_control) });
  });
  (params.system as Anthropic.Beta.BetaTextBlockParam[]).forEach((b, i) => {
    if (b.cache_control) out.push({ where: `system:${i}`, ttl: ttlOf(b.cache_control) });
  });
  if (params.cache_control) out.push({ where: 'conversation', ttl: ttlOf(params.cache_control) });
  return out;
}

function assertTtlOrder(list: Marker[]) {
  const firstFiveMinute = list.findIndex((m) => m.ttl === '5m');
  if (firstFiveMinute === -1) return;
  assert.ok(list.slice(firstFiveMinute).every((m) => m.ttl === '5m'), `a 1h marker follows a 5m marker: ${JSON.stringify(list)}`);
}

test('cache markers: static and stableContext blocks carry the site TTL; tools get none (system covers them)', () => {
  const params = buildHaikuRequest(options({
    tools: [TOOL_A, TOOL_B],
    system: { static: 'static rules', stableContext: 'the CV' },
    cacheTtl: '1h',
  }), 'low');
  assert.deepEqual(markers(params), [
    { where: 'system:0', ttl: '1h' },
    { where: 'system:1', ttl: '1h' },
  ]);
  const tools = params.tools as Array<{ cache_control?: unknown }>;
  assert.ok(tools.every((t) => t.cache_control === undefined));
});

test('cacheTtl 5m (the default) sends the marker without a ttl', () => {
  const params = buildHaikuRequest(options({ tools: [TOOL_A] }), 'low');
  assert.deepEqual((params.system as Array<{ cache_control: unknown }>)[0].cache_control, { type: 'ephemeral' });
  assert.equal((params.tools as Array<{ cache_control?: unknown }>)[0].cache_control, undefined);
});

test('cacheConversation adds an automatic 5m marker after the 1h markers; at most 4 markers', () => {
  const params = buildHaikuRequest(options({
    tools: [TOOL_A, TOOL_B],
    system: { static: 'static rules', stableContext: 'the CV' },
    cacheTtl: '1h',
    cacheConversation: true,
  }), 'low');
  const list = markers(params);
  assert.deepEqual(list.map((m) => m.where), ['system:0', 'system:1', 'conversation']);
  assert.deepEqual(list.map((m) => m.ttl), ['1h', '1h', '5m']);
  assertTtlOrder(list);
  assert.ok(list.length <= 4);
  assert.deepEqual(params.cache_control, { type: 'ephemeral' });
});

test('no stableContext and no tools: one marker on the static block, none on the conversation', () => {
  const params = buildHaikuRequest(options(), 'low');
  assert.deepEqual(markers(params).map((m) => m.where), ['system:0']);
  assert.equal(params.tools, undefined);
  assert.equal(params.cache_control, undefined);
  assert.equal((params.system as unknown[]).length, 1);
});

test('an empty stableContext adds no block', () => {
  const params = buildHaikuRequest(options({ system: { static: 's', stableContext: '' } }), 'low');
  assert.equal((params.system as unknown[]).length, 1);
});

test('the cached prefix (tools + system) is byte-identical across two different requests', () => {
  const a = buildHaikuRequest(options({
    tools: [TOOL_A, TOOL_B], system: { static: 'static rules', stableContext: 'the CV' },
    messages: [{ role: 'user', content: 'first question' }], cacheTtl: '1h', cacheConversation: true,
  }), 'low');
  // Same tools with their schema keys written in another order, and a different conversation.
  const reordered = {
    name: TOOL_A.name,
    description: TOOL_A.description,
    input_schema: { required: ['z'], properties: { z: { type: 'string' }, a: { type: 'number' } }, type: 'object' },
  };
  const b = buildHaikuRequest(options({
    tools: [reordered, TOOL_B], system: { static: 'static rules', stableContext: 'the CV' },
    messages: [{ role: 'user', content: 'a very different, much longer question' }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'and more' }],
    cacheTtl: '1h', cacheConversation: true,
  }), 'low');
  assert.equal(JSON.stringify([a.tools, a.system]), JSON.stringify([b.tools, b.system]));
});

test('schema keys are sorted but property order is kept', () => {
  const params = buildHaikuRequest(options({ tools: [TOOL_A] }), 'low');
  const schema = (params.tools as Array<{ input_schema: Record<string, unknown> }>)[0].input_schema;
  assert.deepEqual(Object.keys(schema), ['properties', 'required', 'type']);
  assert.deepEqual(Object.keys(schema.properties as object), ['z', 'a']);
});

test('request shape: no temperature, adaptive thinking omitted, effort in output_config', () => {
  for (const effort of ['low', 'medium', 'high'] as const) {
    const params = buildHaikuRequest(options(), effort);
    assert.equal(params.model, 'claude-haiku-5-5');
    assert.ok(!('temperature' in params) && !('top_p' in params) && !('top_k' in params));
    assert.equal(params.thinking, undefined);
    assert.deepEqual(params.output_config, { effort });
    assert.equal(params.max_tokens, 500);
  }
});

test('low-nothink is effort low with thinking disabled', () => {
  const params = buildHaikuRequest(options(), 'low-nothink');
  assert.deepEqual(params.thinking, { type: 'disabled' });
  assert.deepEqual(params.output_config, { effort: 'low' });
});

test('jsonSchema goes to output_config.format; toolChoice none is sent, auto is omitted', () => {
  const params = buildHaikuRequest(options({
    jsonSchema: { type: 'object', properties: { b: { type: 'string' }, a: { type: 'string' } } },
    tools: [TOOL_A], toolChoice: 'none',
  }), 'medium');
  assert.deepEqual(params.output_config, {
    effort: 'medium',
    format: { type: 'json_schema', schema: { properties: { b: { type: 'string' }, a: { type: 'string' } }, type: 'object' } },
  });
  assert.deepEqual(params.tool_choice, { type: 'none' });
  assert.equal(buildHaikuRequest(options({ tools: [TOOL_A], toolChoice: 'auto' }), 'low').tool_choice, undefined);
});

// --- success path: ledger, PostHog, cost ---

test('a call records the ledger and one $ai_generation event with the per-site cache fields', async () => {
  const split = { ephemeral_5m_input_tokens: 300, ephemeral_1h_input_tokens: 700 };
  const h = harness({ createMessage: async (params) => { h.sent.push(params); return reply('answer', usage(40, 60, 2000, 1000, split)); } });
  const response = await callHaiku(options({ site: 'chat', cacheTtl: '1h' }), h.deps);

  assert.equal(response.content, 'answer');
  assert.equal(response.model, 'claude-haiku-5-5');
  assert.equal(response.provider, 'anthropic');
  assert.equal(response.generationId, 'gen-1');
  assert.equal(response.effort, 'low');
  assert.equal(response.inputTokensTotal, 40 + 2000 + 1000);
  assert.deepEqual(response.usage, {
    inputTokens: 40, outputTokens: 60, cacheCreationInputTokens: 1000, cacheReadInputTokens: 2000,
    cacheCreation5mInputTokens: 300, cacheCreation1hInputTokens: 700,
  });
  const expectedCost = (40 * 0.1 + 2000 * 0.01 + 300 * 0.125 + 700 * 0.2 + 60 * 0.5) / 1e6;
  assert.ok(Math.abs(response.costUsd - expectedCost) < 1e-12);

  assert.deepEqual(h.started, [{ context: CONTEXT, provider: 'anthropic', model: 'claude-haiku-5-5' }]);
  assert.equal(h.completed.length, 1);
  assert.equal(h.completed[0].id, 'gen-1');
  assert.equal(h.failed.length, 0);

  assert.equal(h.events.length, 1);
  const e = h.events[0];
  assert.equal(e.$ai_provider, 'anthropic');
  assert.equal(e.$ai_model, 'claude-haiku-5-5');
  assert.equal(e.site, 'chat');
  assert.equal(e.model, 'claude-haiku-5-5');
  assert.equal(e.effort, 'low');
  assert.equal(e.input_tokens, 40);
  assert.equal(e.output_tokens, 60);
  assert.equal(e.cache_read_tokens, 2000);
  assert.equal(e.cache_creation_tokens, 1000);
  assert.equal(e.cache_creation_5m_tokens, 300);
  assert.equal(e.cache_creation_1h_tokens, 700);
  assert.equal(e.input_tokens_total, 3040);
  assert.ok(Math.abs((e.cache_hit_rate as number) - 2000 / 3040) < 1e-12);
  assert.ok(Math.abs((e.cost_usd as number) - expectedCost) < 1e-12);
  assert.equal(e.$ai_is_error, false);
  assert.equal(e.over_hard_budget, false);
  // Not streamed: no byte gap to report, and the output count is the response's own.
  assert.equal(e.stream_max_gap_ms, null);
  assert.equal(e.output_tokens_partial, false);
  // counts and labels only: nothing from the prompt or the answer
  assert.ok(!JSON.stringify(e).includes('answer'));
  assert.ok(!JSON.stringify(e).includes('hello'));
});

test('compaction-style usage (iterations) is summed in tokens, cost and the event', async () => {
  const iteration = (u: Anthropic.Beta.BetaUsage) => ({
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    cache_creation: u.cache_creation,
  });
  const u: Anthropic.Beta.BetaUsage = {
    ...usage(0, 0),
    iterations: [
      { type: 'compaction', ...iteration(usage(2782, 1069)) },
      { type: 'message', model: null, ...iteration(usage(500, 80, 1000, 0)) },
    ],
  };
  const h = harness({ createMessage: async () => reply('summarised answer', u) });
  const response = await callHaiku(options(), h.deps);
  assert.equal(response.usage.inputTokens, 3282);
  assert.equal(response.usage.outputTokens, 1149);
  assert.equal(response.inputTokensTotal, 3282 + 1000);
  const expected = ((2782 * 0.1 + 1069 * 0.5) + (500 * 0.1 + 1000 * 0.01 + 80 * 0.5)) / 1e6;
  assert.ok(Math.abs(response.costUsd - expected) < 1e-12);
});

test('rawContent is the response content, unaltered (thinking blocks included)', async () => {
  const content = [
    { type: 'thinking', thinking: '', signature: 'sig-abc' },
    { type: 'text', text: 'hi', citations: null },
  ] as never[];
  const h = harness({ createMessage: async () => ({ id: 'm', content, stop_reason: 'end_turn', usage: usage(10, 5) }) });
  const response = await callHaiku(options(), h.deps);
  assert.equal(response.rawContent, content);
  assert.equal(response.content, 'hi');
});

test('an anonymous call keeps the event off a shared person profile', async () => {
  const captured: Array<{ distinctId: string; properties: Record<string, unknown> }> = [];
  const h = harness();
  h.deps.capture = async (event) => { captured.push(event); };
  await callHaiku(options({ generationContext: { ...CONTEXT, userId: null } }), h.deps);
  assert.equal(captured[0].distinctId, 'unattributed');
  assert.equal(captured[0].properties.$process_person_profile, false);
});

test('a PostHog failure is logged and does not fail the call', async () => {
  const h = harness();
  h.deps.capture = async () => { throw new Error('posthog down'); };
  const original = console.error;
  console.error = () => {};
  try {
    const response = await callHaiku(options(), h.deps);
    assert.equal(response.content, 'ok');
  } finally {
    console.error = original;
  }
});

test('more than 4 cache markers (system blocks + conversation + message markers) throws before sending', () => {
  const marked = { type: 'text' as const, text: 'turn', cache_control: { type: 'ephemeral' as const } };
  assert.throws(
    () => buildHaikuRequest(options({
      system: { static: 'static rules', stableContext: 'the CV' },
      messages: [{ role: 'user', content: [marked] }, { role: 'assistant', content: 'ok' }, { role: 'user', content: [marked] }],
      cacheConversation: true,
    }), 'low'),
    /5 cache markers/,
  );
});

// --- failover to Amazon Bedrock ---

const overloaded = () => APIError.generate(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 'Overloaded', new Headers());
const badRequest = () => APIError.generate(400, { type: 'error', error: { type: 'invalid_request_error', message: 'bad' } }, 'bad', new Headers());

interface FailoverHarness extends Harness {
  bedrockSent: HaikuRequest[];
  bedrockCounted: Parameters<HaikuClient['countTokens']>[0][];
  captured: Array<{ distinctId: string; event?: string; properties: Record<string, unknown> }>;
  started: Array<{ provider: string; model: string }>;
}

function failoverHarness(primary: Partial<HaikuClient>, bedrock: Partial<HaikuClient> | null = {}): FailoverHarness {
  const h = harness(primary) as FailoverHarness;
  h.bedrockSent = [];
  h.bedrockCounted = [];
  h.captured = [];
  let n = 0;
  h.deps.startLedger = (async (params: { provider: string; model: string }) => {
    h.started.push(params);
    n += 1;
    return { id: `gen-${n}`, startedAt: '2026-10-22T00:00:00.000Z' };
  }) as HaikuDeps['startLedger'];
  h.deps.capture = async (event) => {
    h.captured.push(event);
    if (event.event === undefined) h.events.push(event.properties);
  };
  h.deps.getBedrockClient = () => (bedrock === null ? null : {
    createMessage: async (params) => { h.bedrockSent.push(params); return reply('from bedrock'); },
    countTokens: async (params) => { h.bedrockCounted.push(params); return 1000; },
    ...bedrock,
  });
  return h;
}

async function quiet<T>(run: () => Promise<T>): Promise<T> {
  const warn = console.warn;
  const error = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

test('a 400 from the primary never reaches Bedrock', async () => {
  const error = badRequest();
  const h = failoverHarness({ createMessage: async () => { throw error; } });
  await quiet(() => assert.rejects(callHaiku(options(), h.deps), (thrown: unknown) => thrown === error));
  assert.equal(h.bedrockSent.length, 0);
  assert.equal(h.failed.length, 1);
  assert.equal(h.captured.filter((e) => e.event === 'llm_provider_failover').length, 0);
});

test('a refusal on the primary never reaches Bedrock', async () => {
  const h = failoverHarness({ createMessage: async () => reply('', usage(10, 0), { stop_reason: 'refusal' }) });
  await quiet(() => assert.rejects(callHaiku(options(), h.deps), ModelStopError));
  assert.equal(h.bedrockSent.length, 0);
});

test('a 529 with Bedrock not configured keeps the failure path: one failed row, the original error', async () => {
  const error = overloaded();
  const h = failoverHarness({ createMessage: async () => { throw error; } }, null);
  await quiet(() => assert.rejects(callHaiku(options(), h.deps), (thrown: unknown) => thrown === error));
  assert.equal(h.started.length, 1);
  assert.equal(h.failed.length, 1);
  assert.equal(h.failed[0].httpStatus, 529);
});

test('a 529 fails over: failed anthropic row, bedrock row, two $ai_generation events and a failover event', async () => {
  const h = failoverHarness({ createMessage: async () => { throw overloaded(); } });
  const response = await quiet(() => callHaiku(options({ site: 'chat', cacheTtl: '1h' }), h.deps));

  assert.equal(response.content, 'from bedrock');
  assert.equal(response.provider, 'bedrock');
  assert.equal(response.model, 'anthropic.claude-haiku-5-5');
  assert.equal(response.generationId, 'gen-2');

  assert.deepEqual(h.started, [
    { context: CONTEXT, provider: 'anthropic', model: 'claude-haiku-5-5' },
    { context: CONTEXT, provider: 'bedrock', model: 'anthropic.claude-haiku-5-5' },
  ]);
  assert.equal(h.failed.length, 1);
  assert.equal(h.failed[0].id, 'gen-1');
  assert.equal(h.failed[0].httpStatus, 529);
  assert.equal(h.completed.length, 1);
  assert.equal(h.completed[0].id, 'gen-2');

  const generations = h.captured.filter((e) => e.event === undefined).map((e) => e.properties);
  assert.deepEqual(generations.map((e) => [e.$ai_provider, e.$ai_model, e.$ai_is_error]), [
    ['anthropic', 'claude-haiku-5-5', true],
    ['bedrock', 'anthropic.claude-haiku-5-5', false],
  ]);
  const failover = h.captured.filter((e) => e.event === 'llm_provider_failover');
  assert.equal(failover.length, 1);
  assert.equal(failover[0].distinctId, 'user-1');
  assert.deepEqual(
    { site: failover[0].properties.site, model: failover[0].properties.model, kind: failover[0].properties.primary_error_kind, status: failover[0].properties.primary_http_status },
    { site: 'chat', model: 'claude-haiku-5-5', kind: 'overloaded', status: 529 },
  );
});

test('Bedrock gets the same request: only the model id differs, cache markers byte-identical', async () => {
  const primarySent: HaikuRequest[] = [];
  const h = failoverHarness({ createMessage: async (params) => { primarySent.push(params); throw overloaded(); } });
  await quiet(() => callHaiku(options({
    tools: [TOOL_A, TOOL_B],
    system: { static: 'static rules', stableContext: 'the CV' },
    cacheTtl: '1h',
    cacheConversation: true,
    jsonSchema: { type: 'object', properties: { a: { type: 'string' } } },
  }), h.deps));
  assert.equal(h.bedrockSent.length, 1);
  assert.equal(h.bedrockSent[0].model, 'anthropic.claude-haiku-5-5');
  assert.equal(JSON.stringify({ ...h.bedrockSent[0], model: '' }), JSON.stringify({ ...primarySent[0], model: '' }));
});

test('failover is per call: the next call goes to the primary again', async () => {
  let calls = 0;
  const h = failoverHarness({
    createMessage: async () => {
      calls += 1;
      if (calls === 1) throw overloaded();
      return reply('primary again');
    },
  });
  assert.equal((await quiet(() => callHaiku(options(), h.deps))).provider, 'bedrock');
  const second = await callHaiku(options(), h.deps);
  assert.equal(second.provider, 'anthropic');
  assert.equal(second.content, 'primary again');
});

test('when Bedrock fails too, its error is thrown after one attempt on each, two failed rows', async () => {
  const bedrockError = APIError.generate(503, undefined, 'unavailable', new Headers());
  const h = failoverHarness(
    { createMessage: async () => { throw overloaded(); } },
    { createMessage: async () => { throw bedrockError; } },
  );
  await quiet(() => assert.rejects(callHaiku(options(), h.deps), (thrown: unknown) => thrown === bedrockError));
  assert.equal(h.failed.length, 2);
  assert.deepEqual(h.failed.map((f) => f.httpStatus), [529, 503]);
});

test('pinned to Bedrock: no primary attempt, no count on the primary, and a Bedrock failure is a failure', async () => {
  const primaryCalls: string[] = [];
  const h = failoverHarness({
    createMessage: async () => { primaryCalls.push('create'); return reply('primary'); },
    countTokens: async () => { primaryCalls.push('count'); return 1000; },
  });
  const response = await callHaiku(options({ messages: BIG, provider: 'bedrock' }), h.deps);
  assert.equal(response.provider, 'bedrock');
  assert.deepEqual(primaryCalls, []);
  assert.equal(h.bedrockCounted.length, 1);
  assert.deepEqual(h.started.map((s) => s.provider), ['bedrock']);

  const down = failoverHarness({}, { createMessage: async () => { throw overloaded(); } });
  await quiet(() => assert.rejects(callHaiku(options({ provider: 'bedrock' }), down.deps)));
  assert.deepEqual(down.started.map((s) => s.provider), ['bedrock']);
  assert.equal(down.failed.length, 1);
  assert.equal(down.sent.length, 0);
});

test('HaikuResponse.provider says who answered, so a loop can pin the rest of its request', async () => {
  const h = failoverHarness({ createMessage: async () => { throw overloaded(); } });
  assert.equal((await quiet(() => callHaiku(options(), h.deps))).provider, 'bedrock');
  assert.equal((await callHaiku(options(), harness().deps)).provider, 'anthropic');
});

test('count_tokens fails over: a 503 on the primary count is counted on Bedrock, then the message goes to Bedrock too', async () => {
  const h = failoverHarness({ countTokens: async () => { throw APIError.generate(503, undefined, 'down', new Headers()); } });
  const response = await quiet(() => callHaiku(options({ messages: BIG }), h.deps));
  assert.equal(h.bedrockCounted.length, 1);
  assert.equal(h.bedrockCounted[0].model, 'anthropic.claude-haiku-5-5');
  assert.equal(h.sent.length, 0);
  assert.equal(h.bedrockSent.length, 1);
  assert.equal(response.provider, 'bedrock');
});

test('count_tokens failing on Bedrock too fails the guard loud: nothing is sent, no second failover for the message', async () => {
  const countError = APIError.generate(503, undefined, 'bedrock count down', new Headers());
  const h = failoverHarness(
    { countTokens: async () => { throw APIError.generate(529, undefined, 'overloaded', new Headers()); } },
    { countTokens: async () => { throw countError; } },
  );
  await quiet(() => assert.rejects(callHaiku(options({ messages: BIG }), h.deps), (thrown: unknown) => thrown === countError));
  assert.equal(h.sent.length, 0);
  assert.equal(h.bedrockSent.length, 0);
  assert.equal(h.failed.length, 1);
});

test('measureHaikuRequest counts on Bedrock when the primary count fails over, and fails loud when both fail', async () => {
  const h = failoverHarness({ countTokens: async () => { throw overloaded(); } });
  const check = await quiet(() => measureHaikuRequest(options({ messages: BIG }), h.deps));
  assert.equal(check.exactTokens, 1000);
  const both = failoverHarness({ countTokens: async () => { throw overloaded(); } }, { countTokens: async () => { throw new Error('bedrock count boom'); } });
  await quiet(() => assert.rejects(measureHaikuRequest(options({ messages: BIG }), both.deps), /bedrock count boom/));
});

test('without Bedrock credentials the default deps have no Bedrock client', () => {
  const saved = ['AWS_BEARER_TOKEN_BEDROCK', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'].map((key) => [key, process.env[key]] as const);
  for (const [key] of saved) delete process.env[key];
  resetProviderCachesForTests();
  const log = console.log;
  console.log = () => {};
  try {
    assert.equal(defaultBedrockHaikuClient(), null);
  } finally {
    console.log = log;
    for (const [key, value] of saved) if (value !== undefined) process.env[key] = value;
    resetProviderCachesForTests();
  }
});

// --- the real SDK clients, over HTTP, against a local server ---

interface Seen { path: string; auth: string | undefined; body: Record<string, unknown> }

async function withLocalApi(run: (url: string, seen: Seen[]) => Promise<void>): Promise<void> {
  const seen: Seen[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
      seen.push({ path: request.url ?? '', auth: request.headers.authorization, body });
      if ((request.url ?? '').includes('count_tokens')) {
        response.writeHead(200, { 'content-type': 'application/json', 'request-id': 'req_count' });
        response.end(JSON.stringify({ input_tokens: 4321 }));
        return;
      }
      const message = {
        id: 'msg_local', type: 'message', role: 'assistant', model: String(body.model), stop_sequence: null, stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'hello from the local api', citations: null }],
        usage: { input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 } },
      };
      if (body.stream === true) {
        response.writeHead(200, { 'content-type': 'text/event-stream', 'request-id': 'req_stream' });
        const send = (event: string, data: unknown) => response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        send('message_start', { type: 'message_start', message: { ...message, content: [] } });
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '', citations: null } });
        send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hello from the local api' } });
        send('content_block_stop', { type: 'content_block_stop', index: 0 });
        send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 7 } });
        send('message_stop', { type: 'message_stop' });
        response.end();
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json', 'request-id': 'req_msg' });
      response.end(JSON.stringify(message));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await run(url, seen);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function withClientEnv(values: Record<string, string>, run: () => Promise<void>): Promise<void> {
  const keys = ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'AWS_BEARER_TOKEN_BEDROCK', 'ANTHROPIC_BEDROCK_MANTLE_BASE_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
  const saved = keys.map((key) => [key, process.env[key]] as const);
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, values);
  resetProviderCachesForTests();
  const log = console.log;
  console.log = () => {};
  try {
    await run();
  } finally {
    console.log = log;
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetProviderCachesForTests();
  }
}

test('the real Anthropic client: Bearer auth, beta path, request id, streamed above 16k max_tokens, count_tokens', async () => {
  await withLocalApi(async (url, seen) => {
    await withClientEnv({ ANTHROPIC_API_KEY: 'sk-local', ANTHROPIC_BASE_URL: url }, async () => {
      const client = defaultHaikuClient();
      const request = buildHaikuRequest(options(), 'low');
      const message = await client.createMessage(request);
      assert.equal(message._request_id, 'req_msg');
      assert.equal(message.content[0].type, 'text');
      assert.equal(seen[0].auth, 'Bearer sk-local');
      assert.match(seen[0].path, /^\/v1\/messages\?beta=true/);
      assert.equal(seen[0].body.model, 'claude-haiku-5-5');
      assert.deepEqual(seen[0].body.output_config, { effort: 'low' });

      const streamed = await client.createMessage({ ...request, max_tokens: 20_000 });
      assert.equal(streamed._request_id, 'req_stream');
      assert.equal(seen[1].body.stream, true);

      assert.equal(await client.countTokens({ model: 'claude-haiku-5-5', system: request.system, messages: request.messages }), 4321);
      assert.match(seen[2].path, /count_tokens/);
    });
  });
});

test('the real Bedrock client: Bearer token, its own base URL, the anthropic. model id, same body', async () => {
  await withLocalApi(async (url, seen) => {
    await withClientEnv({ ANTHROPIC_API_KEY: 'sk-local', AWS_BEARER_TOKEN_BEDROCK: 'bedrock-token', ANTHROPIC_BEDROCK_MANTLE_BASE_URL: `${url}/bedrock` }, async () => {
      const client = defaultBedrockHaikuClient();
      assert.ok(client);
      const request = { ...buildHaikuRequest(options({ tools: [TOOL_A], cacheTtl: '1h' }), 'low'), model: 'anthropic.claude-haiku-5-5' };
      const message = await client.createMessage(request);
      assert.equal(message._request_id, 'req_msg');
      assert.equal(seen[0].auth, 'Bearer bedrock-token');
      assert.match(seen[0].path, /^\/bedrock\/v1\/messages/);
      assert.equal(seen[0].body.model, 'anthropic.claude-haiku-5-5');
      assert.equal(JSON.stringify(seen[0].body.system), JSON.stringify(request.system));
      assert.equal(JSON.stringify(seen[0].body.tools), JSON.stringify(request.tools));

      assert.equal(await client.countTokens({ model: request.model, system: request.system, messages: request.messages }), 4321);
      assert.match(seen[1].path, /^\/bedrock\/v1\/messages\/count_tokens/);
    });
  });
});

// --- timeouts: a hung primary must fail over in seconds, not after the SDK's 10 minutes ---

test('every message call carries its site timeout, and count_tokens never borrows it', async () => {
  const seen: Array<{ site: string; timeout: number | undefined }> = [];
  for (const site of ['chat', 'ranking'] as const) {
    const h = harness({
      createMessage: async (_params, requestOptions) => {
        seen.push({ site, timeout: requestOptions?.timeout });
        return reply('ok');
      },
    });
    await callHaiku(options({ site }), h.deps);
  }
  assert.deepEqual(seen, [
    { site: 'chat', timeout: HAIKU_SITE_TIMEOUT_MS.chat },
    { site: 'ranking', timeout: HAIKU_SITE_TIMEOUT_MS.ranking },
  ]);
  assert.ok(HAIKU_SITE_TIMEOUT_MS.chat < HAIKU_SITE_TIMEOUT_MS.ranking);
});

test('the real SDK turns a hung response into a timeout that fails over', async () => {
  const server = createServer(() => {
    // Accept the request and never answer.
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const client = new AnthropicSdk({ apiKey: 'test', baseURL: `http://127.0.0.1:${port}`, maxRetries: 0 });
    const error = await client.messages
      .create({ model: 'claude-haiku-5-5', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }, { timeout: 200 })
      .then(() => null, (caught: unknown) => caught);
    assert.ok(error, 'the hung call resolved');
    assert.equal(isFailoverError(error), true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});


// --- review round: stop reasons, timeouts, count_tokens failover, TTL order, streams that break ---

test('a missing or unhandled stop reason is provider_incomplete, with the billed usage kept', () => {
  for (const stopReason of [null, 'pause_turn', 'model_context_window_exceeded'] as const) {
    assert.throws(
      () => readHaikuContent({ id: 'm', content: [{ type: 'text', text: 'partial', citations: null } as never], stop_reason: stopReason as never, usage: usage(10, 5) }, 500),
      (error: unknown) => error instanceof ModelStopError && error.errorKind === 'provider_incomplete' && error.billed.usage !== null,
      String(stopReason),
    );
  }
  for (const stopReason of ['end_turn', 'tool_use', 'stop_sequence'] as const) {
    assert.doesNotThrow(() => readHaikuContent({
      id: 'm',
      content: [{ type: 'text', text: 'x', citations: null } as never],
      stop_reason: stopReason,
      usage: usage(10, 5),
    }, 500), stopReason);
  }
});

test('screening gets 90 s: 8000 tokens at about 170 tokens/s with thinking runs past 45 s', () => {
  assert.equal(HAIKU_SITE_TIMEOUT_MS.screening, 90_000);
  assert.ok(HAIKU_SITE_TIMEOUT_MS.screening > 8000 / 170 * 1000);
});

test('a 1h cache marker after a 5m one throws before sending, like the Sonnet builder', () => {
  const fiveThenOne = [{ role: 'user' as const, content: [
    { type: 'text' as const, text: 'a', cache_control: { type: 'ephemeral' as const } },
    { type: 'text' as const, text: 'b', cache_control: { type: 'ephemeral' as const, ttl: '1h' as const } },
  ] }];
  assert.throws(() => buildHaikuRequest(options({ messages: fiveThenOne }), 'low'), /1h cache marker after a 5m one/);
  // cacheTtl 5m on the system blocks, then a 1h marker in the messages, is the same mistake.
  const oneInMessages = [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'a', cache_control: { type: 'ephemeral' as const, ttl: '1h' as const } }] }];
  assert.throws(() => buildHaikuRequest(options({ cacheTtl: '5m', messages: oneInMessages }), 'low'), /1h cache marker after a 5m one/);
  // 1h first, then 5m is the order the API wants, and the automatic 5m marker at the end is always fine.
  assert.doesNotThrow(() => buildHaikuRequest(options({ cacheTtl: '1h', cacheConversation: true, messages: [{ role: 'user', content: [{ type: 'text', text: 'a', cache_control: { type: 'ephemeral' } }] }] }), 'low'));
});

test('count_tokens failed on the primary and counted on Bedrock: the message goes to Bedrock only, one failover event, the primary row says the count failed', async () => {
  const h = failoverHarness({ countTokens: async () => { throw APIError.generate(503, undefined, 'count down', new Headers()); } });
  const response = await quiet(() => callHaiku(options({ messages: BIG }), h.deps));
  assert.equal(response.provider, 'bedrock');
  assert.equal(h.sent.length, 0, 'the primary just failed; the message is not sent there');
  assert.equal(h.bedrockSent.length, 1);
  assert.equal(h.bedrockCounted.length, 1);
  assert.deepEqual(h.started.map((row) => row.provider), ['anthropic', 'bedrock']);
  assert.equal(h.failed.length, 1);
  assert.equal(h.failed[0].errorKind, 'count_tokens_failed');
  assert.equal(h.failed[0].httpStatus, 503);
  assert.equal(h.captured.filter((event) => event.event === 'llm_provider_failover').length, 1);
  // The Bedrock attempt reuses the Bedrock count: no second count.
  assert.equal(h.bedrockCounted.length, 1);
});

test('count_tokens failing on both providers: the primary row says the count failed, nothing is sent, no failover event', async () => {
  const h = failoverHarness(
    { countTokens: async () => { throw overloaded(); } },
    { countTokens: async () => { throw APIError.generate(503, undefined, 'bedrock count down', new Headers()); } },
  );
  await quiet(() => assert.rejects(callHaiku(options({ messages: BIG }), h.deps)));
  assert.equal(h.failed[0].errorKind, 'count_tokens_failed');
  assert.equal(h.sent.length + h.bedrockSent.length, 0);
  assert.equal(h.captured.filter((event) => event.event === 'llm_provider_failover').length, 0);
});

interface BreakingApi { url: string; hits: string[] }

async function withBreakingHaikuApi(
  how: 'reset' | 'stall',
  run: (api: BreakingApi) => Promise<void>,
): Promise<void> {
  const hits: string[] = [];
  const open = new Set<ServerResponse>();
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { model?: string };
      const path = request.url ?? '';
      hits.push(path);
      const bedrock = path.startsWith('/bedrock/');
      open.add(response);
      response.writeHead(200, { 'content-type': 'text/event-stream', 'request-id': bedrock ? 'req_bedrock' : 'req_primary' });
      const send = (event: string, data: unknown) => response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const message = {
        id: 'msg_local', type: 'message', role: 'assistant', model: String(body.model), stop_sequence: null, stop_reason: null, content: [],
        usage: { input_tokens: 321, output_tokens: 1, cache_read_input_tokens: 40, cache_creation_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 } },
      };
      send('message_start', { type: 'message_start', message });
      send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '', citations: null } });
      if (!bedrock) {
        if (how === 'reset') setTimeout(() => request.socket.destroy(), 30);
        else response.write('event: ping\ndata: {"type":"ping"}\n\n');
        return;
      }
      send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'from bedrock' } });
      send('content_block_stop', { type: 'content_block_stop', index: 0 });
      send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 9 } });
      send('message_stop', { type: 'message_stop' });
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await run({ url, hits });
  } finally {
    for (const response of open) response.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('a streamed Haiku call (max_tokens over 16k) whose connection resets or goes idle after the headers fails over, and the failed row keeps the usage it saw', async () => {
  for (const how of ['reset', 'stall'] as const) {
    await withBreakingHaikuApi(how, async ({ url, hits }) => {
      await withClientEnv({
        ANTHROPIC_API_KEY: 'sk-local',
        ANTHROPIC_BASE_URL: url,
        AWS_BEARER_TOKEN_BEDROCK: 'bedrock-token',
        ANTHROPIC_BEDROCK_MANTLE_BASE_URL: `${url}/bedrock`,
      }, async () => {
        const h = failoverHarness({});
        h.deps.getClient = defaultHaikuClient;
        h.deps.getBedrockClient = defaultBedrockHaikuClient;
        setStreamIdleTimeoutForTests(150);
        try {
          const response = await quiet(() => callHaiku(options({ maxTokens: 20_000 }), h.deps));
          assert.equal(response.provider, 'bedrock', how);
          assert.equal(response.content, 'from bedrock', how);
          assert.deepEqual(h.started.map((row) => row.provider), ['anthropic', 'bedrock'], how);
          assert.equal(h.failed.length, 1, how);
          assert.equal(h.failed[0].errorKind, how === 'stall' ? 'connection_timeout' : 'connection_error', how);
          assert.equal(h.failed[0].inputTokens, 321, how);
          assert.equal(h.failed[0].cacheReadInputTokens, 40, how);
          assert.equal(h.captured.filter((event) => event.event === 'llm_provider_failover').length, 1, how);
          const failedEvent = h.events.find((event) => event.error_kind !== null);
          assert.ok(failedEvent, how);
          assert.equal(failedEvent.input_tokens, 321, how);
          assert.ok((failedEvent.cost_usd as number) > 0, 'cost is not silently zero');
          // message_start reports output_tokens 1; the real count only comes in message_delta, which never came.
          assert.equal(failedEvent.output_tokens_partial, true, how);
          assert.equal((h.failed[0].providerUsage as Record<string, unknown>).output_tokens_partial, true, how);
          assert.equal(h.failed[0].inputTokens, 321, 'input and cache fields are kept as reported');
          // The largest gap between bytes: a stall reaches the idle limit, a reset stays well under it.
          const gap = failedEvent.stream_max_gap_ms as number;
          assert.equal(typeof gap, 'number', how);
          if (how === 'stall') assert.ok(gap >= 140, `stall gap ${gap}`);
          else assert.ok(gap < 140, `reset gap ${gap}`);
          const okEvent = h.events.find((event) => event.error_kind === null);
          assert.ok(okEvent, how);
          assert.equal(typeof okEvent.stream_max_gap_ms, 'number', 'the streamed success reports its gap too');
          assert.equal(okEvent.output_tokens_partial, false, how);
          assert.equal(hits.filter((path) => path.startsWith('/bedrock/')).length, 1, how);
        } finally {
          setStreamIdleTimeoutForTests(null);
        }
      });
    });
  }
});

// A chat turn carrying a compaction block that fails over. Written down before the code: the failover event cannot be
// told apart from any other (so a Bedrock refusal of an Anthropic-signed block is invisible), a plain request is
// flagged too, Bedrock's 4xx is swallowed instead of reaching the route as that 4xx, or the block is dropped from the
// request Bedrock gets (history lost quietly).
test('a failed-over request with a compaction block is flagged on the failover event, and a Bedrock 400 reaches the caller as that 400', async () => {
  const block = { type: 'compaction', content: 'Summary of the earlier conversation.', signature: 'sig_c1' };
  const messages = [
    { role: 'assistant' as const, content: [block as unknown as Anthropic.Beta.BetaContentBlockParam] },
    { role: 'user' as const, content: 'Welche Kuendigungsfrist hatte ich?' },
  ];
  const refused = badRequest();
  const h = failoverHarness({ createMessage: async () => { throw overloaded(); } }, { createMessage: async (params) => { h.bedrockSent.push(params); throw refused; } });
  await quiet(() => assert.rejects(callHaiku(options({ site: 'chat', messages }), h.deps), (thrown: unknown) => thrown === refused));
  const failover = h.captured.filter((e) => e.event === 'llm_provider_failover');
  assert.equal(failover.length, 1);
  assert.equal(failover[0].properties.compaction, true);
  assert.deepEqual(h.bedrockSent[0].betas, ['compact-2026-09-04']);
  assert.deepEqual((h.bedrockSent[0].messages[0].content as unknown[])[0], block);

  const plain = failoverHarness({ createMessage: async () => { throw overloaded(); } });
  await quiet(() => callHaiku(options({ site: 'chat' }), plain.deps));
  assert.equal(plain.captured.filter((e) => e.event === 'llm_provider_failover')[0].properties.compaction, undefined);
});
