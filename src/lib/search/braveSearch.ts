/**
 * Brave Search Service
 *
 * Provides web search functionality using the Brave Search API.
 * Free tier: 2,000 queries/month
 *
 * API Documentation: https://brave.com/search/api/
 */

/**
 * Search result from Brave Search API
 */
export interface BraveSearchResult {
  title: string
  url: string
  description: string
  age?: string
  page_age?: string
  profile?: {
    name?: string
    url?: string
  }
}

/**
 * Brave Search API response structure
 */
interface BraveSearchResponse {
  type: string
  web?: {
    type: string
    results: BraveSearchResult[]
  }
  query?: {
    original: string
  }
}

/**
 * Freshness filter options for Brave Search
 */
export type BraveFreshness = 'pd' | 'pw' | 'pm' | 'py' | undefined

/**
 * Search options for Brave Search
 */
export interface BraveSearchOptions {
  num?: number // Number of results (default: 10)
  freshness?: BraveFreshness // pd=past day, pw=past week, pm=past month, py=past year
  country?: string // Country code (default: 'us')
  searchLang?: string // Language code (default: 'en')
}

/**
 * Normalized search result format (compatible with existing code)
 */
export interface SearchResult {
  title: string
  link: string
  snippet: string
}

/**
 * Brave Search Service
 *
 * Integrates with Brave Search API for web search queries.
 * Requires BRAVE_SEARCH_API_KEY environment variable.
 */
export class BraveSearchService {
  private apiKey: string
  private readonly BASE_URL = 'https://api.search.brave.com/res/v1/web/search'

  constructor() {
    this.apiKey = process.env.BRAVE_SEARCH_API_KEY || ''
  }

  /**
   * Check if the service is properly configured
   *
   * @returns True if API key is set
   */
  isConfigured(): boolean {
    return !!this.apiKey
  }

  /**
   * Search the web using Brave Search API
   *
   * @param query - Search query string
   * @param options - Search options (num, freshness, country, searchLang)
   * @returns Array of search results
   */
  async search(
    query: string,
    options: BraveSearchOptions = {}
  ): Promise<SearchResult[]> {
    if (!this.isConfigured()) {
      throw new Error('Brave Search API is not configured')
    }

    const params = new URLSearchParams({
      q: query,
      count: (options.num || 10).toString(),
      country: options.country || 'us',
      search_lang: options.searchLang || 'en',
    })

    if (options.freshness) {
      params.append('freshness', options.freshness)
    }

    try {
      const response = await fetch(`${this.BASE_URL}?${params}`, {
        headers: {
          'X-Subscription-Token': this.apiKey,
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Brave Search API returned status ${response.status}: ${errorText}`
        )
      }

      const data: BraveSearchResponse = await response.json()

      if (!data.web || !data.web.results) {
        return []
      }

      // Normalize to SearchResult format
      return data.web.results.map((result) => ({
        title: result.title,
        link: result.url,
        snippet: result.description,
      }))
    } catch (error) {
      console.error(`Brave Search API error: ${error}`)
      throw error
    }
  }
}
