/**
 * Prediction Context Service - Phase 3
 *
 * Provides enriched fighter context for AI predictions using hybrid retrieval.
 * Combines:
 * - Pre-computed fighter profile embeddings
 * - Semantic search for relevant context
 * - Time-decayed news and analysis
 * - Similar fighter references
 *
 * This service is designed to be used by the prediction pipeline to get
 * high-quality, relevant context for each fight prediction.
 */

import OpenAI from 'openai'
import { prisma } from '../../database/prisma'
import {
  getEnrichedFighterContext,
  getMatchupContext,
  formatContextForPrompt,
  findSimilarFighters,
  calculateTimeDecay,
  TIME_DECAY_HALF_LIVES,
  type EnrichedFighterContext,
} from './hybridRetrieval'

/**
 * Context prepared for a single fight prediction
 */
export interface PredictionContext {
  fighter1Context: string
  fighter2Context: string
  matchupAnalysis: string
  styleSimilarity: number
  contextQuality: 'high' | 'medium' | 'low'
  warnings: string[]
}

/**
 * Configuration for context retrieval
 */
export interface ContextConfig {
  maxContextLength: number // Max tokens for context (~2500 recommended)
  includeNews: boolean
  includeSimilarFighters: boolean
  newsMaxAgeDays: number
}

const DEFAULT_CONFIG: ContextConfig = {
  maxContextLength: 2500,
  includeNews: true,
  includeSimilarFighters: true,
  newsMaxAgeDays: 90,
}

/**
 * Get prediction context for a fight
 *
 * Retrieves and formats all relevant context for making a prediction
 * about a fight, including fighter profiles, recent news, and matchup analysis.
 *
 * @param fighter1Id - First fighter ID
 * @param fighter2Id - Second fighter ID
 * @param openai - OpenAI client
 * @param config - Context configuration
 * @returns Formatted prediction context
 */
export async function getPredictionContext(
  fighter1Id: string,
  fighter2Id: string,
  openai: OpenAI,
  config: Partial<ContextConfig> = {}
): Promise<PredictionContext> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const warnings: string[] = []

  try {
    // Check if embeddings exist
    const [hasEmbedding1, hasEmbedding2] = await Promise.all([
      checkFighterHasEmbedding(fighter1Id),
      checkFighterHasEmbedding(fighter2Id),
    ])

    if (!hasEmbedding1 || !hasEmbedding2) {
      // Fall back to basic context without embeddings
      return getFallbackContext(fighter1Id, fighter2Id, warnings)
    }

    // Get full matchup context using hybrid retrieval
    const matchupContext = await getMatchupContext(fighter1Id, fighter2Id, openai)

    // Format contexts for prompt
    const fighter1Context = formatContextForPrompt(matchupContext.fighter1)
    const fighter2Context = formatContextForPrompt(matchupContext.fighter2)

    // Generate matchup analysis summary
    const matchupAnalysis = generateMatchupAnalysis(
      matchupContext.fighter1,
      matchupContext.fighter2,
      matchupContext.styleSimilarity
    )

    // Assess context quality
    const contextQuality = assessContextQuality(matchupContext.fighter1, matchupContext.fighter2)

    // Truncate if needed
    const truncated1 = truncateContext(fighter1Context, cfg.maxContextLength / 2)
    const truncated2 = truncateContext(fighter2Context, cfg.maxContextLength / 2)

    if (truncated1 !== fighter1Context || truncated2 !== fighter2Context) {
      warnings.push('Context was truncated to fit token limit')
    }

    return {
      fighter1Context: truncated1,
      fighter2Context: truncated2,
      matchupAnalysis,
      styleSimilarity: matchupContext.styleSimilarity,
      contextQuality,
      warnings,
    }

  } catch (error) {
    console.error('Error getting prediction context:', error)
    warnings.push(`Context retrieval error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return getFallbackContext(fighter1Id, fighter2Id, warnings)
  }
}

/**
 * Check if a fighter has an embedding
 */
async function checkFighterHasEmbedding(fighterId: string): Promise<boolean> {
  const result = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count
    FROM fighters
    WHERE id = ${fighterId}
    AND profile_embedding IS NOT NULL
  `
  return result.length > 0 && Number(result[0].count) > 0
}

/**
 * Get fallback context when embeddings are not available
 */
async function getFallbackContext(
  fighter1Id: string,
  fighter2Id: string,
  warnings: string[]
): Promise<PredictionContext> {
  warnings.push('Using fallback context (embeddings not available)')

  const [fighter1, fighter2] = await Promise.all([
    prisma.fighter.findUnique({
      where: { id: fighter1Id },
      select: {
        name: true,
        weightClass: true,
        record: true,
        profileText: true,
      },
    }),
    prisma.fighter.findUnique({
      where: { id: fighter2Id },
      select: {
        name: true,
        weightClass: true,
        record: true,
        profileText: true,
      },
    }),
  ])

  const fighter1Context = fighter1?.profileText || `${fighter1?.name || 'Unknown'} - ${fighter1?.record || 'No record'}`
  const fighter2Context = fighter2?.profileText || `${fighter2?.name || 'Unknown'} - ${fighter2?.record || 'No record'}`

  return {
    fighter1Context,
    fighter2Context,
    matchupAnalysis: 'Limited context available - using basic profile data.',
    styleSimilarity: 0.5, // Unknown
    contextQuality: 'low',
    warnings,
  }
}

/**
 * Generate matchup analysis from enriched contexts
 */
function generateMatchupAnalysis(
  fighter1: EnrichedFighterContext,
  fighter2: EnrichedFighterContext,
  styleSimilarity: number
): string {
  const parts: string[] = []

  // Style similarity insight
  if (styleSimilarity > 0.8) {
    parts.push('These fighters have very similar styles - expect a chess match.')
  } else if (styleSimilarity > 0.6) {
    parts.push('Moderately similar styles - some shared tendencies.')
  } else if (styleSimilarity < 0.4) {
    parts.push('Contrasting styles - potential for a clash of approaches.')
  }

  // Similar fighter references for each
  if (fighter1.similarFighters.length > 0) {
    const similarNames = fighter1.similarFighters.slice(0, 2).map(f => f.fighterName).join(', ')
    parts.push(`${fighter1.fighterName} stylistically similar to: ${similarNames}`)
  }

  if (fighter2.similarFighters.length > 0) {
    const similarNames = fighter2.similarFighters.slice(0, 2).map(f => f.fighterName).join(', ')
    parts.push(`${fighter2.fighterName} stylistically similar to: ${similarNames}`)
  }

  // Context chunk insights
  const recentNews1 = fighter1.contextChunks.filter(c => c.contentType === 'news' && c.recencyScore > 0.5)
  const recentNews2 = fighter2.contextChunks.filter(c => c.contentType === 'news' && c.recencyScore > 0.5)

  if (recentNews1.length > 0 || recentNews2.length > 0) {
    parts.push('Recent news available for analysis.')
  }

  return parts.join(' ')
}

/**
 * Assess the quality of retrieved context
 */
function assessContextQuality(
  fighter1: EnrichedFighterContext,
  fighter2: EnrichedFighterContext
): 'high' | 'medium' | 'low' {
  let score = 0

  // Profile text available
  if (fighter1.profileText) score += 1
  if (fighter2.profileText) score += 1

  // Context chunks available
  if (fighter1.contextChunks.length >= 3) score += 1
  if (fighter2.contextChunks.length >= 3) score += 1

  // Similar fighters found
  if (fighter1.similarFighters.length >= 2) score += 0.5
  if (fighter2.similarFighters.length >= 2) score += 0.5

  // Recent context (high recency score)
  const hasRecentContext1 = fighter1.contextChunks.some(c => c.recencyScore > 0.7)
  const hasRecentContext2 = fighter2.contextChunks.some(c => c.recencyScore > 0.7)
  if (hasRecentContext1) score += 0.5
  if (hasRecentContext2) score += 0.5

  if (score >= 5) return 'high'
  if (score >= 3) return 'medium'
  return 'low'
}

/**
 * Truncate context to fit within token limit
 */
function truncateContext(context: string, maxChars: number): string {
  // Rough estimate: 1 token ≈ 4 characters
  const maxLength = maxChars * 4

  if (context.length <= maxLength) {
    return context
  }

  // Find a good break point (end of sentence or paragraph)
  let truncated = context.substring(0, maxLength)
  const lastPeriod = truncated.lastIndexOf('.')
  const lastNewline = truncated.lastIndexOf('\n')
  const breakPoint = Math.max(lastPeriod, lastNewline)

  if (breakPoint > maxLength * 0.7) {
    truncated = truncated.substring(0, breakPoint + 1)
  }

  return truncated + '\n[Context truncated]'
}

/**
 * Batch get prediction contexts for multiple fights
 *
 * Optimized for processing entire event cards.
 *
 * @param fights - Array of fight details
 * @param openai - OpenAI client
 * @returns Map of fight IDs to prediction contexts
 */
export async function getBatchPredictionContexts(
  fights: Array<{ fightId: string; fighter1Id: string; fighter2Id: string }>,
  openai: OpenAI
): Promise<Map<string, PredictionContext>> {
  const results = new Map<string, PredictionContext>()

  // Process fights in parallel (with some concurrency limit)
  const CONCURRENCY = 3
  for (let i = 0; i < fights.length; i += CONCURRENCY) {
    const batch = fights.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map(async (fight) => {
        const context = await getPredictionContext(
          fight.fighter1Id,
          fight.fighter2Id,
          openai
        )
        return { fightId: fight.fightId, context }
      })
    )

    for (const { fightId, context } of batchResults) {
      results.set(fightId, context)
    }
  }

  return results
}

/**
 * Get context budget recommendation based on fight importance
 *
 * @param isMainEvent - Is this the main event?
 * @param isTitleFight - Is this a title fight?
 * @returns Recommended max context length
 */
export function getContextBudget(isMainEvent: boolean, isTitleFight: boolean): number {
  if (isTitleFight) return 3000 // More context for title fights
  if (isMainEvent) return 2500 // Standard for main events
  return 2000 // Reduced for undercard fights to save costs
}
