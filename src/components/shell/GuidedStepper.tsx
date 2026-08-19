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
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gold-400 text-white">
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
              ) : on ? (
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-navy-600 text-[13px] font-semibold text-white">
                  {index + 1}
                </span>
              ) : (
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-cream-200 text-[13px] font-semibold text-warm-gray">
                  {index + 1}
                </span>
              )}
              <span
                className={`text-sm ${
                  on ? 'font-semibold text-navy-800' : done ? 'font-medium text-charcoal' : 'font-medium text-warm-gray'
                }`}
              >
                {label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <span
                className={`mx-4 h-[1.5px] w-16 ${done ? 'bg-gold-400' : 'bg-cream-200'}`}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
