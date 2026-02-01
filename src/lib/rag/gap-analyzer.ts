/**
 * Enhanced Gap Analyzer
 * Uses RAG-based semantic skill matching for better accuracy
 */

import { callModel, parseModelJSON } from '@/lib/models';
import { findMatchingSkills, type SkillMatchResult } from './skills';

export interface EnhancedGapAnalysis {
  matchScore: number;
  skillAnalysis: SkillMatchResult;
  experienceGaps: string[];
  experienceMatches: string[];
  suggestions: string[];
  keywordDensity: number;
  missingKeywords: string[];
  strengthAreas: string[];
}

export interface ExtractedSkills {
  hardSkills: string[];
  softSkills: string[];
  tools: string[];
  certifications: string[];
}

/**
 * Extract CORE skills from job description using AI
 * Focus on 5-10 most important/required skills, not every skill mentioned
 */
export async function extractJobSkills(jobDescription: string): Promise<ExtractedSkills> {
  const response = await callModel({
    task: 'extract_skills',
    prompt: `Extract ONLY the CORE required skills from this job description.

IMPORTANT: Focus on the 5-10 MOST IMPORTANT skills that are explicitly required or heavily emphasized.
Do NOT include every skill mentioned - only the core requirements that a candidate MUST have.

Job Description:
${jobDescription}

Return JSON with:
{
  "hardSkills": ["skill1", "skill2"],  // MAX 5 core technical skills
  "softSkills": ["skill1", "skill2"],  // MAX 3 core soft skills
  "tools": ["tool1", "tool2"],         // MAX 3 essential tools
  "certifications": ["cert1"]          // Only if explicitly required
}

Rules:
- hardSkills: Only include skills that are REQUIRED or MUST-HAVE (max 5)
- softSkills: Only include if explicitly emphasized (max 3)
- tools: Only specific tools that are essential (max 3)
- certifications: Only if explicitly required, not "nice to have"
- Total skills should be 5-10, not more`,
    systemPrompt: 'You are an expert at identifying CORE requirements from job descriptions. Focus on quality over quantity - only the most critical skills. Return only valid JSON.',
    jsonMode: true,
  });

  return parseModelJSON<ExtractedSkills>(response.content);
}

/**
 * Extract skills from CV using AI
 */
export async function extractCVSkills(cvText: string): Promise<ExtractedSkills> {
  const response = await callModel({
    task: 'extract_skills',
    prompt: `Extract all skills, tools, and certifications from this CV/resume.

CV:
${cvText}

Return JSON with:
{
  "hardSkills": ["skill1", "skill2"],
  "softSkills": ["skill1", "skill2"],
  "tools": ["tool1", "tool2"],
  "certifications": ["cert1", "cert2"]
}

Include everything mentioned - programming languages, frameworks, methodologies, soft skills, and certifications.`,
    systemPrompt: 'You are an expert at extracting skills from CVs and resumes. Return only valid JSON.',
    jsonMode: true,
  });

  return parseModelJSON<ExtractedSkills>(response.content);
}

/**
 * Perform enhanced gap analysis using RAG-based skill matching
 */
export async function analyzeGapsWithRAG(
  jobDescription: string,
  cvText: string,
  masterCVText?: string
): Promise<EnhancedGapAnalysis> {
  // Step 1: Extract skills from job description and CV in parallel
  const [jobSkills, cvSkills, masterCVSkills] = await Promise.all([
    extractJobSkills(jobDescription),
    extractCVSkills(cvText),
    masterCVText ? extractCVSkills(masterCVText) : Promise.resolve(null),
  ]);

  // Combine all job skills
  const allJobSkills = [
    ...jobSkills.hardSkills,
    ...jobSkills.softSkills,
    ...jobSkills.tools,
  ];

  // Combine all CV skills
  const allCVSkills = [
    ...cvSkills.hardSkills,
    ...cvSkills.softSkills,
    ...cvSkills.tools,
  ];

  // Combine master CV skills if available
  const allMasterCVSkills = masterCVSkills ? [
    ...masterCVSkills.hardSkills,
    ...masterCVSkills.softSkills,
    ...masterCVSkills.tools,
  ] : undefined;

  // Step 2: Use RAG-based semantic skill matching
  const skillAnalysis = await findMatchingSkills(
    allCVSkills,
    allJobSkills,
    allMasterCVSkills
  );

  // Step 3: Analyze experience gaps using AI
  const experienceAnalysis = await callModel({
    task: 'gap_analysis',
    prompt: `Compare this CV against the job requirements and identify experience gaps and matches.

Job Description:
${jobDescription}

CV:
${cvText}

Skills Already Matched: ${skillAnalysis.matchingSkills.map(m => m.jobSkill).join(', ')}
Skills Missing: ${skillAnalysis.missingSkills.join(', ')}

Return JSON with:
{
  "experienceGaps": ["gap1", "gap2"],
  "experienceMatches": ["match1", "match2"],
  "suggestions": ["suggestion1", "suggestion2"],
  "strengthAreas": ["strength1", "strength2"],
  "missingKeywords": ["keyword1", "keyword2"]
}

Focus on:
- Years of experience requirements vs CV
- Specific project types or domains
- Leadership/management experience
- Industry-specific experience
- Keywords that should be added to the CV`,
    systemPrompt: 'You are an expert career advisor analyzing CV fit for job applications. Return only valid JSON.',
    jsonMode: true,
  });

  const expAnalysis = parseModelJSON<{
    experienceGaps: string[];
    experienceMatches: string[];
    suggestions: string[];
    strengthAreas: string[];
    missingKeywords: string[];
  }>(experienceAnalysis.content);

  // Calculate keyword density
  const cvLower = cvText.toLowerCase();
  const matchedKeywords = allJobSkills.filter(skill => 
    cvLower.includes(skill.toLowerCase())
  );
  const keywordDensity = allJobSkills.length > 0 
    ? (matchedKeywords.length / allJobSkills.length) * 100 
    : 0;

  // Calculate a more comprehensive match score
  // Components:
  // 1. Skill match (40% weight) - from semantic matching
  // 2. Keyword presence (30% weight) - skills mentioned in CV text
  // 3. Experience match (20% weight) - based on experience matches vs gaps
  // 4. Certification bonus (10% weight) - if certifications match
  
  const skillMatchScore = skillAnalysis.overallMatchScore;
  const keywordScore = keywordDensity;
  
  // Experience score: ratio of matches to total (matches + gaps)
  const totalExpItems = expAnalysis.experienceMatches.length + expAnalysis.experienceGaps.length;
  const experienceScore = totalExpItems > 0 
    ? (expAnalysis.experienceMatches.length / totalExpItems) * 100 
    : 50; // Default to 50% if no experience data
  
  // Certification score: check if any job certifications are in CV
  const certScore = jobSkills.certifications.length > 0
    ? (cvSkills.certifications.filter(c => 
        jobSkills.certifications.some(jc => 
          c.toLowerCase().includes(jc.toLowerCase()) || 
          jc.toLowerCase().includes(c.toLowerCase())
        )
      ).length / jobSkills.certifications.length) * 100
    : 100; // Full score if no certs required
  
  // Weighted average
  const comprehensiveMatchScore = Math.round(
    (skillMatchScore * 0.4) +
    (keywordScore * 0.3) +
    (experienceScore * 0.2) +
    (certScore * 0.1)
  );
  
  // Ensure score is between 0 and 100
  const finalMatchScore = Math.min(100, Math.max(0, comprehensiveMatchScore));

  return {
    matchScore: finalMatchScore,
    skillAnalysis,
    experienceGaps: expAnalysis.experienceGaps,
    experienceMatches: expAnalysis.experienceMatches,
    suggestions: [
      ...expAnalysis.suggestions,
      ...skillAnalysis.suggestedSkills.map(s => `Add "${s}" from your master CV`),
    ],
    keywordDensity: Math.round(keywordDensity),
    missingKeywords: expAnalysis.missingKeywords,
    strengthAreas: expAnalysis.strengthAreas,
  };
}

/**
 * Quick skill match check (no AI calls, uses built-in synonyms only)
 */
export async function quickSkillMatch(
  cvSkills: string[],
  jobSkills: string[]
): Promise<{
  matchScore: number;
  matchingSkills: string[];
  missingSkills: string[];
}> {
  const result = await findMatchingSkills(cvSkills, jobSkills);
  
  return {
    matchScore: result.overallMatchScore,
    matchingSkills: result.matchingSkills.map(m => m.jobSkill),
    missingSkills: result.missingSkills,
  };
}
