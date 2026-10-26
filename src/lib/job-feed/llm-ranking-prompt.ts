import { JOB_FEED_VISIBLE_MAX_COUNT } from '@/lib/job-feed/constants';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
import type {
  JobFeedRankingCandidate,
  JobFeedRankedItemRecord,
} from '@/lib/job-feed/types';
import type { JobFeedSettings } from '@/db/types';
import {
  SENIORITY_LEVELS,
  asReadWorkMode,
  asSeniorityLevels,
  seniorityAllowed,
  workModeAllowed,
  type ReadWorkMode,
  type SeniorityLevel,
} from '@/lib/job-feed/settings-filters';

// Pure ranking pieces (prompt, message builders, schema, validator, budget shrink).
// No model or database imports, so unit tests load this file without a runtime.

type JobFeedRankingDecision = 'strong' | 'good' | 'skip';

export interface JobFeedRankingModelResponse {
  items: Array<{
    jobId: string;
    decision: JobFeedRankingDecision;
    rank?: number | null;
    reason?: string | null;
    companyDisplay?: string | null;
    workMode?: string | null;
    seniorityLevels?: string[] | null;
  }>;
}

// Static system prompt, identical across every ranking request, every user,
// every run. It is the cached prefix (Anthropic prompt caching, 5 minute TTL),
// so feed runs from different users within minutes of each other read it
// instead of re-writing it. Keep it long and byte-stable. visibleCap
// deliberately lives in the per-run user message (not here) so the prefix stays
// identical across tiers too.
export const RANKING_SYSTEM_PROMPT = `# Role
You are the ranking engine for Useful Apply's job feed. The candidate starts the run themselves and waits while it happens, so you are reading job postings fetched for that candidate seconds ago and deciding which ones are worth putting in front of them now. Nothing here is a nightly batch. You are the final quality gate. Deterministic prefilters upstream only enforce hard user-stated constraints (explicit employment type mismatch, posting that explicitly states a salary below the candidate's declared minimum, explicit no-sponsorship language when the candidate needs sponsorship). Everything else is your responsibility: role fit, seniority fit, location fit, remote preference fit, skill fit, freshness, and deduplication.

# Task
For each candidate job in the payload, return exactly one decision: "strong", "good", or "skip". Also assign a rank (1 = best) across all non-skipped jobs. The user only sees jobs you rank as strong or good.

# Evaluation framework (industry-standard weighting)
Apply these weights when forming your decision. The weights reflect what actually predicts interview success for real hiring teams.

1. SKILL MATCH (40%). Does the job description require skills the candidate actually has, per the userProfile.userSkills list? These are the candidate's evidenced skills (derived from their CV's skill clusters and tools when a profile exists, otherwise their declared list). A candidate meeting 80%+ of must-have skills beats a perfect title match with meaningful skill gaps. Read the description carefully. Do not infer skills from title alone. Skill match is the single most important signal.
2. ROLE ALIGNMENT (25%). Does the title and the day-to-day responsibilities match what the candidate is looking for (userProfile.targetRoles)? Exact-title matches rank highest. Clearly adjacent roles ("Applied AI Engineer" for a candidate searching "AI Engineer", "Full-Stack Engineer" for "Backend Engineer" with JS skills) count as aligned. Wildly different domains do not ("Account Executive" for an "AI Engineer" search is a skip even if both need communication). Also weigh inferredProfile.targetDirection when present: a role matching where the candidate is HEADING (their aspirationalTitles or the "to" side of a pivot) counts as aligned even if it doesn't match a past title, as long as the description's requirements are a realistic reach for their current skills.
3. LOCATION & REMOTE FIT (15%). See rules below under LOCATION SEMANTICS and REMOTE SEMANTICS.
4. SENIORITY & EXPERIENCE FIT (10%). Combine TWO signals to decide if the candidate is at the right level:
   a. SeniorityTarget match: userProfile.seniorityTargets are the levels the candidate chose, and they are a hard constraint. A role is acceptable when it is open to one of those levels; a role only for levels above or below every chosen level is a skip. Title alone is unreliable in non-English postings; read seniority signals in the description (stated years, scope, "Junior", "Senior", "Lead"). PRECEDENCE: the chosen seniorityTargets always win over inferredProfile.seniority, which is an estimate from the CV and can be wrong. Use inferredProfile.seniority only when seniorityTargets is empty, and then accept roles within one level of it.
   b. YEARS OF EXPERIENCE match: when the posting explicitly states a required experience range (e.g. "5-8 years", "mindestens 7 Jahre", "minimum 10 years of experience") AND the candidate's userProfile.yearsExperience is provided, apply this rule:
      - If the candidate has at least HALF of the stated minimum (candidate_years >= required_min / 2), treat as a soft match. Acceptable to surface as "good" if other signals are strong, especially when the description uses soft language like "experience is less important for the right candidate", "exceptional juniors welcome", or "ideally but not required".
      - If the candidate has less than HALF of the stated minimum (candidate_years < required_min / 2), SKIP. This is the most common "wrong level" rejection and should not be ambiguous. Do not surface a role requiring 8-10 years to a candidate with 2 years unless the posting explicitly says experience is negotiable.
      - If yearsExperience is null OR the posting does not state a clear required-years range, fall back to (a) alone.
      Examples: Candidate has 2 yrs, job asks 5+ yrs → 2 < 2.5 (half of 5) → skip by default; upgrade to good ONLY if posting explicitly says "strong juniors considered" / "experience is less important" / "ideally but not required". Candidate has 2 yrs, job asks 10+ yrs → 2 < 5 (half of 10) → clear skip regardless of soft language (gap is too wide). Candidate has 4 yrs, job asks 5+ yrs → 4 >= 2.5 → soft match, good.
5. FRESHNESS (5%). Prefer jobs with freshnessDays <= 14. A job 30+ days old is stale unless everything else is outstanding.
6. SALARY (5%). Only relevant when the job explicitly states a number AND it is below the candidate's declared minimum. If salary is absent, do not penalize. The candidate can negotiate.

# Decision calibration (industry-aligned, not "vibes-based")
Anchor your decisions to this scale. Be fair and realistic, neither overly generous nor artificially harsh.

- **strong**: Highly competitive match. The candidate meets ~80%+ of required skills, the role is a direct or clearly-adjacent fit to their targetRoles, location/remote constraints are met, the role is open to a level in seniorityTargets, and there are no disqualifying red flags in the description. This is a job the candidate should apply to today with high confidence.
- **good**: Genuinely competitive with minor gaps. 60-80% skill match, acceptable role fit, no hard-constraint violations. Worth surfacing but not a standout. This is "solid but not perfect" — worth a click, worth reviewing, worth applying if they have time.
- **skip**: Any of the following: skill gap too large (<60% on must-haves), seniority is clearly wrong, location/remote is fundamentally incompatible, posting is too stale, or the role is in a different domain entirely. Not worth a feed slot.

# Role-match strictness
Do NOT accept loose title matches. A candidate searching "AI Engineer" is not well-served by a "Sales Engineer" posting just because the word "Engineer" overlaps. Check the responsibilities in the description. If the day-to-day work does not resemble what the candidate's target role actually does, skip it. Adjacent domains count; unrelated ones do not.

WRONG match: "Prompt Engineer" candidate → "Prompt Coordinator (Marketing Operations)" (different domain).
RIGHT match: "AI Engineer" candidate → "Applied ML Engineer" (adjacent, overlapping skills).
RIGHT match: "Frontend Engineer" candidate → "Full-Stack Engineer (React focus)" (adjacent, core skill matches).
WRONG match: "Data Analyst" candidate → "Data Entry Specialist" (wildly different role, share only the word "Data").

# Location semantics
Accept these as satisfying the candidate's preferredLocations intent:
- Exact city match (Berlin → Berlin)
- Close metro area or suburb (Berlin → Potsdam, München → Garching, NYC → Jersey City)
- Country-wide remote when candidate is open to remote (Germany remote for a user targeting German cities)
- "Remote within EU", "Remote DACH", "Remote EMEA" for a candidate targeting any covered country
- Hybrid from a preferred city ("Hybrid, 2 days in Berlin")

Reject when the job location is clearly in a different country AND the work mode is fully onsite AND the candidate's remote preference does not include flexible/remote.

# Remote semantics
Use the candidate's remotePreferences array to decide:
- If they picked **remote_only**: accept only jobs that are clearly fully remote. Reject onsite-only and strict-hybrid jobs.
- If they picked **remote_first**: prefer remote, and accept hybrid. Do not accept onsite.
- If they picked **hybrid**: accept hybrid or remote. Do not accept onsite.
- If they picked **onsite**: accept onsite or hybrid. Accept a fully-remote posting only if the candidate also picked remote_first, remote_only, hybrid or flexible.
- If they picked **flexible**: accept anything.
- If they picked multiple preferences, the job matches if it satisfies ANY of them.

An onsite role is acceptable only when the candidate picked onsite or flexible, wherever the role is. These are the candidate's own settings: the server removes every job whose workMode you report outside them, so a wrong workMode either hides a good job or shows an excluded one. Read it carefully.

When the posting's work mode is ambiguous (the description mentions office presence sometimes, remote other times, or just doesn't say), report workMode "unknown" and LEAN IN the candidate's favor: treat it as compatible and let the candidate ask during the interview. Do not skip for ambiguity alone.

# Non-English postings
Job descriptions often arrive in German, French, Spanish, Italian, Dutch, Portuguese, or other languages, especially when the candidate targets DACH or EU markets. Rank these on content, not language. Never downgrade a posting just because it is non-English if the candidate's languages list includes English or the posting's language. Mentally translate and evaluate on the content.

Common equivalents to internalize:
- Titles: "Software-Entwickler" = Software Engineer; "Ingénieur Logiciel" = Software Engineer; "Ingeniero de Software" = Software Engineer; "Entwickler" = Developer; "Ingénieur IA" / "KI-Ingenieur" = AI Engineer; "Datenanalyst" = Data Analyst; "Produktmanager" / "Chef de Produit" = Product Manager.
- Seniority: "Senior" / "Leitender" / "Principal" / "Lead" = senior / lead; "Junior" / "Einsteiger" / "Débutant" = junior; "Praktikant" / "Stagiaire" = intern; "Werkstudent" = working student / part-time; "Geschäftsführer" = Managing Director / CEO.
- Work mode: "vor Ort" / "au bureau" / "presencial" / "in sede" / "op kantoor" = onsite; "Homeoffice" / "télétravail" / "remoto" / "lavoro da remoto" / "thuiswerk" = remote; "Hybrid" / "hybride" / "híbrido" / "ibrido" = hybrid.
- Contract: "befristet" / "contrat déterminé" / "fijo-discontinuo" = temporary/fixed-term; "unbefristet" / "CDI" / "contrato indefinido" = permanent/full-time.

# Deduplication
The same job is sometimes posted across multiple boards and arrives in the candidate list more than once with slightly different titles, company normalization, or apply URLs. When you detect duplicates (same company + substantively same title + similar location), surface ONLY ONE of them. Pick the version with the freshest posting date, then the longest description, then the direct apply_url over the aggregator URL. Mark the others as skip with reason "duplicate of a higher-ranked listing". Do NOT surface two rows that a user would clearly perceive as the same job.

# How to use the deterministic score
Each candidate includes a deterministic score and score breakdown computed upstream. Use these as a prior signal: they encode role/token match, freshness, salary alignment, remote alignment, preferred-location match, apply-URL availability, and heuristic skill overlap. However: YOU are reading the full description and they are not. Upgrade when the description reveals a fit the heuristic missed (non-English title matching via translation, seniority phrased unusually, responsibilities matching despite a mismatched title). Downgrade when the description reveals a mismatch the heuristic missed (wrong stack, mandatory unavailable skill, explicit country restriction, posting actually about a totally different role).

# Negative signals (downweight)
The candidate profile may include a userProfile.negativeTerms array: title or keyword fragments that are a poor fit for this specific candidate (derived from their career history). When a candidate job's title or core focus matches one of these terms, treat it as a strong downweight: default to skip unless the description clearly shows a genuine fit the term was wrong about. These are signals, not hard constraints, so read the description before discarding a job that is otherwise an excellent match.

# User exclusions (honor strongly)
The profile may also include userProfile.excludedTerms: titles, companies, or keywords the user has EXPLICITLY said they never want to see. Treat these as near-hard constraints. When a candidate job's title, company, or core focus matches an excluded term, skip it. The only exception is an obviously incidental string match where the job is clearly not what the user meant to exclude (e.g. the user excluded "Lead" meaning team-lead roles, and the term appears only inside an unrelated phrase like "lead generation tooling we use"). When in doubt, honor the user's exclusion and skip.

# Quality over quantity — hard rule
The candidate can run the feed once a day and is waiting on this one. Fewer excellent matches beats more mediocre ones. If only 2 of 30 candidates are truly strong fits, return 2 strongs and skip the rest. Do not pad the feed to hit a number. Do not upgrade a "good" to a "strong" to fill a cap. The user will notice and trust the feed less.

# Self-verification before returning
Before you emit the JSON, silently check:
1. Every candidate jobId from the input is present in your items, exactly once. items.length == candidates.length.
2. No two strong/good items have the same rank integer.
3. No two strong/good items represent the same underlying job (deduplication applied).
4. No item violates a hard user constraint (employment type, stated below-minimum salary, sponsorship when candidate needs sponsorship, a work mode outside remotePreferences, a level outside seniorityTargets).
5. Your reason strings, if present, do not use em-dashes (—), en-dashes (–), or horizontal bars (―, ‒). Use commas, colons, semicolons, periods, or parentheses instead.
6. Your reason strings do not use AI-tell phrases: "leverage", "pivotal", "robust", "spearheaded", "orchestrated", "revolutionized", "delve", "it is important to note", "in today's fast-paced world", "navigate the landscape", "tapestry".

If any check fails, fix it before returning.

# Forbidden
- Do not invent facts. If the description does not state a skill, salary, or requirement, do not assume it.
- Do not rank based on company prestige alone. A FAANG job with poor fit is still a skip.
- Do not surface jobs that violate hard user constraints.
- Do not return markdown, code fences, explanations, apologies, or any text outside the JSON object.
- Do not pad the feed. Fewer strong matches beats a padded list.
- Do not emit duplicates.

# Response format
Return ONLY a valid JSON object. No markdown fences. No prose. Start with { and end with }. The object has one field, "items", which is an array. Each array element has exactly:
- "jobId": string. Must exactly match one of the provided candidate jobIds.
- "decision": "strong" | "good" | "skip".
- "rank": positive integer when decision is "strong" or "good", with no two items sharing a rank. Null when decision is "skip".
- "reason": optional short sentence (<=160 characters) explaining the match or mismatch. Plain professional English. No em-dashes. May be null.
- "companyDisplay": optional. If the description clearly names a different employer than the source "company" field (aggregator listings often do), set this to that employer. Otherwise null.
- "workMode": "remote" | "hybrid" | "onsite" | "unknown", as the ad itself states it, for every item including skips. "remote": fully remote. "hybrid": some office days and some remote days, including "up to 2 days mobile work a week", "Homeoffice-Anteil", "flexible Arbeit im Mobile Office". "onsite": the ad says the work is in the office or on site with no remote days. "unknown": the ad does not say. A city in the location field alone is "unknown", not "onsite". The candidate's workMode field is a guess from the job board, not a fact; trust the description over it.
- "seniorityLevels": every level the role is open to, from "intern", "junior", "mid", "senior", "lead", "staff", "manager", read from the title and the stated requirements, for every item including skips. "2-4 Jahre Berufserfahrung" is ["junior", "mid"]; "Senior AI Engineer, 6+ years" is ["senior"]; "Werkstudent" is ["intern"]. An empty array when the ad does not say.

Every candidate jobId must appear exactly once in the items array. The candidate count and your items count must match.`;


export function buildUserProfileMessage(
  settings: JobFeedSettings,
  yearsExperience: number | null = null,
  careerProfile: CareerProfile | null = null,
  negativeTerms: string[] = [],
  excludedTerms: string[] = [],
): string {
  const declaredSkills = settings.user_skills ?? [];
  // Authoritative skill set for the 40%-weighted skill match. When a
  // CareerProfile exists, prefer the synthesized, evidence-weighted clusters +
  // tools over the flat raw CV skill list (which is noisy and proficiency-
  // stripped). Fall back to the declared list when no profile, or when the
  // profile somehow yields nothing.
  const profileSkills = careerProfile
    ? dedupeSkills([
        ...careerProfile.primarySkillClusters.flatMap((cluster) => cluster.skills),
        ...careerProfile.toolsEnvironment,
      ])
    : [];
  const userSkills = profileSkills.length > 0 ? profileSkills : declaredSkills;

  return JSON.stringify({
    section: 'candidate_profile',
    profile: {
      targetRoles: settings.target_roles,
      userSkills,
      negativeTerms,
      excludedTerms,
      // Years of professional experience inferred from CV start/end dates.
      // Used by the ranker to catch jobs that require much more experience
      // than the candidate has (e.g. job asks 8-10 yrs, candidate has 2).
      yearsExperience: typeof yearsExperience === 'number' ? yearsExperience : null,
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
    },
    inferredProfile: careerProfile
      ? {
          function: careerProfile.function,
          inferredTitles: careerProfile.inferredTitles,
          seniority: careerProfile.seniority,
          targetDirection: careerProfile.targetDirection,
          yearsTotal: careerProfile.yearsTotal,
          yearsInFunction: careerProfile.yearsInFunction,
          primarySkillClusters: careerProfile.primarySkillClusters,
          secondarySkillClusters: careerProfile.secondarySkillClusters,
          industryDomains: careerProfile.industryDomains,
          toolsEnvironment: careerProfile.toolsEnvironment,
          workingLanguages: careerProfile.workingLanguages,
          narrative: careerProfile.narrative,
          negativeSignals: careerProfile.negativeSignals,
        }
      : null,
  }, null, 2);
}

// Per-run dynamic content: the actual candidate jobs and the visibleCap.
// This is the only message that changes every run and therefore the only
// block we pay full input-token price on.
//
// RANKING_EXCERPT_CHARS is 3500 because requirements (must-have skills, years)
// usually sit in the back half of a JD and skill match is 40% of the score, so
// the ranker must see them. fitCandidatesToBudget shrinks it (floor 1500) only
// when the exact input count would pass the 90k budget.
export function buildCandidatesMessage(
  candidates: JobFeedRankingCandidate[],
  visibleCap: number,
  excerptChars: number = RANKING_EXCERPT_CHARS,
): string {
  return JSON.stringify({
    section: 'rank_now',
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
      descriptionExcerpt: truncateText(candidate.description, excerptChars),
    })),
  }, null, 2);
}

// ---------------------------------------------------------------------------
// Input budget (every request stays under the 100k price tier; we stop at 90k)
// ---------------------------------------------------------------------------

export const RANKING_EXCERPT_CHARS = 3500;
export const RANKING_EXCERPT_FLOOR_CHARS = 1500;
export const RANKING_INPUT_BUDGET_TOKENS = 90_000;
// Worst measured ratio (German ads and CVs, P0 probe). Only used to split the
// total into a fixed part and an excerpt part when shrinking.
const RANKING_CHARS_PER_TOKEN = 1.8;

export interface RankingBudgetFit {
  excerptChars: number;
  /** Input token count of the request that will be sent (exact when over the count threshold). */
  tokens: number;
  fits: boolean;
  shrunk: boolean;
}

/**
 * Pick the excerpt length for this run. Counts the request at the full excerpt
 * length. When the count is over the budget, shrinks descriptionExcerpt
 * proportionally to the part of the prompt the excerpts account for (floor
 * 1,500 chars) and recounts once. The caller throws when it still doesn't fit.
 */
export async function fitCandidatesToBudget(params: {
  candidates: JobFeedRankingCandidate[];
  /** Input token count for a request built with this excerpt length. */
  countTokens: (excerptChars: number) => Promise<number>;
  budgetTokens?: number;
}): Promise<RankingBudgetFit> {
  const { candidates, countTokens, budgetTokens = RANKING_INPUT_BUDGET_TOKENS } = params;
  const fullTokens = await countTokens(RANKING_EXCERPT_CHARS);
  if (fullTokens <= budgetTokens) {
    return { excerptChars: RANKING_EXCERPT_CHARS, tokens: fullTokens, fits: true, shrunk: false };
  }

  const excerptCharsTotal = candidates.reduce(
    (sum, c) => sum + (truncateText(c.description, RANKING_EXCERPT_CHARS)?.length ?? 0),
    0,
  );
  const excerptTokens = Math.min(fullTokens, excerptCharsTotal / RANKING_CHARS_PER_TOKEN);
  const fixedTokens = fullTokens - excerptTokens;
  // Aim 3% under the budget: the 1.8 split is conservative for English, so a
  // plain proportional cut can land just over the line and waste the one recount.
  const room = budgetTokens * 0.97 - fixedTokens;
  const scaled = excerptTokens > 0
    ? Math.floor(RANKING_EXCERPT_CHARS * (room / excerptTokens))
    : RANKING_EXCERPT_FLOOR_CHARS;
  const excerptChars = Math.min(
    RANKING_EXCERPT_CHARS,
    Math.max(RANKING_EXCERPT_FLOOR_CHARS, scaled),
  );
  const tokens = await countTokens(excerptChars);
  return { excerptChars, tokens, fits: tokens <= budgetTokens, shrunk: true };
}

// Structured output (output_config.format). Keeps the model to the exact item
// shape; validateModelRankingResponse still enforces coverage and rank rules.
export const RANKING_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
          decision: { type: 'string', enum: ['strong', 'good', 'skip'] },
          rank: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
          reason: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          companyDisplay: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          workMode: { type: 'string', enum: ['remote', 'hybrid', 'onsite', 'unknown'] },
          seniorityLevels: { type: 'array', items: { type: 'string', enum: [...SENIORITY_LEVELS] } },
        },
        required: ['jobId', 'decision', 'rank', 'reason', 'companyDisplay', 'workMode', 'seniorityLevels'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

export function buildDeterministicRankedItems(candidates: JobFeedRankingCandidate[], visibleCap: number = JOB_FEED_VISIBLE_MAX_COUNT): JobFeedRankedItemRecord[] {
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

export function validateModelRankingResponse(
  payload: JobFeedRankingModelResponse,
  candidates: JobFeedRankingCandidate[],
  visibleCap: number = JOB_FEED_VISIBLE_MAX_COUNT,
  /**
   * When given, a job the model surfaced whose work mode or level it read outside these settings is
   * dropped before the cap, so the next qualifying job takes its slot. `excluded` counts them.
   */
  enforce?: {
    settings: JobFeedSettings;
    excluded: { workMode: number; seniority: number };
    /** The work mode read in every ad the model answered for, skips and removed jobs included. */
    workModes: Map<string, ReadWorkMode>;
  },
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
    companyDisplay: string | null;
    workMode: ReadWorkMode;
    seniorityLevels: SeniorityLevel[];
  }> = [];

  // One malformed item must not discard the whole ranking. A bad entry is
  // dropped and the rest of the model's judgement is kept, because the
  // alternative is falling back to the deterministic keyword list for every
  // candidate — a much worse feed than one missing role.
  for (const item of payload.items) {
    if (!item || typeof item !== 'object') continue;

    const jobId = typeof item.jobId === 'string' ? item.jobId.trim() : '';
    const decision = item.decision;
    if (!jobId || !candidateById.has(jobId) || seenJobIds.has(jobId)) continue;
    if (decision !== 'strong' && decision !== 'good' && decision !== 'skip') continue;
    enforce?.workModes.set(jobId, asReadWorkMode(item.workMode));

    // A skip is a real decision, so it counts toward coverage.
    if (decision === 'skip') {
      seenJobIds.add(jobId);
      continue;
    }

    const rank = typeof item.rank === 'number' && Number.isInteger(item.rank) && item.rank > 0
      ? item.rank : null;
    // An unusable rank must not count. Counting it lets a model that returns
    // every candidate with a bad rank score full coverage and hand back an
    // empty ranking, which then reads as a successful run with no roles
    // instead of falling through to the deterministic list.
    if (rank === null) continue;

    seenJobIds.add(jobId);

    const workMode = asReadWorkMode(item.workMode);
    const seniorityLevels = asSeniorityLevels(item.seniorityLevels);
    if (enforce && !workModeAllowed(workMode, enforce.settings)) {
      enforce.excluded.workMode += 1;
      continue;
    }
    if (enforce && !seniorityAllowed(seniorityLevels, enforce.settings)) {
      enforce.excluded.seniority += 1;
      continue;
    }

    const companyDisplayRaw = typeof item.companyDisplay === 'string'
      ? item.companyDisplay.replace(/[\u0000-\u001f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim()
      : '';
    surfacedItems.push({
      candidate: candidateById.get(jobId)!,
      fitLabel: decision,
      rank,
      reason: normalizeReason(item.reason),
      companyDisplay: companyDisplayRaw.length > 0 ? companyDisplayRaw.slice(0, 120) : null,
      workMode,
      seniorityLevels,
    });
  }

  // A candidate the model never mentioned is an implicit skip. Only bail out
  // when coverage is low enough that the response was truncated rather than
  // merely imperfect; below that line the deterministic fallback is honest.
  const coverageFloor = Math.ceil(candidates.length * 0.6);
  if (seenJobIds.size < coverageFloor) return null;

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
      companyDisplay: item.companyDisplay,
      workMode: item.workMode,
      seniorityLevels: item.seniorityLevels,
    }));
}

// Case-insensitive dedupe that preserves the first-seen casing. Used to merge
// skill-cluster skills with toolsEnvironment without emitting "React"/"react"
// twice or losing the candidate's preferred casing.
function dedupeSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const skill of skills) {
    const trimmed = skill.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/**
 * The model's reason, whole. The prompt asks for 160 characters or fewer, but the model often writes a little
 * more, and a reason cut mid-word ("a gap given the candidate's TypeScript backgroun") reads as broken. The
 * response's max_tokens bounds it.
 */
function normalizeReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function truncateText(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  // The cut can split a surrogate pair, which the model API refuses.
  return `${normalized.slice(0, maxLength - 3).toWellFormed()}...`;
}
