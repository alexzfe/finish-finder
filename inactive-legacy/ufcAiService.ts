import OpenAI from 'openai'

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
  fightNumber?: number

  // Enhanced AI predictions
  funFactor?: number
  finishProbability?: number
  entertainmentReason?: string
  keyFactors?: string[]
  fightPrediction?: string
  riskLevel?: 'high' | 'medium' | 'low'

  // Legacy fields (for backward compatibility)
  excitementLevel?: number
  prediction?: string
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
  rank?: number

  // Enhanced AI-collected data
  winsByKO?: number
  winsBySubmission?: number
  winsByDecision?: number
  currentStreak?: string
  ranking?: number
}

export class UFCAIService {
  private openai: OpenAI

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required')
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }

  async getUpcomingUFCEvents(limit: number = 3): Promise<{ events: UFCEvent[], fighters: Fighter[] }> {
    try {
      console.log('🤖 Generating UFC events using AI...')

      const prompt = this.buildEventPrompt(limit)

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a UFC expert who provides accurate, up-to-date information about upcoming UFC events. Always return valid JSON data that matches the requested schema exactly."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 4000,
      })

      const response = completion.choices[0]?.message?.content
      if (!response) {
        throw new Error('No response from OpenAI')
      }

      // Clean and parse the JSON response (remove markdown code blocks if present)
      const cleanResponse = response.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim()
      const data = JSON.parse(cleanResponse)

      // Validate and process the data
      const processedData = this.processAIResponse(data)

      console.log(`✅ Generated ${processedData.events.length} events with ${processedData.fighters.length} fighters`)

      return processedData

    } catch (error) {
      console.error('Error generating UFC data with AI:', error)
      // Fallback to a basic mock event
      return this.getFallbackData()
    }
  }

  async generateFightPredictions(fights: Fight[]): Promise<Fight[]> {
    try {
      console.log('🤖 Generating fight predictions using AI...')

      const prompt = this.buildPredictionPrompt(fights)

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a professional MMA analyst who provides insightful predictions about fight excitement and finish probability. Focus on fighting styles, recent form, and matchup dynamics."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.4,
        max_tokens: 2000,
      })

      const response = completion.choices[0]?.message?.content
      if (!response) {
        throw new Error('No prediction response from OpenAI')
      }

      // Clean and parse the JSON response (remove markdown code blocks if present)
      const cleanPredResponse = response.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim()
      const predictions = JSON.parse(cleanPredResponse)

      // Merge predictions back into fights with new structured data
      return fights.map(fight => {
        const prediction = predictions.find((p: any) => p.fightId === fight.id)
        if (prediction) {
          return {
            ...fight,
            finishProbability: prediction.finishProbability,
            excitementLevel: prediction.funFactor,
            prediction: prediction.entertainmentReason,
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
      console.error('Error generating fight predictions:', error)
      return fights
    }
  }

  private buildEventPrompt(limit: number): string {
    const currentDate = new Date().toISOString().split('T')[0]

    return `You are a UFC data specialist. Provide the next ${limit} upcoming UFC events as of ${currentDate} with complete, accurate information for database storage.

CRITICAL REQUIREMENTS:
1. Use REAL upcoming UFC events only (no fictional events)
2. Include REAL UFC fighters currently on the roster
3. Accurate fight card positioning and bout details
4. Complete fighter biographical data for database storage

Format response as JSON with this EXACT structure:

{
  "events": [
    {
      "id": "ufc-xxx-event-slug",
      "name": "UFC XXX: Fighter vs Fighter",
      "date": "2025-MM-DD",
      "location": "City, State/Country",
      "venue": "Arena Name",
      "fightCard": [
        {
          "id": "fight-unique-id",
          "fighter1Name": "Real Fighter Name",
          "fighter2Name": "Real Fighter Name",
          "weightClass": "Weight Division",
          "cardPosition": "main|preliminary|early-preliminary",
          "scheduledRounds": 3|5,
          "status": "scheduled",
          "titleFight": true|false,
          "fightNumber": 1
        }
      ]
    }
  ],
  "fighters": [
    {
      "id": "fighter-name-slug",
      "name": "Fighter Full Name",
      "nickname": "Fighter Nickname",
      "record": "W-L-D",
      "weightClass": "Primary Weight Class",
      "age": 30,
      "height": "5'10\"",
      "reach": "70\"",
      "wins": 15,
      "losses": 3,
      "draws": 0,
      "nationality": "Country",
      "fightingStyle": "Striker|Grappler|Well-Rounded",
      "winsByKO": 8,
      "winsBySubmission": 4,
      "winsByDecision": 3,
      "currentStreak": "3 win streak",
      "ranking": 5
    }
  ]
}

Focus on events within the next 60 days. Prioritize title fights and popular matchups.`
  }

  private buildPredictionPrompt(fights: Fight[]): string {
    const fightList = fights.map(f =>
      `${f.id}: ${f.fighter1Name} vs ${f.fighter2Name} (${f.weightClass}) - ${f.cardPosition}`
    ).join('\n')

    return `You are a professional MMA analyst specializing in entertainment value prediction. Analyze these UFC fights for fan engagement and excitement potential.

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
  }

  private processAIResponse(data: any): { events: UFCEvent[], fighters: Fighter[] } {
    const events: UFCEvent[] = data.events?.map((event: any) => {
      // Separate fights into card positions
      const mainCard = event.fightCard?.filter((f: any) => f.cardPosition === 'main') || []
      const prelimCard = event.fightCard?.filter((f: any) => f.cardPosition === 'preliminary') || []
      const earlyPrelimCard = event.fightCard?.filter((f: any) => f.cardPosition === 'early-preliminary') || []

      return {
        ...event,
        mainCard,
        prelimCard,
        earlyPrelimCard,
        fightCard: event.fightCard?.map((fight: any) => ({
          ...fight,
          fighter1Id: this.generateId(fight.fighter1Name),
          fighter2Id: this.generateId(fight.fighter2Name),
        })) || []
      }
    }) || []

    const fighters: Fighter[] = data.fighters?.map((fighter: any) => ({
      ...fighter,
      id: this.generateId(fighter.name),
      rank: fighter.rank || null
    })) || []

    return { events, fighters }
  }

  private getFallbackData(): { events: UFCEvent[], fighters: Fighter[] } {
    const fallbackEvent: UFCEvent = {
      id: 'ufc-upcoming',
      name: 'UFC Upcoming Event',
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      location: 'Las Vegas, NV',
      venue: 'T-Mobile Arena',
      fightCard: [],
      mainCard: [],
      prelimCard: [],
      earlyPrelimCard: []
    }

    return {
      events: [fallbackEvent],
      fighters: []
    }
  }

  private generateId(name: string): string {
    return name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }
}