
export const CRON_DAILY_CLEANUP = '0 3 * * *';
export const CRON_TEN_MINUTE_RECONCILE = '*/10 * * * *';
export const CRON_HOURLY_CONFIRMATION_RESEND = '0 * * * *';
export const CRON_WEEKDAY_WELCOME_CHECKIN = '0 9 * * 1-5';

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
      const [{ cleanupHistoricalJobFeedData }, { processOverdueMonthlyResets }] = await Promise.all([
        import('@/lib/job-feed/cleanup'),
        import('@/lib/supabase/credits.server'),
      ]);
      const results = await Promise.allSettled([
        cleanupHistoricalJobFeedData({ now: new Date() }),
        processOverdueMonthlyResets({ limit: 200 }),
      ]);
      const problems: string[] = [];
      for (const r of results) {
        if (r.status === 'rejected') {
          problems.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
        }
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
      const [{ expireStaleJobFeedApplicationGenerations }, { releaseStaleReservations }] = await Promise.all([
        import('@/lib/job-feed/server'),
        import('@/lib/supabase/credit-reservations'),
      ]);
      // Run both even if one fails, then surface the failure.
      const results = await Promise.allSettled([
        expireStaleJobFeedApplicationGenerations(),
        releaseStaleReservations({ maxAgeMs: 30 * 60 * 1000, limit: 50 }),
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
    default:
      // A cron string in wrangler.jsonc with no handler is a config bug; fail loud.
      throw new Error(`[cron] no handler for ${cron}`);
  }
}
