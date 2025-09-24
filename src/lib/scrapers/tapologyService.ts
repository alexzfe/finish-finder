import axios from 'axios'
import * as cheerio from 'cheerio'
import { toWeightClass } from '../utils/weight-class'

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
  fighter1Nickname?: string
  fighter2Name: string
  fighter2Nickname?: string
  weightClass: string
  cardPosition: string
  titleFight: boolean
}

export interface TapologyFighterInfo {
  name: string
  nickname?: string
  record?: string
  wins?: number
  losses?: number
  draws?: number
  url?: string
}

export class TapologyUFCService {
  private eventsCache: { data: TapologyUFCEvent[]; ts: number } | null = null
  private fighterRecordCache: Map<string, { record?: string; wins?: number; losses?: number; draws?: number }> = new Map()
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

  private normalize(str: string): string {
    return (str || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  private capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
  }

  private extractWeightClass($fight: cheerio.Cheerio<any>): string {
    // Strategy 1: CSS selectors for weight class elements
    const weightSelectors = [
      '.weight_class', '.bout_weight', '.weight', '.division',
      '.weight-class', '.bout-weight', '[class*="weight"]',
      '.card-weight', '.fight-weight', '.bout-division'
    ]

    for (const selector of weightSelectors) {
      const element = $fight.find(selector)
      if (element.length > 0) {
        const text = element.text().trim()
        if (text && text.length > 2) {
          return toWeightClass(text, 'unknown')
        }
      }
    }

    // Strategy 2: Look for ranking links that often contain weight class info
    const rankingLinks = $fight.find('a[href*="/rankings/"]')
    for (let i = 0; i < rankingLinks.length; i++) {
      const link = rankingLinks.eq(i)
      const href = link.attr('href') || ''
      const linkText = link.text().trim()

      // Extract from URL like "/rankings/ufc-heavyweight" or "/rankings/mma-bantamweight"
      const hrefMatch = href.match(/rankings\/(?:ufc-|mma-)?(\w+)/)
      if (hrefMatch && hrefMatch[1]) {
        const candidate = hrefMatch[1]
        const normalized = toWeightClass(candidate, 'unknown')
        if (normalized !== 'unknown') return normalized
      }

      // Extract from link text
      if (linkText.length > 2) {
        const normalized = toWeightClass(linkText, 'unknown')
        if (normalized !== 'unknown') return normalized
      }
    }

    // Strategy 3: Text pattern matching for common weight class mentions
    const fightText = $fight.text() || ''
    const patterns = [
      /(\w+weight)\s+(?:bout|fight|division|title)/i,
      /(?:bout|fight|division)\s+(\w+weight)/i,
      /(strawweight|flyweight|bantamweight|featherweight|lightweight|welterweight|middleweight|light\s*heavyweight|heavyweight)/i,
      /(women'?s\s+(?:strawweight|flyweight|bantamweight|featherweight))/i,
      /(\d+\s*lbs?\s+(?:bout|fight|division))/i
    ]

    for (const pattern of patterns) {
      const match = fightText.match(pattern)
      if (match && match[1]) {
        const normalized = toWeightClass(match[1], 'unknown')
        if (normalized !== 'unknown') return normalized
      }
    }

    // Strategy 4: Pound-based mapping for catchweight/specific weight mentions
    const poundMatches = fightText.match(/(\d+)\s*lbs?/gi)
    if (poundMatches) {
      for (const poundMatch of poundMatches) {
        const weight = parseInt(poundMatch.match(/\d+/)?.[0] || '0')
        if (weight > 0) {
          // Map weight ranges to divisions (heavier classes take priority)
          if (weight >= 206) return toWeightClass('heavyweight', 'unknown')
          if (weight >= 186) return toWeightClass('light_heavyweight', 'unknown')
          if (weight >= 171) return toWeightClass('middleweight', 'unknown')
          if (weight >= 156) return toWeightClass('welterweight', 'unknown')
          if (weight >= 146) return toWeightClass('lightweight', 'unknown')
          if (weight >= 136) return toWeightClass('featherweight', 'unknown')
          if (weight >= 126) return toWeightClass('bantamweight', 'unknown')
          if (weight >= 116) return toWeightClass('flyweight', 'unknown')
          if (weight >= 106) return toWeightClass('strawweight', 'unknown')
        }
      }
    }

    // Fallback to unknown
    return toWeightClass('unknown', 'unknown')
  }

  private extractUfcNumber(name: string): string | null {
    const m = name.match(/ufc\s*(\d+)/i)
    return m ? m[1] : null
  }

  async findMatchingEventByNameDate(name: string, date: string, limit: number = 30): Promise<TapologyUFCEvent | null> {
    try {
      const now = Date.now()
      const cacheValid = this.eventsCache && (now - this.eventsCache.ts) < 10 * 60 * 1000
      const listings = cacheValid ? this.eventsCache!.data : await this.getUpcomingEvents(limit)
      if (!cacheValid) {
        this.eventsCache = { data: listings, ts: now }
      }
      const targetNum = this.extractUfcNumber(name)
      const normName = this.normalize(name)

      // 1) Exact date + UFC number match
      if (targetNum) {
        const cand = listings.find(e => e.date === date && this.extractUfcNumber(e.name) === targetNum)
        if (cand) return cand
      }

      // 2) Exact date + fuzzy name match
      const dateMatches = listings.filter(e => e.date === date)
      if (dateMatches.length) {
        const byName = dateMatches.find(e => this.normalize(e.name) === normName || this.normalize(e.name).includes(targetNum || ''))
        if (byName) return byName
        return dateMatches[0]
      }

      // 3) Fallback: UFC number only
      if (targetNum) {
        const byNum = listings.find(e => this.extractUfcNumber(e.name) === targetNum)
        if (byNum) return byNum
      }

      return null
    } catch {
      return null
    }
  }

  async getFighterRecordByName(name: string): Promise<{ record?: string; wins?: number; losses?: number; draws?: number } | null> {
    try {
      const key = this.normalize(name)
      const cached = this.fighterRecordCache.get(key)
      if (cached) return cached
      await this.humanLikeDelay()
      const searchUrl = `https://www.tapology.com/search?term=${encodeURIComponent(name)}`
      const searchRes = await axios.get(searchUrl, { headers: this.getBrowserHeaders(), timeout: 15000 })
      const $ = cheerio.load(searchRes.data)

      const fighterLink = $('a[href*="/fighters/"]').first().attr('href')
      if (!fighterLink) return null

      const fighterUrl = `https://www.tapology.com${fighterLink}`
      await this.humanLikeDelay()
      const fighterRes = await axios.get(fighterUrl, { headers: this.getBrowserHeaders(), timeout: 15000 })
      const $$ = cheerio.load(fighterRes.data)

      const text = $$.text()
      const recordPattern = /\b(\d+)-(\d+)(?:-(\d+))?\b/
      // Prefer patterns like "Pro MMA Record: 22-3-0"
      let match = text.match(/Pro\s+MMA\s+Record[^\d]*(\d+)-(\d+)(?:-(\d+))?/i)
      if (!match) match = text.match(recordPattern)
      if (!match) return null

      const record = `${match[1]}-${match[2]}-${match[3] ?? '0'}`
      const info = { record, wins: Number(match[1]), losses: Number(match[2]), draws: Number(match[3] ?? 0) }
      this.fighterRecordCache.set(key, info)
      return info
    } catch {
      return null
    }
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
        console.log('⚠️ Standard selectors found no events, trying alternatives...')

        // Try multiple alternative strategies
        const strategies = [
          // Strategy 1: Look for any element containing UFC and year
          () => $('div, section, article, li, tr').filter((_, el) => {
            const text = $(el).text()
            return text.includes('UFC') && (text.includes('2025') || text.includes('2024'))
          }),

          // Strategy 2: Look for elements with links
          () => $('div, section, article, li, tr').filter((_, el) => {
            const $el = $(el)
            const hasLinks = $el.find('a').length > 0
            const text = $el.text()
            return hasLinks && text.includes('UFC')
          }),

          // Strategy 3: Look for table rows or list items with UFC content
          () => $('tr, li, .row, .item').filter((_, el) => {
            const text = $(el).text()
            return text.includes('UFC')
          }),

          // Strategy 4: Very broad search - any element with UFC
          () => $('*').filter((_, el) => {
            const text = $(el).text()
            const hasUfc = text.includes('UFC')
            const hasLink = $(el).find('a').length > 0
            const isReasonableSize = text.length > 10 && text.length < 500
            return hasUfc && hasLink && isReasonableSize
          })
        ]

        let alternativeElements: cheerio.Cheerio<any> | null = null

        for (let i = 0; i < strategies.length; i++) {
          const elements = strategies[i]()
          console.log(`🔍 Strategy ${i + 1}: Found ${elements.length} elements`)

          if (elements.length > 0 && elements.length < 50) { // Reasonable number
            alternativeElements = elements
            console.log(`✅ Using strategy ${i + 1} with ${elements.length} elements`)
            break
          } else if (elements.length >= 50) {
            console.log(`⚠️ Strategy ${i + 1} returned too many elements (${elements.length}), trying next...`)
          }
        }

        if (alternativeElements && alternativeElements.length > 0) {
          console.log('⚠️ Using alternative selector for Tapology events')
          this.parseAlternativeEvents($, alternativeElements, events, limit)
        } else {
          console.warn('⚠️ Could not find event elements on Tapology page with any strategy')

          // Last resort: dump some page structure for debugging
          console.log('📄 Page title:', $('title').text())
          console.log('📄 Page has UFC mentions:', $('*:contains("UFC")').length)
          console.log('📄 Total links on page:', $('a').length)

          return []
        }
      } else {
        console.log(`✅ Standard selectors found ${eventElements.length} events`)
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

      // Extract event link and name - try multiple selectors
      let eventLink = $event.find('a[href*="/fightcenter/events/"]').first()
      if (!eventLink.length) {
        eventLink = $event.find('a[href*="/events/"]').first()
      }
      if (!eventLink.length) {
        eventLink = $event.find('a').filter((_, el) => {
          const href = $(el).attr('href') || ''
          const text = $(el).text().toLowerCase()
          return text.includes('ufc') && (href.includes('/events/') || href.includes('/fightcenter/'))
        }).first()
      }

      const eventName = eventLink.text().trim() ||
                       $event.find('.event_name, .promotion_event_name').text().trim() ||
                       $event.text().match(/UFC[^,\n]*/i)?.[0]?.trim()

      if (!eventName || !eventName.includes('UFC')) return

      const href = eventLink.attr('href')
      const tapologyUrl = href ?
        (href.startsWith('http') ? href : `https://www.tapology.com${href}`) : undefined

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
    console.log(`🔍 Alternative parsing: Found ${elements.length} elements to parse`)

    const processedUrls = new Set<string>() // Track processed event URLs to avoid duplicates

    elements.each((index, element) => {
      if (events.length >= limit) return false

      const $element = $(element)
      const text = $element.text()

      // Process more elements to find all events (increased from 10 to 25)
      if (index >= 25) return false

      // Look for UFC event links specifically
      const eventLinks = $element.find('a[href*="/fightcenter/events/"]')

      if (eventLinks.length === 0) return // Skip elements without direct event links

      console.log(`🎯 Element ${index}: Found ${eventLinks.length} event links`)

      eventLinks.each((_, linkEl) => {
        if (events.length >= limit) return false

        const $link = $(linkEl)
        const href = $link.attr('href')
        const linkText = $link.text().trim()

        if (!href) return

        const tapologyUrl = href.startsWith('http') ? href : `https://www.tapology.com${href}`

        // Skip if we've already processed this URL
        if (processedUrls.has(tapologyUrl)) {
          return
        }
        processedUrls.add(tapologyUrl)

        // Extract event name from link text, prioritize fuller names
        let eventName = linkText

        // Look for UFC patterns in the link text
        const ufcPatterns = [
          /UFC\s+\d+/i,
          /UFC\s+Fight\s+Night/i,
          /UFC\s+on\s+ESPN/i
        ]

        let foundPattern = false
        for (const pattern of ufcPatterns) {
          const match = linkText.match(pattern)
          if (match) {
            eventName = match[0]
            foundPattern = true
            break
          }
        }

        if (!foundPattern && !linkText.toLowerCase().includes('ufc')) {
          return // Skip if no UFC pattern found
        }

        const id = this.normalize(eventName)

        // Try to extract date from the surrounding text
        const $parent = $link.closest('div, section, article, li, tr')
        const parentText = $parent.text()

        // Look for date patterns in the text (focusing on 2025 and beyond)
        const datePatterns = [
          /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(?:2025|2026|2027)\b/i,
          /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+(?:2025|2026|2027)\b/i,
          /\b\d{1,2}\/\d{1,2}\/(?:2025|2026|2027)\b/,
          /\b(?:2025|2026|2027)-\d{2}-\d{2}\b/
        ]

        let parsedDate: string = ''
        let foundDate = false

        for (const pattern of datePatterns) {
          const match = parentText.match(pattern)
          if (match) {
            try {
              const dateObj = new Date(match[0])
              if (!isNaN(dateObj.getTime()) && dateObj > new Date()) {
                parsedDate = dateObj.toISOString().split('T')[0]
                foundDate = true
                break
              }
            } catch (e) {
              // Continue to next pattern
            }
          }
        }

        // Fallback: set to near future if no date found
        if (!foundDate) {
          const futureDate = new Date()
          futureDate.setMonth(futureDate.getMonth() + 1)
          parsedDate = futureDate.toISOString().split('T')[0]
        }

        console.log(`✅ Adding event: "${eventName}" (${parsedDate}) -> ${tapologyUrl}`)

        events.push({
          id,
          name: eventName,
          date: parsedDate,
          venue: 'TBA',
          location: 'TBA',
          source: 'tapology',
          tapologyUrl
        })
      })
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

  async getEventFights(tapologyUrl: string): Promise<{ fights: TapologyFight[], fighters: TapologyFighterInfo[] }> {
    console.log(`🔍 Fetching fight card from: ${tapologyUrl}`)

    try {
      await this.humanLikeDelay()

      const response = await axios.get(tapologyUrl, {
        headers: this.getBrowserHeaders(),
        timeout: 15000
      })

      const $ = cheerio.load(response.data)
      const fights: TapologyFight[] = []
      const fighterInfos: Map<string, TapologyFighterInfo> = new Map()

      // Look for fight links and fighter patterns on the event page
      const boutLinks = $('a[href*="/bouts/"]')
      console.log(`🥊 Found ${boutLinks.length} bout links on event page`)

      // Also collect all fighter links for additional context
      const allFighterLinks = $('a[href*="/fighters/"]')
      console.log(`👤 Found ${allFighterLinks.length} fighter links`)

      // Process bout links to extract fights
      const processedBouts = new Set<string>() // Avoid duplicates
      const processedEvents = new Set<string>() // Avoid duplicate events

      boutLinks.each((index, element) => {
        const $bout = $(element)
        const boutHref = $bout.attr('href')
        const boutText = $bout.text().trim()

        if (!boutHref || processedBouts.has(boutHref)) return
        processedBouts.add(boutHref)

        // Try multiple strategies to find fighter names for this bout

        // Strategy 1: Parse fighter names from the bout URL itself
        // URL format: /fightcenter/bouts/1038570-ufc-fight-night-brandon-raw-dawg-royval-vs-manel-starboy-kape
        let fighters: Array<{name: string, nickname: string}> = []
        if (boutHref && boutHref.includes('-vs-')) {
          const urlParts = boutHref.split('-vs-')
          if (urlParts.length >= 2) {
            // More intelligent parsing - look for fighter segments
            const fighter1Segment = urlParts[0]
            const fighter2Segment = urlParts[1]

            const parseFighter = (segment: string) => {
              // Clean up the segment first - remove any URL prefixes
              let cleanSegment = segment.replace(/^\/fightcenter\/bouts\/\d+\s*/, '')

              // If the segment still has URL-like structure, try to extract from URL format
              // Format: /fightcenter/bouts/1038570-ufc-fight-night-brandon-raw-dawg-royval-vs-manel-starboy-kape
              // Check for dash-separated format that might be from URLs
              if (cleanSegment.includes('-')) {
                const parts = cleanSegment.split('-')

                // Skip everything before the actual fighter info
                const skipParts = ['', 'fightcenter', 'bouts', 'ufc', 'fight', 'night', 'on', 'espn', 'main', 'card', 'vs']
                let fighterStartIdx = -1

                for (let i = 0; i < parts.length; i++) {
                  const part = parts[i].toLowerCase().replace(/^\/+|\/+$/g, '') // Clean slashes
                  // Skip numeric IDs, URL parts, and event words
                  if (!skipParts.includes(part) && !part.match(/^\d+$/) && part.length > 1) {
                    fighterStartIdx = i
                    break
                  }
                }

                if (fighterStartIdx !== -1) {
                  const fighterParts = parts.slice(fighterStartIdx)

                  // Find "vs" to separate fighters - take everything before it
                  const vsIndex = fighterParts.findIndex(part => part.toLowerCase() === 'vs')
                  const relevantParts = vsIndex > 0 ? fighterParts.slice(0, vsIndex) : fighterParts

                  if (relevantParts.length >= 2) {
                    // More intelligent parsing:
                    // - First part: likely first name
                    // - Last part: likely last name
                    // - Middle parts: likely nicknames
                    const firstName = this.capitalize(relevantParts[0])
                    const lastName = this.capitalize(relevantParts[relevantParts.length - 1])

                    // Extract nickname from middle parts
                    const nicknameParts = relevantParts.slice(1, -1)
                    const nickname = nicknameParts.length > 0 ?
                      nicknameParts.map(p => this.capitalize(p)).join(' ') : ''

                    return {
                      name: `${firstName} ${lastName}`,
                      nickname: nickname
                    }
                  }

                  // Fallback for single name
                  if (relevantParts.length === 1) {
                    return {
                      name: this.capitalize(relevantParts[0]),
                      nickname: ''
                    }
                  }
                }
              }

              // If no URL structure, treat as plain name
              const nameParts = cleanSegment.trim().split(/\s+/)
              if (nameParts.length >= 2) {
                const firstName = this.capitalize(nameParts[0])
                const lastName = this.capitalize(nameParts[nameParts.length - 1])
                const nickname = nameParts.length > 2 ?
                  nameParts.slice(1, -1).map(p => this.capitalize(p)).join(' ') : ''

                return {
                  name: `${firstName} ${lastName}`,
                  nickname: nickname
                }
              } else if (nameParts.length === 1) {
                return {
                  name: this.capitalize(nameParts[0]),
                  nickname: ''
                }
              }

              return null
            }

            const fighter1 = parseFighter(fighter1Segment)
            const fighter2 = parseFighter(fighter2Segment)

            if (fighter1 && fighter2) {
              fighters = [fighter1, fighter2]
            }
          }
        }

        // Strategy 2: Look for fighter links in a wider area if URL parsing failed
        if (fighters.length < 2) {
          const $parent = $bout.closest('div, section, article, li, tr')
          const parentText = $parent.text()

          // Look for fighter links in the same container
          const fighterLinks = $parent.find('a[href*="/fighters/"]')
          const parentFighters = fighterLinks.map((_, el) => $(el).text().trim()).get().filter(Boolean)

          if (parentFighters.length >= 2) {
            // Convert to new format with separate name/nickname
            fighters = parentFighters.slice(0, 2).map(name => ({ name, nickname: '' }))
          }
        }

        // Debug: show what we found for the first few bouts
        if (index < 3) {
          console.log(`🔍 Bout ${index + 1}: "${boutText}" -> ${boutHref}`)
          console.log(`   Extracted fighters: [${fighters.map(f => `${f.name}${f.nickname ? ` "${f.nickname}"` : ''}`).join(', ')}]`)
        }

        if (fighters.length >= 2) {
          // Extract weight class from the bout context
          const $parent = $bout.closest('div, section, article, li, tr')
          const weightClass = this.extractWeightClass($parent) || 'unknown'
          const titleFight = boutText.toLowerCase().includes('title') || boutHref.toLowerCase().includes('title')

          const fightId = `${fighters[0].name}-vs-${fighters[1].name}`.toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')

          console.log(`⚔️ Found fight: ${fighters[0].name}${fighters[0].nickname ? ` "${fighters[0].nickname}"` : ''} vs ${fighters[1].name}${fighters[1].nickname ? ` "${fighters[1].nickname}"` : ''} (${weightClass})`)

          fights.push({
            id: fightId,
            fighter1Name: fighters[0].name,
            fighter1Nickname: fighters[0].nickname,
            fighter2Name: fighters[1].name,
            fighter2Nickname: fighters[1].nickname,
            weightClass,
            cardPosition: index === 0 ? 'main' : 'preliminary',
            titleFight
          })

          // Build a helper to register fighter info
          function setInfo(name: string, nickname: string, url?: string, recordText?: string) {
            const info: TapologyFighterInfo = fighterInfos.get(name) || { name, nickname }
            if (url) info.url = url
            const recordPattern = /\b(\d+)-(\d+)(?:-(\d+))?\b/
            const match = recordText?.match(recordPattern)
            if (match) {
              info.record = `${match[1]}-${match[2]}-${match[3] ?? '0'}`
              info.wins = Number(match[1])
              info.losses = Number(match[2])
              info.draws = Number(match[3] ?? 0)
            }
            fighterInfos.set(name, info)
          }

          // Add basic fighter info (will be enriched later by the main scraper)
          for (const fighter of [fighters[0], fighters[1]]) {
            setInfo(fighter.name, fighter.nickname)
          }
        }
      })

      console.log(`✅ Found ${fights.length} fights on Tapology event page`)

      return {
        fights,
        fighters: Array.from(fighterInfos.values())
      }

    } catch (error) {
      console.error('❌ Failed to fetch Tapology fight details:', (error as any)?.message || error)
      return { fights: [], fighters: [] }
    }
  }
}
