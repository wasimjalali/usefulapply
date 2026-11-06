/**
 * Queued job feed runs and the feed row of a queued kit (spec j).
 *
 *   npx tsx e2e/tools/feed-scenarios.ts [outFile]
 *
 * Real code, real local D1 (a fresh migrated one in a temp dir). The Cloudflare Queue is simulated
 * at its edge exactly as in scenarios.ts (a producer that records messages, a consumer batch with
 * ack / retry / attempts). Everything behind that edge is production code: the run_job_feed tool,
 * the producer, the consumer, the workflow and its claim, the kit runner.
 *
 * Nothing leaves the machine:
 *   - SerpAPI: `fetch` is wrapped. A request to serpapi.com is answered from a stub (a few jobs, or a
 *     500 when a scenario asks for one) and counted. SERPAPI_API_KEY is set to a dummy value only so
 *     the provider code builds its request. Any other outside request fails the run.
 *   - The ranker: it calls Claude Haiku 5.5 (rankWithHaiku), which is the scripted fake model's
 *     ranking writer on FAKE_ANTHROPIC_PORT. If the fake fails, ranking falls back to the
 *     deterministic order. Users here have no CV, so no career profile or search strategy is
 *     synthesized and the legacy planner (target roles x countries) builds the queries.
 *   - The kit writer is the same scripted fake model, as in scenarios.ts.
 *
 * Prints `__RESULT__{...report}`; exits non-zero if any scenario failed.
 */

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { FAKE_ANTHROPIC_URL } from '../lib/env';
import { fakeCalls, fakeReset } from '../lib/fake-control';
import { JOB_DESCRIPTION, PRIMARY_CV } from '../lib/model-script';
import { freshStateDir, openPlatform, pointModelAtFake } from '../lib/platform';

pointModelAtFake();
process.env.SERPAPI_API_KEY = 'e2e-stub-serpapi-key';

interface Scenario {
  name: string;
  passed: boolean;
  observed: Record<string, unknown>;
  error?: string;
}

const report: { startedAt: string; scenarios: Scenario[] } = { startedAt: new Date().toISOString(), scenarios: [] };

// ---------------------------------------------------------------------------
// Network edge: SerpAPI stub, and a tripwire for anything else leaving the machine
// ---------------------------------------------------------------------------

const serp = { calls: 0, mode: 'ok' as 'ok' | 'error' | 'burst' | 'quota' };
const strayRequests: string[] = [];
const realFetch = globalThis.fetch;

const STUB_JOBS = [1, 2, 3].map((n) => ({
  job_id: `stub-job-${n}`,
  title: `Data Analyst ${n}`,
  company_name: `Stub Company ${n}`,
  location: 'Berlin, Germany',
  via: 'via Stub Board',
  share_link: `https://example.test/jobs/${n}`,
  description: `Stub posting ${n}. We need an analyst who writes SQL and builds dashboards for the finance team.`,
  detected_extensions: { posted_at: '2 days ago', schedule_type: 'Full-time' },
  apply_options: [{ title: 'Stub Board', link: `https://example.test/apply/${n}` }],
}));

globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  const host = new URL(url).hostname;
  if (host === 'serpapi.com') {
    serp.calls += 1;
    if (serp.mode === 'error') return new Response(JSON.stringify({ error: 'stub provider down' }), { status: 500 });
    // SerpApi sends 429 for a burst and for an account with no searches left; only the body differs (seen live on 2026-11-05).
    if (serp.mode === 'burst') return new Response(JSON.stringify({ error: 'Too many requests.' }), { status: 429 });
    if (serp.mode === 'quota') return new Response(JSON.stringify({ error: 'Your account has run out of searches.' }), { status: 429 });
    return new Response(JSON.stringify({ jobs_results: STUB_JOBS }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (host !== '127.0.0.1' && host !== 'localhost') strayRequests.push(url);
  return realFetch(input, init);
}) as typeof fetch;

const loudErrors: string[] = [];
const realConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  loudErrors.push(args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' '));
  realConsoleError(...args);
};

type Row = Record<string, unknown>;

async function main(): Promise<void> {
  const platform = await openPlatform(freshStateDir());
  const runners = await import('../../src/lib/services/generation-runner');
  const ops = await import('../../src/lib/services/operations');
  const sessionsRepo = await import('../../src/db/repos/sessions');
  const feedServer = await import('../../src/lib/job-feed/server');
  const feedRun = await import('../../src/lib/services/feed/run');
  const { feedTools } = await import('../../src/lib/mcp/tools/feed');
  const runJobFeed = feedTools.find((tool) => tool.name === 'run_job_feed');
  assert.ok(runJobFeed, 'run_job_feed is registered');

  const all = async (query: string, ...bindings: unknown[]): Promise<Row[]> => {
    const result = await platform.db.prepare(query).bind(...bindings).all();
    return (result as unknown as { results: Row[] }).results;
  };
  const one = async (query: string, ...bindings: unknown[]) => (await all(query, ...bindings))[0];
  const run = (query: string, ...bindings: unknown[]) => platform.db.prepare(query).bind(...bindings).run();

  async function seedUser(label: string, options: { cv: boolean; sessions?: number; feed?: boolean }) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await run('INSERT INTO profiles (id, email, job_searches_reset_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', id, `${label}@test.local`, now, now, now);
    await run(
      'INSERT INTO user_credits (id, user_id, monthly_credits, rollover_credits, addon_credits, plan_tier, version, created_at, updated_at) VALUES (?, ?, 4, 0, 6, ?, 0, ?, ?)',
      crypto.randomUUID(), id, 'free', now, now,
    );
    if (options.cv) {
      await run(
        `INSERT INTO documents (id, user_id, type, file_name, file_type, raw_text, sections, all_skills, all_experiences, all_education, created_at, updated_at)
         VALUES (?, ?, 'primary_cv', 'cv.txt', 'txt', ?, '{}', '[]', '[]', '[]', ?, ?)`,
        crypto.randomUUID(), id, PRIMARY_CV, now, now,
      );
    }
    const sessionIds: string[] = [];
    for (let i = 0; i < (options.sessions ?? 0); i++) {
      const created = await sessionsRepo.createSession(id, `${JOB_DESCRIPTION} (posting ${i + 1})`);
      assert.ok(created.session);
      sessionIds.push(created.session.id);
    }
    // Feed users: consented, enabled settings, as the web gives a free account that starts the feed.
    if (options.feed) await feedServer.getOrProvisionFreeJobFeedSettingsAdmin(id, ['Data Analyst'], { consentAccepted: true });
    return { id, sessionIds };
  }

  const runsOf = (userId: string) => all('SELECT id, status, trigger_source, started_at, completed_at, error_message, raw_jobs_fetched, ranked_jobs_count FROM job_feed_runs WHERE user_id = ? ORDER BY rowid', userId);
  const feedMessages = (runId?: string) => platform.queue.messages.filter((message) => message.kind === 'job_feed_run' && (!runId || message.runId === runId));

  async function callRunJobFeed(userId: string) {
    const started = Date.now();
    const result = await runJobFeed!.run({}, { userId, clientId: 'e2e', scopes: [] });
    const elapsedMs = Date.now() - started;
    const structured = runJobFeed!.output.parse(result.structured) as Record<string, unknown>;
    return { structured, elapsedMs };
  }

  interface Delivery { acked: boolean; retried: { delaySeconds?: number } | null }
  async function deliver(body: unknown, attempts = 1, queue: string = runners.AGENT_QUEUE_NAME): Promise<Delivery> {
    const outcome: Delivery = { acked: false, retried: null };
    await runners.handleAgentQueueBatch({
      queue,
      messages: [{
        body,
        attempts,
        ack: () => { outcome.acked = true; },
        retry: (options) => { outcome.retried = options ?? {}; },
      }],
    });
    return outcome;
  }

  const feedBody = (userId: string, runId: string) => ({ kind: 'job_feed_run', userId, runId });

  const scenario = async (name: string, body: () => Promise<Record<string, unknown>>) => {
    const observed: Record<string, unknown> = {};
    try {
      serp.mode = 'ok';
      Object.assign(observed, await body());
      report.scenarios.push({ name, passed: true, observed });
      console.log(`PASS  ${name}`);
    } catch (error) {
      report.scenarios.push({ name, passed: false, observed, error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error) });
      console.log(`FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // =========================================================================
  // j1 to j9: run_job_feed returns at once, the queue consumer runs the feed
  // =========================================================================

  let callsPerRun = 0;

  await scenario('j1. run_job_feed queues today\'s run and returns at once: no SerpAPI call, one queued row, one message', async () => {
    const user = await seedUser('j1', { cv: false, feed: true });
    const callsBefore = serp.calls;
    const { structured, elapsedMs } = await callRunJobFeed(user.id);
    assert.equal(structured.status, 'queued');
    assert.equal(structured.started, true);
    assert.equal(structured.alreadyRanToday, false);
    assert.equal(structured.failed, false);
    assert.equal(structured.rankedJobsCount, null, 'no result numbers before the run has run');
    assert.ok(elapsedMs < 2000, `returned in ${elapsedMs} ms`);
    assert.equal(serp.calls, callsBefore, 'the tool call ran no search');
    const rows = await runsOf(user.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'queued');
    assert.equal(rows[0].id, structured.runId);
    assert.equal(rows[0].started_at, null, 'nothing has claimed it');
    const messages = feedMessages();
    assert.equal(messages.filter((message) => message.userId === user.id).length, 1);
    assert.deepEqual(feedMessages(String(structured.runId))[0], { kind: 'job_feed_run', userId: user.id, runId: structured.runId });
    return { elapsedMs, runId: structured.runId, tool: structured };
  });

  await scenario('j2. a second call before the run starts finds the same queued run: still one row, started false', async () => {
    const user = await seedUser('j2', { cv: false, feed: true });
    const first = await callRunJobFeed(user.id);
    const second = await callRunJobFeed(user.id);
    assert.equal(second.structured.runId, first.structured.runId);
    assert.equal(second.structured.status, 'queued');
    assert.equal(second.structured.started, false, 'the second call did not put anything on the queue');
    assert.equal((await runsOf(user.id)).length, 1, 'one run per day');
    // The message is sent again (it may have been lost); a claim makes that harmless (j4).
    assert.equal(feedMessages(String(first.structured.runId)).length, 2);
    return { runId: first.structured.runId, messages: feedMessages(String(first.structured.runId)).length };
  });

  await scenario('j3. the consumer claims the run and runs the feed once; a duplicate delivery is acked and runs nothing', async () => {
    const user = await seedUser('j3', { cv: false, feed: true });
    const { structured } = await callRunJobFeed(user.id);
    const runId = String(structured.runId);
    const callsBefore = serp.calls;
    const first = await deliver(feedBody(user.id, runId));
    assert.deepEqual({ acked: first.acked, retried: first.retried }, { acked: true, retried: null });
    callsPerRun = serp.calls - callsBefore;
    assert.ok(callsPerRun > 0, 'the run searched');
    const [done] = await runsOf(user.id);
    assert.equal(done.status, 'completed');
    assert.equal(done.trigger_source, 'manual_user');
    assert.ok(done.started_at && done.completed_at);
    assert.ok(Number(done.ranked_jobs_count) > 0, 'ranked items were stored');
    const startedAt = done.started_at;
    const callsAfterRun = serp.calls;

    const duplicate = await deliver(feedBody(user.id, runId));
    assert.deepEqual({ acked: duplicate.acked, retried: duplicate.retried }, { acked: true, retried: null });
    assert.equal(serp.calls, callsAfterRun, 'a duplicate delivery ran no search');
    const [after] = await runsOf(user.id);
    assert.equal(after.started_at, startedAt, 'the run was not claimed again');
    assert.equal(after.status, 'completed');

    // The result is what get_job_feed reads.
    const feed = await one('SELECT COUNT(*) AS n FROM job_feed_ranked_items WHERE run_id = ?', runId);
    assert.ok(Number(feed.n) > 0);
    return { searches: callsPerRun, ranked: done.ranked_jobs_count, rankedRows: feed.n };
  });

  await scenario('j4. two deliveries of one message at the same moment run the feed once', async () => {
    const user = await seedUser('j4', { cv: false, feed: true });
    const { structured } = await callRunJobFeed(user.id);
    const body = feedBody(user.id, String(structured.runId));
    const callsBefore = serp.calls;
    const [a, b] = await Promise.all([deliver(body), deliver(body)]);
    assert.ok(a.acked && b.acked && !a.retried && !b.retried, 'both acked, neither retried');
    assert.equal(serp.calls - callsBefore, callsPerRun, 'exactly one run\'s worth of searches');
    const rows = await runsOf(user.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'completed');
    return { searches: serp.calls - callsBefore, perRun: callsPerRun };
  });

  await scenario('j5. messages of an unknown shape are acked with no effect', async () => {
    const user = await seedUser('j5', { cv: false, feed: true });
    const { structured } = await callRunJobFeed(user.id);
    const runId = String(structured.runId);
    const callsBefore = serp.calls;
    const bodies: unknown[] = [
      null,
      'job_feed_run',
      [],
      {},
      { kind: 'job_feed_run' },
      { kind: 'job_feed_run', userId: user.id },
      { kind: 'job_feed_run', userId: user.id, runId, extra: true },
      { kind: 'job_feed_run', userId: 7, runId },
      { kind: 'job_feed_run', userId: user.id, runId: 'x'.repeat(101) },
      { kind: 'job_feed_runs', userId: user.id, runId },
      { kind: 'something_else', operationId: crypto.randomUUID() },
      { type: 'job_feed_run', userId: user.id, runId },
    ];
    const outcomes: Array<{ acked: boolean; retried: boolean }> = [];
    for (const body of bodies) {
      const delivery = await deliver(body);
      outcomes.push({ acked: delivery.acked, retried: delivery.retried !== null });
    }
    assert.ok(outcomes.every((outcome) => outcome.acked && !outcome.retried), JSON.stringify(outcomes));
    assert.equal(serp.calls, callsBefore, 'no search ran');
    const rows = await runsOf(user.id);
    assert.equal(rows[0].status, 'queued', 'the queued run was not touched');
    assert.equal(rows[0].started_at, null);
    return { bodies: bodies.length };
  });

  await scenario('j6. a run that fails after the claim is marked failed and acked, never run again; the next call queues a fresh attempt', async () => {
    const user = await seedUser('j6', { cv: false, feed: true });
    const { structured } = await callRunJobFeed(user.id);
    const runId = String(structured.runId);
    serp.mode = 'error';
    const callsBefore = serp.calls;
    const first = await deliver(feedBody(user.id, runId));
    assert.deepEqual({ acked: first.acked, retried: first.retried }, { acked: true, retried: null }, 'a claimed run is not retried');
    const [failed] = await runsOf(user.id);
    assert.equal(failed.status, 'failed');
    assert.ok(failed.error_message);
    const failedCalls = serp.calls - callsBefore;
    assert.ok(failedCalls > 0);

    const redelivery = await deliver(feedBody(user.id, runId));
    assert.ok(redelivery.acked && !redelivery.retried);
    assert.equal(serp.calls - callsBefore, failedCalls, 'the redelivery did not run the feed again');

    // A new request retries the failed day: same row, back on the queue.
    serp.mode = 'ok';
    const again = await callRunJobFeed(user.id);
    assert.equal(again.structured.runId, runId, 'the same run row');
    assert.equal(again.structured.status, 'queued');
    assert.equal(again.structured.started, true);
    assert.equal((await runsOf(user.id)).length, 1);
    const retry = await deliver(feedBody(user.id, runId));
    assert.ok(retry.acked);
    const [recovered] = await runsOf(user.id);
    assert.equal(recovered.status, 'completed');
    assert.equal(recovered.error_message, null);
    return { failedCalls, finalStatus: recovered.status };
  });

  await scenario('j6b. no SerpApi searches left: the run fails within seconds with that reason, and run_job_feed says so instead of a bare "queued"', async () => {
    // The live bug of 2026-11-05: SerpApi answered every search with 429 "run out of searches". Each run failed
    // in seconds as "rate limited", each run_job_feed call put it back on the queue and reported only "queued".
    const user = await seedUser('j6b', { cv: false, feed: true });
    const { structured } = await callRunJobFeed(user.id);
    const runId = String(structured.runId);
    assert.equal(structured.lastError, null, 'a fresh run has no last error');

    // A plain burst 429 is not read as a used-up plan.
    serp.mode = 'burst';
    assert.ok((await deliver(feedBody(user.id, runId))).acked);
    const [burst] = await runsOf(user.id);
    assert.equal(burst.status, 'failed');
    assert.equal(burst.error_message, 'All job feed provider fetches failed for this run.');
    const requeued = await feedServer.queueJobFeedRunAdmin({ userId: user.id });
    assert.equal(requeued.run.status, 'queued');
    assert.equal(requeued.retriedError, 'All job feed provider fetches failed for this run.', 'the producer reports the failure it retried');

    serp.mode = 'quota';
    const logsBefore = loudErrors.length;
    assert.ok((await deliver(feedBody(user.id, runId))).acked);
    const [quota] = await runsOf(user.id);
    assert.equal(quota.status, 'failed');
    assert.equal(quota.error_message, feedServer.JOB_SEARCH_QUOTA_EXHAUSTED_RUN_ERROR);
    const fetchErrors = await all('SELECT DISTINCT response_error FROM job_feed_raw_fetches WHERE run_id = ? AND status = ?', runId, 'failed');
    assert.ok(fetchErrors.some((row) => row.response_error === 'SerpApi account has run out of searches.'), JSON.stringify(fetchErrors));
    assert.ok(loudErrors.slice(logsBefore).some((line) => line.includes('SerpApi has no searches left')), 'the operator log names the cause');

    // What an agent sees on its next call: the run is queued again, and why the last try failed.
    const again = await callRunJobFeed(user.id);
    assert.equal(again.structured.runId, runId);
    assert.equal(again.structured.status, 'queued');
    assert.equal(again.structured.started, true);
    assert.equal(again.structured.lastError, feedServer.JOB_SEARCH_QUOTA_EXHAUSTED_RUN_ERROR);

    // Once the plan renews, the same queued run completes and the error is gone.
    serp.mode = 'ok';
    assert.ok((await deliver(feedBody(user.id, runId))).acked);
    const [recovered] = await runsOf(user.id);
    assert.equal(recovered.status, 'completed');
    assert.equal(recovered.error_message, null);
    // The tool allows two runs a minute per user, so the last look goes through the same service it calls.
    const done = await feedRun.queueFeedRun(user.id);
    assert.equal(done.status, 'completed');
    assert.equal(done.lastError, null);
    return { burstError: burst.error_message, quotaError: quota.error_message, fetchErrors, toolAfterQuota: again.structured, finalStatus: recovered.status };
  });

  await scenario('j7. a run that fails before the claim is retried, then failed on the last delivery or by the dead-letter queue', async () => {
    const user = await seedUser('j7', { cv: false, feed: true });
    const { structured } = await callRunJobFeed(user.id);
    const runId = String(structured.runId);
    // The user withdraws consent between queueing and running.
    await run('UPDATE job_feed_settings SET consent_accepted_at = NULL WHERE user_id = ?', user.id);
    const callsBefore = serp.calls;
    const first = await deliver(feedBody(user.id, runId), 1);
    assert.equal(first.acked, false);
    assert.ok(first.retried && Number(first.retried.delaySeconds) > 0, 'retried with a delay');
    assert.equal((await runsOf(user.id))[0].status, 'queued', 'still unclaimed, still queued');
    const last = await deliver(feedBody(user.id, runId), runners.QUEUE_MAX_RETRIES + 1);
    assert.ok(last.acked && !last.retried, 'the last delivery acks');
    assert.equal((await runsOf(user.id))[0].status, 'failed');
    assert.equal(serp.calls, callsBefore, 'it never searched');

    // The dead-letter queue ends an unclaimed run too, and leaves a claimed one alone.
    const other = await seedUser('j7b', { cv: false, feed: true });
    const queued = await callRunJobFeed(other.id);
    const dead = await deliver(feedBody(other.id, String(queued.structured.runId)), 1, runners.AGENT_DLQ_NAME);
    assert.ok(dead.acked);
    assert.equal((await runsOf(other.id))[0].status, 'failed');
    const done = await seedUser('j7c', { cv: false, feed: true });
    const finished = await callRunJobFeed(done.id);
    await deliver(feedBody(done.id, String(finished.structured.runId)));
    await deliver(feedBody(done.id, String(finished.structured.runId)), 1, runners.AGENT_DLQ_NAME);
    assert.equal((await runsOf(done.id))[0].status, 'completed', 'a finished run is not failed by a late dead letter');
    return { retryDelaySeconds: first.retried?.delaySeconds };
  });

  await scenario('j8. a message cannot run another user\'s run: the run is looked up under the message\'s own user', async () => {
    const owner = await seedUser('j8-owner', { cv: false, feed: true });
    const other = await seedUser('j8-other', { cv: false, feed: true });
    const { structured } = await callRunJobFeed(owner.id);
    const callsBefore = serp.calls;
    const delivery = await deliver(feedBody(other.id, String(structured.runId)));
    assert.ok(delivery.acked && !delivery.retried);
    assert.equal(serp.calls, callsBefore);
    assert.equal((await runsOf(owner.id))[0].status, 'queued');
    assert.equal((await runsOf(other.id)).length, 0);
    return { dropped: true };
  });

  await scenario('j9. once today\'s run has completed, the tool reports it and queues nothing', async () => {
    const user = await seedUser('j9', { cv: false, feed: true });
    const first = await callRunJobFeed(user.id);
    await deliver(feedBody(user.id, String(first.structured.runId)));
    const messagesBefore = platform.queue.messages.length;
    const callsBefore = serp.calls;
    const second = await callRunJobFeed(user.id);
    assert.equal(second.structured.alreadyRanToday, true);
    assert.equal(second.structured.started, false);
    assert.equal(second.structured.status, 'completed');
    assert.equal(second.structured.runId, first.structured.runId);
    assert.ok(Number(second.structured.rankedJobsCount) > 0);
    assert.equal(platform.queue.messages.length, messagesBefore, 'no message');
    assert.equal(serp.calls, callsBefore);
    assert.equal((await runsOf(user.id)).length, 1);
    return { tool: second.structured };
  });

  await scenario('j10. a queue that refuses the message leaves no run that nothing will claim', async () => {
    const user = await seedUser('j10', { cv: false, feed: true });
    platform.queue.failNext = true;
    await assert.rejects(callRunJobFeed(user.id));
    const [row] = await runsOf(user.id);
    assert.equal(row.status, 'failed', 'ended, not left queued');
    const again = await callRunJobFeed(user.id);
    assert.equal(again.structured.runId, row.id);
    assert.equal(again.structured.status, 'queued');
    assert.equal(again.structured.started, true);
    await deliver(feedBody(user.id, String(again.structured.runId)));
    assert.equal((await runsOf(user.id))[0].status, 'completed');
    return { recovered: true };
  });

  // =========================================================================
  // j11 to j14: a kit queued for a feed job finishes the feed row
  // =========================================================================

  async function feedJob(userId: string, sessionId: string, label: string) {
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();
    await run(
      'INSERT INTO job_feed_canonical_jobs (id, canonical_key, title, title_normalized, company, company_normalized, source_identifiers, created_at, updated_at, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      jobId, `e2e-${label}-${jobId}`, 'Analyst', 'analyst', 'Northwind Foods', 'northwind foods', '{}', now, now, now, now,
    );
    // The state apply_to_feed_job leaves for a kit: the row linked to the application, generation pending.
    await feedServer.recordJobFeedFeedbackAdmin({ userId, jobId, action: 'apply_started', applicationSessionId: sessionId });
    return jobId;
  }
  const feedRow = (jobId: string) => one('SELECT generation_status, generation_error, applied_at, apply_started_at, generation_completed_at, generation_failed_at, generation_cancelled_at FROM job_feed_feedback WHERE canonical_job_id = ?', jobId);

  const deliverKit = (operationId: string) => deliver({ operationId });

  await scenario('j11. a kit that succeeds marks the feed row applied and succeeded', async () => {
    const user = await seedUser('j11', { cv: true, sessions: 1 });
    const [sessionId] = user.sessionIds;
    const jobId = await feedJob(user.id, sessionId, 'j11');
    const pending = await feedRow(jobId);
    assert.equal(pending.generation_status, 'pending');
    assert.equal(pending.applied_at, null);
    await fakeReset();
    const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-j11', {});
    const delivery = await deliverKit(queued.operationId);
    assert.ok(delivery.acked);
    const operation = await one('SELECT status FROM agent_operations WHERE id = ?', queued.operationId);
    assert.equal(operation.status, 'succeeded');
    const row = await feedRow(jobId);
    assert.equal(row.generation_status, 'succeeded');
    assert.equal(row.generation_error, null);
    assert.ok(row.applied_at, 'applied_at set, as the web status route sets it');
    assert.ok(row.generation_completed_at);
    const session = await one('SELECT generation_status FROM application_sessions WHERE id = ?', sessionId);
    assert.equal(session.generation_status, 'succeeded');
    return { feedRow: row };
  });

  await scenario('j12. a kit that fails for good marks the feed row failed, and the role stays in the inbox', async () => {
    const user = await seedUser('j12', { cv: true, sessions: 1 });
    const [sessionId] = user.sessionIds;
    const jobId = await feedJob(user.id, sessionId, 'j12');
    const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-j12', {});
    await run('DELETE FROM documents WHERE user_id = ?', user.id);
    const delivery = await deliverKit(queued.operationId);
    assert.ok(delivery.acked && !delivery.retried);
    assert.equal((await one('SELECT status FROM agent_operations WHERE id = ?', queued.operationId)).status, 'failed');
    const row = await feedRow(jobId);
    assert.equal(row.generation_status, 'failed');
    assert.equal(row.generation_error, 'no_cv');
    assert.equal(row.applied_at, null);
    assert.ok(row.generation_failed_at);
    return { feedRow: row };
  });

  await scenario('j13. a kit cancelled by the user marks the feed row cancelled', async () => {
    const user = await seedUser('j13', { cv: true, sessions: 1 });
    const [sessionId] = user.sessionIds;
    const jobId = await feedJob(user.id, sessionId, 'j13');
    const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-j13', {});
    const cancelled = await ops.cancelOperation(user.id, queued.operationId);
    assert.equal(cancelled?.status, 'cancelled');
    const row = await feedRow(jobId);
    assert.equal(row.generation_status, 'cancelled');
    assert.equal(row.applied_at, null);
    assert.ok(row.generation_cancelled_at);
    // The message that was still in the queue finds nothing to run.
    const callsBefore = (await fakeCalls()).length;
    const late = await deliverKit(queued.operationId);
    assert.ok(late.acked);
    assert.equal((await fakeCalls()).length, callsBefore);
    assert.equal((await feedRow(jobId)).generation_status, 'cancelled');
    return { feedRow: row };
  });

  await scenario('j14. a feed row that cannot be updated is logged and does not fail, undo or re-run a paid, stored kit', async () => {
    const user = await seedUser('j14', { cv: true, sessions: 1 });
    const [sessionId] = user.sessionIds;
    const jobId = await feedJob(user.id, sessionId, 'j14');
    await fakeReset();
    const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-j14', {});
    await run("CREATE TRIGGER e2e_lock_feed_rows BEFORE UPDATE ON job_feed_feedback BEGIN SELECT RAISE(ABORT, 'feed row locked by the test'); END");
    const errorsBefore = loudErrors.length;
    try {
      const delivery = await deliverKit(queued.operationId);
      assert.ok(delivery.acked && !delivery.retried, 'the message is acked, not retried');
    } finally {
      await run('DROP TRIGGER e2e_lock_feed_rows');
    }
    const operation = await one('SELECT status FROM agent_operations WHERE id = ?', queued.operationId);
    assert.equal(operation.status, 'succeeded');
    const reservation = await one('SELECT status FROM credit_reservations WHERE user_id = ?', user.id);
    assert.equal(reservation.status, 'captured', 'the charge stands');
    const session = await one('SELECT generation_status, generated_cv FROM application_sessions WHERE id = ?', sessionId);
    assert.equal(session.generation_status, 'succeeded');
    assert.ok(session.generated_cv, 'the kit is stored');
    const logged = loudErrors.slice(errorsBefore).filter((line) => line.includes('[feed-finalize]'));
    assert.equal(logged.length, 1, 'one loud log with the ids');
    assert.ok(logged[0].includes(sessionId) && logged[0].includes(queued.operationId));
    assert.equal((await feedRow(jobId)).generation_status, 'pending', 'the feed row was left as it was');
    assert.equal((await fakeCalls()).filter((call) => ['cv', 'coverLetter', 'applicationEmail', 'followUpEmail'].includes(call.writer)).length, 4, 'the kit was written once');
    return { logged: logged[0] };
  });

  await scenario('j15. a kit for an application that is not from the feed is untouched by the finalize step', async () => {
    const user = await seedUser('j15', { cv: true, sessions: 1 });
    const [sessionId] = user.sessionIds;
    await fakeReset();
    const queued = await runners.enqueueKitGeneration(user.id, sessionId, 'key-j15', {});
    const errorsBefore = loudErrors.length;
    await deliverKit(queued.operationId);
    assert.equal((await one('SELECT status FROM agent_operations WHERE id = ?', queued.operationId)).status, 'succeeded');
    assert.equal(loudErrors.slice(errorsBefore).filter((line) => line.includes('[feed-finalize]')).length, 0);
    assert.equal((await one('SELECT COUNT(*) AS n FROM job_feed_feedback WHERE user_id = ?', user.id)).n, 0);
    return { ok: true };
  });

  await scenario('j16. nothing left the machine except the stubbed SerpAPI calls', async () => {
    assert.deepEqual(strayRequests, []);
    return { serpStubCalls: serp.calls, fakeModel: FAKE_ANTHROPIC_URL };
  });

  await platform.dispose();
  const failed = report.scenarios.filter((entry) => !entry.passed);
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2));
  console.log(`__RESULT__${JSON.stringify(report)}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
