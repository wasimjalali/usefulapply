import { and, eq } from 'drizzle-orm';
import { getDb, nowIso } from '../client';
import { adminAuthEvents, llmGenerations, type Json } from '../schema';

/** JSON with object keys sorted at every depth, so equal usage objects compare equal whatever their key order. */
function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]));
    }
    return v;
  };
  return JSON.stringify(sort(value ?? null));
}

export type AdminAuthEventType = 'signup' | 'session_started';
export type LlmUsageProvider = 'anthropic' | 'bedrock' | 'digitalocean' | 'workers-ai';

export type LlmGenerationContext = {
  requestExecutionId: string;
  clientRequestId?: string | null;
  parentGenerationId?: string | null;
  userId?: string | null;
  anonymousSubjectHash?: string | null;
  applicationSessionId?: string | null;
  jobFeedRunId?: string | null;
  route: string;
  feature: string;
  operation: string;
};

export async function hashMetricSubject(subject: string): Promise<string> {
  const secret = process.env.ADMIN_METRICS_HASH_KEY;
  if (!secret) throw new Error('ADMIN_METRICS_HASH_KEY is not set');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(subject));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function recordAuthMetricEvent(params: {
  sourceId: string;
  userId: string;
  eventType: AdminAuthEventType;
  occurredAt?: string;
}): Promise<void> {
  const db = await getDb();
  await db
    .insert(adminAuthEvents)
    .values({
      id: crypto.randomUUID(),
      source_id: await hashMetricSubject(params.sourceId),
      subject_hash: await hashMetricSubject(params.userId),
      event_type: params.eventType,
      occurred_at: params.occurredAt ?? nowIso(),
    })
    .onConflictDoNothing({ target: adminAuthEvents.source_id });
}

export async function startLlmGeneration(params: {
  context: LlmGenerationContext;
  provider: LlmUsageProvider;
  model: string;
  startedAt?: string;
}): Promise<{ id: string; startedAt: string }> {
  const id = crypto.randomUUID();
  const startedAt = params.startedAt ?? nowIso();

  // The ledger observes the product; it must never take it down. A failed
  // write here costs one ledger row, not the user's generation. The terminal
  // update then matches zero rows and is swallowed at its call sites.
  try {
    const db = await getDb();
    await db.insert(llmGenerations).values({
      id,
      request_execution_id: params.context.requestExecutionId,
      client_request_id: params.context.clientRequestId ?? null,
      parent_generation_id: params.context.parentGenerationId ?? null,
      user_id: params.context.userId ?? null,
      anonymous_subject_hash: params.context.anonymousSubjectHash
        ? await hashMetricSubject(params.context.anonymousSubjectHash)
        : null,
      application_session_id: params.context.applicationSessionId ?? null,
      job_feed_run_id: params.context.jobFeedRunId ?? null,
      route: params.context.route,
      feature: params.context.feature,
      operation: params.context.operation,
      provider: params.provider,
      model: params.model,
      status: 'started',
      started_at: startedAt,
      updated_at: startedAt,
    });
  } catch (error) {
    console.error(
      '[admin-metrics] startLlmGeneration write failed:',
      error instanceof Error ? error.message : error,
    );
  }

  return { id, startedAt };
}

export async function completeLlmGeneration(params: {
  id: string;
  responseReceivedAt?: string;
  latencyMs: number;
  attemptCount?: number;
  providerRequestId?: string | null;
  usageReported: boolean;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadInputTokens?: number | null;
  cacheWriteInputTokens?: number | null;
  providerTotalTokens?: number | null;
  providerUsage?: Json | null;
}): Promise<void> {
  const db = await getDb();
  const completedAt = params.responseReceivedAt ?? nowIso();
  const values = {
    status: 'response_received' as const,
    response_received_at: completedAt,
    latency_ms: params.latencyMs,
    attempt_count: params.attemptCount ?? 1,
    provider_request_id: params.providerRequestId ?? null,
    usage_reported: params.usageReported,
    input_tokens: params.inputTokens ?? null,
    output_tokens: params.outputTokens ?? null,
    cache_read_input_tokens: params.cacheReadInputTokens ?? null,
    cache_write_input_tokens: params.cacheWriteInputTokens ?? null,
    provider_total_tokens: params.providerTotalTokens ?? null,
    provider_usage: params.providerUsage ?? null,
    updated_at: completedAt,
  };

  const updated = await db
    .update(llmGenerations)
    .set(values)
    .where(and(eq(llmGenerations.id, params.id), eq(llmGenerations.status, 'started')))
    .returning({ id: llmGenerations.id, status: llmGenerations.status });

  if (updated.length === 0) {
    const existing = await db
      .select()
      .from(llmGenerations)
      .where(eq(llmGenerations.id, params.id))
      .limit(1);
    const row = existing[0];
    const isIdenticalTerminalWrite =
      row?.status === 'response_received'
      && row.latency_ms === values.latency_ms
      && row.attempt_count === values.attempt_count
      && row.provider_request_id === values.provider_request_id
      && row.usage_reported === values.usage_reported
      && row.input_tokens === values.input_tokens
      && row.output_tokens === values.output_tokens
      && row.cache_read_input_tokens === values.cache_read_input_tokens
      && row.cache_write_input_tokens === values.cache_write_input_tokens
      && row.provider_total_tokens === values.provider_total_tokens
      && canonicalJson(row.provider_usage) === canonicalJson(values.provider_usage);
    if (isIdenticalTerminalWrite) return;
    throw new Error('LLM generation ledger completion conflicted');
  }
}

export async function failLlmGeneration(params: {
  id: string;
  failedAt?: string;
  latencyMs: number;
  attemptCount?: number;
  errorKind: string;
  httpStatus?: number | null;
  /**
   * A response can be billed and still fail (a refusal, or output cut off at max_tokens).
   * Its token counts and request id are kept here. usage_reported stays false: the schema
   * reserves it for response_received rows.
   */
  providerRequestId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadInputTokens?: number | null;
  cacheWriteInputTokens?: number | null;
  providerTotalTokens?: number | null;
  providerUsage?: Json | null;
}): Promise<void> {
  const db = await getDb();
  const failedAt = params.failedAt ?? nowIso();
  const updated = await db
    .update(llmGenerations)
    .set({
      status: 'failed',
      failed_at: failedAt,
      latency_ms: params.latencyMs,
      attempt_count: params.attemptCount ?? 1,
      error_kind: params.errorKind,
      http_status: params.httpStatus ?? null,
      provider_request_id: params.providerRequestId ?? null,
      input_tokens: params.inputTokens ?? null,
      output_tokens: params.outputTokens ?? null,
      cache_read_input_tokens: params.cacheReadInputTokens ?? null,
      cache_write_input_tokens: params.cacheWriteInputTokens ?? null,
      provider_total_tokens: params.providerTotalTokens ?? null,
      provider_usage: params.providerUsage ?? null,
      updated_at: failedAt,
    })
    .where(and(eq(llmGenerations.id, params.id), eq(llmGenerations.status, 'started')))
    .returning({ id: llmGenerations.id, status: llmGenerations.status });

  if (updated.length === 0) {
    const existing = await db
      .select()
      .from(llmGenerations)
      .where(eq(llmGenerations.id, params.id))
      .limit(1);
    const row = existing[0];
    const isIdenticalTerminalWrite =
      row?.status === 'failed'
      && row.latency_ms === params.latencyMs
      && row.attempt_count === (params.attemptCount ?? 1)
      && row.error_kind === params.errorKind
      && row.http_status === (params.httpStatus ?? null)
      && row.provider_request_id === (params.providerRequestId ?? null)
      && row.input_tokens === (params.inputTokens ?? null)
      && row.output_tokens === (params.outputTokens ?? null)
      && row.cache_read_input_tokens === (params.cacheReadInputTokens ?? null)
      && row.cache_write_input_tokens === (params.cacheWriteInputTokens ?? null)
      && row.provider_total_tokens === (params.providerTotalTokens ?? null)
      && canonicalJson(row.provider_usage) === canonicalJson(params.providerUsage ?? null);
    if (isIdenticalTerminalWrite) return;
    throw new Error('LLM generation ledger failure update conflicted');
  }
}
