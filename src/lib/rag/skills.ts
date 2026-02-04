/**
 * Skill Taxonomy and Semantic Matching
 * Provides semantic skill matching using vector embeddings
 */

import { generateEmbedding, generateEmbeddings, cosineSimilarity } from './embeddings';
import { querySkillVectors, upsertSkillVectors, isPineconeConfigured } from './pinecone';

// Skill categories for organization
export type SkillCategory = 
  | 'programming_languages'
  | 'frameworks'
  | 'databases'
  | 'cloud_platforms'
  | 'devops'
  | 'data_science'
  | 'soft_skills'
  | 'management'
  | 'design'
  | 'marketing'
  | 'finance'
  | 'other';

// Skill node structure
export interface SkillNode {
  id: string;
  name: string;
  category: SkillCategory;
  synonyms: string[];
  relatedSkills: string[];
  level?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  demandScore?: number; // 0-1, how in-demand this skill is
}

// Skill match result
export interface SkillMatchResult {
  matchingSkills: Array<{
    cvSkill: string;
    jobSkill: string;
    score: number;
    isExactMatch: boolean;
  }>;
  missingSkills: string[];
  suggestedSkills: string[]; // Skills from master CV that could be added
  overallMatchScore: number;
}

// Built-in skill synonyms for common tech skills
// This provides immediate matching without needing Pinecone
export const SKILL_SYNONYMS: Record<string, string[]> = {
  'javascript': ['js', 'ecmascript', 'es6', 'es2015', 'vanilla js'],
  'typescript': ['ts'],
  'python': ['py', 'python3', 'python 3'],
  'react': ['reactjs', 'react.js', 'react js'],
  'vue': ['vuejs', 'vue.js', 'vue js', 'vue 3'],
  'angular': ['angularjs', 'angular.js', 'angular 2+'],
  'node': ['nodejs', 'node.js', 'node js'],
  'express': ['expressjs', 'express.js'],
  'next': ['nextjs', 'next.js'],
  'postgresql': ['postgres', 'psql', 'pg'],
  'mongodb': ['mongo'],
  'mysql': ['mariadb'],
  'aws': ['amazon web services', 'amazon aws'],
  'gcp': ['google cloud', 'google cloud platform'],
  'azure': ['microsoft azure', 'ms azure'],
  'docker': ['containerization', 'containers'],
  'kubernetes': ['k8s', 'kube'],
  'ci/cd': ['cicd', 'continuous integration', 'continuous deployment', 'devops pipeline'],
  'machine learning': ['ml', 'deep learning', 'ai', 'artificial intelligence'],
  'data analysis': ['data analytics', 'business intelligence', 'bi'],
  'agile': ['scrum', 'kanban', 'agile methodology'],
  'project management': ['pm', 'program management'],
  'communication': ['verbal communication', 'written communication', 'interpersonal skills'],
  'leadership': ['team leadership', 'people management', 'team management'],
  'problem solving': ['problem-solving', 'analytical thinking', 'critical thinking'],
};

// Related skills mapping (skill A is related to skill B)
export const RELATED_SKILLS: Record<string, string[]> = {
  'javascript': ['typescript', 'react', 'vue', 'angular', 'node', 'html', 'css'],
  'typescript': ['javascript', 'react', 'angular', 'node'],
  'python': ['django', 'flask', 'fastapi', 'pandas', 'numpy', 'machine learning'],
  'react': ['javascript', 'typescript', 'redux', 'next', 'html', 'css'],
  'node': ['javascript', 'express', 'typescript', 'mongodb', 'postgresql'],
  'aws': ['cloud computing', 'devops', 'docker', 'kubernetes', 'terraform'],
  'docker': ['kubernetes', 'devops', 'ci/cd', 'containerization'],
  'postgresql': ['sql', 'databases', 'data modeling'],
  'machine learning': ['python', 'tensorflow', 'pytorch', 'data science', 'statistics'],
  'data science': ['python', 'machine learning', 'statistics', 'sql', 'visualization'],
};

/**
 * Normalize a skill name for comparison
 */
export function normalizeSkill(skill: string): string {
  return skill
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s\/\+\#\.]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Check if two skills match (exact or synonym)
 */
export function skillsMatch(skill1: string, skill2: string): boolean {
  const norm1 = normalizeSkill(skill1);
  const norm2 = normalizeSkill(skill2);
  
  // Exact match
  if (norm1 === norm2) return true;
  
  // Check synonyms
  for (const [canonical, synonyms] of Object.entries(SKILL_SYNONYMS)) {
    const allVariants = [canonical, ...synonyms].map(normalizeSkill);
    if (allVariants.includes(norm1) && allVariants.includes(norm2)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Find matching skills between CV and job requirements
 * Uses both exact matching and semantic similarity
 */
export async function findMatchingSkills(
  cvSkills: string[],
  jobSkills: string[],
  masterCVSkills?: string[]
): Promise<SkillMatchResult> {
  const matchingSkills: SkillMatchResult['matchingSkills'] = [];
  const matchedJobSkills = new Set<string>();
  const matchedCVSkills = new Set<string>();
  
  // Step 1: Exact and synonym matching (fast, no API calls)
  for (const cvSkill of cvSkills) {
    for (const jobSkill of jobSkills) {
      if (matchedJobSkills.has(jobSkill)) continue;
      
      if (skillsMatch(cvSkill, jobSkill)) {
        matchingSkills.push({
          cvSkill,
          jobSkill,
          score: 1.0,
          isExactMatch: normalizeSkill(cvSkill) === normalizeSkill(jobSkill),
        });
        matchedJobSkills.add(jobSkill);
        matchedCVSkills.add(cvSkill);
        break;
      }
    }
  }
  
  // Step 2: Semantic matching for remaining skills (uses embeddings)
  const unmatchedJobSkills = jobSkills.filter(s => !matchedJobSkills.has(s));
  const unmatchedCVSkills = cvSkills.filter(s => !matchedCVSkills.has(s));
  
  if (unmatchedJobSkills.length > 0 && unmatchedCVSkills.length > 0) {
    try {
      // Generate embeddings for unmatched skills
      const [jobEmbeddings, cvEmbeddings] = await Promise.all([
        generateEmbeddings(unmatchedJobSkills),
        generateEmbeddings(unmatchedCVSkills),
      ]);
      
      // Find semantic matches
      for (let i = 0; i < unmatchedJobSkills.length; i++) {
        const jobSkill = unmatchedJobSkills[i];
        const jobEmb = jobEmbeddings[i];
        
        let bestMatch = { cvSkill: '', score: 0 };
        
        for (let j = 0; j < unmatchedCVSkills.length; j++) {
          const cvSkill = unmatchedCVSkills[j];
          if (matchedCVSkills.has(cvSkill)) continue;
          
          const cvEmb = cvEmbeddings[j];
          const score = cosineSimilarity(jobEmb, cvEmb);
          
          if (score > bestMatch.score && score >= 0.55) {
            bestMatch = { cvSkill, score };
          }
        }
        
        if (bestMatch.cvSkill && bestMatch.score >= 0.55) {
          matchingSkills.push({
            cvSkill: bestMatch.cvSkill,
            jobSkill,
            score: bestMatch.score,
            isExactMatch: false,
          });
          matchedJobSkills.add(jobSkill);
          matchedCVSkills.add(bestMatch.cvSkill);
        }
      }
    } catch (error) {
      console.error('Semantic matching failed, using exact matching only:', error);
    }
  }
  
  // Step 3: Identify missing skills
  const missingSkills = jobSkills.filter(s => !matchedJobSkills.has(s));
  
  // Step 4: Find suggested skills from master CV
  const suggestedSkills: string[] = [];
  if (masterCVSkills && missingSkills.length > 0) {
    for (const masterSkill of masterCVSkills) {
      // Skip if already in CV
      if (cvSkills.some(s => skillsMatch(s, masterSkill))) continue;
      
      // Check if it matches any missing skill
      for (const missingSkill of missingSkills) {
        if (skillsMatch(masterSkill, missingSkill)) {
          suggestedSkills.push(masterSkill);
          break;
        }
        
        // Check related skills
        const relatedToMissing = RELATED_SKILLS[normalizeSkill(missingSkill)] || [];
        if (relatedToMissing.some(r => skillsMatch(r, masterSkill))) {
          suggestedSkills.push(masterSkill);
          break;
        }
      }
    }
  }
  
  // Calculate overall match score
  const overallMatchScore = jobSkills.length > 0
    ? (matchingSkills.length / jobSkills.length) * 100
    : 0;
  
  // Limit results to focus on core skills (5-10 max each)
  // Sort by score for matching skills, prioritize highest matches
  const sortedMatchingSkills = matchingSkills
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  
  // Limit missing skills to most important ones (max 5)
  const limitedMissingSkills = missingSkills.slice(0, 5);
  
  return {
    matchingSkills: sortedMatchingSkills,
    missingSkills: limitedMissingSkills,
    suggestedSkills: [...new Set(suggestedSkills)].slice(0, 5),
    overallMatchScore: Math.round(overallMatchScore),
  };
}

/**
 * Extract skills from text using AI
 * This is a helper that will be used by the agent
 */
export function extractSkillsFromText(text: string): string[] {
  // Simple extraction based on common patterns
  // The actual extraction should be done by the AI model
  const skillPatterns = [
    /(?:proficient|experienced|skilled|expert|knowledge)\s+(?:in|with)\s+([^,.\n]+)/gi,
    /(?:skills?|technologies?|tools?):\s*([^.\n]+)/gi,
  ];
  
  const skills: string[] = [];
  
  for (const pattern of skillPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const skillList = match[1].split(/[,;]/).map(s => s.trim()).filter(s => s.length > 0);
      skills.push(...skillList);
    }
  }
  
  return [...new Set(skills)];
}

/**
 * Get related skills for a given skill
 */
export function getRelatedSkills(skill: string): string[] {
  const normalized = normalizeSkill(skill);
  return RELATED_SKILLS[normalized] || [];
}

/**
 * Check if RAG system is fully configured
 */
export function isRAGConfigured(): boolean {
  return isPineconeConfigured();
}
