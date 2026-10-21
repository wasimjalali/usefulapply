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
 * before its start date. Concurrent releases refund once. Reserving credits is
 * the same: deduct, reservation row and ledger row are one batch, broken at
 * every position for a fresh key and for a re-reserved released key. Inline spend
 * tools (regenerate_document, rewrite_cv_section) save their output in the same
 * batch that marks the operation done and captures the credits: a failing capture
 * leaves no document or CV edit behind and no error text in the ledger, a lost
 * revision race is rebuilt against a fresh read, and five misses fail the
 * operation with the credits back.
 */
test('(e) refunds are all-or-nothing, replay-safe and repairable', async () => {
  const report = await runTool<Report>('e2e/tools/scenarios.ts', ['e']);
  const failed = report.scenarios.filter((scenario) => !scenario.passed);
  expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
  expect(report.scenarios).toHaveLength(12);
  test.info().attach('scenarios-e.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
});
