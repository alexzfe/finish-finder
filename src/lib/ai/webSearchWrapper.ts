/**
 * Web Search Wrapper
 *
 * Provides web search functionality for fighter context enrichment.
 * Uses the Brave Search API for broad MMA content coverage.
 */

import { BraveSearchService } from '../search/braveSearch'

/**
 * Search function type
 */
export type SearchFunction = (query: string) => Promise<string>

/**
 * Create a Brave Search function
 *
 * Uses BraveSearchService for broad MMA content coverage.
 * Captures news, analysis, opinions, and community buzz.
 * Requires BRAVE_SEARCH_API_KEY.
 *
 * Free tier: 2,000 queries/month
 *
 * @returns Search function
 */
export function createBraveSearch(): SearchFunction {
  const braveSearch = new BraveSearchService()

  if (!braveSearch.isConfigured()) {
    throw new Error(
      'Brave Search API not configured. Set BRAVE_SEARCH_API_KEY.'
    )
  }

  return async (query: string) => {
    try {
      // Search for MMA analysis and fighter reputation (no time filter)
      // We want all-time reputation and analysis, not just recent news
      const results = await braveSearch.search(query, {
        num: 5,
        // No freshness filter - we want fighter reputation from any time period
      })

      if (!results || results.length === 0) {
        return 'No recent content found.'
      }

      // Combine snippets into searchable text
      const snippets = results
        .map((result) => `${result.title}: ${result.snippet}`)
        .join('\n\n')

      return snippets
    } catch (error) {
      console.error(`Brave search failed: ${error}`)
      return 'Search failed. No recent context available.'
    }
  }
}

/**
 * Get the default search function
 *
 * @returns Search function using Brave Search API
 */
export function getDefaultSearchFunction(): SearchFunction {
  const braveSearch = new BraveSearchService()

  if (!braveSearch.isConfigured()) {
    throw new Error(
      'Brave Search API not configured.\n' +
        'Please set the following environment variable:\n' +
        '  - BRAVE_SEARCH_API_KEY\n\n' +
        'Get your free API key at: https://brave.com/search/api/\n' +
        'Free tier: 2,000 queries/month'
    )
  }

  console.log('✓ Using Brave Search API for web search enrichment')
  return createBraveSearch()
}
