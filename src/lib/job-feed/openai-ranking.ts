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

// Static system prompt — identical across every ranking request, every user,
// every run. Azure OpenAI automatically caches prefixes >=1024 tokens, so the
// LONGER and more stable this prompt is, the higher our cache hit rate and
// the lower our effective input token cost. visibleCap deliberately lives in
// the per-run user message (not here) so the system prompt hash is stable
// across tiers too.
const SYSTEM_PROMPT = `# Role
You are the ranking engine for Karko AI's Daily Job Feed. Every morning you evaluate a set of job postings fetched for a specific candidate and decide which ones are worth putting in that candidate's feed today. You are the final quality gate — deterministic prefilters upstream only enforce hard user-stated constraints (explicit employment type, explicit salary floor, explicit no-sponsorship language). Everything else is your responsibility: role fit, seniority fit, location fit, remote preference fit, skill fit, and freshness.

# Task
For each candidate job in the payload, return exactly one decision: "strong", "good", or "skip". Also assign a rank (1 = best) across all non-skipped jobs. The user will only see jobs you rank as strong or good.

# Priority order (most important first)
1. SKILL MATCH — Does the job description require skills the candidate actually has? A candidate meeting 80%+ of must-have skills beats a perfect title match with meaningful skill gaps. Read the description carefully; do not infer from title alone. Skill match is the single most important signal.
2. ROLE ALIGNMENT — Does the title and the day-to-day responsibilities match what the candidate is looking for? Adjacent roles (e.g. "Applied AI Engineer" for someone searching "AI Engineer") count as aligned. Titles in non-English languages count — translate mentally and score on content.
3. LOCATION FIT — Does the job location satisfy the candidate's preferred locations AND their remote preferences? Accept both exact and nearby-city matches (Berlin vs Potsdam, München vs Garching). Treat "remote within DACH", "remote in EU", "hybrid from preferred city" as satisfying the intent when the candidate is open to that mode.
4. REMOTE PREFERENCE FIT — If the candidate asked for onsite and the job is clearly fully-remote-only, that's a skip even if the skills match. If the candidate asked for remote_only and the job is clearly onsite-only, that's a skip. If work mode is unclear or compatible, treat as a match and lean on description keywords.
5. SENIORITY FIT — Is the job at the right level? Within ±1 level of the candidate's target is OK. A clearly junior candidate seeing a staff/principal role is a skip. A senior candidate seeing an intern role is a skip. Title alone is unreliable in non-English postings; read the description.
6. SALARY — If the job states salary AND it's below the candidate's floor, skip. If salary is absent, do not penalize.
7. FRESHNESS — Prefer recently posted jobs. A job posted 30+ days ago is stale unless everything else is perfect.

# Decision criteria
- strong: High confidence. Candidate meets most required skills, title+responsibilities align, location/remote constraints are met, seniority fits. The candidate should apply to this today.
- good: Reasonable match — some skill overlap, acceptable role fit, no hard constraints violated. Worth surfacing but not a standout. Typical "solid but not perfect" match.
- skip: Skill gap is too large, seniority is wrong, location/remote is incompatible, the posting is too stale, or the role is fundamentally different from what the candidate wants. Not worth a feed slot.

# Non-English postings
Job descriptions may be in German, French, Spanish, Italian, Dutch, Portuguese, or other languages — especially when the candidate targets DACH / EU markets. Rank these on content, not language. Do not penalize a German-language posting for a candidate whose language settings include German or English. Treat common equivalents: "Software-Entwickler" = Software Engineer, "Ingénieur IA" = AI Engineer, "vor Ort" / "presencial" = onsite, "Homeoffice" / "télétravail" = remote, "befristet" = temporary/contract.

# What the deterministic score is, and how to use it
Each candidate includes a deterministic score and score breakdown computed upstream. Use these as a prior signal — they encode role/token match, freshness, salary alignment, remote alignment, preferred-location match, apply-URL availability, and skill overlap. However: YOU are reading the full description and they are not. If the deterministic score is high but the description reveals the role is a poor fit (wrong stack, wrong seniority clearly stated, mandatory skill gap), downgrade to skip. If the deterministic score is mediocre but the description reveals a strong fit that heuristics missed (e.g. non-English title that happens to be exactly the role the candidate wants, unusual seniority phrasing, title mismatch with responsibilities match), upgrade to good or strong. Your judgement overrides the heuristic when the text supports it.

# Quality over quantity
The feed is daily — fewer high-quality matches beats more mediocre ones. If only 2 of 30 candidates are strong fits, return 2 strongs and skip the rest. Do not pad the feed with mediocre jobs just to hit a number. Do not return the same job under two decisions. Use each job ID exactly once.

# Forbidden
- Do not invent facts. If the description does not state a skill, salary, or requirement, do not assume it.
- Do not rank based on the company name alone. A FAANG job with a bad fit is still a skip.
- Do not surface jobs that violate hard user constraints (employment type, stated salary floor, stated no-sponsorship requirement when the candidate needs sponsorship).
- Do not return markdown, explanations, code fences, or any text outside the JSON object.

# Response format
Return ONLY a valid JSON object. No markdown fences. No prose. Start with { and end with }. The object has one field, "items", which is an array. Each array element has:
- "jobId": string — must exactly match one of the provided candidate jobIds.
- "decision": "strong" | "good" | "skip".
- "rank": positive integer when decision is "strong" or "good"; null when decision is "skip".
- "reason": optional short sentence (<=160 characters) explaining the match or mismatch; may be null.

Every candidate jobId must appear exactly once in the items array. The candidate count and your items count must match.`;

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

    // Two-message structure optimized for Azure OpenAI prompt caching:
    //   1. SYSTEM_PROMPT (static, >=1024 tokens → cached across all users/runs)
    //   2. userProfile message (stable per user → cached across that user's
    //      daily runs when they run again within the TTL window)
    //   3. candidates message (dynamic → never cached, only these tokens paid
    //      at full price)
    const response = await client.chat.completions.create({
      model: AZURE_DEPLOYMENT,
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserProfileMessage(settings) },
        { role: 'user', content: buildCandidatesMessage(candidates, visibleCap) },
      ],
    });

    const latencyMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content ?? '';
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    // Azure OpenAI returns cached token count on response.usage.prompt_tokens_details.cached_tokens
    const cachedTokens =
      (response.usage as unknown as { prompt_tokens_details?: { cached_tokens?: number } })
        ?.prompt_tokens_details?.cached_tokens ?? 0;

    console.log(
      `[JobFeedRanking] ${AZURE_MODEL_NAME} (${AZURE_DEPLOYMENT}) | ${inputTokens}in (${cachedTokens} cached) / ${outputTokens}out | ${latencyMs}ms | candidates=${candidates.length}`
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
    max_tokens: 4000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserProfileMessage(params.settings) },
      { role: 'user', content: buildCandidatesMessage(params.candidates, cap) },
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

// Per-user, stable across daily runs. Emitting the user profile as its own
// message (instead of mixing it with candidates) lets Azure OpenAI cache
// this block across repeat runs within the cache TTL window.
function buildUserProfileMessage(settings: JobFeedSettings): string {
  return JSON.stringify({
    section: 'candidate_profile',
    profile: {
      targetRoles: settings.target_roles,
      userSkills: settings.user_skills ?? [],
      preferredLocations: settings.preferred_locations,
      remotePreferences: (settings.remote_preferences && settings.remote_preferences.length > 0)
        ? settings.remote_preferences
        : [settings.remote_preference],
      seniorityTargets: (settings.seniority_targets && settings.seniority_targets.length > 0)
        ? settings.seniority_targets
        : (settings.seniority_target ? [settings.seniority_target] : []),
      targetCountries: (settings.target_countries && settings.target_countries.length > 0)
        ? settings.target_countries
        : undefined,
      targetCities: settings.target_cities ?? [],
      salaryFloor: settings.salary_floor,
      employmentTypes: settings.employment_types,
      workAuthorizationStatus: settings.work_authorization_status,
      targetMarket: settings.target_market,
      languages: settings.languages,
      aggressiveness: settings.aggressiveness,
    },
  }, null, 2);
}

// Per-run dynamic content: the actual candidate jobs and the visibleCap.
// This is the only message that changes every run and therefore the only
// block we pay full input-token price on.
function buildCandidatesMessage(candidates: JobFeedRankingCandidate[], visibleCap: number): string {
  return JSON.stringify({
    section: 'rank_today',
    instruction: `Rank these ${candidates.length} candidate job(s) against the candidate profile above. Return one decision per job ID (strong, good, or skip). Surface at most ${visibleCap} jobs as strong or good; if only 2 are truly strong fits, return 2 strongs and skip the rest rather than padding. Every candidate jobId must appear exactly once in your response.`,
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
