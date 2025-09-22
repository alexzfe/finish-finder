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

      // Find the "Scheduled events" section
      const scheduledSection = $('span#Scheduled_events').parent()

      if (!scheduledSection.length) {
        console.warn('⚠️ Could not find Scheduled events section on Wikipedia')
        return []
      }

      // Look for the table after the Scheduled events heading
      const table = scheduledSection.nextAll('table').first()

      if (!table.length) {
        console.warn('⚠️ Could not find events table in Scheduled events section')
        return []
      }

      // Parse table rows (skip header row)
      const rows = table.find('tr').slice(1)

      rows.each((index, element) => {
        if (events.length >= limit) return false

        const $row = $(element)
        const cells = $row.find('td')

        if (cells.length >= 4) {
          const eventCell = $(cells[0])
          const dateCell = $(cells[1])
          const venueCell = $(cells[2])
          const locationCell = $(cells[3])

          // Extract event name and Wikipedia link
          const eventLink = eventCell.find('a').first()
          const eventName = eventLink.text().trim() || eventCell.text().trim()
          const wikipediaUrl = eventLink.attr('href') ?
            `https://en.wikipedia.org${eventLink.attr('href')}` : undefined

          // Extract date
          const dateText = dateCell.text().trim()

          // Extract venue
          const venue = venueCell.text().trim()

          // Extract location
          const location = locationCell.text().trim()

          if (eventName && dateText && venue && location) {
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
              venue,
              location,
              wikipediaUrl,
              source: 'wikipedia'
            })

            console.log(`📅 Found: ${eventName} - ${parsedDate} at ${venue}, ${location}`)
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

  private parseWikipediaDate(dateText: string): string {
    try {
      // Wikipedia dates are typically in format like "January 25, 2025"
      // or "TBA" for to be announced

      if (dateText.toLowerCase().includes('tba') || dateText.toLowerCase().includes('announced')) {
        return new Date().toISOString().split('T')[0] // Use today as placeholder
      }

      // Try to parse the date
      const parsed = new Date(dateText)

      if (isNaN(parsed.getTime())) {
        console.warn(`⚠️ Could not parse date: ${dateText}`)
        return new Date().toISOString().split('T')[0] // Use today as fallback
      }

      return parsed.toISOString().split('T')[0] // Return YYYY-MM-DD format

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