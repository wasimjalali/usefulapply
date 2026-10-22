import assert from 'node:assert/strict';
import test from 'node:test';

import { ModelStopError } from './anthropic';
import {
  InputBudgetError,
  buildHaikuRequest,
  callHaiku,
  defaultHaikuClient,
  type HaikuCallOptions,
  type HaikuClient,
  type HaikuDeps,
  type HaikuMessage,
} from './haiku';

const CONTEXT = {
  requestExecutionId: 'req-1',
  userId: 'user-1',
  route: '/api/test',
  feature: 'test',
  operation: 'unit',
};

const ZERO_SPLIT = { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 };

function usage(input: number, output: number, read = 0, write = 0, split = ZERO_SPLIT) {
  return {
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: read,
    cache_creation_input_tokens: write,
    cache_creation: split,
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
  sent: Record<string, unknown>[];
  counted: Record<string, unknown>[];
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
  assert.equal(h.failed[0].errorKind, 'provider_error');
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

  const refused = harness({ createMessage: async () => reply('', usage(10, 0), { stop_reason: 'refusal', stop_details: { category: 'x' } }) });
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
  assert.equal(h.failed[0].errorKind, 'provider_error');
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
function markers(params: Record<string, unknown>): Marker[] {
  const out: Marker[] = [];
  const ttlOf = (cc: unknown) => ((cc as { ttl?: string }).ttl === '1h' ? '1h' : '5m') as '5m' | '1h';
  (params.tools as Array<{ name: string; cache_control?: unknown }> | undefined)?.forEach((t) => {
    if (t.cache_control) out.push({ where: `tool:${t.name}`, ttl: ttlOf(t.cache_control) });
  });
  (params.system as Array<{ text: string; cache_control?: unknown }>).forEach((b, i) => {
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

test('cache markers: last tool, static and stableContext blocks carry the site TTL', () => {
  const params = buildHaikuRequest(options({
    tools: [TOOL_A, TOOL_B],
    system: { static: 'static rules', stableContext: 'the CV' },
    cacheTtl: '1h',
  }), 'low');
  assert.deepEqual(markers(params), [
    { where: 'tool:b_tool', ttl: '1h' },
    { where: 'system:0', ttl: '1h' },
    { where: 'system:1', ttl: '1h' },
  ]);
  const tools = params.tools as Array<{ cache_control?: unknown }>;
  assert.equal(tools[0].cache_control, undefined);
});

test('cacheTtl 5m (the default) sends the marker without a ttl', () => {
  const params = buildHaikuRequest(options({ tools: [TOOL_A] }), 'low');
  assert.deepEqual((params.system as Array<{ cache_control: unknown }>)[0].cache_control, { type: 'ephemeral' });
  assert.deepEqual((params.tools as Array<{ cache_control: unknown }>)[0].cache_control, { type: 'ephemeral' });
});

test('cacheConversation adds an automatic 5m marker after the 1h markers; at most 4 markers', () => {
  const params = buildHaikuRequest(options({
    tools: [TOOL_A, TOOL_B],
    system: { static: 'static rules', stableContext: 'the CV' },
    cacheTtl: '1h',
    cacheConversation: true,
  }), 'low');
  const list = markers(params);
  assert.deepEqual(list.map((m) => m.where), ['tool:b_tool', 'system:0', 'system:1', 'conversation']);
  assert.deepEqual(list.map((m) => m.ttl), ['1h', '1h', '1h', '5m']);
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
    assert.equal(params.temperature, undefined);
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
  // counts and labels only: nothing from the prompt or the answer
  assert.ok(!JSON.stringify(e).includes('answer'));
  assert.ok(!JSON.stringify(e).includes('hello'));
});

test('compaction-style usage (iterations) is summed in tokens, cost and the event', async () => {
  const u = {
    ...usage(0, 0),
    iterations: [
      { type: 'compaction', ...usage(2782, 1069) },
      { type: 'message', ...usage(500, 80, 1000, 0) },
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
