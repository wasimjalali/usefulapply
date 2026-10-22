/**
 * Job feed ranking on Claude Haiku 5.5 (spec feed-ranking).
 *
 *   npx tsx e2e/tools/feed-ranking.ts [outFile]
 *
 * Real code, real local D1 (a fresh migrated one in a temp dir): the whole run workflow of a Max user
 * (career profile, search strategy, four searches, prefilter, ranking, persisting) through
 * runJobFeedFoundationWorkflow. Nothing leaves the machine:
 *   - SerpAPI: `fetch` is wrapped. Each search is answered from a stub with ten distinct postings of about
 *     3,800 characters (so four searches give the 40 candidates a Max run ranks), and counted.
 *   - The model is the scripted Anthropic fake on FAKE_ANTHROPIC_PORT: career profile, search strategy
 *     and ranking all go through callHaiku against it, and its /__calls is what the scenarios read.
 *
 * Prints `__RESULT__{...report}`; exits non-zero if any scenario failed.
 */

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fakeCalls, fakeControl, fakeReset, type FakeCall } from '../lib/fake-control';
import { PRIMARY_CV } from '../lib/model-script';
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

const serp = { calls: 0 };
const strayRequests: string[] = [];
const realFetch = globalThis.fetch;

/** About 3,800 characters of posting, different for every job so no two collapse into one card. */
function description(n: number): string {
  const paragraph = (k: number) =>
    `Role ${n}, block ${k}. You own the monthly forecast and the variance reporting for business unit ${n} at Ranking Co ${n}, ` +
    `build the planning model in Excel and Power BI on SAP data, and present the results to the plant managers every week. ` +
    `Requirements: three or more years in financial planning and analysis, strong Excel, fluent English, and a habit of checking numbers twice. `;
  return Array.from({ length: 10 }, (_, k) => paragraph(k)).join('\n').slice(0, 3_800);
}

function stubJobs(first: number) {
  return Array.from({ length: 10 }, (_, i) => {
    const n = first + i;
    return {
      job_id: `rank-job-${n}`,
      title: `Financial Analyst ${n}`,
      company_name: `Ranking Co ${n} GmbH`,
      location: 'New York, NY',
      via: 'via Stub Board',
      share_link: `https://example.test/jobs/${n}`,
      description: description(n),
      detected_extensions: { posted_at: '2 days ago', schedule_type: 'Full-time' },
      apply_options: [{ title: 'Stub Board', link: `https://example.test/apply/${n}` }],
    };
  });
}

globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  const host = new URL(url).hostname;
  if (host === 'serpapi.com') {
    serp.calls += 1;
    return new Response(JSON.stringify({ jobs_results: stubJobs((serp.calls - 1) * 10) }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (host !== '127.0.0.1' && host !== 'localhost') strayRequests.push(url);
  return realFetch(input, init);
}) as typeof fetch;

type Row = Record<string, unknown>;

/** The structured CV the career profile is synthesized from (the shape /api/parse-cv stores). */
function structuredCv(): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    version: 1,
    createdAt: now,
    updatedAt: now,
    sourceFileName: 'tomas-brandt.txt',
    sourceFormat: 'txt',
    settings: { region: 'US', includePhoto: false, pageSize: 'letter', maxPages: 1, language: 'en' },
    personal: { fullName: 'Tomas Brandt', email: 'tomas.brandt@example.com', phone: '', city: 'Chicago', currentTitle: 'Financial Analyst' },
    experience: [{
      id: 'exp-1',
      company: 'Calder Industrial Components',
      position: 'Financial Analyst',
      startDate: { raw: 'Mar 2022', year: 2022, month: 3, confidence: 'high' },
      current: true,
      bullets: [
        'Own the monthly forecast and variance reporting for two business units',
        'Improved forecast accuracy for the larger unit from 88% to 96%',
      ],
    }],
    education: [],
    skills: [],
    certifications: [],
    languages: [],
  };
}

async function main(): Promise<void> {
  const platform = await openPlatform(freshStateDir());
  const feedServer = await import('../../src/lib/job-feed/server');

  const all = async (query: string, ...bindings: unknown[]): Promise<Row[]> => {
    const result = await platform.db.prepare(query).bind(...bindings).all();
    return (result as unknown as { results: Row[] }).results;
  };
  const one = async (query: string, ...bindings: unknown[]) => (await all(query, ...bindings))[0];
  const run = (query: string, ...bindings: unknown[]) => platform.db.prepare(query).bind(...bindings).run();

  /** A Max user with a primary CV (raw and structured) and feed settings for four countries. */
  async function seedMaxUser(label: string): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await run("INSERT INTO profiles (id, email, subscription_tier, job_searches_reset_at, created_at, updated_at) VALUES (?, ?, 'max', ?, ?, ?)", id, `${label}@test.local`, now, now, now);
    await run(
      "INSERT INTO user_credits (id, user_id, monthly_credits, rollover_credits, addon_credits, plan_tier, version, created_at, updated_at) VALUES (?, ?, 200, 0, 0, 'max', 0, ?, ?)",
      crypto.randomUUID(), id, now, now,
    );
    await run(
      `INSERT INTO documents (id, user_id, type, file_name, file_type, raw_text, sections, all_skills, all_experiences, all_education, structured_data, created_at, updated_at)
       VALUES (?, ?, 'primary_cv', 'cv.txt', 'txt', ?, '{}', '[]', '[]', '[]', ?, ?, ?)`,
      crypto.randomUUID(), id, PRIMARY_CV, JSON.stringify(structuredCv()), now, now,
    );
    await feedServer.getOrProvisionFreeJobFeedSettingsAdmin(id, ['Financial Analyst'], { consentAccepted: true });
    await run('UPDATE job_feed_settings SET target_countries = ? WHERE user_id = ?', JSON.stringify(['us', 'ca', 'gb', 'au']), id);
    return id;
  }

  const modelCalls = async (writer: string): Promise<FakeCall[]> =>
    (await fakeCalls()).filter((call) => call.kind === 'messages' && call.writer === writer);

  const scenario = async (name: string, body: () => Promise<Record<string, unknown>>) => {
    const observed: Record<string, unknown> = {};
    try {
      await fakeReset();
      Object.assign(observed, await body());
      report.scenarios.push({ name, passed: true, observed });
      console.log(`PASS  ${name}`);
    } catch (error) {
      report.scenarios.push({ name, passed: false, observed, error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error) });
      console.log(`FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const runOf = async (userId: string) => {
    const row = await one('SELECT id, status, error_message, ranked_jobs_count, raw_jobs_fetched, jobs_after_prefilter, metadata FROM job_feed_runs WHERE user_id = ?', userId);
    return {
      id: String(row.id),
      status: String(row.status),
      ranked_jobs_count: Number(row.ranked_jobs_count),
      metadata: JSON.parse(String(row.metadata)) as Record<string, unknown>,
    };
  };

  let firstStaticHash: string | null = null;

  await scenario('r1. a Max run with 40 candidates counts tokens through the grey zone, ranks with Haiku and persists the ranking', async () => {
    const userId = await seedMaxUser('r1');
    const searchesBefore = serp.calls;
    const result = await feedServer.runJobFeedFoundationWorkflow({ userId, orchestrator: 'direct' });
    assert.equal(result.run.status, 'completed');
    assert.equal(serp.calls - searchesBefore, 4, 'four main searches on Max');

    // Every Haiku site of the pipeline ran on the Haiku model, with an effort, against the fake.
    const sites = ['careerProfile', 'searchStrategy', 'ranking'];
    for (const site of sites) {
      const calls = await modelCalls(site);
      assert.equal(calls.length, 1, `one ${site} call`);
      assert.equal(calls[0].model, 'claude-haiku-5-5', `${site} model`);
      assert.ok(['low', 'medium', 'high'].includes(String(calls[0].effort)), `${site} effort ${calls[0].effort}`);
      assert.equal(calls[0].structuredOutput, true, `${site} asks for structured output`);
      assert.equal(calls[0].status, 200);
    }
    assert.equal(
      (await one('SELECT COUNT(*) AS n FROM user_career_profiles WHERE user_id = ? AND model_name = ?', userId, 'claude-haiku-5-5')).n,
      1,
      'the career profile was stored with the Haiku model name',
    );

    // The ranking request was big enough to need the exact count, and the count was asked of the API.
    const [ranking] = await modelCalls('ranking');
    const counts = (await fakeCalls()).filter((call) => call.kind === 'count_tokens' && call.writer === 'ranking');
    assert.ok(counts.length >= 1, 'count_tokens was called for the ranking request');
    assert.equal(counts[counts.length - 1].countedTokens, ranking.usage?.total, 'the counted size is the size that was sent');
    assert.ok((ranking.usage?.total ?? 0) > 40_000 && (ranking.usage?.total ?? 0) < 90_000, `ranking input ${ranking.usage?.total} tokens, inside the budget`);
    assert.deepEqual(ranking.markers.map((marker) => [marker.where, marker.ttl]), [['system', '5m'], ['system', '5m']]);
    firstStaticHash = ranking.staticPrefixHash;

    // Every request of the run, the count included, names the user's Anthropic profile (the one stored in D1).
    const stored = await one('SELECT profile_id FROM anthropic_user_profiles WHERE user_id = ?', userId);
    assert.ok(String(stored?.profile_id ?? '').startsWith('uprof_'), 'the run created and stored a user profile');
    const unnamed = (await fakeCalls()).filter((call) => call.userProfileId !== stored.profile_id).map((call) => `${call.kind}:${call.writer}:${call.userProfileId}`);
    assert.deepEqual(unnamed, [], 'requests that do not name the user\'s profile');

    // The run: 40 candidates went to the model, 25 (the Max cap) came back ranked, and the ranking is the model's.
    const finished = await runOf(userId);
    assert.equal(finished.status, 'completed');
    assert.equal(finished.metadata.ranking_status, 'completed_llm');
    assert.equal(finished.metadata.ranking_candidate_count, 40);
    assert.equal(finished.ranked_jobs_count, 25);
    assert.equal((finished.metadata.ranking_model as { name: string }).name, 'claude-haiku-5-5');
    const items = await all('SELECT rank_position, fit_label, ranking_source FROM job_feed_ranked_items WHERE run_id = ? ORDER BY rank_position', finished.id);
    assert.equal(items.length, 25);
    assert.ok(items.every((item) => item.ranking_source === 'llm'), 'every persisted item is the model\'s');
    assert.deepEqual(items.slice(0, 3).map((item) => item.fit_label), ['strong', 'strong', 'strong']);
    assert.deepEqual(items.map((item) => item.rank_position), Array.from({ length: 25 }, (_, i) => i + 1));

    // The ledger row of the ranking call: Haiku, cash on the Anthropic API, cache fields recorded.
    const ledger = await one(
      "SELECT provider, model, status, input_tokens, cache_read_input_tokens, cache_write_input_tokens FROM llm_generations WHERE user_id = ? AND operation = 'job_feed_ranking'",
      userId,
    );
    assert.deepEqual({ provider: ledger.provider, model: ledger.model, status: ledger.status }, { provider: 'anthropic', model: 'claude-haiku-5-5', status: 'response_received' });
    assert.equal(
      Number(ledger.input_tokens) + Number(ledger.cache_read_input_tokens) + Number(ledger.cache_write_input_tokens),
      ranking.usage?.total,
      'the ledger holds input, cache reads and cache writes of the request',
    );
    return { candidates: finished.metadata.ranking_candidate_count, rankingInputTokens: ranking.usage?.total, countedTokens: counts[0].countedTokens, countTokensCalls: counts.length, ranked: items.length, userProfileId: stored.profile_id, ledger };
  });

  await scenario('r2. a second Max user\'s run has the same static prefix and reads it from the cache', async () => {
    // The fake's cache was cleared for this scenario, so the first user's entry is written again by a run of its own.
    const first = await seedMaxUser('r2a');
    await feedServer.runJobFeedFoundationWorkflow({ userId: first, orchestrator: 'direct' });
    const second = await seedMaxUser('r2b');
    await feedServer.runJobFeedFoundationWorkflow({ userId: second, orchestrator: 'direct' });
    const [rankA, rankB] = await modelCalls('ranking');
    assert.ok(rankA && rankB, 'two ranking calls');
    assert.equal(rankB.staticPrefixHash, rankA.staticPrefixHash, 'the static prefix is byte-identical across users');
    assert.equal(rankA.staticPrefixHash, firstStaticHash, 'and across runs');
    assert.equal(rankA.usage?.cacheRead, 0);
    assert.ok((rankA.usage?.cacheCreation ?? 0) > 0);
    assert.ok((rankB.usage?.cacheRead ?? 0) >= 512, `the second run read ${rankB.usage?.cacheRead} tokens`);
    assert.ok((rankB.usage?.cacheRead ?? 0) < (rankB.usage?.total ?? 0), 'the candidates are the new part');
    return { firstRead: rankA.usage?.cacheRead, secondRead: rankB.usage?.cacheRead, secondTotal: rankB.usage?.total };
  });

  await scenario('r3. a 500 from the ranker ends in llm_failed_fallback with the deterministic order, and the run still completes', async () => {
    const userId = await seedMaxUser('r3');
    await fakeControl({ failWriter: 'ranking' });
    try {
      const result = await feedServer.runJobFeedFoundationWorkflow({ userId, orchestrator: 'direct' });
      assert.equal(result.run.status, 'completed', 'a ranker outage does not fail the run');
    } finally {
      await fakeControl({ failWriter: null });
    }
    const finished = await runOf(userId);
    assert.equal(finished.metadata.ranking_status, 'llm_failed_fallback');
    assert.ok(String(finished.metadata.ranking_error ?? '').length > 0, 'the failure is on the run');
    assert.equal(finished.metadata.ranking_model, null, 'no model answered');
    const failedCalls = (await modelCalls('ranking')).filter((call) => call.status === 500);
    assert.ok(failedCalls.length >= 1, 'the ranker answered 500');
    assert.equal((await modelCalls('ranking')).filter((call) => call.status === 200).length, 0, 'no ranking was ever served');

    // The deterministic ranking: the first 25 by score, labelled by the prefilter, never the model's.
    const items = await all('SELECT rank_position, ranking_source, deterministic_score FROM job_feed_ranked_items WHERE run_id = ? ORDER BY rank_position', finished.id);
    assert.ok(items.length > 0 && items.length <= 25, `${items.length} deterministic items`);
    assert.ok(items.every((item) => item.ranking_source === 'deterministic'));
    const scores = items.map((item) => Number(item.deterministic_score));
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a), 'ordered by deterministic score');
    assert.equal(finished.ranked_jobs_count, items.length);
    // The ledger row of the failed call says so.
    const ledger = await all("SELECT status, error_kind, provider, model FROM llm_generations WHERE user_id = ? AND operation = 'job_feed_ranking'", userId);
    assert.ok(ledger.length >= 1 && ledger.every((row) => row.status === 'failed' && row.provider === 'anthropic' && row.model === 'claude-haiku-5-5'), JSON.stringify(ledger));
    return { rankingError: finished.metadata.ranking_error, items: items.length, ledger };
  });

  await scenario('r4. nothing left the machine except the stubbed SerpAPI calls', async () => {
    assert.deepEqual(strayRequests, []);
    return { serpStubCalls: serp.calls };
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
