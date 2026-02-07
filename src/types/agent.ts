/**
 * Agent Types - Shared type definitions for Karko AI agent system
 * Centralized types for agent workflow, progress tracking, and results
 */

export interface AgentStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  agent?: string;
  result?: unknown;
  error?: string;
  tokens?: { input: number; output: number };
}

export interface AgentProgress {
  percent: number;
  message: string;
}

export interface AgentReflection {
  iteration: number;
  status: 'started' | 'completed';
  improved?: boolean;
}

export interface AgentEvaluation {
  score: number;
  passed: boolean;
  improvements: string[];
}

export interface ActionDetail {
  id: string;
  stepId: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  duration?: number;
  tokens?: { input: number; output: number };
}

export interface CompanyResearchData {
  name: string;
  description: string;
  address: string;
  culture: string[];
  values: string[];
  techStack: string[];
  recentNews: string[];
}

export interface OptimizedCVData {
  personal: {
    fullName: string;
    email: string;
    phone?: string;
    currentTitle?: string;
    address?: string;
    city?: string;
    country?: string;
    linkedIn?: string;
    website?: string;
    github?: string;
    driverLicense?: string;
  };
  summary?: string;
  experience: Array<{
    id: string;
    company: string;
    position: string;
    location?: string;
    startDate: string;
    endDate?: string;
    current?: boolean;
    bullets: string[];
    technologies?: string[];
  }>;
  education: Array<{
    id: string;
    institution: string;
    degree: string;
    field?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    grade?: string;
    highlights?: string[];
  }>;
  skills: Array<{
    category: string;
    items: string[];
  }>;
  languages: Array<{
    language: string;
    proficiency: string;
  }>;
  certifications: Array<{
    id: string;
    name: string;
    issuer: string;
    date?: string;
  }>;
  analysis?: {
    summary: string;
    key_changes: string[];
    ats_compatibility: number;
    missing_keywords_added: string[];
  };
  sectionHeaders?: {
    summary?: string;
    skills?: string;
    experience?: string;
    education?: string;
    certifications?: string;
    languages?: string;
    contact?: string;
    additionalInfo?: string;
  };
  localizedStrings?: {
    present?: string;
    gradePrefix?: string;
    degreeConnector?: string;
    photoPlaceholder?: string;
  };
  additionalInfo?: string[];
}

export interface AgentResult {
  requirements?: {
    title: string;
    company: string;
    requiredSkills: string[];
    preferredSkills: string[];
    keywords: string[];
  };
  gaps?: {
    matchScore: number;
    matchingSkills: Array<{ cvSkill: string; jobSkill: string; score: number }>;
    missingSkills: string[];
    suggestions: string[];
  };
  generatedCV?: {
    summary: string;
    headline: string;
    experience: Array<{ company: string; title: string; bullets: string[] }>;
    skills: string[];
    matchScore: number;
  };
  evaluation?: AgentEvaluation;
  companyResearch?: CompanyResearchData;
  optimizedCVData?: OptimizedCVData;
  coverLetter?: string;
  email?: string;
  globalContext?: unknown;
}

export interface AgentWorkflowOptions {
  enableReflection?: boolean;
  action?: 'full_optimization' | 'analyze_only' | 'generate_cv' | 'generate_cover_letter' | 'generate_email';
  emailType?: 'application' | 'followup' | 'thankyou';
}

export interface TokenUsage {
  input: number;
  output: number;
  total?: number;
}

export interface StepConfig {
  icon: React.ElementType;
  label: string;
  agent: string;
  actions: string[];
}
