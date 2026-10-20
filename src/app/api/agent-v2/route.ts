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
  KIT_DOCUMENTS,
  type AgentEvent,
  type KitDocumentErrors,
  type MasterContext,
} from '@/lib/agents';
import { getCurrentUser } from '@/auth/server';
import { getSession, updateSession } from '@/db/repos/sessions';
import { isStructuredCoverLetter } from '@/lib/cover-letter/contract';
import { saveLetterRecipientFromAd } from '@/lib/agents/persist-letter-recipient';
import { getDocumentByType } from '@/db/repos/documents';
import { getJobPreferences } from '@/db/repos/jobFeed';
import { claimAnonymousGeneration, releaseAnonymousGeneration } from '@/db/repos/anonymous';
import { CREDIT_COSTS } from '@/lib/middleware/creditCheck';
import { KIT_DOCUMENT_FAILURE_REFUND } from '@/lib/credit-costs';
import {
  reserveCredits,
  captureReservation,
  releaseReservation,
  refundReservationPartially,
  canUseFitContinuation,
  claimFitContinuation,
  releaseFitContinuationClaim,
} from '@/lib/supabase/credit-reservations';
import { transitionJobFeedApplicationGenerationAdmin } from '@/lib/job-feed/server';
import { getPostHogServer } from '@/lib/posthog-server';
import { ACTIVE_MODEL_ID, ACTIVE_MODEL_PRICING } from '@/lib/models';
import { randomUUID, createHash } from 'crypto';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import type { ReserveCreditResult } from '@/lib/supabase/credit-reservations';

export const runtime = 'nodejs';
export const maxDuration = 300;

// =====================================================
// SERVER-SIDE CONTEXT CACHE
// Stores MasterContext from fit analysis for reuse in full generation
// TTL: 30 minutes, keyed by contextId
// Prefers Workers KV (shared across isolates). Falls back to an in-memory
// Map when the CONTEXT_CACHE binding is missing (plain `next dev`).
// =====================================================
type ContextCacheKv = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
};

declare global {
  interface CloudflareEnv {
    CONTEXT_CACHE?: ContextCacheKv;
  }
}

const memoryContextCache = new Map<string, { context: MasterContext; expiresAt: number }>();
const CONTEXT_CACHE_TTL_SECONDS = 30 * 60;
const CONTEXT_CACHE_TTL_MS = CONTEXT_CACHE_TTL_SECONDS * 1000;
const MAX_CACHE_SIZE = 100; // Prevent unbounded memory growth

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

async function getContextCacheKv(): Promise<ContextCacheKv | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env.CONTEXT_CACHE;
  } catch {
    // Not running under OpenNext (plain Next server or a non-Cloudflare build). Use the in-memory cache.
    return undefined;
  }
}

// Cache keys are scoped to the owning user so a leaked or guessed contextId
// can never read another user's parsed CV. Anonymous callers are scoped by
// their server-derived IP hash.
function contextCacheKey(ownerId: string, contextId: string): string {
  return `${ownerId}:${contextId}`;
}

function setMemoryContext(key: string, context: MasterContext): void {
  const now = Date.now();
  for (const [k, value] of memoryContextCache.entries()) {
    if (value.expiresAt < now) memoryContextCache.delete(k);
  }
  if (memoryContextCache.size >= MAX_CACHE_SIZE) {
    const entriesToDelete = memoryContextCache.size - MAX_CACHE_SIZE + 1;
    let deleted = 0;
    for (const k of memoryContextCache.keys()) {
      if (deleted >= entriesToDelete) break;
      memoryContextCache.delete(k);
      deleted++;
    }
  }
  memoryContextCache.set(key, { context, expiresAt: now + CONTEXT_CACHE_TTL_MS });
}

function getMemoryContext(key: string): MasterContext | null {
  const entry = memoryContextCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    memoryContextCache.delete(key);
    return null;
  }
  return entry.context;
}

async function cacheContext(ownerId: string, contextId: string, context: MasterContext): Promise<void> {
  const key = contextCacheKey(ownerId, contextId);
  // Always write through to the isolate-local map: KV is eventually consistent
  // and the follow-up request usually lands on the same isolate within seconds.
  setMemoryContext(key, context);
  const kv = await getContextCacheKv();
  if (kv) {
    await kv.put(key, JSON.stringify(context), { expirationTtl: CONTEXT_CACHE_TTL_SECONDS });
  }
}

async function getCachedContext(ownerId: string, contextId: string): Promise<MasterContext | null> {
  const key = contextCacheKey(ownerId, contextId);
  const local = getMemoryContext(key);
  if (local) {
    console.log('[API_AGENT_V2] context cache hit');
    return local;
  }
  const kv = await getContextCacheKv();
  if (kv) {
    const raw = await kv.get(key);
    if (!raw) return null;
    console.log('[API_AGENT_V2] context cache hit');
    return JSON.parse(raw) as MasterContext;
  }
  return null;
}

async function removeCachedContext(ownerId: string, contextId: string): Promise<void> {
  const key = contextCacheKey(ownerId, contextId);
  memoryContextCache.delete(key);
  const kv = await getContextCacheKv();
  if (kv) {
    await kv.delete(key);
  }
}

function normalizeCachedMatch(context: MasterContext): void {
  const rawMatch = context.match as unknown;
  if (!rawMatch || typeof rawMatch !== 'object' || Array.isArray(rawMatch)) return;
  const match = rawMatch as Record<string, unknown>;
  const strings = (value: unknown): string[] => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
  const sourceText = [context.rawCV, context.masterCV].filter(Boolean).join('\n');
  const containsWholeTerm = (value: string): boolean => {
    const normalized = value.trim().normalize('NFKC').replace(/\s+/g, ' ');
    if (!normalized) return false;
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu')
      .test(sourceText.normalize('NFKC').replace(/\s+/g, ' '));
  };
  const requiredSkills = context.job?.requiredSkills ?? [];
  const rawDetails = Array.isArray(match.details) ? match.details : [];
  const details: NonNullable<NonNullable<MasterContext['match']>['details']> = [];
  for (const value of rawDetails) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const detail = value as Record<string, unknown>;
    const requirement = typeof detail.requirement === 'string' ? detail.requirement.trim() : '';
    const tier = detail.tier;
    if (!requirement || (tier !== 1 && tier !== 2 && tier !== 3 && tier !== 'implicit' && tier !== 'missing')) continue;
    const evidence = typeof detail.evidence === 'string' && containsWholeTerm(detail.evidence)
      ? detail.evidence
      : undefined;
    details.push({
      requirement,
      evidence,
      tier,
      claimable: (tier === 1 || tier === 2) && detail.claimable === true && Boolean(evidence),
      required: typeof detail.required === 'boolean'
        ? detail.required
        : requiredSkills.some((skill) => skill.trim().toLocaleLowerCase() === requirement.toLocaleLowerCase()),
    });
  }

  const matchedRequirements = strings(match.matchedRequirements);
  const claimableEvidence = strings(match.claimableEvidence).filter(containsWholeTerm);
  context.match = {
    score: typeof match.score === 'number' && Number.isFinite(match.score)
      ? Math.max(0, Math.min(100, Math.round(match.score)))
      : 0,
    matchedRequirements: matchedRequirements.length > 0
      ? matchedRequirements
      : [...new Set(details.filter((detail) => detail.tier !== 'missing').map((detail) => detail.requirement))],
    claimableEvidence: claimableEvidence.length > 0
      ? claimableEvidence
      : [...new Set(details.filter((detail) => detail.claimable && detail.evidence).map((detail) => detail.evidence!))],
    missingSkills: strings(match.missingSkills),
    details,
  };
}

// Server-side artifact persistence — writes generated output to
// application_sessions.generated_artifacts so results survive browser crashes.
async function persistGeneratedArtifacts(
  sessionId: string | undefined,
  userId: string,
  results: Record<string, unknown>,
  mergeExisting = false,
  /** The job description the kit was written for; needed to save the letter's recipient. */
  letterJobDescription?: string,
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
    // The letter's language rides along so the export renderer can pick the
    // letter layout for this session.
    const letterLanguage = isStructuredCoverLetter(results.coverLetterStructured)
      ? results.coverLetterStructured.language
      : undefined;
    const persisted = await updateSession(userId, sessionId, {
      generated_artifacts: nextArtifacts,
      ...(letterLanguage ? { cover_letter_language: letterLanguage } : {}),
    });
    if (persisted.error) {
      console.error('[agent-v2] Failed to persist generated artifacts:', persisted.error);
    }
  } catch (error) {
    console.error('[agent-v2] Failed to persist generated artifacts:', error);
  }
  if (letterJobDescription && isStructuredCoverLetter(results.coverLetterStructured)) {
    try {
      await saveLetterRecipientFromAd(userId, sessionId, letterJobDescription, results.coverLetterStructured);
    } catch (error) {
      // The letter already carries the recipient; only the editable copy on
      // the session row is missing.
      console.error('[agent-v2] Failed to save the cover letter recipient:', error);
    }
  }
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
          attributableSession && attributableSession.job_description.trim() === jobDescriptionForRun.trim()
            ? {
                companyName: attributableSession.company,
                address: attributableSession.company_address,
                contactPerson: attributableSession.company_contact_person,
              }
            : undefined
        );
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

        // The kit payload the client and the session row both get. A partial
        // kit lists its failed documents; the missing ones are simply absent.
        // A document listed as failed is nulled here as well, whatever the
        // context says, so a failed document can never ship, persist and be
        // refunded at once (defence in depth behind runWithContext's copy).
        const buildKitResults = (ctx: MasterContext, documentErrors: KitDocumentErrors) => ({
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
        });

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
          const failed = KIT_DOCUMENTS.filter((document) => documentErrors[document]);
          if (failed.length === 0) return 0;
          const amount = failed.reduce((sum, document) => sum + KIT_DOCUMENT_FAILURE_REFUND[document], 0);
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

          const canUseDiscount = user
            ? await canUseFitContinuation(user.id, contextId, clientRequestId)
            : false;
          const reserveContinuation = async () => {
            let action = canUseDiscount ? 'GENERATION_AFTER_FIT' as const : 'FULL_APPLICATION' as const;
            let key = `${action === 'GENERATION_AFTER_FIT' ? 'generation_after_fit' : 'full_application'}:${user!.id}:${clientRequestId}`;
            let result = await reserveCredits({
              userId: user!.id,
              action,
              idempotencyKey: key,
              sessionId: clientSessionId,
              metadata: action === 'GENERATION_AFTER_FIT'
                ? {
                    fit_context_id: contextId,
                    fit_continuation_request_id: clientRequestId,
                  }
                : undefined,
            });
            if (result.success) {
              activeReservationKey = key;
              activeReservationUserId = user!.id;
            }

            if (result.success && action === 'GENERATION_AFTER_FIT') {
              const claimed = await claimFitContinuation(
                user!.id,
                contextId,
                clientRequestId,
                result.reservation!.id,
              );
              if (claimed) {
                activeFitContinuation = { userId: user!.id, contextId, requestId: clientRequestId };
              } else {
                const released = await releaseReservation({
                  userId: user!.id,
                  idempotencyKey: key,
                  reason: 'fit_continuation_claim_lost',
                });
                if (!released.success) {
                  throw new Error('Failed to release a superseded continuation reservation');
                }
                activeReservationKey = null;
                activeReservationUserId = null;
                action = 'FULL_APPLICATION';
                key = `full_application:${user!.id}:${clientRequestId}`;
                result = await reserveCredits({
                  userId: user!.id,
                  action,
                  idempotencyKey: key,
                  sessionId: clientSessionId,
                });
                if (result.success) {
                  activeReservationKey = key;
                  activeReservationUserId = user!.id;
                }
              }
            }

            return { result, key, cost: CREDIT_COSTS[action] };
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
            const submittedJobDescription = jobDescription?.trim()
              || attributableSession?.job_description?.trim()
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
              if (attributableSession && submittedJobDescription !== attributableSession.job_description.trim()) {
                const updated = await updateSession(user.id, attributableSession.id, {
                  job_description: submittedJobDescription,
                });
                if (updated.error) throw updated.error;
              }
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
                jobDescription: submittedJobDescription,
                primaryCV: serverPrimaryCV,
                masterCV: serverMasterCV,
                jobPreferences,
                letterRecipient: letterRecipientFor(submittedJobDescription),
                generationContext,
              }, eventHandler);

              if (result.success && result.data) {
                const documentErrors = result.data.documentErrors ?? {};
                const fallbackResults = buildKitResults(result.data.context, documentErrors);

                await persistGeneratedArtifacts(clientSessionId, user?.id ?? '', fallbackResults, false, result.data.context.jobDescription);
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

            await persistGeneratedArtifacts(clientSessionId, user?.id ?? '', genResults, false, result.data.context.jobDescription);
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
        const submittedJobDescription = jobDescription?.trim()
          || attributableSession?.job_description?.trim()
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
        if (user && attributableSession && submittedJobDescription !== attributableSession.job_description.trim()) {
          const updated = await updateSession(user.id, attributableSession.id, {
            job_description: submittedJobDescription,
          });
          if (updated.error) throw updated.error;
        }
        const result = await runJobCopilot({
          sessionId: attributableSession?.id ?? `session-${Date.now()}`,
          jobDescription: submittedJobDescription,
          primaryCV: fullCvSources.primaryCV,
          masterCV: fullCvSources.masterCV,
          jobPreferences,
          letterRecipient: letterRecipientFor(submittedJobDescription),
          generationContext,
        }, eventHandler);

        if (!result.success || !result.data) {
          throw new Error(result.error || 'Optimization failed');
        }
        const documentErrors = result.data.documentErrors ?? {};
        const results = buildKitResults(result.data.context, documentErrors);

        await persistGeneratedArtifacts(clientSessionId, user?.id ?? '', results, false, result.data.context.jobDescription);
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
