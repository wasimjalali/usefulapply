'use client';

import { Plus, X } from 'lucide-react';
import { JOB_FEED_COUNTRY_OPTIONS } from '@/lib/job-feed/constants';
import type { ConfirmedSearchQuery } from '@/lib/job-feed/search-plan';
import { countryLabel } from './feed-format';

interface SearchPlanEditorProps {
  rows: ConfirmedSearchQuery[];
  countries: string[];
  cap: number;
  onChange: (rows: ConfirmedSearchQuery[]) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function SearchPlanEditor({
  rows,
  countries,
  cap,
  onChange,
  disabled = false,
  compact = false,
}: SearchPlanEditorProps) {
  const countryChoices = countryChoicesFor(countries, rows);

  const updateRow = (index: number, patch: Partial<ConfirmedSearchQuery>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    if (rows.length >= cap || disabled) return;
    onChange([
      ...rows,
      {
        query: '',
        targetCountry: countryChoices[0] ?? 'us',
        cityHint: null,
      },
    ]);
  };

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div
          key={`${row.targetCountry}-${index}`}
          className={`flex flex-wrap items-center gap-2 ${
            compact ? '' : 'rounded-card border border-border bg-surface-raised px-3 py-2.5 shadow-resting'
          }`}
        >
          <input
            type="text"
            value={row.query}
            disabled={disabled}
            onChange={(event) => updateRow(index, { query: event.target.value })}
            placeholder="Role keyword"
            aria-label={`Search ${index + 1} role`}
            className="h-10 min-w-[12rem] flex-1 rounded-control border border-border bg-surface-raised px-3 text-sm text-ink-body outline-none transition-colors duration-(--duration-fast) placeholder:text-ink-muted focus:border-brand-strong focus:ring-2 focus:ring-brand-strong/15 disabled:cursor-not-allowed"
          />
          <select
            value={row.targetCountry}
            disabled={disabled}
            onChange={(event) => updateRow(index, { targetCountry: event.target.value })}
            aria-label={`Search ${index + 1} country`}
            className="h-10 rounded-control border border-border bg-surface-raised px-3 text-sm text-ink-body outline-none transition-colors duration-(--duration-fast) focus:border-brand-strong focus:ring-2 focus:ring-brand-strong/15 disabled:cursor-not-allowed"
          >
            {countryChoices.map((code) => (
              <option key={code} value={code}>{countryLabel(code)}</option>
            ))}
          </select>
          {row.cityHint ? (
            <p className="text-xs text-ink-muted">{row.cityHint}</p>
          ) : null}
          <button
            type="button"
            disabled={disabled || rows.length <= 1}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            aria-label={`Remove search ${index + 1}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-pill text-ink-muted transition-colors duration-(--duration-fast) hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {rows.length < cap && (
        <button
          type="button"
          disabled={disabled}
          onClick={addRow}
          className="inline-flex h-10 items-center gap-1.5 rounded-pill border border-border bg-surface px-3.5 text-sm font-semibold text-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          Add a search
        </button>
      )}
    </div>
  );
}

function countryChoicesFor(selected: string[], rows: ConfirmedSearchQuery[]): string[] {
  const codes = [...selected.map((code) => code.toLowerCase()), ...rows.map((row) => row.targetCountry.toLowerCase())];
  const allowed = new Set<string>(JOB_FEED_COUNTRY_OPTIONS.map((option) => option.value));
  const unique: string[] = [];
  for (const code of codes) {
    if (!allowed.has(code) || unique.includes(code)) continue;
    unique.push(code);
  }
  return unique.length > 0 ? unique : ['us'];
}
