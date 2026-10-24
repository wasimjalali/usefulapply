'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Loader2, X } from 'lucide-react';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
import type { SearchStrategy } from '@/lib/job-feed/search-strategy-types';
import type { JobFeedOverviewResponse, JobFeedSettingsInput } from '@/lib/job-feed/types';
import {
  JOB_FEED_COUNTRY_OPTIONS,
  JOB_FEED_REMOTE_PREFERENCE_OPTIONS,
  JOB_FEED_WORK_AUTH_OPTIONS,
  legacyMarketFromCountries,
} from '@/lib/job-feed/constants';
import { toJobFeedInput } from '@/lib/job-feed/helpers';
import { countryLabel } from './feed-format';
import { SearchPlanEditor } from './SearchPlanEditor';
import {
  buildConfirmSearchPlan,
  queriesFromSearchStrategy,
  rolesFromConfirmedQueries,
  validateConfirmedQueries,
  type ConfirmedSearchQuery,
} from '@/lib/job-feed/search-plan';
import { useDatePrefs } from '@/hooks/useDatePrefs';
import { formatDayMonth } from '@/lib/utils/format-date';
import type { FeedEditPill } from '@/store/useFeedStore';

interface FeedEditViewProps {
  overview: JobFeedOverviewResponse | null;
  profile: CareerProfile | null;
  strategy: SearchStrategy | null;
  /** How many of the planned queries today's plan actually runs. */
  queryBudget: number;
  pill: FeedEditPill;
  onPillChange: (pill: FeedEditPill) => void;
  onBack: () => void;
  onSavePreferences: (draft: JobFeedSettingsInput, plan: ConfirmedSearchQuery[]) => Promise<
    { ok: true; settingsVersion: string | null } | { ok: false; error: string }
  >;
}

const PILLS: { id: FeedEditPill; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'searches', label: 'Searches' },
];

interface PreferenceDraft {
  countries: string[];
  cities: string;
  workModes: JobFeedSettingsInput['remote_preferences'];
  salaryFloor: string;
  searchRows: ConfirmedSearchQuery[];
  workAuthorization: JobFeedSettingsInput['work_authorization_status'];
  excludedTerms: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-muted">{label}</p>
      <p className="mt-1 text-sm text-ink-body">{value}</p>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-pill border border-border bg-surface-raised px-3 py-1.5 text-sm text-ink-body">
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
  onSavePreferences,
}: FeedEditViewProps) {
  const datePrefs = useDatePrefs();
  const settings = overview?.settings ?? null;
  const settingsInput = useMemo(() => settings ? toJobFeedInput(settings) : null, [settings]);
  const nextDraft = useMemo(
    () => settingsInput
      ? toPreferenceDraft(settingsInput, strategy, queryBudget)
      : null,
    [queryBudget, settingsInput, strategy],
  );
  const settingsVersion = settings?.updated_at ?? null;
  const [draft, setDraft] = useState<PreferenceDraft | null>(nextDraft);
  const [savedDraft, setSavedDraft] = useState<PreferenceDraft | null>(nextDraft);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const [draftVersion, setDraftVersion] = useState(settingsVersion);

  if (isNewerSettingsVersion(settingsVersion, draftVersion) && saveState !== 'saving' && saveState !== 'error') {
    setDraft(nextDraft);
    setSavedDraft(nextDraft);
    setSaveState('idle');
    setSaveError('');
    setDraftVersion(settingsVersion);
  }

  const plannedQueries = strategy?.queries ?? [];
  const todaysQueries = plannedQueries.slice(0, queryBudget);
  const laterQueries = plannedQueries.slice(queryBudget);
  const dirty = draft !== null && savedDraft !== null
    && JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const salaryValue = draft?.salaryFloor.trim() ?? '';
  const salaryValid = salaryValue === ''
    || (/^\d+$/.test(salaryValue) && Number(salaryValue) >= 0);
  const formValid = Boolean(
    draft
    && draft.countries.length > 0
    && draft.workModes.length > 0
    && salaryValid
    && draft.searchRows.length > 0
    && draft.searchRows.every((row) => row.query.trim().length > 0),
  );

  const updateDraft = (patch: Partial<PreferenceDraft>) => {
    setDraft((current) => current ? { ...current, ...patch } : current);
    setDraftVersion(settingsVersion);
    setSaveState('idle');
    setSaveError('');
  };

  const savePreferences = async () => {
    if (!draft || !settingsInput || !formValid || saveState === 'saving') return;
    const checked = validateConfirmedQueries(draft.searchRows, queryBudget);
    if (!checked.ok) {
      setSaveState('error');
      setSaveError(checked.error);
      return;
    }
    setSaveState('saving');
    setSaveError('');
    let result: Awaited<ReturnType<typeof onSavePreferences>>;
    try {
      result = await onSavePreferences(toSettingsInput(settingsInput, { ...draft, searchRows: checked.queries }), checked.queries);
    } catch {
      setSaveState('error');
      setSaveError('Your preferences did not save. Try again.');
      return;
    }
    if (!result.ok) {
      setSaveState('error');
      setSaveError(result.error);
      return;
    }
    setDraftVersion(result.settingsVersion);
    setSavedDraft(draft);
    setSaveState('saved');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-pill border border-border bg-surface px-3.5 text-sm font-semibold text-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-surface-raised cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to feed
        </button>
        <h2 className="truncate text-lg font-semibold text-ink">How I search for you</h2>
        <div className="flex-1" />
        <div className="inline-flex flex-shrink-0 items-center rounded-pill border border-border bg-surface p-0.5" role="tablist">
          {PILLS.map((item) => {
            const on = pill === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onPillChange(item.id)}
                className={`rounded-pill px-3.5 py-1.5 text-sm transition-colors duration-(--duration-base) cursor-pointer ${
                  on ? 'bg-surface-raised font-semibold text-ink shadow-resting' : 'font-medium text-ink-muted hover:text-brand-strong'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        {pill === 'profile' && (
          <div className="space-y-4">
            <section className="rounded-card border border-border bg-surface px-5 py-5 shadow-resting">
              <h3 className="text-base font-semibold text-ink">Preferences</h3>
              {draft ? (
                <form
                  className="mt-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void savePreferences();
                  }}
                >
                  <div className="grid grid-cols-1 gap-x-5 gap-y-4 xl:grid-cols-2">
                    <div>
                      <label htmlFor="feed-country" className="text-sm font-medium text-ink-body">Countries</label>
                      <select
                        id="feed-country"
                        value=""
                        onChange={(event) => {
                          const country = event.target.value;
                          if (country && !draft.countries.includes(country)) {
                            updateDraft({ countries: [...draft.countries, country] });
                          }
                        }}
                        className="mt-1.5 h-10 w-full rounded-control border border-border bg-surface-raised px-3 text-sm text-ink-body outline-none transition-colors duration-(--duration-fast) focus:border-brand-strong focus:ring-2 focus:ring-brand-strong/15"
                      >
                        <option value="">Add a country</option>
                        {JOB_FEED_COUNTRY_OPTIONS.filter((option) => !draft.countries.includes(option.value)).map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <div className="mt-2 flex min-h-8 flex-wrap gap-2">
                        {draft.countries.map((country) => (
                          <span key={country} className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface-raised py-1 pl-3 pr-1 text-sm text-ink-body">
                            {countryLabel(country)}
                            <button
                              type="button"
                              onClick={() => updateDraft({ countries: draft.countries.filter((item) => item !== country) })}
                              aria-label={`Remove ${countryLabel(country)}`}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-pill text-ink-muted transition-colors duration-(--duration-fast) hover:bg-canvas hover:text-ink"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                      {draft.countries.length === 0 && (
                        <p className="mt-1 text-xs text-danger-strong">Choose at least one country.</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="feed-cities" className="text-sm font-medium text-ink-body">Cities</label>
                      <input
                        id="feed-cities"
                        type="text"
                        value={draft.cities}
                        onChange={(event) => updateDraft({ cities: event.target.value })}
                        placeholder="Berlin, Amsterdam"
                        className="mt-1.5 h-10 w-full rounded-control border border-border bg-surface-raised px-3 text-sm text-ink-body outline-none transition-colors duration-(--duration-fast) placeholder:text-ink-muted focus:border-brand-strong focus:ring-2 focus:ring-brand-strong/15"
                      />
                    </div>

                    <fieldset>
                      <legend className="text-sm font-medium text-ink-body">Work mode</legend>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {JOB_FEED_REMOTE_PREFERENCE_OPTIONS.map((option) => {
                          const selected = draft.workModes.includes(option.value);
                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => updateDraft({
                                workModes: selected
                                  ? draft.workModes.filter((item) => item !== option.value)
                                  : [...draft.workModes, option.value],
                              })}
                              className={`inline-flex h-10 items-center gap-1.5 rounded-pill border px-3 text-sm transition-colors duration-(--duration-fast) ${
                                selected
                                  ? 'border-brand-strong bg-surface-raised font-semibold text-ink'
                                  : 'border-border bg-surface-raised text-ink-body hover:border-border-strong'
                              }`}
                            >
                              {selected && <Check className="h-3.5 w-3.5" />}
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                      {draft.workModes.length === 0 && (
                        <p className="mt-1 text-xs text-danger-strong">Choose at least one work mode.</p>
                      )}
                    </fieldset>

                    <div>
                      <label htmlFor="feed-salary-floor" className="text-sm font-medium text-ink-body">Salary floor</label>
                      <div className="relative mt-1.5">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ink-muted">$</span>
                        <input
                          id="feed-salary-floor"
                          type="number"
                          min="0"
                          step="1000"
                          inputMode="numeric"
                          value={draft.salaryFloor}
                          onChange={(event) => updateDraft({ salaryFloor: event.target.value })}
                          className="h-10 w-full rounded-control border border-border bg-surface-raised py-2 pl-7 pr-3 text-sm tabular-nums text-ink-body outline-none transition-colors duration-(--duration-fast) focus:border-brand-strong focus:ring-2 focus:ring-brand-strong/15"
                        />
                      </div>
                      {!salaryValid && (
                        <p className="mt-1 text-xs text-danger-strong">Enter a whole number or leave it blank.</p>
                      )}
                    </div>

                    <div className="xl:col-span-2">
                      <p className="text-sm font-medium text-ink-body">Searches</p>
                      <div className="mt-2">
                        {draft && (
                          <SearchPlanEditor
                            rows={draft.searchRows}
                            countries={draft.countries}
                            cap={queryBudget}
                            disabled={saveState === 'saving'}
                            onChange={(searchRows) => updateDraft({ searchRows })}
                          />
                        )}
                      </div>
                      {draft.searchRows.length === 0 && (
                        <p className="mt-1 text-xs text-danger-strong">Keep at least one search.</p>
                      )}
                      {draft.searchRows.some((row) => row.query.trim().length === 0) && (
                        <p className="mt-1 text-xs text-danger-strong">Every search needs a role keyword.</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="feed-work-authorization" className="text-sm font-medium text-ink-body">Work authorization</label>
                      <select
                        id="feed-work-authorization"
                        value={draft.workAuthorization ?? ''}
                        onChange={(event) => updateDraft({
                          workAuthorization: event.target.value as JobFeedSettingsInput['work_authorization_status'],
                        })}
                        className="mt-1.5 h-10 w-full rounded-control border border-border bg-surface-raised px-3 text-sm text-ink-body outline-none transition-colors duration-(--duration-fast) focus:border-brand-strong focus:ring-2 focus:ring-brand-strong/15"
                      >
                        {JOB_FEED_WORK_AUTH_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="feed-excluded-terms" className="text-sm font-medium text-ink-body">Words to avoid</label>
                      <input
                        id="feed-excluded-terms"
                        type="text"
                        value={draft.excludedTerms}
                        onChange={(event) => updateDraft({ excludedTerms: event.target.value })}
                        placeholder="Sales, staffing agencies"
                        className="mt-1.5 h-10 w-full rounded-control border border-border bg-surface-raised px-3 text-sm text-ink-body outline-none transition-colors duration-(--duration-fast) placeholder:text-ink-muted focus:border-brand-strong focus:ring-2 focus:ring-brand-strong/15"
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex min-h-10 items-center justify-end gap-3 border-t border-border pt-4">
                    <div className="min-w-0 flex-1" aria-live="polite">
                      {saveState === 'saved' && <p className="text-sm text-ink-body">Saved.</p>}
                      {saveState === 'error' && <p className="text-sm text-danger-strong">{saveError}</p>}
                    </div>
                    <button
                      type="submit"
                      disabled={!dirty || !formValid || saveState === 'saving'}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-pill bg-accent px-5 text-sm font-semibold text-accent-ink shadow-resting transition-colors duration-(--duration-fast) hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-muted"
                    >
                      {saveState === 'saving' && <Loader2 className="h-4 w-4 animate-spin" />}
                      {saveState === 'saving' ? 'Saving' : 'Save preferences'}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="mt-4 text-sm text-ink-muted">Your preferences get saved with the first feed.</p>
              )}
            </section>

            <section className="rounded-card border border-border bg-surface px-5 py-5 shadow-resting">
              <h3 className="text-base font-semibold text-ink">
                What I read from your CV
                {profile?.generatedAt && (
                  <span className="ml-2 text-xs font-normal text-ink-muted">
                    refreshed {formatDayMonth(new Date(profile.generatedAt), datePrefs)}
                  </span>
                )}
              </h3>

              {profile ? (
                <div className="mt-4 space-y-5">
                  <div className="grid grid-cols-2 gap-5">
                    <Row
                      label="DISCIPLINE"
                      value={`${capitalise(profile.function)} · ${capitalise(profile.seniority.level)} · ${profile.yearsTotal} years`}
                    />
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-muted">INDUSTRIES</p>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {profile.industryDomains.length > 0
                          ? profile.industryDomains.slice(0, 4).map((item) => <Tag key={item}>{item}</Tag>)
                          : <p className="text-sm text-ink-muted">Not enough in the CV to name one.</p>}
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-muted">BEST-FIT TITLES</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {profile.inferredTitles.map((title) => <Tag key={title.canonical}>{title.canonical}</Tag>)}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-muted">STRONGEST SKILL AREAS</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-body">
                      {profile.primarySkillClusters.map((cluster) => (
                        <span key={cluster.name}>
                          <strong className="font-semibold">{capitalise(cluster.name)}:</strong>{' '}
                          {cluster.skills.slice(0, 5).join(', ')}.{' '}
                        </span>
                      ))}
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-muted">IN ONE PARAGRAPH</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-body">{profile.narrative}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-ink-muted">
                  I haven&apos;t read your CV into a profile yet. It gets built with your first feed.
                </p>
              )}
            </section>
          </div>
        )}

        {pill === 'searches' && (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              {todaysQueries.length > 0
                ? `${todaysQueries.length} ${todaysQueries.length === 1 ? 'search runs' : 'searches run'} each time you build the feed, in this order.`
                : 'Your searches get planned with the first feed.'}
            </p>
            {todaysQueries.map((query, index) => (
              <div key={`${query.query}-${index}`} className="rounded-card border border-border bg-surface px-4 py-3 shadow-resting">
                <p className="text-sm font-semibold text-ink">{query.query}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{query.rationale}</p>
                <p className="mt-1.5 text-[11px] text-ink-muted">{countryLabel(query.targetCountry)}</p>
              </div>
            ))}
            {laterQueries.length > 0 && (
              <div className="rounded-card border border-border bg-surface px-4 py-3">
                <p className="text-sm text-ink-body">
                  {laterQueries.length} more {laterQueries.length === 1 ? 'query is' : 'queries are'} in the plan. Later runs
                  work down the list, so they come round on other days.
                </p>
              </div>
            )}
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

function toPreferenceDraft(
  input: JobFeedSettingsInput,
  strategy: SearchStrategy | null,
  cap: number,
): PreferenceDraft {
  const fromStrategy = queriesFromSearchStrategy(strategy);
  const searchRows = fromStrategy.length > 0
    ? fromStrategy.slice(0, cap)
    : buildConfirmSearchPlan({
        roles: input.target_roles,
        countries: input.target_countries,
        cities: input.target_cities,
        cap,
      });
  return {
    countries: [...input.target_countries],
    cities: input.target_cities.join(', '),
    workModes: [...input.remote_preferences],
    salaryFloor: input.salary_floor === null ? '' : String(input.salary_floor),
    searchRows,
    workAuthorization: input.work_authorization_status,
    excludedTerms: input.excluded_terms.join(', '),
  };
}

function toSettingsInput(base: JobFeedSettingsInput, draft: PreferenceDraft): JobFeedSettingsInput {
  const salary = draft.salaryFloor.trim();
  const remotePreference = draft.workModes[0];
  return {
    ...base,
    target_market: legacyMarketFromCountries(draft.countries),
    target_countries: draft.countries,
    target_cities: splitCommaList(draft.cities),
    target_roles: rolesFromConfirmedQueries(draft.searchRows),
    remote_preference: remotePreference,
    remote_preferences: draft.workModes,
    salary_floor: salary ? Number(salary) : null,
    work_authorization_status: draft.workAuthorization,
    excluded_terms: splitCommaList(draft.excludedTerms),
  };
}

function splitCommaList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item, index, items) => item.length > 0 && items.indexOf(item) === index);
}

function isNewerSettingsVersion(current: string | null, draft: string | null): boolean {
  if (!current || current === draft) return false;
  if (!draft) return true;
  const currentTime = Date.parse(current);
  const draftTime = Date.parse(draft);
  if (!Number.isFinite(currentTime) || !Number.isFinite(draftTime)) return true;
  return currentTime > draftTime;
}
