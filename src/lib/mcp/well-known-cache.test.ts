import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createDiscoveryHandler,
  DISCOVERY_TTL_MS,
  type DiscoveryStore,
} from './well-known-cache';

const URL_AS = 'https://example.test/.well-known/oauth-authorization-server/api/auth';
const URL_PRM = 'https://example.test/.well-known/oauth-protected-resource/mcp';
const DEPLOY = () => 'test-deploy';
const BA_CC = 'public, max-age=15, stale-while-revalidate=15, stale-if-error=86400';
const DOC = JSON.stringify({ issuer: 'https://example.test/api/auth', scopes_supported: ['read', 'write', 'spend'] });

/** Stands in for Better Auth: counts calls and records the method, URL and headers it was asked with. */
function fakeAuth(extra: Record<string, string> = {}, opts: { status?: number; contentType?: string } = {}) {
  const calls: string[] = [];
  const requests: Request[] = [];
  const fill = async (request: Request) => {
    calls.push(request.method);
    requests.push(request);
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
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store: fakeStore().store });
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
  await createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store })(new Request(URL_PRM));
  const otherIsolate = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store });
  const res = await otherIsolate(new Request(URL_PRM));
  assert.equal(await res.text(), DOC);
  assert.equal(res.headers.get('cache-control'), BA_CC);
  assert.deepEqual(auth.calls, ['GET']);
});

test('MCP off answers 404 even after a cached hit, in the memo and in the store', async () => {
  const auth = fakeAuth();
  const { store } = fakeStore();
  let enabled = true;
  const serve = createDiscoveryHandler({ isEnabled: () => enabled, fill: auth.fill, deployVersion: DEPLOY, store });
  assert.equal((await serve(new Request(URL_AS))).status, 200);
  assert.equal((await serve(new Request(URL_AS))).status, 200);
  enabled = false;
  assert.equal((await serve(new Request(URL_AS))).status, 404);
  assert.equal((await serve(new Request(URL_AS, { method: 'HEAD' }))).status, 404);
  const freshIsolate = createDiscoveryHandler({ isEnabled: () => false, fill: auth.fill, deployVersion: DEPLOY, store });
  assert.equal((await freshIsolate(new Request(URL_AS))).status, 404);
  assert.deepEqual(auth.calls, ['GET']);
});

test('HEAD works on a miss and on a hit: same status and headers, no body', async () => {
  const auth = fakeAuth();
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store: fakeStore().store });
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
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store: fakeStore().store });
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
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store, now: () => now });
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
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store: broken });
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
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store });
  for (let i = 0; i < 40; i++) assert.equal(await (await serve(new Request(`${URL_AS}?x=${i}`))).text(), DOC);
  assert.equal(await (await serve(new Request(URL_AS))).text(), DOC);
  assert.deepEqual(auth.calls, ['GET']);
  assert.equal(auth.requests[0].url, URL_AS);
  assert.equal(map.size, 1);
});

test('different hosts get separate entries, in the memo and in the store', async () => {
  const auth = fakeAuth();
  const { map, store } = fakeStore();
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store });
  const a = 'https://a.test/.well-known/oauth-protected-resource/mcp';
  const b = 'https://b.test/.well-known/oauth-protected-resource/mcp';
  await serve(new Request(a));
  await serve(new Request(b));
  await serve(new Request(a));
  await serve(new Request(b));
  assert.deepEqual(auth.requests.map((r) => r.url), [a, b]);
  assert.equal(map.size, 2);
  // A fresh isolate reads each host's own stored entry.
  const other = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store });
  await other(new Request(a));
  await other(new Request(b));
  assert.equal(auth.calls.length, 2);
});

test('caller headers never reach Better Auth and never change the output', async () => {
  const auth = fakeAuth();
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store: fakeStore().store });
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
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store });
  const miss = await serve(new Request(URL_AS));
  const memoHit = await serve(new Request(URL_AS));
  const storeHit = await createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store })(new Request(URL_AS));
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

test('a failed fill rejects, and the next request tries again', async () => {
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
    const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store });
    assert.equal((await serve(new Request(URL_AS))).status, opts.status);
    assert.equal((await serve(new Request(URL_AS, { method: 'HEAD' }))).status, opts.status);
    assert.equal(map.size, 0);
    assert.equal(auth.calls.length, 2);
  }
});

test('HEAD passthrough cancels the upstream body and keeps its status and headers', async () => {
  for (const opts of [{ status: 200, contentType: 'text/html' }, { status: 500, contentType: 'application/json' }]) {
    let cancelled = false;
    const serve = createDiscoveryHandler({
      isEnabled: () => true,
      fill: async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.enqueue(new TextEncoder().encode('body'));
            },
            cancel() {
              cancelled = true;
            },
          }),
          { status: opts.status, headers: { 'Content-Type': opts.contentType, 'X-Upstream': 'kept' } },
        ),
      store: fakeStore().store,
      deployVersion: DEPLOY,
    });
    const res = await serve(new Request(URL_AS, { method: 'HEAD' }));
    assert.equal(res.status, opts.status);
    assert.equal(res.headers.get('content-type'), opts.contentType);
    assert.equal(res.headers.get('x-upstream'), 'kept');
    assert.equal(await res.text(), '');
    assert.equal(cancelled, true, `${opts.status} ${opts.contentType}`);
  }
});

test('parallel cold requests each fill for themselves and all get the document', async () => {
  // No sharing between requests is deliberate: a promise shared across requests never settles when its
  // owner disconnects, and every waiter hung behind it. N cold requests must make N fills.
  const N = 8;
  const auth = fakeAuth();
  const serve = createDiscoveryHandler({
    isEnabled: () => true,
    fill: async (request) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return auth.fill(request);
    },
    store: fakeStore().store,
    deployVersion: DEPLOY,
  });
  const responses = await Promise.all(Array.from({ length: N }, () => serve(new Request(URL_AS))));
  assert.equal(auth.calls.length, N);
  for (const res of responses) {
    assert.equal(res.status, 200);
    assert.equal(await res.text(), DOC);
  }
});

test('an entry stamped in the future is a miss and gets refilled, in the memo and in the store', async () => {
  // Store: stamp a stored entry far ahead of the clock.
  const auth = fakeAuth();
  const { map, store } = fakeStore();
  const now = 10_000_000;
  await createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store, now: () => now })(new Request(URL_AS));
  for (const [url, res] of map) {
    const headers = new Headers(res.headers);
    headers.set('x-ua-discovery-at', String(now + 30 * DISCOVERY_TTL_MS));
    map.set(url, new Response(await res.text(), { status: 200, headers }));
  }
  await createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store, now: () => now })(new Request(URL_AS));
  assert.equal(auth.calls.length, 2);

  // Memo: the clock jumps back, so the memo entry is now ahead of it. Within one minute of skew it still hits.
  const memoAuth = fakeAuth();
  let clock = 50_000_000;
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: memoAuth.fill, now: () => clock });
  await serve(new Request(URL_AS));
  clock -= 60_000;
  await serve(new Request(URL_AS));
  assert.equal(memoAuth.calls.length, 1);
  clock -= 1;
  await serve(new Request(URL_AS));
  assert.equal(memoAuth.calls.length, 2);
});

test('a deployVersion that rejects means memo only, store untouched, logged once', async () => {
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
  const serve = createDiscoveryHandler({
    isEnabled: () => true,
    fill: auth.fill,
    store,
    deployVersion: async () => {
      throw new Error('version lookup down');
    },
  });
  const logged: unknown[][] = [];
  const log = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    assert.equal(await (await serve(new Request(URL_AS))).text(), DOC);
  } finally {
    console.error = log;
  }
  assert.equal(logged.length, 1);
  assert.match(String(logged[0][1]), /version lookup down/);
  assert.equal(touched, 0);
  // The memo still works.
  assert.equal(await (await serve(new Request(URL_AS))).text(), DOC);
  assert.deepEqual(auth.calls, ['GET']);
});

test('store-only expiry: a new isolate past the TTL asks Better Auth again', async () => {
  const auth = fakeAuth();
  let now = 5_000_000;
  const { store } = fakeStore();
  await createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store, now: () => now })(new Request(URL_AS));
  now += DISCOVERY_TTL_MS - 1;
  const young = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store, now: () => now });
  await young(new Request(URL_AS));
  assert.equal(auth.calls.length, 1);
  now += 2;
  const old = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store, now: () => now });
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

  // No deployVersion dep at all is the same: memo only.
  const noDep = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store });
  assert.equal(await (await noDep(new Request(URL_PRM))).text(), DOC);
  assert.equal(touched, 0);
});

test('the store write goes through waitUntil when there is one, and is awaited when there is not', async () => {
  const auth = fakeAuth();
  const { map, store } = fakeStore();
  const scheduled: Promise<unknown>[] = [];
  const serve = createDiscoveryHandler({
    isEnabled: () => true,
    fill: auth.fill,
    deployVersion: DEPLOY,
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
  const awaited = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, deployVersion: DEPLOY, store: noCtx.store, waitUntil: async () => false });
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

test('a fill that never settles for request A does not block request B', async () => {
  let calls = 0;
  const serve = createDiscoveryHandler({
    isEnabled: () => true,
    fill: () => {
      calls++;
      if (calls === 1) return new Promise<Response>(() => {});
      return Promise.resolve(new Response(DOC, { headers: { 'Content-Type': 'application/json' } }));
    },
    store: fakeStore().store,
    deployVersion: DEPLOY,
  });
  void serve(new Request(URL_AS)); // A: its client is gone, its fill never settles.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('request B hung behind request A')), 1000);
  });
  try {
    const res = await Promise.race([serve(new Request(URL_AS)), timeout]);
    assert.equal(await res.text(), DOC);
  } finally {
    clearTimeout(timer);
  }
  assert.equal(calls, 2);
});

test('the fill sees only cf-connecting-ip from the caller, never Cookie, Origin or Authorization', async () => {
  const auth = fakeAuth();
  const serve = createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store: fakeStore().store, deployVersion: DEPLOY });
  await serve(
    new Request(URL_AS, {
      headers: { 'cf-connecting-ip': '203.0.113.7', Cookie: 'session=abc', Origin: 'https://evil.test', Authorization: 'Bearer x' },
    }),
  );
  assert.deepEqual([...auth.requests[0].headers], [['cf-connecting-ip', '203.0.113.7']]);
});

test('a store write that never resolves does not delay the response when waitUntil is given', async () => {
  const auth = fakeAuth();
  const store: DiscoveryStore = {
    async match() {
      return undefined;
    },
    put: () => new Promise<void>(() => {}),
  };
  const serve = createDiscoveryHandler({
    isEnabled: () => true,
    fill: auth.fill,
    store,
    deployVersion: DEPLOY,
    waitUntil: async () => true,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('response waited for the store write')), 1000);
  });
  try {
    const res = await Promise.race([serve(new Request(URL_AS)), timeout]);
    assert.equal(await res.text(), DOC);
  } finally {
    clearTimeout(timer);
  }
});

test('a stored entry with a missing or garbage filled-at header is a miss, and the fresh document is served', async () => {
  for (const damage of ['missing', 'garbage'] as const) {
    const auth = fakeAuth();
    const { map, store } = fakeStore();
    await createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store, deployVersion: DEPLOY })(new Request(URL_AS));
    for (const [url, res] of map) {
      const headers = new Headers(res.headers);
      if (damage === 'missing') headers.delete('x-ua-discovery-at');
      else headers.set('x-ua-discovery-at', 'not-a-number');
      map.set(url, new Response(await res.text(), { status: 200, headers }));
    }
    const res = await createDiscoveryHandler({ isEnabled: () => true, fill: auth.fill, store, deployVersion: DEPLOY })(new Request(URL_AS));
    assert.equal(await res.text(), DOC, damage);
    assert.equal(auth.calls.length, 2, damage);
  }
});
