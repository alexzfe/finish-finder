import OpenAI from 'openai'
import axios from 'axios'
import * as cheerio from 'cheerio'

interface RealUFCEvent {
  name: string
  date: string
  location: string
  venue: string
  status: 'upcoming' | 'completed'
  detailUrl?: string
  mainFights?: string[]
  source: string
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

  constructor(enableAI: boolean = true) {
    if (enableAI && process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      })
    } else if (enableAI && !process.env.OPENAI_API_KEY) {
      console.warn('⚠️ OpenAI API key not found. AI predictions will be disabled.')
    }
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

    try {
      console.log('🔍 Fetching upcoming UFC events from Sherdog...')

      const events = await this.fetchSherdogEvents(limit)

      console.log(`✅ Retrieved ${events.length} upcoming events from Sherdog`)
      return events

    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        this.sherdogBlocked = true
        const blockedError = new Error('Sherdog responded with HTTP 403 (blocked)') as Error & { code?: SherdogBlockCode }
        blockedError.name = 'SherdogBlockedError'
        blockedError.code = 'SHERDOG_BLOCKED'
        console.warn('⚠️ Sherdog blocked the request with HTTP 403. Treating as transient protection.');
        throw blockedError
      }

      console.error('❌ Error searching for real events:', error)
      return []
    }
  }

  isSherdogBlocked(): boolean {
    return this.sherdogBlocked
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
    const headers = {
      'User-Agent': 'Mozilla/5.0 (compatible; FunFightPredictorBot/1.0; +https://example.com)'
    }

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

    const headers = {
      'User-Agent': 'Mozilla/5.0 (compatible; FunFightPredictorBot/1.0; +https://example.com)'
    }

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

  private extractSherdogFighter(fighterCell: any, weightClass: string): {
    id: string
    name: string
    nickname?: string
    record: string
    wins: number
    losses: number
    draws: number
    weightClass: string
  } | null {
    const nameNode = fighterCell.find('.fighter_result_data span[itemprop=name]').first()
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

    const recordText = fighterCell.find('.record em').text().trim()
    const { wins, losses, draws } = this.parseRecord(recordText)

    const imgTitle = fighterCell.find('img').attr('title') || ''
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

  private extractSherdogFeaturedFighter(fighterCard: any, weightClass: string): {
    id: string
    name: string
    nickname?: string
    record: string
    wins: number
    losses: number
    draws: number
    weightClass: string
  } | null {
    if (!fighterCard.length) {
      return null
    }

    const nameNode = fighterCard.find('span[itemprop=name]').first()
    if (!nameNode.length) {
      return null
    }

    const name = nameNode.text().replace(/\s+/g, ' ').trim()
    if (!name) {
      return null
    }

    const recordText = fighterCard.find('.record').text().trim()
    const { wins, losses, draws } = this.parseRecord(recordText)

    const imgTitle = fighterCard.find('img').attr('title') || ''
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
      const fightList = fights
        .map(f => `${f.id}: ${f.fighter1Name} vs ${f.fighter2Name} (${f.weightClass}) - ${f.cardPosition}`)
        .join('\n')

      const prompt = `You are a professional MMA analyst specializing in entertainment value prediction. Analyze these REAL upcoming UFC fights for fan engagement and excitement potential.

FIGHTS TO ANALYZE:
${fightList}

ENTERTAINMENT EVALUATION CRITERIA:
1. **Striking Power & Aggression**: Knockout artists, heavy hitters, volume strikers
2. **Submission Threat**: Grappling specialists, submission artists
3. **Fighting Styles Clash**: Striker vs grappler, counter-puncher vs pressure fighter
4. **Recent Form**: Win streaks, spectacular finishes, momentum
5. **Historical Performance**: Fight of the Night bonuses, finish rates
6. **Stylistic Matchup**: Fighting styles that create fireworks
7. **Title Implications**: Championship fights, rankings impact
8. **Personal Narratives**: Rivalries, comebacks, career-defining moments

FUN FACTOR SCALE (1-10):
- 1-3: Technical decision likely, low action
- 4-5: Solid fight, some excitement moments
- 6-7: Entertaining bout, good action throughout
- 8-9: Potential Fight of the Night, high entertainment
- 10: Can't-miss spectacle, guaranteed fireworks

FINISH PROBABILITY (0-100%):
- Consider knockout power, submission skills, chinny fighters
- Factor in fighting styles and typical fight patterns
- Account for recent finishes and finish rates

FORMAT AS EXACT JSON:
[
  {
    "fightId": "fight-id",
    "funFactor": 8,
    "finishProbability": 75,
    "entertainmentReason": "Detailed 2-3 sentence explanation of why this fight will be entertaining, focusing on specific fighting styles, recent performances, and what makes it must-watch.",
    "keyFactors": ["Knockout Power", "Style Clash", "Title Implications"],
    "prediction": "Brief prediction of how the fight will play out",
    "riskLevel": "high|medium|low"
  }
]

Provide specific, detailed analysis for each fight explaining the entertainment value.`

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

      // Clean and parse the JSON response
      let cleanPredResponse = response.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim()

      // Additional cleaning for malformed JSON
      cleanPredResponse = cleanPredResponse.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')

      let predictions: PredictionResult[]
      try {
        const parsed = JSON.parse(cleanPredResponse)
        predictions = Array.isArray(parsed) ? parsed : []
      } catch (parseError) {
        console.error('❌ Predictions JSON parsing failed:', parseError)
        console.error('Raw predictions response:', response.substring(0, 500))
        console.error('Cleaned predictions response:', cleanPredResponse.substring(0, 500))

        // Try to recover partial JSON by finding valid objects
        try {
          // First try to match complete objects with potential nesting
          let bracketMatches = cleanPredResponse.match(/\{(?:[^{}]|\{[^{}]*\})*\}/g)

          if (!bracketMatches) {
            // Fallback to simpler pattern
            bracketMatches = cleanPredResponse.match(/\{[^{}]*\}/g)
          }

          if (bracketMatches) {
            predictions = bracketMatches.map(match => {
              try {
                // Clean up potential incomplete strings in the match
                let cleanMatch = match.replace(/"[^"]*$/, '""') // Fix unterminated strings
                cleanMatch = cleanMatch.replace(/,\s*}/, '}') // Remove trailing commas
                return JSON.parse(cleanMatch)
              } catch {
                return null
              }
            }).filter(Boolean)
            console.log(`🔧 Recovered ${predictions.length} predictions from partial JSON`)
          } else {
            console.log('❌ Could not recover any predictions, using default values')
            predictions = []
          }
        } catch {
          console.log('❌ JSON recovery failed, using default values')
          predictions = []
        }
      }

      // Merge predictions back into fights with new structured data
      return fights.map(fight => {
        const prediction = predictions.find(p => p.fightId === fight.id)
        if (prediction) {
          return {
            ...fight,
            finishProbability: prediction.finishProbability,
            entertainmentReason: prediction.entertainmentReason,
            keyFactors: prediction.keyFactors,
            fightPrediction: prediction.prediction,
            riskLevel: prediction.riskLevel,
            funFactor: prediction.funFactor
          }
        }

        return fight
      })

    } catch (error) {
      console.error('❌ Error generating fight predictions:', error)
      return fights
    }
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

    const fightDetails = await this.fetchSherdogFightDetails(realEvent)

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
