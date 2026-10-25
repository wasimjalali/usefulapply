'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Loader2, RefreshCw, X } from 'lucide-react';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
import type { SearchStrategy } from '@/lib/job-feed/search-strategy-types';
import type { JobFeedOverviewResponse, JobFeedSettingsInput } from '@/lib/job-feed/types';
import {
  JOB_FEED_COUNTRY_OPTIONS,
  JOB_FEED_EMPLOYMENT_TYPE_OPTIONS,
  JOB_FEED_REMOTE_PREFERENCE_OPTIONS,
  JOB_FEED_SENIORITY_OPTIONS,
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
  /** How many searches the list may hold: a run's searches times the plan's runs a day. */
  searchListCap: number;
  pill: FeedEditPill;
  onPillChange: (pill: FeedEditPill) => void;
  onBack: () => void;
  /** Read the CV into the profile again. */
  onRereadCv: () => Promise<{ ok: true } | { ok: false; error: string }>;
  /** `expectedRevision` is the settings revision the draft was made from; a newer saved one refuses the save. */
  onSavePreferences: (draft: JobFeedSettingsInput, plan: ConfirmedSearchQuery[], expectedRevision: number | null) => Promise<
    { ok: true; settingsVersion: number | null } | { ok: false; error: string; stale: boolean }
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
  employmentTypes: JobFeedSettingsInput['employment_types'];
  seniority: JobFeedSettingsInput['seniority_targets'];
  salaryFloor: string;
  searchRows: ConfirmedSearchQuery[];
  workAuthorization: JobFeedSettingsInput['work_authorization_status'];
  excludedTerms: string;
  languages: string;
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
  searchListCap,
  pill,
  onPillChange,
  onBack,
  onRereadCv,
  onSavePreferences,
}: FeedEditViewProps) {
  const datePrefs = useDatePrefs();
  const settings = overview?.settings ?? null;
  const settingsInput = useMemo(() => settings ? toJobFeedInput(settings) : null, [settings]);
  const nextDraft = useMemo(
    () => settingsInput
      ? toPreferenceDraft(settingsInput, strategy, searchListCap)
      : null,
    [searchListCap, settingsInput, strategy],
  );
  const settingsVersion = settings?.revision ?? null;
  const [draft, setDraft] = useState<PreferenceDraft | null>(nextDraft);
  const [savedDraft, setSavedDraft] = useState<PreferenceDraft | null>(nextDraft);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  /** Shown after a stale save, over the reloaded settings, until the next edit. */
  const [staleNotice, setStaleNotice] = useState('');
  const [draftVersion, setDraftVersion] = useState(settingsVersion);
  const [rereading, setRereading] = useState(false);
  const [rereadError, setRereadError] = useState('');
  /** Set by a stale save: take in the newer settings even over unsaved edits. */
  const [reloadDraft, setReloadDraft] = useState(false);
  /** The search list the draft was made from: a newer one (saved by an agent) replaces a clean form too. */
  const strategyVersion = strategy?.generatedAt ?? null;
  const [draftStrategyVersion, setDraftStrategyVersion] = useState(strategyVersion);

  // Employment types and levels are sets: the same values in another order are no change.
  const sortedTypes = (value: PreferenceDraft) => ({
    ...value,
    employmentTypes: [...value.employmentTypes].sort(),
    seniority: [...value.seniority].sort(),
  });
  const dirty = draft !== null && savedDraft !== null
    && JSON.stringify(sortedTypes(draft)) !== JSON.stringify(sortedTypes(savedDraft));

  // Newer saved settings replace a clean form. Unsaved edits are never replaced quietly: their save is
  // refused as stale, and only then does the form take the newer settings in.
  const newerSettings = isNewerSettingsVersion(settingsVersion, draftVersion);
  if (
    (newerSettings || strategyVersion !== draftStrategyVersion)
    && (!dirty || reloadDraft)
    && saveState !== 'saving'
    && saveState !== 'error'
  ) {
    setDraft(nextDraft);
    setSavedDraft(nextDraft);
    // Only settings saved elsewhere clear "Saved.": the list reloading after this form's own save does not.
    if (newerSettings) {
      setSaveState('idle');
      setSaveError('');
    }
    setDraftVersion(settingsVersion);
    setDraftStrategyVersion(strategyVersion);
    setReloadDraft(false);
  }

  const plannedQueries = strategy?.queries ?? [];
  const todaysQueries = plannedQueries.slice(0, queryBudget);
  const laterQueries = plannedQueries.slice(queryBudget);
  const salaryValue = draft?.salaryFloor.trim() ?? '';
  const salaryValid = salaryValue === ''
    || (/^\d+$/.test(salaryValue) && Number(salaryValue) >= 0);
  const formValid = Boolean(
    draft
    && draft.countries.length > 0
    && draft.workModes.length > 0
    && draft.employmentTypes.length > 0
    && salaryValid
    && draft.searchRows.length > 0
    && draft.searchRows.every((row) => row.query.trim().length > 0),
  );

  // An edit keeps the revision the draft was made from: a save then only goes through if nothing newer
  // was saved meanwhile (by an agent through the MCP, or another tab).
  const updateDraft = (patch: Partial<PreferenceDraft>) => {
    setDraft((current) => current ? { ...current, ...patch } : current);
    setSaveState('idle');
    setSaveError('');
    setStaleNotice('');
    // An edit after a stale save keeps the user's own changes: the next save is checked again.
    setReloadDraft(false);
  };

  const savePreferences = async () => {
    if (!draft || !settingsInput || !formValid || saveState === 'saving') return;
    // The search list changed under unsaved edits (an agent saved one): saving these rows would put the old
    // list back. Treat it as a stale save: take in the newer list and say so.
    if (strategyVersion !== draftStrategyVersion) {
      setStaleNotice('Your searches changed somewhere else. I loaded the latest. Check them and save again.');
      setReloadDraft(true);
      return;
    }
    const checked = validateConfirmedQueries(draft.searchRows, searchListCap);
    if (!checked.ok) {
      setSaveState('error');
      setSaveError(checked.error);
      return;
    }
    setSaveState('saving');
    setSaveError('');
    let result: Awaited<ReturnType<typeof onSavePreferences>>;
    try {
      result = await onSavePreferences(toSettingsInput(settingsInput, { ...draft, searchRows: checked.queries }), checked.queries, draftVersion);
    } catch {
      setSaveState('error');
      setSaveError('Your preferences did not save. Try again.');
      return;
    }
    if (!result.ok && result.stale) {
      // The latest settings are loaded by now; going idle lets the form take them in.
      setSaveState('idle');
      setStaleNotice(result.error);
      setReloadDraft(true);
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
                                  : 'border-border bg-surface-raised text-ink-body hover:border-border-brand-soft'
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

                    <fieldset className="xl:col-span-2">
                      <legend className="text-sm font-medium text-ink-body">Employment type</legend>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {JOB_FEED_EMPLOYMENT_TYPE_OPTIONS.map((option) => {
                          const selected = draft.employmentTypes.includes(option.value);
                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => updateDraft({
                                employmentTypes: selected
                                  ? draft.employmentTypes.filter((item) => item !== option.value)
                                  : [...draft.employmentTypes, option.value],
                              })}
                              className={`inline-flex h-10 items-center gap-1.5 rounded-pill border px-3 text-sm transition-colors duration-(--duration-fast) ${
                                selected
                                  ? 'border-brand-strong bg-surface-raised font-semibold text-ink'
                                  : 'border-border bg-surface-raised text-ink-body hover:border-border-brand-soft'
                              }`}
                            >
                              {selected && <Check className="h-3.5 w-3.5" />}
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                      {draft.employmentTypes.length === 0 && (
                        <p className="mt-1 text-xs text-danger-strong">Choose at least one employment type.</p>
                      )}
                    </fieldset>

                    <fieldset className="xl:col-span-2">
                      <legend className="text-sm font-medium text-ink-body">Seniority</legend>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {JOB_FEED_SENIORITY_OPTIONS.map((option) => {
                          const selected = draft.seniority.includes(option.value);
                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => updateDraft({
                                seniority: selected
                                  ? draft.seniority.filter((item) => item !== option.value)
                                  : [...draft.seniority, option.value],
                              })}
                              className={`inline-flex h-10 items-center gap-1.5 rounded-pill border px-3 text-sm transition-colors duration-(--duration-fast) ${
                                selected
                                  ? 'border-brand-strong bg-surface-raised font-semibold text-ink'
                                  : 'border-border bg-surface-raised text-ink-body hover:border-border-brand-soft'
                              }`}
                            >
                              {selected && <Check className="h-3.5 w-3.5" />}
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                      {draft.seniority.length === 0 && (
                        <p className="mt-1 text-xs text-ink-muted">No level chosen: every level is shown.</p>
                      )}
                    </fieldset>

                    <div className="xl:col-span-2">
                      <p className="text-sm font-medium text-ink-body">Searches</p>
                      <div className="mt-2">
                        {draft && (
                          <SearchPlanEditor
                            rows={draft.searchRows}
                            countries={draft.countries}
                            cap={searchListCap}
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

                    <div>
                      <label htmlFor="feed-languages" className="text-sm font-medium text-ink-body">Languages</label>
                      <input
                        id="feed-languages"
                        type="text"
                        value={draft.languages}
                        onChange={(event) => updateDraft({ languages: event.target.value })}
                        placeholder="English, German"
                        className="mt-1.5 h-10 w-full rounded-control border border-border bg-surface-raised px-3 text-sm text-ink-body outline-none transition-colors duration-(--duration-fast) placeholder:text-ink-muted focus:border-brand-strong focus:ring-2 focus:ring-brand-strong/15"
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex min-h-10 items-center justify-end gap-3 border-t border-border pt-4">
                    <div className="min-w-0 flex-1" aria-live="polite">
                      {saveState === 'saved' && <p className="text-sm text-ink-body">Saved.</p>}
                      {staleNotice && saveState === 'idle' && <p className="text-sm text-danger-strong" role="alert">{staleNotice}</p>}
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
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-base font-semibold text-ink">
                  What I read from your CV
                  {profile?.generatedAt && (
                    <span className="ml-2 text-xs font-normal text-ink-muted">
                      refreshed {formatDayMonth(new Date(profile.generatedAt), datePrefs)}
                    </span>
                  )}
                </h3>
                <div className="flex-1" />
                <button
                  type="button"
                  disabled={rereading}
                  onClick={async () => {
                    setRereading(true);
                    setRereadError('');
                    const result = await onRereadCv();
                    setRereading(false);
                    if (!result.ok) setRereadError(result.error);
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-pill border border-border bg-surface px-3.5 text-sm font-semibold text-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-surface-raised disabled:cursor-wait disabled:text-ink-muted"
                >
                  {rereading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {rereading ? 'Reading your CV' : 'Read my CV again'}
                </button>
              </div>
              {rereadError && <p className="mt-2 text-sm text-danger-strong" role="alert">{rereadError}</p>}

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
                  work down the list, so they come round on later runs.
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
    employmentTypes: [...input.employment_types],
    seniority: [...input.seniority_targets],
    salaryFloor: input.salary_floor === null ? '' : String(input.salary_floor),
    searchRows,
    workAuthorization: input.work_authorization_status,
    excludedTerms: input.excluded_terms.join(', '),
    languages: input.languages.join(', '),
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
    employment_types: draft.employmentTypes,
    seniority_targets: draft.seniority,
    seniority_target: draft.seniority[0] ?? null,
    salary_floor: salary ? Number(salary) : null,
    work_authorization_status: draft.workAuthorization,
    excluded_terms: splitCommaList(draft.excludedTerms),
    languages: splitCommaList(draft.languages),
  };
}

function splitCommaList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item, index, items) => item.length > 0 && items.indexOf(item) === index);
}

function isNewerSettingsVersion(current: number | null, draft: number | null): boolean {
  if (current === null) return false;
  return draft === null || current > draft;
}
