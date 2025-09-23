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

interface WikipediaFight {
  id: string
  fighter1Name: string
  fighter2Name: string
  weightClass: string
  cardPosition: string
  titleFight: boolean
  fighter1WikipediaUrl?: string
  fighter2WikipediaUrl?: string
}

interface WikipediaFighter {
  id: string
  name: string
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

  async getUpcomingEvents(limit: number = 50): Promise<WikipediaUFCEvent[]> {
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

      // Look for the "Scheduled events" table specifically
      let targetTable: cheerio.Cheerio<any> | undefined

      // First, try to find the table under the "Scheduled events" heading
      $('h2, h3').each((_, element) => {
        const $heading = $(element)
        const headingText = $heading.text().trim().toLowerCase()

        if (headingText.includes('scheduled events') || headingText.includes('upcoming events')) {
          // Try multiple strategies to find the table

          // Strategy 1: Look in the immediate section after the heading
          const headingParent = $heading.parent()
          const tablesAfterHeading = headingParent.nextAll().find('table')

          // Filter out navigation/template tables and find data tables
          tablesAfterHeading.each((_, table) => {
            const $table = $(table)
            const firstRowCells = $table.find('tr').first().find('th, td')
            const headerText = firstRowCells.map((_, el) => $(el).text().trim()).get().join(' ')

            // Skip navigation tables (usually have CSS/template content or single columns)
            if (firstRowCells.length >= 4 &&
                !headerText.includes('.mw-parser-output') &&
                !headerText.includes('Ultimate Fighting Championship') &&
                (headerText.toLowerCase().includes('event') || headerText.toLowerCase().includes('date'))) {
              targetTable = $table
              console.log(`✅ Found data table with ${firstRowCells.length} columns`)
              return false // Stop searching
            }
          })

          // Strategy 2: If not found, search the entire page for data tables with future dates
          if (!targetTable) {
            const allTables = $('table')
            let bestTable: cheerio.Cheerio<any> | undefined
            let bestScore = -1

            allTables.each((_, table) => {
              const $table = $(table)
              const tableText = $table.text()
              const rows = $table.find('tr')
              const firstRowCells = $table.find('tr').first().find('th, td')
              const headerText = firstRowCells.map((_, el) => $(el).text().trim()).get().join(' ').toLowerCase()

              // Score table based on how likely it is to be the scheduled events table
              let score = 0

              // Must have future dates
              if (!tableText.includes('2025') && !tableText.includes('2026')) return

              // Must have multiple columns
              if (firstRowCells.length < 3) return

              // Must not be navigation/template table
              if (headerText.includes('.mw-parser-output') ||
                  headerText.includes('ultimate fighting championship')) return

              // Boost score for table characteristics
              if (headerText.includes('event')) score += 3
              if (headerText.includes('date')) score += 3
              if (headerText.includes('venue')) score += 2
              if (headerText.includes('location')) score += 2
              if (rows.length > 1 && rows.length <= 20) score += 2 // Right size for upcoming events
              if (firstRowCells.length === 4 || firstRowCells.length === 5) score += 1 // Likely event table columns

              if (score > bestScore) {
                bestTable = $table
                bestScore = score
              }
            })

            if (bestTable && bestScore >= 5) { // Require good confidence
              targetTable = bestTable
            }
          }
        }
      })

      // Fallback: look for sticky-header tables with future dates, but prefer smaller tables (upcoming events)
      if (!targetTable) {
        console.log('⚠️ Scheduled events heading not found, trying sticky-header fallback')
        const tables = $('table.sticky-header')

        for (let i = 0; i < tables.length; i++) {
          const table = tables.eq(i)
          const tableText = table.text()
          const rows = table.find('tr')

          if (tableText.includes('2025') || tableText.includes('2026')) {
            // Prefer smaller tables (upcoming events typically have fewer rows than past events)
            if (rows.length <= 20) { // Upcoming events should be much smaller than past events
              const headerCells = table.find('tr').first().find('th, td')
              if (headerCells.length >= 4) {
                targetTable = table
                console.log(`✅ Selected smaller table with ${rows.length} rows as likely upcoming events`)
                break
              }
            }
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
        // Process all rows in the table (no limit for upcoming events)

        const $row = $(element)
        const cells = $row.find('td')

        if (cells.length >= 4) {
          // Detect table structure based on number of columns
          let eventCell, dateCell, venueCell, locationCell

          if (cells.length >= 7) {
            // Past events table structure: #, Event, Date, Venue, Location, Attendance, Ref.
            eventCell = $(cells[1]) // Event name (column 1)
            dateCell = $(cells[2])  // Date (column 2)
            venueCell = $(cells[3]) // Venue (column 3)
            locationCell = $(cells[4]) // Location (column 4)
          } else if (cells.length >= 4) {
            // Scheduled events table structure: Event, Date, Venue, Location, Ref.
            eventCell = $(cells[0]) // Event name (column 0)
            dateCell = $(cells[1])  // Date (column 1)
            venueCell = $(cells[2]) // Venue (column 2)
            locationCell = $(cells[3]) // Location (column 3)
          } else {
            return true // Skip rows with insufficient columns
          }

          // Extract event name and Wikipedia link
          const eventLink = eventCell.find('a').first()
          const eventName = eventLink.text().trim() || eventCell.text().trim()
          const href = eventLink.attr('href')
          const wikipediaUrl = href ?
            `https://en.wikipedia.org${href}` : undefined


          // Extract date - clean up any extra whitespace or formatting
          const dateText = dateCell.text().trim().replace(/\s+/g, ' ')

          // Extract venue - remove any citations or extra formatting
          const venue = venueCell.text().trim().replace(/\[\d+\]/g, '').trim()

          // Extract location - remove any citations or extra formatting
          const location = locationCell.text().trim().replace(/\[\d+\]/g, '').trim()

          // Only process if we have the essential data and it's a future event
          // Add additional filters to avoid random/irrelevant rows
          const isUfcEventName = /^(ufc\s*\d+|ufc\s+fight\s+night|ufc\s+on\s+\w+)/i.test(eventName)
          const isUfcLink = typeof href === 'string' && /\/wiki\/(UFC_|UFC_Fight_Night|UFC_on_)/.test(href)

          if (eventName && dateText && this.isFutureDate(dateText) && (isUfcEventName || isUfcLink)) {
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

  async getEventDetails(wikipediaUrl: string): Promise<{ fights: WikipediaFight[], fighters: WikipediaFighter[] }> {
    console.log(`🔍 Fetching fight card from: ${wikipediaUrl}`)

    try {
      await this.humanLikeDelay()

      const response = await axios.get(wikipediaUrl, {
        headers: this.getBrowserHeaders(),
        timeout: 15000
      })

      const $ = cheerio.load(response.data)
      const fights: WikipediaFight[] = []
      const fightersMap = new Map<string, WikipediaFighter>()

      // Look for fight card sections
      const fightCardSections = this.findFightCardSections($)

      for (const section of fightCardSections) {
        const sectionFights = this.parseFightCardSection($, section)
        fights.push(...sectionFights)

        // Extract fighters from fights
        sectionFights.forEach(fight => {
          if (!fightersMap.has(fight.fighter1Name)) {
            fightersMap.set(fight.fighter1Name, {
              id: this.generateFighterId(fight.fighter1Name),
              name: fight.fighter1Name,
              wikipediaUrl: fight.fighter1WikipediaUrl,
              source: 'wikipedia'
            })
          }

          if (!fightersMap.has(fight.fighter2Name)) {
            fightersMap.set(fight.fighter2Name, {
              id: this.generateFighterId(fight.fighter2Name),
              name: fight.fighter2Name,
              wikipediaUrl: fight.fighter2WikipediaUrl,
              source: 'wikipedia'
            })
          }
        })
      }

      // For upcoming events, try to extract main event from page title when no fight card is found
      if (fights.length === 0) {
        const mainEventFight = this.extractMainEventFromTitle($, wikipediaUrl)
        if (mainEventFight) {
          fights.push(mainEventFight)

          // Add fighters
          if (!fightersMap.has(mainEventFight.fighter1Name)) {
            fightersMap.set(mainEventFight.fighter1Name, {
              id: this.generateFighterId(mainEventFight.fighter1Name),
              name: mainEventFight.fighter1Name,
              source: 'wikipedia'
            })
          }
          if (!fightersMap.has(mainEventFight.fighter2Name)) {
            fightersMap.set(mainEventFight.fighter2Name, {
              id: this.generateFighterId(mainEventFight.fighter2Name),
              name: mainEventFight.fighter2Name,
              source: 'wikipedia'
            })
          }
        }
      }

      const fighters = Array.from(fightersMap.values())

      console.log(`✅ Found ${fights.length} fights and ${fighters.length} fighters on Wikipedia event page`)

      return { fights, fighters }

    } catch (error: any) {
      console.error('❌ Failed to fetch Wikipedia fight details:', error?.message || error)
      return { fights: [], fighters: [] }
    }
  }

  private findFightCardSections($: cheerio.CheerioAPI): Array<{ heading: string, content: cheerio.Cheerio<any> }> {
    const sections: Array<{ heading: string, content: cheerio.Cheerio<any> }> = []

    // First, try to find structured fight card sections by headings (individual event pages)
    // Note: Completed events use "Results" while upcoming events use "Fight card"
    const fightCardHeadings = ['main card', 'preliminary card', 'early preliminary card', 'fight card', 'results']

    fightCardHeadings.forEach(headingText => {
      $('h2, h3, h4').each((_, element) => {
        const $heading = $(element)
        const headingContent = $heading.text().trim().toLowerCase()

        if (headingContent.includes(headingText)) {
          // Find content after this heading until the next major heading
          let content = $heading.nextUntil('h2, h3, h4')

          // If no content found, try to get the next sibling
          if (!content.length) {
            content = $heading.next()
          }

          if (content.length) {
            // Check if this content has fight information
            const contentText = content.text().toLowerCase()
            if (contentText.includes(' vs ') || contentText.includes(' v. ')) {
              sections.push({
                heading: $heading.text().trim(),
                content
              })
            }
          }
        }
      })
    })

    // If no heading-based sections found, fall back to table scanning (main events list page)
    if (sections.length === 0) {
      const allTables = $('table')

      allTables.each((i, table) => {
        const $table = $(table)
        const tableText = $table.text().toLowerCase()

        // Look for tables that contain fight-related keywords but exclude navigation tables
        const hasFightKeywords = (tableText.includes('def.') || tableText.includes('vs')) &&
                                (tableText.includes('method') || tableText.includes('round') ||
                                 tableText.includes('decision') || tableText.includes('submission') ||
                                 (tableText.includes('main card') && tableText.includes('preliminary')))

        // Exclude navigation tables and other non-fight tables
        const isNavigationTable = $table.hasClass('navbox') ||
                                 $table.hasClass('infobox') ||
                                 tableText.includes('ultimate fighting championship events') ||
                                 tableText.includes('mixed martial arts') ||
                                 tableText.includes('vte2024') ||
                                 tableText.includes('.mw-parser-output') ||
                                 (tableText.length > 5000) || // Very long navigation tables
                                 tableText.includes('« 2023  2025 »')

        if (hasFightKeywords && !isNavigationTable) {
          // Create a section for this table
          sections.push({
            heading: 'Fight Results',
            content: $table
          })
        }
      })
    }

    return sections
  }

  private parseFightCardSection($: cheerio.CheerioAPI, section: { heading: string, content: cheerio.Cheerio<any> }): WikipediaFight[] {
    const fights: WikipediaFight[] = []

    // Determine card position based on heading
    const cardPosition = this.determineCardPosition(section.heading)

    // Check if the content itself is a table
    if (section.content.is('table')) {
      const sectionFights = this.parseTableFights($, section.content, cardPosition)
      fights.push(...sectionFights)
    } else {
      // Look for tables within the section
      const tables = section.content.find('table')

      if (tables.length > 0) {
        // Parse table-based fight cards
        tables.each((_, table) => {
          const $table = $(table)
          const sectionFights = this.parseTableFights($, $table, cardPosition)
          fights.push(...sectionFights)
        })
      } else {
        // Parse list-based fight cards or direct content
        const sectionFights = this.parseListFights($, section.content, cardPosition)
        fights.push(...sectionFights)
      }
    }

    return fights
  }

  private parseTableFights($: cheerio.CheerioAPI, $table: cheerio.Cheerio<any>, defaultCardPosition: string): WikipediaFight[] {
    const fights: WikipediaFight[] = []

    // Look for table rows and track current card position
    let currentCardPosition = defaultCardPosition
    const rows = $table.find('tr')

    rows.each((_, row) => {
      const $row = $(row)
      const cells = $row.find('td, th')

      // Check if this row is a section header (like "Main card", "Preliminary card")
      if (cells.length === 1) {
        const sectionText = $(cells[0]).text().trim().toLowerCase()
        if (sectionText.includes('main card')) {
          currentCardPosition = 'main'
        } else if (sectionText.includes('preliminary card')) {
          currentCardPosition = 'preliminary'
        } else if (sectionText.includes('early preliminary')) {
          currentCardPosition = 'early preliminary'
        }
        return // Skip to next row
      }

      // Skip header rows (Weight class, Method, etc.)
      if (cells.length > 0 && $(cells[0]).text().trim().toLowerCase().includes('weight class')) {
        return // Skip header row
      }

      if (cells.length >= 4) {
        // UFC result table format: Weight Class | Fighter1 | def./vs | Fighter2 | Method | Round | Time | Notes
        const weightClass = $(cells[0]).text().trim()
        const fighter1Name = this.cleanFighterName($(cells[1]).text().trim())
        const separator = $(cells[2]).text().trim().toLowerCase()
        const fighter2Name = this.cleanFighterName($(cells[3]).text().trim())

        // Check if this looks like a fight (has def. or vs separator)
        if ((separator.includes('def') || separator.includes('vs')) &&
            this.areValidFighterNames(fighter1Name, fighter2Name)) {

          const fightId = `${fighter1Name}-vs-${fighter2Name}`.toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')

          const fight: WikipediaFight = {
            id: fightId,
            fighter1Name,
            fighter2Name,
            weightClass: weightClass || 'Unknown',
            cardPosition: currentCardPosition,
            titleFight: weightClass.toLowerCase().includes('championship') ||
                       fighter1Name.includes('(c)') || fighter2Name.includes('(c)')
          }

          fights.push(fight)
        }
      }
    })

    return fights
  }

  private parseListFights($: cheerio.CheerioAPI, $content: cheerio.Cheerio<any>, cardPosition: string): WikipediaFight[] {
    const fights: WikipediaFight[] = []

    // Look for list items, paragraphs, or any element containing fight information
    $content.find('li, p, div, span').each((_, element) => {
      const $element = $(element)
      const text = $element.text().trim()

      // Look for fight patterns like "Weight Class: Fighter A vs Fighter B"
      if (text.includes(' vs ') || text.includes(' v. ')) {
        // Extract weight class if present (format: "Weight Class: Fighter vs Fighter")
        let weightClass = 'Unknown'
        let fightersText = text

        const colonMatch = text.match(/^([^:]+):\s*(.+)/)
        if (colonMatch) {
          weightClass = colonMatch[1].trim()
          fightersText = colonMatch[2].trim()
        }

        const fight = this.parseFighterText($, $element, weightClass, cardPosition)
        if (fight) {
          fights.push(fight)
        }
      }
    })

    // Also try direct text content parsing for cases where structure is different
    const allText = $content.text()
    const lines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0)

    lines.forEach(line => {
      if ((line.includes(' vs ') || line.includes(' v. ')) && !fights.some(f => line.includes(f.fighter1Name) && line.includes(f.fighter2Name))) {
        // Create a temporary element to parse this line
        const $tempElement = $('<div>').text(line)

        let weightClass = 'Unknown'
        let fightersText = line

        const colonMatch = line.match(/^([^:]+):\s*(.+)/)
        if (colonMatch) {
          weightClass = colonMatch[1].trim()
          fightersText = colonMatch[2].trim()
        }

        const fight = this.parseFighterText($, $tempElement, weightClass, cardPosition)
        if (fight) {
          fights.push(fight)
        }
      }
    })

    return fights
  }

  private parseFighterText($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>, weightClass: string, cardPosition: string): WikipediaFight | null {
    const text = $element.text().trim()

    // Skip obvious non-fight content
    if (this.isNonFightContent(text)) {
      return null
    }

    // Try to parse "Fighter A vs Fighter B" format
    let fighter1Name = ''
    let fighter2Name = ''
    let fighter1Url: string | undefined
    let fighter2Url: string | undefined

    // Look for "vs" or "v." separators (upcoming events) or "def." patterns (completed events)
    const vsMatch = text.match(/(.+?)\s+(?:vs\.?|v\.)\s+(.+?)(?:\s*\(.*?\)|\s*$|\s+\d+|\s+[–—-])/i)
    const defMatch = text.match(/(.+?)\s+(?:def\.|defeated|beat)\s+(.+?)(?:\s*\(.*?\)|\s*$|\s+[–—-])/i)

    if (vsMatch) {
      fighter1Name = this.cleanFighterName(vsMatch[1])
      fighter2Name = this.cleanFighterName(vsMatch[2])
    } else if (defMatch) {
      fighter1Name = this.cleanFighterName(defMatch[1])
      fighter2Name = this.cleanFighterName(defMatch[2])
    }

    // Additional validation - fighter names should be reasonable
    if (fighter1Name && fighter2Name && !this.areValidFighterNames(fighter1Name, fighter2Name)) {
      return null
    }

    // Only proceed if we found fighter names
    if (fighter1Name && fighter2Name) {
      // Try to get Wikipedia URLs for fighters
      const links = $element.find('a')
      if (links.length >= 2) {
        fighter1Url = links.eq(0).attr('href')
        fighter2Url = links.eq(1).attr('href')

        if (fighter1Url && fighter1Url.startsWith('/')) {
          fighter1Url = `https://en.wikipedia.org${fighter1Url}`
        }
        if (fighter2Url && fighter2Url.startsWith('/')) {
          fighter2Url = `https://en.wikipedia.org${fighter2Url}`
        }
      }

      // Check for title fight indicators
      const titleFight = text.toLowerCase().includes('championship') ||
                        text.includes('(c)') ||
                        text.toLowerCase().includes('title')

      // Extract weight class if it's in the text
      const weightMatch = text.match(/(heavyweight|light heavyweight|middleweight|welterweight|lightweight|featherweight|bantamweight|flyweight|women's|catchweight)/i)
      if (weightMatch) {
        weightClass = weightMatch[1]
      }

      if (fighter1Name && fighter2Name) {
        const fightId = `${fighter1Name}-vs-${fighter2Name}`.toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')

        return {
          id: fightId,
          fighter1Name,
          fighter2Name,
          weightClass,
          cardPosition,
          titleFight,
          fighter1WikipediaUrl: fighter1Url,
          fighter2WikipediaUrl: fighter2Url
        }
      }
    }

    return null
  }

  private determineCardPosition(heading: string): string {
    const headingLower = heading.toLowerCase()

    if (headingLower.includes('main')) return 'main'
    if (headingLower.includes('preliminary') || headingLower.includes('prelim')) return 'preliminary'
    if (headingLower.includes('early')) return 'early preliminary'

    return 'preliminary' // default
  }

  private generateFighterId(fighterName: string): string {
    return fighterName.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  private isNonFightContent(text: string): boolean {
    const lowerText = text.toLowerCase()

    // Skip obvious non-fight content patterns
    const skipPatterns = [
      // Navigation and metadata
      'navigation', 'menu', 'edit', 'view source', 'talk', 'contributions',
      'log in', 'create account', 'main page', 'contents', 'current events',
      'random article', 'about wikipedia', 'contact us', 'donate',

      // References and citations
      'references', 'external links', 'see also', 'further reading',
      'categories:', 'hidden categories:', 'cite', 'citation needed',

      // Common Wikipedia boilerplate
      'this article', 'may refer to', 'disambiguation', 'redirect',
      'stub', 'expand', 'cleanup', 'neutrality', 'verify',

      // Event info that's not fights
      'attendance:', 'venue:', 'location:', 'date:', 'broadcaster:',
      'pay-per-view', 'fight pass', 'espn+', 'preliminary card',

      // Numbers without context (likely navigation artifacts)
      /^\d+$/,
      /^\d+\s*\(/,
      /\)\s*\d+$/
    ]

    return skipPatterns.some(pattern => {
      if (typeof pattern === 'string') {
        return lowerText.includes(pattern)
      } else {
        return pattern.test(text)
      }
    })
  }

  private areValidFighterNames(fighter1: string, fighter2: string): boolean {
    // Both names must exist and be reasonable
    if (!fighter1 || !fighter2 || fighter1.length < 2 || fighter2.length < 2) {
      return false
    }

    // Names shouldn't be mostly numbers or weird artifacts
    const invalidPatterns = [
      /^\d+\s*\(/,           // "316 ("
      /\)\s*\d+\)$/,         // "name 2)"
      /^[^a-zA-Z]*$/,        // Only non-letters
      /^\d+[^a-zA-Z]*$/,     // Starts with number, no letters
      /^[^\w\s]+$/,          // Only special characters
      /edit|view|talk|main|page|navigation|menu/i  // Wikipedia UI elements
    ]

    if (invalidPatterns.some(pattern => pattern.test(fighter1) || pattern.test(fighter2))) {
      return false
    }

    // Names should contain at least some letters
    if (!/[a-zA-Z]/.test(fighter1) || !/[a-zA-Z]/.test(fighter2)) {
      return false
    }

    // Names shouldn't be the same (probably parsing error)
    if (fighter1.toLowerCase() === fighter2.toLowerCase()) {
      return false
    }

    return true
  }

  private cleanFighterName(name: string): string {
    return name
      .trim()
      // Remove common artifacts
      .replace(/^\d+\s*\(\s*/, '')  // "316 (" at start
      .replace(/\s*\d+\)\s*$/, '')  // " 2)" at end
      .replace(/\s*\([^)]*\)\s*$/, '')  // Remove parenthetical at end
      .replace(/[–—-]\s*$/, '')  // Remove trailing dashes
      .replace(/^\s*[–—-]/, '')   // Remove leading dashes
      // Clean up extra whitespace
      .replace(/\s+/g, ' ')
      .trim()
  }

  private extractMainEventFromTitle($: cheerio.CheerioAPI, wikipediaUrl: string): WikipediaFight | null {
    // Try multiple sources for event title
    const sources = [
      $('h1#firstHeading').text().trim(), // Main page title
      $('.infobox-above').text().trim(),   // Infobox title
      $('.infobox-title').text().trim(),   // Alternative infobox title
    ]

    // Also check the page text for event subtitle patterns
    const pageText = $('body').text()
    const subtitleMatch = pageText.match(/UFC \d+: [^.]{5,50}vs\.?[^.]{5,50}/i)
    if (subtitleMatch) {
      sources.push(subtitleMatch[0])
    }

    for (const source of sources) {
      if (!source) continue

      // Pattern for various UFC event formats:
      // "UFC Fight Night: Fighter vs Fighter"
      // "UFC 320: Fighter vs Fighter"
      // "UFC 320: Fighter vs. Fighter 2" (with rematch number)
      const titleMatch = source.match(/UFC.*?:\s*(.+?)\s+vs\.?\s+(.+?)(?:\s+\d+)?(?:\s|$)/i)

      if (titleMatch) {
        const fighter1Name = this.cleanFighterName(titleMatch[1])
        const fighter2Name = this.cleanFighterName(titleMatch[2])

        if (this.areValidFighterNames(fighter1Name, fighter2Name)) {
          const fightId = `${fighter1Name}-vs-${fighter2Name}`.toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')

          console.log(`🎯 Extracted main event from "${source}": ${fighter1Name} vs ${fighter2Name}`)

          return {
            id: fightId,
            fighter1Name,
            fighter2Name,
            weightClass: 'Unknown',
            cardPosition: 'main',
            titleFight: source.toLowerCase().includes('championship') || source.includes('(c)')
          }
        }
      }
    }

    return null
  }
}
