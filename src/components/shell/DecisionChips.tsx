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
          className={`inline-flex h-11 w-fit max-w-full items-center gap-2 rounded-full px-[18px] text-sm font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/50 ${
            chip.variant === 'primary'
              ? 'bg-gold-400 text-white hover:bg-gold-500 disabled:bg-cream-200 disabled:text-warm-gray'
              : 'border border-cream-200 bg-cream-50 text-navy-800 shadow-sm hover:bg-white disabled:opacity-50'
          } ${chip.disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {chip.icon}
          <span>{chip.label}</span>
          {chip.cost ? <span className="font-medium opacity-85">· {chip.cost}</span> : null}
        </button>
      ))}
      {hint ? <p className="text-sm text-warm-gray">{hint}</p> : null}
    </div>
  );
}
