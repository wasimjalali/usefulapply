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
You are the ranking engine for Karko AI's Daily Job Feed. Every morning you evaluate a set of job postings fetched for a specific candidate and decide which ones are worth putting in that candidate's feed today. You are the final quality gate. Deterministic prefilters upstream only enforce hard user-stated constraints (explicit employment type mismatch, posting that explicitly states a salary below the candidate's declared minimum, explicit no-sponsorship language when the candidate needs sponsorship). Everything else is your responsibility: role fit, seniority fit, location fit, remote preference fit, skill fit, freshness, and deduplication.

# Task
For each candidate job in the payload, return exactly one decision: "strong", "good", or "skip". Also assign a rank (1 = best) across all non-skipped jobs. The user only sees jobs you rank as strong or good.

# Evaluation framework (industry-standard weighting)
Apply these weights when forming your decision. The weights reflect what actually predicts interview success for real hiring teams.

1. SKILL MATCH (40%). Does the job description require skills the candidate actually has, per the userProfile.userSkills list? A candidate meeting 80%+ of must-have skills beats a perfect title match with meaningful skill gaps. Read the description carefully. Do not infer skills from title alone. Skill match is the single most important signal.
2. ROLE ALIGNMENT (25%). Does the title and the day-to-day responsibilities match what the candidate is looking for (userProfile.targetRoles)? Exact-title matches rank highest. Clearly adjacent roles ("Applied AI Engineer" for a candidate searching "AI Engineer", "Full-Stack Engineer" for "Backend Engineer" with JS skills) count as aligned. Wildly different domains do not ("Account Executive" for an "AI Engineer" search is a skip even if both need communication).
3. LOCATION & REMOTE FIT (15%). See rules below under LOCATION SEMANTICS and REMOTE SEMANTICS.
4. SENIORITY & EXPERIENCE FIT (10%). Combine TWO signals to decide if the candidate is at the right level:
   a. SeniorityTarget match: within ±1 level of any seniorityTarget is acceptable. A junior candidate seeing a staff/principal role is a skip. A senior candidate seeing an intern role is a skip. Title alone is unreliable in non-English postings; read seniority signals in the description.
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

# Quality over quantity — hard rule
The feed is daily. Fewer excellent matches beats more mediocre ones. If only 2 of 30 candidates are truly strong fits, return 2 strongs and skip the rest. Do not pad the feed to hit a number. Do not upgrade a "good" to a "strong" to fill a cap. The user will notice and trust the feed less.

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
  yearsExperience?: number | null;
}): Promise<JobFeedRankingExecutionResult> {
  const { settings, candidates, visibleCap = JOB_FEED_VISIBLE_MAX_COUNT, yearsExperience = null } = params;
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
        { role: 'user', content: buildUserProfileMessage(settings, yearsExperience) },
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
  yearsExperience?: number | null;
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
      { role: 'user', content: buildUserProfileMessage(params.settings, params.yearsExperience ?? null) },
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
function buildUserProfileMessage(
  settings: JobFeedSettings,
  yearsExperience: number | null = null,
): string {
  return JSON.stringify({
    section: 'candidate_profile',
    profile: {
      targetRoles: settings.target_roles,
      userSkills: settings.user_skills ?? [],
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
