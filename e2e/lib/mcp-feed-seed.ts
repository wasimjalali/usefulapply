import { openLocalD1 } from './sqlite';

/**
 * Job feed rows for the MCP feed specs, written straight into the local D1 the way the feed pipeline leaves
 * them. Nothing here, and nothing in the MCP specs, ever starts a search: the preview's queue consumer would
 * reach a real search provider for a run it claims, so the specs only use runs that no message will claim
 * (see 10-feed.spec.ts).
 */

function withDb<T>(fn: (db: ReturnType<typeof openLocalD1>) => T): T {
  const db = openLocalD1();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export interface SeededFeedJob {
  id: string;
  title: string;
  company: string;
  fitLabel: 'strong' | 'good';
}

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Feed settings with consent on file, in UTC, the way a user who finished setup has them. */
export function seedFeedSettings(userId: string, options: { consent?: boolean; enabled?: boolean } = {}): void {
  const now = new Date().toISOString();
  withDb((db) => {
    db.prepare(`
      INSERT OR REPLACE INTO job_feed_settings
        (user_id, enabled, consent_accepted_at, user_timezone, target_market, target_countries, target_cities, target_roles,
         preferred_locations, remote_preference, remote_preferences, salary_floor, languages, seniority_target, seniority_targets,
         employment_types, work_authorization_status, user_skills, excluded_terms, created_at, updated_at)
      VALUES (?, ?, ?, 'UTC', 'us_canada', '["us"]', '[]', '["Financial Analyst"]', '[]', 'flexible', '["remote","hybrid"]',
              NULL, '["en"]', NULL, '["senior"]', '["full_time"]', NULL, '[]', '[]', ?, ?)
    `).run(userId, options.enabled === false ? 0 : 1, options.consent === false ? null : now, now, now);
  });
}

/** A feed run row. `localDate` defaults to today in UTC, which is the settings' timezone. */
export function seedFeedRun(
  userId: string,
  options: { status: 'queued' | 'running' | 'completed' | 'failed'; triggerSource?: string; localDate?: string; ranked?: number },
): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  withDb((db) => {
    db.prepare(`
      INSERT INTO job_feed_runs
        (id, user_id, local_date, local_timezone, trigger_source, status, idempotency_key, started_at, completed_at,
         raw_jobs_fetched, jobs_after_prefilter, ranked_jobs_count, metadata, created_at, updated_at)
      VALUES (?, ?, ?, 'UTC', ?, ?, ?, ?, ?, 10, 5, ?, '{}', ?, ?)
    `).run(
      id,
      userId,
      options.localDate ?? today(),
      options.triggerSource ?? 'manual_user',
      options.status,
      `e2e-run-${id}`,
      options.status === 'queued' ? null : now,
      options.status === 'completed' ? now : null,
      options.ranked ?? 0,
      now,
      now,
    );
  });
  return id;
}

/** Jobs in a user's inbox: a completed run from yesterday that ranked each of them. */
export function seedFeedInbox(
  userId: string,
  jobs: Array<{ title: string; company: string; fitLabel: 'strong' | 'good'; description?: string }>,
): SeededFeedJob[] {
  const runId = seedFeedRun(userId, { status: 'completed', triggerSource: 'scheduled', localDate: yesterday(), ranked: jobs.length });
  const now = new Date().toISOString();
  const out: SeededFeedJob[] = [];
  withDb((db) => {
    jobs.forEach((job, index) => {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO job_feed_canonical_jobs
          (id, canonical_key, source_provider, source_job_id, title, title_normalized, company, company_normalized, location_text,
           location_normalized, work_mode, employment_type, salary_text, description, apply_url, source_url, posted_at_text,
           freshness_days, source_identifiers, first_seen_at, last_seen_at, times_seen, created_at, updated_at)
        VALUES (?, ?, 'serpapi', ?, ?, ?, ?, ?, 'Remote', 'remote', 'remote', 'full_time', 'USD 90k to 110k', ?, ?, ?, '1 day ago', 1, '[]', ?, ?, 1, ?, ?)
      `).run(
        id,
        `e2e-${id}`,
        `e2e-source-${id}`,
        job.title,
        job.title.toLowerCase(),
        job.company,
        job.company.toLowerCase(),
        job.description ?? `${job.title} at ${job.company}. You own the rolling forecast and month-end reporting. Required: Forecasting.`,
        `https://jobs.example.test/${id}`,
        `https://jobs.example.test/source/${id}`,
        now,
        now,
        now,
        now,
      );
      db.prepare(`
        INSERT INTO job_feed_ranked_items
          (id, run_id, user_id, canonical_job_id, rank_position, fit_label, ranking_source, reason, deterministic_score, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'llm', ?, 80, '{}', ?)
      `).run(crypto.randomUUID(), runId, userId, id, index + 1, job.fitLabel, `Matches the forecasting work at ${job.company}.`, now);
      out.push({ id, title: job.title, company: job.company, fitLabel: job.fitLabel });
    });
  });
  return out;
}

export function feedRuns(userId: string): Array<{ id: string; status: string; trigger_source: string; local_date: string }> {
  return withDb(
    (db) => db.prepare('SELECT id, status, trigger_source, local_date FROM job_feed_runs WHERE user_id = ? ORDER BY created_at').all(userId) as Array<{ id: string; status: string; trigger_source: string; local_date: string }>,
  );
}

export function feedFeedbackRows(userId: string): Array<Record<string, unknown>> {
  return withDb((db) => db.prepare('SELECT canonical_job_id, application_session_id, generation_status, generation_error, saved_at, dismissed_at FROM job_feed_feedback WHERE user_id = ?').all(userId) as Array<Record<string, unknown>>);
}

/** A career profile the way the synthesis stores it, with a pivot and skill clusters, so get_career_profile maps every field of a real one. */
export function seedCareerProfile(userId: string): void {
  const now = new Date().toISOString();
  const profile = {
    version: 2,
    generatedAt: now,
    function: 'finance',
    inferredTitles: [
      { canonical: 'Senior FP&A Analyst', confidence: 'high', rationale: 'Five years of forecasting.' },
      { canonical: 'Financial Controller', confidence: 'medium', rationale: 'Month-end close ownership.' },
    ],
    seniority: { level: 'senior', confidence: 'high', rationale: 'Leads the forecast cycle.' },
    targetDirection: {
      aspirationalTitles: ['Head of Planning'],
      pivot: { from: 'analyst', to: 'finance manager' },
      confidence: 'medium',
      rationale: 'Recent roles add team leadership.',
    },
    yearsTotal: 5,
    yearsInFunction: 5,
    primarySkillClusters: [{ name: 'planning and forecasting', skills: ['Forecasting', 'Budgeting'], evidenceStrength: 'strong' }],
    secondarySkillClusters: [{ name: 'reporting tools', skills: ['Excel', 'Anaplan'], evidenceStrength: 'moderate' }],
    industryDomains: ['consumer goods'],
    toolsEnvironment: ['Excel', 'Anaplan'],
    workingLanguages: ['English'],
    narrative: 'A senior analyst moving toward planning leadership.',
    negativeSignals: ['sales'],
  };
  withDb((db) => {
    db.prepare(`
      INSERT OR REPLACE INTO user_career_profiles (user_id, profile, version, source_document_id, source_document_updated_at, model_provider, model_name, created_at, updated_at)
      VALUES (?, ?, 2, NULL, NULL, 'e2e', 'seed', ?, ?)
    `).run(userId, JSON.stringify(profile), now, now);
  });
}
