/**
 * Embeddings Module - Phase 3
 *
 * Provides vector embeddings and hybrid retrieval for fighter context.
 *
 * Components:
 * - Embedding Service: Generate and manage fighter profile embeddings
 * - Hybrid Retrieval: Combine vector + BM25 search with RRF
 * - Time Decay: Weight recent information more heavily
 * - Prediction Context: Integrated context for AI predictions
 */

// Embedding Service
export {
  generateFighterProfileText,
  generateEmbedding,
  generateEmbeddingsBatch,
  updateFighterEmbeddings,
  getQueryEmbedding,
} from './embeddingService'

// Hybrid Retrieval
export {
  hybridFighterSearch,
  findSimilarFighters,
  getContextWithTimeDecay,
  getEnrichedFighterContext,
  getMatchupContext,
  storeContextChunk,
  cleanupExpiredChunks,
  formatContextForPrompt,
  calculateTimeDecay,
  TIME_DECAY_HALF_LIVES,
  type HybridSearchResult,
  type ContextChunkResult,
  type EnrichedFighterContext,
} from './hybridRetrieval'

// Prediction Context Service
export {
  getPredictionContext,
  getBatchPredictionContexts,
  getContextBudget,
  type PredictionContext,
  type ContextConfig,
} from './predictionContextService'
