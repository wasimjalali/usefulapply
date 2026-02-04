'use client';

import { Sparkles, FileText, Pencil, Award, Loader2, CheckCircle2 } from 'lucide-react';

export type StepType = 'cv' | 'cover_letter' | 'email';

interface KarkoAIStepIndicatorProps {
  stepType: StepType;
  isLoading: boolean;
  isComplete?: boolean;
  message?: string;
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
  message 
}: KarkoAIStepIndicatorProps) {
  const config = STEP_CONFIG[stepType];
  const StepIcon = config.icon;

  if (!isLoading && !isComplete) return null;

  return (
    <div className="flex flex-col items-center justify-center h-full bg-cream-50 p-8">
      <div className="bg-white rounded-xl shadow-sm border border-navy-100 p-8 max-w-md w-full">
        {/* Header with Karko AI branding */}
        <div className="flex items-center gap-2 mb-6 pb-3 border-b border-gold-200">
          <div className="p-1.5 bg-gradient-to-br from-navy-600 to-navy-700 rounded-full">
            <Sparkles className="w-4 h-4 text-gold-400" />
          </div>
          <span className="text-sm font-medium text-navy-700">Karko AI</span>
        </div>

        {/* Step indicator */}
        <div className={`flex items-center gap-4 p-4 rounded-lg transition-all ${
          isComplete 
            ? 'bg-gold-50 border border-gold-200' 
            : 'bg-navy-50 border border-navy-200'
        }`}>
          {/* Icon */}
          <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
            isComplete ? 'bg-gold-100' : 'bg-navy-100'
          }`}>
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-navy-600" />
            ) : isComplete ? (
              <CheckCircle2 className="w-6 h-6 text-gold-600" />
            ) : (
              <StepIcon className="w-6 h-6 text-navy-600" />
            )}
          </div>

          {/* Text */}
          <div className="flex-grow">
            <h3 className={`text-base font-semibold ${
              isComplete ? 'text-gold-700' : 'text-navy-700'
            }`}>
              {config.title}
            </h3>
            <p className="text-sm text-warm-gray mt-0.5">
              {message || (isComplete ? config.completeMessage : config.loadingMessage)}
            </p>
          </div>

          {/* Status */}
          <div className="flex-shrink-0">
            {isLoading && (
              <span className="text-xs text-navy-500 font-medium">Processing...</span>
            )}
            {isComplete && (
              <span className="text-xs text-gold-600 font-medium">Done</span>
            )}
          </div>
        </div>

        {/* Progress dots for loading state */}
        {isLoading && (
          <div className="flex items-center justify-center gap-1.5 mt-6">
            <div className="w-2 h-2 rounded-full bg-gold-400 animate-pulse" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 rounded-full bg-gold-500 animate-pulse" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 rounded-full bg-gold-400 animate-pulse" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>
    </div>
  );
}
