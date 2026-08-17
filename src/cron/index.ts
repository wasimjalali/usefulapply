
export const CRON_DAILY_CLEANUP = '0 3 * * *';
export const CRON_TEN_MINUTE_RECONCILE = '*/10 * * * *';
export const CRON_HOURLY_CONFIRMATION_RESEND = '0 * * * *';

// Handlers are imported lazily so the job-feed and email code is not pulled
// into the fetch path of the Worker bundle.
export async function dispatchScheduled(cron: string): Promise<void> {
  switch (cron) {
    case CRON_DAILY_CLEANUP: {
      console.log('[cron] job-feed daily cleanup');
      const { cleanupHistoricalJobFeedData } = await import('@/lib/job-feed/cleanup');
      await cleanupHistoricalJobFeedData({ now: new Date() });
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
      await runResendConfirmations();
      return;
    }
    default:
      // A cron string in wrangler.jsonc with no handler is a config bug; fail loud.
      throw new Error(`[cron] no handler for ${cron}`);
  }
}
