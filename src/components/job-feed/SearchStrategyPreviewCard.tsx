'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import {
  JOB_FEED_COUNTRY_OPTIONS,
} from '@/lib/job-feed/constants';
import type { SearchStrategy, SearchStrategyQuery } from '@/lib/job-feed/search-strategy';

interface SearchStrategyResponse {
  strategy: SearchStrategy | null;
  status: 'ok' | 'no_profile' | 'no_settings' | 'no_countries';
  generatedAt: string | null;
  sourceProfileGeneratedAt: string | null;
  profileNewerThanStrategy: boolean;
}

const COUNTRY_LABELS: Record<string, string> = Object.fromEntries(
  JOB_FEED_COUNTRY_OPTIONS.map((option) => [option.value, option.label]),
);

const QUERY_TYPE_LABEL: Record<SearchStrategyQuery['type'], string> = {
  short_tail: 'Broad',
  long_tail: 'Specific',
  localized: 'Localized',
};

const RECALL_LABEL: Record<SearchStrategyQuery['expectedRecall'], string> = {
  high: 'High recall',
  medium: 'Mixed',
  low: 'Niche',
};

/**
 * Read-only preview of the AI-generated SerpAPI search strategy. Shows the
 * actual queries the daily feed will fire, grouped by country, with type
 * and recall labels. Auto-regenerates server-side when the user saves
 * preferences (settings_hash changes) or when their profile updates. No
 * manual "Regenerate" button — token cost is bounded by real input
 * changes, not user clicks.
 */
export function SearchStrategyPreviewCard() {
  const [data, setData] = useState<SearchStrategyResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/job-feed/search-strategy');
      if (!response.ok) {
        setData(null);
        return;
      }
      const json = (await response.json()) as SearchStrategyResponse;
      setData(json);
    } catch {
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const queriesByCountry = useMemo(() => {
    if (!data?.strategy) return [] as Array<{ country: string; queries: SearchStrategyQuery[] }>;
    const grouped = new Map<string, SearchStrategyQuery[]>();
    for (const query of data.strategy.queries) {
      const country = query.targetCountry;
      const existing = grouped.get(country);
      if (existing) {
        existing.push(query);
      } else {
        grouped.set(country, [query]);
      }
    }
    return Array.from(grouped.entries()).map(([country, queries]) => ({ country, queries }));
  }, [data]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-cream-200 bg-cream-50 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-warm-gray">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your search plan.
        </div>
      </div>
    );
  }

  if (!data || data.status !== 'ok' || !data.strategy) {
    return (
      <div className="rounded-2xl border border-cream-200 bg-cream-50 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-navy-50 p-2">
            <Search className="h-4 w-4 text-navy-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-charcoal">How we&apos;ll search for you</h3>
            <p className="mt-1 text-sm text-warm-gray">
              {data?.status === 'no_profile' && 'Karko is preparing your AI profile. Your search plan will appear here next.'}
              {data?.status === 'no_settings' && 'Save your preferences below to see the search plan Karko will run for you.'}
              {data?.status === 'no_countries' && 'Pick at least one country in your preferences to see the search plan.'}
              {!data && 'Karko is preparing your search plan.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { strategy, profileNewerThanStrategy, generatedAt } = data;

  return (
    <div className="rounded-2xl border border-cream-200 bg-cream-50 p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-navy-50 p-2">
          <Search className="h-4 w-4 text-navy-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-charcoal">How we&apos;ll search for you</h3>
          <p className="mt-1 text-sm text-warm-gray">
            The {strategy.queries.length} {strategy.queries.length === 1 ? 'query' : 'queries'} Karko runs on Google Jobs every time you open this feed, in priority order.
          </p>

          {profileNewerThanStrategy && (
            <p className="mt-2 rounded-lg bg-gold-50 px-3 py-2 text-xs text-charcoal">
              We&apos;ll refresh this plan automatically since your profile changed.
            </p>
          )}

          <div className="mt-5 space-y-5">
            {queriesByCountry.map(({ country, queries }) => (
              <CountryBlock key={country} country={country} queries={queries} />
            ))}
          </div>

          {strategy.negativeTerms.length > 0 && (
            <div className="mt-5 border-t border-cream-200 pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-warm-gray">
                Downweighted in results
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {strategy.negativeTerms.map((term) => (
                  <span
                    key={term}
                    className="inline-flex items-center rounded-full border border-cream-200 bg-white px-2.5 py-1 text-xs text-warm-gray"
                  >
                    {term}
                  </span>
                ))}
              </div>
            </div>
          )}

          {generatedAt && (
            <p className="mt-5 text-xs text-warm-gray">
              Last regenerated {formatRelativeTimestamp(generatedAt)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function CountryBlock({ country, queries }: { country: string; queries: SearchStrategyQuery[] }) {
  const label = COUNTRY_LABELS[country] ?? country.toUpperCase();
  return (
    <div>
      <div className="text-sm font-semibold text-charcoal">{label}</div>
      <ul className="mt-2 space-y-2">
        {queries.map((query, idx) => (
          <li key={`${query.query}-${idx}`} className="flex items-start gap-3">
            <span className={typeBadgeClass(query.type)}>
              {QUERY_TYPE_LABEL[query.type]}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-charcoal break-words">{query.query}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-warm-gray">
                <span>{RECALL_LABEL[query.expectedRecall]}</span>
                {query.rationale && (
                  <>
                    <span className="text-cream-400">·</span>
                    <span className="line-clamp-1">{query.rationale}</span>
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function typeBadgeClass(type: SearchStrategyQuery['type']): string {
  const base = 'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide';
  if (type === 'short_tail') return `${base} bg-navy-50 text-navy-700 border border-navy-200`;
  if (type === 'long_tail') return `${base} bg-gold-50 text-gold-700 border border-gold-200`;
  return `${base} bg-cream-100 text-charcoal border border-cream-200`;
}

function formatRelativeTimestamp(isoTimestamp: string): string {
  const then = Date.parse(isoTimestamp);
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(isoTimestamp).toLocaleDateString();
}
