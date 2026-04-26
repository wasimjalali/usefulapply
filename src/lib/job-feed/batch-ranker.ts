/**
 * Azure OpenAI Batch API adapter for job-feed ranking.
 *
 * Runs scheduled overnight: the sweep function calls submitJobFeedBatch once
 * with every due user's ranking payload in a single JSONL file. Azure returns
 * a batch_id; the reconciler polls until completion then parses the output
 * back into ranked_items.
 *
 * Manual force-reruns and Apply-with-Karko stay on the sync rankWithOpenAI
 * path in openai-ranking.ts — users need immediate feedback there.
 *
 * Cost: 50% of the sync input+output rates, 24h SLA.
 * Docs: https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/batch
 */

import { AzureOpenAI, toFile } from 'openai';
import {
  buildRankingRequestBody,
  parseRankingResponse,
} from '@/lib/job-feed/openai-ranking';
import type {
  JobFeedRankingCandidate,
  JobFeedRankedItemRecord,
} from '@/lib/job-feed/types';
import type { JobFeedSettings } from '@/lib/supabase/types';

const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4.1-mini-1';

let cachedBatchClient: AzureOpenAI | null = null;

function getBatchClient(): AzureOpenAI {
  if (!cachedBatchClient) {
    cachedBatchClient = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-10-21',
      deployment: AZURE_DEPLOYMENT,
    });
  }
  return cachedBatchClient;
}

export function isBatchRankingEnabled(): boolean {
  // Feature-flag the batch path so scheduled runs can be switched back to
  // sync quickly if the batch reconciler has any issues.
  return process.env.JOB_FEED_BATCH_RANKING_ENABLED === 'true';
}

export interface BatchSubmissionInput {
  // custom_id on each JSONL line. Must be unique per file.
  runId: string;
  settings: JobFeedSettings;
  candidates: JobFeedRankingCandidate[];
  visibleCap: number;
  yearsExperience: number | null;
}

export interface BatchSubmissionResult {
  batchId: string;
  inputFileId: string;
  status: string;
  totalRequests: number;
}

/**
 * Submit a Batch API job containing one ranking request per due user.
 * custom_id on each line = runId so the reconciler can match responses back.
 */
export async function submitJobFeedBatch(
  inputs: BatchSubmissionInput[]
): Promise<BatchSubmissionResult> {
  if (inputs.length === 0) {
    throw new Error('submitJobFeedBatch called with zero inputs.');
  }

  const client = getBatchClient();

  // Build JSONL. Each line is a standalone batch request; Azure treats them
  // independently. `url` must be /v1/chat/completions (with /v1/) per Azure
  // docs — different from the batches.create endpoint field.
  const lines = inputs.map((input) => {
    const body = buildRankingRequestBody({
      settings: input.settings,
      candidates: input.candidates,
      visibleCap: input.visibleCap,
      yearsExperience: input.yearsExperience,
    });

    return JSON.stringify({
      custom_id: input.runId,
      method: 'POST',
      url: '/v1/chat/completions',
      body,
    });
  });

  const jsonl = lines.join('\n');

  // Upload JSONL. Use toFile() with a Buffer so we stay runtime-agnostic
  // (works on both Vercel edge-like and Node runtimes).
  const file = await client.files.create({
    file: await toFile(Buffer.from(jsonl, 'utf-8'), 'job-feed-ranking.jsonl'),
    purpose: 'batch',
  });

  // Azure docs specify `/chat/completions` (no `/v1/`) for the endpoint
  // field, but the `openai` SDK's TypeScript types are OpenAI-platform-first
  // and only enumerate `/v1/chat/completions`. Cast through unknown so we
  // send the Azure-correct value. completion_window only accepts '24h'.
  const batch = await client.batches.create({
    input_file_id: file.id,
    endpoint: '/chat/completions' as unknown as '/v1/chat/completions',
    completion_window: '24h',
  });

  return {
    batchId: batch.id,
    inputFileId: file.id,
    status: batch.status,
    totalRequests: inputs.length,
  };
}

export interface BatchStatusResult {
  batchId: string;
  status: string;
  outputFileId: string | null;
  errorFileId: string | null;
  completedAt: number | null;
  requestCounts: {
    total: number;
    completed: number;
    failed: number;
  } | null;
}

export async function getJobFeedBatchStatus(batchId: string): Promise<BatchStatusResult> {
  const client = getBatchClient();
  const batch = await client.batches.retrieve(batchId);

  return {
    batchId: batch.id,
    status: batch.status,
    outputFileId: batch.output_file_id ?? null,
    errorFileId: batch.error_file_id ?? null,
    completedAt: batch.completed_at ?? null,
    requestCounts: batch.request_counts
      ? {
          total: batch.request_counts.total,
          completed: batch.request_counts.completed,
          failed: batch.request_counts.failed,
        }
      : null,
  };
}

export interface BatchOutputEntry {
  runId: string;
  success: boolean;
  // When success === true:
  content: string | null;
  inputTokens: number;
  outputTokens: number;
  // When success === false:
  errorMessage: string | null;
}

/**
 * Fetch the batch's JSONL output and parse each line into a runId-keyed entry.
 * Each line's custom_id is the runId submitted earlier; the reconciler uses
 * that to locate the matching job_feed_run row and populate ranked_items.
 */
export async function fetchJobFeedBatchOutput(outputFileId: string): Promise<BatchOutputEntry[]> {
  const client = getBatchClient();
  const fileContent = await client.files.content(outputFileId);
  const text = await fileContent.text();

  const entries: BatchOutputEntry[] = [];
  for (const rawLine of text.trim().split('\n')) {
    if (!rawLine.trim()) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawLine);
    } catch {
      continue;
    }

    if (!isRecord(parsed)) continue;

    const runId = typeof parsed.custom_id === 'string' ? parsed.custom_id : '';
    if (!runId) continue;

    const errorField = parsed.error;
    const response = parsed.response;

    if (errorField && !response) {
      entries.push({
        runId,
        success: false,
        content: null,
        inputTokens: 0,
        outputTokens: 0,
        errorMessage: typeof errorField === 'string'
          ? errorField
          : JSON.stringify(errorField),
      });
      continue;
    }

    if (!isRecord(response)) continue;
    const statusCode = typeof response.status_code === 'number' ? response.status_code : 0;
    const body = response.body;

    if (statusCode !== 200 || !isRecord(body)) {
      entries.push({
        runId,
        success: false,
        content: null,
        inputTokens: 0,
        outputTokens: 0,
        errorMessage: `Batch entry returned status ${statusCode}.`,
      });
      continue;
    }

    const choices = Array.isArray(body.choices) ? body.choices : [];
    const firstChoice = isRecord(choices[0]) ? choices[0] : null;
    const messageField = firstChoice && isRecord(firstChoice.message) ? firstChoice.message : null;
    const content = messageField && typeof messageField.content === 'string'
      ? messageField.content
      : null;

    const usage = isRecord(body.usage) ? body.usage : null;
    const inputTokens = usage && typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
    const outputTokens = usage && typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0;

    entries.push({
      runId,
      success: Boolean(content),
      content,
      inputTokens,
      outputTokens,
      errorMessage: content ? null : 'Batch entry missing response content.',
    });
  }

  return entries;
}

/**
 * Convenience helper for the reconciler: take a batch entry's raw content
 * and turn it into validated ranked items, or return null on parse failure
 * so the caller can fall back to deterministic ranking.
 */
export function parseBatchEntryToRankedItems(
  content: string,
  candidates: JobFeedRankingCandidate[],
  visibleCap: number
): JobFeedRankedItemRecord[] | null {
  return parseRankingResponse(content, candidates, visibleCap);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
