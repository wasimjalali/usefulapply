'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
import type { SearchStrategy } from '@/lib/job-feed/search-strategy';
import type { JobFeedOverviewResponse } from '@/lib/job-feed/types';
import { countryLabel } from './feed-format';
import { useDatePrefs } from '@/hooks/useDatePrefs';
import { formatDayMonth } from '@/lib/utils/format-date';
import type { FeedEditPill } from '@/store/useFeedStore';

const NUDGE_FLAG_KEY = 'usefulapply.feedEditNudgeSeen';
const NUDGE_DELAY_MS = 3000;

interface FeedEditViewProps {
  overview: JobFeedOverviewResponse | null;
  profile: CareerProfile | null;
  strategy: SearchStrategy | null;
  /** How many of the planned queries today's plan actually runs. */
  queryBudget: number;
  pill: FeedEditPill;
  onPillChange: (pill: FeedEditPill) => void;
  onBack: () => void;
  onEditProfile: () => void;
}

const PILLS: { id: FeedEditPill; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'searches', label: 'Searches' },
  { id: 'preferences', label: 'Preferences' },
];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.08em] text-warm-gray">{label}</p>
      <p className="mt-1 text-sm text-charcoal">{value}</p>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-cream-200 bg-white px-3 py-1.5 text-sm text-charcoal">
      {children}
    </span>
  );
}

export function FeedEditView({
  overview,
  profile,
  strategy,
  queryBudget,
  pill,
  onPillChange,
  onBack,
  onEditProfile,
}: FeedEditViewProps) {
  const datePrefs = useDatePrefs();
  // First visit only: a gold dot on the two pills nobody clicks, plus one
  // line saying what is behind them. Any pill click ends it for good.
  const [nudge, setNudge] = useState(false);
  const nudgeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(NUDGE_FLAG_KEY) === 'seen') return;
    nudgeTimerRef.current = window.setTimeout(() => {
      setNudge(true);
      try {
        window.localStorage.setItem(NUDGE_FLAG_KEY, 'seen');
      } catch {
        // A blocked localStorage just means the nudge shows again next time.
      }
    }, NUDGE_DELAY_MS);
    return () => {
      if (nudgeTimerRef.current !== null) window.clearTimeout(nudgeTimerRef.current);
    };
  }, []);

  const dismissNudge = () => {
    if (nudgeTimerRef.current !== null) {
      window.clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = null;
    }
    setNudge(false);
    try {
      window.localStorage.setItem(NUDGE_FLAG_KEY, 'seen');
    } catch {
      // A blocked localStorage just means the nudge shows again next time.
    }
  };

  const settings = overview?.settings ?? null;
  const plannedQueries = strategy?.queries ?? [];
  const todaysQueries = plannedQueries.slice(0, queryBudget);
  const laterQueries = plannedQueries.slice(queryBudget);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-cream-200 px-5 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-cream-200 bg-cream-50 px-3.5 text-sm font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to feed
        </button>
        <h2 className="truncate font-serif text-lg font-semibold text-navy-800">How I search for you</h2>
        <div className="flex-1" />
        <div className="inline-flex flex-shrink-0 items-center rounded-full border border-cream-200 bg-cream-50 p-0.5" role="tablist">
          {PILLS.map((item) => {
            const on = pill === item.id;
            const dotted = nudge && item.id !== 'profile';
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  dismissNudge();
                  onPillChange(item.id);
                }}
                className={`relative rounded-full px-3.5 py-1.5 text-sm transition-colors duration-200 cursor-pointer ${
                  on ? 'bg-white font-semibold text-navy-800 shadow-sm' : 'font-medium text-warm-gray hover:text-navy-700'
                } ${dotted ? 'animate-pulse' : ''}`}
              >
                {item.label}
                {dotted && (
                  <span className="absolute right-1 top-0.5 inline-block h-1.5 w-1.5 rounded-full bg-gold-400" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        {pill === 'profile' && (
          <div className="rounded-2xl border border-cream-200 bg-cream-50 px-5 py-5 shadow-sm">
            <div className="flex items-start gap-3">
              <h3 className="flex-1 font-serif text-base font-semibold text-navy-800">
                What I read from your CV
                {profile?.generatedAt && (
                  <span className="ml-2 text-xs font-normal text-warm-gray">
                    refreshed {formatDayMonth(new Date(profile.generatedAt), datePrefs)}
                  </span>
                )}
              </h3>
              <button
                type="button"
                onClick={onEditProfile}
                className="inline-flex h-9 flex-shrink-0 items-center gap-2 rounded-full border border-cream-200 bg-white px-3.5 text-sm font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-cream-100 cursor-pointer"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </button>
            </div>

            {profile ? (
              <div className="mt-4 space-y-5">
                <div className="grid grid-cols-2 gap-5">
                  <Row
                    label="DISCIPLINE"
                    value={`${capitalise(profile.function)} · ${capitalise(profile.seniority.level)} · ${profile.yearsTotal} years`}
                  />
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.08em] text-warm-gray">INDUSTRIES</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {profile.industryDomains.length > 0
                        ? profile.industryDomains.slice(0, 4).map((item) => <Tag key={item}>{item}</Tag>)
                        : <p className="text-sm text-warm-gray">Not enough in the CV to name one.</p>}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-warm-gray">BEST-FIT TITLES</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {profile.inferredTitles.map((title) => <Tag key={title.canonical}>{title.canonical}</Tag>)}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-warm-gray">STRONGEST SKILL AREAS</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-charcoal">
                    {profile.primarySkillClusters.map((cluster) => (
                      <span key={cluster.name}>
                        <strong className="font-semibold">{capitalise(cluster.name)}:</strong>{' '}
                        {cluster.skills.slice(0, 5).join(', ')}.{' '}
                      </span>
                    ))}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-warm-gray">IN ONE PARAGRAPH</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-charcoal">{profile.narrative}</p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-warm-gray">
                I haven&apos;t read your CV into a profile yet. It gets built with your first feed.
              </p>
            )}
          </div>
        )}

        {pill === 'searches' && (
          <div className="space-y-3">
            <p className="text-sm text-warm-gray">
              {todaysQueries.length > 0
                ? `${todaysQueries.length} ${todaysQueries.length === 1 ? 'search runs' : 'searches run'} each time you build the feed, in this order.`
                : 'Your searches get planned with the first feed.'}
            </p>
            {todaysQueries.map((query, index) => (
              <div key={`${query.query}-${index}`} className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-3 shadow-sm">
                <p className="text-sm font-semibold text-navy-800">{query.query}</p>
                <p className="mt-0.5 text-xs text-warm-gray">{query.rationale}</p>
                <p className="mt-1.5 text-[11px] text-warm-gray">{countryLabel(query.targetCountry)}</p>
              </div>
            ))}
            {laterQueries.length > 0 && (
              <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-3">
                <p className="text-sm text-charcoal">
                  {laterQueries.length} more {laterQueries.length === 1 ? 'query is' : 'queries are'} in the plan. Later runs
                  work down the list, so they come round on other days.
                </p>
              </div>
            )}
          </div>
        )}

        {pill === 'preferences' && (
          <div className="rounded-2xl border border-cream-200 bg-cream-50 px-5 py-5 shadow-sm">
            {settings ? (
              <div className="grid grid-cols-2 gap-5">
                <Row label="COUNTRIES" value={(settings.target_countries ?? []).map(countryLabel).join(', ') || 'Not set'} />
                <Row label="CITIES" value={(settings.target_cities ?? []).join(', ') || 'Anywhere in those countries'} />
                <Row
                  label="WORK MODE"
                  value={(settings.remote_preferences ?? []).map(remotePreferenceLabel).join(', ') || remotePreferenceLabel(settings.remote_preference)}
                />
                <Row
                  label="SALARY FLOOR"
                  value={settings.salary_floor ? `$${settings.salary_floor.toLocaleString('en-US')}` : 'No floor set'}
                />
                <Row label="WORK AUTHORIZATION" value={workAuthLabel(settings.work_authorization_status)} />
                <Row label="WORDS TO AVOID" value={(settings.excluded_terms ?? []).join(', ') || 'None yet'} />
              </div>
            ) : (
              <p className="text-sm text-warm-gray">Your preferences get saved with the first feed.</p>
            )}
          </div>
        )}

        {nudge && pill === 'profile' && (
          <div className="mt-4 rounded-2xl border border-gold-200 bg-gold-50 px-4 py-3">
            <p className="text-sm leading-relaxed text-charcoal">
              <span className="text-gold-600">●</span>{' '}
              First time here? <strong className="font-semibold">Searches</strong> shows the queries I run and why.{' '}
              <strong className="font-semibold">Preferences</strong> holds countries, work mode, salary floor and words to avoid.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function capitalise(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function remotePreferenceLabel(value: string | null): string {
  switch (value) {
    case 'remote_only':
      return 'Remote only';
    case 'remote_first':
      return 'Remote first';
    case 'hybrid':
      return 'Hybrid okay';
    case 'onsite':
      return 'On-site okay';
    case 'flexible':
      return 'Flexible';
    default:
      return 'Not set';
  }
}

function workAuthLabel(value: string | null): string {
  switch (value) {
    case 'authorized':
      return 'Authorized to work there';
    case 'needs_sponsorship':
      return 'Needs sponsorship';
    case 'open_to_both':
      return 'Open to both';
    default:
      return 'Not set';
  }
}
