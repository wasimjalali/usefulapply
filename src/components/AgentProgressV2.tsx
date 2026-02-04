'use client';

import { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  Circle, 
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
  Globe,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock,
  Hash,
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
  agent: string;
  actions: string[];
}> = {
  // ANALYSIS - Parse CV and job requirements
  analysis: { 
    icon: Brain, 
    label: 'Parsing CV & Requirements',
    agent: 'Karko AI',
    actions: [
      'Extracting applicant profile from CV',
      'Parsing personal information',
      'Identifying skills and experience',
    ]
  },
  // MATCHING - Skill match analysis
  matching: { 
    icon: Search, 
    label: 'Skill Matching',
    agent: 'Karko AI',
    actions: [
      'Parsing job description requirements',
      'Computing skill match score',
      'Identifying skill gaps',
    ]
  },
  // CV GENERATION - Optimize CV
  cv_generation: { 
    icon: FileText, 
    label: 'Optimizing CV',
    agent: 'Karko AI',
    actions: [
      'Tailoring headline for position',
      'Enhancing experience bullets',
      'Prioritizing relevant skills',
    ]
  },
  // COVER LETTER - Write cover letter
  cover_letter: { 
    icon: Pencil, 
    label: 'Composing Cover Letter',
    agent: 'Karko AI',
    actions: [
      'Crafting personalized opening',
      'Highlighting key qualifications',
      'Writing compelling conclusion',
    ]
  },
  // EMAIL - Generate application email
  email: { 
    icon: Award, 
    label: 'Generating Email',
    agent: 'Karko AI',
    actions: [
      'Writing professional subject line',
      'Composing concise body',
      'Adding call to action',
    ]
  },
  // Legacy step IDs for backward compatibility
  context: { 
    icon: Brain, 
    label: 'Analyzing Documents',
    agent: 'Karko AI',
    actions: [
      'Extracting applicant profile from CV',
      'Parsing job description requirements',
      'Computing skill match analysis',
    ]
  },
  writing: { 
    icon: Pencil, 
    label: 'Generating Documents',
    agent: 'Karko AI',
    actions: [
      'Generating optimized CV',
      'Writing cover letter',
      'Composing application email',
    ]
  },
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
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [currentActionIndex, setCurrentActionIndex] = useState<Record<string, number>>({});
  
  // Auto-expand running steps
  useEffect(() => {
    const runningStep = steps.find(s => s.status === 'running');
    if (runningStep) {
      setExpandedSteps(prev => new Set([...prev, runningStep.id]));
    }
  }, [steps]);

  // Simulate action progress for running steps
  useEffect(() => {
    const runningStep = steps.find(s => s.status === 'running');
    if (!runningStep) return;

    const config = STEP_CONFIG[runningStep.id];
    if (!config) return;

    const interval = setInterval(() => {
      setCurrentActionIndex(prev => {
        const current = prev[runningStep.id] || 0;
        if (current < config.actions.length - 1) {
          return { ...prev, [runningStep.id]: current + 1 };
        }
        return prev;
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [steps]);

  // Reset action index when step completes
  useEffect(() => {
    steps.forEach(step => {
      if (step.status === 'completed') {
        const config = STEP_CONFIG[step.id];
        if (config) {
          setCurrentActionIndex(prev => ({
            ...prev,
            [step.id]: config.actions.length - 1
          }));
        }
      }
    });
  }, [steps]);

  if (steps.length === 0 && !isWorking) return null;

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  return (
    <div className="mb-4">
      {/* Karko AI header */}
      {isWorking && (
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gold-200">
          <Sparkles className="w-4 h-4 text-gold-500" />
          <span className="text-sm font-medium text-navy-700">Karko AI</span>
          {progress && (
            <span className="text-xs text-warm-gray ml-auto">{progress.percent}%</span>
          )}
        </div>
      )}

      {/* Progress message with navy/gold styling */}
      {progress && (
        <div className="flex items-center gap-2 text-sm text-navy-600 mb-3">
          <Loader2 className="w-4 h-4 animate-spin text-gold-500" />
          <span>{progress.message}</span>
        </div>
      )}

      {/* Step list with navy/gold colors */}
      <div className="space-y-2">
        {steps.map((step) => {
          const config = STEP_CONFIG[step.id];
          if (!config) return null;
          const StepIcon = config.icon;
          
          return (
            <div 
              key={step.id} 
              className={`flex items-center gap-3 text-sm py-2 px-3 rounded-lg transition-all ${
                step.status === 'completed' 
                  ? 'bg-gold-50 text-navy-700 border border-gold-200' 
                  : step.status === 'running' 
                    ? 'bg-navy-50 text-navy-700 border border-navy-200' 
                    : step.status === 'error' 
                      ? 'bg-red-50 text-red-600 border border-red-200'
                      : 'bg-cream-50 text-warm-gray border border-cream-200'
              }`}
            >
              {/* Step icon */}
              <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                step.status === 'completed' 
                  ? 'bg-gold-100' 
                  : step.status === 'running' 
                    ? 'bg-navy-100' 
                    : 'bg-cream-100'
              }`}>
                {step.status === 'running' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-navy-600" />
                ) : step.status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-gold-600" />
                ) : step.status === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                ) : (
                  <StepIcon className="w-4 h-4 text-warm-gray" />
                )}
              </div>

              {/* Step label */}
              <span className={`flex-grow ${step.status === 'running' ? 'font-medium' : ''}`}>
                {config.label}
              </span>

              {/* Status indicator */}
              {step.status === 'completed' && (
                <span className="text-xs text-gold-600 font-medium">Done</span>
              )}
              {step.status === 'running' && (
                <span className="text-xs text-navy-500">Processing...</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Company Research Card - THE FIX: Display search results visibly */}
      {companyResearch && (
        <div className="mx-4 my-3 p-4 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-5 h-5 text-blue-600" />
            <h4 className="font-semibold text-blue-900">{companyResearch.name}</h4>
          </div>
          
          {companyResearch.description && (
            <p className="text-sm text-blue-800 mb-3">{companyResearch.description}</p>
          )}
          
          <div className="grid grid-cols-2 gap-3 text-xs">
            {companyResearch.address && (
              <div className="bg-white/60 rounded p-2">
                <span className="font-medium text-blue-700 block mb-1">📍 Address</span>
                <span className="text-blue-900">{companyResearch.address}</span>
              </div>
            )}
            
            {companyResearch.culture && companyResearch.culture.length > 0 && (
              <div className="bg-white/60 rounded p-2">
                <span className="font-medium text-blue-700 block mb-1">🎯 Culture</span>
                <span className="text-blue-900">{companyResearch.culture.slice(0, 2).join(', ')}</span>
              </div>
            )}
            
            {companyResearch.techStack && companyResearch.techStack.length > 0 && (
              <div className="bg-white/60 rounded p-2">
                <span className="font-medium text-blue-700 block mb-1">💻 Tech Stack</span>
                <span className="text-blue-900">{companyResearch.techStack.slice(0, 3).join(', ')}</span>
              </div>
            )}
            
            {companyResearch.recentNews && companyResearch.recentNews.length > 0 && (
              <div className="bg-white/60 rounded p-2">
                <span className="font-medium text-blue-700 block mb-1">📰 Recent News</span>
                <span className="text-blue-900">{companyResearch.recentNews[0]}</span>
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
