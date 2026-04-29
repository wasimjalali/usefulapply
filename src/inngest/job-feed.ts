// Job Feed runs on-click in real time. The scheduler, sweeper, per-user
// Inngest fan-out, and Azure Batch reconciler were removed (commit
// references live in git history) once we committed to real-time-only
// delivery. The only background jobs kept are:
//
//  1. Daily cleanup of raw fetch payloads and run metadata (retention).
//  2. Reconciler that expires stale application-generation intents.
//  3. Reconciler that releases stale credit reservations.
//
// If we ever want scheduled delivery again, rebuild it on top of the
// real-time pipeline rather than restoring this file.

import { cleanupHistoricalJobFeedData } from '@/lib/job-feed/cleanup';
import { expireStaleJobFeedApplicationGenerations } from '@/lib/job-feed/server';
import { releaseStaleReservations } from '@/lib/supabase/credit-reservations';
import { inngest } from '@/inngest/client';

export const jobFeedDailyCleanupFunction = inngest.createFunction(
  {
    id: 'job-feed-daily-cleanup',
    name: 'Job Feed Daily Cleanup',
    // Once a day is plenty; the cleanup only redacts payloads past
    // retention windows measured in weeks.
    triggers: [{ cron: '0 3 * * *' }],
  },
  async ({ step }) => {
    return step.run('cleanup-historical-job-feed-data', async () => {
      return cleanupHistoricalJobFeedData({ now: new Date() });
    });
  }
);

export const jobFeedApplicationGenerationReconcilerFunction = inngest.createFunction(
  {
    id: 'job-feed-application-generation-reconciler',
    name: 'Job Feed Application Generation Reconciler',
    triggers: [{ cron: '*/10 * * * *' }],
  },
  async ({ step }) => {
    return step.run('expire-stale-application-generations', async () => {
      return expireStaleJobFeedApplicationGenerations();
    });
  }
);

export const creditReservationReconcilerFunction = inngest.createFunction(
  {
    id: 'credit-reservation-reconciler',
    name: 'Credit Reservation Reconciler',
    triggers: [{ cron: '*/10 * * * *' }],
  },
  async ({ step }) => {
    return step.run('release-stale-credit-reservations', async () => {
      return releaseStaleReservations({ maxAgeMs: 30 * 60 * 1000, limit: 50 });
    });
  }
);

export const jobFeedFunctions = [
  jobFeedDailyCleanupFunction,
  jobFeedApplicationGenerationReconcilerFunction,
  creditReservationReconcilerFunction,
];
