/**
 * Pinecone Vector Database Client
 * Handles vector storage and retrieval for semantic skill matching
 */

import { Pinecone } from '@pinecone-database/pinecone';

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY || '',
});

// Index names
export const INDICES = {
  SKILLS: 'job-copilot-skills',
} as const;

// Embedding dimensions (Gemini text-embedding-004 = 768)
export const EMBEDDING_DIMENSION = 768;

/**
 * Get or create the skills index
 */
export async function getSkillsIndex() {
  return pinecone.index(INDICES.SKILLS);
}

/**
 * Check if Pinecone is configured
 */
export function isPineconeConfigured(): boolean {
  return !!process.env.PINECONE_API_KEY;
}

/**
 * List all available indices
 */
export async function listIndices(): Promise<string[]> {
  try {
    const response = await pinecone.listIndexes();
    return response.indexes?.map(idx => idx.name) || [];
  } catch (error) {
    console.error('Failed to list Pinecone indices:', error);
    return [];
  }
}

/**
 * Check if skills index exists
 */
export async function skillsIndexExists(): Promise<boolean> {
  const indices = await listIndices();
  return indices.includes(INDICES.SKILLS);
}

/**
 * Upsert vectors to the skills index
 */
export async function upsertSkillVectors(
  vectors: Array<{
    id: string;
    values: number[];
    metadata: Record<string, string | number | boolean | string[]>;
  }>
): Promise<void> {
  const index = await getSkillsIndex();
  
  // Upsert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);
    await index.upsert(batch);
  }
}

/**
 * Query the skills index for similar vectors
 */
export async function querySkillVectors(
  queryVector: number[],
  topK: number = 20,
  filter?: Record<string, string | number | boolean>
): Promise<Array<{
  id: string;
  score: number;
  metadata: Record<string, string | number | boolean | string[]>;
}>> {
  const index = await getSkillsIndex();
  
  const response = await index.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
    ...(filter && { filter }),
  });
  
  return response.matches?.map(match => ({
    id: match.id,
    score: match.score || 0,
    metadata: (match.metadata as Record<string, string | number | boolean | string[]>) || {},
  })) || [];
}

/**
 * Delete vectors by ID
 */
export async function deleteSkillVectors(ids: string[]): Promise<void> {
  const index = await getSkillsIndex();
  await index.deleteMany(ids);
}

/**
 * Get index statistics
 */
export async function getIndexStats(): Promise<{
  totalVectors: number;
  dimension: number;
}> {
  try {
    const index = await getSkillsIndex();
    const stats = await index.describeIndexStats();
    
    return {
      totalVectors: stats.totalRecordCount || 0,
      dimension: stats.dimension || EMBEDDING_DIMENSION,
    };
  } catch (error) {
    console.error('Failed to get index stats:', error);
    return {
      totalVectors: 0,
      dimension: EMBEDDING_DIMENSION,
    };
  }
}

export { pinecone };
