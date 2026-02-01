// UFC Data Scraper
import axios from 'axios'
import * as cheerio from 'cheerio'
import { Fighter, UFCEvent, Fight } from '@/types'

export class UFCScraper {
  private baseUrl = 'https://www.ufc.com'
  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'

  private async fetchPage(url: string): Promise<cheerio.CheerioAPI> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: 10000
      })
      return cheerio.load(response.data)
    } catch (error) {
      console.error(`Error fetching ${url}:`, error)
      throw new Error(`Failed to fetch page: ${url}`)
    }
  }

  // Scrape upcoming UFC events
  async scrapeUpcomingEvents(): Promise<UFCEvent[]> {
    try {
      const $ = await this.fetchPage(`${this.baseUrl}/events`)
      const events: UFCEvent[] = []

      // This is a simplified scraper - in production, you'd need to handle the actual UFC.com structure
      $('.event-card').each((index, element) => {
        const $event = $(element)
        const name = $event.find('.event-title').text().trim()
        const dateStr = $event.find('.event-date').text().trim()
        const location = $event.find('.event-location').text().trim()

        if (name && dateStr) {
          events.push({
            id: `ufc-${Date.now()}-${index}`,
            name,
            date: new Date(dateStr),
            location: location || 'TBD',
            venue: 'TBD',
            fightCard: [],
            mainCard: [],
            prelimCard: [],
            earlyPrelimCard: []
          })
        }
      })

      return events
    } catch (error) {
      console.error('Error scraping upcoming events:', error)
      return []
    }
  }

  // Scrape fighter profile from UFC stats
  async scrapeFighterStats(fighterName: string): Promise<Partial<Fighter> | null> {
    try {
      // This would integrate with UFCStats.com or similar
      // For now, return mock data structure
      return {
        name: fighterName,
        stats: {
          finishRate: Math.random() * 100,
          koPercentage: Math.random() * 50,
          submissionPercentage: Math.random() * 30,
          averageFightTime: Math.floor(Math.random() * 1800) + 300, // 5-35 minutes
          significantStrikesPerMinute: Math.random() * 10,
          takedownAccuracy: Math.random() * 100,
        }
      }
    } catch (error) {
      console.error(`Error scraping fighter stats for ${fighterName}:`, error)
      return null
    }
  }

  // Scrape fight card for a specific event
  async scrapeFightCard(eventUrl: string): Promise<Fight[]> {
    try {
      const $ = await this.fetchPage(eventUrl)
      const fights: Fight[] = []

      // This would parse the actual fight card structure
      $('.fight-card .fight').each((index, element) => {
        const $fight = $(element)
        const fighter1Name = $fight.find('.fighter-1 .name').text().trim()
        const fighter2Name = $fight.find('.fighter-2 .name').text().trim()
        const weightClass = $fight.find('.weight-class').text().trim()

        if (fighter1Name && fighter2Name) {
          // Note: This would need actual fighter data integration
          // For now, creating placeholder structure
          fights.push({
            id: `fight-${Date.now()}-${index}`,
            fighter1: { name: fighter1Name } as Fighter,
            fighter2: { name: fighter2Name } as Fighter,
            weightClass: weightClass || 'Unknown',
            titleFight: $fight.hasClass('title-fight'),
            mainEvent: index === 0,
            event: {} as UFCEvent, // Would be populated with actual event
            predictedFunScore: 0,
            funFactors: [],
            aiDescription: '',
            bookingDate: new Date(),
            completed: false
          })
        }
      })

      return fights
    } catch (error) {
      console.error(`Error scraping fight card from ${eventUrl}:`, error)
      return []
    }
  }
}

// Usage example and utility functions
export async function getFighterFinishRate(fighter: Fighter): Promise<number> {
  // Calculate finish rate based on fighter's record and stats
  const totalFights = fighter.record.wins + fighter.record.losses + fighter.record.draws
  if (totalFights === 0) return 0

  const finishes = (fighter.stats.koPercentage / 100 * fighter.record.wins) +
                   (fighter.stats.submissionPercentage / 100 * fighter.record.wins)

  return (finishes / totalFights) * 100
}

export function calculateStyleMatchup(fighter1: Fighter, fighter2: Fighter): number {
  // Simple style matchup calculation
  // In reality, this would be much more sophisticated
  const f1Striker = fighter1.fighting_style?.includes('striking') || false
  const f1Grappler = fighter1.fighting_style?.includes('grappling') || false
  const f2Striker = fighter2.fighting_style?.includes('striking') || false
  const f2Grappler = fighter2.fighting_style?.includes('grappling') || false

  // Striker vs Striker = high entertainment
  if (f1Striker && f2Striker) return 85
  // Grappler vs Striker = moderate entertainment
  if ((f1Grappler && f2Striker) || (f1Striker && f2Grappler)) return 70
  // Grappler vs Grappler = lower entertainment (generally)
  if (f1Grappler && f2Grappler) return 60

  return 50 // Unknown matchup
}