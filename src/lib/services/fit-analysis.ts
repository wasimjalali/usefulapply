/**
 * Fit analysis for a stored application, run headlessly (the MCP
 * `analyze_job_fit` tool). It does what the agent-v2 route does for the
 * `fit_analysis` action, minus the stream: runs the analysis phase against the
 * CV the server holds, caches the resulting context under `contextId` (so a
 * kit that continues this fit earns the after-fit price), stashes the pending
 * fit on the application and saves what the analysis learned about the ad.
 *
 * Credits are the caller's business (inline-operations.ts reserves and
 * settles them). Ownership comes from `userId`; the CV is the user's stored
 * primary CV, never text from the caller.
 */

import type { SQL } from 'drizzle-orm';
import { runFitAnalysis, type MasterContext } from '@/lib/agents';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import * as sessionsRepo from '@/db/repos/sessions';
import { cacheContext } from './context-cache';
import { InvalidInputError, NotFoundError } from './errors';
import { loadJobPreferences, loadOwnedCvSources } from './kit-generation';
import { buildSessionUpdateStatement, fitResultColumns } from './kit';

export interface FitAnalysisRun {
  contextId: string;
  fit: NonNullable<MasterContext['fitAnalysis']>;
  job: { title: string; companyName: string } | null;
  detectedLanguage: string | null;
  matchScore: number | null;
  /**
   * The statements that save what the analysis learned, built against the application as it stands now
   * and not run, so the caller can commit them with its own settlement (inline-operations.ts). The
   * last statement is the revision-guarded write; `guard` is ANDed into every one. `revision` is the
   * application revision once they commit.
   */
  buildWrite(guard: SQL, now: string): Promise<{ statements: SQL[]; revision: number }>;
}

/** The deterministic context id for one idempotency key, so a retry names the same context. */
export function fitContextIdFor(idempotencyKey: string): string {
  return `ctx-${idempotencyKey}`;
}

/** Run the analysis. The only things written are the cached context and, when the caller commits `buildWrite`, the application. */
export async function analyzeApplicationFit(params: {
  userId: string;
  sessionId: string;
  contextId: string;
  requestId: string;
}): Promise<FitAnalysisRun> {
  const { userId, sessionId, contextId } = params;
  const session = await sessionsRepo.getSession(userId, sessionId);
  if (!session) throw new NotFoundError();
  if (!session.job_description?.trim()) throw new InvalidInputError('This application has no job description to analyze.');
  const sources = await loadOwnedCvSources(userId);
  if (!sources.primaryCV) throw new InvalidInputError('A primary CV is needed before a fit analysis. Save one first.');

  const generationContext: LlmGenerationContext = {
    requestExecutionId: crypto.randomUUID(),
    clientRequestId: params.requestId,
    userId,
    applicationSessionId: sessionId,
    route: 'service:fit-analysis',
    feature: 'fit_analysis',
    operation: 'fit_analysis',
  };
  const result = await runFitAnalysis({
    sessionId: `fit-${crypto.randomUUID()}`,
    jobDescription: session.job_description,
    primaryCV: sources.primaryCV,
    masterCV: sources.masterCV,
    jobPreferences: await loadJobPreferences(userId),
    generationContext,
  }, () => {});
  if (!result.success || !result.data) throw new Error(result.error || 'Fit analysis failed');
  const context = result.data.context;
  if (!context.fitAnalysis) throw new Error('Fit analysis returned no assessment');

  await cacheContext(userId, contextId, context);

  const pendingFitAnalysis = {
    contextId,
    jobDescription: session.job_description,
    contextData: {
      applicant: context.applicant,
      job: context.job,
      match: context.match,
      verifiedMetrics: context.verifiedMetrics,
      detectedLanguage: context.detectedLanguage,
      fitAnalysis: context.fitAnalysis,
    },
    createdAt: new Date().toISOString(),
  };
  const fitAnalysis = context.fitAnalysis;

  return {
    contextId,
    fit: context.fitAnalysis,
    job: context.job ? { title: context.job.title, companyName: context.job.companyName } : null,
    detectedLanguage: context.detectedLanguage ?? null,
    matchScore: typeof context.match?.score === 'number' ? Math.round(context.match.score) : null,
    async buildWrite(guard, now) {
      const row = await sessionsRepo.getSession(userId, sessionId);
      if (!row) throw new NotFoundError();
      // The pending-fit stash the web client restores from rides in the same write as what the
      // analysis learned about the ad: one revision bump, one commit.
      const existingArtifacts = row.generated_artifacts && typeof row.generated_artifacts === 'object' && !Array.isArray(row.generated_artifacts)
        ? row.generated_artifacts as Record<string, unknown>
        : {};
      const columns = {
        ...fitResultColumns(row, {
          job: context.job,
          match: context.match,
          detectedLanguage: context.detectedLanguage,
          fitAnalysis,
        }),
        generated_artifacts: { ...existingArtifacts, pendingFitAnalysis },
      };
      return {
        statements: [buildSessionUpdateStatement(userId, sessionId, columns, row.revision, now, guard)],
        revision: row.revision + 1,
      };
    },
  };
}
