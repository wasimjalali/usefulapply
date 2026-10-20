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

import { runFitAnalysis, type MasterContext } from '@/lib/agents';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import * as sessionsRepo from '@/db/repos/sessions';
import { cacheContext } from './context-cache';
import { InvalidInputError, NotFoundError } from './errors';
import { loadJobPreferences, loadOwnedCvSources } from './kit-generation';
import { persistFitResult } from './kit';

export interface FitAnalysisOutput {
  contextId: string;
  fit: NonNullable<MasterContext['fitAnalysis']>;
  job: { title: string; companyName: string } | null;
  detectedLanguage: string | null;
  matchScore: number | null;
  /** The application revision after the analysis was saved. */
  revision: number | null;
}

/** The deterministic context id for one idempotency key, so a retry names the same context. */
export function fitContextIdFor(idempotencyKey: string): string {
  return `ctx-${idempotencyKey}`;
}

export async function analyzeApplicationFit(params: {
  userId: string;
  sessionId: string;
  contextId: string;
  requestId: string;
}): Promise<FitAnalysisOutput> {
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

  // The pending-fit stash the web client restores from. Workflow state: no revision bump.
  const existingArtifacts = session.generated_artifacts && typeof session.generated_artifacts === 'object' && !Array.isArray(session.generated_artifacts)
    ? session.generated_artifacts as Record<string, unknown>
    : {};
  const stashed = await sessionsRepo.updateSession(userId, sessionId, {
    generated_artifacts: {
      ...existingArtifacts,
      pendingFitAnalysis: {
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
      },
    },
  }, { bumpRevision: false });
  if (stashed.error) console.error('[fit-analysis] could not stash the pending fit analysis:', stashed.error.message);

  const saved = await persistFitResult(userId, sessionId, {
    job: context.job,
    match: context.match,
    detectedLanguage: context.detectedLanguage,
    fitAnalysis: context.fitAnalysis,
  });

  return {
    contextId,
    fit: context.fitAnalysis,
    job: context.job ? { title: context.job.title, companyName: context.job.companyName } : null,
    detectedLanguage: context.detectedLanguage ?? null,
    matchScore: typeof context.match?.score === 'number' ? Math.round(context.match.score) : null,
    revision: saved?.revision ?? null,
  };
}
