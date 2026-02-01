/**
 * Fighter Context Service
 *
 * Searches the web for recent fighter news and context to enrich AI predictions.
 * Provides information about:
 * - Recent fight results and momentum
 * - Injuries or health concerns
 * - Training camp updates
 * - Style changes or new techniques
 * - Media coverage and narratives
 *
 * Features:
 * - In-memory caching to avoid duplicate searches
 * - Rate limiting to respect search API limits
 * - Graceful error handling (predictions work without context)
 */

/**
 * Fighter context from web search
 */
export interface FighterContext {
  fighterName: string
  recentNews: string          // Summary of recent news/updates
  searchSuccessful: boolean   // Whether search completed successfully
  searchTimestamp: Date       // When this context was fetched
}

/**
 * Cache entry for fighter context
 */
interface CacheEntry {
  context: FighterContext
  timestamp: Date
}

/**
 * Configuration for context searches
 */
const CONFIG = {
  cacheExpirationMs: 3600000, // 1 hour cache (news changes frequently)
  searchTimeout: 10000,       // 10 second timeout per search
  maxNewsLength: 500,         // Max characters for news summary
  rateLimit: {
    delayMs: 1000,            // 1 second delay between searches
  },
}

/**
 * Service for fetching fighter context via web search
 */
export class FighterContextService {
  private cache: Map<string, CacheEntry> = new Map()
  private lastSearchTime: Date | null = null
  private searchFunction: ((query: string) => Promise<string>) | null = null

  /**
   * Initialize with optional search function (for dependency injection/testing)
   *
   * @param searchFunction - Function that performs web search (defaults to built-in)
   */
  constructor(searchFunction?: (query: string) => Promise<string>) {
    this.searchFunction = searchFunction || null
  }

  /**
   * Get context for a single fighter
   *
   * @param fighterName - Fighter's full name
   * @param eventDate - Date of the upcoming fight (to filter irrelevant old news)
   * @returns Fighter context with recent news
   */
  async getFighterContext(
    fighterName: string,
    eventDate?: Date
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
      // Perform web search
      const newsText = await this.searchFighterNews(fighterName, eventDate)

      const context: FighterContext = {
        fighterName,
        recentNews: newsText,
        searchSuccessful: true,
        searchTimestamp: new Date(),
      }

      // Cache the result
      this.cache.set(fighterName, {
        context,
        timestamp: new Date(),
      })

      this.lastSearchTime = new Date()
      return context
    } catch (error) {
      console.warn(
        `  ⚠ Failed to fetch context for ${fighterName}: ${error instanceof Error ? error.message : String(error)}`
      )

      // Return empty context on error (graceful degradation)
      const context: FighterContext = {
        fighterName,
        recentNews: 'No recent context available.',
        searchSuccessful: false,
        searchTimestamp: new Date(),
      }

      return context
    }
  }

  /**
   * Get context for both fighters in a matchup
   *
   * @param fighter1Name - First fighter's name
   * @param fighter2Name - Second fighter's name
   * @param eventDate - Date of the fight
   * @returns Array of contexts [fighter1, fighter2]
   */
  async getFightContext(
    fighter1Name: string,
    fighter2Name: string,
    eventDate?: Date
  ): Promise<[FighterContext, FighterContext]> {
    // Fetch both contexts (sequential to respect rate limiting)
    const context1 = await this.getFighterContext(fighter1Name, eventDate)
    const context2 = await this.getFighterContext(fighter2Name, eventDate)

    return [context1, context2]
  }

  /**
   * Search for objective fighter analysis and history
   *
   * Uses UNBIASED search terms to gather factual information about fighter
   * style, statistics, tendencies, and history. Avoids subjective terms like
   * "exciting" or "fun" to prevent confirmation bias in results.
   *
   * The AI will analyze this objective data to determine entertainment potential.
   *
   * Query strategy based on Gemini's recommendation:
   * - "analysis" = technical breakdowns
   * - "statistics" = quantifiable data
   * - "tendencies" = fighting patterns
   * - "record" = win/loss history
   * - "bonuses" = Fight of the Night awards (objective entertainment measure)
   *
   * @param fighterName - Fighter's full name
   * @param eventDate - Optional event date (not used for time filtering)
   * @returns Summarized analysis text
   */
  private async searchFighterNews(
    fighterName: string,
    eventDate?: Date
  ): Promise<string> {
    // Neutral, objective query that gathers factual fighter profile data
    // Avoids biased terms like "exciting", "fun", "knockout" etc.
    const query = `"${fighterName}" fight analysis statistics tendencies record bonuses`

    console.log(`  🔍 Searching: "${query}"`)

    // If custom search function provided, use it
    if (this.searchFunction) {
      return await this.searchFunction(query)
    }

    // Otherwise, use built-in web search
    const searchResults = await this.performWebSearch(query)

    // Extract and summarize relevant information
    return this.summarizeSearchResults(searchResults, fighterName)
  }

  /**
   * Perform web search (implementation will use Claude Code's WebSearch tool)
   *
   * Note: This is a placeholder. The actual implementation will be injected
   * at runtime by the prediction runner which has access to WebSearch tool.
   *
   * @param query - Search query
   * @returns Raw search results text
   */
  private async performWebSearch(query: string): Promise<string> {
    throw new Error(
      'Search function not initialized. Pass searchFunction to constructor or use dependency injection.'
    )
  }

  /**
   * Summarize search results into concise context
   *
   * @param searchResults - Raw search results
   * @param fighterName - Fighter name (for filtering)
   * @returns Summarized text
   */
  private summarizeSearchResults(
    searchResults: string,
    fighterName: string
  ): string {
    // Extract key information (injuries, recent fights, training camp, etc.)
    const lines = searchResults.split('\n')
    const relevantLines: string[] = []

    // Keywords that indicate important context
    const keywords = [
      'injury',
      'injured',
      'training',
      'camp',
      'won',
      'lost',
      'knockout',
      'submission',
      'decision',
      'performance',
      'momentum',
      'streak',
      'pullout',
      'replacement',
      'weight',
      'preparing',
    ]

    for (const line of lines) {
      const lowerLine = line.toLowerCase()

      // Check if line is relevant
      if (
        lowerLine.includes(fighterName.toLowerCase()) ||
        keywords.some((keyword) => lowerLine.includes(keyword))
      ) {
        relevantLines.push(line.trim())

        // Limit total length
        if (relevantLines.join(' ').length >= CONFIG.maxNewsLength) {
          break
        }
      }
    }

    if (relevantLines.length === 0) {
      return 'No significant recent news found.'
    }

    // Join and truncate
    let summary = relevantLines.join(' ').substring(0, CONFIG.maxNewsLength)

    // Truncate at last complete sentence if possible
    const lastPeriod = summary.lastIndexOf('.')
    if (lastPeriod > CONFIG.maxNewsLength * 0.7) {
      summary = summary.substring(0, lastPeriod + 1)
    }

    return summary || 'No significant recent news found.'
  }

  /**
   * Get time filter string for search query based on event date
   *
   * @param eventDate - Date of the event
   * @returns Time filter string (e.g., "past week", "past month")
   */
  private getTimeFilterForQuery(eventDate: Date): string {
    const now = new Date()
    const daysUntilEvent = Math.floor(
      (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (daysUntilEvent <= 7) {
      return 'past week'
    } else if (daysUntilEvent <= 30) {
      return 'past month'
    } else {
      return 'past 3 months'
    }
  }

  /**
   * Check if cache entry is expired
   *
   * @param entry - Cache entry to check
   * @returns True if expired
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
   *
   * @returns Cache stats
   */
  getCacheStats(): {
    size: number
    entries: Array<{ fighter: string; age: number }>
  } {
    const entries = Array.from(this.cache.entries()).map(
      ([fighter, entry]) => ({
        fighter,
        age: Date.now() - entry.timestamp.getTime(),
      })
    )

    return {
      size: this.cache.size,
      entries,
    }
  }
}
