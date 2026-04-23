import { JOB_FEED_VISIBLE_MAX_COUNT } from '@/lib/job-feed/constants';
import { callModel, logModelUsage, parseModelJSON } from '@/lib/models';
import type {
  JobFeedRankedItemRecord,
  JobFeedRankingCandidate,
  JobFeedRankingExecutionResult,
} from '@/lib/job-feed/types';
import type { JobFeedSettings } from '@/lib/supabase/types';

type JobFeedRankingDecision = 'strong' | 'good' | 'skip';

interface JobFeedRankingModelResponse {
  items: Array<{
    jobId: string;
    decision: JobFeedRankingDecision;
    rank?: number | null;
    reason?: string | null;
  }>;
}

const JOB_FEED_RANKING_SYSTEM_PROMPT = [
  'You rank a deterministic shortlist of jobs for Karko AI\'s daily feed.',
  'Return one decision for every candidate job.',
  'Allowed decisions are: strong, good, skip.',
  'Use strong for high-confidence fits that should lead the feed.',
  'Use good for worthwhile matches that are still worth surfacing.',
  'Use skip when a job is too weak, noisy, stale, or mismatched to deserve a visible feed slot.',
  'Respect explicit constraints first: role alignment, location and remote fit, employment type, salary floor when known, work authorization, and seniority.',
  'Prefer fewer high-quality jobs over padding the feed.',
  `Surface at most ${JOB_FEED_VISIBLE_MAX_COUNT} jobs total as strong or good.`,
  'Use the deterministic score as a prior signal, but correct it when the job description suggests a better or worse real fit.',
  'Do not invent facts that are not present in the candidate payload.',
].join(' ');

export async function rankJobFeedCandidates(params: {
  settings: JobFeedSettings;
  candidates: JobFeedRankingCandidate[];
}): Promise<JobFeedRankingExecutionResult> {
  const { settings, candidates } = params;
  const deterministicItems = buildDeterministicRankedItems(candidates);

  if (candidates.length === 0) {
    return {
      status: 'no_candidates',
      items: [],
      errorMessage: null,
      model: null,
    };
  }

  if (!hasRankingModelCredentials()) {
    return {
      status: 'completed_deterministic',
      items: deterministicItems,
      errorMessage: null,
      model: null,
    };
  }

  try {
    const response = await callModel({
      task: 'fit_assessment',
      systemPrompt: JOB_FEED_RANKING_SYSTEM_PROMPT,
      prompt: buildRankingPrompt(settings, candidates),
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 2200,
    });

    logModelUsage('fit_assessment', response, 'job-feed-ranking');

    const parsed = parseModelJSON<JobFeedRankingModelResponse>(response.content);
    const llmItems = validateModelRankingResponse(parsed, candidates);

    if (!llmItems) {
      return {
        status: 'llm_failed_fallback',
        items: deterministicItems,
        errorMessage: 'The ranking model response was incomplete or invalid, so the deterministic fallback was used.',
        model: {
          provider: response.provider,
          name: response.model,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          latencyMs: response.latencyMs,
        },
      };
    }

    return {
      status: 'completed_llm',
      items: llmItems,
      errorMessage: null,
      model: {
        provider: response.provider,
        name: response.model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        latencyMs: response.latencyMs,
      },
    };
  } catch (error) {
    return {
      status: 'llm_failed_fallback',
      items: deterministicItems,
      errorMessage: error instanceof Error ? error.message : 'Unknown job feed ranking failure',
      model: null,
    };
  }
}

function buildDeterministicRankedItems(candidates: JobFeedRankingCandidate[]): JobFeedRankedItemRecord[] {
  return [...candidates]
    .sort((left, right) => {
      if (right.deterministicScore !== left.deterministicScore) {
        return right.deterministicScore - left.deterministicScore;
      }

      return left.deterministicRank - right.deterministicRank;
    })
    .slice(0, JOB_FEED_VISIBLE_MAX_COUNT)
    .map((candidate, index) => ({
      canonicalJobId: candidate.jobId,
      rank: index + 1,
      fitLabel: candidate.deterministicFitLabel,
      rankingSource: 'deterministic',
      reason: null,
      deterministicScore: candidate.deterministicScore,
    }));
}

function buildRankingPrompt(settings: JobFeedSettings, candidates: JobFeedRankingCandidate[]): string {
  return JSON.stringify({
    instruction: 'Rank the shortlist for today\'s feed. Return one decision per candidate job and keep surfaced jobs within the visible feed cap.',
    userProfile: {
      targetRoles: settings.target_roles,
      adjacentRolesEnabled: settings.adjacent_roles_enabled,
      adjacentRoles: settings.adjacent_roles,
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

function validateModelRankingResponse(
  payload: JobFeedRankingModelResponse,
  candidates: JobFeedRankingCandidate[]
): JobFeedRankedItemRecord[] | null {
  if (!payload || !Array.isArray(payload.items)) {
    return null;
  }

  const candidateById = new Map(candidates.map((candidate) => [candidate.jobId, candidate]));
  const seenJobIds = new Set<string>();
  const surfacedItems: Array<{
    candidate: JobFeedRankingCandidate;
    fitLabel: 'strong' | 'good';
    rank: number;
    reason: string | null;
  }> = [];

  for (const item of payload.items) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const jobId = typeof item.jobId === 'string' ? item.jobId.trim() : '';
    const decision = item.decision;
    if (!jobId || !candidateById.has(jobId) || seenJobIds.has(jobId)) {
      return null;
    }

    if (decision !== 'strong' && decision !== 'good' && decision !== 'skip') {
      return null;
    }

    seenJobIds.add(jobId);

    if (decision === 'skip') {
      continue;
    }

    const rank = typeof item.rank === 'number' && Number.isInteger(item.rank) && item.rank > 0
      ? item.rank
      : null;

    if (rank === null) {
      return null;
    }

    surfacedItems.push({
      candidate: candidateById.get(jobId)!,
      fitLabel: decision,
      rank,
      reason: normalizeReason(item.reason),
    });
  }

  if (seenJobIds.size !== candidates.length) {
    return null;
  }

  surfacedItems.sort((left, right) => {
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }

    return left.candidate.deterministicRank - right.candidate.deterministicRank;
  });

  return surfacedItems
    .slice(0, JOB_FEED_VISIBLE_MAX_COUNT)
    .map((item, index) => ({
      canonicalJobId: item.candidate.jobId,
      rank: index + 1,
      fitLabel: item.fitLabel,
      rankingSource: 'llm',
      reason: item.reason,
      deterministicScore: item.candidate.deterministicScore,
    }));
}

function normalizeReason(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 160);
}

function truncateText(value: string | null, maxLength: number): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function hasRankingModelCredentials(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY
    || process.env.AWS_BEARER_TOKEN_BEDROCK
    || (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
    || (process.env.DIGITALOCEAN_AGENT_ENDPOINT && process.env.DIGITALOCEAN_ACCESS_KEY)
  );
}
