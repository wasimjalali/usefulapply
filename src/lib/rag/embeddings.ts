/**
 * Embeddings Service
 * Generates vector embeddings using Google's Gemini Embedding model
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini client for embeddings
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

// Embedding model configuration
// gemini-embedding-001 supports dimensions: 128-3072, recommended: 768, 1536, 3072
const EMBEDDING_MODEL = 'text-embedding-004'; // Using text-embedding-004 which is available
export const EMBEDDING_DIMENSION = 768; // Using recommended dimension for balance of quality/size

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  
  const result = await model.embedContent(text);
  
  return result.embedding.values;
}

/**
 * Generate embeddings for multiple texts (batch)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  
  // Gemini supports batch embeddings
  const result = await model.batchEmbedContents({
    requests: texts.map(text => ({
      content: { parts: [{ text }], role: 'user' },
    })),
  });
  
  return result.embeddings.map(emb => emb.values);
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  
  if (magnitude === 0) return 0;
  
  return dotProduct / magnitude;
}

/**
 * Find most similar items from a list using cosine similarity
 */
export function findMostSimilar(
  queryEmbedding: number[],
  candidates: Array<{ id: string; embedding: number[]; metadata?: Record<string, unknown> }>,
  topK: number = 10,
  threshold: number = 0.5
): Array<{ id: string; score: number; metadata?: Record<string, unknown> }> {
  const scored = candidates.map(candidate => ({
    id: candidate.id,
    score: cosineSimilarity(queryEmbedding, candidate.embedding),
    metadata: candidate.metadata,
  }));
  
  return scored
    .filter(item => item.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Check if Gemini API is configured for embeddings
 */
export function isEmbeddingsConfigured(): boolean {
  return !!process.env.GOOGLE_AI_API_KEY;
}
