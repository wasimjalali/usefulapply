import { JOB_FEED_VISIBLE_MAX_COUNT } from '@/lib/job-feed/constants';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
import type {
  JobFeedRankingCandidate,
  JobFeedRankingExecutionResult,
} from '@/lib/job-feed/types';
import type { JobFeedSettings } from '@/lib/supabase/types';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import { callHaiku, InputBudgetError, measureHaikuRequest, type HaikuResponse } from '@/lib/models/haiku';
import {
  RANKING_INPUT_BUDGET_TOKENS,
  RANKING_JSON_SCHEMA,
  RANKING_SYSTEM_PROMPT,
  buildCandidatesMessage,
  buildDeterministicRankedItems,
  buildUserProfileMessage,
  fitCandidatesToBudget,
  validateModelRankingResponse,
  type JobFeedRankingModelResponse,
} from '@/lib/job-feed/llm-ranking-prompt';

// Ranking runs on Claude Haiku 5.5 (direct Anthropic API) through callHaiku,
// site 'ranking'. There is no second model: a real failure (API error, budget
// overflow, invalid or truncated response) returns the deterministic ranking
// with status 'llm_failed_fallback' and the error message, so the run still
// completes and the failure is visible in the run metadata.
//
// Cache layout (see .claude/rules/prompt-caching.md): tools none, then
// system.static (the ranking instructions, identical for every user and run,
// 5 minute TTL so runs from different users within minutes read it), then
// system.stableContext (this user's profile JSON, repeats across their runs),
// then the candidates message (changes every run).

// Thinking counts toward max_tokens. 40 items is ~3k output tokens, the rest is headroom.
const RANKING_MAX_TOKENS = 12000;

// Above this estimate the exact count_tokens call is worth its round trip.
// Plus-tier runs estimate well under it; Max-tier runs usually land above.

type RankingModelInfo = NonNullable<JobFeedRankingExecutionResult['model']>;

function modelInfoFrom(response: HaikuResponse): RankingModelInfo {
  return {
    provider: response.provider,
    name: response.model,
    // Total input (uncached + cache reads + cache writes), so run metadata shows the real prompt size.
    inputTokens: response.inputTokensTotal,
    outputTokens: response.usage.outputTokens,
    latencyMs: response.latencyMs,
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown ranking failure';
}

export async function rankWithHaiku(params: {
  settings: JobFeedSettings;
  candidates: JobFeedRankingCandidate[];
  visibleCap?: number;
  yearsExperience?: number | null;
  careerProfile?: CareerProfile | null;
  negativeTerms?: string[];
  excludedTerms?: string[];
  generationContext?: LlmGenerationContext;
}): Promise<JobFeedRankingExecutionResult> {
  const {
    settings,
    candidates,
    visibleCap = JOB_FEED_VISIBLE_MAX_COUNT,
    yearsExperience = null,
    careerProfile = null,
    negativeTerms = [],
    excludedTerms = [],
    generationContext,
  } = params;
  const deterministicItems = buildDeterministicRankedItems(candidates, visibleCap);

  if (candidates.length === 0) {
    return { status: 'no_candidates', items: [], errorMessage: null, model: null };
  }

  const stableContext = buildUserProfileMessage(settings, yearsExperience, careerProfile, negativeTerms, excludedTerms);
  const buildRequest = (excerptChars: number) => ({
    system: { static: RANKING_SYSTEM_PROMPT, stableContext },
    messages: [{ role: 'user' as const, content: buildCandidatesMessage(candidates, visibleCap, excerptChars) }],
  });

  const rankingGenerationContext = generationContext ?? {
    requestExecutionId: crypto.randomUUID(),
    route: 'job-feed/ranking',
    feature: 'job_feed',
    operation: 'job_feed_ranking',
  };

  let response: HaikuResponse;
  const startTime = Date.now();
  try {
    const fit = await fitCandidatesToBudget({
      candidates,
      countTokens: async (excerptChars) => {
        const request = buildRequest(excerptChars);
        const measured = await measureHaikuRequest({
          site: 'ranking',
          system: request.system,
          messages: request.messages,
          jsonSchema: RANKING_JSON_SCHEMA,
          maxTokens: RANKING_MAX_TOKENS,
          cacheTtl: '5m',
          generationContext: rankingGenerationContext,
        });
        return measured.totalTokens;
      },
    });
    if (!fit.fits) {
      // Deterministic path: the shrink already hit the floor or recounted over budget.
      throw new InputBudgetError('ranking', fit.tokens);
    }
    if (fit.shrunk) {
      console.warn(
        `[JobFeedRanking] input over ${RANKING_INPUT_BUDGET_TOKENS} tokens at full excerpts; shrank descriptionExcerpt to ${fit.excerptChars} chars (${fit.tokens} tokens)`,
      );
    }
    const request = buildRequest(fit.excerptChars);
    response = await callHaiku({
      site: 'ranking',
      system: request.system,
      messages: request.messages,
      jsonSchema: RANKING_JSON_SCHEMA,
      maxTokens: RANKING_MAX_TOKENS,
      cacheTtl: '5m',
      generationContext: rankingGenerationContext,
    });
  } catch (error) {
    console.error(`[JobFeedRanking] call failed after ${Date.now() - startTime}ms`, error);
    return { status: 'llm_failed_fallback', items: deterministicItems, errorMessage: errorText(error), model: null };
  }

  const modelInfo = modelInfoFrom(response);
  console.log(
    `[JobFeedRanking] ${response.model} | ${modelInfo.inputTokens}in (${response.usage.cacheReadInputTokens ?? 0} cache read, ${response.usage.cacheCreationInputTokens ?? 0} cache write) / ${modelInfo.outputTokens}out | ${modelInfo.latencyMs}ms | candidates=${candidates.length}`,
  );

  try {
    const parsed = JSON.parse(response.content) as JobFeedRankingModelResponse;
    const items = validateModelRankingResponse(parsed, candidates, visibleCap);
    if (!items) {
      return {
        status: 'llm_failed_fallback',
        items: deterministicItems,
        errorMessage: 'The ranking model response was incomplete or invalid.',
        model: modelInfo,
      };
    }
    return { status: 'completed_llm', items, errorMessage: null, model: modelInfo };
  } catch (error) {
    console.error('[JobFeedRanking] returned an invalid response', error);
    return { status: 'llm_failed_fallback', items: deterministicItems, errorMessage: errorText(error), model: modelInfo };
  }
}
