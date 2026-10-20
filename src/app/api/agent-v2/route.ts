/**
 * Agent V2 API Route - Useful Apply Architecture
 * 
 * Useful Apply handles the complete workflow:
 * 1. Parse CV and analyze job requirements
 * 2. Match skills and identify gaps
 * 3. Optimize CV for the position
 * 4. Compose tailored cover letter
 * 5. Generate application email
 * 
 * Streams progress updates to the client for real-time UI feedback
 */

import { NextRequest } from 'next/server';
import {
  runJobCopilot,
  runFitAnalysis,
  runWithContext,
  type AgentEvent,
  type KitDocumentErrors,
  type MasterContext,
} from '@/lib/agents';
import { getCurrentUser } from '@/auth/server';
import { getSession, updateSession } from '@/db/repos/sessions';
import { isStructuredCoverLetter } from '@/lib/cover-letter/contract';
import { saveLetterRecipientFromAd } from '@/lib/agents/persist-letter-recipient';
import { isSameStoredText, storedTextOrEmpty } from '@/db/trim-text';
import { getDocumentByType } from '@/db/repos/documents';
import { getJobPreferences } from '@/db/repos/jobFeed';
import { claimAnonymousGeneration, releaseAnonymousGeneration } from '@/db/repos/anonymous';
import { CREDIT_COSTS } from '@/lib/middleware/creditCheck';
import {
  reserveCredits,
  captureReservation,
  releaseReservation,
  refundReservationPartially,
  releaseFitContinuationClaim,
} from '@/lib/supabase/credit-reservations';
import { transitionJobFeedApplicationGenerationAdmin } from '@/lib/job-feed/server';
import { getPostHogServer } from '@/lib/posthog-server';
import { ACTIVE_MODEL_ID, ACTIVE_MODEL_PRICING } from '@/lib/models';
import { randomUUID, createHash } from 'crypto';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import type { ReserveCreditResult } from '@/lib/supabase/credit-reservations';
import {
  cacheContext,
  getCachedContext,
  normalizeCachedMatch,
  removeCachedContext,
} from '@/lib/services/context-cache';
import { persistKit, type KitResults } from '@/lib/services/kit';
import { NotFoundError } from '@/lib/services/errors';
import { buildKitResults, kitFailureRefund, reserveKitCredits } from '@/lib/services/kit-generation';

export const runtime = 'nodejs';
export const maxDuration = 300;

// =====================================================
// SERVER-SIDE CONTEXT CACHE
// Stores MasterContext from fit analysis for reuse in full generation
// TTL: 30 minutes, keyed by contextId
// Prefers Workers KV (shared across isolates). Falls back to an in-memory
// Map when the CONTEXT_CACHE binding is missing (plain `next dev`).
// =====================================================
function reservationErrorPayload(result: ReserveCreditResult, required: number) {
  if (result.code === 'RESERVATION_IN_FLIGHT') {
    return { type: 'error', code: 'REQUEST_IN_PROGRESS', message: 'This request is already in progress.' };
  }
  if (result.code === 'RESERVATION_SPENT') {
    return { type: 'error', code: 'REQUEST_ALREADY_COMPLETED', message: 'This request already completed.' };
  }
  return {
    type: 'error',
    code: 'INSUFFICIENT_CREDITS',
    message: result.error || 'Insufficient credits',
    details: {
      required: result.required ?? required,
      available: result.available ?? 0,
      upgradeRequired: true,
    },
  };
}

// Server-side artifact persistence — writes generated output to
// application_sessions.generated_artifacts so results survive browser crashes.
async function persistGeneratedArtifacts(
  sessionId: string | undefined,
  userId: string,
  results: Record<string, unknown>,
  mergeExisting = false,
): Promise<void> {
  if (!sessionId || !userId || sessionId.startsWith('session-') || sessionId.startsWith('fit-')) {
    console.warn('[agent-v2] Generated artifacts were not persisted because no stored session was available');
    return;
  }
  try {
    let nextArtifacts = results;
    if (mergeExisting) {
      const session = await getSession(userId, sessionId);
      const existingArtifacts = session?.generated_artifacts;
      if (existingArtifacts && typeof existingArtifacts === 'object' && !Array.isArray(existingArtifacts)) {
        nextArtifacts = { ...existingArtifacts as Record<string, unknown>, ...results };
      }
    }
    // The pending-fit stash is workflow state, not content an editor ever
    // writes back, so it does not bump the revision. Bumping it would make the
    // browser conflict with its own fit analysis on the next save.
    const persisted = await updateSession(userId, sessionId, { generated_artifacts: nextArtifacts }, { bumpRevision: false });
    if (persisted.error) {
      console.error('[agent-v2] Failed to persist generated artifacts:', persisted.error);
    }
  } catch (error) {
    console.error('[agent-v2] Failed to persist generated artifacts:', error);
  }
}

// The finished kit goes to D1 through the kit service, the one writer of
// generation output (the browser no longer writes it). Unlike the pending-fit
// stash this is not best effort: the browser used to write the kit itself as a
// backstop, now this is the only copy, so a write that keeps failing throws and
// the catch block releases the reservation instead of charging for a kit that
// would vanish on reload. A missing or local session is the one quiet case:
// there is no stored application to write to.
async function persistKitForSession(
  sessionId: string | undefined,
  userId: string | undefined,
  results: KitResults,
  /** The job description the kit was written for; needed to save the letter's recipient. */
  letterJobDescription?: string,
): Promise<void> {
  if (!sessionId || !userId || sessionId.startsWith('session-') || sessionId.startsWith('fit-')) {
    console.warn('[agent-v2] Kit was not persisted because no stored session was available');
    return;
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await persistKit(userId, sessionId, results);
      if (letterJobDescription && isStructuredCoverLetter(results.coverLetterStructured)) {
        try {
          await saveLetterRecipientFromAd(userId, sessionId, letterJobDescription, results.coverLetterStructured);
        } catch (recipientError) {
          // The letter already carries the recipient; only the editable copy on
          // the session row is missing.
          console.error('[agent-v2] Failed to save the cover letter recipient:', recipientError);
        }
      }
      return;
    } catch (error) {
      if (error instanceof NotFoundError) {
        console.warn('[agent-v2] Kit was not persisted because the application no longer exists');
        return;
      }
      lastError = error;
      console.error('[agent-v2] Failed to persist the kit, attempt', attempt + 1, error);
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Failed to persist the kit');
}

// Post-generation bookkeeping is best-effort: a D1 write failure here must
// never discard output the model already produced. Reservation capture that
// fails leaves the row 'reserved' for the stale sweeper to release.
async function releaseAnonymousGenerationSafe(ipHash: string): Promise<void> {
  try {
    await releaseAnonymousGeneration(ipHash);
  } catch (e) {
    console.error('[agent-v2] Failed to release anonymous generation claim:', e);
  }
}

async function captureReservationSafe(params: { idempotencyKey: string; userId: string }): Promise<void> {
  try {
    await captureReservation(params);
  } catch (e) {
    console.error('[agent-v2] Failed to capture credit reservation:', e);
  }
}

// Best-effort server-side generation status transition for job-feed sessions.
// The browser also reports status, but the server transition is authoritative.
async function tryTransitionGeneration(
  sessionId: string | undefined,
  userId: string,
  status: 'running' | 'succeeded' | 'failed',
  errorMessage?: string,
): Promise<void> {
  if (!sessionId || sessionId.startsWith('session-') || sessionId.startsWith('fit-')) return;
  try {
    await transitionJobFeedApplicationGenerationAdmin({
      userId,
      sessionId,
      status,
      errorMessage: errorMessage?.slice(0, 1000) ?? null,
      transitionReason: `server_agent_v2_${status}`,
    });
  } catch {
    // Generation row may not exist if this isn't a job-feed session — silently skip.
  }
}

// Input length limits
const MAX_JOB_DESCRIPTION_LENGTH = 30_000;
const MAX_CV_LENGTH = 20_000;
const MAX_MASTER_CV_LENGTH = 30_000;

// Anonymous generation tracking helpers
function hashIP(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

interface AgentRequest {
  jobDescription: string;
  currentCV: string;
  masterCV?: string;
  action: 'full_optimization' | 'fit_analysis' | 'generate_with_context';
  contextId?: string; // For generate_with_context: references cached fit analysis context
  sessionId?: string;
  emailType?: 'application' | 'followup' | 'thankyou';
  enableWebSearch?: boolean;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      // PostHog LLM analytics — hoisted above try/catch so error tracking works in catch block
      const traceId = `trace_${randomUUID()}`;
      const requestExecutionId = randomUUID();
      const stepStartTimes = new Map<string, number>();
      let distinctId = 'anonymous';
      let currentAction = 'unknown';

      // Active model list price (per million tokens)
      const INPUT_COST_PER_M = ACTIVE_MODEL_PRICING.inputPerM;
      const OUTPUT_COST_PER_M = ACTIVE_MODEL_PRICING.outputPerM;

      const trackLLMStep = (stepId: string, tokens?: { input: number; output: number }) => {
        if (!tokens) return;
        try {
          const posthog = getPostHogServer();
          const inputCost = (tokens.input / 1_000_000) * INPUT_COST_PER_M;
          const outputCost = (tokens.output / 1_000_000) * OUTPUT_COST_PER_M;
          const totalCost = inputCost + outputCost;
          const stepStart = stepStartTimes.get(stepId);
          const latencySeconds = stepStart ? (Date.now() - stepStart) / 1000 : undefined;

          posthog.capture({
            distinctId,
            event: '$ai_generation',
            properties: {
              // Required PostHog LLM analytics properties
              $ai_provider: 'anthropic',
              $ai_model: ACTIVE_MODEL_ID,
              $ai_input_tokens: tokens.input,
              $ai_output_tokens: tokens.output,
              $ai_input_cost_usd: inputCost,
              $ai_output_cost_usd: outputCost,
              $ai_total_cost_usd: totalCost,
              $ai_is_error: false,
              $ai_http_status: 200,
              $ai_trace_id: traceId,
              ...(latencySeconds !== undefined && { $ai_latency: latencySeconds }),
              // Custom properties for segmentation
              step: stepId,
              total_tokens: tokens.input + tokens.output,
              feature: currentAction === 'fit_analysis' ? 'fit_analysis' : 'application_generation',
              workflow_action: currentAction,
            },
          });
        } catch (e) {
          console.error('[PostHog] LLM tracking error:', e);
        }
      };

      // Track LLM errors to PostHog
      const trackLLMError = (stepId: string, error: unknown) => {
        try {
          const posthog = getPostHogServer();
          const stepStart = stepStartTimes.get(stepId);
          const latencySeconds = stepStart ? (Date.now() - stepStart) / 1000 : undefined;

          posthog.capture({
            distinctId,
            event: '$ai_generation',
            properties: {
              $ai_provider: 'anthropic',
              $ai_model: ACTIVE_MODEL_ID,
              $ai_is_error: true,
              $ai_http_status: 500,
              $ai_trace_id: traceId,
              ...(latencySeconds !== undefined && { $ai_latency: latencySeconds }),
              $ai_error: error instanceof Error ? error.message : String(error),
              step: stepId,
              feature: currentAction === 'fit_analysis' ? 'fit_analysis' : 'application_generation',
              workflow_action: currentAction,
            },
          });
        } catch (e) {
          console.error('[PostHog] LLM error tracking error:', e);
        }
      };

      let activeReservationKey: string | null = null;
      let activeReservationUserId: string | null = null;
      let authenticatedUserId: string | null = null;
      let resolvedSessionId: string | undefined;
      let anonymousClaimHash: string | null = null;
      let activeFitContinuation: { userId: string; contextId: string; requestId: string } | null = null;

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 8000);

      try {
        // Authenticate before choosing a fallback limiter key. Anonymous
        // generation still requires a trusted edge IP for its free-use gate.
        const clientIP = getClientIP(request);
        const user = await getCurrentUser(request);
        authenticatedUserId = user?.id ?? null;
        const isAnonymous = !user;
        distinctId = user?.id || 'anonymous';

        if (isAnonymous && process.env.NODE_ENV === 'production' && clientIP === 'unknown') {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            message: "We couldn't verify this request. Please try again.",
          })}\n\n`));
          controller.close();
          return;
        }

        const limiterSubject = clientIP === 'unknown' && user ? `user:${user.id}` : clientIP;
        const rateLimitResult = await checkRateLimit(`agent-v2:${limiterSubject}`, RATE_LIMITS['agent-v2']);
        if (!rateLimitResult.allowed) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            message: 'Too many requests. Please wait a moment before trying again.',
          })}\n\n`));
          controller.close();
          return;
        }

        // Fetch job preferences for cover letter context (best-effort, never blocks generation)
        let jobPreferences: import('@/lib/agents/types').MasterContext['jobPreferences'] = undefined;
        if (user) {
          try {
            const prefs = await getJobPreferences(user.id);
            if (prefs) {
              jobPreferences = {
                salaryFloor: prefs.salary_floor,
                remotePreference: prefs.remote_preference,
                employmentTypes: prefs.employment_types,
                targetMarket: prefs.target_market,
                seniorityTarget: prefs.seniority_target,
              };
            }
          } catch (prefsError) {
            console.error('[agent-v2] Failed to load job preferences (continuing without):', prefsError);
          }
        }

        const body: AgentRequest = await request.json();
        const {
          jobDescription,
          currentCV,
          masterCV,
          action,
          contextId,
          sessionId: clientSessionId,
          enableWebSearch,
        } = body;
        resolvedSessionId = clientSessionId;
        currentAction = action;

        // Stable per-workflow idempotency key from the client. Reconnects
        // or network retries within the same workflow send the same
        // x-request-id, so reserveCredits dedupes instead of double-
        // deducting. Fall back to Date.now() if a client misses it.
        const clientRequestId = request.headers.get('x-request-id')
          ?? `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

        // Input length validation
        if (jobDescription && jobDescription.length > MAX_JOB_DESCRIPTION_LENGTH) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            message: `Job description is too long (${jobDescription.length} chars). Maximum allowed: ${MAX_JOB_DESCRIPTION_LENGTH} characters.`,
          })}\n\n`));
          controller.close();
          return;
        }
        if (currentCV && currentCV.length > MAX_CV_LENGTH) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            message: `CV text is too long (${currentCV.length} chars). Maximum allowed: ${MAX_CV_LENGTH} characters.`,
          })}\n\n`));
          controller.close();
          return;
        }
        if (masterCV && masterCV.length > MAX_MASTER_CV_LENGTH) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            message: `Master CV text is too long (${masterCV.length} chars). Maximum allowed: ${MAX_MASTER_CV_LENGTH} characters.`,
          })}\n\n`));
          controller.close();
          return;
        }

        // Action validation
        const validActions = ['full_optimization', 'fit_analysis', 'generate_with_context'];
        if (!validActions.includes(action)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            message: 'Invalid action',
          })}\n\n`));
          controller.close();
          return;
        }

        // Server-side anonymous tracking. Without an account the only thing on
        // offer is one fit check per IP; every kit needs a signed-in user.
        const ipHash = hashIP(clientIP);
        const contextOwnerId = user?.id ?? `anon:${ipHash}`;
        if (isAnonymous) {
          if (action !== 'fit_analysis') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              code: 'ANONYMOUS_LIMIT_REACHED',
              message: 'Create a free account to generate the kit. 4 credits included, no card.',
            })}\n\n`));
            controller.close();
            return;
          }
        }

        const attributableSession = user && clientSessionId
          && !clientSessionId.startsWith('session-')
          && !clientSessionId.startsWith('fit-')
          ? await getSession(user.id, clientSessionId)
          : null;
        const attributableSessionId = attributableSession?.id ?? null;
        // The cover letter's recipient address comes only from the stored row,
        // and only while that row still belongs to the job being written for:
        // a session whose JD was just replaced may hold the old employer.
        const letterRecipientFor = (jobDescriptionForRun: string): MasterContext['letterRecipient'] => (
          attributableSession && isSameStoredText(attributableSession.job_description, jobDescriptionForRun)
            ? {
                companyName: attributableSession.company,
                address: attributableSession.company_address,
                contactPerson: attributableSession.company_contact_person,
              }
            : undefined
        );
        // One job description string for the whole run, so the recipient
        // lookup, the generation and the recipient save all compare the same
        // text: the stored JD when the submitted one is the same job (narrow
        // trim), otherwise the submitted JD, written to the row first.
        const settleRunJobDescription = async (submitted: string): Promise<string> => {
          if (!user || !attributableSession) return submitted;
          if (isSameStoredText(submitted, attributableSession.job_description)) {
            return attributableSession.job_description;
          }
          const updated = await updateSession(user.id, attributableSession.id, { job_description: submitted });
          if (updated.error) throw updated.error;
          return submitted;
        };
        let ownedCvSourcesPromise: Promise<{ primaryCV: string; masterCV?: string }> | null = null;
        const getOwnedCvSources = () => {
          if (!user) return Promise.resolve({ primaryCV: '', masterCV: undefined });
          if (!ownedCvSourcesPromise) {
            ownedCvSourcesPromise = Promise.all([
              getDocumentByType(user.id, 'primary_cv'),
              getDocumentByType(user.id, 'master_cv'),
            ]).then(([primaryDocument, masterDocument]) => ({
              primaryCV: primaryDocument?.raw_text?.trim() || '',
              masterCV: masterDocument?.raw_text?.trim() || undefined,
            }));
          }
          return ownedCvSourcesPromise;
        };
        const generationContext: LlmGenerationContext = {
          requestExecutionId,
          clientRequestId,
          userId: user?.id ?? null,
          anonymousSubjectHash: isAnonymous ? ipHash : null,
          applicationSessionId: attributableSessionId,
          route: '/api/agent-v2',
          feature: action === 'fit_analysis' ? 'fit_analysis' : 'application_generation',
          operation: action,
        };

        console.log('[API_AGENT_V2] Request received:', {
          action,
          contextId,
          enableWebSearch,
          hasJobDescription: !!jobDescription,
          hasMasterCV: !!masterCV,
        });

        // Set up event handler to stream progress
        const createEventHandler = (stepIndexFn: (id: string) => number) => (event: AgentEvent) => {
          switch (event.type) {
            case 'step_started':
              stepStartTimes.set(event.step.id, Date.now());
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'step_start',
                step: event.step.id,
                index: stepIndexFn(event.step.id),
                description: event.step.description,
              })}\n\n`));
              break;
            case 'step_completed':
              trackLLMStep(event.step.id, event.tokens);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'step_complete',
                step: event.step.id,
                index: stepIndexFn(event.step.id),
                tokens: event.tokens,
              })}\n\n`));
              break;
            case 'step_error':
              trackLLMError(event.step.id, event.error);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'step_error',
                step: event.step.id,
                index: stepIndexFn(event.step.id),
                error: 'This generation step failed. Please try again.',
              })}\n\n`));
              break;
            case 'progress':
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'progress',
                percent: event.percent,
                message: event.message,
              })}\n\n`));
              break;
            case 'tool_usage':
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'tool_usage',
                tool: event.tool,
                output: event.output,
                display: event.display,
              })}\n\n`));
              break;
            case 'message':
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'message',
                content: event.content,
              })}\n\n`));
              break;
          }
        };

        // Capture the kit reservation (the user got a kit), then give back the
        // single-document price of every document that failed. Returns the
        // credits that actually came back, so the client never reports a
        // refund that did not land. A refund failure is logged and reported
        // to PostHog; it never takes the delivered documents away.
        const settleKitReservation = async (documentErrors: KitDocumentErrors): Promise<number> => {
          const key = activeReservationKey;
          const reservationUserId = activeReservationUserId;
          if (!key || !reservationUserId) return 0;
          await captureReservationSafe({ idempotencyKey: key, userId: reservationUserId });
          activeReservationKey = null;
          const { failed, amount } = kitFailureRefund(documentErrors);
          if (failed.length === 0) return 0;
          try {
            const refund = await refundReservationPartially({
              userId: reservationUserId,
              idempotencyKey: key,
              amount,
              reason: `kit_documents_failed:${failed.join(',')}`,
            });
            if (refund.success) return refund.refunded;
            // A partial payout (one bucket landed, the next failed) still
            // happened, so it is reported, never rounded down to nothing.
            reportRefundFailure(new Error(refund.error ?? 'Partial refund failed'), refund.refunded);
            return refund.refunded;
          } catch (refundError) {
            reportRefundFailure(refundError, 0);
            return 0;
          }

          function reportRefundFailure(refundError: unknown, refunded: number) {
            console.error('[agent-v2] Partial kit refund failed:', key, amount, refunded, refundError);
            try {
              getPostHogServer().captureException(refundError as Error, distinctId, {
                endpoint: '/api/agent-v2',
                workflow_action: currentAction,
                failed_documents: failed.join(','),
                reservation_key: key,
                refund_amount: amount,
                refunded,
                shortfall: amount - refunded,
              });
            } catch { /* ignore PostHog errors */ }
          }
        };

        // =====================================================
        // ACTION: FIT ANALYSIS (Phase 1 only - 0.5 credits)
        // =====================================================
        if (action === 'fit_analysis') {
          if (!jobDescription || (isAnonymous && !currentCV)) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'error', 
              message: 'Job description and CV are required' 
            })}\n\n`));
            controller.close();
            return;
          }

          const fitCvSources = user
            ? await getOwnedCvSources()
            : { primaryCV: currentCV, masterCV };
          if (!fitCvSources.primaryCV) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              message: 'We need your CV before we can analyze this role.',
            })}\n\n`));
            controller.close();
            return;
          }

          if (isAnonymous) {
            const claimed = await claimAnonymousGeneration(ipHash);
            if (!claimed) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'error',
                code: 'ANONYMOUS_LIMIT_REACHED',
                message: 'You have already used your free fit check. Create a free account to continue.',
              })}\n\n`));
              controller.close();
              return;
            }
            anonymousClaimHash = ipHash;
          }

          const fitContextId = `ctx-${randomUUID()}`;

          // Reserve 0.5 credits for fit analysis (skip for anonymous users — free generation)
          if (!isAnonymous) {
            const reservationKey = `fit_analysis:${user!.id}:${clientRequestId}`;
            const reserveResult = await reserveCredits({
              userId: user!.id,
              action: 'FIT_ANALYSIS',
              idempotencyKey: reservationKey,
              sessionId: clientSessionId,
              metadata: { context_id: fitContextId },
            });
            if (!reserveResult.success) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(
                reservationErrorPayload(reserveResult, CREDIT_COSTS.FIT_ANALYSIS),
              )}\n\n`));
              controller.close();
              return;
            }
            activeReservationKey = reservationKey;
            activeReservationUserId = user!.id;

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'credits_deducted',
              creditsUsed: CREDIT_COSTS.FIT_ANALYSIS,
            })}\n\n`));
          }

          const steps = getWorkflowSteps('fit_analysis');
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'workflow_start', 
            steps: steps.map((s, i) => ({ function: s.id, description: s.description, index: i })),
            models: { analysis: ACTIVE_MODEL_ID, writing: ACTIVE_MODEL_ID },
          })}\n\n`));

          const eventHandler = createEventHandler((id) => getFitAnalysisStepIndex(id));
          const sessionId = `fit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          const result = await runFitAnalysis({
            sessionId,
            jobDescription,
            primaryCV: fitCvSources.primaryCV,
            masterCV: fitCvSources.masterCV,
            jobPreferences,
            generationContext,
          }, eventHandler);

          if (result.success && result.data) {
            const ctx = result.data.context;

            // Cache the context for reuse in generate_with_context
            await cacheContext(contextOwnerId, fitContextId, ctx);

            if (user) {
              await persistGeneratedArtifacts(clientSessionId, user.id, {
                pendingFitAnalysis: {
                  contextId: fitContextId,
                  jobDescription,
                  contextData: {
                    applicant: ctx.applicant,
                    job: ctx.job,
                    match: ctx.match,
                    verifiedMetrics: ctx.verifiedMetrics,
                    detectedLanguage: ctx.detectedLanguage,
                    fitAnalysis: ctx.fitAnalysis,
                  },
                  createdAt: new Date().toISOString(),
                },
              }, true);
            }

            // Capture reservation — fit analysis produced usable results
            if (activeReservationKey && activeReservationUserId) {
              await captureReservationSafe({ idempotencyKey: activeReservationKey, userId: activeReservationUserId });
              activeReservationKey = null;
            }

            try {
              const posthog = getPostHogServer();
              const fit = ctx.fitAnalysis;
              posthog.capture({
                distinctId,
                event: 'fit_analysis_viewed',
                properties: {
                  fit_score: fit?.score,
                  fit_level: fit?.fitLevel,
                  matching_skills_count: ctx.match?.matchedRequirements?.length || fit?.matchingSkills?.length || 0,
                  missing_skills_count: fit?.missingSkills?.length || ctx.match?.missingSkills?.length || 0,
                  job_title: ctx.job?.title,
                  company: ctx.job?.companyName,
                },
              });
              await posthog.flush();
            } catch { /* ignore PostHog errors */ }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'fit_analysis_complete',
              contextId: fitContextId,
              fitAnalysis: ctx.fitAnalysis,
              job: ctx.job,
              match: ctx.match,
              // UI data only. The server never accepts it back as writer context.
              applicant: ctx.applicant,
              verifiedMetrics: ctx.verifiedMetrics,
              detectedLanguage: ctx.detectedLanguage,
            })}\n\n`));
            // The claim becomes final only after its result entered the response stream.
            anonymousClaimHash = null;
          } else {
            throw new Error(result.error || 'Fit analysis failed');
          }

          controller.close();
          return;
        }

        // =====================================================
        // ACTION: GENERATE WITH CONTEXT (Phase 2 only - 2.0 credits)
        // Uses cached context from fit analysis
        // =====================================================
        if (action === 'generate_with_context') {
          if (!contextId) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'error', 
              message: 'Context ID is required for generate_with_context' 
            })}\n\n`));
            controller.close();
            return;
          }

          const reserveContinuation = async () => {
            // The shared helper decides the price (1.5 after a captured fit
            // for this context, else 2.0), claims the discount and falls back
            // to full price on a lost claim. It reports each reservation this
            // request must release if it fails.
            const reserved = await reserveKitCredits({
              userId: user!.id,
              sessionId: clientSessionId,
              contextId,
              requestId: clientRequestId,
              keyFor: (kitAction) =>
                `${kitAction === 'GENERATION_AFTER_FIT' ? 'generation_after_fit' : 'full_application'}:${user!.id}:${clientRequestId}`,
              onReservation: (reservationKey) => {
                activeReservationKey = reservationKey;
                activeReservationUserId = reservationKey ? user!.id : null;
              },
            });
            activeFitContinuation = reserved.continuation;
            return { result: reserved.result, key: reserved.key, cost: reserved.cost };
          };

          // Retrieve cached context
          const cachedContext = await getCachedContext(contextOwnerId, contextId);
          if (cachedContext) normalizeCachedMatch(cachedContext);
          
          if (!cachedContext) {
            if (!user) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'error',
                message: 'Context expired. Please run fit analysis again.',
              })}\n\n`));
              controller.close();
              return;
            }

            const { primaryCV: serverPrimaryCV, masterCV: serverMasterCV } = await getOwnedCvSources();
            // The narrow trim (space, tab, LF, CR) the session row comparisons use.
            const submittedJobDescription = storedTextOrEmpty(jobDescription)
              || storedTextOrEmpty(attributableSession?.job_description)
              || '';

            if (!submittedJobDescription || !serverPrimaryCV) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'error', 
                message: 'Context expired. Please run fit analysis again.' 
              })}\n\n`));
              controller.close();
              return;
            } else {
              console.warn('[API_AGENT_V2] Context cache miss, rerunning with server-held sources');

              const continuation = await reserveContinuation();
              if (!continuation.result.success) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(
                  reservationErrorPayload(continuation.result, continuation.cost),
                )}\n\n`));
                controller.close();
                return;
              }

              // Only after the reservation succeeds: a failed reservation must
              // not leave the session pointing at a JD its artifacts don't match.
              const runJobDescription = await settleRunJobDescription(submittedJobDescription);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'credits_deducted',
                creditsUsed: continuation.cost,
              })}\n\n`));

              const steps = getWorkflowSteps('full_optimization');
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'workflow_start',
                steps: steps.map((s, i) => ({ function: s.id, description: s.description, index: i })),
                models: { analysis: ACTIVE_MODEL_ID, writing: ACTIVE_MODEL_ID },
              })}\n\n`));

              const eventHandler = createEventHandler((id) => getStepIndex(id));
              const result = await runJobCopilot({
                sessionId: attributableSession?.id ?? clientSessionId ?? `session-${Date.now()}`,
                jobDescription: runJobDescription,
                primaryCV: serverPrimaryCV,
                masterCV: serverMasterCV,
                jobPreferences,
                letterRecipient: letterRecipientFor(runJobDescription),
                generationContext,
              }, eventHandler);

              if (result.success && result.data) {
                const documentErrors = result.data.documentErrors ?? {};
                const fallbackResults = buildKitResults(result.data.context, documentErrors);

                await persistKitForSession(clientSessionId, user?.id, fallbackResults, result.data.context.jobDescription);
                await tryTransitionGeneration(clientSessionId, user?.id ?? '', 'succeeded');
                const creditsRefunded = await settleKitReservation(documentErrors);

                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'workflow_complete',
                  results: fallbackResults,
                  creditsRefunded,
                })}\n\n`));
              } else {
                throw new Error(result.error || 'Optimization failed');
              }

              controller.close();
              return;
            }
          }

          // Apply the continuation discount only when this context belongs to a captured fit reservation.
          if (!isAnonymous) {
            const continuation = await reserveContinuation();
            if (!continuation.result.success) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(
                reservationErrorPayload(continuation.result, continuation.cost),
              )}\n\n`));
              controller.close();
              return;
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'credits_deducted',
              creditsUsed: continuation.cost,
            })}\n\n`));
          }

          const steps = getWorkflowSteps('generate_with_context');
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'workflow_start',
            steps: steps.map((s, i) => ({ function: s.id, description: s.description, index: i })),
            models: { analysis: ACTIVE_MODEL_ID, writing: ACTIVE_MODEL_ID },
          })}\n\n`));

          const eventHandler = createEventHandler((id) => getGenerateWithContextStepIndex(id));
          if (jobPreferences) cachedContext.jobPreferences = jobPreferences;
          cachedContext.letterRecipient = letterRecipientFor(cachedContext.jobDescription);
          const result = await runWithContext(cachedContext, eventHandler, generationContext);

          if (result.success && result.data) {
            const documentErrors = result.data.documentErrors ?? {};
            const genResults = buildKitResults(result.data.context, documentErrors);

            await persistKitForSession(clientSessionId, user?.id, genResults, result.data.context.jobDescription);
            await tryTransitionGeneration(clientSessionId, user?.id ?? '', 'succeeded');
            const creditsRefunded = await settleKitReservation(documentErrors);

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'workflow_complete',
              results: genResults,
              creditsRefunded,
            })}\n\n`));
            try {
              await removeCachedContext(contextOwnerId, contextId);
            } catch (cacheError) {
              console.error('[API_AGENT_V2] Failed to remove completed context:', cacheError);
            }
          } else {
            throw new Error(result.error || 'Generation failed');
          }

          controller.close();
          return;
        }

        // =====================================================
        // ACTION: FULL OPTIMIZATION (legacy - runs both phases)
        // =====================================================
        // The narrow trim (space, tab, LF, CR) the session row comparisons use.
        const submittedJobDescription = storedTextOrEmpty(jobDescription)
          || storedTextOrEmpty(attributableSession?.job_description)
          || '';
        if (!submittedJobDescription || (isAnonymous && !currentCV)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            message: 'Job description and CV are required' 
          })}\n\n`));
          controller.close();
          return;
        }

        const fullCvSources = user
          ? await getOwnedCvSources()
          : { primaryCV: currentCV, masterCV };
        if (!fullCvSources.primaryCV) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            message: 'We need your CV before we can generate your application.',
          })}\n\n`));
          controller.close();
          return;
        }

        // Reserve credits for full application (skip for anonymous)
        if (!isAnonymous) {
          const fullKey = `full_application:${user!.id}:${clientRequestId}`;
          const reserveResult = await reserveCredits({
            userId: user!.id,
            action: 'FULL_APPLICATION',
            idempotencyKey: fullKey,
            sessionId: clientSessionId,
          });
          if (!reserveResult.success) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(
              reservationErrorPayload(reserveResult, CREDIT_COSTS.FULL_APPLICATION),
            )}\n\n`));
            controller.close();
            return;
          }
          activeReservationKey = fullKey;
          activeReservationUserId = user!.id;

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'credits_deducted',
            creditsUsed: CREDIT_COSTS.FULL_APPLICATION,
          })}\n\n`));
        }

        const steps = getWorkflowSteps(action);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'workflow_start', 
          steps: steps.map((s, i) => ({ function: s.id, description: s.description, index: i })),
          models: { analysis: ACTIVE_MODEL_ID, writing: ACTIVE_MODEL_ID },
        })}\n\n`));

        const eventHandler = createEventHandler((id) => getStepIndex(id));
        const runJobDescription = await settleRunJobDescription(submittedJobDescription);
        const result = await runJobCopilot({
          sessionId: attributableSession?.id ?? `session-${Date.now()}`,
          jobDescription: runJobDescription,
          primaryCV: fullCvSources.primaryCV,
          masterCV: fullCvSources.masterCV,
          jobPreferences,
          letterRecipient: letterRecipientFor(runJobDescription),
          generationContext,
        }, eventHandler);

        if (!result.success || !result.data) {
          throw new Error(result.error || 'Optimization failed');
        }
        const documentErrors = result.data.documentErrors ?? {};
        const results = buildKitResults(result.data.context, documentErrors);

        await persistKitForSession(clientSessionId, user?.id, results, result.data.context.jobDescription);
        await tryTransitionGeneration(clientSessionId, user?.id ?? '', 'succeeded');
        const creditsRefunded = await settleKitReservation(documentErrors);

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'workflow_complete',
          results,
          creditsRefunded,
        })}\n\n`));

        controller.close();
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'workflow_error';

        if (anonymousClaimHash) {
          await releaseAnonymousGenerationSafe(anonymousClaimHash);
          anonymousClaimHash = null;
        }

        // Server-owned: mark generation as failed only when we know whose generation it is.
        // Empty string user IDs would produce misleading audit rows.
        if (authenticatedUserId) {
          await tryTransitionGeneration(resolvedSessionId, authenticatedUserId, 'failed', errorMsg);
        }

        // Release credit reservation — generation failed, refund user
        if (activeReservationKey && activeReservationUserId) {
          try {
            const released = await releaseReservation({
              idempotencyKey: activeReservationKey,
              userId: activeReservationUserId,
              reason: errorMsg,
            });
            const fitContinuation = activeFitContinuation as {
              userId: string;
              contextId: string;
              requestId: string;
            } | null;
            if (released.success && fitContinuation) {
              await releaseFitContinuationClaim(
                fitContinuation.userId,
                fitContinuation.contextId,
                fitContinuation.requestId,
              );
              activeFitContinuation = null;
            }
          } catch (releaseErr) {
            console.error('[agent-v2] Failed to release reservation:', releaseErr);
          }
        }

        trackLLMError('workflow', error);
        console.error('[agent-v2] workflow failed:', errorMsg);
        try {
          const posthog = getPostHogServer();
          posthog.captureException(error as Error, distinctId, {
            endpoint: '/api/agent-v2',
            method: 'POST',
            workflow_action: currentAction,
          });
        } catch { /* ignore PostHog errors */ }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'error',
          message: 'Something went wrong while generating your application. Please try again.'
        })}\n\n`));
        controller.close();
      } finally {
        clearInterval(heartbeat);
      }
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// Helper to extract original experience bullets from CV text

// Helper to get workflow steps based on action - Useful Apply Unified Agent
function getWorkflowSteps(action: string): Array<{ id: string; description: string }> {
  switch (action) {
    case 'fit_analysis':
      return [
        { id: 'analysis', description: 'Useful Apply: Parsing CV and analyzing job requirements' },
        { id: 'matching', description: 'Useful Apply: Matching skills and identifying gaps' },
        { id: 'fit_assessment', description: 'Useful Apply: Assessing job fit' },
      ];
    case 'generate_with_context':
      return [
        { id: 'cv_generation', description: 'Useful Apply: Optimizing CV for the position' },
        { id: 'cover_letter', description: 'Useful Apply: Composing tailored cover letter' },
        { id: 'email', description: 'Useful Apply: Writing the application email' },
        { id: 'follow_up', description: 'Useful Apply: Writing the follow-up email' },
      ];
    case 'full_optimization':
      return [
        { id: 'analysis', description: 'Useful Apply: Parsing CV and analyzing job requirements' },
        { id: 'matching', description: 'Useful Apply: Matching skills and identifying gaps' },
        { id: 'cv_generation', description: 'Useful Apply: Optimizing CV for the position' },
        { id: 'cover_letter', description: 'Useful Apply: Composing tailored cover letter' },
        { id: 'email', description: 'Useful Apply: Writing the application email' },
        { id: 'follow_up', description: 'Useful Apply: Writing the follow-up email' },
      ];
    default:
      return [
        { id: 'analysis', description: 'Useful Apply: Analyzing documents' },
        { id: 'generation', description: 'Useful Apply: Generating content' },
      ];
  }
}

// Helper to get step index for progress tracking
function getStepIndex(stepId: string): number {
  const stepOrder = ['analysis', 'matching', 'cv_generation', 'cover_letter', 'email', 'follow_up'];
  return stepOrder.indexOf(stepId);
}

function getFitAnalysisStepIndex(stepId: string): number {
  const stepOrder = ['analysis', 'matching', 'fit_assessment'];
  return stepOrder.indexOf(stepId);
}

function getGenerateWithContextStepIndex(stepId: string): number {
  const stepOrder = ['cv_generation', 'cover_letter', 'email', 'follow_up'];
  return stepOrder.indexOf(stepId);
}
