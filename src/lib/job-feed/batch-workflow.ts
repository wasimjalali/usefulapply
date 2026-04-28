/**
 * Batch-mode workflow for the Job Feed ranking stage.
 *
 * The sync path (runJobFeedFoundationWorkflow) ranks with a blocking call to
 * Azure OpenAI and writes completed ranked_items in the same transaction.
 * The batch path splits this into two phases:
 *
 *   Phase A — stage: Ingestion + prefilter run synchronously (fast, ~2s).
 *             The ranking payload is submitted to the Azure Batch API and
 *             the run row is marked ranking_mode='batch' with batch_id set.
 *             The run status is 'running' (workflow_status='awaiting_batch')
 *             until reconciliation lands.
 *
 *   Phase B — reconcile: Poller checks the batch, once completed downloads
 *             the JSONL output, parses the response for each run's custom_id
 *             and populates ranked_items using the same validate+persist
 *             path as the sync workflow.
 *
 * Cost: 50% of sync pricing. SLA: 24 hours (in practice, usually minutes).
 * Feature flag: JOB_FEED_BATCH_RANKING_ENABLED=true to enable for scheduled
 * runs. Manual force-reruns and Apply-with-Karko never use batch — they
 * always go through the sync path for immediate feedback.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { getJobFeedTierLimits } from '@/lib/job-feed/constants';
import { ingestJobFeedRunJobs } from '@/lib/job-feed/ingestion';
import {
  prefilterJobFeedJobs,
  prepareJobFeedRankingCandidates,
} from '@/lib/job-feed/prefilter';
import {
  fetchJobFeedBatchOutput,
  getJobFeedBatchStatus,
  parseBatchEntryToRankedItems,
  submitJobFeedBatch,
  type BatchSubmissionInput,
} from '@/lib/job-feed/batch-ranker';
import type {
  JobFeedCanonicalJob,
  JobFeedRun,
  JobFeedSettings,
  Json,
} from '@/lib/supabase/types';
import type { JobFeedRankingCandidate, JobFeedRankingExecutionResult } from '@/lib/job-feed/types';

type AdminClient = ReturnType<typeof createAdminClient>;

interface StagedRun {
  run: JobFeedRun;
  settings: JobFeedSettings;
  candidates: JobFeedRankingCandidate[];
  visibleCap: number;
  yearsExperience: number | null;
}

const STALE_AWAITING_BATCH_RUN_MS = 30 * 60 * 1000;

/**
 * Submit one Batch API job containing every due user's ranking payload.
 * The Inngest scheduled sweep calls this instead of runJobFeedFoundationWorkflow
 * per user when the feature flag is on.
 */
export async function submitJobFeedBatchForStagedRuns(
  staged: StagedRun[]
): Promise<{ batchId: string; inputFileId: string; submittedRunIds: string[] } | null> {
  if (staged.length === 0) return null;

  const batchInputs: BatchSubmissionInput[] = staged.map((item) => ({
    runId: item.run.id,
    settings: item.settings,
    candidates: item.candidates,
    visibleCap: item.visibleCap,
    yearsExperience: item.yearsExperience,
  }));

  const submission = await submitJobFeedBatch(batchInputs);

  const submittedAt = new Date().toISOString();
  const admin = createAdminClient();

  // Mark every affected run as batch-pending.
  for (const item of staged) {
    await persistBatchSubmissionOnRun(admin, {
      runId: item.run.id,
      batchId: submission.batchId,
      inputFileId: submission.inputFileId,
      status: submission.status,
      submittedAt,
    });
  }

  return {
    batchId: submission.batchId,
    inputFileId: submission.inputFileId,
    submittedRunIds: staged.map((item) => item.run.id),
  };
}

interface BatchReconcileResult {
  batchId: string;
  status: string;
  runsReconciled: number;
  runsFailed: number;
}

/**
 * Poll a batch and, if completed, persist ranked_items for every staged run
 * using the same validate+persist code as the sync path.
 */
export async function reconcileJobFeedBatch(batchId: string): Promise<BatchReconcileResult> {
  const status = await getJobFeedBatchStatus(batchId);

  // Terminal non-success states (expired, cancelled, failed): mark affected
  // runs as failed and fall back to deterministic ranking for each so users
  // still see something rather than a perpetually-running feed.
  if (status.status === 'expired' || status.status === 'cancelled' || status.status === 'failed') {
    await updateBatchStatusForRuns(batchId, status.status);
    const fallbackCount = await applyDeterministicFallbackForBatch(batchId, status.status);
    return {
      batchId,
      status: status.status,
      runsReconciled: fallbackCount,
      runsFailed: 0,
    };
  }

  if (status.status !== 'completed') {
    // Still pending — just update batch_status and wait for the next tick.
    await updateBatchStatusForRuns(batchId, status.status);
    return {
      batchId,
      status: status.status,
      runsReconciled: 0,
      runsFailed: 0,
    };
  }

  if (!status.outputFileId) {
    // Batch says completed but has no output file: treat as failed.
    await updateBatchStatusForRuns(batchId, 'failed');
    const fallbackCount = await applyDeterministicFallbackForBatch(batchId, 'failed');
    return { batchId, status: 'failed', runsReconciled: fallbackCount, runsFailed: 0 };
  }

  const entries = await fetchJobFeedBatchOutput(status.outputFileId);
  const admin = createAdminClient();
  let reconciled = 0;
  let failed = 0;

  for (const entry of entries) {
    try {
      await applyBatchEntryToRun(admin, entry);
      reconciled += 1;
    } catch (error) {
      failed += 1;
      console.error('[BatchReconcile] failed run', entry.runId, error);
    }
  }

  await updateBatchStatusForRuns(batchId, 'completed');

  return {
    batchId,
    status: 'completed',
    runsReconciled: reconciled,
    runsFailed: failed,
  };
}

export async function reconcileStaleJobFeedBatchRuns(params?: {
  now?: Date;
  limit?: number;
}): Promise<{ runsReconciled: number; runsFailed: number }> {
  const now = params?.now ?? new Date();
  const cutoffMs = now.getTime() - STALE_AWAITING_BATCH_RUN_MS;
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not understand job_feed_runs here.
  const typedAdmin = admin as any;
  const { data, error } = await typedAdmin
    .from('job_feed_runs')
    .select('id, started_at, created_at, metadata')
    .eq('status', 'running')
    .eq('ranking_mode', 'batch')
    .order('created_at', { ascending: true })
    .limit(params?.limit ?? 50);

  if (error) {
    throw new Error(`Failed to load stale batch job feed runs: ${error.message}`);
  }

  const staleRuns = ((data ?? []) as Array<{ id: string; started_at: string | null; created_at: string; metadata: Json }>)
    .filter((run) => {
      const metadata = isRecord(run.metadata) ? run.metadata : {};
      if (metadata.workflow_status !== 'awaiting_batch') return false;

      const referenceTime = run.started_at ?? run.created_at;
      const timestamp = referenceTime ? Date.parse(referenceTime) : Number.NaN;
      return !Number.isNaN(timestamp) && timestamp < cutoffMs;
    });

  let runsReconciled = 0;
  let runsFailed = 0;

  for (const run of staleRuns) {
    try {
      await applyBatchEntryToRun(admin, {
        runId: run.id,
        success: false,
        content: null,
        inputTokens: 0,
        outputTokens: 0,
        errorMessage: 'Stale batch run exceeded the awaiting-batch recovery window; deterministic fallback applied.',
      });
      runsReconciled += 1;
    } catch (error) {
      runsFailed += 1;
      console.error('[BatchReconcile] stale batch fallback failed for run', run.id, error);
    }
  }

  return { runsReconciled, runsFailed };
}

/**
 * Apply the deterministic-score ranking to every run in a batch that failed
 * terminally. Ensures users still get a feed (less accurate than LLM, but
 * still useful) rather than a perpetually-running run.
 */
async function applyDeterministicFallbackForBatch(
  batchId: string,
  terminalStatus: string
): Promise<number> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not understand job_feed_runs here.
  const typedAdmin = admin as any;

  const { data: runs } = await typedAdmin
    .from('job_feed_runs')
    .select('id')
    .eq('batch_id', batchId);

  const runIds = ((runs ?? []) as Array<{ id: string }>).map((row) => row.id);
  let applied = 0;

  for (const runId of runIds) {
    try {
      await applyBatchEntryToRun(admin, {
        runId,
        success: false,
        content: null,
        inputTokens: 0,
        outputTokens: 0,
        errorMessage: `Batch ${batchId} ended with status ${terminalStatus}; deterministic fallback applied.`,
      });
      applied += 1;
    } catch (error) {
      console.error('[BatchReconcile] fallback failed for run', runId, error);
    }
  }

  return applied;
}

async function applyBatchEntryToRun(
  admin: AdminClient,
  entry: { runId: string; content: string | null; success: boolean; inputTokens: number; outputTokens: number; errorMessage: string | null }
): Promise<void> {
  // Reload the run + candidate set we staged earlier. The canonical_jobs row
  // IDs we staged live in metadata.ranking_candidate_ids so the reconciler
  // can rebuild the same ranking input the batch saw.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not understand job_feed_runs here.
  const typedAdmin = admin as any;
  const { data: runRow, error: loadError } = await typedAdmin
    .from('job_feed_runs')
    .select('*')
    .eq('id', entry.runId)
    .maybeSingle();

  if (loadError || !runRow) {
    throw new Error(`Batch reconciler could not load run ${entry.runId}.`);
  }

  const metadata = isRecord(runRow.metadata) ? runRow.metadata : {};
  const candidateIds = Array.isArray(metadata.batch_ranking_candidate_ids)
    ? (metadata.batch_ranking_candidate_ids as string[]).filter((id): id is string => typeof id === 'string')
    : [];

  if (candidateIds.length === 0) {
    throw new Error(`Run ${entry.runId} has no staged candidates for batch reconciliation.`);
  }

  const { data: candidateRows } = await typedAdmin
    .from('job_feed_canonical_jobs')
    .select('*')
    .in('id', candidateIds);

  const candidates = ((candidateRows ?? []) as JobFeedCanonicalJob[]);
  const { data: settingsRow } = await typedAdmin
    .from('job_feed_settings')
    .select('*')
    .eq('user_id', runRow.user_id)
    .maybeSingle();

  if (!settingsRow) {
    throw new Error(`Settings missing for run ${entry.runId} during batch reconcile.`);
  }

  const tierLimits = getJobFeedTierLimits(
    typeof metadata.subscription_tier === 'string' ? metadata.subscription_tier : 'plus'
  );

  const rankingPrep = prepareJobFeedRankingCandidates({
    settings: settingsRow as JobFeedSettings,
    jobs: candidates,
  });

  let rankingResult: JobFeedRankingExecutionResult;
  if (entry.success && entry.content) {
    const parsedItems = parseBatchEntryToRankedItems(
      entry.content,
      rankingPrep.candidates,
      tierLimits.visibleCount
    );
    if (parsedItems) {
      rankingResult = {
        status: 'completed_llm',
        items: parsedItems,
        errorMessage: null,
        model: {
          provider: 'openai',
          name: 'gpt-4.1-mini',
          inputTokens: entry.inputTokens,
          outputTokens: entry.outputTokens,
          latencyMs: 0,
        },
      };
    } else {
      rankingResult = await fallbackDeterministicRanking(rankingPrep.candidates, tierLimits.visibleCount);
    }
  } else {
    rankingResult = await fallbackDeterministicRanking(rankingPrep.candidates, tierLimits.visibleCount);
  }

  // Persist ranked items. Delete any stale rows first (force-rerun reset
  // already cleared them on submit, but defensive).
  await typedAdmin
    .from('job_feed_ranked_items')
    .delete()
    .eq('run_id', entry.runId);

  if (rankingResult.items.length > 0) {
    await typedAdmin
      .from('job_feed_ranked_items')
      .insert(rankingResult.items.map((item) => ({
        run_id: entry.runId,
        user_id: runRow.user_id,
        canonical_job_id: item.canonicalJobId,
        rank_position: item.rank,
        fit_label: item.fitLabel,
        ranking_source: item.rankingSource,
        reason: item.reason,
        deterministic_score: item.deterministicScore,
        metadata: {},
      })));
  }

  await typedAdmin
    .from('job_feed_runs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      ranked_jobs_count: rankingResult.items.length,
      batch_status: 'completed',
      batch_completed_at: new Date().toISOString(),
      metadata: {
        ...metadata,
        workflow_status: 'completed',
        ranking_status: rankingResult.status,
        ranking_error: rankingResult.errorMessage,
        ranking_model: rankingResult.model
          ? {
              provider: rankingResult.model.provider,
              name: rankingResult.model.name,
              input_tokens: rankingResult.model.inputTokens,
              output_tokens: rankingResult.model.outputTokens,
              latency_ms: rankingResult.model.latencyMs,
            }
          : null,
        ranked_items_materialized: rankingResult.items.length > 0,
      },
    })
    .eq('id', entry.runId);
}

async function fallbackDeterministicRanking(
  candidates: JobFeedRankingCandidate[],
  visibleCap: number
): Promise<JobFeedRankingExecutionResult> {
  const items = [...candidates]
    .sort((a, b) => b.deterministicScore - a.deterministicScore || a.deterministicRank - b.deterministicRank)
    .slice(0, visibleCap)
    .map((candidate, index) => ({
      canonicalJobId: candidate.jobId,
      rank: index + 1,
      fitLabel: candidate.deterministicFitLabel,
      rankingSource: 'deterministic' as const,
      reason: null,
      deterministicScore: candidate.deterministicScore,
    }));

  return {
    status: 'llm_failed_fallback',
    items,
    errorMessage: 'Batch ranking did not return a usable response; deterministic fallback applied.',
    model: null,
  };
}

async function persistBatchSubmissionOnRun(
  admin: AdminClient,
  params: {
    runId: string;
    batchId: string;
    inputFileId: string;
    status: string;
    submittedAt: string;
  }
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not understand job_feed_runs here.
  const typedAdmin = admin as any;
  await typedAdmin
    .from('job_feed_runs')
    .update({
      ranking_mode: 'batch',
      batch_id: params.batchId,
      batch_input_file_id: params.inputFileId,
      batch_status: params.status,
      batch_submitted_at: params.submittedAt,
    })
    .eq('id', params.runId);
}

async function updateBatchStatusForRuns(batchId: string, status: string): Promise<void> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not understand job_feed_runs here.
  const typedAdmin = admin as any;
  await typedAdmin
    .from('job_feed_runs')
    .update({ batch_status: status })
    .eq('batch_id', batchId);
}

function isRecord(value: unknown): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Query for runs that still need batch reconciliation. Used by the poller.
 */
export async function listPendingBatchIds(): Promise<string[]> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query inference does not understand job_feed_runs here.
  const typedAdmin = admin as any;
  const { data } = await typedAdmin
    .from('job_feed_runs')
    .select('batch_id')
    .eq('ranking_mode', 'batch')
    .not('batch_id', 'is', null)
    .not('batch_status', 'in', '(completed,failed,expired,cancelled)');

  const ids = new Set<string>();
  for (const row of (data ?? []) as Array<{ batch_id: string | null }>) {
    if (row.batch_id) ids.add(row.batch_id);
  }
  return Array.from(ids);
}
