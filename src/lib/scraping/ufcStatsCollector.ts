// Advanced UFC Stats Data Collector
import puppeteer from 'puppeteer'
import { HTMLElement, parse } from 'node-html-parser'
import { Fighter, UFCEvent, Fight } from '@/types'
import fs from 'fs/promises'
import path from 'path'

export class UFCStatsCollector {
  private browser: any = null
  private baseUrl = 'http://ufcstats.com'
  private dataDir = path.join(process.cwd(), 'data', 'scraped')

  constructor() {
    this.ensureDataDirectory()
  }

  private async ensureDataDirectory() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true })
    } catch (error) {
      console.error('Error creating data directory:', error)
    }
  }

  async initialize() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      })
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }

  // Scrape all fighters from UFCStats.com
  async scrapeFighters(): Promise<Fighter[]> {
    await this.initialize()
    const fighters: Fighter[] = []

    try {
      console.log('📊 Starting fighter data collection...')
      const page = await this.browser.newPage()

      // Set user agent to avoid blocking
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')

      // Navigate to fighters page
      await page.goto(`${this.baseUrl}/statistics/fighters`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      })

      // Get all fighter links
      const fighterLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/fighter-details/"]'))
        return links.map(link => ({
          url: (link as HTMLAnchorElement).href,
          name: link.textContent?.trim() || ''
        }))
      })

      console.log(`Found ${fighterLinks.length} fighters to scrape`)

      // Scrape each fighter (limit to first 50 for testing)
      for (let i = 0; i < Math.min(fighterLinks.length, 50); i++) {
        const link = fighterLinks[i]

        try {
          console.log(`Scraping fighter ${i + 1}/${Math.min(fighterLinks.length, 50)}: ${link.name}`)

          await page.goto(link.url, { waitUntil: 'networkidle2', timeout: 15000 })

          const fighterData = await this.scrapeFighterDetails(page)
          if (fighterData) {
            fighters.push(fighterData)
          }

          // Rate limiting
          await page.waitForTimeout(1000)
        } catch (error) {
          console.error(`Error scraping fighter ${link.name}:`, error)
          continue
        }
      }

      await page.close()

      // Save fighters data
      await this.saveData('fighters.json', fighters)
      console.log(`✅ Successfully scraped ${fighters.length} fighters`)

    } catch (error) {
      console.error('Error in scrapeFighters:', error)
    }

    return fighters
  }

  // Scrape individual fighter details
  private async scrapeFighterDetails(page: any): Promise<Fighter | null> {
    try {
      const fighterData = await page.evaluate(() => {
        // Extract fighter name and nickname
        const nameElement = document.querySelector('.b-content__title')
        const fullName = nameElement?.textContent?.trim() || ''

        // Parse name and nickname
        let name = fullName
        let nickname = ''
        const nicknameMatch = fullName.match(/^(.+?)\s+"(.+?)"\s*$/)
        if (nicknameMatch) {
          name = nicknameMatch[1].trim()
          nickname = nicknameMatch[2].trim()
        }

        // Extract record
        const recordElement = document.querySelector('.b-content__title-record')
        const recordText = recordElement?.textContent?.trim() || ''
        const recordMatch = recordText.match(/Record:\s*(\d+)-(\d+)-(\d+)/)

        const wins = recordMatch ? parseInt(recordMatch[1]) : 0
        const losses = recordMatch ? parseInt(recordMatch[2]) : 0
        const draws = recordMatch ? parseInt(recordMatch[3]) : 0

        // Extract stats from the stats table
        const statRows = Array.from(document.querySelectorAll('.b-list__box-list-item'))
        const stats: Record<string, string> = {}

        statRows.forEach(row => {
          const label = row.querySelector('.b-list__box-list-item-title')?.textContent?.trim()
          const value = row.querySelector('.b-list__box-list-item-title + .b-list__box-list-item-title')?.textContent?.trim()

          if (label && value) {
            stats[label] = value
          }
        })

        // Extract physical attributes
        const heightElement = document.querySelector('[data-type="Height"]')
        const weightElement = document.querySelector('[data-type="Weight"]')
        const reachElement = document.querySelector('[data-type="Reach"]')

        return {
          name,
          nickname,
          record: { wins, losses, draws },
          stats,
          physical: {
            height: heightElement?.textContent?.trim() || '',
            weight: weightElement?.textContent?.trim() || '',
            reach: reachElement?.textContent?.trim() || ''
          }
        }
      })

      // Process and normalize the scraped data
      const fighter: Fighter = {
        id: this.generateFighterId(fighterData.name),
        name: fighterData.name,
        nickname: fighterData.nickname || undefined,
        record: fighterData.record,
        stats: {
          finishRate: this.parsePercentage(fighterData.stats['Finish Rate'] || '0%'),
          koPercentage: this.parsePercentage(fighterData.stats['KO/TKO'] || '0%'),
          submissionPercentage: this.parsePercentage(fighterData.stats['Submission'] || '0%'),
          averageFightTime: this.parseTime(fighterData.stats['Avg. Fight Time'] || '0:00'),
          significantStrikesPerMinute: parseFloat(fighterData.stats['Sig. Str. per Min'] || '0'),
          takedownAccuracy: this.parsePercentage(fighterData.stats['Takedown Accuracy'] || '0%')
        },
        popularity: {
          socialFollowers: 0, // Will be populated from social media APIs later
          recentBuzzScore: 50, // Default neutral score
          fanFavorite: false
        },
        funScore: 0, // Will be calculated
        weightClass: this.extractWeightClass(fighterData.physical.weight),
        fighting_style: this.inferFightingStyle(fighterData.stats)
      }

      return fighter

    } catch (error) {
      console.error('Error parsing fighter details:', error)
      return null
    }
  }

  // Scrape upcoming events from UFC.com
  async scrapeUpcomingEvents(): Promise<UFCEvent[]> {
    await this.initialize()
    const events: UFCEvent[] = []

    try {
      console.log('📅 Scraping upcoming UFC events...')
      const page = await this.browser.newPage()

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
      await page.goto('https://www.ufc.com/events', {
        waitUntil: 'networkidle2',
        timeout: 30000
      })

      const eventData = await page.evaluate(() => {
        const eventCards = Array.from(document.querySelectorAll('.c-card-event'))

        return eventCards.map(card => {
          const titleElement = card.querySelector('.c-card-event__headline')
          const dateElement = card.querySelector('.c-card-event__date')
          const locationElement = card.querySelector('.c-card-event__location')
          const linkElement = card.querySelector('a')

          return {
            title: titleElement?.textContent?.trim() || '',
            date: dateElement?.textContent?.trim() || '',
            location: locationElement?.textContent?.trim() || '',
            url: linkElement ? new URL(linkElement.href, 'https://www.ufc.com').href : ''
          }
        })
      })

      // Process each event
      for (const eventInfo of eventData.slice(0, 5)) { // Limit to 5 events
        if (eventInfo.title && eventInfo.url) {
          try {
            console.log(`Processing event: ${eventInfo.title}`)

            const event: UFCEvent = {
              id: this.generateEventId(eventInfo.title),
              name: eventInfo.title,
              date: this.parseEventDate(eventInfo.date),
              location: eventInfo.location,
              venue: '', // Will be extracted from event page
              fightCard: [],
              mainCard: [],
              prelimCard: [],
              earlyPrelimCard: []
            }

            events.push(event)
          } catch (error) {
            console.error(`Error processing event ${eventInfo.title}:`, error)
          }
        }
      }

      await page.close()
      await this.saveData('events.json', events)
      console.log(`✅ Successfully scraped ${events.length} events`)

    } catch (error) {
      console.error('Error in scrapeUpcomingEvents:', error)
    }

    return events
  }

  // Utility functions
  private generateFighterId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  }

  private generateEventId(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  }

  private parsePercentage(value: string): number {
    const match = value.match(/(\d+(?:\.\d+)?)%?/)
    return match ? parseFloat(match[1]) : 0
  }

  private parseTime(timeStr: string): number {
    const match = timeStr.match(/(\d+):(\d+)/)
    if (match) {
      const minutes = parseInt(match[1])
      const seconds = parseInt(match[2])
      return minutes * 60 + seconds
    }
    return 0
  }

  private extractWeightClass(weight: string): string {
    const weightNum = parseFloat(weight.replace(/[^\d.]/g, ''))

    if (weightNum <= 115) return 'strawweight'
    if (weightNum <= 125) return 'flyweight'
    if (weightNum <= 135) return 'bantamweight'
    if (weightNum <= 145) return 'featherweight'
    if (weightNum <= 155) return 'lightweight'
    if (weightNum <= 170) return 'welterweight'
    if (weightNum <= 185) return 'middleweight'
    if (weightNum <= 205) return 'light_heavyweight'
    return 'heavyweight'
  }

  private inferFightingStyle(stats: Record<string, string>): string[] {
    const styles: string[] = []

    const strikeRate = parseFloat(stats['Sig. Str. per Min'] || '0')
    const takedownRate = parseFloat(stats['Takedowns per 15 min'] || '0')
    const submissionRate = this.parsePercentage(stats['Submission'] || '0%')

    if (strikeRate > 4) styles.push('striking')
    if (takedownRate > 2) styles.push('wrestling')
    if (submissionRate > 20) styles.push('submissions')
    if (styles.length === 0) styles.push('mixed')

    return styles
  }

  private parseEventDate(dateStr: string): Date {
    // Parse various date formats from UFC.com
    const cleanDate = dateStr.replace(/[^\w\s,]/g, '').trim()

    try {
      return new Date(cleanDate)
    } catch {
      // Default to 30 days from now if parsing fails
      const future = new Date()
      future.setDate(future.getDate() + 30)
      return future
    }
  }

  private async saveData(filename: string, data: any) {
    try {
      const filepath = path.join(this.dataDir, filename)
      await fs.writeFile(filepath, JSON.stringify(data, null, 2))
      console.log(`💾 Saved data to ${filepath}`)
    } catch (error) {
      console.error(`Error saving ${filename}:`, error)
    }
  }

  // Load previously scraped data
  async loadData(filename: string): Promise<any> {
    try {
      const filepath = path.join(this.dataDir, filename)
      const data = await fs.readFile(filepath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      console.log(`No existing data found for ${filename}`)
      return null
    }
  }

  // Main collection method
  async collectAllData(): Promise<{
    fighters: Fighter[]
    events: UFCEvent[]
  }> {
    console.log('🚀 Starting comprehensive UFC data collection...')

    try {
      // Check for existing data first
      let fighters = await this.loadData('fighters.json')
      let events = await this.loadData('events.json')

      // Scrape if data doesn't exist or is old
      if (!fighters) {
        fighters = await this.scrapeFighters()
      }

      if (!events) {
        events = await this.scrapeUpcomingEvents()
      }

      console.log('✅ Data collection complete!')
      console.log(`📊 Fighters: ${fighters?.length || 0}`)
      console.log(`📅 Events: ${events?.length || 0}`)

      return { fighters: fighters || [], events: events || [] }

    } finally {
      await this.cleanup()
    }
  }
}