'use client';

import type { ReactNode } from 'react';

export interface DecisionChip {
  id: string;
  label: string;
  cost?: string;
  variant: 'primary' | 'secondary';
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}

interface DecisionChipsProps {
  chips: DecisionChip[];
  hint?: string;
}

export function DecisionChips({ chips, hint }: DecisionChipsProps) {
  return (
    <div className="flex flex-col gap-2">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={chip.onSelect}
          disabled={chip.disabled}
          className={`inline-flex h-11 w-fit max-w-full items-center gap-2 rounded-pill px-[18px] text-sm font-semibold transition-colors duration-(--duration-base) focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
            chip.variant === 'primary'
              ? 'bg-accent text-accent-ink hover:bg-accent-strong disabled:bg-sunken disabled:text-ink-muted'
              : 'border border-border bg-surface text-ink shadow-resting hover:bg-surface-raised disabled:opacity-50'
          } ${chip.disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {chip.icon}
          <span>{chip.label}</span>
          {chip.cost ? <span className="font-medium opacity-85">· {chip.cost}</span> : null}
        </button>
      ))}
      {hint ? <p className="text-sm text-ink-muted">{hint}</p> : null}
    </div>
  );
}
