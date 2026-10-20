
export const CRON_DAILY_CLEANUP = '0 3 * * *';
export const CRON_TEN_MINUTE_RECONCILE = '*/10 * * * *';
export const CRON_HOURLY_CONFIRMATION_RESEND = '0 * * * *';
export const CRON_WEEKDAY_WELCOME_CHECKIN = '0 9 * * 1-5';
export const CRON_DAILY_TRACKER_REMINDERS = '0 8 * * *';

/** Log the run summary; a run where every attempted send failed is a failed run. */
function failIfNothingSent(label: string, result: { sent: number; errors: number }): void {
  console.log(`[cron] ${label} result`, result);
  if (result.errors > 0 && result.sent === 0) {
    throw new Error(`[cron] ${label}: ${result.errors} errors, 0 sent`);
  }
}

// Handlers are imported lazily so the job-feed and email code is not pulled
// into the fetch path of the Worker bundle.
export async function dispatchScheduled(cron: string): Promise<void> {
  switch (cron) {
    case CRON_DAILY_CLEANUP: {
      console.log('[cron] daily cleanup and monthly credit reset sweep');
      const [
        { cleanupHistoricalJobFeedData },
        { processOverdueMonthlyResets },
        { reconcileCreditRefunds },
        { deleteFinishedOperationsOlderThan },
      ] = await Promise.all([
        import('@/lib/job-feed/cleanup'),
        import('@/lib/supabase/credits.server'),
        import('@/db/repos/credits'),
        import('@/lib/services/operations'),
      ]);
      const results = await Promise.allSettled([
        cleanupHistoricalJobFeedData({ now: new Date() }),
        processOverdueMonthlyResets({ limit: 200 }),
        // Finish refunds an interrupted release or partial refund left half done.
        reconcileCreditRefunds({ limit: 100 }),
        // Finished agent operations are kept 30 days, then dropped.
        deleteFinishedOperationsOlderThan(30),
      ]);
      const problems: string[] = [];
      for (const r of results) {
        if (r.status === 'rejected') {
          problems.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
        }
      }
      const refunds = results[2];
      if (refunds.status === 'fulfilled') {
        console.log('[cron] credit refund reconcile', refunds.value);
        if (refunds.value.failed > 0) problems.push(`credit refund reconcile: ${refunds.value.failed} failed`);
      }
      const operationCleanup = results[3];
      if (operationCleanup.status === 'fulfilled') {
        console.log('[cron] agent operations deleted after 30 days', operationCleanup.value);
      }
      const sweep = results[1];
      if (sweep.status === 'fulfilled') {
        console.log('[cron] monthly credit reset sweep', sweep.value);
        if (sweep.value.attempted > 0 && sweep.value.succeeded === 0) {
          problems.push(`monthly credit reset sweep: ${sweep.value.failed} failed, 0 succeeded`);
        }
      }
      // Side effects are already committed; throwing only marks the run failed in Workers Logs.
      if (problems.length > 0) {
        throw new Error(`[cron] ${problems.join('; ')}`);
      }
      return;
    }
    case CRON_TEN_MINUTE_RECONCILE: {
      console.log('[cron] ten-minute reconcilers');
      const [
        { expireStaleJobFeedApplicationGenerations },
        { releaseStaleReservations },
        { recoverStuckOperations },
      ] = await Promise.all([
        import('@/lib/job-feed/server'),
        import('@/lib/supabase/credit-reservations'),
        import('@/lib/services/generation-runner'),
      ]);
      // Run all even if one fails, then surface the failure.
      const results = await Promise.allSettled([
        expireStaleJobFeedApplicationGenerations(),
        releaseStaleReservations({ maxAgeMs: 30 * 60 * 1000, limit: 50 }),
        // Re-send lost queue messages, fail operations that used all their attempts.
        recoverStuckOperations({ limit: 25 }),
      ]);
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed.length > 0) {
        throw new Error(failed.map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason))).join('; '));
      }
      return;
    }
    case CRON_HOURLY_CONFIRMATION_RESEND: {
      console.log('[cron] confirmation resend');
      const { runResendConfirmations } = await import('@/cron/resend-confirmations');
      failIfNothingSent('confirmation resend', await runResendConfirmations());
      return;
    }
    case CRON_WEEKDAY_WELCOME_CHECKIN: {
      console.log('[cron] founder welcome check-in');
      const { runWelcomeCheckIn } = await import('@/cron/welcome-checkin');
      failIfNothingSent('founder welcome check-in', await runWelcomeCheckIn());
      return;
    }
    case CRON_DAILY_TRACKER_REMINDERS: {
      console.log('[cron] tracker reminders');
      const { runTrackerReminders } = await import('@/cron/tracker-reminders');
      failIfNothingSent('tracker reminders', await runTrackerReminders());
      return;
    }
    default:
      // A cron string in wrangler.jsonc with no handler is a config bug; fail loud.
      throw new Error(`[cron] no handler for ${cron}`);
  }
}
