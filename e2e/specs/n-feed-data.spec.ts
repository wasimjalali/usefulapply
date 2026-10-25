import { expect, test } from '@playwright/test';
import { runTool } from '../lib/run-tool';

interface Report {
  scenarios: Array<{ name: string; passed: boolean; observed: Record<string, unknown>; error?: string }>;
}

/**
 * (n) Feed data, from a real run to what get_job_feed returns. The scenarios in e2e/tools/feed-data.ts run the
 * whole run workflow of a Max user against a fresh local D1, with SerpAPI and the employer pages stubbed at
 * `fetch` (ads shaped like the ones seen on 2026-10-25) and the model on the scripted fake, then read the feed
 * through the get_job_feed tool's own handler. They cover: a snippet replaced by the ad on its own page; a page
 * that refuses us leaving the Google copy marked incomplete; a page of long ads split by size, never by cutting
 * a description; and nothing but the stubs reached.
 */
test('(n) a run stores whole ads and get_job_feed returns them whole', async () => {
  const report = await runTool<Report>('e2e/tools/feed-data.ts', []);
  const failed = report.scenarios.filter((scenario) => !scenario.passed);
  expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
  expect(report.scenarios.length).toBeGreaterThanOrEqual(4);
  test.info().attach('scenarios-n.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
});
