import OpenAI from 'openai'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { buildPredictionPrompt } from './predictionPrompt'
import { WikipediaUFCService } from '../scrapers/wikipediaService'
import { TapologyUFCService } from '../scrapers/tapologyService'

interface RealUFCEvent {
  name: string
  date: string
  location: string
  venue: string
  status: 'upcoming' | 'completed'
  detailUrl?: string
  mainFights?: string[]
  source: string
  wikipediaUrl?: string
}

interface UFCEvent {
  id: string
  name: string
  date: string
  location: string
  venue: string
  fightCard: Fight[]
  mainCard: Fight[]
  prelimCard: Fight[]
  earlyPrelimCard: Fight[]
}

interface Fight {
  id: string
  fighter1Id: string
  fighter2Id: string
  fighter1Name: string
  fighter2Name: string
  weightClass: string
  cardPosition: 'main' | 'preliminary' | 'early-preliminary'
  scheduledRounds: number
  status: 'scheduled' | 'completed' | 'cancelled'
  titleFight?: boolean
  mainEvent?: boolean
  fightNumber?: number
  funFactor?: number
  finishProbability?: number
  entertainmentReason?: string
  keyFactors?: string[]
  fightPrediction?: string
  riskLevel?: 'high' | 'medium' | 'low'
}

interface Fighter {
  id: string
  name: string
  nickname?: string
  record: string
  weightClass: string
  age: number
  height: string
  reach: string
  wins: number
  losses: number
  draws: number
  nationality: string
  fightingStyle: string
  winsByKO?: number
  winsBySubmission?: number
  winsByDecision?: number
  currentStreak?: string
  ranking?: number
}

interface PredictionResult {
  fightId: string
  funFactor?: number
  finishProbability?: number
  entertainmentReason?: string
  keyFactors?: string[]
  prediction?: string
  riskLevel?: 'high' | 'medium' | 'low'
}

type SherdogBlockCode = 'SHERDOG_BLOCKED'

export class HybridUFCService {
  private openai: OpenAI | null = null
  private sherdogBlocked: boolean = false
  private wikipediaService: WikipediaUFCService
  private tapologyService: TapologyUFCService

  constructor(enableAI: boolean = true) {
    if (enableAI && process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      })
    } else if (enableAI && !process.env.OPENAI_API_KEY) {
      console.warn('⚠️ OpenAI API key not found. AI predictions will be disabled.')
    }

    // Initialize alternative scraper services
    this.wikipediaService = new WikipediaUFCService()
    this.tapologyService = new TapologyUFCService()
  }

  // Get realistic browser headers to avoid bot detection
  private getBrowserHeaders(referer?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
      'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"'
    }

    if (referer) {
      headers['Referer'] = referer
    }

    return headers
  }

  // Add realistic delay between requests to mimic human behavior
  private async humanLikeDelay(): Promise<void> {
    const delay = 1000 + Math.random() * 2000 // 1-3 seconds
    return new Promise(resolve => setTimeout(resolve, delay))
  }

  // Get current date for accurate searches
  private getCurrentDate(): string {
    const now = new Date()
    // Force to use current local date
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const currentDate = `${year}-${month}-${day}`
    console.log(`📅 Current date calculated: ${currentDate}`)
    return currentDate
  }

  // Search for real current UFC events using Sherdog listings
  async searchRealUFCEvents(limit: number): Promise<RealUFCEvent[]> {
    this.sherdogBlocked = false

    // Try multiple sources in order of preference: Sherdog -> Wikipedia -> Tapology
    const sources = [
      { name: 'Sherdog', fn: () => this.fetchSherdogEvents(limit) },
      { name: 'Wikipedia', fn: () => this.fetchWikipediaEvents(limit) },
      { name: 'Tapology', fn: () => this.fetchTapologyEvents(limit) }
    ]

    for (const source of sources) {
      try {
        console.log(`🔍 Fetching upcoming UFC events from ${source.name}...`)

        const events = await source.fn()

        if (events && events.length > 0) {
          console.log(`✅ Retrieved ${events.length} upcoming events from ${source.name}`)
          return events
        } else {
          console.log(`⚠️ No events found from ${source.name}, trying next source...`)
        }

      } catch (error: any) {
        console.log(`❌ ${source.name} failed:`, error?.message || error)

        // Set blocked flag specifically for Sherdog
        if (source.name === 'Sherdog') {
          if (axios.isAxiosError(error) && error.response?.status === 403) {
            this.sherdogBlocked = true
            console.warn('⚠️ Sherdog blocked the request with HTTP 403. Trying alternative sources...')
          } else if (error?.code === 'SHERDOG_BLOCKED') {
            this.sherdogBlocked = true
            console.warn('⚠️ Sherdog blocked detected. Trying alternative sources...')
          }
        }

        // Continue to next source unless this is the last one
        if (source === sources[sources.length - 1]) {
          console.error('❌ All sources failed. No events available.')

          // If Sherdog was blocked, throw the specific error for backwards compatibility
          if (this.sherdogBlocked) {
            const blockedError = new Error('All sources failed, Sherdog blocked') as Error & { code?: SherdogBlockCode }
            blockedError.name = 'SherdogBlockedError'
            blockedError.code = 'SHERDOG_BLOCKED'
            throw blockedError
          }
        }
      }
    }

    return []
  }

  isSherdogBlocked(): boolean {
    return this.sherdogBlocked
  }

  // Fetch events from Wikipedia
  private async fetchWikipediaEvents(limit: number): Promise<RealUFCEvent[]> {
    const wikipediaEvents = await this.wikipediaService.getUpcomingEvents(limit)

    return wikipediaEvents.map(event => ({
      name: event.name,
      date: event.date,
      venue: event.venue,
      location: event.location,
      status: 'upcoming' as const,
      source: 'wikipedia',
      wikipediaUrl: event.wikipediaUrl
    }))
  }

  // Fetch events from Tapology
  private async fetchTapologyEvents(limit: number): Promise<RealUFCEvent[]> {
    const tapologyEvents = await this.tapologyService.getUpcomingEvents(limit)

    return tapologyEvents.map(event => ({
      name: event.name,
      date: event.date,
      venue: event.venue,
      location: event.location,
      status: 'upcoming' as const,
      source: 'tapology'
    }))
  }


  // Main method to get upcoming UFC events with real data (NO AI PREDICTIONS)
  async getUpcomingUFCEvents(limit: number = 5): Promise<{ events: UFCEvent[], fighters: Fighter[] }> {
    try {
      console.log('🌐 Starting UFC data collection (events only, no AI predictions)...')

      // Step 1: Search for real current events
      const realEvents = await this.searchRealUFCEvents(limit)

      if (realEvents.length === 0) {
        console.log('⚠️ No real events found, cannot proceed without real data')
        return { events: [], fighters: [] }
      }

      const closestEvents = this.selectClosestEvents(realEvents, limit)

      if (closestEvents.length === 0) {
        console.log('⚠️ No upcoming events remain after filtering for closest dates')
        return { events: [], fighters: [] }
      }

      const allFighters = new Map<string, Fighter>()
      const events: UFCEvent[] = []

      for (const realEvent of closestEvents) {
        const eventWithFights = await this.buildEventWithFights(realEvent)
        if (!eventWithFights) {
          continue
        }

        // NO AI PREDICTIONS HERE - just basic fight structure
        eventWithFights.event.mainCard = eventWithFights.event.fightCard.filter(f => f.cardPosition === 'main')
        eventWithFights.event.prelimCard = eventWithFights.event.fightCard.filter(f => f.cardPosition === 'preliminary')
        eventWithFights.event.earlyPrelimCard = eventWithFights.event.fightCard.filter(f => f.cardPosition === 'early-preliminary')

        events.push(eventWithFights.event)

        for (const fighter of eventWithFights.fighters) {
          if (!allFighters.has(fighter.id)) {
            allFighters.set(fighter.id, fighter)
          }
        }
      }

      return {
        events,
        fighters: Array.from(allFighters.values())
      }

    } catch (error) {
      if ((error as Error & { code?: SherdogBlockCode }).code === 'SHERDOG_BLOCKED') {
        throw error
      }

      console.error('❌ Error in UFC data collection:', error)
      return { events: [], fighters: [] }
    }
  }

  // NEW: Separate method for AI prediction generation
  async generateEventPredictions(eventId: string, eventName: string, fights: Fight[]): Promise<Fight[]> {
    if (!this.openai) {
      console.log(`ℹ️ AI predictions disabled for: ${eventName}`)
      return fights // Return original fights without predictions
    }

    try {
      console.log(`🎯 Generating AI predictions for: ${eventName}`)
      return await this.generateFightPredictions(fights, eventName)
    } catch (error) {
      console.error(`❌ Failed to generate predictions for ${eventName}:`, error)
      return fights // Return original fights without predictions
    }
  }

  private async fetchSherdogEvents(limit: number): Promise<RealUFCEvent[]> {
    const url = 'https://www.sherdog.com/organizations/Ultimate-Fighting-Championship-UFC-2'
    const headers = this.getBrowserHeaders()

    // Add human-like delay before request
    await this.humanLikeDelay()

    const response = await axios.get(url, { headers })
    const $ = cheerio.load(response.data)

    const tables = $('table.new_table.event')
    if (!tables.length) {
      console.warn('⚠️ Sherdog event listing table not found')
      return []
    }

    const events: RealUFCEvent[] = []

    tables.first().find('tr').slice(1).each((_idx, element) => {
      if (events.length >= limit) {
        return false
      }

      const columns = $(element).find('td')
      if (columns.length < 3) {
        return
      }

      const rawDate = $(columns[0]).text().trim()
      const nameCell = $(columns[1])
      const eventName = nameCell.text().trim()
      const href = nameCell.find('a').attr('href')
      const locationText = $(columns[2]).text().trim()

      if (!eventName || !href || !rawDate) {
        return
      }

      const parsedDate = this.parseSherdogDate(rawDate)
      if (!parsedDate) {
        return
      }

      const { venue, location } = this.splitVenueAndLocation(locationText)

      events.push({
        name: eventName,
        date: parsedDate,
        location,
        venue,
        status: 'upcoming',
        detailUrl: new URL(href, url).toString(),
        source: 'Sherdog Event Listing'
      })
    })

    return events
  }

  private slugify(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown'
  }

  private selectClosestEvents(realEvents: RealUFCEvent[], limit: number): RealUFCEvent[] {
    if (limit <= 0) {
      return []
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const deduped = new Map<string, { event: RealUFCEvent, eventDate: Date }>()

    for (const event of realEvents) {
      if (!event?.name || !event?.date) {
        continue
      }

      const parsedDate = this.parseEventDate(event.date)
      if (!parsedDate || parsedDate.getTime() < today.getTime()) {
        continue
      }

      const slug = this.slugify(event.name)
      const normalizedEvent: RealUFCEvent = {
        ...event,
        date: this.formatDate(parsedDate)
      }

      const existing = deduped.get(slug)
      if (!existing || parsedDate.getTime() < existing.eventDate.getTime()) {
        deduped.set(slug, { event: normalizedEvent, eventDate: parsedDate })
      }
    }

    const sorted = Array.from(deduped.values())
      .sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime())
      .map(item => item.event)

    if (sorted.length > limit) {
      console.log(`ℹ️ Trimming events from ${sorted.length} to closest ${limit}`)
    }

    return sorted.slice(0, limit)
  }

  private async fetchSherdogFightDetails(realEvent: RealUFCEvent): Promise<{ fights: Fight[], fighters: Fighter[] }> {
    if (!realEvent.detailUrl) {
      console.warn(`⚠️ Missing Sherdog detail URL for ${realEvent.name}`)
      return { fights: [], fighters: [] }
    }

    // Use main UFC page as referer to mimic natural navigation
    const referer = 'https://www.sherdog.com/organizations/Ultimate-Fighting-Championship-UFC-2'
    const headers = this.getBrowserHeaders(referer)

    // Add human-like delay before request
    await this.humanLikeDelay()

    const response = await axios.get(realEvent.detailUrl, { headers })
    const $ = cheerio.load(response.data)

    let table = $('table.new_table.upcoming')
    if (!table.length) {
      table = $('table.new_table.result')
    }

    if (!table.length) {
      console.warn(`⚠️ Sherdog fight table not found for ${realEvent.name}`)
      return { fights: [], fighters: [] }
    }

    const fighterMap = new Map<string, Fighter>()
    const fightsRaw: Array<{
      matchNumber: number
      fighter1: Fighter
      fighter2: Fighter
      weightClass: string
      titleFight: boolean
    }> = []

    // Handle featured main event card section (if present)
    const featuredCard = $('div.fight_card').first()
    if (featuredCard.length) {
      const weightText = featuredCard.find('.weight_class').text().trim()
      const normalizedWeight = this.normalizeWeightClass(weightText)
      const titleFight = featuredCard.find('.title_fight').length > 0

      const fighter1Data = this.extractSherdogFeaturedFighter(featuredCard.find('.fighter.left_side'), normalizedWeight)
      const fighter2Data = this.extractSherdogFeaturedFighter(featuredCard.find('.fighter.right_side'), normalizedWeight)

      if (fighter1Data && fighter2Data) {
        const fighter1 = this.getOrCreateFighter(fighterMap, fighter1Data, normalizedWeight)
        const fighter2 = this.getOrCreateFighter(fighterMap, fighter2Data, normalizedWeight)

        fightsRaw.push({
          matchNumber: Number.MAX_SAFE_INTEGER,
          fighter1,
          fighter2,
          weightClass: normalizedWeight,
          titleFight
        })
      }
    }

    table.find('tr').slice(1).each((_idx, element) => {
      const columns = $(element).find('td')
      if (columns.length < 4) {
        return
      }

      const matchNumberRaw = $(columns[0]).text().trim()
      const matchNumber = parseInt(matchNumberRaw, 10)
      if (Number.isNaN(matchNumber)) {
        return
      }

      const weightText = $(columns[2]).find('.weight_class').text().trim()
      const normalizedWeight = this.normalizeWeightClass(weightText)
      const titleFight = /title fight/i.test(weightText)

      const fighter1Data = this.extractSherdogFighter($(columns[1]), normalizedWeight)
      const fighter2Data = this.extractSherdogFighter($(columns[3]), normalizedWeight)

      if (!fighter1Data || !fighter2Data) {
        return
      }

      const fighter1 = this.getOrCreateFighter(fighterMap, fighter1Data, normalizedWeight)
      const fighter2 = this.getOrCreateFighter(fighterMap, fighter2Data, normalizedWeight)

      fightsRaw.push({
        matchNumber,
        fighter1,
        fighter2,
        weightClass: normalizedWeight,
        titleFight
      })
    })

    if (fightsRaw.length === 0) {
      return { fights: [], fighters: [] }
    }

    fightsRaw.sort((a, b) => b.matchNumber - a.matchNumber)

    const mainCount = Math.min(5, fightsRaw.length)
    const prelimCount = Math.min(5, fightsRaw.length - mainCount)

    const fights: Fight[] = fightsRaw.map((fight, index) => {
      let cardPosition: 'main' | 'preliminary' | 'early-preliminary'
      if (index < mainCount) {
        cardPosition = 'main'
      } else if (index < mainCount + prelimCount) {
        cardPosition = 'preliminary'
      } else {
        cardPosition = 'early-preliminary'
      }

      const eventSlug = this.slugify(realEvent.name)
      const fightId = `${eventSlug}-match-${fight.matchNumber}`
      const mainEvent = index === 0
      const scheduledRounds = mainEvent || fight.titleFight ? 5 : 3

      return {
        id: fightId,
        fighter1Id: fight.fighter1.id,
        fighter2Id: fight.fighter2.id,
        fighter1Name: fight.fighter1.name,
        fighter2Name: fight.fighter2.name,
        weightClass: fight.weightClass,
        cardPosition,
        scheduledRounds,
        status: 'scheduled',
        titleFight: fight.titleFight,
        mainEvent,
        fightNumber: index + 1,
        funFactor: 0,
        finishProbability: 0
      }
    })

    return {
      fights,
      fighters: Array.from(fighterMap.values())
    }
  }

  // Multi-source fight details fetching with fallback
  private async fetchFightDetails(realEvent: RealUFCEvent): Promise<{ fights: Fight[], fighters: Fighter[] }> {
    // Try sources based on event source and availability
    const sources = []

    // If event came from Sherdog (has detailUrl), try Sherdog first
    if (realEvent.detailUrl && realEvent.source === 'sherdog') {
      sources.push({ name: 'Sherdog', fn: () => this.fetchSherdogFightDetails(realEvent) })
    }

    // Add Wikipedia if we have a Wikipedia URL
    if (realEvent.source === 'wikipedia' && realEvent.wikipediaUrl) {
      sources.push({ name: 'Wikipedia', fn: () => this.fetchWikipediaFightDetails(realEvent.wikipediaUrl!) })
    }

    // Try Tapology as fallback
    sources.push({ name: 'Tapology', fn: () => this.fetchTapologyFightDetails(realEvent) })

    for (const source of sources) {
      try {
        console.log(`🔍 Fetching fight details from ${source.name}...`)
        const fightDetails = await source.fn()

        if (fightDetails.fights.length > 0) {
          console.log(`✅ Found ${fightDetails.fights.length} fights from ${source.name}`)
          return fightDetails
        } else {
          console.log(`⚠️ No fights found from ${source.name}, trying next source...`)
        }

      } catch (error: any) {
        console.log(`❌ ${source.name} fight details failed:`, error?.message || error)
      }
    }

    console.warn(`⚠️ No fight details found from any source for ${realEvent.name}`)
    return { fights: [], fighters: [] }
  }

  // Fetch fight details from Wikipedia
  private async fetchWikipediaFightDetails(wikipediaUrl: string): Promise<{ fights: Fight[], fighters: Fighter[] }> {
    const result = await this.wikipediaService.getEventDetails(wikipediaUrl)

    // Convert Wikipedia fights to internal Fight format
    const fights: Fight[] = result.fights.map(wikiF => ({
      id: wikiF.id,
      fighter1Id: this.generateFighterId(wikiF.fighter1Name),
      fighter2Id: this.generateFighterId(wikiF.fighter2Name),
      fighter1Name: wikiF.fighter1Name,
      fighter2Name: wikiF.fighter2Name,
      weightClass: wikiF.weightClass,
      cardPosition: wikiF.cardPosition as 'main' | 'preliminary' | 'early-preliminary',
      scheduledRounds: wikiF.titleFight ? 5 : 3, // Title fights are 5 rounds, regular fights are 3
      status: 'scheduled' as const,
      titleFight: wikiF.titleFight
    }))

    // Convert Wikipedia fighters to internal Fighter format
    const fighters: Fighter[] = result.fighters.map(wikiF => ({
      id: wikiF.id,
      name: wikiF.name,
      nickname: '',
      record: '0-0-0',
      weightClass: 'Unknown',
      age: 0, // Not available from Wikipedia scraping
      height: 'Unknown',
      reach: 'Unknown',
      wins: 0,
      losses: 0,
      draws: 0,
      nationality: 'Unknown',
      fightingStyle: 'Unknown'
    }))

    return { fights, fighters }
  }

  // Placeholder for Tapology fight details (could be implemented later)
  private async fetchTapologyFightDetails(realEvent: RealUFCEvent): Promise<{ fights: Fight[], fighters: Fighter[] }> {
    // For now, return empty as Tapology fight details are more complex to parse
    return { fights: [], fighters: [] }
  }

  private generateFighterId(fighterName: string): string {
    return fighterName.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  private extractSherdogFighter(fighterCell: unknown, weightClass: string): {
    id: string
    name: string
    nickname?: string
    record: string
    wins: number
    losses: number
    draws: number
    weightClass: string
  } | null {
    // Type assertion for web scraping jQuery object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cell = fighterCell as any
    const nameNode = cell.find('.fighter_result_data span[itemprop=name]').first()
    if (!nameNode.length) {
      return null
    }

    const name = nameNode
      .clone()
      .find('br')
      .replaceWith(' ')
      .end()
      .text()
      .replace(/\s+/g, ' ')
      .trim()
    if (!name) {
      return null
    }

    const recordText = cell.find('.record em').text().trim()
    const { wins, losses, draws } = this.parseRecord(recordText)

    const imgTitle = cell.find('img').attr('title') || ''
    let nickname: string | undefined
    const nicknameMatch = imgTitle.match(/'(.*?)'/)
    if (nicknameMatch && nicknameMatch[1]) {
      nickname = nicknameMatch[1]
    }

    const id = this.slugify(name)

    return {
      id,
      name,
      nickname,
      record: recordText || '0-0-0',
      wins,
      losses,
      draws,
      weightClass
    }
  }

  private extractSherdogFeaturedFighter(fighterCard: unknown, weightClass: string): {
    id: string
    name: string
    nickname?: string
    record: string
    wins: number
    losses: number
    draws: number
    weightClass: string
  } | null {
    // Type assertion for web scraping jQuery object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const card = fighterCard as any
    if (!card.length) {
      return null
    }

    const nameNode = card.find('span[itemprop=name]').first()
    if (!nameNode.length) {
      return null
    }

    const name = nameNode.text().replace(/\s+/g, ' ').trim()
    if (!name) {
      return null
    }

    const recordText = card.find('.record').text().trim()
    const { wins, losses, draws } = this.parseRecord(recordText)

    const imgTitle = card.find('img').attr('title') || ''
    let nickname: string | undefined
    const nicknameMatch = imgTitle.match(/'(.*?)'/)
    if (nicknameMatch && nicknameMatch[1]) {
      nickname = nicknameMatch[1]
    }

    const id = this.slugify(name)

    return {
      id,
      name,
      nickname,
      record: recordText || '0-0-0',
      wins,
      losses,
      draws,
      weightClass
    }
  }

  private getOrCreateFighter(map: Map<string, Fighter>, data: {
    id: string
    name: string
    nickname?: string
    record: string
    wins: number
    losses: number
    draws: number
    weightClass: string
  }, normalizedWeight: string): Fighter {
    const existing = map.get(data.id)
    if (existing) {
      return existing
    }

    const fighter: Fighter = {
      id: data.id,
      name: data.name,
      nickname: data.nickname,
      record: data.record,
      weightClass: normalizedWeight || 'unknown',
      age: 0,
      height: 'Unknown',
      reach: 'Unknown',
      wins: data.wins,
      losses: data.losses,
      draws: data.draws,
      nationality: 'Unknown',
      fightingStyle: 'unknown'
    }

    map.set(data.id, fighter)
    return fighter
  }

  private parseRecord(recordText: string): { wins: number, losses: number, draws: number } {
    const defaultRecord = { wins: 0, losses: 0, draws: 0 }
    if (!recordText) {
      return defaultRecord
    }

    const match = recordText.match(/(\d+)-(\d+)-(\d+)/)
    if (!match) {
      return defaultRecord
    }

    return {
      wins: Number(match[1] ?? 0),
      losses: Number(match[2] ?? 0),
      draws: Number(match[3] ?? 0)
    }
  }

  private parseSherdogDate(rawDate: string): string | null {
    const match = rawDate.match(/^([A-Za-z]{3})(\d{2})(\d{4})$/)
    if (!match) {
      return null
    }

    const [, monthAbbr, day, year] = match
    const monthIndex = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(monthAbbr)
    if (monthIndex === -1) {
      return null
    }

    const date = new Date(Date.UTC(Number(year), monthIndex, Number(day)))
    if (Number.isNaN(date.getTime())) {
      return null
    }

    return this.formatDate(date)
  }

  private splitVenueAndLocation(raw: string): { venue: string, location: string } {
    if (!raw) {
      return { venue: 'TBD', location: 'TBD' }
    }

    const parts = raw.split(',').map(part => part.trim()).filter(Boolean)
    if (parts.length === 0) {
      return { venue: 'TBD', location: 'TBD' }
    }

    const venue = parts.shift() || 'TBD'
    const location = parts.join(', ') || 'TBD'

    return { venue, location }
  }

  private normalizeWeightClass(raw: string): string {
    if (!raw) {
      return 'unknown'
    }

    const cleaned = raw.replace(/title fight/i, '').trim().toLowerCase()

    if (cleaned.includes('women') && cleaned.includes('straw')) return 'womens_strawweight'
    if (cleaned.includes('women') && cleaned.includes('fly')) return 'womens_flyweight'
    if (cleaned.includes('women') && cleaned.includes('bantam')) return 'womens_bantamweight'
    if (cleaned.includes('women') && cleaned.includes('feather')) return 'womens_featherweight'
    if (cleaned.includes('straw')) return 'strawweight'
    if (cleaned.includes('fly')) return 'flyweight'
    if (cleaned.includes('bantam')) return 'bantamweight'
    if (cleaned.includes('feather')) return 'featherweight'
    if (cleaned.includes('lightweight')) return 'lightweight'
    if (cleaned.includes('welter')) return 'welterweight'
    if (cleaned.includes('middle')) return 'middleweight'
    if (cleaned.includes('light heavy')) return 'light_heavyweight'
    if (cleaned.includes('heavyweight')) return 'heavyweight'
    if (cleaned.includes('catchweight')) return 'catchweight'

    return 'unknown'
  }

  private async generateFightPredictions(fights: Fight[], eventName: string): Promise<Fight[]> {
    if (!fights.length || !this.openai) {
      return fights
    }

    try {
      console.log(`🎯 Generating entertainment predictions for ${eventName}`)

      const predictionModel = process.env.OPENAI_PREDICTION_MODEL || 'gpt-4o-mini'
      const chunkSizeRaw = Number(process.env.OPENAI_PREDICTION_CHUNK_SIZE ?? 6)
      const chunkSize = Number.isFinite(chunkSizeRaw) && chunkSizeRaw > 0 ? Math.max(1, Math.floor(chunkSizeRaw)) : 6
      const fightChunks = this.chunkArray(fights, chunkSize)
      const aggregatedPredictions = new Map<string, PredictionResult>()

      for (const [index, chunk] of fightChunks.entries()) {
        const prompt = buildPredictionPrompt(eventName, chunk)

        console.log(`🤖 Requesting predictions batch ${index + 1}/${fightChunks.length} (${chunk.length} fights) for ${eventName}`)

        const completion = await this.openai.chat.completions.create({
          model: predictionModel,
          messages: [
            {
              role: 'system',
              content: 'You are a professional MMA analyst who provides insightful predictions about fight excitement and finish probability based on real fighter data.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.4,
          max_tokens: 2000
        })

        const response = completion.choices[0]?.message?.content
        if (!response) {
          throw new Error('No prediction response from OpenAI')
        }

        const predictions = this.parsePredictionResponse(response, `batch ${index + 1}/${fightChunks.length}`)
        if (!predictions.length) {
          console.warn(`⚠️ No predictions returned for batch ${index + 1}/${fightChunks.length}`)
        }

        for (const prediction of predictions) {
          if (prediction?.fightId) {
            aggregatedPredictions.set(prediction.fightId, prediction)
          }
        }
      }

      return fights.map(fight => {
        const prediction = aggregatedPredictions.get(fight.id)
        if (prediction) {
          return {
            ...fight,
            finishProbability: prediction.finishProbability,
            funFactor: prediction.funFactor,
            entertainmentReason: prediction.entertainmentReason,
            keyFactors: prediction.keyFactors || [],
            fightPrediction: prediction.prediction,
            riskLevel: prediction.riskLevel ?? undefined
          }
        }

        console.warn(`⚠️ Missing prediction for fight: ${fight.fighter1Name} vs ${fight.fighter2Name}`)
        return {
          ...fight,
          funFactor: fight.funFactor ?? 0,
          finishProbability: fight.finishProbability ?? 0,
          entertainmentReason: fight.entertainmentReason || 'AI prediction unavailable. Data generated from scraper only.',
          keyFactors: fight.keyFactors || [],
          riskLevel: fight.riskLevel ?? undefined
        }
      })

    } catch (error) {
      console.error('❌ Error generating fight predictions:', error)
      return fights
    }
  }

  private parsePredictionResponse(response: string, context: string): PredictionResult[] {
    let cleanPredResponse = response.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim()
    cleanPredResponse = cleanPredResponse.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')

    let predictions: PredictionResult[] = []
    try {
      const parsed = JSON.parse(cleanPredResponse)
      predictions = Array.isArray(parsed) ? parsed : []
    } catch (parseError) {
      console.error(`❌ Predictions JSON parsing failed (${context}):`, parseError)
      console.error('Raw predictions response:', response.substring(0, 500))
      console.error('Cleaned predictions response:', cleanPredResponse.substring(0, 500))

      try {
        let bracketMatches = cleanPredResponse.match(/\{(?:[^{}]|\{[^{}]*\})*\}/g)

        if (!bracketMatches) {
          bracketMatches = cleanPredResponse.match(/\{[^{}]*\}/g)
        }

        if (bracketMatches) {
          predictions = bracketMatches.map(match => {
            try {
              let cleanMatch = match.replace(/"[^"]*$/, '""')
              cleanMatch = cleanMatch.replace(/,\s*}/, '}')
              return JSON.parse(cleanMatch)
            } catch {
              return null
            }
          }).filter(Boolean) as PredictionResult[]
          console.log(`🔧 Recovered ${predictions.length} predictions from partial JSON (${context})`)
        } else {
          console.log(`❌ Could not recover any predictions (${context}), using default values`)
        }
      } catch {
        console.log(`❌ JSON recovery failed (${context}), using default values`)
      }
    }

    return predictions
  }

  private chunkArray<T>(items: T[], size: number): T[][] {
    if (size <= 0) {
      return [items]
    }

    const chunks: T[][] = []
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size))
    }
    return chunks
  }

  private parseEventDate(dateString: string): Date | null {
    if (!dateString) {
      return null
    }

    const parsed = new Date(dateString)
    if (Number.isNaN(parsed.getTime())) {
      return null
    }

    parsed.setUTCHours(0, 0, 0, 0)
    return parsed
  }

  private formatDate(date: Date): string {
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  private async buildEventWithFights(realEvent: RealUFCEvent): Promise<{ event: UFCEvent, fighters: Fighter[] } | null> {
    console.log(`🧩 Building fight card for ${realEvent.name} (${realEvent.date})`)

    // Try to get fight details from multiple sources
    const fightDetails = await this.fetchFightDetails(realEvent)

    const eventId = this.slugify(realEvent.name)
    const fightCard = fightDetails.fights

    const event: UFCEvent = {
      id: eventId,
      name: realEvent.name,
      date: realEvent.date,
      location: realEvent.location,
      venue: realEvent.venue,
      fightCard,
      mainCard: fightCard.filter(f => f.cardPosition === 'main'),
      prelimCard: fightCard.filter(f => f.cardPosition === 'preliminary'),
      earlyPrelimCard: fightCard.filter(f => f.cardPosition === 'early-preliminary')
    }

    return {
      event,
      fighters: fightDetails.fighters
    }
  }

}
