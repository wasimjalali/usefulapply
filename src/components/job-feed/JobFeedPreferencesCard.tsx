'use client';

import { useEffect, useMemo } from 'react';
import { Check, Loader2, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import {
  ChipField,
  MultiSelectDropdown,
} from '@/components/job-feed/form-controls';
import {
  JOB_FEED_COUNTRY_OPTIONS,
  JOB_FEED_REMOTE_PREFERENCE_OPTIONS,
  JOB_FEED_WORK_AUTH_OPTIONS,
  legacyMarketFromCountries,
  type JobFeedCountryCode,
} from '@/lib/job-feed/constants';
import { isValidTimeZone } from '@/lib/job-feed/helpers';
import type { JobFeedSettingsInput } from '@/lib/job-feed/types';

type Variant = 'onboarding' | 'editing';

interface JobFeedPreferencesCardProps {
  variant: Variant;
  form: JobFeedSettingsInput;
  saveState: 'idle' | 'saving';
  hasRecordedConsent: boolean;
  maxCountries: number;
  onFormChange: (updater: (prev: JobFeedSettingsInput) => JobFeedSettingsInput) => void;
  onSave: (form: JobFeedSettingsInput) => void;
  onClose?: () => void;
  /** When true (editing variant only), the saved target roles differ from the
   *  latest AI profile. An inline notice prompts the user to save. */
  targetRolesOutdated?: boolean;
}

/**
 * The minimal "what we can't infer" form. Five things only:
 *   1. Where to search (countries + optional cities)
 *   2. How you want to work (remote / hybrid / onsite / flexible)
 *   3. Minimum salary (optional)
 *   4. Work authorization
 *
 * Everything else (target_roles, seniority, user_skills, languages,
 * employment_types) is auto-mirrored server-side from the AI career
 * profile when this form saves. The user never types those — they
 * read them in the AI profile card above.
 *
 * Two modes:
 *   - "onboarding": first-time setup. Large CTA "Build my feed". Karko
 *     synthesizes the profile + strategy after save.
 *   - "editing": returning user adjusting preferences. CTA "Save changes".
 */
export function JobFeedPreferencesCard({
  variant,
  form,
  saveState,
  hasRecordedConsent,
  maxCountries,
  onFormChange,
  onSave,
  onClose,
  targetRolesOutdated = false,
}: JobFeedPreferencesCardProps) {
  // Auto-detect the browser timezone once on mount. Never overrides a saved
  // value — if the form already has a timezone (even one from the server),
  // we leave it untouched. Fall back to UTC only if the browser cannot
  // tell us (extremely rare). Fixes: auto-detect silently overriding saved tz.
  useEffect(() => {
    if (form.user_timezone) return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    onFormChange((prev) => ({
      ...prev,
      user_timezone: detected && isValidTimeZone(detected) ? detected : 'UTC',
    }));
  }, [form.user_timezone, onFormChange]);

  const consentReady = form.consent_accepted || hasRecordedConsent;
  const canSave = canSavePreferences(form, hasRecordedConsent);

  return (
    <Card className="overflow-hidden rounded-2xl border-cream-200 bg-cream-50 p-0 shadow-sm">
      <Header variant={variant} onClose={onClose} />

      <div className="space-y-7 px-6 py-7 sm:px-8 sm:py-8">
        {variant === 'editing' && targetRolesOutdated && (
          <div className="rounded-lg border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-charcoal">
            Updated from your latest CV. Save to apply.
          </div>
        )}

        <SectionLabel
          label="Where to search"
          help="Pick the countries and cities you want jobs from."
        >
          <MicroLabel>Countries</MicroLabel>
          <MultiSelectDropdown
            values={form.target_countries}
            options={[...JOB_FEED_COUNTRY_OPTIONS]}
            placeholder="Choose countries"
            searchable
            maxSelections={maxCountries}
            onChange={(target_countries) =>
              onFormChange((prev) => ({
                ...prev,
                target_countries,
                target_market: legacyMarketFromCountries(target_countries) as JobFeedSettingsInput['target_market'],
              }))
            }
          />

          <MicroLabel optional>Cities</MicroLabel>
          <p className="text-xs text-warm-gray">
            Add city names like Berlin or San Francisco. Leave empty to search the whole country.
          </p>
          <ChipField
            values={form.target_cities}
            suggestions={[]}
            placeholder="Type a city and press Enter"
            onChange={(target_cities) => onFormChange((prev) => ({ ...prev, target_cities }))}
          />
        </SectionLabel>

        <Divider />

        <SectionLabel
          label="How you want to work"
          help="Pick any that fit. Karko surfaces jobs in any mode you choose."
        >
          <ChipChoice
            options={JOB_FEED_REMOTE_PREFERENCE_OPTIONS as readonly { value: string; label: string }[]}
            values={form.remote_preferences}
            onChange={(values) =>
              onFormChange((prev) => ({
                ...prev,
                remote_preferences: values as JobFeedSettingsInput['remote_preferences'],
                remote_preference: (values[0] ?? prev.remote_preference) as JobFeedSettingsInput['remote_preference'],
              }))
            }
          />
        </SectionLabel>

        <Divider />

        <SectionLabel
          label="Minimum salary"
          help="Optional. Jobs that publicly list a salary below this are filtered out before ranking."
        >
          <input
            type="number"
            inputMode="numeric"
            placeholder="e.g. 80000"
            value={form.salary_floor === null ? '' : String(form.salary_floor)}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw === '') {
                onFormChange((prev) => ({ ...prev, salary_floor: null }));
                return;
              }
              const parsed = Number(raw);
              if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) return;
              onFormChange((prev) => ({ ...prev, salary_floor: Math.floor(parsed) }));
            }}
            className="w-full max-w-xs rounded-lg border border-cream-200 bg-white px-3.5 py-2.5 text-sm text-charcoal placeholder:text-warm-gray/60 outline-none transition-colors focus:border-navy-400 focus:ring-2 focus:ring-navy-100"
          />
        </SectionLabel>

        <Divider />

        <SectionLabel
          label="Work authorization"
          help="Karko skips listings that explicitly exclude your situation."
        >
          <ChipChoice
            options={JOB_FEED_WORK_AUTH_OPTIONS as readonly { value: string; label: string }[]}
            values={form.work_authorization_status ? [form.work_authorization_status] : []}
            single
            onChange={(values) =>
              onFormChange((prev) => ({
                ...prev,
                work_authorization_status: (values[0] ?? null) as JobFeedSettingsInput['work_authorization_status'],
              }))
            }
          />
        </SectionLabel>

        <Divider />

        <SectionLabel
          label="What to avoid"
          help="Optional. Titles, companies or keywords you never want to see. Karko skips anything that matches."
        >
          <ChipField
            values={form.excluded_terms}
            suggestions={[]}
            placeholder="e.g. Sales, agency, crypto"
            onChange={(excluded_terms) => onFormChange((prev) => ({ ...prev, excluded_terms }))}
          />
        </SectionLabel>

        {!hasRecordedConsent && variant === 'onboarding' && (
          <ConsentRow
            checked={form.consent_accepted}
            onChange={(consent_accepted) => onFormChange((prev) => ({ ...prev, consent_accepted }))}
          />
        )}
      </div>

      <Footer
        variant={variant}
        canSave={canSave && consentReady}
        saveState={saveState}
        timezone={form.user_timezone}
        onSave={() => onSave(form)}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function Header({ variant, onClose }: { variant: Variant; onClose?: () => void }) {
  if (variant === 'onboarding') {
    return (
      <div className="border-b border-cream-200 bg-cream-50 px-6 py-7 sm:px-8 sm:py-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-2xl font-semibold tracking-tight text-charcoal">
              Where do you want to work?
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-warm-gray">
              Tell us a few things we can&apos;t guess from your CV. Karko handles the rest.
            </p>
          </div>
          {onClose && (
            <CloseButton onClose={onClose} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-cream-200 px-6 py-5 sm:px-8">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-charcoal">Your preferences</h2>
          <p className="mt-1 text-sm text-warm-gray">Adjust the things Karko can&apos;t infer from your CV.</p>
        </div>
        {onClose && <CloseButton onClose={onClose} />}
      </div>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close preferences"
      className="rounded-full p-2 text-warm-gray transition-colors hover:bg-cream-100 hover:text-charcoal cursor-pointer"
    >
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function Footer({
  variant,
  canSave,
  saveState,
  timezone,
  onSave,
}: {
  variant: Variant;
  canSave: boolean;
  saveState: 'idle' | 'saving';
  timezone: string;
  onSave: () => void;
}) {
  const isSaving = saveState === 'saving';
  const cta = variant === 'onboarding' ? 'Build my feed' : 'Save changes';

  return (
    <div className="border-t border-cream-200 bg-cream-50/60 px-6 py-5 sm:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs text-warm-gray">
          <MapPin className="h-3.5 w-3.5" />
          <span>
            We use your timezone (<span className="font-medium text-charcoal">{formatTimeZone(timezone)}</span>) to group jobs by local day.
          </span>
        </div>
        <button
          type="button"
          disabled={!canSave || isSaving}
          onClick={onSave}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gold-400 px-6 py-2.5 text-sm font-semibold text-navy-900 shadow-sm transition-all duration-200 hover:bg-gold-500 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isSaving ? 'Saving' : cta}
        </button>
      </div>
    </div>
  );
}

function SectionLabel({
  label,
  help,
  children,
}: {
  label: string;
  help: string | null;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-warm-gray">{label}</div>
      {help && <p className="mt-1 text-sm leading-6 text-warm-gray/85">{help}</p>}
      <div className="mt-3 space-y-2.5">{children}</div>
    </section>
  );
}

function MicroLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5 pt-1">
      <span className="text-xs font-semibold text-charcoal">{children}</span>
      {optional && <span className="text-[10px] uppercase tracking-wide text-warm-gray">optional</span>}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-cream-200" />;
}

interface ChipOption {
  value: string;
  label: string;
}

function ChipChoice({
  options,
  values,
  onChange,
  single = false,
}: {
  options: readonly ChipOption[];
  values: string[];
  onChange: (values: string[]) => void;
  single?: boolean;
}) {
  const valueSet = useMemo(() => new Set(values), [values]);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = valueSet.has(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              if (single) {
                onChange(selected ? [] : [option.value]);
                return;
              }
              if (selected) {
                onChange(values.filter((value) => value !== option.value));
              } else {
                onChange([...values, option.value]);
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
              selected
                ? 'border-navy-200 bg-navy-50 text-navy-700'
                : 'border-cream-200 bg-white text-charcoal hover:border-cream-300 hover:bg-cream-50'
            }`}
          >
            {selected && <Check className="h-3.5 w-3.5 text-navy-600" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ConsentRow({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="rounded-lg border border-cream-200 bg-white p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 cursor-pointer rounded border-cream-200 text-navy-600 focus:ring-navy-400"
        />
        <span className="text-sm text-charcoal">
          I&apos;m okay with Karko using my CV to power the daily job feed.
        </span>
      </label>
    </div>
  );
}

function canSavePreferences(form: JobFeedSettingsInput, hasRecordedConsent: boolean): boolean {
  if (!form.target_countries || form.target_countries.length === 0) return false;
  if (!form.remote_preferences || form.remote_preferences.length === 0) return false;
  if (!hasRecordedConsent && !form.consent_accepted) return false;
  return true;
}

function formatTimeZone(tz: string): string {
  if (!tz) return 'UTC';
  // Render the city portion of the IANA name when possible (e.g.
  // "Europe/Berlin" -> "Berlin"). Falls through gracefully for "UTC".
  const slashIndex = tz.lastIndexOf('/');
  if (slashIndex === -1) return tz;
  return tz.slice(slashIndex + 1).replace(/_/g, ' ');
}

// Defensive default for JobFeedCountryCode — re-exported so consumers can
// type-narrow the country string without importing constants.
export type { JobFeedCountryCode };
