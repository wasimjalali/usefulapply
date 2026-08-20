import { getCloudflareContext } from '@opennextjs/cloudflare';
import { JOB_FEED_VISIBLE_MAX_COUNT } from '@/lib/job-feed/constants';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
import type {
  JobFeedRankingCandidate,
  JobFeedRankingExecutionResult,
  JobFeedRankedItemRecord,
} from '@/lib/job-feed/types';
import type { JobFeedSettings } from '@/lib/supabase/types';
import {
  completeLlmGeneration,
  failLlmGeneration,
  startLlmGeneration,
  type LlmGenerationContext,
} from '@/db/repos/adminMetrics';
import type { Json } from '@/db/schema';

// Ranking runs on Workers AI (Cloudflare-hosted, billed to the Cloudflare
// account). JOB_FEED_RANKING_MODEL / JOB_FEED_RANKING_FALLBACK_MODEL in
// wrangler.jsonc vars pick the models. A/B candidates: @cf/openai/gpt-oss-120b,
// @cf/deepseek-ai/deepseek-v4-flash-0731, @cf/meta/llama-4-scout-17b-16e-instruct.
type WorkersAiBinding = {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
};

// Workers AI text models answer in the OpenAI chat.completion shape
// (choices[0].message.content); some also mirror the text in `response`.
type WorkersAiTextResponse = {
  id?: string;
  request_id?: string;
  response?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    neurons?: number;
    total_tokens?: number;
  };
};

function exactUsageNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function workersUsageJson(usage: WorkersAiTextResponse['usage']): Json | null {
  return usage ? JSON.parse(JSON.stringify(usage)) as Json : null;
}

function workersAiText(raw: WorkersAiTextResponse): string {
  const fromChoices = raw.choices?.[0]?.message?.content;
  if (typeof fromChoices === 'string' && fromChoices.length > 0) return fromChoices;
  return raw.response ?? '';
}

/**
 * Reasoning models sometimes wrap the JSON in fences or prose, and the prose
 * can contain braces of its own. Return the last balanced top-level object.
 */
function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  let best = '';
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; continue; }
    if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) best = trimmed.slice(start, i + 1);
    }
  }
  return best || trimmed;
}

type JobFeedRankingDecision = 'strong' | 'good' | 'skip';

interface JobFeedRankingModelResponse {
  items: Array<{
    jobId: string;
    decision: JobFeedRankingDecision;
    rank?: number | null;
    reason?: string | null;
    companyDisplay?: string | null;
  }>;
}

// Static system prompt, identical across every ranking request, every user,
// every run. Models that cache prompt prefixes (DeepSeek V4 on Workers AI does)
// get a hit on this block, so keep it long and stable. visibleCap deliberately
// lives in the per-run user message (not here) so the prefix stays identical
// across tiers too.
const SYSTEM_PROMPT = `# Role
You are the ranking engine for Useful Apply's job feed. The candidate starts the run themselves and waits while it happens, so you are reading job postings fetched for that candidate seconds ago and deciding which ones are worth putting in front of them now. Nothing here is a nightly batch. You are the final quality gate. Deterministic prefilters upstream only enforce hard user-stated constraints (explicit employment type mismatch, posting that explicitly states a salary below the candidate's declared minimum, explicit no-sponsorship language when the candidate needs sponsorship). Everything else is your responsibility: role fit, seniority fit, location fit, remote preference fit, skill fit, freshness, and deduplication.

# Task
For each candidate job in the payload, return exactly one decision: "strong", "good", or "skip". Also assign a rank (1 = best) across all non-skipped jobs. The user only sees jobs you rank as strong or good.

# Evaluation framework (industry-standard weighting)
Apply these weights when forming your decision. The weights reflect what actually predicts interview success for real hiring teams.

1. SKILL MATCH (40%). Does the job description require skills the candidate actually has, per the userProfile.userSkills list? These are the candidate's evidenced skills (derived from their CV's skill clusters and tools when a profile exists, otherwise their declared list). A candidate meeting 80%+ of must-have skills beats a perfect title match with meaningful skill gaps. Read the description carefully. Do not infer skills from title alone. Skill match is the single most important signal.
2. ROLE ALIGNMENT (25%). Does the title and the day-to-day responsibilities match what the candidate is looking for (userProfile.targetRoles)? Exact-title matches rank highest. Clearly adjacent roles ("Applied AI Engineer" for a candidate searching "AI Engineer", "Full-Stack Engineer" for "Backend Engineer" with JS skills) count as aligned. Wildly different domains do not ("Account Executive" for an "AI Engineer" search is a skip even if both need communication). Also weigh inferredProfile.targetDirection when present: a role matching where the candidate is HEADING (their aspirationalTitles or the "to" side of a pivot) counts as aligned even if it doesn't match a past title, as long as the description's requirements are a realistic reach for their current skills.
3. LOCATION & REMOTE FIT (15%). See rules below under LOCATION SEMANTICS and REMOTE SEMANTICS.
4. SENIORITY & EXPERIENCE FIT (10%). Combine TWO signals to decide if the candidate is at the right level:
   a. SeniorityTarget match: within ±1 level of any seniorityTarget is acceptable. A junior candidate seeing a staff/principal role is a skip. A senior candidate seeing an intern role is a skip. Title alone is unreliable in non-English postings; read seniority signals in the description. PRECEDENCE: when inferredProfile.seniority is present with confidence "high", prefer it over seniorityTargets for level fit (it is derived from the CV, not a self-reported setting). Fall back to seniorityTargets when the inferred confidence is medium or low, or when no inferredProfile is present.
   b. YEARS OF EXPERIENCE match: when the posting explicitly states a required experience range (e.g. "5-8 years", "mindestens 7 Jahre", "minimum 10 years of experience") AND the candidate's userProfile.yearsExperience is provided, apply this rule:
      - If the candidate has at least HALF of the stated minimum (candidate_years >= required_min / 2), treat as a soft match. Acceptable to surface as "good" if other signals are strong, especially when the description uses soft language like "experience is less important for the right candidate", "exceptional juniors welcome", or "ideally but not required".
      - If the candidate has less than HALF of the stated minimum (candidate_years < required_min / 2), SKIP. This is the most common "wrong level" rejection and should not be ambiguous. Do not surface a role requiring 8-10 years to a candidate with 2 years unless the posting explicitly says experience is negotiable.
      - If yearsExperience is null OR the posting does not state a clear required-years range, fall back to (a) alone.
      Examples: Candidate has 2 yrs, job asks 5+ yrs → 2 < 2.5 (half of 5) → skip by default; upgrade to good ONLY if posting explicitly says "strong juniors considered" / "experience is less important" / "ideally but not required". Candidate has 2 yrs, job asks 10+ yrs → 2 < 5 (half of 10) → clear skip regardless of soft language (gap is too wide). Candidate has 4 yrs, job asks 5+ yrs → 4 >= 2.5 → soft match, good.
5. FRESHNESS (5%). Prefer jobs with freshnessDays <= 14. A job 30+ days old is stale unless everything else is outstanding.
6. SALARY (5%). Only relevant when the job explicitly states a number AND it is below the candidate's declared minimum. If salary is absent, do not penalize. The candidate can negotiate.

# Decision calibration (industry-aligned, not "vibes-based")
Anchor your decisions to this scale. Be fair and realistic, neither overly generous nor artificially harsh.

- **strong**: Highly competitive match. The candidate meets ~80%+ of required skills, the role is a direct or clearly-adjacent fit to their targetRoles, location/remote constraints are met, seniority is within ±1 of target, and there are no disqualifying red flags in the description. This is a job the candidate should apply to today with high confidence.
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
- If they picked **remote_first**: prefer remote, but accept hybrid and accept onsite IF the location matches a preferredLocation.
- If they picked **hybrid**: accept hybrid or remote. Accept onsite only when the location matches a preferredLocation.
- If they picked **onsite**: accept onsite or hybrid. Accept a fully-remote posting only if the candidate also picked remote_first or flexible.
- If they picked **flexible**: accept anything.
- If they picked multiple preferences, the job matches if it satisfies ANY of them.

When the posting's work mode is ambiguous (the description mentions office presence sometimes, remote other times, or just doesn't say), LEAN IN the candidate's favor — treat it as compatible and let the candidate ask during the interview. Do not skip for ambiguity alone.

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
4. No item violates a hard user constraint (employment type, stated below-minimum salary, sponsorship when candidate needs sponsorship).
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

Every candidate jobId must appear exactly once in the items array. The candidate count and your items count must match.`;

const DEFAULT_RANKING_MODEL = '@cf/openai/gpt-oss-120b';
const DEFAULT_FALLBACK_RANKING_MODEL = '@cf/deepseek-ai/deepseek-v4-flash-0731';

async function getWorkersAiRanking(): Promise<{ ai: WorkersAiBinding; model: string; fallbackModel: string | null } | null> {
  let env: { AI?: WorkersAiBinding; JOB_FEED_RANKING_MODEL?: string; JOB_FEED_RANKING_FALLBACK_MODEL?: string } = {};
  try {
    ({ env } = await getCloudflareContext({ async: true }) as { env: typeof env });
  } catch {
    // Outside the Worker (unit scripts, plain next dev) there is no binding.
    return null;
  }
  if (!env.AI) return null;
  // wrangler vars live on the Workers env only (OpenNext does not copy them to process.env).
  const model = env.JOB_FEED_RANKING_MODEL ?? DEFAULT_RANKING_MODEL;
  const fallbackRaw = env.JOB_FEED_RANKING_FALLBACK_MODEL ?? DEFAULT_FALLBACK_RANKING_MODEL;
  const fallbackModel = fallbackRaw && fallbackRaw !== model ? fallbackRaw : null;
  return { ai: env.AI, model, fallbackModel };
}

async function runWorkersAiRanking(params: {
  ai: WorkersAiBinding;
  model: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  candidates: JobFeedRankingCandidate[];
  visibleCap: number;
  generationContext: LlmGenerationContext;
}): Promise<{
  items: JobFeedRankedItemRecord[] | null;
  model: JobFeedRankingExecutionResult['model'];
  error: string | null;
  generationId: string;
}> {
  const { ai, model, messages, candidates, visibleCap, generationContext } = params;
  const startTime = Date.now();
  const ledger = await startLlmGeneration({
    context: generationContext,
    provider: 'workers-ai',
    model,
  });
  let raw: WorkersAiTextResponse;

  try {
    raw = (await ai.run(model, {
      messages,
      temperature: 0.2,
      // Reasoning models spend part of this budget thinking before the JSON.
      max_tokens: 12000,
      response_format: { type: 'json_object' },
    })) as WorkersAiTextResponse;
  } catch (error) {
    try {
      await failLlmGeneration({
        id: ledger.id,
        latencyMs: Date.now() - startTime,
        errorKind: 'workers_ai_provider_error',
      });
    } catch (ledgerError) {
      console.error('[llm-ledger] Workers AI failure write failed', ledger.id, ledgerError);
    }
    console.error(`[JobFeedRanking] ${model} failed after ${Date.now() - startTime}ms`, error);
    return {
      items: null,
      model: null,
      error: error instanceof Error ? error.message : 'Unknown Workers AI ranking failure',
      generationId: ledger.id,
    };
  }

  const latencyMs = Date.now() - startTime;
  const exactInputTokens = exactUsageNumber(raw.usage?.prompt_tokens);
  const exactOutputTokens = exactUsageNumber(raw.usage?.completion_tokens);
  const exactCachedTokens = exactUsageNumber(raw.usage?.prompt_tokens_details?.cached_tokens);
  const exactTotalTokens = exactUsageNumber(raw.usage?.total_tokens);
  try {
    await completeLlmGeneration({
      id: ledger.id,
      latencyMs,
      providerRequestId: raw.request_id ?? raw.id ?? null,
      usageReported: exactTotalTokens !== null || (exactInputTokens !== null && exactOutputTokens !== null),
      inputTokens: exactInputTokens,
      outputTokens: exactOutputTokens,
      cacheReadInputTokens: exactCachedTokens,
      providerTotalTokens: exactTotalTokens,
      providerUsage: workersUsageJson(raw.usage),
    });
  } catch (ledgerError) {
    console.error('[llm-ledger] Workers AI completion write failed', ledger.id, ledgerError);
  }

  const inputTokens = exactInputTokens ?? 0;
  const outputTokens = exactOutputTokens ?? 0;
  const cachedTokens = exactCachedTokens ?? 0;
  const neurons = raw.usage?.neurons ?? null;
  try {
    console.log(
      `[JobFeedRanking] ${model} | ${inputTokens}in (${cachedTokens} cached) / ${outputTokens}out | ${latencyMs}ms | neurons=${neurons ?? 'n/a'} | candidates=${candidates.length}`
    );
    const modelInfo = { provider: 'workers-ai', name: model, inputTokens, outputTokens, latencyMs };
    const parsed = JSON.parse(extractJsonObject(workersAiText(raw))) as JobFeedRankingModelResponse;
    const items = validateModelRankingResponse(parsed, candidates, visibleCap);
    return {
      items,
      model: modelInfo,
      error: items ? null : 'The ranking model response was incomplete or invalid.',
      generationId: ledger.id,
    };
  } catch (error) {
    console.error(`[JobFeedRanking] ${model} returned an invalid response`, error);
    return {
      items: null,
      model: { provider: 'workers-ai', name: model, inputTokens, outputTokens, latencyMs },
      error: error instanceof Error ? error.message : 'Invalid Workers AI ranking response',
      generationId: ledger.id,
    };
  }
}

export async function rankWithWorkersAi(params: {
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

  const workersAi = await getWorkersAiRanking();
  if (!workersAi) {
    // No binding outside the Worker (plain next dev, scripts): expected, not a failure.
    return { status: 'completed_deterministic', items: deterministicItems, errorMessage: null, model: null };
  }

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: buildUserProfileMessage(settings, yearsExperience, careerProfile, negativeTerms, excludedTerms) },
    { role: 'user' as const, content: buildCandidatesMessage(candidates, visibleCap) },
  ];

  const rankingGenerationContext = generationContext ?? {
    requestExecutionId: crypto.randomUUID(),
    route: 'job-feed/ranking',
    feature: 'job_feed',
    operation: 'job_feed_ranking',
  };

  const primary = await runWorkersAiRanking({
    ai: workersAi.ai,
    model: workersAi.model,
    messages,
    candidates,
    visibleCap,
    generationContext: rankingGenerationContext,
  });
  if (primary.items) {
    return { status: 'completed_llm', items: primary.items, errorMessage: null, model: primary.model };
  }

  if (workersAi.fallbackModel) {
    console.warn(`[JobFeedRanking] ${workersAi.model} failed (${primary.error}), retrying on ${workersAi.fallbackModel}`);
    const fallback = await runWorkersAiRanking({
      ai: workersAi.ai,
      model: workersAi.fallbackModel,
      messages,
      candidates,
      visibleCap,
      generationContext: {
        ...rankingGenerationContext,
        parentGenerationId: primary.generationId,
      },
    });
    if (fallback.items) {
      return { status: 'completed_llm', items: fallback.items, errorMessage: null, model: fallback.model };
    }
    return {
      status: 'llm_failed_fallback',
      items: deterministicItems,
      errorMessage: `${primary.error ?? 'primary failed'}; fallback ${workersAi.fallbackModel}: ${fallback.error ?? 'failed'}`,
      model: fallback.model,
    };
  }

  return { status: 'llm_failed_fallback', items: deterministicItems, errorMessage: primary.error, model: primary.model };
}

function buildUserProfileMessage(
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
function buildCandidatesMessage(candidates: JobFeedRankingCandidate[], visibleCap: number): string {
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
      // 3500 chars (was 1400): requirements (must-have skills, years) usually
      // sit in the back half of a JD, and skill match is 40% of the score, so
      // the ranker must see them. Only this uncached candidates message grows;
      // system + profile caching is unaffected.
      descriptionExcerpt: truncateText(candidate.description, 3500),
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
    companyDisplay: string | null;
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

    const companyDisplayRaw = typeof item.companyDisplay === 'string'
      ? item.companyDisplay.replace(/[\u0000-\u001f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim()
      : '';
    surfacedItems.push({
      candidate: candidateById.get(jobId)!,
      fitLabel: decision,
      rank,
      reason: normalizeReason(item.reason),
      companyDisplay: companyDisplayRaw.length > 0 ? companyDisplayRaw.slice(0, 120) : null,
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
