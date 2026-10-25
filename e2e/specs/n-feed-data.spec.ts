import { expect, test } from '@playwright/test';
import { runTool } from '../lib/run-tool';

interface Report {
  scenarios: Array<{ name: string; passed: boolean; observed: Record<string, unknown>; error?: string }>;
}

/**
 * (n) Feed data, from a real run to what get_job_feed returns. The scenarios in e2e/tools/feed-data.ts run the
 * whole run workflow of a Max user against a fresh local D1, with SerpAPI and the employer pages stubbed at
 * `fetch` (ads shaped like the ones seen on 2026-10-25) and the model on the scripted fake, then read the feed
 * through the MCP tools' own handlers. They cover whole ads (d1 to d3), whole links (d4), list items and headings
 * (d5), work mode, seniority and tracker enforcement (e1 to e4), runs a day and custom queries (r1, r2), settings
 * saves (s1 to s3: first-save seniority from the CV, a cleared seniority that stays cleared, and two saves racing
 * over the search list), and nothing but the stubs reached (d9).
 */
test('(n) a run stores whole ads and get_job_feed returns them whole', async () => {
  const report = await runTool<Report>('e2e/tools/feed-data.ts', []);
  const failed = report.scenarios.filter((scenario) => !scenario.passed);
  expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
  expect(report.scenarios.map((scenario) => scenario.name.split('.')[0])).toEqual(['d1', 'd2', 'd3', 'd4', 'd5', 'e1', 'e2', 'e3', 'e4', 'r1', 'r2', 'e5', 's1', 's2', 's3', 'd9']);
  test.info().attach('scenarios-n.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
});
