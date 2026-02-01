/**
 * Fighter Profile Cache Service
 *
 * Manages caching of FighterEntertainmentProfile in the database.
 * Profiles are cached for 6 months since fighter styles rarely change.
 *
 * Features:
 * - Database caching with 6-month TTL
 * - Batch fetching with concurrency control
 * - Force refresh on major career changes
 * - Graceful degradation on errors
 */

import {
  OpenAIFighterSearchService,
  type ExtractionResult,
} from './openaiSearchService'
import { prisma } from '../database/prisma'
import {
  type FighterEntertainmentProfile as FighterEntertainmentProfileType,
  toEntertainmentContext,
  type FighterEntertainmentContext,
} from './schemas/fighterEntertainmentProfile'

import type { Fighter, FighterEntertainmentProfile } from '@prisma/client'

/**
 * Cache TTL: 6 months in milliseconds
 */
const CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000 // 180 days

/**
 * Default concurrency for batch operations
 */
const DEFAULT_CONCURRENCY = 5

/**
 * Result from cache lookup
 */
export interface CacheResult {
  profile: FighterEntertainmentProfileType
  fromCache: boolean
  costUsd: number
  fighterId: string
}

/**
 * Batch result for multiple fighters
 */
export interface BatchResult {
  results: Map<string, CacheResult>
  totalCostUsd: number
  cacheHits: number
  cacheMisses: number
  errors: Array<{ fighterId: string; fighterName: string; error: string }>
}

/**
 * Configuration for the cache service
 */
interface CacheServiceConfig {
  /** Search service instance (created if not provided) */
  searchService?: OpenAIFighterSearchService
  /** Concurrency limit for batch operations (default: 5) */
  concurrency?: number
  /** Force refresh all profiles (default: false) */
  forceRefresh?: boolean
}

/**
 * Fighter Profile Cache Service
 *
 * Handles caching and retrieval of fighter entertainment profiles.
 */
export class FighterProfileCacheService {
  private searchService: OpenAIFighterSearchService
  private concurrency: number
  private forceRefresh: boolean

  constructor(config: CacheServiceConfig = {}) {
    this.searchService =
      config.searchService || new OpenAIFighterSearchService()
    this.concurrency = config.concurrency || DEFAULT_CONCURRENCY
    this.forceRefresh = config.forceRefresh || false
  }

  /**
   * Get or fetch a fighter's entertainment profile
   *
   * Checks cache first, fetches from web if missing or expired.
   *
   * @param fighterId - Fighter's database ID
   * @param fighterName - Fighter's full name (for search)
   * @returns Cache result with profile and metadata
   */
  async getOrFetchProfile(
    fighterId: string,
    fighterName: string
  ): Promise<CacheResult> {
    // Check cache first (unless force refresh)
    if (!this.forceRefresh) {
      const cached = await this.getCachedProfile(fighterId)
      if (cached && !this.isExpired(cached)) {
        return {
          profile: this.dbToProfile(cached),
          fromCache: true,
          costUsd: 0,
          fighterId,
        }
      }
    }

    // Fetch from web search
    console.log(`  🔍 Fetching entertainment profile for ${fighterName}...`)
    const result = await this.searchService.extractFighterProfile(fighterName)

    // Cache the result
    await this.cacheProfile(fighterId, result)

    return {
      profile: result.profile,
      fromCache: false,
      costUsd: result.totalCostUsd,
      fighterId,
    }
  }

  /**
   * Get entertainment context for prompt injection
   *
   * Returns a lightweight version of the profile suitable for prompts.
   *
   * @param fighterId - Fighter's database ID
   * @param fighterName - Fighter's full name
   * @returns Entertainment context or null if unavailable
   */
  async getEntertainmentContext(
    fighterId: string,
    fighterName: string
  ): Promise<FighterEntertainmentContext | null> {
    try {
      const result = await this.getOrFetchProfile(fighterId, fighterName)
      return toEntertainmentContext(result.profile)
    } catch (error) {
      console.warn(
        `  ⚠ Failed to get entertainment context for ${fighterName}: ${error instanceof Error ? error.message : String(error)}`
      )
      return null
    }
  }

  /**
   * Batch fetch profiles for multiple fighters
   *
   * Uses concurrency control to avoid rate limiting.
   *
   * @param fighters - Array of fighters with id and name
   * @returns Batch result with all profiles and summary
   */
  async batchGetProfiles(
    fighters: Array<{ id: string; name: string }>
  ): Promise<BatchResult> {
    const results = new Map<string, CacheResult>()
    const errors: BatchResult['errors'] = []
    let totalCostUsd = 0
    let cacheHits = 0
    let cacheMisses = 0

    // Process in batches with concurrency limit
    const queue = [...fighters]
    const inFlight: Promise<void>[] = []

    const processOne = async (fighter: { id: string; name: string }) => {
      try {
        const result = await this.getOrFetchProfile(fighter.id, fighter.name)
        results.set(fighter.id, result)

        if (result.fromCache) {
          cacheHits++
        } else {
          cacheMisses++
          totalCostUsd += result.costUsd
        }
      } catch (error) {
        errors.push({
          fighterId: fighter.id,
          fighterName: fighter.name,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    while (queue.length > 0 || inFlight.length > 0) {
      // Fill up to concurrency limit
      while (queue.length > 0 && inFlight.length < this.concurrency) {
        const fighter = queue.shift()!
        const promise = processOne(fighter).then(() => {
          const index = inFlight.indexOf(promise)
          if (index > -1) {
            inFlight.splice(index, 1)
          }
        })
        inFlight.push(promise)
      }

      // Wait for at least one to complete
      if (inFlight.length > 0) {
        await Promise.race(inFlight)
      }
    }

    return {
      results,
      totalCostUsd,
      cacheHits,
      cacheMisses,
      errors,
    }
  }

  /**
   * Force refresh a fighter's profile
   *
   * Fetches new data regardless of cache state.
   *
   * @param fighterId - Fighter's database ID
   * @param fighterName - Fighter's full name
   * @returns Fresh profile
   */
  async refreshProfile(
    fighterId: string,
    fighterName: string
  ): Promise<CacheResult> {
    console.log(`  🔄 Force refreshing profile for ${fighterName}...`)

    const result = await this.searchService.extractFighterProfile(fighterName)
    await this.cacheProfile(fighterId, result)

    return {
      profile: result.profile,
      fromCache: false,
      costUsd: result.totalCostUsd,
      fighterId,
    }
  }

  /**
   * Check if a fighter should have their profile refreshed
   *
   * Beyond expiration, also checks for major career changes:
   * - Coming off a KO/TKO loss (may indicate chin issues)
   * - Weight class change
   * - Long layoff (>1 year since last fight)
   *
   * @param fighter - Fighter record from database
   * @returns Whether profile should be refreshed
   */
  shouldRefresh(fighter: Fighter): boolean {
    // TODO: Implement career change detection
    // For now, just check expiration via cache lookup
    return false
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    totalProfiles: number
    expiredProfiles: number
    averageAge: number
    totalCostUsd: number
  }> {
    const now = new Date()

    const [totalResult, expiredResult, statsResult] = await Promise.all([
      prisma.fighterEntertainmentProfile.count(),
      prisma.fighterEntertainmentProfile.count({
        where: { expiresAt: { lt: now } },
      }),
      prisma.fighterEntertainmentProfile.aggregate({
        _avg: { totalCostUsd: true },
        _sum: { totalCostUsd: true },
      }),
    ])

    // Calculate average age
    const profiles = await prisma.fighterEntertainmentProfile.findMany({
      select: { searchedAt: true },
    })

    const avgAgeMs =
      profiles.length > 0
        ? profiles.reduce(
            (sum, p) => sum + (now.getTime() - p.searchedAt.getTime()),
            0
          ) / profiles.length
        : 0

    return {
      totalProfiles: totalResult,
      expiredProfiles: expiredResult,
      averageAge: Math.round(avgAgeMs / (24 * 60 * 60 * 1000)), // Days
      totalCostUsd: statsResult._sum.totalCostUsd || 0,
    }
  }

  /**
   * Clean up expired profiles
   *
   * Removes profiles that have been expired for more than the TTL.
   * This prevents database bloat while keeping recently expired profiles
   * in case they need to be refreshed.
   */
  async cleanupExpiredProfiles(): Promise<number> {
    const cutoff = new Date(Date.now() - CACHE_TTL_MS)

    const result = await prisma.fighterEntertainmentProfile.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    })

    return result.count
  }

  // ============================================
  // Private methods
  // ============================================

  /**
   * Get cached profile from database
   */
  private async getCachedProfile(
    fighterId: string
  ): Promise<FighterEntertainmentProfile | null> {
    return prisma.fighterEntertainmentProfile.findUnique({
      where: { fighterId },
    })
  }

  /**
   * Check if a cached profile is expired
   */
  private isExpired(profile: FighterEntertainmentProfile): boolean {
    return profile.expiresAt < new Date()
  }

  /**
   * Cache a profile to the database
   */
  private async cacheProfile(
    fighterId: string,
    result: ExtractionResult
  ): Promise<void> {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MS)

    await prisma.fighterEntertainmentProfile.upsert({
      where: { fighterId },
      create: {
        fighterId,
        primaryArchetype: result.profile.primary_archetype,
        secondaryArchetype: result.profile.secondary_archetype,
        archetypeReasoning: result.profile.archetype_reasoning,
        archetypeConfidence: result.profile.archetype_confidence,
        mentality: result.profile.mentality,
        mentalityReasoning: result.profile.mentality_reasoning,
        mentalityConfidence: result.profile.mentality_confidence,
        reputationTags: result.profile.reputation_tags,
        notableWars: result.profile.notable_wars as any,
        bonusHistory: result.profile.bonus_history as any,
        knownBoringFights: result.profile.known_boring_fights,
        rivalries: result.profile.rivalries as any,
        entertainmentPrediction: result.profile.entertainment_prediction,
        extractionNotes: result.profile.extraction_notes,
        sources: result.sources,
        searchTokens: result.searchTokens,
        extractionTokens: result.extractionTokens,
        totalCostUsd: result.totalCostUsd,
        searchedAt: now,
        expiresAt,
      },
      update: {
        primaryArchetype: result.profile.primary_archetype,
        secondaryArchetype: result.profile.secondary_archetype,
        archetypeReasoning: result.profile.archetype_reasoning,
        archetypeConfidence: result.profile.archetype_confidence,
        mentality: result.profile.mentality,
        mentalityReasoning: result.profile.mentality_reasoning,
        mentalityConfidence: result.profile.mentality_confidence,
        reputationTags: result.profile.reputation_tags,
        notableWars: result.profile.notable_wars as any,
        bonusHistory: result.profile.bonus_history as any,
        knownBoringFights: result.profile.known_boring_fights,
        rivalries: result.profile.rivalries as any,
        entertainmentPrediction: result.profile.entertainment_prediction,
        extractionNotes: result.profile.extraction_notes,
        sources: result.sources,
        searchTokens: result.searchTokens,
        extractionTokens: result.extractionTokens,
        totalCostUsd: result.totalCostUsd,
        searchedAt: now,
        expiresAt,
      },
    })
  }

  /**
   * Convert database record to FighterEntertainmentProfile type
   */
  private dbToProfile(
    db: FighterEntertainmentProfile
  ): FighterEntertainmentProfileType {
    return {
      fighter_name: '', // Will be filled by caller if needed
      nickname: null,
      primary_archetype: db.primaryArchetype as any,
      secondary_archetype: db.secondaryArchetype as any,
      archetype_reasoning: db.archetypeReasoning,
      archetype_confidence: db.archetypeConfidence,
      mentality: db.mentality as any,
      mentality_reasoning: db.mentalityReasoning,
      mentality_confidence: db.mentalityConfidence,
      reputation_tags: db.reputationTags,
      notable_wars: (db.notableWars as any) || [],
      bonus_history: (db.bonusHistory as any) || {
        fotn_count: 0,
        potn_count: 0,
        total_bonuses: 0,
        bonus_rate_estimate: null,
      },
      known_boring_fights: db.knownBoringFights,
      rivalries: (db.rivalries as any) || [],
      entertainment_prediction: db.entertainmentPrediction as any,
      extraction_notes: db.extractionNotes || '',
    }
  }
}

/**
 * Create a configured cache service
 */
export function createProfileCacheService(
  config?: CacheServiceConfig
): FighterProfileCacheService {
  return new FighterProfileCacheService(config)
}
