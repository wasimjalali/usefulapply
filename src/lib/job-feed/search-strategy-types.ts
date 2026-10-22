/**
 * Search strategy schema version and types. Server-free on purpose: client code (search-plan,
 * feed-actions, FeedEditView, useFeedStore) imports these, and search-strategy.ts itself pulls in
 * the model layer (callHaiku, PostHog server, D1 metrics), which must stay out of the browser bundle.
 */

export const SEARCH_STRATEGY_SCHEMA_VERSION = 1 as const;

export type SearchQueryType = 'short_tail' | 'long_tail' | 'localized';
export type SearchExpectedRecall = 'high' | 'medium' | 'low';

export interface SearchStrategyQuery {
  type: SearchQueryType;
  /** Raw SerpAPI `q` value. Already localized for the target country when applicable. */
  query: string;
  /** ISO 3166-1 alpha-2 country code (lowercase) — must be one of settings.target_countries. */
  targetCountry: string;
  /** Short justification used for run diagnostics + UX preview. */
  rationale: string;
  expectedRecall: SearchExpectedRecall;
  /**
   * 0-based index into queries[] of a fallback to retry when this query
   * returns zero results. Null when no fallback is available (e.g. it is
   * itself the short-tail / safe option).
   */
  fallbackTo: number | null;
}

export interface SearchStrategy {
  version: typeof SEARCH_STRATEGY_SCHEMA_VERSION;
  generatedAt: string;
  /** ISO timestamp of the profile this strategy was synthesized against. */
  sourceProfileGeneratedAt: string;
  /**
   * True when the user confirmed or edited this query list. Daily runs must
   * reuse it and must not silently regenerate over it.
   */
  userConfirmed?: boolean;
  queries: SearchStrategyQuery[];
  /**
   * Negative title/keyword terms used by the ranker as a downweight signal
   * (NOT applied as SerpAPI minus operators — Google Jobs is finicky with
   * exclusion syntax and we'd rather see and skip than miss-and-skip).
   */
  negativeTerms: string[];
}
