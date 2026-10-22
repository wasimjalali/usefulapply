/**
 * Live smoke test of callHaiku (2026-10-22): one call per mode against claude-haiku-5-5, printing usage only.
 *
 *   npx tsx evals/haiku-55-swap/smoke-callhaiku.ts
 *
 * Modes: plain, tools (tool_use then a tool_result round, thinking blocks passed back unaltered),
 * jsonSchema, and cacheConversation over 2 turns (1h static + stableContext markers, automatic 5m
 * conversation marker: turn 2 should read the whole turn-1 prefix).
 *
 * The real client and request builder run. The DB ledger and PostHog are replaced by no-ops (a script has no
 * Cloudflare D1 binding), so this checks the request and the usage and cost maths, not the ledger writes
 * (those are covered by src/lib/models/haiku.test.ts). Paid, under $0.05; aborts above MAX_SPEND_USD.
 * Credentials: loads .env.local / .dev.vars from the cwd or the main checkout (never printed).
 */
import path from 'node:path';
import {
  callHaiku,
  defaultHaikuClient,
  type HaikuCallOptions,
  type HaikuDeps,
  type HaikuResponse,
} from '../../src/lib/models/haiku';

const ROOT = path.resolve(__dirname, '..', '..');
const MAX_SPEND_USD = 0.05;

function loadEnv(): void {
  const mainCheckout = path.resolve(ROOT, '..', '..', '..');
  for (const file of [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.dev.vars'),
    path.join(mainCheckout, '.env.local'),
    path.join(mainCheckout, '.dev.vars'),
  ]) {
    try {
      process.loadEnvFile(file);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') console.warn(`env file ${path.basename(file)} not loaded: ${code ?? 'unknown error'}`);
    }
  }
}
loadEnv();
if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set in .env.local or .dev.vars');

let spendUsd = 0;
const deps: HaikuDeps = {
  getClient: defaultHaikuClient,
  startLedger: async () => ({ id: crypto.randomUUID(), startedAt: new Date().toISOString() }),
  completeLedger: async () => {},
  failLedger: async () => {},
  capture: async () => {},
};

const NONCE = crypto.randomUUID();
const CONTEXT = {
  requestExecutionId: NONCE,
  route: 'evals/smoke-callhaiku',
  feature: 'smoke',
  operation: 'smoke',
};

// Over the 512-token cache minimum, deterministic, and unique per run (the nonce) so no earlier run is read.
const RULES = Array.from({ length: 60 }, (_, i) =>
  `Rule ${i + 1}: when the user asks about topic ${i + 1}, answer in one short sentence and never add a list.`,
).join('\n');
const STATIC_SYSTEM = `Smoke test ${NONCE}. You are a terse assistant.\n${RULES}`;
const STABLE_CONTEXT = `User context ${NONCE}: ${'The user is a test fixture with no real data. '.repeat(40)}`;

function show(label: string, r: HaikuResponse): void {
  spendUsd += r.costUsd;
  if (spendUsd > MAX_SPEND_USD) throw new Error(`Smoke spend ${spendUsd.toFixed(5)} passed the cap ${MAX_SPEND_USD}`);
  const u = r.usage;
  const hit = r.inputTokensTotal ? ((u.cacheReadInputTokens ?? 0) / r.inputTokensTotal) * 100 : 0;
  console.log(
    `${label.padEnd(26)} stop=${r.stopReason} effort=${r.effort} in=${u.inputTokens} out=${u.outputTokens} ` +
      `read=${u.cacheReadInputTokens} write=${u.cacheCreationInputTokens} (5m ${u.cacheCreation5mInputTokens} / 1h ${u.cacheCreation1hInputTokens}) ` +
      `total_in=${r.inputTokensTotal} hit=${hit.toFixed(1)}% cost=$${r.costUsd.toFixed(6)} ${r.latencyMs}ms`,
  );
}

function base(over: Partial<HaikuCallOptions>): HaikuCallOptions {
  return {
    site: 'tracker',
    system: { static: STATIC_SYSTEM },
    messages: [{ role: 'user', content: 'Say hello in one word.' }],
    maxTokens: 1500,
    generationContext: CONTEXT,
    ...over,
  };
}

async function main(): Promise<void> {
  // 1. plain
  show('plain', await callHaiku(base({}), deps));

  // 2. tools: a tool call, then the tool_result round with rawContent passed back unaltered
  const tools = [{
    name: 'get_tracker_count',
    description: 'Returns how many applications the user tracks in a status.',
    input_schema: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['saved', 'applied', 'interview', 'offer'] } },
      required: ['status'],
    },
  }];
  const toolMessages: HaikuCallOptions['messages'] = [
    { role: 'user', content: 'How many of my applications are in interview? Use the tool.' },
  ];
  const t1 = await callHaiku(base({ tools, messages: toolMessages, cacheTtl: '1h' }), deps);
  show('tools round 1', t1);
  if (!t1.toolCalls || t1.toolCalls.length === 0) throw new Error('tools mode: expected a tool call');
  const call = t1.toolCalls[0];
  console.log(`  tool call: ${call.name} ${JSON.stringify(call.arguments)}`);
  const t2 = await callHaiku(base({
    tools,
    cacheTtl: '1h',
    messages: [
      ...toolMessages,
      { role: 'assistant', content: t1.rawContent },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: call.id, content: '4' }] },
    ],
  }), deps);
  show('tools round 2', t2);
  if (!/4|four/i.test(t2.content)) throw new Error(`tools mode: round 2 did not use the tool result: ${t2.content}`);

  // 3. jsonSchema
  const j = await callHaiku(base({
    jsonSchema: {
      type: 'object',
      properties: { greeting: { type: 'string' }, language: { type: 'string', enum: ['en', 'de'] } },
      required: ['greeting', 'language'],
      additionalProperties: false,
    },
    messages: [{ role: 'user', content: 'Greet me in German.' }],
  }), deps);
  show('jsonSchema', j);
  const parsed = JSON.parse(j.content) as { greeting?: unknown; language?: unknown };
  if (typeof parsed.greeting !== 'string' || parsed.language !== 'de') throw new Error(`jsonSchema mode: bad output ${j.content}`);

  // 4. cacheConversation over 2 turns (1h on static + stableContext, automatic 5m on the conversation)
  const conv = (messages: HaikuCallOptions['messages']) => callHaiku(base({
    site: 'chat',
    system: { static: STATIC_SYSTEM, stableContext: STABLE_CONTEXT },
    cacheTtl: '1h',
    cacheConversation: true,
    messages,
  }), deps);
  const c1 = await conv([{ role: 'user', content: 'Reply with the single word: one.' }]);
  show('conversation turn 1', c1);
  const c2 = await conv([
    { role: 'user', content: 'Reply with the single word: one.' },
    { role: 'assistant', content: c1.rawContent },
    { role: 'user', content: 'Now reply with the single word: two.' },
  ]);
  show('conversation turn 2', c2);
  if ((c2.usage.cacheReadInputTokens ?? 0) < (c1.usage.cacheCreationInputTokens ?? 0)) {
    throw new Error('conversation mode: turn 2 did not read the whole turn-1 prefix');
  }

  console.log(`\nTotal spend: $${spendUsd.toFixed(6)} (cap $${MAX_SPEND_USD})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
