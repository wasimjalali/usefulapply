'use client';

import { Check } from 'lucide-react';

const STEPS = ['Your CV', 'The job', 'Your fit', 'Your kit'] as const;

interface GuidedStepperProps {
  activeIndex: number;
}

export function GuidedStepper({ activeIndex }: GuidedStepperProps) {
  return (
    <div className="flex items-center justify-center gap-0" aria-label="Application steps">
      {STEPS.map((label, index) => {
        const done = index < activeIndex;
        const on = index === activeIndex;
        return (
          <div key={label} className="flex items-center">
            <div className="flex items-center gap-2.5">
              {done ? (
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-pill bg-accent text-accent-ink">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
              ) : on ? (
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-pill bg-brand text-[13px] font-semibold text-brand-ink">
                  {index + 1}
                </span>
              ) : (
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-pill border-[1.5px] border-border text-[13px] font-semibold text-ink-muted">
                  {index + 1}
                </span>
              )}
              <span
                className={`text-sm ${
                  on ? 'font-semibold text-ink' : done ? 'font-medium text-ink-body' : 'font-medium text-ink-muted'
                }`}
              >
                {label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <span
                className={`mx-4 h-[1.5px] w-16 ${done ? 'bg-accent' : 'bg-sunken'}`}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
