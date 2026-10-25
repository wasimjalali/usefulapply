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
/** A page that had no readable ad is tried again only after this long. */
const RETRY_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

function identifiers(job: JobFeedCanonicalJob): Record<string, unknown> {
  const value = job.source_identifiers;
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** When the ad's own page was last tried without a readable ad, if it was. */
function checkedRecently(job: JobFeedCanonicalJob, now: number): boolean {
  const checkedAt = identifiers(job).posting_page_checked_at;
  return typeof checkedAt === 'string' && now - Date.parse(checkedAt) < RETRY_AFTER_MS;
}

function applyOptionLinks(job: JobFeedCanonicalJob): string[] {
  const options = identifiers(job).apply_options;
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
    .filter(({ job }) => job.description_source !== 'employer_page' && needsPostingPage(job.description) && !checkedRecently(job, Date.now()))
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
      if (posting.text === null) {
        // Remembered, so the same dead or ad-less page is not fetched again on every run. A fetch that may
        // work next time (a timeout, a 429 or 5xx, the pass deadline) says nothing about the page, so it is not.
        if (posting.transient || Date.now() >= deadline) continue;
        result[index] = await params.updateJob(job.id, {
          source_identifiers: { ...identifiers(job), posting_page_checked_at: new Date().toISOString() } as JobFeedCanonicalJob['source_identifiers'],
        });
        continue;
      }
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
