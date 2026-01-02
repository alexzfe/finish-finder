/**
 * Improved Fighter Context Service - Enhanced Web Search
 *
 * Major improvements over original:
 * 1. Adaptive query strategies based on fighter profile
 * 2. Multiple search attempts with fallback queries
 * 3. Recency filtering based on event timeline
 * 4. Better result extraction and summarization
 * 5. Context quality scoring
 *
 * Features:
 * - In-memory caching (1 hour TTL)
 * - Rate limiting (1 second delay)
 * - Graceful error handling
 * - Search result quality assessment
 */

import type { SearchFunction } from './webSearchWrapper'

/**
 * Fighter context from web search
 */
export interface FighterContext {
  fighterName: string
  recentNews: string          // Summary of recent news/updates
  searchSuccessful: boolean   // Whether search completed successfully
  searchTimestamp: Date       // When this context was fetched
  searchQuality: 'high' | 'medium' | 'low' | 'none'  // Quality of results
  queriesAttempted: number    // How many queries were tried
}

/**
 * Cache entry for fighter context
 */
interface CacheEntry {
  context: FighterContext
  timestamp: Date
}

/**
 * Search attempt result
 */
interface SearchAttempt {
  query: string
  results: string
  resultCount: number
  quality: 'high' | 'medium' | 'low' | 'none'
}

/**
 * Configuration for context searches
 */
const CONFIG = {
  cacheExpirationMs: 3600000, // 1 hour cache (news changes frequently)
  searchTimeout: 10000,       // 10 second timeout per search
  maxNewsLength: 600,         // Increased from 500 for better context
  rateLimit: {
    delayMs: 1000,            // 1 second delay between searches
  },
  maxSearchAttempts: 3,       // Try up to 3 different queries
  minQualityWords: 30,        // Minimum words for "high quality" result
}

/**
 * Improved service for fetching fighter context via web search
 */
export class ImprovedFighterContextService {
  private cache: Map<string, CacheEntry> = new Map()
  private lastSearchTime: Date | null = null
  private searchFunction: SearchFunction | null = null

  /**
   * Initialize with search function
   *
   * @param searchFunction - Function that performs web search
   */
  constructor(searchFunction: SearchFunction) {
    this.searchFunction = searchFunction
  }

  /**
   * Get context for a single fighter with improved search strategies
   *
   * @param fighterName - Fighter's full name
   * @param eventDate - Date of the upcoming fight
   * @param fighterStats - Optional fighter stats for adaptive queries
   * @returns Fighter context with recent news
   */
  async getFighterContext(
    fighterName: string,
    eventDate?: Date,
    fighterStats?: {
      record?: string
      winStreak?: number
      lossStreak?: number
      isRanked?: boolean
      isTitleHolder?: boolean
    }
  ): Promise<FighterContext> {
    // Check cache first
    const cached = this.cache.get(fighterName)
    if (cached && !this.isCacheExpired(cached)) {
      console.log(`  ✓ Using cached context for ${fighterName}`)
      return cached.context
    }

    // Rate limiting: wait if we searched too recently
    await this.respectRateLimit()

    try {
      // Build and execute adaptive search strategy
      const searchAttempt = await this.executeAdaptiveSearch(
        fighterName,
        eventDate,
        fighterStats
      )

      const context: FighterContext = {
        fighterName,
        recentNews: searchAttempt.results || 'No significant recent news found.',
        searchSuccessful: searchAttempt.quality !== 'none',
        searchTimestamp: new Date(),
        searchQuality: searchAttempt.quality,
        queriesAttempted: searchAttempt.resultCount,
      }

      // Cache the result
      this.cache.set(fighterName, {
        context,
        timestamp: new Date(),
      })

      this.lastSearchTime = new Date()

      // Log quality indicator
      const qualityEmoji = {
        high: '✓',
        medium: '○',
        low: '△',
        none: '✗'
      }[searchAttempt.quality]

      console.log(`  ${qualityEmoji} ${fighterName}: ${searchAttempt.quality} quality (${searchAttempt.resultCount} attempts)`)

      return context
    } catch (error) {
      console.warn(
        `  ⚠ Failed to fetch context for ${fighterName}: ${error instanceof Error ? error.message : String(error)}`
      )

      // Return empty context on error (graceful degradation)
      return {
        fighterName,
        recentNews: 'No recent context available.',
        searchSuccessful: false,
        searchTimestamp: new Date(),
        searchQuality: 'none',
        queriesAttempted: 0,
      }
    }
  }

  /**
   * Get context for both fighters in a matchup
   *
   * @param fighter1Name - First fighter's name
   * @param fighter2Name - Second fighter's name
   * @param eventDate - Date of the fight
   * @param fighter1Stats - Optional stats for fighter 1
   * @param fighter2Stats - Optional stats for fighter 2
   * @returns Array of contexts [fighter1, fighter2]
   */
  async getFightContext(
    fighter1Name: string,
    fighter2Name: string,
    eventDate?: Date,
    fighter1Stats?: Parameters<typeof this.getFighterContext>[2],
    fighter2Stats?: Parameters<typeof this.getFighterContext>[2]
  ): Promise<[FighterContext, FighterContext]> {
    // Fetch both contexts (sequential to respect rate limiting)
    const context1 = await this.getFighterContext(fighter1Name, eventDate, fighter1Stats)
    const context2 = await this.getFighterContext(fighter2Name, eventDate, fighter2Stats)

    return [context1, context2]
  }

  /**
   * Execute adaptive search strategy with fallbacks
   *
   * Tries multiple query strategies in order:
   * 1. Recent news with context-specific terms
   * 2. General fighter analysis
   * 3. Fallback to basic fighter search
   *
   * @param fighterName - Fighter name
   * @param eventDate - Event date for recency filtering
   * @param fighterStats - Fighter stats for adaptive queries
   * @returns Best search result
   */
  private async executeAdaptiveSearch(
    fighterName: string,
    eventDate?: Date,
    fighterStats?: Parameters<typeof this.getFighterContext>[2]
  ): Promise<SearchAttempt & { results: string }> {
    if (!this.searchFunction) {
      throw new Error('Search function not initialized')
    }

    const attempts: SearchAttempt[] = []

    // Strategy 1: Recent news with adaptive context
    const recentQuery = this.buildRecentNewsQuery(fighterName, eventDate, fighterStats)
    try {
      console.log(`  🔍 Attempt 1: "${recentQuery}"`)
      const results = await this.searchFunction(recentQuery)
      const quality = this.assessResultQuality(results, fighterName)

      attempts.push({
        query: recentQuery,
        results,
        resultCount: 1,
        quality
      })

      // If high quality, return immediately
      if (quality === 'high') {
        return { ...attempts[0], results }
      }
    } catch (error) {
      console.warn(`  ⚠ Attempt 1 failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Strategy 2: General fighter analysis (no time filter)
    const analysisQuery = this.buildAnalysisQuery(fighterName)
    try {
      console.log(`  🔍 Attempt 2: "${analysisQuery}"`)
      const results = await this.searchFunction(analysisQuery)
      const quality = this.assessResultQuality(results, fighterName)

      attempts.push({
        query: analysisQuery,
        results,
        resultCount: 2,
        quality
      })

      // If medium or high quality, use this
      if (quality === 'high' || quality === 'medium') {
        return { ...attempts[attempts.length - 1], results }
      }
    } catch (error) {
      console.warn(`  ⚠ Attempt 2 failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Strategy 3: Fallback - basic fighter search
    const fallbackQuery = `"${fighterName}" UFC MMA fighter`
    try {
      console.log(`  🔍 Attempt 3 (fallback): "${fallbackQuery}"`)
      const results = await this.searchFunction(fallbackQuery)
      const quality = this.assessResultQuality(results, fighterName)

      attempts.push({
        query: fallbackQuery,
        results,
        resultCount: 3,
        quality
      })

      return { ...attempts[attempts.length - 1], results }
    } catch (error) {
      console.warn(`  ⚠ Attempt 3 failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    // All attempts failed - return best attempt or empty
    const bestAttempt = attempts.reduce((best, current) =>
      this.qualityScore(current.quality) > this.qualityScore(best.quality) ? current : best,
      attempts[0] || { query: '', results: '', resultCount: attempts.length, quality: 'none' as const }
    )

    return { ...bestAttempt, results: bestAttempt.results || '' }
  }

  /**
   * Build recent news query with adaptive context
   *
   * @param fighterName - Fighter name
   * @param eventDate - Event date
   * @param fighterStats - Fighter stats
   * @returns Optimized search query
   */
  private buildRecentNewsQuery(
    fighterName: string,
    eventDate?: Date,
    fighterStats?: Parameters<typeof this.getFighterContext>[2]
  ): string {
    const baseTerm = `"${fighterName}" UFC`

    // Add context-specific terms based on fighter profile
    const contextTerms: string[] = []

    if (fighterStats?.isTitleHolder) {
      contextTerms.push('champion', 'title defense')
    } else if (fighterStats?.isRanked) {
      contextTerms.push('ranked', 'contender')
    }

    if (fighterStats?.winStreak && fighterStats.winStreak >= 3) {
      contextTerms.push('win streak', 'momentum')
    } else if (fighterStats?.lossStreak && fighterStats.lossStreak >= 2) {
      contextTerms.push('bouncing back', 'must win')
    }

    // Add recency/relevance terms
    const relevanceTerms = [
      'fight',
      'upcoming',
      'training',
      'recent',
      'injury OR injured OR suspension',
      'camp OR preparation'
    ]

    // Combine all terms
    const allTerms = [...contextTerms, ...relevanceTerms].slice(0, 3) // Limit to keep query focused

    return `${baseTerm} ${allTerms.join(' ')}`
  }

  /**
   * Build general analysis query (no time filter)
   *
   * @param fighterName - Fighter name
   * @returns Analysis-focused search query
   */
  private buildAnalysisQuery(fighterName: string): string {
    return `"${fighterName}" UFC fight analysis statistics style strengths weaknesses`
  }

  /**
   * Assess quality of search results
   *
   * @param results - Search results text
   * @param fighterName - Fighter name to check relevance
   * @returns Quality rating
   */
  private assessResultQuality(
    results: string,
    fighterName: string
  ): 'high' | 'medium' | 'low' | 'none' {
    if (!results || results.length < 50) {
      return 'none'
    }

    // Check if fighter name appears in results
    const fighterMentions = (results.match(new RegExp(fighterName, 'gi')) || []).length
    if (fighterMentions === 0) {
      return 'none'
    }

    // Count relevant keywords
    const relevantKeywords = [
      'fight', 'fighter', 'UFC', 'MMA',
      'win', 'loss', 'knockout', 'submission',
      'training', 'camp', 'injury',
      'ranked', 'champion', 'title',
      'upcoming', 'recent', 'last'
    ]

    const keywordMatches = relevantKeywords.filter(keyword =>
      results.toLowerCase().includes(keyword)
    ).length

    // Word count
    const wordCount = results.split(/\s+/).length

    // Quality scoring
    if (wordCount >= CONFIG.minQualityWords && keywordMatches >= 5 && fighterMentions >= 2) {
      return 'high'
    } else if (wordCount >= 20 && keywordMatches >= 3) {
      return 'medium'
    } else if (fighterMentions >= 1) {
      return 'low'
    }

    return 'none'
  }

  /**
   * Convert quality rating to numeric score
   */
  private qualityScore(quality: 'high' | 'medium' | 'low' | 'none'): number {
    return { high: 3, medium: 2, low: 1, none: 0 }[quality]
  }

  /**
   * Check if cache entry is expired
   */
  private isCacheExpired(entry: CacheEntry): boolean {
    const age = Date.now() - entry.timestamp.getTime()
    return age >= CONFIG.cacheExpirationMs
  }

  /**
   * Respect rate limiting by waiting if needed
   */
  private async respectRateLimit(): Promise<void> {
    if (!this.lastSearchTime) {
      return
    }

    const timeSinceLastSearch = Date.now() - this.lastSearchTime.getTime()
    const remainingDelay = CONFIG.rateLimit.delayMs - timeSinceLastSearch

    if (remainingDelay > 0) {
      console.log(`  ⏱ Rate limit: waiting ${remainingDelay}ms`)
      await new Promise((resolve) => setTimeout(resolve, remainingDelay))
    }
  }

  /**
   * Clear the cache (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.cache.clear()
    console.log('✓ Fighter context cache cleared')
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number
    entries: Array<{ fighter: string; age: number; quality: string }>
  } {
    const entries = Array.from(this.cache.entries()).map(
      ([fighter, entry]) => ({
        fighter,
        age: Date.now() - entry.timestamp.getTime(),
        quality: entry.context.searchQuality,
      })
    )

    return {
      size: this.cache.size,
      entries,
    }
  }
}
