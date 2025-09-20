// Google Custom Search API integration
export interface SearchResult {
  title: string
  link: string
  snippet: string
  displayLink: string
}

export interface GoogleSearchResponse {
  items: SearchResult[]
  searchInformation: {
    totalResults: string
    searchTime: number
  }
}

export class GoogleSearchService {
  private apiKey: string
  private searchEngineId: string

  constructor() {
    this.apiKey = process.env.GOOGLE_SEARCH_API_KEY || ''
    this.searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID || ''
  }

  // Check if API is configured
  isConfigured(): boolean {
    return !!(this.apiKey && this.searchEngineId)
  }

  // Search the web using Google Custom Search API
  async search(query: string, options: {
    num?: number  // Number of results (1-10)
    dateRestrict?: string  // e.g., 'd7' for past week, 'm1' for past month
    siteSearch?: string  // Restrict to specific site
  } = {}): Promise<SearchResult[]> {

    if (!this.isConfigured()) {
      throw new Error('Google Search API not configured. Please set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables.')
    }

    const { num = 10, dateRestrict, siteSearch } = options

    // Build search URL
    const searchParams = new URLSearchParams({
      key: this.apiKey,
      cx: this.searchEngineId,
      q: query,
      num: num.toString()
    })

    if (dateRestrict) {
      searchParams.append('dateRestrict', dateRestrict)
    }

    if (siteSearch) {
      searchParams.append('siteSearch', siteSearch)
    }

    const searchUrl = `https://www.googleapis.com/customsearch/v1?${searchParams.toString()}`

    try {
      console.log(`🔍 Google Search: "${query}"`)

      const response = await fetch(searchUrl)

      if (!response.ok) {
        const errorData = await response.text()
        throw new Error(`Google Search API error: ${response.status} - ${errorData}`)
      }

      const data: GoogleSearchResponse = await response.json()

      console.log(`✅ Found ${data.items?.length || 0} search results`)

      return data.items || []

    } catch (error) {
      console.error('❌ Google Search error:', error)
      throw error
    }
  }

  // Search specifically for UFC events
  async searchUFCEvents(query: string): Promise<SearchResult[]> {
    return this.search(query, {
      num: 10,
      dateRestrict: 'm2', // Past 2 months of content for more comprehensive results
      siteSearch: 'ufc.com' // Focus on official UFC site
    })
  }

  // Search for UFC schedule information including Fight Nights
  async searchUFCSchedule(afterDate: string): Promise<SearchResult[]> {
    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().toLocaleString('default', { month: 'long' })
    const nextMonth = new Date(new Date().setMonth(new Date().getMonth() + 1)).toLocaleString('default', { month: 'long' })

    const queries = [
      `UFC schedule ${afterDate} upcoming events ${currentYear}`,
      `"UFC Fight Night" ${currentMonth} ${currentYear}`,
      `"UFC Fight Night" ${nextMonth} ${currentYear}`,
      `UFC ${currentYear} schedule events Fight Night`,
      `next UFC fights ${afterDate}`,
      `UFC Fight Night upcoming ${currentMonth} ${currentYear}`,
      `UFC events this month ${currentMonth} ${currentYear}`,
      `UFC events calendar October ${currentYear}`,
      `UFC events calendar November ${currentYear}`,
      `UFC 308 UFC 309 UFC 310 ${currentYear}`,
      `upcoming UFC numbered events ${currentYear}`,
      `UFC schedule remainder ${currentYear}`,
      `UFC fight card main card preliminary ${currentYear}`,
      `UFC event fight lineup ${currentMonth} ${currentYear}`,
      `UFC main event co-main event ${currentYear}`
    ]

    const allResults: SearchResult[] = []

    for (const query of queries) {
      try {
        const results = await this.searchUFCEvents(query)
        allResults.push(...results)
      } catch (error) {
        console.warn(`Search failed for query: "${query}"`, error)
      }
    }

    // Remove duplicates based on URL
    const uniqueResults = allResults.filter((result, index, self) =>
      index === self.findIndex(r => r.link === result.link)
    )

    return uniqueResults
  }
}