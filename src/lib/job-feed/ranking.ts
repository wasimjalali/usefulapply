import { hasOpenAICredentials, rankWithOpenAI } from '@/lib/job-feed/openai-ranking';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
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
  careerProfile?: CareerProfile | null;
}): Promise<JobFeedRankingExecutionResult> {
  return rankWithOpenAI(params);
}

export { hasOpenAICredentials };
