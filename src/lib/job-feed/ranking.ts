import { rankWithHaiku } from '@/lib/job-feed/llm-ranking';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
import type {
  JobFeedRankingCandidate,
  JobFeedRankingExecutionResult,
} from '@/lib/job-feed/types';
import type { JobFeedSettings } from '@/db/types';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';

export async function rankJobFeedCandidates(params: {
  settings: JobFeedSettings;
  candidates: JobFeedRankingCandidate[];
  visibleCap?: number;
  yearsExperience?: number | null;
  careerProfile?: CareerProfile | null;
  negativeTerms?: string[];
  excludedTerms?: string[];
  generationContext?: LlmGenerationContext;
}): Promise<JobFeedRankingExecutionResult> {
  return rankWithHaiku(params);
}
