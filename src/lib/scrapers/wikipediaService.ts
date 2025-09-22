import axios from 'axios'
import * as cheerio from 'cheerio'

interface WikipediaUFCEvent {
  id: string
  name: string
  date: string
  venue: string
  location: string
  wikipediaUrl?: string
  source: 'wikipedia'
}

export class WikipediaUFCService {
  private getBrowserHeaders(): Record<string, string> {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0'
    }
  }

  private async humanLikeDelay(): Promise<void> {
    const delay = 800 + Math.random() * 1200 // 0.8-2 seconds (shorter for Wikipedia)
    return new Promise(resolve => setTimeout(resolve, delay))
  }

  async getUpcomingEvents(limit: number = 10): Promise<WikipediaUFCEvent[]> {
    console.log('🔍 Fetching upcoming UFC events from Wikipedia...')

    try {
      await this.humanLikeDelay()

      const url = 'https://en.wikipedia.org/wiki/List_of_UFC_events'
      const response = await axios.get(url, {
        headers: this.getBrowserHeaders(),
        timeout: 10000
      })

      const $ = cheerio.load(response.data)
      const events: WikipediaUFCEvent[] = []

      // Look for tables with sticky-header class that contain scheduled events
      const tables = $('table.sticky-header')

      if (!tables.length) {
        console.warn('⚠️ Could not find sticky-header tables on Wikipedia')
        return []
      }

      // Find the table that contains future events by looking for dates in 2024/2025
      let targetTable: cheerio.Cheerio<any> | undefined

      for (let i = 0; i < tables.length; i++) {
        const table = tables.eq(i)
        const tableText = table.text()

        if (tableText.includes('2024') || tableText.includes('2025') || tableText.includes('2026')) {
          // Check if this table has event data (should have 4+ columns)
          const headerCells = table.find('tr').first().find('th, td')
          if (headerCells.length >= 4) {
            targetTable = table
            break
          }
        }
      }

      if (!targetTable) {
        console.warn('⚠️ Could not find scheduled events table with future dates')
        return []
      }

      // Parse table rows (skip header row)
      const rows = targetTable.find('tr').slice(1)

      rows.each((index: number, element: any) => {
        if (events.length >= limit) return false

        const $row = $(element)
        const cells = $row.find('td')

        if (cells.length >= 4) {
          // Use nth-child selectors as specified in the analysis
          const eventCell = $(cells[0]) // Event name
          const dateCell = $(cells[1])  // Date
          const venueCell = $(cells[2]) // Venue
          const locationCell = $(cells[3]) // Location

          // Extract event name and Wikipedia link
          const eventLink = eventCell.find('a').first()
          const eventName = eventLink.text().trim() || eventCell.text().trim()
          const wikipediaUrl = eventLink.attr('href') ?
            `https://en.wikipedia.org${eventLink.attr('href')}` : undefined

          // Extract date - clean up any extra whitespace or formatting
          const dateText = dateCell.text().trim().replace(/\s+/g, ' ')

          // Extract venue - remove any citations or extra formatting
          const venue = venueCell.text().trim().replace(/\[\d+\]/g, '').trim()

          // Extract location - remove any citations or extra formatting
          const location = locationCell.text().trim().replace(/\[\d+\]/g, '').trim()

          // Only process if we have the essential data and it's a future event
          if (eventName && dateText && this.isFutureDate(dateText)) {
            // Generate ID from event name
            const id = eventName.toLowerCase()
              .replace(/[^a-z0-9]/g, '-')
              .replace(/-+/g, '-')
              .replace(/^-|-$/g, '')

            // Parse and format date
            const parsedDate = this.parseWikipediaDate(dateText)

            events.push({
              id,
              name: eventName,
              date: parsedDate,
              venue: venue || 'TBA',
              location: location || 'TBA',
              wikipediaUrl,
              source: 'wikipedia'
            })

            console.log(`📅 Found: ${eventName} - ${parsedDate} at ${venue || 'TBA'}, ${location || 'TBA'}`)
          }
        }
      })

      console.log(`✅ Successfully scraped ${events.length} upcoming UFC events from Wikipedia`)
      return events

    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 403) {
          console.log('⚠️ Wikipedia blocked the request with HTTP 403')
          throw new Error('WIKIPEDIA_BLOCKED')
        }
        console.error(`❌ Wikipedia request failed: ${error.response?.status} ${error.response?.statusText}`)
      } else {
        console.error('❌ Wikipedia scraping failed:', (error as any)?.message || error)
      }
      throw error
    }
  }

  private isFutureDate(dateText: string): boolean {
    try {
      // Quick check for obvious future indicators
      if (dateText.toLowerCase().includes('tba') || dateText.toLowerCase().includes('announced')) {
        return true
      }

      // Check if the date string contains a year that's current or future
      const currentYear = new Date().getFullYear()
      const yearMatch = dateText.match(/\b(20\d{2})\b/)

      if (yearMatch) {
        const eventYear = parseInt(yearMatch[1])
        return eventYear >= currentYear
      }

      // Try to parse the date and check if it's in the future
      const parsed = new Date(dateText)
      if (!isNaN(parsed.getTime())) {
        return parsed > new Date()
      }

      // If we can't determine, assume it might be future (be permissive)
      return true

    } catch (error) {
      // If parsing fails, assume it might be future
      return true
    }
  }

  private parseWikipediaDate(dateText: string): string {
    try {
      // Wikipedia dates can be in various formats:
      // "January 25, 2025", "Sep 13, 2025", "TBA", etc.

      if (dateText.toLowerCase().includes('tba') || dateText.toLowerCase().includes('announced')) {
        return new Date().toISOString().split('T')[0] // Use today as placeholder
      }

      // Clean up the date text - remove extra whitespace and formatting
      let cleanDate = dateText.trim().replace(/\s+/g, ' ')

      // Try to parse various Wikipedia date formats
      let parsed: Date | null = null

      // Try direct parsing first
      parsed = new Date(cleanDate)
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0]
      }

      // Try parsing formats like "Sep 13, 2025"
      const shortFormatMatch = cleanDate.match(/(\w{3})\s+(\d{1,2}),?\s+(\d{4})/)
      if (shortFormatMatch) {
        const [, month, day, year] = shortFormatMatch
        parsed = new Date(`${month} ${day}, ${year}`)
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0]
        }
      }

      // Try parsing formats like "13 Sep 2025"
      const altFormatMatch = cleanDate.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/)
      if (altFormatMatch) {
        const [, day, month, year] = altFormatMatch
        parsed = new Date(`${month} ${day}, ${year}`)
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0]
        }
      }

      // If all parsing attempts fail
      console.warn(`⚠️ Could not parse Wikipedia date: ${dateText}`)
      return new Date().toISOString().split('T')[0] // Use today as fallback

    } catch (error) {
      console.warn(`⚠️ Date parsing error for "${dateText}":`, (error as any)?.message || error)
      return new Date().toISOString().split('T')[0] // Use today as fallback
    }
  }

  async getEventDetails(wikipediaUrl: string): Promise<any> {
    // This would fetch detailed fight card information from the event's Wikipedia page
    // For now, return basic structure
    console.log(`🔍 Fetching event details from: ${wikipediaUrl}`)

    // TODO: Implement detailed event scraping
    return {
      fights: [],
      fighters: []
    }
  }
}