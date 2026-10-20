/**
 * The core of kit generation, shared by the agent-v2 route (streaming to the
 * browser) and the Queue runner (headless, for MCP).
 *
 * It owns what both must do identically:
 * - which credit action a kit costs (the fit-continuation discount is claimed
 *   server-side) and how its reservation is made;
 * - running the writer pipeline;
 * - the shape of a finished kit (`KitResults`);
 * - how much a partially failed kit refunds.
 *
 * Neither caller's transport lives here: the route streams events and settles
 * credits in separate steps as it always has, the runner finishes in one atomic
 * batch (generation-runner.ts).
 */

import {
  runJobCopilot,
  runWithContext,
  KIT_DOCUMENTS,
  type AgentEventHandler,
  type KitDocument,
  type KitDocumentErrors,
  type MasterContext,
} from '@/lib/agents';
import { CREDIT_COSTS, KIT_DOCUMENT_FAILURE_REFUND } from '@/lib/credit-costs';
import { getDocumentByType } from '@/db/repos/documents';
import { getJobPreferences } from '@/db/repos/jobFeed';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import {
  canUseFitContinuation,
  claimFitContinuation,
  releaseReservation,
  reserveCredits,
  type ReserveCreditResult,
} from '@/lib/supabase/credit-reservations';
import type { KitResults } from './kit';

/** The payload a finished kit run is shaped into. Same fields the route has always streamed as `workflow_complete.results`. */
export function buildKitResults(ctx: MasterContext, documentErrors: KitDocumentErrors): KitResults {
  // A document listed as failed is nulled here whatever the context says, so
  // a failed document can never ship, persist and be refunded at once
  // (defence in depth behind runWithContext's copy).
  return {
    job: ctx.job,
    companyResearch: ctx.companyResearch,
    match: ctx.match,
    optimizedCV: documentErrors.cv ? null : ctx.optimizedCV,
    optimizedCVData: documentErrors.cv ? null : ctx.optimizedCVData,
    coverLetter: documentErrors.coverLetter ? null : ctx.coverLetter,
    coverLetterStructured: documentErrors.coverLetter ? null : ctx.coverLetterStructured ?? null,
    applicationEmail: documentErrors.applicationEmail ? null : ctx.applicationEmail,
    followUpEmail: documentErrors.followUpEmail ? null : ctx.followUpEmail || null,
    detectedLanguage: ctx.detectedLanguage,
    documentErrors,
    sourceContext: {
      applicant: ctx.applicant,
      verifiedMetrics: ctx.verifiedMetrics,
    },
  };
}

/** The documents that failed and the credits to give back for them: each one's single-document price. */
export function kitFailureRefund(documentErrors: KitDocumentErrors): { failed: KitDocument[]; amount: number } {
  const failed = KIT_DOCUMENTS.filter((document) => documentErrors[document]);
  const amount = failed.reduce((sum, document) => sum + KIT_DOCUMENT_FAILURE_REFUND[document], 0);
  return { failed: [...failed], amount };
}

export async function loadOwnedCvSources(userId: string): Promise<{ primaryCV: string; masterCV?: string }> {
  const [primaryDocument, masterDocument] = await Promise.all([
    getDocumentByType(userId, 'primary_cv'),
    getDocumentByType(userId, 'master_cv'),
  ]);
  return {
    primaryCV: primaryDocument?.raw_text?.trim() || '',
    masterCV: masterDocument?.raw_text?.trim() || undefined,
  };
}

/** Best effort, never blocks a generation. */
export async function loadJobPreferences(userId: string): Promise<MasterContext['jobPreferences']> {
  try {
    const prefs = await getJobPreferences(userId);
    if (!prefs) return undefined;
    return {
      salaryFloor: prefs.salary_floor,
      remotePreference: prefs.remote_preference,
      employmentTypes: prefs.employment_types,
      targetMarket: prefs.target_market,
      seniorityTarget: prefs.seniority_target,
    };
  } catch (error) {
    console.error('[kit-generation] Failed to load job preferences (continuing without):', error);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

export type KitCreditAction = 'GENERATION_AFTER_FIT' | 'FULL_APPLICATION';

export interface ReservedKitCredits {
  result: ReserveCreditResult;
  /** Idempotency key of the reservation that stands (the full-price one after a lost claim). */
  key: string;
  action: KitCreditAction;
  cost: number;
  /** Set only while a fit-continuation discount is claimed. Release it if the kit fails. */
  continuation: { userId: string; contextId: string; requestId: string } | null;
}

/**
 * Reserve the credits for one kit. With a `contextId` the 1.5 credit
 * after-fit price applies when this user has a captured fit analysis for that
 * context; the discount is claimed here, server side, and a lost claim falls
 * back to the full 2.0. `onReservation` fires whenever the reservation that
 * must be released on failure changes, so a caller's catch block always knows
 * what it holds.
 */
export async function reserveKitCredits(params: {
  userId: string;
  sessionId?: string | null;
  contextId?: string | null;
  requestId: string;
  keyFor: (action: KitCreditAction) => string;
  onReservation?: (key: string | null) => void;
}): Promise<ReservedKitCredits> {
  const { userId, sessionId, contextId, requestId } = params;
  const discount = contextId ? await canUseFitContinuation(userId, contextId, requestId) : false;
  let action: KitCreditAction = discount ? 'GENERATION_AFTER_FIT' : 'FULL_APPLICATION';
  let key = params.keyFor(action);
  let result = await reserveCredits({
    userId,
    action,
    idempotencyKey: key,
    sessionId,
    metadata: action === 'GENERATION_AFTER_FIT'
      ? { fit_context_id: contextId, fit_continuation_request_id: requestId }
      : undefined,
  });
  let continuation: ReservedKitCredits['continuation'] = null;
  if (result.success) params.onReservation?.(key);

  if (result.success && action === 'GENERATION_AFTER_FIT') {
    const claimed = await claimFitContinuation(userId, contextId as string, requestId, result.reservation!.id);
    if (claimed) {
      continuation = { userId, contextId: contextId as string, requestId };
    } else {
      const released = await releaseReservation({
        userId,
        idempotencyKey: key,
        reason: 'fit_continuation_claim_lost',
      });
      if (!released.success) {
        throw new Error('Failed to release a superseded continuation reservation');
      }
      params.onReservation?.(null);
      action = 'FULL_APPLICATION';
      key = params.keyFor(action);
      result = await reserveCredits({
        userId,
        action,
        idempotencyKey: key,
        sessionId,
      });
      if (result.success) params.onReservation?.(key);
    }
  }
  return { result, key, action, cost: CREDIT_COSTS[action], continuation };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Run the writer pipeline for one kit and shape the answer.
 *
 * With a cached fit context it runs only the writing phase
 * (`generate_with_context`); without one it runs analysis and writing in one
 * pass (`full_optimization`). Throws when the run produced nothing: a kit with
 * at least one document is a success, a kit with none is a failure the caller
 * releases in full.
 */
export async function runKitPipeline(params: {
  sessionId: string;
  jobDescription: string;
  primaryCV: string;
  masterCV?: string;
  jobPreferences?: MasterContext['jobPreferences'];
  cachedContext?: MasterContext | null;
  /** Recipient details from the stored row (never from the ad or the model). */
  letterRecipient?: MasterContext['letterRecipient'];
  emit: AgentEventHandler;
  generationContext: LlmGenerationContext;
}): Promise<{ results: KitResults; documentErrors: KitDocumentErrors }> {
  let result;
  if (params.cachedContext) {
    const context = params.cachedContext;
    if (params.jobPreferences) context.jobPreferences = params.jobPreferences;
    context.letterRecipient = params.letterRecipient;
    result = await runWithContext(context, params.emit, params.generationContext);
  } else {
    result = await runJobCopilot({
      sessionId: params.sessionId,
      jobDescription: params.jobDescription,
      primaryCV: params.primaryCV,
      masterCV: params.masterCV,
      jobPreferences: params.jobPreferences,
      letterRecipient: params.letterRecipient,
      generationContext: params.generationContext,
    }, params.emit);
  }
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Generation failed');
  }
  const documentErrors = result.data.documentErrors ?? {};
  return { results: buildKitResults(result.data.context, documentErrors), documentErrors };
}
