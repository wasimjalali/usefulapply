/**
 * Replace Google's copy of an ad with the ad itself, for the jobs a run is about to rank.
 *
 * Runs after the prefilter, so only jobs that can still reach the feed are fetched. A job whose text
 * already came from its own page is skipped, so a job seen again on a later day costs nothing. The ranker
 * then reads an excerpt of the ad's own text, and the inbox, the web app and the MCP show all of it.
 */

import type { JobFeedCanonicalJob } from '@/db/types';
import { needsPostingPage, postingUrlCandidates, readFullPosting } from '@/lib/job-feed/posting-page';

const CONCURRENCY = 6;
const MAX_JOBS_PER_RUN = 40;
/** The whole pass never holds a run longer than this (every fetch is cut to it); jobs not reached keep their Google copy. */
const PASS_DEADLINE_MS = 45_000;

function applyOptionLinks(job: JobFeedCanonicalJob): string[] {
  const identifiers = job.source_identifiers;
  if (!identifiers || typeof identifiers !== 'object' || Array.isArray(identifiers)) return [];
  const options = (identifiers as Record<string, unknown>).apply_options;
  if (!Array.isArray(options)) return [];
  return options
    .map((option) => (option && typeof option === 'object' ? (option as Record<string, unknown>).link : null))
    .filter((link): link is string => typeof link === 'string');
}

export interface DescriptionEnrichmentResult {
  jobs: JobFeedCanonicalJob[];
  attempted: number;
  enriched: number;
}

/**
 * Returns `jobs` in the same order, with each enriched job replaced by its updated row. A fetch or
 * parse failure leaves the job as it was; a failed database write is thrown, as every other write of
 * the run is.
 */
export async function enrichJobDescriptions(params: {
  jobs: JobFeedCanonicalJob[];
  updateJob: (jobId: string, updates: Partial<JobFeedCanonicalJob>) => Promise<JobFeedCanonicalJob>;
  fetchImpl?: typeof fetch;
}): Promise<DescriptionEnrichmentResult> {
  const deadline = Date.now() + PASS_DEADLINE_MS;
  const result = [...params.jobs];
  const targets = result
    .map((job, index) => ({ job, index }))
    .filter(({ job }) => job.description_source !== 'employer_page' && needsPostingPage(job.description))
    .slice(0, MAX_JOBS_PER_RUN);

  let enriched = 0;
  let next = 0;
  const worker = async () => {
    while (next < targets.length && Date.now() < deadline) {
      const { job, index } = targets[next];
      next += 1;
      const urls = postingUrlCandidates([...applyOptionLinks(job), job.apply_url, job.source_url]);
      if (urls.length === 0) continue;
      const posting = await readFullPosting({ urls, title: job.title, company: job.company, current: job.description, fetchImpl: params.fetchImpl, deadline });
      if (!posting) continue;
      result[index] = await params.updateJob(job.id, {
        description: posting.text,
        description_source: 'employer_page',
        description_complete: true,
      });
      enriched += 1;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

  return { jobs: result, attempted: targets.length, enriched };
}
