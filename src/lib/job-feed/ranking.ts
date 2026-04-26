import { hasOpenAICredentials, rankWithOpenAI } from '@/lib/job-feed/openai-ranking';
import type {
  JobFeedRankingCandidate,
  JobFeedRankingExecutionResult,
} from '@/lib/job-feed/types';
import type { JobFeedSettings } from '@/lib/supabase/types';

export async function rankJobFeedCandidates(params: {
  settings: JobFeedSettings;
  candidates: JobFeedRankingCandidate[];
  visibleCap?: number;
  yearsExperience?: number | null;
}): Promise<JobFeedRankingExecutionResult> {
  return rankWithOpenAI(params);
}

export { hasOpenAICredentials };
