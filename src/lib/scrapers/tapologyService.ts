import axios from 'axios'
import * as cheerio from 'cheerio'

interface TapologyUFCEvent {
  id: string
  name: string
  date: string
  venue: string
  location: string
  tapologyUrl?: string
  broadcast?: string
  mainEvent?: string
  source: 'tapology'
}

interface TapologyFight {
  id: string
  fighter1Name: string
  fighter2Name: string
  weightClass: string
  cardPosition: string
  titleFight: boolean
}

export class TapologyUFCService {
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
    const delay = 1200 + Math.random() * 1800 // 1.2-3 seconds
    return new Promise(resolve => setTimeout(resolve, delay))
  }

  async getUpcomingEvents(limit: number = 10): Promise<TapologyUFCEvent[]> {
    console.log('🔍 Fetching upcoming UFC events from Tapology...')

    try {
      await this.humanLikeDelay()

      const url = 'https://www.tapology.com/fightcenter/promotions/1-ultimate-fighting-championship-ufc'
      const response = await axios.get(url, {
        headers: this.getBrowserHeaders(),
        timeout: 15000
      })

      const $ = cheerio.load(response.data)
      const events: TapologyUFCEvent[] = []

      // Look for event listings - Tapology typically uses specific CSS classes
      const eventElements = $('.fightcenter_event_listing, .event_listing, .promotion_event')

      if (!eventElements.length) {
        // Try alternative selectors
        const alternativeElements = $('div').filter((_, el) => {
          const text = $(el).text()
          return text.includes('UFC') && (text.includes('2025') || text.includes('2024'))
        })

        if (alternativeElements.length > 0) {
          console.log('⚠️ Using alternative selector for Tapology events')
          this.parseAlternativeEvents($, alternativeElements, events, limit)
        } else {
          console.warn('⚠️ Could not find event elements on Tapology page')
          return []
        }
      } else {
        this.parseStandardEvents($, eventElements, events, limit)
      }

      // Sort events by date (upcoming first)
      events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

      console.log(`✅ Successfully scraped ${events.length} upcoming UFC events from Tapology`)
      return events.slice(0, limit)

    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 403) {
          console.log('⚠️ Tapology blocked the request with HTTP 403')
          throw new Error('TAPOLOGY_BLOCKED')
        }
        console.error(`❌ Tapology request failed: ${error.response?.status} ${error.response?.statusText}`)
      } else {
        console.error('❌ Tapology scraping failed:', (error as any)?.message || error)
      }
      throw error
    }
  }

  private parseStandardEvents($: cheerio.CheerioAPI, eventElements: cheerio.Cheerio<any>, events: TapologyUFCEvent[], limit: number) {
    eventElements.each((index, element) => {
      if (events.length >= limit) return false

      const $event = $(element)

      // Extract event link and name
      const eventLink = $event.find('a[href*="/fightcenter/events/"]').first()
      const eventName = eventLink.text().trim() || $event.find('.event_name, .promotion_event_name').text().trim()

      if (!eventName || !eventName.includes('UFC')) return

      const tapologyUrl = eventLink.attr('href') ?
        `https://www.tapology.com${eventLink.attr('href')}` : undefined

      // Extract date
      const dateText = $event.find('.event_date, .promotion_event_date, .date').text().trim()

      // Extract location information
      const venueText = $event.find('.venue, .event_venue, .location').text().trim()
      const locationParts = this.parseVenueLocation(venueText)

      // Extract broadcast info
      const broadcast = $event.find('.broadcast, .tv, .network').text().trim()

      // Extract main event
      const mainEvent = $event.find('.main_event, .headline').text().trim()

      if (eventName && dateText) {
        const parsedDate = this.parseTapologyDate(dateText)

        // Only include future events
        if (new Date(parsedDate) > new Date()) {
          const id = eventName.toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')

          events.push({
            id,
            name: eventName,
            date: parsedDate,
            venue: locationParts.venue,
            location: locationParts.location,
            tapologyUrl,
            broadcast: broadcast || undefined,
            mainEvent: mainEvent || undefined,
            source: 'tapology'
          })

          console.log(`📅 Found: ${eventName} - ${parsedDate} at ${locationParts.venue}, ${locationParts.location}`)
        }
      }
    })
  }

  private parseAlternativeEvents($: cheerio.CheerioAPI, elements: cheerio.Cheerio<any>, events: TapologyUFCEvent[], limit: number) {
    // Implementation for alternative parsing when standard selectors don't work
    elements.each((index, element) => {
      if (events.length >= limit) return false

      const $element = $(element)
      const text = $element.text()

      // Basic parsing for UFC events mentioned in text
      const ufcMatch = text.match(/UFC\s+(\d+|Fight Night|on ESPN)/i)
      if (ufcMatch) {
        const eventName = ufcMatch[0]
        const id = eventName.toLowerCase().replace(/\s+/g, '-')

        // Try to extract date from surrounding text
        const dateMatch = text.match(/\b\w+\s+\d{1,2},?\s+\d{4}\b/)
        const parsedDate = dateMatch ? this.parseTapologyDate(dateMatch[0]) : new Date().toISOString().split('T')[0]

        events.push({
          id,
          name: eventName,
          date: parsedDate,
          venue: 'TBA',
          location: 'TBA',
          source: 'tapology'
        })
      }
    })
  }

  private parseVenueLocation(venueText: string): { venue: string, location: string } {
    if (!venueText) return { venue: 'TBA', location: 'TBA' }

    // Common patterns: "Venue Name, City, State/Country"
    const parts = venueText.split(',').map(p => p.trim())

    if (parts.length >= 3) {
      return {
        venue: parts[0],
        location: parts.slice(1).join(', ')
      }
    } else if (parts.length === 2) {
      return {
        venue: parts[0],
        location: parts[1]
      }
    } else {
      return {
        venue: venueText,
        location: 'TBA'
      }
    }
  }

  private parseTapologyDate(dateText: string): string {
    try {
      // Clean up the date text
      const cleaned = dateText.replace(/\s+/g, ' ').trim()

      // Handle "TBA" or similar
      if (cleaned.toLowerCase().includes('tba') || cleaned.toLowerCase().includes('announced')) {
        return new Date().toISOString().split('T')[0]
      }

      // Try to parse the date
      const parsed = new Date(cleaned)

      if (isNaN(parsed.getTime())) {
        console.warn(`⚠️ Could not parse Tapology date: ${dateText}`)
        return new Date().toISOString().split('T')[0]
      }

      return parsed.toISOString().split('T')[0]

    } catch (error) {
      console.warn(`⚠️ Tapology date parsing error for "${dateText}":`, (error as any)?.message || error)
      return new Date().toISOString().split('T')[0]
    }
  }

  async getEventFights(tapologyUrl: string): Promise<{ fights: TapologyFight[], fighters: any[] }> {
    console.log(`🔍 Fetching fight card from: ${tapologyUrl}`)

    try {
      await this.humanLikeDelay()

      const response = await axios.get(tapologyUrl, {
        headers: this.getBrowserHeaders(),
        timeout: 15000
      })

      const $ = cheerio.load(response.data)
      const fights: TapologyFight[] = []

      // Look for fight listings on the event page
      const fightElements = $('.fight_card_bout, .bout, .fight_listing')

      fightElements.each((index, element) => {
        const $fight = $(element)

        // Extract fighter names
        const fighters = $fight.find('.fighter_name, .bout_fighter').map((_, el) => $(el).text().trim()).get()

        if (fighters.length >= 2) {
          const weightClass = $fight.find('.weight_class, .bout_weight').text().trim() || 'Unknown'
          const titleFight = $fight.text().toLowerCase().includes('title') || $fight.find('.title').length > 0

          const fightId = `${fighters[0]}-vs-${fighters[1]}`.toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')

          fights.push({
            id: fightId,
            fighter1Name: fighters[0],
            fighter2Name: fighters[1],
            weightClass,
            cardPosition: index === 0 ? 'main' : 'preliminary',
            titleFight
          })
        }
      })

      console.log(`✅ Found ${fights.length} fights on Tapology event page`)

      return {
        fights,
        fighters: [] // TODO: Extract detailed fighter information
      }

    } catch (error) {
      console.error('❌ Failed to fetch Tapology fight details:', (error as any)?.message || error)
      return { fights: [], fighters: [] }
    }
  }
}