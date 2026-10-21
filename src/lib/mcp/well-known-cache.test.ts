import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createDiscoveryHandler,
  DISCOVERY_CLIENT_CACHE_CONTROL,
  DISCOVERY_TTL_MS,
  type DiscoveryStore,
} from './well-known-cache';

const URL_AS = 'https://example.test/.well-known/oauth-authorization-server/api/auth';
const URL_PRM = 'https://example.test/.well-known/oauth-protected-resource/mcp';
const DOC = JSON.stringify({ issuer: 'https://example.test/api/auth', scopes_supported: ['read', 'write', 'spend'] });

/** Stands in for Better Auth: counts calls and records the method it was asked with. */
function fakeAuth() {
  const calls: string[] = [];
  const fill = async (request: Request) => {
    calls.push(request.method);
    const path = new URL(request.url).pathname;
    if (path.startsWith('/.well-known/nope')) return new Response('nope', { status: 404 });
    return new Response(DOC, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15' },
    });
  };
  return { calls, fill };
}

/** A shared store like the Workers Cache API: keyed by URL, keeps the headers it was given. */
function fakeStore() {
  const map = new Map<string, Response>();
  const store: DiscoveryStore = {
    async match(key) {
      return map.get(key.url)?.clone();
    },
    async put(key, response) {
      map.set(key.url, response);
    },
  };
  return { map, store };
}

test('a cached answer is byte-identical to the uncached one, and Better Auth is asked once', async () => {
  const auth = fakeAuth();
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store: fakeStore().store });
  const first = await serve(new Request(URL_AS));
  const second = await serve(new Request(URL_AS));
  assert.equal(first.status, 200);
  assert.equal(await first.text(), DOC);
  assert.equal(await second.text(), DOC);
  assert.equal(second.headers.get('content-type'), 'application/json');
  assert.equal(second.headers.get('cache-control'), DISCOVERY_CLIENT_CACHE_CONTROL);
  assert.deepEqual(auth.calls, ['GET']);
});

test('a fresh isolate reads the shared store instead of Better Auth', async () => {
  const auth = fakeAuth();
  const { store } = fakeStore();
  await createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store })(new Request(URL_PRM));
  const otherIsolate = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store });
  const res = await otherIsolate(new Request(URL_PRM));
  assert.equal(await res.text(), DOC);
  assert.equal(res.headers.get('cache-control'), DISCOVERY_CLIENT_CACHE_CONTROL);
  assert.deepEqual(auth.calls, ['GET']);
});

test('MCP off answers 404 even after a cached hit, in the memo and in the store', async () => {
  const auth = fakeAuth();
  const { store } = fakeStore();
  let enabled = true;
  const serve = createDiscoveryHandler({ isEnabled: () => enabled, fill: auth.fill, store });
  assert.equal((await serve(new Request(URL_AS))).status, 200);
  assert.equal((await serve(new Request(URL_AS))).status, 200);
  enabled = false;
  assert.equal((await serve(new Request(URL_AS))).status, 404);
  assert.equal((await serve(new Request(URL_AS, { method: 'HEAD' }))).status, 404);
  const freshIsolate = createDiscoveryHandler({ isEnabled: () => false, fill: auth.fill, store });
  assert.equal((await freshIsolate(new Request(URL_AS))).status, 404);
  assert.deepEqual(auth.calls, ['GET']);
});

test('HEAD works on a miss and on a hit: same status and headers, no body', async () => {
  const auth = fakeAuth();
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store: fakeStore().store });
  const miss = await serve(new Request(URL_AS, { method: 'HEAD' }));
  const hit = await serve(new Request(URL_AS, { method: 'HEAD' }));
  const get = await serve(new Request(URL_AS));
  for (const res of [miss, hit]) {
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '');
    assert.equal(res.headers.get('content-type'), get.headers.get('content-type'));
    assert.equal(res.headers.get('cache-control'), get.headers.get('cache-control'));
  }
  assert.equal(await get.text(), DOC);
  assert.deepEqual(auth.calls, ['GET']);
});

test('non-200 answers and other methods are passed through, never cached', async () => {
  const auth = fakeAuth();
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store: fakeStore().store });
  const nope = new Request('https://example.test/.well-known/nope');
  assert.equal((await serve(nope)).status, 404);
  assert.equal((await serve(nope)).status, 404);
  assert.equal((await serve(new Request(URL_AS, { method: 'OPTIONS' }))).status, 200);
  assert.deepEqual(auth.calls, ['GET', 'GET', 'OPTIONS']);
});

test('documents expire after the TTL, in the memo and in the store', async () => {
  const auth = fakeAuth();
  let now = 1_000_000;
  const { store } = fakeStore();
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store, now: () => now });
  await serve(new Request(URL_AS));
  now += DISCOVERY_TTL_MS - 1;
  await serve(new Request(URL_AS));
  assert.equal(auth.calls.length, 1);
  now += 2;
  await serve(new Request(URL_AS));
  assert.equal(auth.calls.length, 2);
});

test('a broken store still serves the document', async () => {
  const auth = fakeAuth();
  const broken: DiscoveryStore = {
    async match() {
      throw new Error('cache down');
    },
    async put() {
      throw new Error('cache down');
    },
  };
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store: broken });
  const log = console.error;
  console.error = () => {};
  try {
    assert.equal(await (await serve(new Request(URL_AS))).text(), DOC);
  } finally {
    console.error = log;
  }
});
