'use client';

import { FileText, Pencil, Award, Loader2, CheckCircle2 } from 'lucide-react';
import { BrandIcon } from '@/components/BrandLogo';

export type StepType = 'cv' | 'cover_letter' | 'email';

interface StepIndicatorProps {
  stepType: StepType;
  isLoading: boolean;
  isComplete?: boolean;
  title?: string;
  message?: string;
  statusLabel?: string;
}

const STEP_CONFIG = {
  cv: {
    icon: FileText,
    title: 'Optimizing CV',
    loadingMessage: 'Useful Apply is tailoring your CV for maximum impact...',
    completeMessage: 'CV optimization complete!',
  },
  cover_letter: {
    icon: Pencil,
    title: 'Composing Cover Letter',
    loadingMessage: 'Useful Apply is crafting a personalized cover letter...',
    completeMessage: 'Cover letter ready!',
  },
  email: {
    icon: Award,
    title: 'Generating Email',
    loadingMessage: 'Useful Apply is composing your application email...',
    completeMessage: 'Application email ready!',
  },
};

export function StepIndicator({
  stepType,
  isLoading,
  isComplete = false,
  title,
  message,
  statusLabel,
}: StepIndicatorProps) {
  const config = STEP_CONFIG[stepType];

  if (!isLoading && !isComplete) return null;

  return (
    <div className="flex flex-col items-center justify-center h-full bg-surface p-8">
      <div className="bg-surface-raised rounded-card shadow-resting border border-border-brand-faint/60 p-8 max-w-md w-full">
        {/* Header with Useful Apply branding */}
        <div className="flex items-center gap-2.5 mb-6 pb-3 border-b border-border-accent-soft/60">
          <BrandIcon size="xs" theme="light" />
          {isLoading && (
            <span className="ml-auto text-[11px] text-ink-accent font-medium">{statusLabel || 'Processing...'}</span>
          )}
        </div>

        {/* Step indicator card */}
        <div className={`p-5 rounded-card transition-all duration-(--duration-base) ${
          isComplete
            ? 'bg-accent-soft border border-border-accent-soft step-complete-pulse'
            : 'bg-surface border border-border'
        }`}>
          <div className="flex items-center gap-4">
            {/* Icon circle */}
            <div className={`flex-shrink-0 w-11 h-11 rounded-pill flex items-center justify-center transition-all duration-(--duration-base) ${
              isComplete ? 'bg-accent-soft-strong' : 'bg-surface-raised shadow-resting'
            }`}>
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-accent-strong" />
              ) : isComplete ? (
                <CheckCircle2 className="w-5 h-5 text-ink-accent" />
              ) : (
                <Loader2 className="w-5 h-5 text-ink-muted" />
              )}
            </div>

            {/* Text */}
            <div className="flex-grow min-w-0">
              <h3 className={`text-[15px] font-semibold tracking-tight ${
                isComplete ? 'text-accent-soft-ink' : 'text-ink'
              }`}>
                {title || config.title}
              </h3>
              <p className="text-[13px] text-ink-muted mt-0.5 leading-snug">
                {message || (isComplete ? config.completeMessage : config.loadingMessage)}
              </p>
            </div>
          </div>
        </div>

        {/* Premium shimmer progress bar */}
        {isLoading && (
          <div className="mt-5">
            <div className="h-[3px] w-full rounded-pill bg-sunken shimmer-bar" />
          </div>
        )}

        {/* Completion checkmark */}
        {isComplete && (
          <div className="flex items-center justify-center mt-5">
            <span className="text-xs text-ink-accent font-semibold tracking-wide uppercase">Complete</span>
          </div>
        )}
      </div>
    </div>
  );
}
