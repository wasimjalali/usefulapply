'use client';

import type { ReactNode } from 'react';

export function PaneHeading({ children }: { children: ReactNode }) {
  return (
    <h2 id="settings-pane-heading" className="font-serif text-[26px] font-semibold leading-tight text-navy-900">
      {children}
    </h2>
  );
}

export function Caption({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 mt-6 text-[11px] font-semibold tracking-[0.1em] text-warm-gray">{children}</p>
  );
}

/** A grouped block of rows: cream-50 surface, cream-200 hairlines between rows. */
export function RowGroup({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-cream-200 overflow-hidden rounded-2xl border border-cream-200 bg-cream-50">
      {children}
    </div>
  );
}

export function Row({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-4 px-5 py-3.5">
      <div className="min-w-0">
        <p className="text-sm text-charcoal">{label}</p>
        {hint ? <p className="mt-0.5 text-xs text-warm-gray">{hint}</p> : null}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function ValueText({ children }: { children: ReactNode }) {
  return <span className="text-sm text-charcoal">{children}</span>;
}

export function LinkButton({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-sm font-semibold text-navy-600 transition-colors duration-200 hover:text-navy-800 disabled:cursor-not-allowed disabled:text-warm-gray cursor-pointer"
    >
      {children}
    </button>
  );
}

export function OutlineButton({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-cream-200 bg-cream-50 px-4 text-sm font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-cream-100 disabled:cursor-not-allowed disabled:text-warm-gray cursor-pointer"
    >
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer ${
        checked ? 'bg-gold-400' : 'bg-cream-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 max-w-[260px] rounded-lg border border-cream-200 bg-cream-50 px-3 text-sm text-charcoal shadow-sm focus:border-navy-500 focus:outline-none cursor-pointer"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
