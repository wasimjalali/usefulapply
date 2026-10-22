import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from '@anthropic-ai/sdk';

import { ModelStopError } from './anthropic';
import { InputBudgetError } from './haiku';
import {
  BEDROCK_MODEL_IDS,
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
