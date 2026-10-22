import { expect, test } from '@playwright/test';
import { runTool } from '../lib/run-tool';

interface Report {
  scenarios: Array<{ name: string; passed: boolean; observed: Record<string, unknown>; error?: string }>;
}

/**
 * Job feed ranking on Claude Haiku 5.5. The four scenarios in e2e/tools/feed-ranking.ts run the whole run
 * workflow of Max users (career profile, search strategy, four searches, prefilter, ranking, persisting) in
 * process against a fresh local D1, with SerpAPI stubbed and the model on the scripted Anthropic fake:
 *
 *  - a Max run with 40 candidates (about 50k tokens, past the 60k estimate that triggers an exact count):
 *    count_tokens is asked, the request goes to claude-haiku-5-5 as structured output, the model's ranking
 *    is persisted (25 items, source llm), and the ledger holds the cache fields;
 *  - a second user's run has the same static prefix, byte for byte, and reads it from the cache;
 *  - a 500 from the ranker ends in llm_failed_fallback: the run still completes with the deterministic order;
 *  - nothing but the stubbed SerpAPI calls left the machine.
 */
test('(feed-ranking) a Max run counts tokens, persists the Haiku ranking, shares its prefix across users and falls back on a 500', async () => {
  const report = await runTool<Report>('e2e/tools/feed-ranking.ts', []);
  const failed = report.scenarios.filter((scenario) => !scenario.passed);
  expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
  expect(report.scenarios).toHaveLength(4);

  const [first, second, fallback] = report.scenarios;
  expect(first.observed).toMatchObject({ candidates: 40, ranked: 25 });
  expect(first.observed.countTokensCalls, 'the exact count was asked').toBeGreaterThanOrEqual(1);
  expect(Number(first.observed.rankingInputTokens)).toBeGreaterThan(40_000);
  expect(Number(second.observed.secondRead)).toBeGreaterThan(0);
  expect(String(fallback.observed.rankingError).length).toBeGreaterThan(0);
  test.info().attach('scenarios-feed-ranking.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
});
