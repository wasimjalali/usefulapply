'use client';

import { Sparkles, FileText, Pencil, Award, Loader2, CheckCircle2 } from 'lucide-react';

export type StepType = 'cv' | 'cover_letter' | 'email';

interface KarkoAIStepIndicatorProps {
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
    loadingMessage: 'Karko AI is tailoring your CV for maximum impact...',
    completeMessage: 'CV optimization complete!',
  },
  cover_letter: {
    icon: Pencil,
    title: 'Composing Cover Letter',
    loadingMessage: 'Karko AI is crafting a personalized cover letter...',
    completeMessage: 'Cover letter ready!',
  },
  email: {
    icon: Award,
    title: 'Generating Email',
    loadingMessage: 'Karko AI is composing your application email...',
    completeMessage: 'Application email ready!',
  },
};

export function KarkoAIStepIndicator({
  stepType,
  isLoading,
  isComplete = false,
  title,
  message,
  statusLabel,
}: KarkoAIStepIndicatorProps) {
  const config = STEP_CONFIG[stepType];

  if (!isLoading && !isComplete) return null;

  return (
    <div className="flex flex-col items-center justify-center h-full bg-cream-50 p-8">
      <div className="bg-white rounded-2xl shadow-md border border-navy-100/60 p-8 max-w-md w-full">
        {/* Header with Karko AI branding */}
        <div className="flex items-center gap-2.5 mb-6 pb-3 border-b border-gold-200/60">
          <div className="p-1.5 bg-gradient-to-br from-navy-600 to-navy-700 rounded-full shadow-sm">
            <Sparkles className="w-4 h-4 text-gold-400" />
          </div>
          <span className="text-sm font-semibold text-navy-700 tracking-tight">Karko AI</span>
          {isLoading && (
            <span className="ml-auto text-[11px] text-gold-600 font-medium">{statusLabel || 'Processing...'}</span>
          )}
        </div>

        {/* Step indicator card */}
        <div className={`p-5 rounded-xl transition-all duration-300 ${
          isComplete
            ? 'bg-gold-50 border border-gold-200 step-complete-pulse'
            : 'bg-gradient-to-br from-cream-50 to-cream-100 border border-cream-300/80'
        }`}>
          <div className="flex items-center gap-4">
            {/* Icon circle */}
            <div className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 ${
              isComplete ? 'bg-gold-100' : 'bg-white shadow-sm'
            }`}>
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-gold-500" />
              ) : isComplete ? (
                <CheckCircle2 className="w-5 h-5 text-gold-600" />
              ) : (
                <Loader2 className="w-5 h-5 text-warm-gray" />
              )}
            </div>

            {/* Text */}
            <div className="flex-grow min-w-0">
              <h3 className={`text-[15px] font-semibold tracking-tight ${
                isComplete ? 'text-gold-700' : 'text-navy-800'
              }`}>
                {title || config.title}
              </h3>
              <p className="text-[13px] text-warm-gray mt-0.5 leading-snug">
                {message || (isComplete ? config.completeMessage : config.loadingMessage)}
              </p>
            </div>
          </div>
        </div>

        {/* Premium shimmer progress bar */}
        {isLoading && (
          <div className="mt-5">
            <div className="h-[3px] w-full rounded-full bg-cream-200 shimmer-bar" />
          </div>
        )}

        {/* Completion checkmark */}
        {isComplete && (
          <div className="flex items-center justify-center mt-5">
            <span className="text-xs text-gold-600 font-semibold tracking-wide uppercase">Complete</span>
          </div>
        )}
      </div>
    </div>
  );
}
