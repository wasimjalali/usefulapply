/**
 * Bedrock failover probe (2026-10-22). Run it once after enabling Amazon Bedrock model access for Claude Sonnet 5.5
 * and Claude Haiku 5.5, before relying on the failover in src/lib/models/providers.ts.
 *
 *   npx tsx evals/haiku-55-swap/bedrock-probe.ts --dry-run   print the requests, no network, no credentials needed
 *   npx tsx evals/haiku-55-swap/bedrock-probe.ts             the calls below once, then a summary of what each returned
 *   npx tsx evals/haiku-55-swap/bedrock-probe.ts --twice     the same calls a second time, to see the cache reads
 *
 * What it answers: do both models answer through the mantle endpoint (`anthropic.claude-sonnet-5-5`,
 * `anthropic.claude-haiku-5-5`) to the requests the app really sends. The requests are built by the app's own
 * builders (buildSonnetRequest, buildHaikuRequest, appendToolRound) with only the model id swapped, as the
 * failover does, so the probe cannot drift from production:
 *
 *   1. Sonnet 5.5, adaptive thinking with output_config.effort, a 1h cache marker on the static system block
 *      before a 5m marker on the per-user block.
 *   2. Haiku 5.5 structured output: output_config.format json_schema, 1h system markers.
 *   3. Haiku 5.5 chat shape, round 1: a tool, 1h markers on both system blocks, a 5m marker on the user turn.
 *   4. Haiku 5.5 chat shape, round 2: round 1's content (thinking and tool_use blocks, signed by Bedrock) passed back
 *      unchanged with a tool_result carrying the 5m marker.
 *   5. count_tokens on the round 1 request (the input budget guard relies on it when the Anthropic API is down).
 *   6. The pin direction the code does NOT cover. The chat loop pins a request to Bedrock once Bedrock answered, so
 *      Bedrock-signed thinking never reaches the direct API. A round the direct API answered can still fail over to
 *      Bedrock on the next round, and that request then carries thinking signed by the direct API. This check runs
 *      round 1 on the direct API (needs ANTHROPIC_API_KEY), then round 2 on Bedrock with that content passed back,
 *      and reports PASS or FAIL. A FAIL means such a round fails as a 400 (a turn error, not a data problem).
 *      It runs once per invocation, after the Bedrock calls above.
 *   7. A chat compaction block (Phase 2) on a failover. A compacted chat stores the block the direct API wrote, and
 *      every later turn sends it first in `messages` with the compact-2026-09-04 beta. If such a turn fails over, Bedrock
 *      gets that Anthropic-signed block. This check compacts a short German conversation on the direct API with the
 *      chat's own request (buildCompactionMessages, the chat tools and system, CHAT_COMPACTION_INSTRUCTIONS), then sends
 *      the block plus one new user turn (buildChatMessages) to Bedrock's Haiku 5.5. PASS is a normal reply. A FAIL means
 *      a failed-over compacted turn is a 4xx: the chat route answers it with CHAT_PROVIDER_UNAVAILABLE and the
 *      llm_provider_failover event carries `compaction: true`; nothing is dropped.
 *
 * It also shows the request id and the cache fields (cache_creation_input_tokens on the first call,
 * cache_read_input_tokens on the second). Haiku goes through `client.beta.messages`, like callHaiku; Sonnet
 * through `client.messages`, like callAnthropic.
 *
 * The client is the production one (getBedrockClient): explicit credentials from the environment only
 * (AWS_BEARER_TOKEN_BEDROCK, or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY), region BEDROCK_REGION, then
 * AWS_REGION, then us-east-1. Credentials are read from .env.local / .dev.vars in the cwd or the main checkout
 * and never printed. Cost: a few cents at most (about 3k input tokens and a short answer per call, ten calls; checks 6
 * and 7 also need ANTHROPIC_API_KEY for their direct-API half).
 */
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';

const ROOT = path.resolve(__dirname, '..', '..');
const DRY_RUN = process.argv.includes('--dry-run');
const TWICE = process.argv.includes('--twice');

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

// Each block is over 512 tokens (the minimum on both models), so every marker can write a cache entry.
const rules = (label: string, count: number): string =>
  Array.from({ length: count }, (_, i) => `${label} rule ${i + 1}: keep the answer under twenty words, plain text, no markdown, no lists, no emoji.`).join('\n');
const STATIC_PROMPT = `You are a terse assistant used to check an API connection. Answer in one short sentence.\n${rules('Static', 60)}`;
const USER_CONTEXT = `Context for this user, repeated on every call:\n${rules('Context', 60)}`;

const USER_TEXT = 'Say which model you are and that the connection works.';
const TOOL_USER_TEXT = 'Look up the connection status for the region us-east-1 with the tool, then say what it returned in one sentence.';

const GENERATION_CONTEXT = { requestExecutionId: 'bedrock-probe', route: 'evals/bedrock-probe', feature: 'bedrock_probe', operation: 'bedrock_probe' };

const STATUS_SCHEMA = {
  type: 'object',
  properties: {
    model: { type: 'string' },
    connection_ok: { type: 'boolean' },
  },
  required: ['model', 'connection_ok'],
  additionalProperties: false,
};

const STATUS_TOOL = {
  name: 'connection_status',
  description: 'Look up the connection status of a region. Always call it when asked for a status.',
  input_schema: {
    type: 'object',
    properties: { region: { type: 'string', description: 'The region, for example us-east-1.' } },
    required: ['region'],
    additionalProperties: false,
  },
};

type HaikuRequest = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type CountParams = Anthropic.Beta.Messages.MessageCountTokensParams;

/** JSON for the console, with the long system text shortened. */
function show(label: string, value: unknown): void {
  console.log(`\n--- ${label}`);
  console.log(JSON.stringify(value, (key, v) => (key === 'text' && typeof v === 'string' && v.length > 120 ? `${v.slice(0, 100)}... (${v.length} chars)` : v), 2));
}

function describeError(error: unknown): string {
  const e = error as { status?: unknown; requestID?: unknown; message?: unknown; name?: unknown };
  return `${String(e.name ?? 'Error')} status=${String(e.status ?? 'none')} request-id=${String(e.requestID ?? 'none')}: ${String(e.message ?? error)}`;
}

/** The app's own builders, loaded lazily so a dry run needs no credentials and no network. */
async function buildRequests() {
  const { buildSonnetRequest } = await import('../../src/lib/models/anthropic');
  const { buildHaikuRequest, HAIKU_MODEL_ID } = await import('../../src/lib/models/haiku');
  const { bedrockModelId } = await import('../../src/lib/models/providers');
  const { appendToolRound } = await import('../../src/lib/agents/prompts/chat-prompt');

  const sonnetModel = bedrockModelId('claude-sonnet-5-5');
  const haikuModel = bedrockModelId(HAIKU_MODEL_ID);

  // 1. Sonnet: adaptive thinking + effort (added by the builder), 1h system marker before a 5m one.
  const sonnet = buildSonnetRequest(
    {
      prompt: USER_TEXT,
      systemBlocks: [
        { type: 'text', text: STATIC_PROMPT, cache_control: { type: 'ephemeral', ttl: '1h' } },
        { type: 'text', text: USER_CONTEXT, cache_control: { type: 'ephemeral' } },
      ],
      maxTokens: 4000,
      site: 'bedrock_probe',
      generationContext: GENERATION_CONTEXT,
    },
    sonnetModel,
  );

  // 2. Haiku structured output (output_config.format json_schema), 1h system markers.
  const structured: HaikuRequest = {
    ...buildHaikuRequest(
      {
        site: 'screening',
        system: { static: STATIC_PROMPT, stableContext: USER_CONTEXT },
        messages: [{ role: 'user', content: USER_TEXT }],
        jsonSchema: STATUS_SCHEMA,
        maxTokens: 2000,
        cacheTtl: '1h',
        generationContext: GENERATION_CONTEXT,
      },
      'low',
    ),
    model: haikuModel,
  };

  // 3. Haiku chat, round 1: tool, 1h system markers, the user turn marked 5m (as buildChatMessages does).
  const round1: HaikuRequest = {
    ...buildHaikuRequest(
      {
        site: 'chat',
        system: { static: STATIC_PROMPT, stableContext: USER_CONTEXT },
        messages: [{ role: 'user', content: [{ type: 'text', text: TOOL_USER_TEXT, cache_control: { type: 'ephemeral' } }] }],
        tools: [STATUS_TOOL],
        toolChoice: 'auto',
        maxTokens: 2000,
        cacheTtl: '1h',
        cacheConversation: false,
        generationContext: GENERATION_CONTEXT,
      },
      'low',
    ),
    model: haikuModel,
  };

  // 4. Round 2: round 1's content goes back unchanged (thinking and tool_use blocks), plus the tool result.
  const round2 = (assistantContent: Anthropic.Beta.BetaContentBlock[]): HaikuRequest => {
    const toolUse = assistantContent.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('round 1 returned no tool_use block, so there is no round 2');
    const messages = structuredClone(round1.messages);
    appendToolRound(messages, assistantContent, [
      { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ region: 'us-east-1', status: 'ok' }) },
    ]);
    return { ...round1, messages };
  };

  // 5. count_tokens on the round 1 request, the way measureBudget sends it.
  const count: CountParams = {
    model: haikuModel,
    system: round1.system,
    ...(round1.tools ? { tools: round1.tools } : {}),
    messages: round1.messages,
  };

  // 6. Round 1 for the direct API: the same request with the primary model id (the app's own failover-free path).
  const directRound1: HaikuRequest = { ...round1, model: HAIKU_MODEL_ID };

  // 7. A compaction on the direct API, then a turn on Bedrock carrying its block, both as the chat route builds them.
  const { buildChatMessages, buildCompactionMessages, buildMainChatPrompt } = await import('../../src/lib/agents/prompts/chat-prompt');
  const { CHAT_COMPACTION_INSTRUCTIONS } = await import('../../src/lib/agents/prompts/chat-compaction-prompt');
  const { chatToolDefinitions } = await import('../../src/lib/agents/chat-tools');
  const { COMPACTION_MAX_TOKENS } = await import('../../src/lib/models/compaction');
  const chatPrompt = buildMainChatPrompt({ hasCV: true, cvSummary: USER_CONTEXT }, 'Europe/Berlin', new Date('2026-10-22T10:00:00Z'));
  const chatSystem = { static: chatPrompt.static, stableContext: chatPrompt.stableContext };
  const chatTools = chatToolDefinitions();
  const compactedTurns: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: 'Ich bewerbe mich als Controller bei Northwind Foods in Hamburg. Meine Kuendigungsfrist ist drei Monate.' },
    { role: 'assistant', content: 'Notiert: drei Monate Kuendigungsfrist. Soll ich zuerst die Passung pruefen?' },
    { role: 'user', content: 'Ja, und das Anschreiben bitte unter 250 Woertern.' },
  ];
  const directCompaction: HaikuRequest = buildHaikuRequest(
    {
      site: 'chat',
      system: chatSystem,
      tools: chatTools,
      messages: buildCompactionMessages(compactedTurns, null),
      maxTokens: COMPACTION_MAX_TOKENS,
      cacheTtl: '1h',
      cacheConversation: false,
      compaction: { instructions: CHAT_COMPACTION_INSTRUCTIONS },
      generationContext: GENERATION_CONTEXT,
    },
    'low',
  );
  const bedrockTurnOnBlock = (block: Anthropic.Beta.BetaContentBlock): HaikuRequest => ({
    ...buildHaikuRequest(
      {
        site: 'chat',
        system: chatSystem,
        tools: chatTools,
        messages: buildChatMessages(
          [{ role: 'assistant', content: 'Gern, ich pruefe die Passung.' }, { role: 'user', content: 'Welche Kuendigungsfrist hatte ich genannt?' }],
          chatPrompt.state,
          block as unknown as Parameters<typeof buildChatMessages>[2],
        ),
        toolChoice: 'auto',
        maxTokens: 2000,
        cacheTtl: '1h',
        cacheConversation: false,
        generationContext: GENERATION_CONTEXT,
      },
      'low',
    ),
    model: haikuModel,
  });

  return { sonnet, structured, round1, directRound1, round2, count, directCompaction, bedrockTurnOnBlock };
}

type Check = { name: string; ok: boolean; detail: string };

function cacheDetail(usage: { cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null } | undefined): string {
  return `cache write ${usage?.cache_creation_input_tokens ?? 'n/a'}, cache read ${usage?.cache_read_input_tokens ?? 'n/a'}`;
}

async function main(): Promise<void> {
  const requests = await buildRequests();

  if (DRY_RUN) {
    console.log('Dry run: nothing is sent. These are the requests the probe would send.');
    show('1. Sonnet 5.5 via client.messages.create (adaptive thinking, effort, 1h then 5m markers)', requests.sonnet);
    show('2. Haiku 5.5 via client.beta.messages.create (structured output)', requests.structured);
    show('3. Haiku 5.5 chat round 1 via client.beta.messages.create (tool)', requests.round1);
    const placeholder: Anthropic.Beta.BetaContentBlock[] = [
      { type: 'thinking', thinking: '<thinking text from round 1>', signature: '<signature from round 1>' },
      { type: 'tool_use', id: '<tool_use id from round 1>', name: STATUS_TOOL.name, input: { region: 'us-east-1' }, caller: { type: 'direct' } },
    ];
    show('4. Haiku 5.5 chat round 2 (round 1 content passed back, placeholders for the signed blocks)', requests.round2(placeholder));
    show('5. count_tokens via client.beta.messages.countTokens', requests.count);
    show('6a. Haiku 5.5 chat round 1 on the DIRECT API (thinking signed by the direct API)', requests.directRound1);
    show('6b. round 2 on BEDROCK carrying the direct-API-signed thinking (placeholders for the signed blocks)', requests.round2(placeholder));
    show('7a. Haiku 5.5 chat compaction on the DIRECT API (beta compact-2026-09-04)', requests.directCompaction);
    show('7b. a chat turn on BEDROCK carrying the direct-API-signed compaction block (placeholder block)', requests.bedrockTurnOnBlock(
      { type: 'compaction', content: '<summary from 7a>', signature: '<signature from 7a>' } as unknown as Anthropic.Beta.BetaContentBlock,
    ));
    return;
  }

  loadEnv();
  const { getBedrockClient } = await import('../../src/lib/models/providers');
  const client = getBedrockClient();
  if (!client) {
    throw new Error('No Bedrock credentials: set AWS_BEARER_TOKEN_BEDROCK, or AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
  }
  console.log(`Bedrock endpoint: ${client.baseURL} (region ${client.awsRegion ?? 'unset'}, retries ${client.maxRetries})`);

  const checks: Check[] = [];
  const record = (check: Check): void => {
    checks.push(check);
    console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name}: ${check.detail}`);
  };

  const rounds = TWICE ? 2 : 1;
  for (let round = 1; round <= rounds; round += 1) {
    const tag = `call ${round}`;

    try {
      const { data, request_id } = await client.messages.create(requests.sonnet).withResponse();
      show(`1. Sonnet 5.5, ${tag}`, { model: data.model, stop_reason: data.stop_reason, request_id, usage: data.usage });
      record({ name: `Sonnet 5.5 adaptive thinking + effort + 1h/5m markers, ${tag}`, ok: true, detail: `${data.stop_reason}; ${cacheDetail(data.usage)}` });
    } catch (error) {
      record({ name: `Sonnet 5.5 adaptive thinking + effort + 1h/5m markers, ${tag}`, ok: false, detail: describeError(error) });
    }

    try {
      const { data, request_id } = await client.beta.messages.create(requests.structured).withResponse();
      show(`2. Haiku 5.5 structured output, ${tag}`, { model: data.model, stop_reason: data.stop_reason, request_id, usage: data.usage, content: data.content });
      const text = data.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        // reported below
      }
      const valid = typeof parsed === 'object' && parsed !== null && typeof (parsed as { connection_ok?: unknown }).connection_ok === 'boolean';
      record({ name: `Haiku 5.5 output_config.format json_schema, ${tag}`, ok: valid, detail: `${valid ? 'JSON matches the schema' : `not valid JSON for the schema: ${text.slice(0, 120)}`}; ${cacheDetail(data.usage)}` });
    } catch (error) {
      record({ name: `Haiku 5.5 output_config.format json_schema, ${tag}`, ok: false, detail: describeError(error) });
    }

    try {
      const { data: first, request_id } = await client.beta.messages.create(requests.round1).withResponse();
      show(`3. Haiku 5.5 chat round 1, ${tag}`, { model: first.model, stop_reason: first.stop_reason, request_id, usage: first.usage, blocks: first.content.map((block) => block.type) });
      const types = first.content.map((block) => block.type);
      record({ name: `Haiku 5.5 tool round 1, ${tag}`, ok: types.includes('tool_use'), detail: `blocks [${types.join(', ')}]; ${cacheDetail(first.usage)}` });
      if (!types.includes('tool_use')) continue;

      const { data: second, request_id: secondId } = await client.beta.messages.create(requests.round2(first.content)).withResponse();
      show(`4. Haiku 5.5 chat round 2, ${tag}`, { model: second.model, stop_reason: second.stop_reason, request_id: secondId, usage: second.usage, blocks: second.content.map((block) => block.type) });
      record({
        name: `Haiku 5.5 tool round 2 with round 1's ${types.includes('thinking') ? 'thinking and ' : ''}tool_use blocks passed back, ${tag}`,
        ok: second.stop_reason === 'end_turn' || second.stop_reason === 'tool_use',
        detail: `${types.includes('thinking') ? 'round 1 returned a thinking block' : 'round 1 returned NO thinking block (the thinking pass-back is not exercised)'}; stop ${second.stop_reason}; ${cacheDetail(second.usage)}`,
      });
    } catch (error) {
      record({ name: `Haiku 5.5 tool round trip, ${tag}`, ok: false, detail: describeError(error) });
    }
  }

  try {
    const counted = await client.beta.messages.countTokens(requests.count);
    show('5. count_tokens (Haiku 5.5, the chat round 1 request)', counted);
    record({ name: 'count_tokens', ok: Number.isInteger(counted.input_tokens) && counted.input_tokens > 0, detail: `${counted.input_tokens} input tokens` });
  } catch (error) {
    record({ name: 'count_tokens', ok: false, detail: describeError(error) });
  }

  // 6. Direct API signs round 1, Bedrock gets round 2. The reverse of the pin; the code does not prevent it.
  try {
    const { getPrimaryClient } = await import('../../src/lib/models/providers');
    const direct = getPrimaryClient();
    const { data: first } = await direct.beta.messages.create(requests.directRound1).withResponse();
    const types = first.content.map((block) => block.type);
    if (!types.includes('tool_use')) {
      record({ name: 'Direct-API-signed thinking passed to Bedrock', ok: false, detail: `the direct API's round 1 returned no tool_use block (blocks [${types.join(', ')}]), so the check could not run` });
    } else {
      const { data: second, request_id } = await client.beta.messages.create(requests.round2(first.content)).withResponse();
      show('6. Bedrock round 2 with direct-API-signed round 1 content', { model: second.model, stop_reason: second.stop_reason, request_id, blocks: second.content.map((block) => block.type) });
      record({
        name: 'Direct-API-signed thinking passed to Bedrock (a round that fails over after the direct API answered)',
        ok: second.stop_reason === 'end_turn' || second.stop_reason === 'tool_use',
        detail: `${types.includes('thinking') ? 'round 1 returned a thinking block' : 'round 1 returned NO thinking block (the cross-provider pass-back is not exercised)'}; stop ${second.stop_reason}`,
      });
    }
  } catch (error) {
    record({ name: 'Direct-API-signed thinking passed to Bedrock (a round that fails over after the direct API answered)', ok: false, detail: describeError(error) });
  }

  // 7. Direct API compacts, Bedrock gets the next turn with that block: a compacted chat whose turn fails over.
  const check7 = 'Direct-API-signed compaction block passed to Bedrock (a compacted chat turn that fails over)';
  try {
    const { getPrimaryClient } = await import('../../src/lib/models/providers');
    const direct = getPrimaryClient();
    const { data: compacted } = await direct.beta.messages.create(requests.directCompaction).withResponse();
    const block = compacted.content.find((item) => item.type === 'compaction');
    if (!block || compacted.stop_reason !== 'compaction') {
      record({ name: check7, ok: false, detail: `the direct API returned no compaction block (stop ${compacted.stop_reason}, blocks [${compacted.content.map((item) => item.type).join(', ')}]), so the check could not run` });
    } else {
      const { data: reply, request_id } = await client.beta.messages.create(requests.bedrockTurnOnBlock(block)).withResponse();
      const text = reply.content.map((item) => (item.type === 'text' ? item.text : '')).join('');
      show('7. Bedrock turn on a direct-API compaction block', { model: reply.model, stop_reason: reply.stop_reason, request_id, blocks: reply.content.map((item) => item.type), text: text.slice(0, 300) });
      record({ name: check7, ok: reply.stop_reason === 'end_turn' && text.trim().length > 0, detail: `stop ${reply.stop_reason}; ${/drei Monate|three months|3 Monate/i.test(text) ? 'the reply recalls the notice period from the block' : 'the reply does not mention the notice period'}` });
    }
  } catch (error) {
    record({ name: check7, ok: false, detail: describeError(error) });
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length} of ${checks.length} checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
