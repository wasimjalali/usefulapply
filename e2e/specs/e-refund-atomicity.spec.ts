import { expect, test } from '@playwright/test';
import { runTool } from '../lib/run-tool';

interface Report {
  scenarios: Array<{ name: string; passed: boolean; observed: Record<string, unknown>; error?: string }>;
}

/**
 * (e) Refund atomicity. Real batches on a real local D1 with a failing
 * statement injected at every position: the reservation transition, the
 * ledger rows and the balance restore commit together or not at all, for a
 * release, a partial refund and the Queue's success batch (kit, operation,
 * capture, per-document refund). The reconciler then repairs rows an old
 * two-step run left half done, exactly once, and never touches rows from
 * before its start date. Concurrent releases refund once.
 */
test('(e) refunds are all-or-nothing, replay-safe and repairable', async () => {
  const report = await runTool<Report>('e2e/tools/scenarios.ts', ['e']);
  const failed = report.scenarios.filter((scenario) => !scenario.passed);
  expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
  expect(report.scenarios).toHaveLength(6);
  test.info().attach('scenarios-e.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
});
