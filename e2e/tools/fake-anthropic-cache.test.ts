/**
 * The fake's prompt cache only keeps entries a successful request wrote. The real API writes an entry when a
 * response starts, so a request the fake refuses (a scripted failure, or its own scripted JSON not matching the
 * request's output schema) must leave nothing behind: a later request would otherwise read a cache entry that
 * production never has, and an E2E cache assertion would pass for the wrong reason.
 *
 *   npx --yes tsx --test e2e/tools/fake-anthropic-cache.test.ts
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';

import { buildHaikuRequest } from '@/lib/models/haiku';
import { resolveHaikuEffort } from '@/lib/models/haiku-effort';
import { buildTrackerMessages, TRACKER_ANSWER_SCHEMA, TRACKER_SYSTEM_PROMPT } from '@/lib/agents/prompts/tracker-prompt';
import { buildScreeningCall } from '@/lib/services/screening';

const PORT = 18_950 + Math.floor(Math.random() * 1_000);
const URL_BASE = `http://127.0.0.1:${PORT}`;
const CONTEXT = { requestExecutionId: 'r', route: '/test', feature: 'test', operation: 'fake_cache' };

interface Call { kind: string; writer: string; status: number; usage: { cacheRead: number; cacheCreation: number } | null }

async function startFake(): Promise<ChildProcess> {
  const child = spawn('npx', ['tsx', join(__dirname, '..', 'fake-anthropic.ts'), String(PORT)], { stdio: 'ignore' });
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`${URL_BASE}/__health`)).ok) return child;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error('the fake did not start');
}

async function send(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${URL_BASE}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer e2e-stub-key' },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() as Record<string, unknown> };
}

async function calls(): Promise<Call[]> {
  return (await (await fetch(`${URL_BASE}/__calls`)).json() as Call[]).filter((call) => call.kind === 'messages');
}

/** A tracker request with a long APPLICATIONS block, so its marked prefix is over the 512-token minimum. */
function trackerBody(schema: Record<string, unknown>) {
  const applications = Array.from({ length: 40 }, (_, i) => `id=${i} company=<<Company ${i} GmbH>> role=<<Controller ${i}>> status=applied`).join('\n');
  return buildHaikuRequest({
    site: 'tracker',
    system: { static: TRACKER_SYSTEM_PROMPT },
    messages: buildTrackerMessages({ applications, today: 'Thursday 22 October 2026 at 10:00 (times are UTC)', message: 'Company 3 moved to interview' }),
    jsonSchema: schema,
    maxTokens: 4000,
    generationContext: CONTEXT,
  }, resolveHaikuEffort('tracker'));
}

test('a request the fake fails leaves no cache entry; a successful one does', async (t) => {
  const fake = await startFake();
  t.after(() => { fake.kill(); });

  await t.test('the scripted reply does not match the output schema: 500, and the next request reads nothing', async () => {
    await fetch(`${URL_BASE}/__reset`);
    // A schema the scripted tracker answer can't satisfy: one more required field.
    const mismatched = {
      ...TRACKER_ANSWER_SCHEMA,
      required: [...TRACKER_ANSWER_SCHEMA.required, 'extra'],
      properties: { ...TRACKER_ANSWER_SCHEMA.properties, extra: { type: 'string' } },
    };
    const first = await send(trackerBody(mismatched));
    assert.equal(first.status, 500);
    assert.match(JSON.stringify(first.json), /does not match the request's output schema/);
    const second = await send(trackerBody(mismatched));
    assert.equal(second.status, 500);
    const [one, two] = await calls();
    assert.ok((one.usage?.cacheCreation ?? 0) > 0, 'the prefix is long enough to cache');
    assert.equal(two.usage?.cacheRead, 0, 'the failed first request wrote no entry');

    // The same request with the real schema: the first writes, the second reads.
    const ok = await send(trackerBody(TRACKER_ANSWER_SCHEMA as unknown as Record<string, unknown>));
    assert.equal(ok.status, 200);
    assert.equal((ok.json.usage as { cache_read_input_tokens: number }).cache_read_input_tokens, 0);
    const again = await send(trackerBody(TRACKER_ANSWER_SCHEMA as unknown as Record<string, unknown>));
    assert.ok((again.json.usage as { cache_read_input_tokens: number }).cache_read_input_tokens > 0, 'a successful request writes its entry');
  });

  await t.test('a scripted model failure (FAKE-AI-FAIL): 500, and the next request reads nothing', async () => {
    await fetch(`${URL_BASE}/__reset`);
    const body = (question: string) => {
      const call = buildScreeningCall({ message: question, history: [{ role: 'user', content: question }], context: { primaryCV: 'Ada Lovelace\nNotice period: 3 months' } });
      return buildHaikuRequest({ ...call, generationContext: CONTEXT }, resolveHaikuEffort('screening'));
    };
    assert.equal((await send(body('Why this role? FAKE-AI-FAIL'))).status, 500);
    // The same cached prefix (static rules, applicant block): a write by the failed request would be read here.
    const ok = await send(body('Why this role?'));
    assert.equal(ok.status, 200);
    assert.equal((ok.json.usage as { cache_read_input_tokens: number }).cache_read_input_tokens, 0, 'the failed request wrote no entry');
    assert.ok((ok.json.usage as { cache_creation_input_tokens: number }).cache_creation_input_tokens > 0, 'the prefix is long enough to cache');
    const again = await send(body('What is your notice period?'));
    assert.ok((again.json.usage as { cache_read_input_tokens: number }).cache_read_input_tokens > 0, 'a successful request writes its entry');
    assert.deepEqual((await calls()).map((call) => call.status), [500, 200, 200]);
  });
});
