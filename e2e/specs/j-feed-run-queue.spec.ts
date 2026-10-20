import { expect, test } from '@playwright/test';
import { runTool } from '../lib/run-tool';

interface Report {
  scenarios: Array<{ name: string; passed: boolean; observed: Record<string, unknown>; error?: string }>;
}

/**
 * (j) Queued job feed runs, and the feed row of a queued kit. The 16 scenarios in
 * e2e/tools/feed-scenarios.ts run the production run_job_feed tool, producer, queue consumer,
 * workflow and kit runner against a fresh local D1, with the Queue simulated at its edge (send /
 * ack / retry / attempts / dead-letter), SerpAPI answered from a stub inside the process (no real
 * call; the file header says how), the ranker on its deterministic path and the kit writer on the
 * scripted fake model. They cover: the tool returns at once with a queued run and runs no search;
 * a second call finds the same run; the consumer claims it and runs the feed once; a duplicate or
 * simultaneous delivery runs nothing twice; messages of an unknown shape are acked untouched; a run
 * that fails after the claim is failed, acked and never re-run, and the next call retries the day;
 * one that fails before the claim is retried, then failed (last delivery or dead-letter queue); a
 * message cannot run another user's run; a completed day queues nothing; a refused send leaves no
 * orphaned queued run; and a queued kit marks the feed row succeeded, failed or cancelled, with a
 * feed-row failure logged and never failing a paid kit.
 */
test('(j) run_job_feed queues the run; the consumer claims it once; a queued kit finishes its feed row', async () => {
  const report = await runTool<Report>('e2e/tools/feed-scenarios.ts', []);
  const failed = report.scenarios.filter((scenario) => !scenario.passed);
  expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
  expect(report.scenarios).toHaveLength(16);
  test.info().attach('scenarios-j.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
});
