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

// 3-Agent Architecture Step Configuration
const STEP_CONFIG: Record<string, { 
  icon: React.ElementType; 
  label: string;
  agent: string;
  actions: string[];
}> = {
  // CONTEXT AGENT - Gathers all information
  context: { 
    icon: Brain, 
    label: 'Context Agent',
    agent: 'Context Agent',
    actions: [
      'Extracting applicant profile from CV',
      'Parsing job description requirements',
      'Researching company information',
      'Computing skill match analysis',
    ]
  },
  // WRITER AGENT - Generates all documents
  writing: { 
    icon: Pencil, 
    label: 'Writer Agent',
    agent: 'Writer Agent',
    actions: [
      'Generating optimized CV',
      'Writing cover letter',
      'Composing application email',
    ]
  },
  // Legacy step IDs for backward compatibility
  research: { 
    icon: Globe, 
    label: 'Company Research',
    agent: 'Context Agent',
    actions: [
      'Searching company overview',
      'Finding company culture & values',
      'Discovering tech stack',
      'Fetching recent news',
    ]
  },
  analyze: { 
    icon: Search, 
    label: 'Analysis',
    agent: 'Context Agent',
    actions: [
      'Parsing job requirements',
      'Extracting skills from CV',
      'Computing skill gaps',
    ]
  },
  write: { 
    icon: Pencil, 
    label: 'Content Generation',
    agent: 'Writer Agent',
    actions: [
      'Generating professional summary',
      'Optimizing headline',
      'Enhancing experience bullets',
      'Selecting core skills',
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

  const totalTokens = tokenUsage?.totalTokens || 0;

  return (
    <div className="mb-4">
      {/* Simple progress message */}
      {progress && (
        <div className="flex items-center gap-2 text-sm text-neutral-600 mb-2">
          <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
          <span>{progress.message}</span>
        </div>
      )}

      {/* Simple step list */}
      <div className="space-y-1">
        {steps.map((step) => {
          const config = STEP_CONFIG[step.id];
          if (!config) return null;
          
          return (
            <div 
              key={step.id} 
              className={`flex items-center gap-2 text-sm py-1 ${
                step.status === 'completed' ? 'text-emerald-600' : 
                step.status === 'running' ? 'text-amber-600' : 
                step.status === 'error' ? 'text-red-500' :
                'text-neutral-400'
              }`}
            >
              {step.status === 'running' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
              ) : step.status === 'completed' ? (
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              ) : step.status === 'error' ? (
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 flex-shrink-0" />
              )}
              <span className={step.status === 'running' ? 'font-medium' : ''}>
                {config.label}
              </span>
              {step.status === 'completed' && (
                <span className="text-xs text-neutral-400 ml-auto">✓</span>
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

      {/* Token usage footer */}
      {tokenUsage && tokenUsage.totalTokens > 0 && (
        <div className="px-4 py-2 border-t border-neutral-100 bg-neutral-50/30 flex items-center justify-between text-xs text-neutral-500">
          <div className="flex items-center gap-3">
            <span>Input: {tokenUsage.inputTokens.toLocaleString()}</span>
            <span>Output: {tokenUsage.outputTokens.toLocaleString()}</span>
          </div>
          <span className="font-medium text-neutral-600">
            Total: {tokenUsage.totalTokens.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
