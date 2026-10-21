/**
 * Feed job to application, then a fit check or a kit: the MCP `apply_to_feed_job` tool.
 *
 * The web handoff (POST /api/job-feed/apply) charges nothing. It creates the application and a
 * generation intent, and the browser then runs the agent, which reserves the credits. A headless
 * caller has no browser, so this does both halves in two idempotent steps:
 *
 *   1. `feed_apply_session`, an inline operation without credits, keyed by the caller's
 *      idempotency key. It finds or creates the application for the feed job and links the feed
 *      row to it. Two identical requests cannot both create one: the second sees the first's
 *      pending operation (the live-input index) and is refused as "in progress".
 *   2. The charged part, which already guarantees one charge per key and per identical input:
 *      - fit: an inline operation (`feed_apply_fit`) reserving 0.5 credits and running
 *        `analyzeApplicationFit`;
 *      - kit: `enqueueKitGeneration`, reserving 2.0 credits (1.5 after a paid fit check on the application) and queuing the run.
 *      Both reserve with the daily agent limit, and both answer a repeat before reserving anything.
 *
 * Credits are never charged by step 1, so a request that cannot succeed (no CV, a dismissed role,
 * an empty balance, the daily limit) is refused before an application is created.
 */

import type { SQL } from 'drizzle-orm';
import { z } from 'zod';
import { checkCreditBalance, reservedSpendSince, type ReservationSpendLimit } from '@/db/repos/credits';
import * as jobFeedRepo from '@/db/repos/jobFeed';
import { getProfile } from '@/db/repos/profiles';
import { getSession } from '@/db/repos/sessions';
import { CREDIT_COSTS, type CreditAction } from '@/lib/credit-costs';
import { captureJobFeedActionRejected, captureJobFeedEvent } from '@/lib/job-feed/analytics';
import { canViewJobFeed } from '@/lib/job-feed/helpers';
import {
  authorizeJobFeedJobActionAdmin,
  canReuseBlockedFeedbackSession,
  createJobFeedApplicationSessionAdmin,
  getJobFeedFeedbackAdmin,
  isJobFeedbackBlocked,
  recordJobFeedFeedbackAdmin,
} from '@/lib/job-feed/server';
import { InsufficientCreditsError, InvalidInputError, NotFoundError, ReservationConflictError, RevisionConflict, SpendLimitReachedError } from '../errors';
import { analyzeApplicationFit, fitContextIdFor } from '../fit-analysis';
import { enqueueKitGeneration } from '../generation-runner';
import { runInlineOperation } from '../inline-operations';
import { kitFromRow } from '../kit';
import { loadOwnedCvSources } from '../kit-generation';
import { OPERATION_KINDS, findOperationByKey, type AgentOperation } from '../operations';
import { FeedError } from './errors';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export type FeedApplyMode = 'fit' | 'kit';

const SESSION_KIND = 'feed_apply_session';
const FIT_KIND = 'feed_apply_fit';
const ANALYTICS_ROUTE = 'mcp:apply_to_feed_job';

const CREDIT_ACTION: Record<FeedApplyMode, Extract<CreditAction, 'FIT_ANALYSIS' | 'FULL_APPLICATION'>> = {
  fit: 'FIT_ANALYSIS',
  kit: 'FULL_APPLICATION',
};

/** What step 1 stores on its operation, so a repeat gets the same application back. */
const sessionResult = z.object({
  applicationId: z.string().min(1),
  created: z.boolean(),
  jobTitle: z.string(),
  company: z.string(),
});

/** What the fit step stores. `assessment` and the skills come from the job ad: the tool wraps them on the way out. */
const fitResult = z.object({
  applicationId: z.string().min(1),
  fitLevel: z.enum(['strong', 'good', 'fair', 'weak']),
  score: z.number(),
  assessment: z.string(),
  matchingSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  revision: z.number().int().nullable(),
});
export type StoredFit = z.infer<typeof fitResult>;

export interface FeedApplyJob {
  /** Untrusted: from the job ad. */
  title: string;
  /** Untrusted: from the job ad. */
  company: string;
}

export type FeedApplyOutcome =
  /** The application already has a kit. Nothing was charged or started. */
  | { kind: 'kit_exists'; applicationId: string; job: FeedApplyJob }
  | {
      kind: 'fit';
      applicationId: string;
      job: FeedApplyJob;
      operationId: string;
      /** True when an earlier request (this key, or the same input) already ran: nothing new was charged. */
      replayed: boolean;
      fit: StoredFit;
    }
  | {
      kind: 'kit';
      applicationId: string;
      job: FeedApplyJob;
      operationId: string;
      status: AgentOperation['status'];
      replayed: boolean;
      /** Set when the application already had a generation running and this call joined it. */
      joinedRunning: boolean;
      creditsReserved: number;
    };

export async function applyToFeedJob(params: {
  userId: string;
  jobId: string;
  mode: FeedApplyMode;
  idempotencyKey: string;
  spendLimit: ReservationSpendLimit;
}): Promise<FeedApplyOutcome> {
  const { userId, jobId, mode, idempotencyKey, spendLimit } = params;

  const profile = await getProfile(userId);
  if (!profile) throw new FeedError(500, 'Failed to load profile.', 'profile_missing');
  // Like the web handoff: viewing the feed is enough, because the credits are the paywall.
  if (!canViewJobFeed(profile.subscription_tier)) {
    throw new FeedError(403, 'Job Feed is not available for this account.', 'plan_not_allowed');
  }
  const subscriptionTier = profile.subscription_tier;

  // Step 1: the application for this feed job.
  const prepared = await runInlineOperation({
    userId,
    kind: SESSION_KIND,
    idempotencyKey,
    input: { jobId, mode },
    execute: async () => ({
      result: await prepareApplication({ userId, jobId, mode, subscriptionTier, spendLimit }),
      settle: 'capture' as const,
    }),
  });
  if (prepared.kind === 'in_progress') throw new ReservationConflictError('REQUEST_IN_PROGRESS');
  const application = sessionResult.parse(prepared.result);
  const job: FeedApplyJob = { title: application.jobTitle, company: application.company };

  // A repeat may name an application deleted since the first call: say so rather than return a ghost.
  const row = await getSession(userId, application.applicationId);
  if (!row) throw new NotFoundError();

  // Step 2: an application that already has a kit takes no new spend, unless this very key already
  // started something, in which case the services below answer the repeat with that result.
  const kind = mode === 'fit' ? FIT_KIND : OPERATION_KINDS.generateKit;
  const earlier = await findOperationByKey(userId, kind, idempotencyKey);
  if (!earlier && kitFromRow(row).hasKit) {
    return { kind: 'kit_exists', applicationId: application.applicationId, job };
  }

  if (mode === 'fit') {
    let run;
    try {
      run = await runInlineOperation({
        userId,
        kind: FIT_KIND,
        idempotencyKey,
        input: { applicationId: application.applicationId },
        reserve: {
          action: 'FIT_ANALYSIS',
          sessionId: application.applicationId,
          // The context id is what a kit later uses to earn the after-fit price (canUseFitContinuation reads it off this reservation).
          metadata: { source_tool: 'apply_to_feed_job', job_id: jobId, context_id: fitContextIdFor('apply_to_feed_job', idempotencyKey) },
          spendLimit,
        },
        execute: async () => {
          const fit = await analyzeApplicationFit({
            userId,
            sessionId: application.applicationId,
            contextId: fitContextIdFor('apply_to_feed_job', idempotencyKey),
            requestId: idempotencyKey,
          });
          return {
            settle: 'capture' as const,
            // What the analysis learned is saved in the same batch that captures the credits.
            commit: async (guard: SQL, now: string) => {
              const written = await fit.buildWrite(guard, now);
              const result: StoredFit = {
                applicationId: application.applicationId,
                fitLevel: fit.fit.fitLevel,
                score: fit.fit.score,
                assessment: fit.fit.assessment,
                matchingSkills: fit.fit.matchingSkills,
                missingSkills: fit.fit.missingSkills,
                revision: written.revision,
              };
              return { kind: 'write' as const, statements: written.statements, result };
            },
          };
        },
      });
    } catch (error) {
      // The credits are back by now (the operation failed in the same batch that would have charged them).
      if (error instanceof RevisionConflict) {
        throw new FeedError(409, 'The application was being edited at the same time. Nothing was changed and no credits were used. Try again.', 'write_conflict');
      }
      throw error;
    }
    if (run.kind === 'in_progress') throw new ReservationConflictError('REQUEST_IN_PROGRESS');
    const fit = fitResult.parse(run.result);
    if (run.kind === 'fresh') captureApplied({ userId, jobId, applicationId: application.applicationId, mode, created: application.created });
    return {
      kind: 'fit',
      applicationId: application.applicationId,
      job,
      operationId: run.operationId,
      replayed: run.kind === 'replayed',
      fit,
    };
  }

  // Same after-fit price as generate_application_kit: the context is the fit stored on this application, and the
  // credits layer only honours it for a fit this user paid for and hasn't spent on a kit yet.
  const pendingFit = asRecord(asRecord(row.generated_artifacts)?.pendingFitAnalysis);
  const contextId = typeof pendingFit?.contextId === 'string' ? pendingFit.contextId : null;
  const queued = await enqueueKitGeneration(userId, application.applicationId, idempotencyKey, { contextId, spendLimit });
  if (!queued.deduped) captureApplied({ userId, jobId, applicationId: application.applicationId, mode, created: application.created });
  return {
    kind: 'kit',
    applicationId: application.applicationId,
    job,
    operationId: queued.operationId,
    status: queued.status,
    replayed: queued.deduped && queued.matchedBy !== 'session',
    joinedRunning: queued.matchedBy === 'session',
    creditsReserved: queued.creditsReserved,
  };
}

function captureApplied(params: { userId: string; jobId: string; applicationId: string; mode: FeedApplyMode; created: boolean }): void {
  captureJobFeedEvent({
    distinctId: params.userId,
    event: 'job_feed_applied',
    properties: {
      job_id: params.jobId,
      session_id: params.applicationId,
      session_created: params.created,
      mode: params.mode,
      source: 'mcp',
    },
  });
}

/**
 * Find or create the application for a feed job and link the feed row to it. Runs once per
 * request, inside the step 1 operation, and refuses what could never succeed before it creates
 * anything.
 */
async function prepareApplication(params: {
  userId: string;
  jobId: string;
  mode: FeedApplyMode;
  subscriptionTier: string;
  spendLimit: ReservationSpendLimit;
}): Promise<z.infer<typeof sessionResult>> {
  const { userId, jobId, mode, subscriptionTier, spendLimit } = params;
  const rejected = (reason: string, status: number) => captureJobFeedActionRejected({
    userId,
    route: ANALYTICS_ROUTE,
    action: 'apply_started',
    reason,
    jobId,
    status,
    subscriptionTier,
  });

  const authorized = await authorizeJobFeedJobActionAdmin({ userId, jobId, runId: null });
  if (!authorized) {
    rejected('ranked_feed_item_not_found', 404);
    throw new NotFoundError('Job feed item');
  }
  const { job, rankedItem } = authorized;

  const existingFeedback = await getJobFeedFeedbackAdmin(userId, jobId);
  // Check the terminal state before the first write, as the web handoff does.
  if (existingFeedback && isJobFeedbackBlocked(existingFeedback) && !canReuseBlockedFeedbackSession(existingFeedback)) {
    rejected('feedback_terminal_state', 409);
    throw new FeedError(409, 'This role was already dismissed, rated not relevant or applied to.', 'job_unavailable');
  }

  const { primaryCV } = await loadOwnedCvSources(userId);
  if (!primaryCV) throw new InvalidInputError('A primary CV is needed to apply. Save one first.');

  const existingSession = existingFeedback?.application_session_id
    ? await getSession(userId, existingFeedback.application_session_id)
    : null;
  if (existingSession) {
    // A kit on an application opened by an earlier fit check starts the application, as the web does on every handoff.
    if (mode === 'kit' && !kitFromRow(existingSession).hasKit) {
      await recordJobFeedFeedbackAdmin({
        userId,
        jobId,
        action: 'apply_started',
        latestRunId: rankedItem.run_id,
        applicationSessionId: existingSession.id,
      });
    }
    return { applicationId: existingSession.id, created: false, jobTitle: existingSession.job_title ?? job.title, company: existingSession.company ?? job.company };
  }

  // Nothing exists yet, so nothing is created for a request the balance or the daily limit would refuse.
  const action = CREDIT_ACTION[mode];
  const balance = await checkCreditBalance(userId, action);
  if (!balance.hasEnough) {
    rejected('insufficient_credits', 402);
    throw new InsufficientCreditsError(balance.required, balance.available);
  }
  const spent = await reservedSpendSince(userId, spendLimit.source, spendLimit.since);
  if (spent + CREDIT_COSTS[action] > spendLimit.limit) {
    rejected('daily_limit', 402);
    throw new SpendLimitReachedError(spent, spendLimit.limit, CREDIT_COSTS[action]);
  }

  const session = await createJobFeedApplicationSessionAdmin({ userId, job, generationPending: false });
  captureJobFeedEvent({
    distinctId: userId,
    event: 'job_feed_apply_session_created',
    properties: {
      session_id: session.id,
      job_id: jobId,
      company: job.company,
      title: job.title,
      feed_run_id: rankedItem.run_id,
      subscription_tier: subscriptionTier,
      source: 'mcp',
    },
  });

  // Link the feed row to the application. A kit is an application started, as on the web. A fit
  // check only opens it: the role stays in the inbox and no generation is marked pending.
  if (mode === 'kit') {
    await recordJobFeedFeedbackAdmin({
      userId,
      jobId,
      action: 'apply_started',
      latestRunId: rankedItem.run_id,
      applicationSessionId: session.id,
    });
  } else {
    await jobFeedRepo.upsertFeedback(userId, {
      canonical_job_id: jobId,
      latest_run_id: rankedItem.run_id,
      opened_at: existingFeedback?.opened_at ?? new Date().toISOString(),
      application_session_id: session.id,
    });
  }

  return { applicationId: session.id, created: true, jobTitle: session.job_title ?? job.title, company: session.company ?? job.company };
}
