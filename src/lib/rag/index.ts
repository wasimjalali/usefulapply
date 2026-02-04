/**
 * RAG System Index
 * Exports all RAG-related functionality
 */

// Export from pinecone (excluding EMBEDDING_DIMENSION to avoid conflict)
export {
  pinecone,
  INDICES,
  getSkillsIndex,
  isPineconeConfigured,
  listIndices,
  skillsIndexExists,
  upsertSkillVectors,
  querySkillVectors,
  deleteSkillVectors,
  getIndexStats,
} from './pinecone';

// Export from embeddings (this has the canonical EMBEDDING_DIMENSION)
export {
  generateEmbedding,
  generateEmbeddings,
  cosineSimilarity,
  findMostSimilar,
  isEmbeddingsConfigured,
  EMBEDDING_DIMENSION,
} from './embeddings';

// Export from skills
export {
  type SkillCategory,
  type SkillNode,
  type SkillMatchResult,
  SKILL_SYNONYMS,
  RELATED_SKILLS,
  normalizeSkill,
  skillsMatch,
  findMatchingSkills,
  extractSkillsFromText,
  getRelatedSkills,
  isRAGConfigured,
} from './skills';
