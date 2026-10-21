import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createDiscoveryHandler,
  DISCOVERY_TTL_MS,
  type DiscoveryStore,
} from './well-known-cache';

const URL_AS = 'https://example.test/.well-known/oauth-authorization-server/api/auth';
const URL_PRM = 'https://example.test/.well-known/oauth-protected-resource/mcp';
const BA_CC = 'public, max-age=15, stale-while-revalidate=15, stale-if-error=86400';
const DOC = JSON.stringify({ issuer: 'https://example.test/api/auth', scopes_supported: ['read', 'write', 'spend'] });

/** Stands in for Better Auth: counts calls and records the method, URL and headers it was asked with. */
function fakeAuth(extra: Record<string, string> = {}, opts: { status?: number; contentType?: string; delayMs?: number } = {}) {
  const calls: string[] = [];
  const requests: Request[] = [];
  const fill = async (request: Request) => {
    calls.push(request.method);
    requests.push(request);
    if (opts.delayMs) await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
    const path = new URL(request.url).pathname;
    if (path.startsWith('/.well-known/nope')) return new Response('nope', { status: 404 });
    return new Response(DOC, {
      status: opts.status ?? 200,
      headers: { 'Content-Type': opts.contentType ?? 'application/json', 'Cache-Control': BA_CC, ...extra },
    });
  };
  return { calls, requests, fill };
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
  assert.equal(second.headers.get('cache-control'), BA_CC);
  assert.deepEqual(auth.calls, ['GET']);
});

test('a fresh isolate reads the shared store instead of Better Auth', async () => {
  const auth = fakeAuth();
  const { store } = fakeStore();
  await createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store })(new Request(URL_PRM));
  const otherIsolate = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store });
  const res = await otherIsolate(new Request(URL_PRM));
  assert.equal(await res.text(), DOC);
  assert.equal(res.headers.get('cache-control'), BA_CC);
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

test('a new deploy never reads the previous deploy\'s stored documents', async () => {
  const auth = fakeAuth();
  const { store } = fakeStore();
  await createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store, deployVersion: () => 'deploy-1' })(new Request(URL_PRM));
  // Same deploy, new isolate: served from the store.
  await createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store, deployVersion: () => 'deploy-1' })(new Request(URL_PRM));
  assert.deepEqual(auth.calls, ['GET']);
  // Next deploy: a miss, so Better Auth answers again.
  await createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store, deployVersion: async () => 'deploy-2' })(new Request(URL_PRM));
  assert.deepEqual(auth.calls, ['GET', 'GET']);
});

test('query variants share one entry and one fill, and Better Auth gets the clean URL', async () => {
  const auth = fakeAuth();
  const { map, store } = fakeStore();
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store });
  for (let i = 0; i < 40; i++) assert.equal(await (await serve(new Request(`${URL_AS}?x=${i}`))).text(), DOC);
  assert.equal(await (await serve(new Request(URL_AS))).text(), DOC);
  assert.deepEqual(auth.calls, ['GET']);
  assert.equal(auth.requests[0].url, URL_AS);
  assert.equal(map.size, 1);
});

test('different hosts get separate entries, in the memo and in the store', async () => {
  const auth = fakeAuth();
  const { map, store } = fakeStore();
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store });
  const a = 'https://a.test/.well-known/oauth-protected-resource/mcp';
  const b = 'https://b.test/.well-known/oauth-protected-resource/mcp';
  await serve(new Request(a));
  await serve(new Request(b));
  await serve(new Request(a));
  await serve(new Request(b));
  assert.deepEqual(auth.requests.map((r) => r.url), [a, b]);
  assert.equal(map.size, 2);
  // A fresh isolate reads each host's own stored entry.
  const other = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store });
  await other(new Request(a));
  await other(new Request(b));
  assert.equal(auth.calls.length, 2);
});

test('caller headers never reach Better Auth and never change the output', async () => {
  const auth = fakeAuth();
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store: fakeStore().store });
  const first = await serve(new Request(URL_AS, { headers: { Origin: 'https://evil.test', Cookie: 'session=abc', Authorization: 'Bearer x' } }));
  const second = await serve(new Request(URL_AS, { headers: { Origin: 'https://other.test' } }));
  assert.deepEqual([...auth.requests[0].headers], []);
  assert.equal(await first.text(), await second.text());
  assert.deepEqual([...first.headers].sort(), [...second.headers].sort());
});

test('only content-type and Better Auth\'s cache-control are replayed, never set-cookie, vary or CORS', async () => {
  const auth = fakeAuth({
    'Set-Cookie': 'a=b',
    Vary: 'Origin',
    'Access-Control-Allow-Origin': 'https://evil.test',
    Age: '5',
    Date: 'Wed, 21 Oct 2026 00:00:00 GMT',
    'CF-Cache-Status': 'HIT',
  });
  const { map, store } = fakeStore();
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store });
  const miss = await serve(new Request(URL_AS));
  const memoHit = await serve(new Request(URL_AS));
  const storeHit = await createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store })(new Request(URL_AS));
  for (const res of [miss, memoHit, storeHit]) {
    assert.deepEqual([...res.headers.keys()].sort(), ['cache-control', 'content-type']);
    assert.equal(res.headers.get('cache-control'), BA_CC);
  }
  const stored = [...map.values()][0];
  for (const name of ['set-cookie', 'vary', 'access-control-allow-origin', 'age', 'date', 'cf-cache-status']) {
    assert.equal(stored.headers.get(name), null, name);
  }
  assert.deepEqual(auth.calls, ['GET']);
});

test('concurrent misses make one fill', async () => {
  const auth = fakeAuth({}, { delayMs: 20 });
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store: fakeStore().store });
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => serve(new Request(URL_AS))));
  for (const res of results) assert.equal(await res.text(), DOC);
  assert.deepEqual(auth.calls, ['GET']);
});

test('a failed fill clears the in-flight slot, so the next request tries again', async () => {
  let fail = true;
  let calls = 0;
  const serve = createDiscoveryHandler({
    isEnabled: () => true,
    fill: async () => {
      calls++;
      if (fail) throw new Error('auth down');
      return new Response(DOC, { headers: { 'Content-Type': 'application/json' } });
    },
  });
  await assert.rejects(serve(new Request(URL_AS)), /auth down/);
  fail = false;
  assert.equal(await (await serve(new Request(URL_AS))).text(), DOC);
  assert.equal(calls, 2);
});

test('a 200 non-JSON and a 500 JSON answer are passed through and never stored', async () => {
  for (const opts of [{ status: 200, contentType: 'text/html' }, { status: 500, contentType: 'application/json' }]) {
    const auth = fakeAuth({}, opts);
    const { map, store } = fakeStore();
    const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store });
    assert.equal((await serve(new Request(URL_AS))).status, opts.status);
    assert.equal((await serve(new Request(URL_AS, { method: 'HEAD' }))).status, opts.status);
    assert.equal(map.size, 0);
    assert.equal(auth.calls.length, 2);
  }
});

test('store-only expiry: a new isolate past the TTL asks Better Auth again', async () => {
  const auth = fakeAuth();
  let now = 5_000_000;
  const { store } = fakeStore();
  await createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store, now: () => now })(new Request(URL_AS));
  now += DISCOVERY_TTL_MS - 1;
  const young = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store, now: () => now });
  await young(new Request(URL_AS));
  assert.equal(auth.calls.length, 1);
  now += 2;
  const old = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store, now: () => now });
  await old(new Request(URL_AS));
  assert.equal(auth.calls.length, 2);
});

test('an unknown deploy version means no store reads or writes, memo only', async () => {
  const auth = fakeAuth();
  let touched = 0;
  const store: DiscoveryStore = {
    async match() {
      touched++;
      return undefined;
    },
    async put() {
      touched++;
    },
  };
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store, deployVersion: () => undefined });
  assert.equal(await (await serve(new Request(URL_AS))).text(), DOC);
  assert.equal(await (await serve(new Request(URL_AS))).text(), DOC);
  assert.equal(touched, 0);
  assert.deepEqual(auth.calls, ['GET']);
});

test('the store write goes through waitUntil when there is one, and is awaited when there is not', async () => {
  const auth = fakeAuth();
  const { map, store } = fakeStore();
  const scheduled: Promise<unknown>[] = [];
  const serve = createDiscoveryHandler({
    isEnabled: () => true,
    fill: auth.fill,
    store,
    waitUntil: async (p) => {
      scheduled.push(p);
      return true;
    },
  });
  await serve(new Request(URL_AS));
  assert.equal(scheduled.length, 1);
  await Promise.all(scheduled);
  assert.equal(map.size, 1);

  const noCtx = fakeStore();
  const awaited = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store: noCtx.store, waitUntil: async () => false });
  await awaited(new Request(URL_AS));
  assert.equal(noCtx.map.size, 1);
});

test('the memo is a true LRU: a hot entry survives a flood of other URLs', async () => {
  const auth = fakeAuth();
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill });
  await serve(new Request(URL_AS));
  for (let i = 0; i < 40; i++) {
    await serve(new Request(`https://h${i}.test/.well-known/oauth-authorization-server/api/auth`));
    await serve(new Request(URL_AS));
  }
  assert.equal(auth.requests.filter((r) => r.url === URL_AS).length, 1);
});
