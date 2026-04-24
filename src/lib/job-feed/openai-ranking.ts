import { AzureOpenAI } from 'openai';
import { JOB_FEED_VISIBLE_MAX_COUNT } from '@/lib/job-feed/constants';
import type {
  JobFeedRankingCandidate,
  JobFeedRankingExecutionResult,
  JobFeedRankedItemRecord,
} from '@/lib/job-feed/types';
import type { JobFeedSettings } from '@/lib/supabase/types';

const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4.1-mini-1';
const AZURE_MODEL_NAME = 'gpt-4.1-mini';

type JobFeedRankingDecision = 'strong' | 'good' | 'skip';

interface JobFeedRankingModelResponse {
  items: Array<{
    jobId: string;
    decision: JobFeedRankingDecision;
    rank?: number | null;
    reason?: string | null;
  }>;
}

function buildSystemPrompt(visibleCap: number): string {
  return `# Role
You are a job ranking engine for Karko AI's daily feed. You evaluate shortlisted jobs against a candidate's profile and return a JSON ranking.

# Task
For each candidate job, return exactly one decision: strong, good, or skip.

# Priority Order (most important first)
1. SKILL MATCH — Does the job require skills the candidate actually has? A job where the candidate meets 80%+ of must-have skills ranks higher than one with a perfect title match but skill gaps. This is the most important factor.
2. ROLE ALIGNMENT — Does the job title and responsibilities match what the candidate is looking for?
3. LOCATION & REMOTE FIT — Does the job match the candidate's location and remote work preferences?
4. SENIORITY FIT — Is the job at the right level for the candidate?
5. SALARY — Does the salary meet or exceed the candidate's floor?
6. FRESHNESS — Prefer recently posted jobs over stale listings.

# Decision Criteria
- strong: The candidate has most of the required skills, the role aligns well, and constraints (location, salary, seniority) are met. High confidence this is worth applying to.
- good: Reasonable match — some skill overlap, acceptable role fit. Worth surfacing but not a standout.
- skip: Poor skill match, wrong seniority, stale listing, or constraints violated. Not worth a feed slot.

# Constraints
- Surface at most ${visibleCap} jobs as strong or good. Prefer fewer high-quality results over padding.
- Use the deterministic score as a prior signal but correct it when the job description reveals a better or worse real fit.
- Do not invent facts not present in the payload.
- Respond with ONLY valid JSON. No markdown, no explanations. Start with { and end with }.`;
}

let cachedClient: AzureOpenAI | null = null;

function getAzureClient(): AzureOpenAI {
  if (!cachedClient) {
    cachedClient = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-04-01-preview',
      deployment: AZURE_DEPLOYMENT,
    });
  }
  return cachedClient;
}

export function hasOpenAICredentials(): boolean {
  return Boolean(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY);
}

export async function rankWithOpenAI(params: {
  settings: JobFeedSettings;
  candidates: JobFeedRankingCandidate[];
  visibleCap?: number;
}): Promise<JobFeedRankingExecutionResult> {
  const { settings, candidates, visibleCap = JOB_FEED_VISIBLE_MAX_COUNT } = params;
  const deterministicItems = buildDeterministicRankedItems(candidates, visibleCap);

  if (candidates.length === 0) {
    return { status: 'no_candidates', items: [], errorMessage: null, model: null };
  }

  if (!hasOpenAICredentials()) {
    return { status: 'completed_deterministic', items: deterministicItems, errorMessage: null, model: null };
  }

  const startTime = Date.now();
  try {
    const client = getAzureClient();
    const userPrompt = buildRankingPrompt(settings, candidates, visibleCap);

    const response = await client.chat.completions.create({
      model: AZURE_DEPLOYMENT,
      temperature: 0.2,
      max_tokens: 2200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt(visibleCap) },
        { role: 'user', content: userPrompt },
      ],
    });

    const latencyMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content ?? '';
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;

    console.log(
      `[JobFeedRanking] ${AZURE_MODEL_NAME} (${AZURE_DEPLOYMENT}) | ${inputTokens}in/${outputTokens}out | ${latencyMs}ms`
    );

    const parsed = JSON.parse(content) as JobFeedRankingModelResponse;
    const llmItems = validateModelRankingResponse(parsed, candidates, visibleCap);

    if (!llmItems) {
      return {
        status: 'llm_failed_fallback',
        items: deterministicItems,
        errorMessage: 'The ranking model response was incomplete or invalid, so the deterministic fallback was used.',
        model: { provider: 'openai', name: AZURE_MODEL_NAME, inputTokens, outputTokens, latencyMs },
      };
    }

    return {
      status: 'completed_llm',
      items: llmItems,
      errorMessage: null,
      model: { provider: 'openai', name: AZURE_MODEL_NAME, inputTokens, outputTokens, latencyMs },
    };
  } catch (error) {
    return {
      status: 'llm_failed_fallback',
      items: deterministicItems,
      errorMessage: error instanceof Error ? error.message : 'Unknown OpenAI ranking failure',
      model: null,
    };
  }
}

export function buildRankingRequestBody(params: {
  settings: JobFeedSettings;
  candidates: JobFeedRankingCandidate[];
  visibleCap?: number;
}): {
  model: string;
  temperature: number;
  max_tokens: number;
  response_format: { type: 'json_object' };
  messages: Array<{ role: 'system' | 'user'; content: string }>;
} {
  const cap = params.visibleCap ?? JOB_FEED_VISIBLE_MAX_COUNT;
  return {
    model: AZURE_DEPLOYMENT,
    temperature: 0.2,
    max_tokens: 2200,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildSystemPrompt(cap) },
      { role: 'user', content: buildRankingPrompt(params.settings, params.candidates, cap) },
    ],
  };
}

export function parseRankingResponse(
  content: string,
  candidates: JobFeedRankingCandidate[],
  visibleCap: number = JOB_FEED_VISIBLE_MAX_COUNT
): JobFeedRankedItemRecord[] | null {
  try {
    const parsed = JSON.parse(content) as JobFeedRankingModelResponse;
    return validateModelRankingResponse(parsed, candidates, visibleCap);
  } catch {
    return null;
  }
}

function buildRankingPrompt(settings: JobFeedSettings, candidates: JobFeedRankingCandidate[], visibleCap: number): string {
  return JSON.stringify({
    instruction: `Rank the shortlist for today's feed. Return one decision per candidate job. Surface at most ${visibleCap} jobs as strong or good. Prioritize jobs where the candidate's skills match the job's requirements.`,
    userProfile: {
      targetRoles: settings.target_roles,
      adjacentRolesEnabled: settings.adjacent_roles_enabled,
      adjacentRoles: settings.adjacent_roles,
      userSkills: settings.user_skills ?? [],
      preferredLocations: settings.preferred_locations,
      remotePreference: settings.remote_preference,
      salaryFloor: settings.salary_floor,
      seniorityTarget: settings.seniority_target,
      employmentTypes: settings.employment_types,
      workAuthorizationStatus: settings.work_authorization_status,
      targetMarket: settings.target_market,
      languages: settings.languages,
      aggressiveness: settings.aggressiveness,
    },
    candidates: candidates.map((candidate) => ({
      jobId: candidate.jobId,
      title: candidate.title,
      company: candidate.company,
      location: candidate.location,
      workMode: candidate.workMode,
      employmentType: candidate.employmentType,
      salaryText: candidate.salaryText,
      freshnessDays: candidate.freshnessDays,
      deterministicRank: candidate.deterministicRank,
      deterministicScore: candidate.deterministicScore,
      deterministicFitLabel: candidate.deterministicFitLabel,
      scoreBreakdown: candidate.scoreBreakdown,
      descriptionExcerpt: truncateText(candidate.description, 1400),
    })),
    responseFormat: {
      items: [
        {
          jobId: 'candidate job id',
          decision: 'strong | good | skip',
          rank: 'required integer for strong/good, null for skip',
          reason: 'optional short sentence, under 160 characters',
        },
      ],
    },
  }, null, 2);
}

function buildDeterministicRankedItems(candidates: JobFeedRankingCandidate[], visibleCap: number = JOB_FEED_VISIBLE_MAX_COUNT): JobFeedRankedItemRecord[] {
  return [...candidates]
    .sort((left, right) => {
      if (right.deterministicScore !== left.deterministicScore) {
        return right.deterministicScore - left.deterministicScore;
      }
      return left.deterministicRank - right.deterministicRank;
    })
    .slice(0, visibleCap)
    .map((candidate, index) => ({
      canonicalJobId: candidate.jobId,
      rank: index + 1,
      fitLabel: candidate.deterministicFitLabel,
      rankingSource: 'deterministic',
      reason: null,
      deterministicScore: candidate.deterministicScore,
    }));
}

function validateModelRankingResponse(
  payload: JobFeedRankingModelResponse,
  candidates: JobFeedRankingCandidate[],
  visibleCap: number = JOB_FEED_VISIBLE_MAX_COUNT
): JobFeedRankedItemRecord[] | null {
  if (!payload || !Array.isArray(payload.items)) {
    return null;
  }

  const candidateById = new Map(candidates.map((c) => [c.jobId, c]));
  const seenJobIds = new Set<string>();
  const surfacedItems: Array<{
    candidate: JobFeedRankingCandidate;
    fitLabel: 'strong' | 'good';
    rank: number;
    reason: string | null;
  }> = [];

  for (const item of payload.items) {
    if (!item || typeof item !== 'object') return null;

    const jobId = typeof item.jobId === 'string' ? item.jobId.trim() : '';
    const decision = item.decision;
    if (!jobId || !candidateById.has(jobId) || seenJobIds.has(jobId)) return null;
    if (decision !== 'strong' && decision !== 'good' && decision !== 'skip') return null;

    seenJobIds.add(jobId);
    if (decision === 'skip') continue;

    const rank = typeof item.rank === 'number' && Number.isInteger(item.rank) && item.rank > 0
      ? item.rank : null;
    if (rank === null) return null;

    surfacedItems.push({
      candidate: candidateById.get(jobId)!,
      fitLabel: decision,
      rank,
      reason: normalizeReason(item.reason),
    });
  }

  if (seenJobIds.size !== candidates.length) return null;

  surfacedItems.sort((left, right) => {
    if (left.rank !== right.rank) return left.rank - right.rank;
    return left.candidate.deterministicRank - right.candidate.deterministicRank;
  });

  return surfacedItems
    .slice(0, visibleCap)
    .map((item, index) => ({
      canonicalJobId: item.candidate.jobId,
      rank: index + 1,
      fitLabel: item.fitLabel,
      rankingSource: 'llm' as const,
      reason: item.reason,
      deterministicScore: item.candidate.deterministicScore,
    }));
}

function normalizeReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 160) : null;
}

function truncateText(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}
