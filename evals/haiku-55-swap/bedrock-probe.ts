/**
 * Bedrock failover probe (2026-10-22). Run it once after enabling Amazon Bedrock model access for Claude Sonnet 5.5
 * and Claude Haiku 5.5, before relying on the failover in src/lib/models/providers.ts.
 *
 *   npx tsx evals/haiku-55-swap/bedrock-probe.ts --dry-run   print the requests, no network, no credentials needed
 *   npx tsx evals/haiku-55-swap/bedrock-probe.ts             one call each to Sonnet 5.5 and Haiku 5.5, then a count_tokens
 *   npx tsx evals/haiku-55-swap/bedrock-probe.ts --twice     the same two calls a second time, to see the cache read
 *
 * What it answers: do both models answer through the mantle endpoint (`anthropic.claude-sonnet-5-5`,
 * `anthropic.claude-haiku-5-5`) with the request shape the app sends (adaptive thinking, effort low, an
 * ephemeral cache marker on the system block); do the cache fields come back (cache_creation_input_tokens on the
 * first call, cache_read_input_tokens on the second); what is the request id; and does `count_tokens` work on
 * Bedrock (the input budget guard relies on it when the Anthropic API is down). Haiku goes through
 * `client.beta.messages`, like callHaiku; Sonnet through `client.messages`, like callAnthropic.
 *
 * The client is the production one (getBedrockClient): explicit credentials from the environment only
 * (AWS_BEARER_TOKEN_BEDROCK, or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY), region BEDROCK_REGION, then
 * AWS_REGION, then us-east-1. Credentials are read from .env.local / .dev.vars in the cwd or the main checkout
 * and never printed. Cost: a few cents at most (about 3k input tokens and a short answer per call).
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

// Over 512 tokens, so the marker can write a cache entry on both models (the minimum is 512 on each).
const STATIC_PROMPT = [
  'You are a terse assistant used to check an API connection. Answer in one short sentence.',
  ...Array.from({ length: 60 }, (_, i) => `Rule ${i + 1}: keep the answer under twenty words, plain text, no markdown, no lists, no emoji.`),
].join('\n');

const SYSTEM: Anthropic.TextBlockParam[] = [{ type: 'text', text: STATIC_PROMPT, cache_control: { type: 'ephemeral' } }];
const MESSAGES: Anthropic.MessageParam[] = [{ role: 'user', content: 'Say which model you are and that the connection works.' }];

const SONNET_REQUEST: Anthropic.MessageCreateParamsNonStreaming = {
  model: 'anthropic.claude-sonnet-5-5',
  max_tokens: 4000,
  system: SYSTEM,
  messages: MESSAGES,
  thinking: { type: 'adaptive' },
  output_config: { effort: 'low' },
};

const HAIKU_REQUEST: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming = {
  model: 'anthropic.claude-haiku-5-5',
  max_tokens: 2000,
  system: SYSTEM,
  messages: MESSAGES,
  output_config: { effort: 'low' },
};

const COUNT_REQUEST: Anthropic.Beta.Messages.MessageCountTokensParams = {
  model: HAIKU_REQUEST.model,
  system: SYSTEM,
  messages: MESSAGES,
};

/** JSON for the console, with the long system text shortened. */
function show(label: string, value: unknown): void {
  console.log(`\n--- ${label}`);
  console.log(JSON.stringify(value, (key, v) => (key === 'text' && typeof v === 'string' && v.length > 120 ? `${v.slice(0, 100)}... (${v.length} chars)` : v), 2));
}

function describeError(error: unknown): string {
  const e = error as { status?: unknown; requestID?: unknown; message?: unknown; name?: unknown };
  return `${String(e.name ?? 'Error')} status=${String(e.status ?? 'none')} request-id=${String(e.requestID ?? 'none')}: ${String(e.message ?? error)}`;
}

async function main(): Promise<void> {
  if (DRY_RUN) {
    console.log('Dry run: nothing is sent. These are the requests the probe would send.');
    show('Sonnet 5.5 via client.messages.create', SONNET_REQUEST);
    show('Haiku 5.5 via client.beta.messages.create', HAIKU_REQUEST);
    show('count_tokens via client.beta.messages.countTokens', COUNT_REQUEST);
    return;
  }

  loadEnv();
  const { getBedrockClient } = await import('../../src/lib/models/providers');
  const client = getBedrockClient();
  if (!client) {
    throw new Error('No Bedrock credentials: set AWS_BEARER_TOKEN_BEDROCK, or AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
  }
  console.log(`Bedrock endpoint: ${client.baseURL} (region ${client.awsRegion ?? 'unset'}, retries ${client.maxRetries})`);

  const rounds = TWICE ? 2 : 1;
  let failures = 0;
  for (let round = 1; round <= rounds; round += 1) {
    try {
      const { data, request_id } = await client.messages.create(SONNET_REQUEST).withResponse();
      show(`Sonnet 5.5, call ${round}`, { model: data.model, stop_reason: data.stop_reason, request_id, usage: data.usage });
    } catch (error) {
      failures += 1;
      console.error(`\nSonnet 5.5, call ${round} FAILED: ${describeError(error)}`);
    }
    try {
      const { data, request_id } = await client.beta.messages.create(HAIKU_REQUEST).withResponse();
      show(`Haiku 5.5, call ${round}`, { model: data.model, stop_reason: data.stop_reason, request_id, usage: data.usage });
    } catch (error) {
      failures += 1;
      console.error(`\nHaiku 5.5, call ${round} FAILED: ${describeError(error)}`);
    }
  }
  try {
    const counted = await client.beta.messages.countTokens(COUNT_REQUEST);
    show('count_tokens (Haiku 5.5)', counted);
  } catch (error) {
    failures += 1;
    console.error(`\ncount_tokens FAILED: ${describeError(error)}`);
  }
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
