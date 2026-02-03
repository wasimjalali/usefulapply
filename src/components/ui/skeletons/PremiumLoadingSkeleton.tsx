'use client';

import { Loader2, Sparkles, Brain } from 'lucide-react';

interface PremiumLoadingSkeletonProps {
  type?: 'cv' | 'email' | 'coverletter';
  message?: string;
}

export function PremiumLoadingSkeleton({ type = 'cv', message }: PremiumLoadingSkeletonProps) {
  const getLoadingMessage = () => {
    if (message) return message;
    
    switch (type) {
      case 'cv':
        return 'Optimizing your CV with AI...';
      case 'email':
        return 'Crafting your application email...';
      case 'coverletter':
        return 'Writing your cover letter...';
      default:
        return 'AI agents are working...';
    }
  };

  const getAgentSteps = () => {
    switch (type) {
      case 'cv':
        return [
          { label: 'Analyzing job requirements', delay: 0 },
          { label: 'Matching your skills', delay: 800 },
          { label: 'Optimizing content', delay: 1600 },
          { label: 'Finalizing CV', delay: 2400 },
        ];
      case 'email':
        return [
          { label: 'Understanding context', delay: 0 },
          { label: 'Crafting subject line', delay: 600 },
          { label: 'Writing email body', delay: 1200 },
          { label: 'Polishing message', delay: 1800 },
        ];
      case 'coverletter':
        return [
          { label: 'Analyzing requirements', delay: 0 },
          { label: 'Structuring letter', delay: 700 },
          { label: 'Writing content', delay: 1400 },
          { label: 'Finalizing letter', delay: 2100 },
        ];
      default:
        return [
          { label: 'Processing', delay: 0 },
          { label: 'Analyzing', delay: 500 },
          { label: 'Generating', delay: 1000 },
        ];
    }
  };

  const steps = getAgentSteps();

  return (
    <div className="w-full h-full bg-gradient-to-br from-cream-50 to-white p-8 flex flex-col items-center justify-center">
      {/* Main Loading Animation */}
      <div className="relative mb-8">
        {/* Outer rotating ring */}
        <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-amber-200 border-t-amber-500 animate-spin"></div>
        
        {/* Middle pulsing circle */}
        <div className="absolute inset-2 w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 animate-pulse"></div>
        
        {/* Inner icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-white animate-pulse" />
        </div>
      </div>

      {/* Loading Message */}
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold text-charcoal mb-2">
          {getLoadingMessage()}
        </h3>
        <p className="text-sm text-warm-gray">
          Our AI agents are perfecting your document
        </p>
      </div>

      {/* Agent Steps Progress */}
      <div className="w-full max-w-md space-y-3">
        {steps.map((step, index) => (
          <div
            key={index}
            className="flex items-center gap-3 opacity-0 animate-fade-in"
            style={{
              animationDelay: `${step.delay}ms`,
              animationFillMode: 'forwards',
            }}
          >
            {/* Step Icon */}
            <div className="relative">
              {index === steps.findIndex(s => s.delay === Math.max(...steps.filter(s => s.delay <= Date.now() % 3000).map(d => d.delay))) ? (
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center">
                  <Loader2 className="w-3 h-3 text-white animate-spin" />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-amber-200"></div>
              )}
            </div>
            
            {/* Step Label */}
            <span className={`text-sm ${
              index === steps.findIndex(s => s.delay === Math.max(...steps.filter(s => s.delay <= Date.now() % 3000).map(d => d.delay)))
                ? 'text-amber-600 font-medium'
                : 'text-warm-gray'
            }`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Bottom decoration */}
      <div className="mt-8 flex items-center gap-2">
        <Brain className="w-4 h-4 text-amber-500 animate-pulse" />
        <span className="text-xs text-warm-gray">Powered by Karko AI</span>
      </div>
    </div>
  );
}
