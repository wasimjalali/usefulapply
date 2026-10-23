'use client';

import React from 'react';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Brain,
  Pencil,
  Search,
  RefreshCw,
  Zap,
  FileText,
  Award,
  Building2,
} from 'lucide-react';

interface AgentV2Step {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  agent?: string;
  result?: unknown;
  error?: string;
  tokens?: { input: number; output: number };
}

interface AgentV2Progress {
  percent: number;
  message: string;
}

interface AgentV2Reflection {
  iteration: number;
  status: 'started' | 'completed';
  improved?: boolean;
}

// Company research data from tool_usage event
interface CompanyResearchData {
  name: string;
  description: string;
  address: string;
  culture: string[];
  values: string[];
  techStack: string[];
  recentNews: string[];
}

interface AgentProgressV2Props {
  steps: AgentV2Step[];
  progress: AgentV2Progress | null;
  reflection: AgentV2Reflection | null;
  isWorking: boolean;
  companyResearch?: CompanyResearchData | null;  // NEW: Company research data
}

// Useful Apply Unified Agent Step Configuration
const STEP_CONFIG: Record<string, {
  icon: React.ElementType;
  label: string;
  runningSubtitle: string;
}> = {
  analysis: { icon: Brain, label: 'Parsing CV & Requirements', runningSubtitle: 'Extracting your profile and reading the job description...' },
  matching: { icon: Search, label: 'Skill Matching', runningSubtitle: 'Comparing your skills against the role requirements...' },
  cv_generation: { icon: FileText, label: 'Optimizing CV', runningSubtitle: 'Tailoring your experience and skills to the role...' },
  cover_letter: { icon: Pencil, label: 'Composing Cover Letter', runningSubtitle: 'Writing a personalized cover letter for this position...' },
  fit_assessment: { icon: Zap, label: 'Assessing Job Fit', runningSubtitle: 'Scoring your fit and identifying strengths and gaps...' },
  email: { icon: Award, label: 'Writing Application Email', runningSubtitle: 'Drafting your application email...' },
  follow_up: { icon: Award, label: 'Writing Follow-Up Email', runningSubtitle: 'Drafting the follow-up you send a few days later...' },
  // Legacy step IDs
  context: { icon: Brain, label: 'Analyzing Documents', runningSubtitle: 'Reading and understanding your documents...' },
  writing: { icon: Pencil, label: 'Generating Documents', runningSubtitle: 'Generating your application materials...' },
};

export function AgentProgressV2({ 
  steps, 
  progress, 
  reflection, 
  isWorking,
  companyResearch,
}: AgentProgressV2Props) {
  if (steps.length === 0 && !isWorking) return null;

  return (
    <div className="mb-4">
      {/* Progress header. The chat row already carries the Useful Apply icon
          beside this card, so the header is the bar alone: full width, and at
          0% until the first progress event, so the card never shifts when it
          arrives. */}
      {isWorking && (
        <div className="flex items-center gap-2.5 mb-3 pb-2 border-b border-gold-200/60">
          <div className="h-1 flex-1 rounded-full bg-cream-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-500 transition-all duration-500 ease-out"
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
          </div>
          <span className="text-[11px] text-warm-gray font-medium tabular-nums">{progress?.percent ?? 0}%</span>
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
                      ? 'bg-cream-50 border border-cream-200'
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
                    <AlertCircle className="w-3.5 h-3.5 text-warm-gray" />
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
                {step.status === 'error' && (
                  <span className="text-[11px] text-warm-gray font-semibold">Couldn&apos;t finish</span>
                )}
              </div>

              {/* Per-step subtitle shown while running */}
              {step.status === 'running' && config.runningSubtitle && (
                <div className="px-3 pb-2.5 pl-[52px]">
                  <p className="text-[12px] text-warm-gray">
                    {config.runningSubtitle}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Company Research Card */}
      {companyResearch && (
        <div className="mt-3 p-4 rounded-2xl border border-navy-200 bg-gradient-to-br from-navy-50 to-cream-50">
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
