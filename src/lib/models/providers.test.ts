import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from '@anthropic-ai/sdk';

import {
  ModelStopError,
  assertUsableStop,
  callAnthropic,
  callAnthropicStream,
  setSonnetDepsForTests,
  setStreamIdleTimeoutForTests,
  type SonnetDeps,
} from './anthropic';
import { InputBudgetError } from './haiku';
import { createStreamGuard } from './stream-guard';
import {
  BEDROCK_MODEL_IDS,
  StreamIdleTimeoutError,
  StreamTransportError,
  bedrockConfigured,
  bedrockModelId,
  failoverErrorKind,
  getBedrockClient,
  getPrimaryClient,
  isFailoverError,
  markNotFailoverEligible,
  resetProviderCachesForTests,
  runWithFailover,
  type FailoverInfo,
} from './providers';

/** A real SDK error for a status, built the way the SDK builds it from a response. */
function httpError(status: number, type = 'api_error'): APIError {
  return APIError.generate(
    status,
    { type: 'error', error: { type, message: `scripted ${status}` } },
    `scripted ${status}`,
    new Headers({ 'request-id': 'req_test' }),
  );
}

const BILLED = { usage: { input_tokens: 10, output_tokens: 1 }, providerRequestId: 'req_billed' };

// --- isFailoverError: the table. Failure modes first. -----------------------------------------------

test('isFailoverError is false for every 4xx, including the ones that look retryable', () => {
  for (const status of [400, 401, 403, 404, 408, 409, 413, 422, 429]) {
    assert.equal(isFailoverError(httpError(status)), false, `HTTP ${status}`);
  }
});

test('isFailoverError is false for a completed response that is not usable', () => {
  for (const kind of ['provider_refusal', 'provider_max_tokens', 'provider_empty_content'] as const) {
    assert.equal(isFailoverError(new ModelStopError('stop', kind, BILLED)), false, kind);
  }
});

test('isFailoverError is false for the input budget guard, parse failures, aborts and non-errors', () => {
  assert.equal(isFailoverError(new InputBudgetError('chat', 95_000)), false);
  assert.equal(isFailoverError(new SyntaxError('Unexpected token < in JSON')), false);
  assert.equal(isFailoverError(new Error('Failed to parse Anthropic response as JSON')), false);
  assert.equal(isFailoverError(new Error('schema validation failed: missing "company"')), false);
  assert.equal(isFailoverError(new APIUserAbortError()), false);
  assert.equal(isFailoverError(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })), false);
  assert.equal(isFailoverError(new Error('ANTHROPIC_API_KEY is not set')), false);
  assert.equal(isFailoverError('boom'), false);
  assert.equal(isFailoverError(null), false);
  assert.equal(isFailoverError(undefined), false);
});

test('isFailoverError is false for a stream error event that is not a server fault', () => {
  const rateLimited = new APIError(undefined, { error: { type: 'rate_limit_error' } }, undefined, new Headers(), 'rate_limit_error');
  const invalid = new APIError(undefined, { error: { type: 'invalid_request_error' } }, undefined, new Headers(), 'invalid_request_error');
  const untyped = new APIError(undefined, undefined, 'stream ended', new Headers(), null);
  assert.equal(isFailoverError(rateLimited), false);
  assert.equal(isFailoverError(invalid), false);
  assert.equal(isFailoverError(untyped), false);
});

test('isFailoverError is true for network failures', () => {
  assert.equal(isFailoverError(new APIConnectionError({ message: 'Connection error.' })), true);
  assert.equal(isFailoverError(new APIConnectionTimeoutError()), true);
});

test('isFailoverError is true for 5xx, including 529 overloaded', () => {
  for (const status of [500, 502, 503, 504, 529]) {
    assert.equal(isFailoverError(httpError(status)), true, `HTTP ${status}`);
  }
  // A duck-typed error with a 5xx status counts too (wrapped errors and the harness carry only `status`).
  assert.equal(isFailoverError(Object.assign(new Error('overloaded'), { status: 529 })), true);
});

test('isFailoverError is true for a mid-stream overloaded or api error event', () => {
  const overloaded = new APIError(undefined, { error: { type: 'overloaded_error' } }, undefined, new Headers(), 'overloaded_error');
  const api = new APIError(undefined, { error: { type: 'api_error' } }, undefined, new Headers(), 'api_error');
  assert.equal(isFailoverError(overloaded), true);
  assert.equal(isFailoverError(api), true);
});

test('an error marked not eligible is never a failover error, whatever its class', () => {
  const counted = httpError(503);
  assert.equal(isFailoverError(counted), true);
  assert.equal(isFailoverError(markNotFailoverEligible(counted)), false);
  // The marker is on the object, not a copy: the error is rethrown unchanged.
  assert.equal(markNotFailoverEligible(counted), counted);
});

test('failoverErrorKind names the failure for the log and the PostHog event', () => {
  assert.equal(failoverErrorKind(new APIConnectionTimeoutError()), 'connection_timeout');
  assert.equal(failoverErrorKind(new APIConnectionError({ message: 'x' })), 'connection_error');
  assert.equal(failoverErrorKind(httpError(529, 'overloaded_error')), 'overloaded');
  assert.equal(failoverErrorKind(httpError(503)), 'server_error');
  assert.equal(failoverErrorKind(new APIError(undefined, undefined, undefined, new Headers(), 'overloaded_error')), 'overloaded');
});

// --- model map ----------------------------------------------------------------------------------------

test('every model the app calls has a Bedrock id; any other model throws', () => {
  assert.equal(bedrockModelId('claude-sonnet-5-5'), 'anthropic.claude-sonnet-5-5');
  assert.equal(bedrockModelId('claude-haiku-5-5'), 'anthropic.claude-haiku-5-5');
  assert.deepEqual(Object.keys(BEDROCK_MODEL_IDS).sort(), ['claude-haiku-5-5', 'claude-sonnet-5-5']);
  assert.throws(() => bedrockModelId('claude-sonnet-4-6'), /No Bedrock model id for "claude-sonnet-4-6"/);
  assert.throws(() => bedrockModelId('anthropic.claude-sonnet-5-5'), /No Bedrock model id/);
});

// --- runWithFailover -----------------------------------------------------------------------------------

interface FakeClient { name: 'primary' | 'bedrock' }
const PRIMARY: FakeClient = { name: 'primary' };
const BEDROCK: FakeClient = { name: 'bedrock' };

function quietly<T>(run: () => Promise<T>): Promise<T> {
  const warn = console.warn;
  console.warn = () => {};
  return run().finally(() => { console.warn = warn; });
}

function plan(overrides: { bedrock?: FakeClient | null; failOver?: () => boolean } = {}) {
  const attempts: Array<{ provider: string; model: string }> = [];
  const events: FailoverInfo[] = [];
  return {
    attempts,
    events,
    args: (attempt: (provider: 'anthropic' | 'bedrock') => Promise<string>) => ({
      site: 'chat',
      model: 'claude-haiku-5-5',
      primary: () => PRIMARY,
      bedrock: () => (overrides.bedrock === undefined ? BEDROCK : overrides.bedrock),
      canFailOver: overrides.failOver,
      onFailover: (info: FailoverInfo) => { events.push(info); },
      attempt: async (target: { provider: 'anthropic' | 'bedrock'; model: string; getClient: () => FakeClient }) => {
        attempts.push({ provider: target.provider, model: target.model });
        target.getClient();
        return attempt(target.provider);
      },
    }),
  };
}

test('a 400 from the primary is thrown and never reaches Bedrock', async () => {
  const p = plan();
  const error = httpError(400, 'invalid_request_error');
  await assert.rejects(runWithFailover(p.args(async () => { throw error; })), (thrown: unknown) => thrown === error);
  assert.deepEqual(p.attempts, [{ provider: 'anthropic', model: 'claude-haiku-5-5' }]);
  assert.equal(p.events.length, 0);
});

test('a refusal from the primary is thrown and never reaches Bedrock', async () => {
  const p = plan();
  const error = new ModelStopError('declined', 'provider_refusal', BILLED);
  await assert.rejects(runWithFailover(p.args(async () => { throw error; })), (thrown: unknown) => thrown === error);
  assert.equal(p.attempts.length, 1);
});

test('a 529 with Bedrock not configured keeps today\'s failure path: the original error, no second attempt', async () => {
  const p = plan({ bedrock: null });
  const error = httpError(529, 'overloaded_error');
  await assert.rejects(runWithFailover(p.args(async () => { throw error; })), (thrown: unknown) => thrown === error);
  assert.deepEqual(p.attempts, [{ provider: 'anthropic', model: 'claude-haiku-5-5' }]);
  assert.equal(p.events.length, 0);
});

test('a 529 with Bedrock configured: one retry on Bedrock, with the Bedrock model id, and one failover event', async () => {
  const p = plan();
  const result = await quietly(() => runWithFailover(p.args(async (provider) => {
    if (provider === 'anthropic') throw httpError(529, 'overloaded_error');
    return 'answered by bedrock';
  })));
  assert.equal(result, 'answered by bedrock');
  assert.deepEqual(p.attempts, [
    { provider: 'anthropic', model: 'claude-haiku-5-5' },
    { provider: 'bedrock', model: 'anthropic.claude-haiku-5-5' },
  ]);
  assert.equal(p.events.length, 1);
  assert.deepEqual(
    { site: p.events[0].site, model: p.events[0].model, kind: p.events[0].primaryErrorKind, status: p.events[0].primaryHttpStatus },
    { site: 'chat', model: 'claude-haiku-5-5', kind: 'overloaded', status: 529 },
  );
});

test('a connection error with no status fails over, and the event carries a null status', async () => {
  const p = plan();
  await quietly(() => runWithFailover(p.args(async (provider) => {
    if (provider === 'anthropic') throw new APIConnectionError({ message: 'Connection error.' });
    return 'ok';
  })));
  assert.equal(p.events[0].primaryErrorKind, 'connection_error');
  assert.equal(p.events[0].primaryHttpStatus, null);
});

test('when Bedrock fails too, its error is thrown and there is no third attempt', async () => {
  const p = plan();
  const bedrockError = httpError(503);
  await assert.rejects(
    quietly(() => runWithFailover(p.args(async (provider) => {
      throw provider === 'anthropic' ? httpError(529, 'overloaded_error') : bedrockError;
    }))),
    (thrown: unknown) => thrown === bedrockError,
  );
  assert.equal(p.attempts.length, 2);
});

test('failover is per call: the next call starts on the primary again', async () => {
  const p = plan();
  let calls = 0;
  const attempt = async (provider: 'anthropic' | 'bedrock') => {
    calls += 1;
    if (calls === 1 && provider === 'anthropic') throw httpError(529, 'overloaded_error');
    return provider;
  };
  assert.equal(await quietly(() => runWithFailover(p.args(attempt))), 'bedrock');
  assert.equal(await runWithFailover(p.args(attempt)), 'anthropic');
  assert.deepEqual(p.attempts.map((a) => a.provider), ['anthropic', 'bedrock', 'anthropic']);
});

test('canFailOver false (text already reached the caller) keeps the failure', async () => {
  const p = plan({ failOver: () => false });
  const error = httpError(529, 'overloaded_error');
  await assert.rejects(runWithFailover(p.args(async () => { throw error; })), (thrown: unknown) => thrown === error);
  assert.equal(p.attempts.length, 1);
  assert.equal(p.events.length, 0);
});

test('asked to fail over a model that is not in the map: throws, naming the model and keeping the cause', async () => {
  const p = plan();
  const cause = httpError(529, 'overloaded_error');
  const args = { ...p.args(async () => { throw cause; }), model: 'claude-sonnet-4-6' };
  await assert.rejects(runWithFailover(args), (thrown: unknown) => {
    assert.ok(thrown instanceof Error);
    assert.match(thrown.message, /claude-sonnet-4-6/);
    assert.equal((thrown as Error & { cause?: unknown }).cause, cause);
    return true;
  });
  assert.equal(p.attempts.length, 1);
});

test('a failing failover event does not block the Bedrock attempt', async () => {
  const p = plan();
  const args = {
    ...p.args(async (provider) => {
      if (provider === 'anthropic') throw httpError(500);
      return 'bedrock answer';
    }),
    onFailover: async () => { throw new Error('posthog down'); },
  };
  const error = console.error;
  console.error = () => {};
  try {
    assert.equal(await quietly(() => runWithFailover(args)), 'bedrock answer');
  } finally {
    console.error = error;
  }
});

// --- pinned provider (one request's tool loop) ---------------------------------------------------------

test('pinned to Bedrock: straight to Bedrock with no primary attempt, and a failure there is a failure', async () => {
  const p = plan();
  const bedrockError = httpError(529, 'overloaded_error');
  await assert.rejects(
    runWithFailover({ ...p.args(async () => { throw bedrockError; }), pin: 'bedrock' as const }),
    (thrown: unknown) => thrown === bedrockError,
  );
  assert.deepEqual(p.attempts, [{ provider: 'bedrock', model: 'anthropic.claude-haiku-5-5' }]);
  assert.equal(p.events.length, 0);
  assert.equal(await runWithFailover({ ...p.args(async (provider) => provider), pin: 'bedrock' as const }), 'bedrock');
});

test('pinned to Bedrock without Bedrock configured throws a clear error and never tries the primary', async () => {
  const p = plan({ bedrock: null });
  await assert.rejects(runWithFailover({ ...p.args(async () => 'x'), pin: 'bedrock' as const }), /pinned to Amazon Bedrock but Bedrock is not configured/);
  assert.equal(p.attempts.length, 0);
});

test('pinned to the Anthropic API: a 529 does not fail over', async () => {
  const p = plan();
  const error = httpError(529, 'overloaded_error');
  await assert.rejects(runWithFailover({ ...p.args(async () => { throw error; }), pin: 'anthropic' as const }), (thrown: unknown) => thrown === error);
  assert.deepEqual(p.attempts.map((a) => a.provider), ['anthropic']);
});

// --- clients ---------------------------------------------------------------------------------------------

const ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'AWS_BEARER_TOKEN_BEDROCK',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_REGION',
  'BEDROCK_REGION',
  'ANTHROPIC_BEDROCK_MANTLE_BASE_URL',
];

async function withEnv(values: Record<string, string>, run: () => Promise<void> | void): Promise<void> {
  const saved = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
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

test('Bedrock is not configured without credentials, and asking for the client is not an error', async () => {
  await withEnv({ AWS_REGION: 'us-east-1' }, () => {
    assert.equal(bedrockConfigured(), false);
    assert.equal(getBedrockClient(), null);
  });
});

test('half an AWS key pair is not credentials', async () => {
  await withEnv({ AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE' }, () => {
    assert.equal(bedrockConfigured(), false);
    assert.equal(getBedrockClient(), null);
  });
  await withEnv({ AWS_SECRET_ACCESS_KEY: 'secret' }, () => {
    assert.equal(bedrockConfigured(), false);
  });
});

test('a bearer token configures Bedrock; region is BEDROCK_REGION, then AWS_REGION, then us-east-1', async () => {
  await withEnv({ AWS_BEARER_TOKEN_BEDROCK: 'token' }, () => {
    const client = getBedrockClient();
    assert.ok(client);
    assert.equal(client.awsRegion, 'us-east-1');
    assert.equal(client.baseURL, 'https://bedrock-mantle.us-east-1.api.aws/anthropic');
    assert.equal(client.maxRetries, 2);
  });
  await withEnv({ AWS_BEARER_TOKEN_BEDROCK: 'token', AWS_REGION: 'eu-west-1' }, () => {
    assert.equal(getBedrockClient()?.awsRegion, 'eu-west-1');
  });
  await withEnv({ AWS_BEARER_TOKEN_BEDROCK: 'token', AWS_REGION: 'eu-west-1', BEDROCK_REGION: 'us-west-2' }, () => {
    assert.equal(getBedrockClient()?.awsRegion, 'us-west-2');
  });
});

test('explicit AWS keys configure Bedrock with SigV4, and never the credential provider chain', async () => {
  await withEnv({ AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE', AWS_SECRET_ACCESS_KEY: 'secret', AWS_SESSION_TOKEN: 'session' }, async () => {
    const client = getBedrockClient();
    assert.ok(client);
    assert.equal(client.awsAccessKey, 'AKIAEXAMPLE');
    assert.equal(client.awsSecretAccessKey, 'secret');
    assert.equal(client.awsSessionToken, 'session');
    // The resolver is the only door to the chain (and to ~/.aws on a laptop): it must refuse.
    assert.ok(client.providerChainResolver);
    await assert.rejects(client.providerChainResolver(), /credential provider chain is not used/);
  });
});

test('ANTHROPIC_BEDROCK_MANTLE_BASE_URL overrides the Bedrock endpoint (how E2E points it at the fake)', async () => {
  await withEnv({ AWS_BEARER_TOKEN_BEDROCK: 'token', ANTHROPIC_BEDROCK_MANTLE_BASE_URL: 'http://127.0.0.1:18793/bedrock' }, () => {
    assert.equal(getBedrockClient()?.baseURL, 'http://127.0.0.1:18793/bedrock');
  });
});

test('the primary client retries once; a missing key throws at call time, not at import', async () => {
  await withEnv({ ANTHROPIC_API_KEY: 'sk-test' }, () => {
    assert.equal(getPrimaryClient().maxRetries, 1);
  });
  await withEnv({}, () => {
    assert.throws(() => getPrimaryClient(), /ANTHROPIC_API_KEY is not set/);
  });
});


// --- streams that break after the response headers (SDK 1.1.0: no status, no idle timer) ---------------

test('isFailoverError is true for a stream cut mid-body and for a stream that went idle', () => {
  const cut = new StreamTransportError('terminated', { cause: new TypeError('terminated') });
  const idle = new StreamIdleTimeoutError(60_000, { cause: new APIUserAbortError() });
  assert.equal(isFailoverError(cut), true);
  assert.equal(isFailoverError(idle), true);
  assert.ok(idle instanceof StreamTransportError);
  assert.equal((cut as Error & { cause?: unknown }).cause instanceof TypeError, true);
  assert.equal(failoverErrorKind(cut), 'connection_error');
  assert.equal(failoverErrorKind(idle), 'connection_timeout');
  // The marker still wins: Bedrock was already tried for this failure.
  assert.equal(isFailoverError(markNotFailoverEligible(new StreamTransportError('x'))), false);
});

test('the stream guard names its errors: a plain SDK error becomes ours, a status error and a caller abort stay as they are', async () => {
  const plain = createStreamGuard(10_000);
  await assert.rejects(
    plain.run(async () => { throw Object.assign(new Error('terminated'), { name: 'Error' }); }),
    (thrown: unknown) => thrown instanceof StreamTransportError && !(thrown instanceof StreamIdleTimeoutError),
  );
  const withStatus = createStreamGuard(10_000);
  const http = httpError(400, 'invalid_request_error');
  await assert.rejects(withStatus.run(async () => { throw http; }), (thrown: unknown) => thrown === http);
  const connection = createStreamGuard(10_000);
  const refused = new APIConnectionError({ message: 'Connection error.' });
  await assert.rejects(connection.run(async () => { throw refused; }), (thrown: unknown) => thrown === refused);
  const streamEvent = createStreamGuard(10_000);
  const overloaded = new APIError(undefined, { error: { type: 'overloaded_error' } }, undefined, new Headers(), 'overloaded_error');
  await assert.rejects(streamEvent.run(async () => { throw overloaded; }), (thrown: unknown) => thrown === overloaded);
});

test('a real caller abort is not a failover error; our own idle abort is', async () => {
  const caller = new AbortController();
  const callerGuard = createStreamGuard(10_000, caller.signal);
  const callerAbort = callerGuard.run(async () => {
    caller.abort();
    throw new APIUserAbortError();
  });
  await assert.rejects(callerAbort, (thrown: unknown) => thrown instanceof APIUserAbortError && isFailoverError(thrown) === false);
  assert.equal(callerGuard.signal.aborted, true);

  const idleGuard = createStreamGuard(20);
  idleGuard.start();
  await assert.rejects(
    idleGuard.run(() => new Promise((_resolve, reject) => {
      idleGuard.signal.addEventListener('abort', () => reject(new APIUserAbortError()), { once: true });
    })),
    (thrown: unknown) => thrown instanceof StreamIdleTimeoutError && isFailoverError(thrown) === true,
  );
});

test('runWithFailover keeps the primary error when the Bedrock client cannot be built', async () => {
  const p = plan();
  const primary = httpError(529, 'overloaded_error');
  const clientError = new Error('Bedrock client boom');
  const logged: unknown[][] = [];
  const consoleError = console.error;
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    await assert.rejects(
      runWithFailover({ ...p.args(async () => { throw primary; }), bedrock: () => { throw clientError; } }),
      (thrown: unknown) => thrown === primary,
    );
  } finally {
    console.error = consoleError;
  }
  assert.equal((primary as Error & { failoverClientError?: unknown }).failoverClientError, clientError);
  assert.equal(logged.length, 1);
  assert.equal(p.attempts.length, 1);
  assert.equal(p.events.length, 0);
});

type StreamMode =
  | 'ok'
  | 'reset-before-text'
  | 'reset-after-text'
  | 'stall-after-ping'
  | 'slow-with-pings'
  | 'eof-before-text'
  | 'eof-after-text';

interface StreamHit { path: string; stream: boolean }

/** One server for both providers: `/bedrock/...` always answers, everything else follows `mode.current`. */
async function withStreamApi(
  run: (url: string, hits: StreamHit[], mode: { current: StreamMode }) => Promise<void>,
): Promise<void> {
  const hits: StreamHit[] = [];
  const mode: { current: StreamMode } = { current: 'ok' };
  const sockets = new Set<ServerResponse>();
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { stream?: boolean; model?: string };
      const path = request.url ?? '';
      hits.push({ path, stream: body.stream === true });
      const isBedrock = path.startsWith('/bedrock/');
      const how: StreamMode = isBedrock ? 'ok' : mode.current;
      const message = {
        id: 'msg_local', type: 'message', role: 'assistant', model: String(body.model), stop_sequence: null, stop_reason: null,
        content: [],
        usage: { input_tokens: 77, output_tokens: 1, cache_read_input_tokens: 5, cache_creation_input_tokens: 9, cache_creation: { ephemeral_5m_input_tokens: 9, ephemeral_1h_input_tokens: 0 } },
      };
      const text = isBedrock ? 'from bedrock' : 'from primary';
      sockets.add(response);
      response.writeHead(200, { 'content-type': 'text/event-stream', 'request-id': isBedrock ? 'req_bedrock' : 'req_primary' });
      const send = (event: string, data: unknown) => response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const start = () => {
        send('message_start', { type: 'message_start', message });
        send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      };
      const textDelta = (value: string) => send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: value } });
      const finish = () => {
        send('content_block_stop', { type: 'content_block_stop', index: 0 });
        send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 12 } });
        send('message_stop', { type: 'message_stop' });
        response.end();
      };
      if (how === 'ok') { start(); textDelta(text); finish(); return; }
      if (how === 'reset-before-text') { start(); setTimeout(() => request.socket.destroy(), 30); return; }
      if (how === 'reset-after-text') { start(); textDelta('partial '); setTimeout(() => request.socket.destroy(), 60); return; }
      if (how === 'stall-after-ping') { start(); response.write('event: ping\ndata: {"type":"ping"}\n\n'); return; }
      if (how === 'eof-before-text') { start(); setTimeout(() => response.end(), 30); return; }
      if (how === 'eof-after-text') { start(); textDelta('partial '); setTimeout(() => response.end(), 30); return; }
      // slow-with-pings: nothing visible for 5 x 60 ms, only pings, then a full answer.
      start();
      let ticks = 0;
      const timer = setInterval(() => {
        ticks += 1;
        response.write('event: ping\ndata: {"type":"ping"}\n\n');
        if (ticks === 5) { clearInterval(timer); textDelta(text); finish(); }
      }, 60);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await run(url, hits, mode);
  } finally {
    for (const response of sockets) response.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

interface LedgerRow { id: string; provider: string; model: string; outcome: 'started' | 'completed' | 'failed'; errorKind?: string; inputTokens?: number | null; cacheReadInputTokens?: number | null }

/** Real SDK clients (both providers) against the local server, the ledger and PostHog replaced by recorders. */
async function withLiveSonnet(
  run: (api: { url: string; hits: StreamHit[]; mode: { current: StreamMode }; rows: LedgerRow[]; events: Array<{ event?: string; properties: Record<string, unknown> }> }) => Promise<void>,
  idleMs = 150,
): Promise<void> {
  await withStreamApi(async (url, hits, mode) => {
    await withEnv({
      ANTHROPIC_API_KEY: 'sk-local',
      ANTHROPIC_BASE_URL: url,
      AWS_BEARER_TOKEN_BEDROCK: 'bedrock-token',
      ANTHROPIC_BEDROCK_MANTLE_BASE_URL: `${url}/bedrock`,
    }, async () => {
      const rows: LedgerRow[] = [];
      const events: Array<{ event?: string; properties: Record<string, unknown> }> = [];
      let n = 0;
      const deps: Partial<SonnetDeps> = {
        startLedger: (async (params: { provider: string; model: string }) => {
          n += 1;
          rows.push({ id: `gen-${n}`, provider: params.provider, model: params.model, outcome: 'started' });
          return { id: `gen-${n}`, startedAt: '2026-10-22T00:00:00.000Z' };
        }) as SonnetDeps['startLedger'],
        completeLedger: (async (params: { id: string }) => {
          const row = rows.find((r) => r.id === params.id);
          if (row) row.outcome = 'completed';
        }) as SonnetDeps['completeLedger'],
        failLedger: (async (params: { id: string; errorKind: string; inputTokens?: number | null; cacheReadInputTokens?: number | null }) => {
          const row = rows.find((r) => r.id === params.id);
          if (row) Object.assign(row, { outcome: 'failed', errorKind: params.errorKind, inputTokens: params.inputTokens, cacheReadInputTokens: params.cacheReadInputTokens });
        }) as SonnetDeps['failLedger'],
        capture: async (event) => { events.push(event); },
      };
      setSonnetDepsForTests(deps);
      setStreamIdleTimeoutForTests(idleMs);
      const warn = console.warn;
      const error = console.error;
      console.warn = () => {};
      console.error = () => {};
      try {
        await run({ url, hits, mode, rows, events });
      } finally {
        console.warn = warn;
        console.error = error;
        setSonnetDepsForTests(null);
        setStreamIdleTimeoutForTests(null);
      }
    });
  });
}

const STREAM_CALL = { prompt: 'hello', maxTokens: 500, generationContext: { requestExecutionId: 'r1', route: '/t', feature: 'f', operation: 'stream_test' } };

test('a streamed Sonnet call whose connection is reset after the headers fails over to Bedrock, one failed row and one Bedrock row', async () => {
  await withLiveSonnet(async ({ mode, rows, events }) => {
    mode.current = 'reset-before-text';
    const chunks: string[] = [];
    const response = await callAnthropicStream(STREAM_CALL, (chunk) => chunks.push(chunk));
    assert.equal(response.provider, 'bedrock');
    assert.equal(response.content, 'from bedrock');
    assert.deepEqual(chunks, ['from bedrock']);
    assert.deepEqual(rows.map((r) => [r.provider, r.model, r.outcome]), [
      ['anthropic', 'claude-sonnet-5-5', 'failed'],
      ['bedrock', 'anthropic.claude-sonnet-5-5', 'completed'],
    ]);
    // The failed row keeps what the stream had reported (message_start usage): the cost is not silently zero.
    assert.equal(rows[0].errorKind, 'connection_error');
    assert.equal(rows[0].inputTokens, 77);
    assert.equal(rows[0].cacheReadInputTokens, 5);
    const failover = events.filter((event) => event.event === 'llm_provider_failover');
    assert.equal(failover.length, 1);
    assert.equal(failover[0].properties.primary_error_kind, 'connection_error');
    const failedGeneration = events.find((event) => event.event === undefined && event.properties.error_kind === 'connection_error');
    assert.ok(failedGeneration, 'the failed attempt has its $ai_generation event');
    assert.equal(failedGeneration.properties.input_tokens, 77);
    assert.ok((failedGeneration.properties.cost_usd as number) > 0, 'cost is not silently zero');
  });
});

test('a streamed Sonnet call that goes quiet after a ping hits the idle timeout and fails over', async () => {
  await withLiveSonnet(async ({ mode, rows, events }) => {
    mode.current = 'stall-after-ping';
    const started = Date.now();
    const response = await callAnthropicStream(STREAM_CALL, () => {});
    assert.equal(response.provider, 'bedrock');
    assert.ok(Date.now() - started < 5_000, 'it did not wait for the 10 minute SDK default');
    assert.deepEqual(rows.map((r) => [r.provider, r.outcome]), [['anthropic', 'failed'], ['bedrock', 'completed']]);
    assert.equal(rows[0].errorKind, 'connection_timeout');
    assert.equal(events.filter((event) => event.event === 'llm_provider_failover')[0].properties.primary_error_kind, 'connection_timeout');
  });
});

test('pings keep a slow stream alive: nothing but pings for longer than the idle timeout is not idle', async () => {
  await withLiveSonnet(async ({ mode, rows, hits }) => {
    mode.current = 'slow-with-pings';
    const response = await callAnthropicStream(STREAM_CALL, () => {});
    assert.equal(response.provider, 'anthropic');
    assert.equal(response.content, 'from primary');
    assert.equal(hits.length, 1);
    assert.deepEqual(rows.map((r) => [r.provider, r.outcome]), [['anthropic', 'completed']]);
  });
});

test('once text reached the caller, a cut stream is a failure: no Bedrock, no duplicated text, usage kept on the failed row', async () => {
  await withLiveSonnet(async ({ mode, rows, hits }) => {
    mode.current = 'reset-after-text';
    const chunks: string[] = [];
    await assert.rejects(callAnthropicStream(STREAM_CALL, (chunk) => chunks.push(chunk)), /Anthropic streaming failed/);
    assert.deepEqual(chunks, ['partial ']);
    assert.equal(hits.some((hit) => hit.path.startsWith('/bedrock/')), false);
    assert.deepEqual(rows.map((r) => [r.provider, r.outcome, r.errorKind, r.inputTokens]), [['anthropic', 'failed', 'connection_error', 77]]);
  });
});

test('a stream that ends without message_stop is not a success: before any text it fails over, after text it fails loud', async () => {
  await withLiveSonnet(async ({ mode, rows }) => {
    mode.current = 'eof-before-text';
    const response = await callAnthropicStream(STREAM_CALL, () => {});
    assert.equal(response.provider, 'bedrock');
    assert.equal(rows[0].outcome, 'failed');
  });
  await withLiveSonnet(async ({ mode, rows, hits }) => {
    mode.current = 'eof-after-text';
    const chunks: string[] = [];
    await assert.rejects(callAnthropicStream(STREAM_CALL, (chunk) => chunks.push(chunk)), /Anthropic streaming failed/);
    assert.deepEqual(chunks, ['partial ']);
    assert.equal(hits.some((hit) => hit.path.startsWith('/bedrock/')), false);
    assert.equal(rows[0].outcome, 'failed');
  });
});

test('a Sonnet call big enough to stream (max_tokens over 16k) fails over when the connection is reset or goes idle', async () => {
  for (const how of ['reset-before-text', 'stall-after-ping'] as const) {
    await withLiveSonnet(async ({ mode, rows, hits }) => {
      mode.current = how;
      // maxTokens 5000 -> max_tokens 20000, above STREAM_ABOVE_MAX_TOKENS, so the SDK streams and waits for the final message.
      const response = await callAnthropic({ ...STREAM_CALL, maxTokens: 5000 });
      assert.equal(response.provider, 'bedrock', how);
      assert.equal(response.content, 'from bedrock', how);
      assert.equal(hits.every((hit) => hit.stream), true);
      assert.deepEqual(rows.map((r) => [r.provider, r.outcome]), [['anthropic', 'failed'], ['bedrock', 'completed']], how);
      assert.equal(rows[0].errorKind, how === 'stall-after-ping' ? 'connection_timeout' : 'connection_error', how);
    });
  }
});

test('a Sonnet timeout is recorded on the ledger as connection_timeout, not the generic provider_error', async () => {
  const failed: Array<{ errorKind: string; httpStatus?: number | null }> = [];
  const client = {
    messages: { create: () => ({ withResponse: async () => { throw new APIConnectionTimeoutError(); } }) },
  } as unknown as ReturnType<SonnetDeps['getClient']>;
  setSonnetDepsForTests({
    getClient: () => client,
    getBedrockClient: () => null,
    startLedger: (async () => ({ id: 'g1', startedAt: '2026-10-22T00:00:00.000Z' })) as SonnetDeps['startLedger'],
    completeLedger: (async () => {}) as SonnetDeps['completeLedger'],
    failLedger: (async (params: { errorKind: string; httpStatus?: number | null }) => { failed.push(params); }) as SonnetDeps['failLedger'],
    capture: async () => {},
  });
  const error = console.error;
  console.error = () => {};
  try {
    await assert.rejects(callAnthropic(STREAM_CALL), /Anthropic API call failed/);
  } finally {
    console.error = error;
    setSonnetDepsForTests(null);
  }
  assert.deepEqual(failed.map((row) => row.errorKind), ['connection_timeout']);
});

test('a response that stopped without a finished answer is provider_incomplete', () => {
  const billed = { usage: { input_tokens: 1, output_tokens: 1 }, providerRequestId: 'req' };
  for (const stopReason of [null, undefined, 'pause_turn', 'model_context_window_exceeded']) {
    assert.throws(
      () => assertUsableStop(stopReason, null, 100, billed),
      (thrown: unknown) => thrown instanceof ModelStopError && thrown.errorKind === 'provider_incomplete',
      String(stopReason),
    );
  }
  for (const stopReason of ['end_turn', 'tool_use', 'stop_sequence']) assert.doesNotThrow(() => assertUsableStop(stopReason, null, 100, billed), stopReason);
});
