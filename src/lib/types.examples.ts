// Example usage of the new TypeScript types

import {
  ParsedCV,
  MasterCV,
  JobRequirements,
  GapAnalysis,
  GeneratedCV,
  GeneratedCoverLetter,
  GeneratedEmail,
  AnalyzeRequest,
  AnalyzeResponse,
  GenerateCVRequest,
  GenerateCVResponse,
  GenerateCoverLetterRequest,
  GenerateCoverLetterResponse,
} from '@/lib/types';

// ============================================
// EXAMPLE: Parsing a CV
// ============================================

const parsedCV: ParsedCV = {
  rawText: '...',
  sections: {
    contactInfo: 'John Doe\njohn@example.com',
    summary: 'Experienced software developer...',
    experience: '...',
    education: '...',
    skills: 'JavaScript, TypeScript, React',
  },
  fileName: 'john_doe_cv.pdf',
  fileType: 'pdf',
};

// ============================================
// EXAMPLE: Job Analysis
// ============================================

const jobRequirements: JobRequirements = {
  title: 'Senior Frontend Developer',
  company: 'Tech Corp',
  hardSkills: ['React', 'TypeScript', 'Next.js', 'Tailwind CSS'],
  softSkills: ['Communication', 'Team Leadership', 'Problem Solving'],
  experienceLevel: '5+ years',
  keywords: ['frontend', 'react', 'typescript', 'agile'],
  responsibilities: [
    'Lead frontend development',
    'Mentor junior developers',
    'Collaborate with design team',
  ],
  niceToHave: ['GraphQL', 'AWS', 'Testing frameworks'],
};

const gapAnalysis: GapAnalysis = {
  matchingSkills: ['React', 'TypeScript', 'Next.js'],
  missingSkills: ['Tailwind CSS', 'GraphQL'],
  matchingExperience: ['Frontend development', 'Team collaboration'],
  missingExperience: ['Team leadership'],
  matchScore: 85,
  suggestions: [
    'Add Tailwind CSS experience to skills section',
    'Highlight leadership experience',
    'Emphasize React expertise',
  ],
};

// ============================================
// EXAMPLE: API Request/Response
// ============================================

// Analyze endpoint
const analyzeRequest: AnalyzeRequest = {
  jobDescription: 'Full job posting text...',
  currentCV: parsedCV.rawText,
};

const analyzeResponse: AnalyzeResponse = {
  requirements: jobRequirements,
  gaps: gapAnalysis,
  success: true,
};

// Generate CV endpoint
const generateCVRequest: GenerateCVRequest = {
  currentCV: parsedCV.rawText,
  requirements: jobRequirements,
  gaps: gapAnalysis,
};

const generateCVResponse: GenerateCVResponse = {
  generatedCV: {
    content: 'Tailored CV content...',
    changes: [
      {
        section: 'Skills',
        original: 'JavaScript, React',
        updated: 'React (5+ years), TypeScript, Next.js',
        reason: 'Emphasized required skills and experience level',
      },
    ],
    optimizedFor: 'Senior Frontend Developer',
  },
  success: true,
};

// ============================================
// EXAMPLE: Using the Store
// ============================================

import { useAppStore } from '@/store/useAppStore';

function ExampleComponent() {
  const {
    currentCV,
    jobDescription,
    requirements,
    gaps,
    isAnalyzing,
    setCurrentCV,
    setJobDescription,
    setIsAnalyzing,
    setRequirements,
    setGaps,
  } = useAppStore();

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobDescription,
          currentCV: currentCV?.rawText,
        } as AnalyzeRequest),
      });

      const data: AnalyzeResponse = await response.json();
      
      if (data.success) {
        setRequirements(data.requirements);
        setGaps(data.gaps);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  return null; // Component JSX
}

export {};
