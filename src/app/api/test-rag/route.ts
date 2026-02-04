/**
 * API Route: Test RAG System
 * Tests Pinecone connection and skill matching
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  isPineconeConfigured, 
  isEmbeddingsConfigured,
  findMatchingSkills,
  skillsMatch,
  getIndexStats,
} from '@/lib/rag';

export async function GET(request: NextRequest) {
  const results: {
    pinecone: { configured: boolean; stats?: { totalVectors: number } };
    embeddings: { configured: boolean };
    skillMatching: { success: boolean; result?: unknown; error?: string };
  } = {
    pinecone: { configured: false },
    embeddings: { configured: false },
    skillMatching: { success: false },
  };

  // Check Pinecone configuration
  results.pinecone.configured = isPineconeConfigured();
  
  if (results.pinecone.configured) {
    try {
      const stats = await getIndexStats();
      results.pinecone.stats = { totalVectors: stats.totalVectors };
    } catch (error) {
      // Index might not exist yet, that's okay
      results.pinecone.stats = { totalVectors: 0 };
    }
  }

  // Check embeddings configuration
  results.embeddings.configured = isEmbeddingsConfigured();

  // Test skill matching (uses built-in synonyms, no API calls needed)
  try {
    const testCVSkills = ['JavaScript', 'React', 'Node.js', 'PostgreSQL', 'AWS'];
    const testJobSkills = ['TypeScript', 'ReactJS', 'NodeJS', 'SQL', 'Cloud Computing'];
    
    const matchResult = await findMatchingSkills(testCVSkills, testJobSkills);
    
    results.skillMatching = {
      success: true,
      result: {
        cvSkills: testCVSkills,
        jobSkills: testJobSkills,
        matchingSkills: matchResult.matchingSkills,
        missingSkills: matchResult.missingSkills,
        overallMatchScore: matchResult.overallMatchScore,
      },
    };
  } catch (error) {
    results.skillMatching = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Test individual skill matching
  const synonymTests = [
    { skill1: 'JavaScript', skill2: 'JS', expected: true },
    { skill1: 'React', skill2: 'ReactJS', expected: true },
    { skill1: 'Node', skill2: 'NodeJS', expected: true },
    { skill1: 'Python', skill2: 'Java', expected: false },
  ];

  const synonymResults = synonymTests.map(test => ({
    ...test,
    actual: skillsMatch(test.skill1, test.skill2),
    passed: skillsMatch(test.skill1, test.skill2) === test.expected,
  }));

  return NextResponse.json({
    status: results.pinecone.configured && results.embeddings.configured ? 'configured' : 'partial',
    timestamp: new Date().toISOString(),
    results,
    synonymTests: {
      passed: synonymResults.filter(r => r.passed).length,
      total: synonymResults.length,
      details: synonymResults,
    },
    summary: {
      pinecone: results.pinecone.configured ? '✅' : '⚠️ Not configured',
      embeddings: results.embeddings.configured ? '✅' : '⚠️ Not configured',
      skillMatching: results.skillMatching.success ? '✅' : '❌',
    },
  });
}
