/**
 * Search strategy — AI-generated SerpAPI query plan.
 *
 * Reads a `CareerProfile` plus the user's current `JobFeedSettings` and emits
 * a structured plan of queries (short-tail recall, long-tail precision,
 * localized variants per target country). Each query carries a `fallbackTo`
 * pointer so a zero-result long-tail can be retried against its short-tail
 * counterpart in the same run.
 *
 * SCOPE: read by the job-feed pipeline only. Same boundary as `CareerProfile`:
 * NEVER imported from `src/lib/agents/**`.
 */

import { createHash } from 'node:crypto';
import { callHaiku } from '@/lib/models/haiku';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
import type { JobFeedSettings } from '@/db/types';

import { SEARCH_STRATEGY_SCHEMA_VERSION } from '@/lib/job-feed/search-strategy-types';
import type {
  SearchExpectedRecall,
  SearchQueryType,
  SearchStrategy,
  SearchStrategyQuery,
} from '@/lib/job-feed/search-strategy-types';

// The constant and types live in a server-free module so client code (search-plan via feed-actions)
// can import them without pulling the model layer into the browser bundle.
export { SEARCH_STRATEGY_SCHEMA_VERSION } from '@/lib/job-feed/search-strategy-types';
export type {
  SearchExpectedRecall,
  SearchQueryType,
  SearchStrategy,
  SearchStrategyQuery,
} from '@/lib/job-feed/search-strategy-types';

// Thinking counts toward max_tokens; the JSON itself is ~1.5k tokens.
const STRATEGY_MAX_TOKENS = 8000;

// Structured output (output_config.format). parseSearchStrategyResponse still
// enforces the allowed countries, one short_tail per country and fallbackTo ranges.
export const SEARCH_STRATEGY_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    version: { type: 'integer' },
    generatedAt: { type: 'string' },
    sourceProfileGeneratedAt: { type: 'string' },
    queries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['short_tail', 'long_tail', 'localized'] },
          query: { type: 'string' },
          targetCountry: { type: 'string' },
          rationale: { type: 'string' },
          expectedRecall: { type: 'string', enum: ['high', 'medium', 'low'] },
          fallbackTo: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
        },
        required: ['type', 'query', 'targetCountry', 'rationale', 'expectedRecall', 'fallbackTo'],
        additionalProperties: false,
      },
    },
    negativeTerms: { type: 'array', items: { type: 'string' } },
  },
  required: ['version', 'generatedAt', 'sourceProfileGeneratedAt', 'queries', 'negativeTerms'],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// settings_hash — stable hash of the inputs that materially affect search shape.
// Excludes UI prefs (timezone, delivery hour, aggressiveness) and feed gating
// (enabled, consent_accepted_at). Includes anything the strategy must reflect.
// ---------------------------------------------------------------------------
export function computeSettingsHash(settings: JobFeedSettings): string {
  const material = {
    target_countries: [...(settings.target_countries ?? [])].sort(),
    target_cities: [...(settings.target_cities ?? [])].sort(),
    target_roles: [...(settings.target_roles ?? [])].sort(),
    preferred_locations: [...(settings.preferred_locations ?? [])].sort(),
    seniority_targets: [...(settings.seniority_targets ?? [])].sort(),
    seniority_target: settings.seniority_target ?? null,
    employment_types: [...(settings.employment_types ?? [])].sort(),
    languages: [...(settings.languages ?? [])].sort(),
    target_market: settings.target_market ?? null,
    // Work mode reaches the prompt, so "only remote" from the feed
    // conversation has to invalidate the cached plan. Without these the saved
    // preference changes and the run keeps firing the old queries.
    remote_preferences: [...(settings.remote_preferences ?? [])].sort(),
    remote_preference: settings.remote_preference ?? null,
  };
  return createHash('sha256').update(JSON.stringify(material)).digest('hex').slice(0, 16);
}

export const SYSTEM_TEXT = `# Role
You are a SerpAPI query strategist for an AI job-search assistant. You translate a candidate's career profile and current search settings into a structured plan of Google Jobs queries that maximize relevant matches inside a strict daily query budget. Downstream the planner picks queries from your list and runs them in priority order.

# Your inputs
1. inferredProfile — synthesized from the candidate's CV (titles, function, seniority, skill clusters, industries, working languages, narrative, and targetDirection = where they're heading next).
2. settings — explicit user controls (target countries, target cities, seniority targets, employment types, etc.). Authoritative for hard constraints.

# Target direction
When inferredProfile.targetDirection has aspirationalTitles or a pivot (to), add one query per target country aimed at where the candidate is HEADING, not only where they've been, as long as their skill clusters make it a realistic reach. Example: an analyst pivoting to data engineering gets a "Data Engineer" / localized equivalent query alongside their "Data Analyst" queries. Keep these within the queries.length cap; prioritize current-track queries first so a small budget still lands on safe options.

# Your output
A SearchStrategy with a queries[] array. Each entry is one SerpAPI \`q\` value plus metadata. The downstream planner runs these in order until it has used the daily budget (2 calls on Plus, 4 on Max). Order queries from MOST important to LEAST so a smaller budget still produces a quality feed.

# Query mix (target distribution)
- One short-tail query per target country (the canonical title — broad recall).
- One long-tail query per target country when the profile has a strong primary skill cluster (precision via skill blending).
- Localized variants for non-English markets (DE / AT / CH-de / FR / BE-fr / ES / IT / NL / PT / SE / DK / NO / FI / PL).
- Optional one cross-cluster query when the profile shows two distinct primary clusters (e.g. "AI Engineer + Product").

Cap queries.length at 10 entries total. Hardware constraint: each is paid.

# Query construction rules
- Short-tail: a clean canonical job title. NO skills, NO seniority qualifiers unless the candidate is clearly senior+ and the title-without-qualifier would be too broad. Examples: "Frontend Engineer", "Product Manager", "Data Engineer".
- Long-tail: title + 1-2 skills from a primary cluster, no quotes, no boolean operators. SerpAPI / Google Jobs treats the q as a phrase soup. Examples: "Senior Frontend Engineer React TypeScript", "Backend Engineer Go Postgres", "Product Manager B2B SaaS".
- Localized: use the target market's working-language equivalent of the canonical title. NEVER use English titles for non-English markets unless the candidate's working languages include only English AND the target country is one where English-language postings are common (CH, NL, DK, SE, FI, NO, LU, IL, SG).
  - de / at: "Softwareentwickler", "Frontend-Entwickler", "Produktmanager", "Datenanalyst", "KI-Ingenieur"
  - fr / be (fr): "Ingénieur Logiciel", "Développeur Frontend", "Chef de Produit", "Analyste de données", "Ingénieur IA"
  - es: "Ingeniero de Software", "Desarrollador Frontend", "Gerente de Producto", "Analista de Datos"
  - it: "Ingegnere del Software", "Sviluppatore Frontend", "Product Manager", "Analista Dati"
  - nl: "Softwareontwikkelaar", "Frontend Developer", "Product Manager"
  - pt / br: "Engenheiro de Software", "Desenvolvedor Frontend", "Gerente de Produto"
  - pl: "Inżynier Oprogramowania", "Programista Frontend", "Menedżer Produktu"
- Avoid composite titles ("PM | Founder | Growth"). Each query is one role.
- DO NOT include quote marks, boolean operators (AND, OR, NOT), parentheses, or minus signs. Plain text only.
- NEVER put a city in the query string. City is applied later as a SerpAPI location hint. Each query is a role keyword plus a targetCountry field only.
- Keep each query under 70 characters.

# fallbackTo semantics
For every long_tail and localized query, set fallbackTo to the index of a SAFE alternative the planner should retry when the original returns zero results in this run. The safe alternative is normally the short_tail counterpart in the same country, OR a different short_tail in the same country if no exact counterpart exists. fallbackTo can be null only for short_tail queries (they ARE the fallback) and for queries that have no reasonable safer cousin.

# expectedRecall
- high: a clean canonical title in a major market. The query SHOULD return many results.
- medium: title + one common skill, OR a less-common title in any market, OR a localized title in a smaller market.
- low: niche skill blends, multi-skill long-tails, very specific seniority+function combinations. Used to catch ideal-fit listings the broad queries miss.

Ordering rule: place at least one high-recall query per country FIRST so the budget always lands on at least one safe option per market.

# negativeTerms
Title/keyword fragments the ranker should downweight when they appear in candidate jobs (NOT used as SerpAPI minus signs — those break Google Jobs). Derive from inferredProfile.negativeSignals plus obvious-bad-fit titles for this candidate. Cap at 8 entries.

# Style
- No em-dashes anywhere in the output. Use commas, colons, parentheses, periods.
- No AI-tell phrases in rationale strings: "leverage", "robust", "spearheaded", "delve", "navigate".
- Rationale: <= 100 characters per query, plain English, name the country and the angle (e.g. "Berlin canonical title; high recall in DE market").

# Response format
Return ONLY valid JSON matching this shape:

{
  "version": ${SEARCH_STRATEGY_SCHEMA_VERSION},
  "generatedAt": "<ISO 8601 timestamp>",
  "sourceProfileGeneratedAt": "<ISO 8601 timestamp from the input profile>",
  "queries": [
    {
      "type": "short_tail" | "long_tail" | "localized",
      "query": "<plain text, no quotes>",
      "targetCountry": "<lowercase ISO alpha-2>",
      "rationale": "<short string>",
      "expectedRecall": "high" | "medium" | "low",
      "fallbackTo": <integer index into queries[] | null>
    }
  ],
  "negativeTerms": ["<string>"]
}

# Self-check before returning
1. Every targetCountry is one of settings.target_countries (verbatim, lowercase).
2. At least one short_tail query exists per target country.
3. fallbackTo indices are valid (in range, never points to itself, never points to a long_tail / localized fallback).
4. queries.length <= 10.
5. No quotes, no boolean operators, no minus signs in any query string.
6. version equals ${SEARCH_STRATEGY_SCHEMA_VERSION}.
7. No em-dashes anywhere.
8. No city names in any query string.
`;

export interface GenerateSearchStrategyResult {
  strategy: SearchStrategy;
  modelProvider: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export async function generateSearchStrategy(params: {
  profile: CareerProfile;
  settings: JobFeedSettings;
  generationContext?: LlmGenerationContext;
}): Promise<GenerateSearchStrategyResult> {
  const startTime = Date.now();
  const userPrompt = buildStrategyUserPrompt(params.profile, params.settings);

  // SYSTEM_TEXT is the cached prefix (identical for every user); the profile,
  // settings and today's date are in the user turn, after the marker.
  const response = await callHaiku({
    site: 'search_strategy',
    system: { static: SYSTEM_TEXT },
    messages: [{ role: 'user', content: userPrompt }],
    jsonSchema: SEARCH_STRATEGY_JSON_SCHEMA,
    maxTokens: STRATEGY_MAX_TOKENS,
    cacheTtl: '5m',
    generationContext: params.generationContext ?? {
      requestExecutionId: crypto.randomUUID(),
      route: 'job-feed/search-strategy',
      feature: 'job_feed',
      operation: 'search_strategy_generation',
    },
  });

  const latencyMs = Date.now() - startTime;
  const strategy = parseSearchStrategyResponse(response.content, params);

  return {
    strategy,
    modelProvider: response.provider,
    modelName: response.model,
    inputTokens: response.inputTokensTotal,
    outputTokens: response.usage.outputTokens,
    latencyMs,
  };
}

export function buildStrategyUserPrompt(profile: CareerProfile, settings: JobFeedSettings): string {
  const settingsForModel = {
    target_countries: settings.target_countries ?? [],
    target_cities: settings.target_cities ?? [],
    target_roles: settings.target_roles ?? [],
    preferred_locations: settings.preferred_locations ?? [],
    seniority_targets: (settings.seniority_targets && settings.seniority_targets.length > 0)
      ? settings.seniority_targets
      : (settings.seniority_target ? [settings.seniority_target] : []),
    employment_types: settings.employment_types ?? [],
    languages: settings.languages ?? [],
    remote_preferences: (settings.remote_preferences && settings.remote_preferences.length > 0)
      ? settings.remote_preferences
      : [settings.remote_preference],
  };

  return [
    'Generate a SearchStrategy for the candidate below.',
    'Today:',
    new Date().toISOString().slice(0, 10),
    '',
    'inferredProfile:',
    JSON.stringify(profile, null, 2),
    '',
    'settings:',
    JSON.stringify(settingsForModel, null, 2),
  ].join('\n');
}

export class SearchStrategyParseError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message);
    this.name = 'SearchStrategyParseError';
  }
}

export function parseSearchStrategyResponse(
  content: string,
  context: { profile: CareerProfile; settings: JobFeedSettings },
): SearchStrategy {
  const trimmed = content.trim();
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new SearchStrategyParseError('Response did not contain a JSON object.', content);
  }
  const jsonText = trimmed.slice(jsonStart, jsonEnd + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'JSON parse failed.';
    throw new SearchStrategyParseError(`Search strategy JSON parse failed: ${message}`, content);
  }

  return validateSearchStrategyPayload(parsed, context);
}

const VALID_QUERY_TYPES = new Set<SearchQueryType>(['short_tail', 'long_tail', 'localized']);
const VALID_EXPECTED_RECALL = new Set<SearchExpectedRecall>(['high', 'medium', 'low']);

function validateSearchStrategyPayload(
  value: unknown,
  context: { profile: CareerProfile; settings: JobFeedSettings },
): SearchStrategy {
  if (!value || typeof value !== 'object') {
    throw new SearchStrategyParseError('Strategy payload was not an object.', String(value));
  }
  const candidate = value as Record<string, unknown>;

  if (!Array.isArray(candidate.queries) || candidate.queries.length === 0) {
    throw new SearchStrategyParseError('queries[] must contain at least one entry.', '');
  }
  if (candidate.queries.length > 10) {
    throw new SearchStrategyParseError('queries[] must contain at most 10 entries.', '');
  }

  const allowedCountries = new Set(
    (context.settings.target_countries ?? []).map((c) => c.toLowerCase()),
  );

  const rawQueries = candidate.queries as unknown[];
  const queries: SearchStrategyQuery[] = rawQueries.map((entry, idx) => {
    const item = ensureRecord(entry, `queries[${idx}]`);
    const type = item.type;
    if (typeof type !== 'string' || !VALID_QUERY_TYPES.has(type as SearchQueryType)) {
      throw new SearchStrategyParseError(`queries[${idx}].type must be short_tail|long_tail|localized.`, String(type));
    }
    const queryText = ensureNonEmptyString(item.query, `queries[${idx}].query`).slice(0, 120);
    if (/["']/.test(queryText) || /\s(AND|OR|NOT)\s/.test(queryText) || queryText.includes(' -')) {
      throw new SearchStrategyParseError(`queries[${idx}].query contains forbidden operators or quotes.`, queryText);
    }

    const targetCountryRaw = ensureNonEmptyString(item.targetCountry, `queries[${idx}].targetCountry`).toLowerCase();
    if (allowedCountries.size > 0 && !allowedCountries.has(targetCountryRaw)) {
      throw new SearchStrategyParseError(
        `queries[${idx}].targetCountry "${targetCountryRaw}" is not in settings.target_countries.`,
        targetCountryRaw,
      );
    }

    const expectedRecall = item.expectedRecall;
    if (typeof expectedRecall !== 'string' || !VALID_EXPECTED_RECALL.has(expectedRecall as SearchExpectedRecall)) {
      throw new SearchStrategyParseError(`queries[${idx}].expectedRecall must be high|medium|low.`, String(expectedRecall));
    }

    const fallbackToRaw = item.fallbackTo;
    let fallbackTo: number | null;
    if (fallbackToRaw === null || fallbackToRaw === undefined) {
      fallbackTo = null;
    } else if (typeof fallbackToRaw === 'number' && Number.isInteger(fallbackToRaw) && fallbackToRaw >= 0) {
      fallbackTo = fallbackToRaw;
    } else {
      throw new SearchStrategyParseError(`queries[${idx}].fallbackTo must be a non-negative integer or null.`, String(fallbackToRaw));
    }

    return {
      type: type as SearchQueryType,
      query: queryText,
      targetCountry: targetCountryRaw,
      rationale: ensureString(item.rationale, `queries[${idx}].rationale`).slice(0, 240),
      expectedRecall: expectedRecall as SearchExpectedRecall,
      fallbackTo,
    };
  });

  // Second pass: validate fallbackTo indices are in range and never self/circular.
  queries.forEach((q, idx) => {
    if (q.fallbackTo === null) return;
    if (q.fallbackTo === idx) {
      throw new SearchStrategyParseError(`queries[${idx}].fallbackTo cannot point to itself.`, String(idx));
    }
    if (q.fallbackTo >= queries.length) {
      throw new SearchStrategyParseError(`queries[${idx}].fallbackTo is out of range.`, String(q.fallbackTo));
    }
  });

  // Validate that we have at least one short_tail per declared country, when
  // any country is set. (Guards against a model that returns only long_tails.)
  // User-confirmed lists can drop a country on purpose; skip this check.
  const userConfirmed = candidate.userConfirmed === true;
  if (!userConfirmed && allowedCountries.size > 0) {
    const shortTailCountries = new Set(
      queries.filter((q) => q.type === 'short_tail').map((q) => q.targetCountry),
    );
    for (const country of allowedCountries) {
      if (!shortTailCountries.has(country)) {
        throw new SearchStrategyParseError(
          `No short_tail query for target country "${country}".`,
          country,
        );
      }
    }
  }

  const negativeTerms = stringArray(candidate.negativeTerms ?? [], 'negativeTerms').slice(0, 8);

  const sourceProfileGeneratedAt = typeof candidate.sourceProfileGeneratedAt === 'string'
    ? candidate.sourceProfileGeneratedAt
    : context.profile.generatedAt;

  return {
    version: SEARCH_STRATEGY_SCHEMA_VERSION,
    generatedAt: typeof candidate.generatedAt === 'string' ? candidate.generatedAt : new Date().toISOString(),
    sourceProfileGeneratedAt,
    ...(userConfirmed ? { userConfirmed: true } : {}),
    queries,
    negativeTerms,
  };
}

export function isCurrentSearchStrategy(value: unknown): value is SearchStrategy {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SearchStrategy>;
  return candidate.version === SEARCH_STRATEGY_SCHEMA_VERSION
    && Array.isArray(candidate.queries)
    && Array.isArray(candidate.negativeTerms);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ensureRecord(value: unknown, fieldPath: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SearchStrategyParseError(`${fieldPath} must be an object.`, String(value));
  }
  return value as Record<string, unknown>;
}

function ensureString(value: unknown, fieldPath: string): string {
  if (typeof value !== 'string') {
    throw new SearchStrategyParseError(`${fieldPath} must be a string.`, String(value));
  }
  return value;
}

function ensureNonEmptyString(value: unknown, fieldPath: string): string {
  const str = ensureString(value, fieldPath).trim();
  if (str.length === 0) {
    throw new SearchStrategyParseError(`${fieldPath} must be a non-empty string.`, '');
  }
  return str;
}

function stringArray(value: unknown, fieldPath: string): string[] {
  if (!Array.isArray(value)) {
    throw new SearchStrategyParseError(`${fieldPath} must be an array.`, String(value));
  }
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim().length > 0) {
      result.push(entry.trim());
    }
  }
  return result;
}
