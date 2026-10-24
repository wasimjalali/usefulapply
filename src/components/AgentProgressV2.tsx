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
        <div className="flex items-center gap-2.5 mb-3 pb-2 border-b border-border-accent-soft/60">
          <div className="h-1 flex-1 rounded-pill bg-sunken overflow-hidden">
            <div
              className="h-full rounded-pill bg-accent transition-all duration-(--duration-slow) ease-standard"
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
          </div>
          <span className="text-[11px] text-ink-muted font-medium tabular-nums">{progress?.percent ?? 0}%</span>
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
              className={`rounded-control transition-all duration-(--duration-base) agent-step-enter ${
                step.status === 'completed'
                  ? 'bg-accent-soft/80 border border-border-accent-soft/80 step-complete-pulse'
                  : step.status === 'running'
                    ? 'bg-surface-raised border border-border-strong shadow-resting'
                    : step.status === 'error'
                      ? 'bg-surface border border-border'
                      : 'bg-surface border border-border'
              }`}
            >
              <div className="flex items-center gap-3 text-sm py-2.5 px-3">
                {/* Step icon */}
                <div className={`flex-shrink-0 w-7 h-7 rounded-pill flex items-center justify-center transition-all duration-(--duration-base) ${
                  step.status === 'completed'
                    ? 'bg-accent-soft-strong'
                    : step.status === 'running'
                      ? 'bg-accent-soft'
                      : 'bg-canvas'
                }`}>
                  {step.status === 'running' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-strong" />
                  ) : step.status === 'completed' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-ink-accent" />
                  ) : step.status === 'error' ? (
                    <AlertCircle className="w-3.5 h-3.5 text-ink-muted" />
                  ) : (
                    <StepIcon className="w-3.5 h-3.5 text-ink-muted/60" />
                  )}
                </div>

                {/* Step label */}
                <span className={`flex-grow text-[13px] ${
                  step.status === 'running' ? 'font-semibold text-ink' :
                  step.status === 'completed' ? 'font-medium text-brand-strong' :
                  'text-ink-muted'
                }`}>
                  {config.label}
                </span>

                {/* Status badge */}
                {step.status === 'completed' && (
                  <span className="text-[11px] text-ink-accent font-semibold">Done</span>
                )}
                {step.status === 'running' && (
                  <span className="text-[11px] text-accent-strong font-medium">Active</span>
                )}
                {step.status === 'error' && (
                  <span className="text-[11px] text-ink-muted font-semibold">Couldn&apos;t finish</span>
                )}
              </div>

              {/* Per-step subtitle shown while running */}
              {step.status === 'running' && config.runningSubtitle && (
                <div className="px-3 pb-2.5 pl-[52px]">
                  <p className="text-[12px] text-ink-muted">
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
        <div className="mt-3 p-4 rounded-card border border-border-brand-soft bg-surface">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-control bg-brand-soft-strong flex items-center justify-center">
              <Building2 className="w-4 h-4 text-brand" />
            </div>
            <h4 className="font-semibold text-ink text-sm">{companyResearch.name}</h4>
          </div>
          
          {companyResearch.description && (
            <p className="text-xs text-brand-strong mb-3 leading-relaxed">{companyResearch.description}</p>
          )}
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            {companyResearch.address && (
              <div className="bg-surface-raised rounded-control p-2.5">
                <span className="font-medium text-brand block mb-1">📍 Address</span>
                <span className="text-ink-body">{companyResearch.address}</span>
              </div>
            )}
            
            {companyResearch.culture && companyResearch.culture.length > 0 && (
              <div className="bg-surface-raised rounded-control p-2.5">
                <span className="font-medium text-brand block mb-1">🎯 Culture</span>
                <span className="text-ink-body">{companyResearch.culture.slice(0, 2).join(', ')}</span>
              </div>
            )}
            
            {companyResearch.techStack && companyResearch.techStack.length > 0 && (
              <div className="bg-surface-raised rounded-control p-2.5">
                <span className="font-medium text-brand block mb-1">💻 Tech Stack</span>
                <span className="text-ink-body">{companyResearch.techStack.slice(0, 3).join(', ')}</span>
              </div>
            )}
            
            {companyResearch.recentNews && companyResearch.recentNews.length > 0 && (
              <div className="bg-surface-raised rounded-control p-2.5">
                <span className="font-medium text-brand block mb-1">📰 Recent News</span>
                <span className="text-ink-body">{companyResearch.recentNews[0]}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reflection indicator */}
      {reflection && (
        <div className={`px-4 py-2 border-t flex items-center gap-2 text-xs ${
          reflection.status === 'started' 
            ? 'bg-info-soft border-border-info-soft text-info-ink' 
            : 'bg-done-soft border-border-done-soft text-done-ink'
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
