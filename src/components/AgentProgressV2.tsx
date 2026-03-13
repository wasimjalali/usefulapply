'use client';

import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Sparkles,
  Brain,
  Pencil,
  Search,
  RefreshCw,
  Zap,
  FileText,
  Award,
  Building2,
} from 'lucide-react';
import type { AgentV2Step, AgentV2Progress, AgentV2Reflection, CompanyResearchData } from '@/hooks/useAgentV2';

interface AgentProgressV2Props {
  steps: AgentV2Step[];
  progress: AgentV2Progress | null;
  reflection: AgentV2Reflection | null;
  models: { analysis: string; writing: string } | null;
  isWorking: boolean;
  companyResearch?: CompanyResearchData | null;  // NEW: Company research data
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  actions?: ActionDetail[];
}

export interface ActionDetail {
  id: string;
  stepId: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  duration?: number;
  tokens?: { input: number; output: number };
}

// Karko AI Unified Agent Step Configuration
const STEP_CONFIG: Record<string, {
  icon: React.ElementType;
  label: string;
}> = {
  analysis: { icon: Brain, label: 'Parsing CV & Requirements' },
  matching: { icon: Search, label: 'Skill Matching' },
  cv_generation: { icon: FileText, label: 'Optimizing CV' },
  cover_letter: { icon: Pencil, label: 'Composing Cover Letter' },
  fit_assessment: { icon: Zap, label: 'Assessing Job Fit' },
  email: { icon: Award, label: 'Generating Emails' },
  // Legacy step IDs
  context: { icon: Brain, label: 'Analyzing Documents' },
  writing: { icon: Pencil, label: 'Generating Documents' },
};

export function AgentProgressV2({ 
  steps, 
  progress, 
  reflection, 
  models,
  isWorking,
  companyResearch,
  tokenUsage,
  actions = [],
}: AgentProgressV2Props) {
  // Track the previous progress message to trigger fade animation on change
  const [displayMessage, setDisplayMessage] = useState<string>('');
  const [messageKey, setMessageKey] = useState(0);

  useEffect(() => {
    if (progress?.message && progress.message !== displayMessage && progress.message !== 'Complete!') {
      setDisplayMessage(progress.message);
      setMessageKey(prev => prev + 1);
    }
  }, [progress?.message, displayMessage]);

  if (steps.length === 0 && !isWorking) return null;

  return (
    <div className="mb-4">
      {/* Karko AI header */}
      {isWorking && (
        <div className="flex items-center gap-2.5 mb-3 pb-2 border-b border-gold-200/60">
          <Sparkles className="w-4 h-4 text-gold-500" />
          <span className="text-sm font-semibold text-navy-700 tracking-tight">Karko AI</span>
          {progress && (
            <div className="ml-auto flex items-center gap-2">
              <div className="w-16 h-1 rounded-full bg-cream-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-500 transition-all duration-500 ease-out"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <span className="text-[11px] text-warm-gray font-medium tabular-nums">{progress.percent}%</span>
            </div>
          )}
        </div>
      )}

      {/* Step list */}
      <div className="space-y-2">
        {steps.map((step) => {
          const config = STEP_CONFIG[step.id];
          if (!config) return null;
          const StepIcon = config.icon;

          return (
            <div
              key={step.id}
              className={`rounded-lg transition-all duration-300 agent-step-enter ${
                step.status === 'completed'
                  ? 'bg-gold-50/80 border border-gold-200/80 step-complete-pulse'
                  : step.status === 'running'
                    ? 'bg-white border border-cream-300 shadow-sm'
                    : step.status === 'error'
                      ? 'bg-red-50 border border-red-200'
                      : 'bg-cream-50/60 border border-cream-200/60'
              }`}
            >
              <div className="flex items-center gap-3 text-sm py-2.5 px-3">
                {/* Step icon */}
                <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 ${
                  step.status === 'completed'
                    ? 'bg-gold-100'
                    : step.status === 'running'
                      ? 'bg-gold-50'
                      : 'bg-cream-100'
                }`}>
                  {step.status === 'running' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-gold-500" />
                  ) : step.status === 'completed' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-gold-600" />
                  ) : step.status === 'error' ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                  ) : (
                    <StepIcon className="w-3.5 h-3.5 text-warm-gray/60" />
                  )}
                </div>

                {/* Step label */}
                <span className={`flex-grow text-[13px] ${
                  step.status === 'running' ? 'font-semibold text-navy-800' :
                  step.status === 'completed' ? 'font-medium text-navy-700' :
                  'text-warm-gray'
                }`}>
                  {config.label}
                </span>

                {/* Status badge */}
                {step.status === 'completed' && (
                  <span className="text-[11px] text-gold-600 font-semibold">Done</span>
                )}
                {step.status === 'running' && (
                  <span className="text-[11px] text-gold-500 font-medium">Active</span>
                )}
              </div>

              {/* Live progress message — only for running step */}
              {step.status === 'running' && displayMessage && (
                <div className="px-3 pb-2.5 pl-[52px]">
                  <p key={messageKey} className="text-[12px] text-warm-gray action-text-cycle">
                    {displayMessage}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Company Research Card */}
      {companyResearch && (
        <div className="mt-3 p-4 rounded-xl border border-navy-200 bg-gradient-to-br from-navy-50 to-cream-50">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-navy-100 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-navy-600" />
            </div>
            <h4 className="font-semibold text-navy-800 text-sm">{companyResearch.name}</h4>
          </div>
          
          {companyResearch.description && (
            <p className="text-xs text-navy-700 mb-3 leading-relaxed">{companyResearch.description}</p>
          )}
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            {companyResearch.address && (
              <div className="bg-white/70 rounded-lg p-2.5">
                <span className="font-medium text-navy-600 block mb-1">📍 Address</span>
                <span className="text-charcoal">{companyResearch.address}</span>
              </div>
            )}
            
            {companyResearch.culture && companyResearch.culture.length > 0 && (
              <div className="bg-white/70 rounded-lg p-2.5">
                <span className="font-medium text-navy-600 block mb-1">🎯 Culture</span>
                <span className="text-charcoal">{companyResearch.culture.slice(0, 2).join(', ')}</span>
              </div>
            )}
            
            {companyResearch.techStack && companyResearch.techStack.length > 0 && (
              <div className="bg-white/70 rounded-lg p-2.5">
                <span className="font-medium text-navy-600 block mb-1">💻 Tech Stack</span>
                <span className="text-charcoal">{companyResearch.techStack.slice(0, 3).join(', ')}</span>
              </div>
            )}
            
            {companyResearch.recentNews && companyResearch.recentNews.length > 0 && (
              <div className="bg-white/70 rounded-lg p-2.5">
                <span className="font-medium text-navy-600 block mb-1">📰 Recent News</span>
                <span className="text-charcoal">{companyResearch.recentNews[0]}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reflection indicator */}
      {reflection && (
        <div className={`px-4 py-2 border-t flex items-center gap-2 text-xs ${
          reflection.status === 'started' 
            ? 'bg-violet-50 border-violet-100 text-violet-700' 
            : 'bg-emerald-50 border-emerald-100 text-emerald-700'
        }`}>
          <RefreshCw className={`w-3 h-3 ${
            reflection.status === 'started' ? 'animate-spin' : ''
          }`} />
          <span>
            {reflection.status === 'started' 
              ? `Refining (iteration ${reflection.iteration})`
              : `Refined ${reflection.iteration}x`
            }
          </span>
        </div>
      )}
    </div>
  );
}
