/**
 * Hybrid Retrieval Service - Phase 3
 *
 * Implements hybrid search combining:
 * - Dense vector search (semantic similarity via embeddings)
 * - Sparse BM25 search (keyword matching via PostgreSQL full-text search)
 * - Reciprocal Rank Fusion (RRF) for combining results
 * - Time-decay weighting for recency
 *
 * Research reference: Reciprocal Rank Fusion with k=60 (standard constant)
 */

import { Prisma } from '@prisma/client'


import { getQueryEmbedding } from './embeddingService'
import { prisma } from '../../database/prisma'

import type OpenAI from 'openai'

/**
 * Time decay half-lives by content type (in days)
 * Based on research recommendations:
 * - News/training camp: 30 days (highly time-sensitive)
 * - Analysis: 90 days (moderate decay)
 * - Injury reports: 90 days
 * - Fight history: 180 days (slow decay)
 * - Career stats: 365 days (mostly stable)
 */
export const TIME_DECAY_HALF_LIVES: Record<string, number> = {
  news: 30,
  training_camp: 30,
  analysis: 90,
  injury: 90,
  fight_history: 180,
  career_stats: 365,
}

/**
 * Result from hybrid fighter search
 */
export interface HybridSearchResult {
  fighterId: string
  fighterName: string
  weightClass: string
  rrfScore: number
  vectorRank: number
  textRank: number
}

/**
 * Result from context chunk retrieval
 */
export interface ContextChunkResult {
  chunkId: string
  content: string
  contentType: string
  sourceUrl: string | null
  publishedAt: Date | null
  relevanceScore: number
  recencyScore: number
  combinedScore: number
}

/**
 * Fighter context with all relevant information
 */
export interface EnrichedFighterContext {
  fighterId: string
  fighterName: string
  profileText: string | null
  contextChunks: ContextChunkResult[]
  similarFighters: HybridSearchResult[]
}

/**
 * Perform hybrid search for fighters
 *
 * Combines vector similarity search with BM25 text search using
 * Reciprocal Rank Fusion (RRF) with k=60.
 *
 * @param query - Search query (will be embedded and also used for text search)
 * @param openai - OpenAI client for embedding generation
 * @param limit - Maximum number of results
 * @returns Array of search results with RRF scores
 */
export async function hybridFighterSearch(
  query: string,
  openai: OpenAI,
  limit: number = 10
): Promise<HybridSearchResult[]> {
  // Generate query embedding
  const queryEmbedding = await getQueryEmbedding(query, openai)

  // Call the PostgreSQL hybrid search function
  const results = await prisma.$queryRaw<HybridSearchResult[]>`
    SELECT
      fighter_id as "fighterId",
      fighter_name as "fighterName",
      weight_class as "weightClass",
      rrf_score as "rrfScore",
      vector_rank as "vectorRank",
      text_rank as "textRank"
    FROM hybrid_fighter_search(
      ${query},
      ${JSON.stringify(queryEmbedding)}::vector,
      ${limit}
    )
  `

  return results
}

/**
 * Find similar fighters based on profile embeddings
 *
 * Uses pure vector similarity search to find fighters with
 * similar styles and statistics.
 *
 * @param fighterId - ID of the reference fighter
 * @param openai - OpenAI client
 * @param limit - Maximum number of similar fighters
 * @param weightClassFilter - Optional filter to same weight class
 * @returns Array of similar fighters
 */
export async function findSimilarFighters(
  fighterId: string,
  openai: OpenAI,
  limit: number = 5,
  weightClassFilter?: string
): Promise<HybridSearchResult[]> {
  // Get the fighter's embedding
  const fighter = await prisma.$queryRaw<{ profile_embedding: string; name: string }[]>`
    SELECT profile_embedding::text, name
    FROM fighters
    WHERE id = ${fighterId}
    AND profile_embedding IS NOT NULL
  `

  if (fighter.length === 0 || !fighter[0].profile_embedding) {
    return []
  }

  // Build the query with optional weight class filter
  let results: HybridSearchResult[]

  if (weightClassFilter) {
    results = await prisma.$queryRaw<HybridSearchResult[]>`
      SELECT
        id as "fighterId",
        name as "fighterName",
        "weightClass",
        1 - (profile_embedding <=> ${fighter[0].profile_embedding}::vector) as "rrfScore",
        ROW_NUMBER() OVER (ORDER BY profile_embedding <=> ${fighter[0].profile_embedding}::vector) as "vectorRank",
        0 as "textRank"
      FROM fighters
      WHERE
        id != ${fighterId}
        AND profile_embedding IS NOT NULL
        AND "weightClass" = ${weightClassFilter}
      ORDER BY profile_embedding <=> ${fighter[0].profile_embedding}::vector
      LIMIT ${limit}
    `
  } else {
    results = await prisma.$queryRaw<HybridSearchResult[]>`
      SELECT
        id as "fighterId",
        name as "fighterName",
        "weightClass",
        1 - (profile_embedding <=> ${fighter[0].profile_embedding}::vector) as "rrfScore",
        ROW_NUMBER() OVER (ORDER BY profile_embedding <=> ${fighter[0].profile_embedding}::vector) as "vectorRank",
        0 as "textRank"
      FROM fighters
      WHERE
        id != ${fighterId}
        AND profile_embedding IS NOT NULL
      ORDER BY profile_embedding <=> ${fighter[0].profile_embedding}::vector
      LIMIT ${limit}
    `
  }

  return results
}

/**
 * Retrieve context chunks for a fighter with time decay
 *
 * Returns relevant context (news, analysis, fight history) ordered
 * by a combination of semantic relevance and recency.
 *
 * @param fighterId - Fighter ID
 * @param query - Context query (e.g., "recent training camp news")
 * @param openai - OpenAI client
 * @param options - Retrieval options
 * @returns Array of context chunks with scores
 */
export async function getContextWithTimeDecay(
  fighterId: string,
  query: string,
  openai: OpenAI,
  options: {
    contentTypes?: string[]
    maxAgeDays?: number
    limit?: number
  } = {}
): Promise<ContextChunkResult[]> {
  const {
    contentTypes = ['news', 'analysis', 'fight_history'],
    maxAgeDays = 180,
    limit = 5,
  } = options

  // Generate query embedding
  const queryEmbedding = await getQueryEmbedding(query, openai)

  // Use the PostgreSQL function for time-decay retrieval
  const results = await prisma.$queryRaw<ContextChunkResult[]>`
    SELECT
      chunk_id as "chunkId",
      content,
      content_type as "contentType",
      source_url as "sourceUrl",
      published_at as "publishedAt",
      relevance_score as "relevanceScore",
      recency_score as "recencyScore",
      combined_score as "combinedScore"
    FROM get_fighter_context_with_decay(
      ${fighterId},
      ${JSON.stringify(queryEmbedding)}::vector,
      ${contentTypes}::text[],
      ${maxAgeDays},
      ${limit}
    )
  `

  return results
}

/**
 * Calculate time decay factor
 *
 * Uses exponential decay: e^(-0.693 * age / half_life)
 * where 0.693 = ln(2) ensures the value is 0.5 at the half-life
 *
 * @param date - Date of the content
 * @param halfLifeDays - Half-life in days
 * @returns Decay factor between 0 and 1
 */
export function calculateTimeDecay(
  date: Date | null,
  halfLifeDays: number
): number {
  if (!date) return 0.5 // Default decay for unknown dates

  const ageMs = Date.now() - date.getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)

  // Exponential decay: e^(-ln(2) * age / half_life)
  return Math.exp(-0.693 * ageDays / halfLifeDays)
}

/**
 * Get enriched context for a fighter
 *
 * Combines profile information with context chunks and similar fighters.
 *
 * @param fighterId - Fighter ID
 * @param openai - OpenAI client
 * @param matchupQuery - Optional query describing the matchup context
 * @returns Enriched fighter context
 */
export async function getEnrichedFighterContext(
  fighterId: string,
  openai: OpenAI,
  matchupQuery?: string
): Promise<EnrichedFighterContext> {
  // Get basic fighter info
  const fighter = await prisma.fighter.findUnique({
    where: { id: fighterId },
    select: {
      id: true,
      name: true,
      weightClass: true,
      profileText: true,
    },
  })

  if (!fighter) {
    throw new Error(`Fighter not found: ${fighterId}`)
  }

  // Build context query
  const contextQuery = matchupQuery
    ? `${fighter.name} ${matchupQuery}`
    : `${fighter.name} recent news training camp form`

  // Fetch context chunks and similar fighters in parallel
  const [contextChunks, similarFighters] = await Promise.all([
    getContextWithTimeDecay(fighterId, contextQuery, openai, {
      contentTypes: ['news', 'analysis', 'fight_history', 'training_camp'],
      maxAgeDays: 180,
      limit: 5,
    }),
    findSimilarFighters(fighterId, openai, 3, fighter.weightClass),
  ])

  return {
    fighterId: fighter.id,
    fighterName: fighter.name,
    profileText: fighter.profileText,
    contextChunks,
    similarFighters,
  }
}

/**
 * Get context for a matchup between two fighters
 *
 * Retrieves and organizes context for both fighters in a fight.
 *
 * @param fighter1Id - First fighter ID
 * @param fighter2Id - Second fighter ID
 * @param openai - OpenAI client
 * @returns Matchup context with both fighters' information
 */
export async function getMatchupContext(
  fighter1Id: string,
  fighter2Id: string,
  openai: OpenAI
): Promise<{
  fighter1: EnrichedFighterContext
  fighter2: EnrichedFighterContext
  styleSimilarity: number
}> {
  // Fetch both fighters in parallel
  const [fighter1, fighter2] = await Promise.all([
    prisma.fighter.findUnique({
      where: { id: fighter1Id },
      select: { name: true },
    }),
    prisma.fighter.findUnique({
      where: { id: fighter2Id },
      select: { name: true },
    }),
  ])

  if (!fighter1 || !fighter2) {
    throw new Error('One or both fighters not found')
  }

  // Create matchup query
  const matchupQuery = `vs ${fighter2.name} style matchup analysis`
  const matchupQuery2 = `vs ${fighter1.name} style matchup analysis`

  // Fetch enriched context for both fighters
  const [context1, context2] = await Promise.all([
    getEnrichedFighterContext(fighter1Id, openai, matchupQuery),
    getEnrichedFighterContext(fighter2Id, openai, matchupQuery2),
  ])

  // Calculate style similarity between fighters
  const styleSimilarity = await calculateStyleSimilarity(fighter1Id, fighter2Id)

  return {
    fighter1: context1,
    fighter2: context2,
    styleSimilarity,
  }
}

/**
 * Calculate style similarity between two fighters
 *
 * Uses cosine similarity of their profile embeddings.
 *
 * @param fighter1Id - First fighter ID
 * @param fighter2Id - Second fighter ID
 * @returns Similarity score (0-1)
 */
async function calculateStyleSimilarity(
  fighter1Id: string,
  fighter2Id: string
): Promise<number> {
  const result = await prisma.$queryRaw<{ similarity: number }[]>`
    SELECT 1 - (f1.profile_embedding <=> f2.profile_embedding) as similarity
    FROM fighters f1, fighters f2
    WHERE f1.id = ${fighter1Id}
    AND f2.id = ${fighter2Id}
    AND f1.profile_embedding IS NOT NULL
    AND f2.profile_embedding IS NOT NULL
  `

  return result.length > 0 ? result[0].similarity : 0
}

/**
 * Store a context chunk with embedding
 *
 * @param fighterId - Fighter ID
 * @param content - Text content
 * @param contentType - Type of content
 * @param openai - OpenAI client
 * @param options - Additional options
 * @returns Created chunk ID
 */
export async function storeContextChunk(
  fighterId: string,
  content: string,
  contentType: string,
  openai: OpenAI,
  options: {
    sourceUrl?: string
    publishedAt?: Date
    expiresAt?: Date
  } = {}
): Promise<string> {
  const { sourceUrl, publishedAt, expiresAt } = options

  // Generate embedding for the content
  const embedding = await getQueryEmbedding(content, openai)

  // Create the chunk with embedding
  const chunk = await prisma.fighterContextChunk.create({
    data: {
      fighterId,
      content,
      contentType,
      sourceUrl,
      publishedAt,
      expiresAt,
    },
  })

  // Update embedding using raw SQL
  await prisma.$executeRaw`
    UPDATE fighter_context_chunks
    SET embedding = ${JSON.stringify(embedding)}::vector
    WHERE id = ${chunk.id}
  `

  return chunk.id
}

/**
 * Clean up expired context chunks
 *
 * Removes context chunks that have passed their expiration date.
 *
 * @returns Number of deleted chunks
 */
export async function cleanupExpiredChunks(): Promise<number> {
  const result = await prisma.fighterContextChunk.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  })

  return result.count
}

/**
 * Format enriched context for inclusion in AI prompt
 *
 * @param context - Enriched fighter context
 * @returns Formatted string for prompt
 */
export function formatContextForPrompt(context: EnrichedFighterContext): string {
  const parts: string[] = []

  // Profile summary
  if (context.profileText) {
    parts.push(`## ${context.fighterName} Profile`)
    parts.push(context.profileText)
  }

  // Recent context chunks
  if (context.contextChunks.length > 0) {
    parts.push(`\n## Recent Context`)
    for (const chunk of context.contextChunks) {
      const recency = chunk.recencyScore > 0.7 ? '(recent)' : chunk.recencyScore > 0.3 ? '(older)' : '(dated)'
      parts.push(`[${chunk.contentType}] ${recency}: ${chunk.content}`)
    }
  }

  // Similar fighters for style reference
  if (context.similarFighters.length > 0) {
    parts.push(`\n## Similar Fighters (style reference)`)
    const similarNames = context.similarFighters.map((f) => f.fighterName).join(', ')
    parts.push(`Stylistically similar to: ${similarNames}`)
  }

  return parts.join('\n')
}
