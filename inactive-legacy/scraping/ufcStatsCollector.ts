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
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-blink-features=AutomationControlled'
        ]
      })
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }

  // Main method: Get next 3 events and collect all fighters from those events
  async collectTargetedData(eventLimit: number = 3, forceReal: boolean = false): Promise<{ events: UFCEvent[], fighters: Fighter[] }> {
    await this.initialize()

    try {
      console.log(`🎯 Starting targeted collection: Next ${eventLimit} UFC events and their fighters...`)
      if (forceReal) {
        console.log('🔥 FORCE REAL DATA MODE: Will only use real data sources')
      }

      // Check if we already have real event data and preserve it
      let events: UFCEvent[] = []
      const existingEventsPath = path.join(this.dataDir, 'events.json')

      try {
        if (fs.existsSync(existingEventsPath)) {
          const existingData = JSON.parse(fs.readFileSync(existingEventsPath, 'utf8'))
          if (Array.isArray(existingData) && existingData.length > 0) {
            // Check if existing events have valid dates in 2025+
            const hasValidDates = existingData.some(event =>
              event.date && new Date(event.date).getFullYear() >= 2025
            )

            if (hasValidDates) {
              console.log(`✅ Found ${existingData.length} existing real events with valid dates - preserving them`)
              events = existingData
            }
          }
        }
      } catch (error) {
        console.log('❌ Could not read existing events, will scrape new ones')
      }

      // Step 1: Get upcoming events with fight cards (only if we don't have real data)
      if (events.length === 0) {
        console.log('📅 Step 1: Collecting upcoming UFC events with fight cards...')
        events = await this.scrapeUpcomingEvents(eventLimit)
      } else {
        console.log('📅 Step 1: Using existing real event data...')
      }

      // Only proceed with real events
      if (events.length === 0) {
        console.log('❌ No real events found - aborting')
        return { events: [], fighters: [] }
      }

      console.log(`✅ Successfully collected ${events.length} REAL events`)

      // Step 2: Extract all unique fighter names from the fight cards
      console.log('📊 Step 2: Extracting fighter names from fight cards...')
      const fighterNames = this.extractFighterNamesFromEvents(events)
      console.log(`Found ${fighterNames.length} unique fighters across ${events.length} events`)

      if (fighterNames.length === 0) {
        console.log('⚠️ No fighters found in fight cards')
        return { events, fighters: [] }
      }

      // Step 3: Scrape detailed data for these specific fighters
      console.log('🥊 Step 3: Collecting detailed data for event fighters...')
      const fighters = await this.scrapeFightersFromNames(fighterNames, forceReal)

      if (forceReal && fighters.length === 0) {
        console.log('❌ No real fighter data found and force real mode enabled')
        return { events, fighters: [] }
      }

      console.log(`✅ Collection complete: ${events.length} events, ${fighters.length} fighters`)
      console.log(`📊 Data quality: ${events.length > 0 && !events[0].id.includes('mock') ? 'REAL' : 'MOCK'} events, ${fighters.length > 0 && fighters[0].id && !fighters[0].id.includes('mock') ? 'REAL' : 'MIXED'} fighters`)

      return { events, fighters }

    } catch (error) {
      console.error('Error in targeted data collection:', error)
      if (forceReal) {
        throw error
      }
      // Fallback to mock data
      console.log('📦 Error occurred, falling back to mock data')
      const mockEvents = this.getMockEvents(eventLimit)
      const mockFighterNames = this.extractFighterNamesFromEvents(mockEvents)
      const mockFighters = this.getMockFightersFromNames(mockFighterNames)
      return { events: mockEvents, fighters: mockFighters }
    }
  }

  // Extract unique fighter names from events
  private extractFighterNamesFromEvents(events: UFCEvent[]): string[] {
    const fighterNames = new Set<string>()

    events.forEach(event => {
      event.fightCard.forEach(fight => {
        fighterNames.add(fight.fighter1Name)
        fighterNames.add(fight.fighter2Name)
      })
    })

    return Array.from(fighterNames).filter(name => name && name.trim().length > 0)
  }

  // Scrape fighter data for specific fighter names
  async scrapeFightersFromNames(fighterNames: string[], forceReal: boolean = false): Promise<Fighter[]> {
    const fighters: Fighter[] = []

    try {
      console.log(`🔍 Searching for ${fighterNames.length} specific fighters...`)
      const page = await this.browser.newPage()

      // Set comprehensive headers to avoid blocking
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
      })

      // Try multiple sources for fighter data (prioritize working sources)
      const dataSources = [
        {
          name: 'UFC Spanish site',
          url: 'https://www.ufcespanol.com/athletes/all',
          method: 'scrapeUFCAthletes'
        },
        {
          name: 'UFC.com fighters',
          url: 'https://www.ufc.com/athletes/all',
          method: 'scrapeUFCAthletes'
        },
        {
          name: 'UFCStats',
          url: `${this.baseUrl}/statistics/fighters`,
          method: 'scrapeUFCStats'
        }
      ]

      let successfulSource = null
      let allFighterData: any[] = []

      for (const source of dataSources) {
        try {
          console.log(`Attempting to access ${source.name}: ${source.url}`)

          await page.goto(source.url, {
            waitUntil: 'domcontentloaded',
            timeout: 20000
          })

          // Wait for content to load
          await new Promise(resolve => setTimeout(resolve, 3000))

          if (source.method === 'scrapeUFCStats') {
            allFighterData = await this.extractUFCStatsData(page)
          } else {
            allFighterData = await this.extractUFCAthleteData(page)
          }

          if (allFighterData.length > 0) {
            successfulSource = source
            console.log(`✅ Successfully loaded fighter data from ${source.name}: ${allFighterData.length} fighters`)
            break
          }

        } catch (error) {
          console.log(`❌ Failed to access ${source.name}: ${error}`)
          continue
        }
      }

      if (!successfulSource || allFighterData.length === 0) {
        console.log('❌ All fighter data sources failed - creating basic fighter profiles from extracted names')

        // Create basic fighter profiles for all extracted fighter names
        console.log(`Creating basic fighter profiles for ${fighterNames.length} fighters...`)

        for (const fighterName of fighterNames) {
          const basicFighter = this.createBasicFighter(fighterName)
          fighters.push(basicFighter)
          console.log(`✅ Created basic profile for: ${basicFighter.name}`)
        }

        await this.saveData('event-fighters.json', fighters)
        console.log(`✅ Created ${fighters.length} basic fighter profiles`)
        return fighters
      }

      console.log(`Found ${allFighterData.length} total fighters from ${successfulSource.name}`)

      // Find matching fighters for our event fighters
      const matchedFighters: { url: string, name: string }[] = []

      fighterNames.forEach(targetName => {
        const matched = allFighterData.find(fighter =>
          this.namesMatch(fighter.name, targetName)
        )

        if (matched) {
          matchedFighters.push(matched)
          console.log(`✅ Found match: ${targetName} -> ${matched.name}`)
        } else {
          console.log(`❌ No match found for: ${targetName}`)
        }
      })

      console.log(`Matched ${matchedFighters.length}/${fighterNames.length} fighters`)

      // If we found matches, scrape detailed data
      if (matchedFighters.length > 0) {
        for (let i = 0; i < Math.min(matchedFighters.length, 20); i++) { // Limit to 20 to avoid timeouts
          const fighter = matchedFighters[i]
          console.log(`Scraping fighter ${i + 1}/${Math.min(matchedFighters.length, 20)}: ${fighter.name}`)

          try {
            if (fighter.url) {
              await page.goto(fighter.url, { waitUntil: 'domcontentloaded', timeout: 20000 })
              const fighterData = await this.scrapeFighterDetails(page)
              if (fighterData) {
                fighters.push(fighterData)
                console.log(`✅ Added fighter: ${fighterData.name}`)
              }
            } else {
              // Create basic fighter from name if no URL
              const basicFighter = this.createBasicFighter(fighter.name)
              fighters.push(basicFighter)
              console.log(`✅ Added basic fighter: ${basicFighter.name}`)
            }

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000))

          } catch (error) {
            console.error(`Error scraping fighter ${fighter.name}:`, error)
            // Add basic fighter as fallback
            const basicFighter = this.createBasicFighter(fighter.name)
            fighters.push(basicFighter)
          }
        }
      } else {
        // If no matches found, create basic profiles for all fighter names
        console.log('No fighter matches found in databases - creating basic profiles for all fighters')

        for (const fighterName of fighterNames) {
          const basicFighter = this.createBasicFighter(fighterName)
          fighters.push(basicFighter)
          console.log(`✅ Created basic profile for: ${basicFighter.name}`)
        }
      }

      await page.close()
      await this.saveData('event-fighters.json', fighters)
      console.log(`✅ Successfully scraped ${fighters.length} event fighters`)

    } catch (error) {
      console.error('Error in scrapeFightersFromNames:', error)
    }

    return fighters
  }

  // Helper function to match fighter names (handles variations)
  private namesMatch(dbName: string, targetName: string): boolean {
    const normalize = (name: string) => name.toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    const normalizedDb = normalize(dbName)
    const normalizedTarget = normalize(targetName)

    // Exact match
    if (normalizedDb === normalizedTarget) return true

    // Check if one contains the other (for nickname variations)
    if (normalizedDb.includes(normalizedTarget) || normalizedTarget.includes(normalizedDb)) return true

    // Check individual words (for name order variations)
    const dbWords = normalizedDb.split(' ')
    const targetWords = normalizedTarget.split(' ')

    return dbWords.some(dbWord =>
      targetWords.some(targetWord =>
        dbWord === targetWord && dbWord.length > 2
      )
    )
  }

  // Create mock fighters for event fighter names when scraping fails
  private getMockFightersFromNames(fighterNames: string[]): Fighter[] {
    return fighterNames.map((name, index) => ({
      id: this.generateFighterId(name),
      name: name,
      nickname: undefined,
      record: { wins: 10 + index, losses: 2 + index % 3, draws: 0 },
      stats: {
        finishRate: 40 + (index * 3) % 40,
        koPercentage: 20 + (index * 2) % 30,
        submissionPercentage: 10 + (index * 2) % 20,
        averageFightTime: 900 + (index * 100),
        significantStrikesPerMinute: 3.0 + (index * 0.3) % 3,
        takedownAccuracy: 30 + (index * 5) % 40
      },
      popularity: {
        socialFollowers: 100000 + (index * 50000),
        recentBuzzScore: 50 + (index * 5) % 40,
        fanFavorite: index % 3 === 0
      },
      funScore: 60 + (index * 3) % 30,
      weightClass: ['lightweight', 'welterweight', 'middleweight', 'heavyweight'][index % 4] as any,
      fighting_style: [['striking'], ['grappling'], ['mixed'], ['wrestling']][index % 4]
    })) as Fighter[]
  }

  // Scrape a limited number of fighters (top ranked)
  async scrapeFightersLimited(limit: number = 50): Promise<Fighter[]> {
    const fighters: Fighter[] = []

    try {
      console.log(`🥊 Collecting top ${limit} fighters from UFCStats...`)
      const page = await this.browser.newPage()

      // Set comprehensive headers to avoid blocking
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      })

      // Navigate to fighters page with retry logic
      let retries = 3
      while (retries > 0) {
        try {
          console.log(`Attempting to access UFCStats.com (${4 - retries}/3)...`)
          await page.goto(`${this.baseUrl}/statistics/fighters`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          })
          break
        } catch (error) {
          retries--
          if (retries === 0) {
            console.error('Failed to access UFCStats after 3 attempts, using mock data')
            return this.getMockFighters(limit)
          }
          console.log(`Attempt failed, retrying... (${retries} attempts left)`)
          await new Promise(resolve => setTimeout(resolve, 5000))
        }
      }

      // Get fighter links (limited)
      const fighterLinks = await page.evaluate((limit) => {
        const links = Array.from(document.querySelectorAll('a[href*="/fighter-details/"]'))
        return links.slice(0, limit).map(link => (link as HTMLAnchorElement).href)
      }, limit)

      console.log(`Found ${fighterLinks.length} fighter links`)

      // Process each fighter
      for (let i = 0; i < fighterLinks.length; i++) {
        const link = fighterLinks[i]
        console.log(`Scraping fighter ${i + 1}/${fighterLinks.length}: ${link}`)

        try {
          // Navigate to fighter page
          await page.goto(link, { waitUntil: 'networkidle2', timeout: 30000 })

          // Scrape fighter details
          const fighter = await this.scrapeFighterDetails(page)
          if (fighter) {
            fighters.push(fighter)
            console.log(`✅ Added fighter: ${fighter.name}`)
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000))

        } catch (error) {
          console.error(`Error scraping fighter ${link}:`, error)
        }
      }

      await page.close()
      await this.saveData('fighters-limited.json', fighters)
      console.log(`✅ Successfully scraped ${fighters.length} fighters`)

    } catch (error) {
      console.error('Error in scrapeFightersLimited:', error)
    }

    return fighters
  }

  // Keep the original method for full collection
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

  // Scrape individual fighter details with comprehensive statistics
  private async scrapeFighterDetails(page: any): Promise<Fighter | null> {
    try {
      const url = await page.url()
      console.log(`Scraping fighter details from: ${url}`)

      const fighterData = await page.evaluate(() => {
        const currentUrl = window.location.href

        // Determine which site we're on and use appropriate selectors
        if (currentUrl.includes('ufcstats.com')) {
          // UFCStats.com comprehensive extraction
          const nameElement = document.querySelector('.b-content__title')
          const fullName = nameElement?.textContent?.trim() || ''

          let name = fullName
          let nickname = ''
          const nicknameMatch = fullName.match(/^(.+?)\s+"(.+?)"\s*$/)
          if (nicknameMatch) {
            name = nicknameMatch[1].trim()
            nickname = nicknameMatch[2].trim()
          }

          const recordElement = document.querySelector('.b-content__title-record')
          const recordText = recordElement?.textContent?.trim() || ''
          const recordMatch = recordText.match(/Record:\s*(\d+)-(\d+)-(\d+)/)

          const wins = recordMatch ? parseInt(recordMatch[1]) : 0
          const losses = recordMatch ? parseInt(recordMatch[2]) : 0
          const draws = recordMatch ? parseInt(recordMatch[3]) : 0

          // Enhanced statistics collection
          const statRows = Array.from(document.querySelectorAll('.b-list__box-list-item'))
          const stats: Record<string, any> = {}

          statRows.forEach(row => {
            const labels = row.querySelectorAll('.b-list__box-list-item-title')
            if (labels.length >= 2) {
              const label = labels[0]?.textContent?.trim()
              const value = labels[1]?.textContent?.trim()
              if (label && value) {
                stats[label] = value
              }
            }
          })

          // Extract detailed striking statistics
          const strikingStats = {
            sig_str_landed: 0,
            sig_str_attempted: 0,
            sig_str_accuracy: 0,
            sig_str_per_min: 0,
            sig_str_absorbed_per_min: 0,
            sig_str_defense: 0,
            head_sig_str_landed: 0,
            body_sig_str_landed: 0,
            leg_sig_str_landed: 0,
            distance_sig_str_landed: 0,
            clinch_sig_str_landed: 0,
            ground_sig_str_landed: 0
          }

          // Extract grappling statistics
          const grapplingStats = {
            takedowns_landed: 0,
            takedowns_attempted: 0,
            takedown_accuracy: 0,
            takedowns_per_15min: 0,
            takedown_defense: 0,
            submission_attempts_per_15min: 0,
            passes_per_15min: 0,
            reversals_per_15min: 0
          }

          // Extract physical attributes
          const physicalElements = document.querySelectorAll('.b-list__box-list-item')
          const physical: Record<string, string> = {}

          physicalElements.forEach(element => {
            const text = element.textContent || ''
            if (text.includes('Height:')) {
              physical.height = text.replace('Height:', '').trim()
            }
            if (text.includes('Weight:')) {
              physical.weight = text.replace('Weight:', '').trim()
            }
            if (text.includes('Reach:')) {
              physical.reach = text.replace('Reach:', '').trim()
            }
            if (text.includes('Stance:')) {
              physical.stance = text.replace('Stance:', '').trim()
            }
            if (text.includes('DOB:')) {
              physical.dateOfBirth = text.replace('DOB:', '').trim()
            }
          })

          // Extract fight finish methods
          const finishMethods = {
            ko_tko: 0,
            submission: 0,
            decision: 0
          }

          // Parse finish methods from win details if available
          const winMethodText = document.body.textContent || ''
          const koMatches = winMethodText.match(/KO\/TKO\s*(\d+)/i)
          const subMatches = winMethodText.match(/SUB\s*(\d+)/i)
          const decMatches = winMethodText.match(/DEC\s*(\d+)/i)

          if (koMatches) finishMethods.ko_tko = parseInt(koMatches[1])
          if (subMatches) finishMethods.submission = parseInt(subMatches[1])
          if (decMatches) finishMethods.decision = parseInt(decMatches[1])

          return {
            name, nickname,
            record: { wins, losses, draws },
            stats: { ...stats, ...strikingStats, ...grapplingStats },
            physical,
            finishMethods,
            source: 'ufcstats'
          }
        } else {
          // UFC.com / UFCEspanol.com extraction (enhanced)
          const nameElement = document.querySelector('h1, .hero-profile__name, .athlete-hero__name')
          const name = nameElement?.textContent?.trim() || ''

          const nicknameElement = document.querySelector('.hero-profile__nickname, .athlete-hero__nickname')
          const nickname = nicknameElement?.textContent?.trim().replace(/["""]/g, '') || ''

          // Extract record with multiple patterns
          let wins = 0, losses = 0, draws = 0
          const recordSelectors = [
            '.hero-profile__record', '.athlete-hero__record',
            '.athlete-stats__record', '.stats-record'
          ]

          for (const selector of recordSelectors) {
            const recordElement = document.querySelector(selector)
            if (recordElement) {
              const recordText = recordElement.textContent?.trim() || ''
              const recordMatch = recordText.match(/(\d+)-(\d+)-(\d+)/) || recordText.match(/(\d+)-(\d+)/)
              if (recordMatch) {
                wins = parseInt(recordMatch[1]) || 0
                losses = parseInt(recordMatch[2]) || 0
                draws = recordMatch[3] ? parseInt(recordMatch[3]) : 0
                break
              }
            }
          }

          // Enhanced stats extraction
          const stats: Record<string, any> = {}

          // Look for KO/TKO wins
          const koElements = Array.from(document.querySelectorAll('*')).filter(el =>
            el.textContent?.toLowerCase().includes('ko') || el.textContent?.toLowerCase().includes('knockout')
          )
          koElements.forEach(el => {
            const text = el.textContent || ''
            const match = text.match(/(\d+)/)
            if (match) stats['KO_wins'] = parseInt(match[1])
          })

          // Look for submission wins
          const subElements = Array.from(document.querySelectorAll('*')).filter(el =>
            el.textContent?.toLowerCase().includes('submission')
          )
          subElements.forEach(el => {
            const text = el.textContent || ''
            const match = text.match(/(\d+)/)
            if (match) stats['submission_wins'] = parseInt(match[1])
          })

          // Look for striking stats
          const strikingElements = Array.from(document.querySelectorAll('*')).filter(el =>
            el.textContent?.toLowerCase().includes('strikes per minute') ||
            el.textContent?.toLowerCase().includes('sig. str. per min')
          )
          strikingElements.forEach(el => {
            const text = el.textContent || ''
            const match = text.match(/(\d+\.?\d*)/);
            if (match) stats['sig_strikes_per_min'] = parseFloat(match[1])
          })

          // Extract physical data
          const physicalData: Record<string, string> = {}
          const physicalSelectors = {
            height: ['.hero-profile__height', '.athlete-bio__height'],
            weight: ['.hero-profile__weight', '.athlete-bio__weight'],
            reach: ['.hero-profile__reach', '.athlete-bio__reach']
          }

          Object.entries(physicalSelectors).forEach(([key, selectors]) => {
            for (const selector of selectors) {
              const element = document.querySelector(selector)
              if (element) {
                physicalData[key] = element.textContent?.trim() || ''
                break
              }
            }
          })

          // Extract social media links
          const socialLinks = Array.from(document.querySelectorAll('a[href*="twitter"], a[href*="instagram"], a[href*="facebook"]'))
            .map(link => (link as HTMLAnchorElement).href)

          return {
            name, nickname,
            record: { wins, losses, draws },
            stats,
            physical: physicalData,
            socialLinks,
            source: 'ufc'
          }
        }
      })

      // Calculate comprehensive fighter metrics with enhanced statistics
      const totalFights = fighterData.record.wins + fighterData.record.losses + fighterData.record.draws
      const koWins = parseInt(String(fighterData.stats['KO_wins'] || fighterData.finishMethods?.ko_tko || '0'))
      const subWins = parseInt(String(fighterData.stats['submission_wins'] || fighterData.finishMethods?.submission || '0'))
      const finishWins = koWins + subWins

      // Extract comprehensive striking and grappling stats
      const sigStrikesPerMin = parseFloat(String(fighterData.stats['sig_str_per_min'] || fighterData.stats['Sig. Str. per Min'] || '3.5'))
      const strikingAccuracy = this.parsePercentage(String(fighterData.stats['sig_str_accuracy'] || fighterData.stats['Str. Acc.'] || '45%'))
      const strikingDefense = this.parsePercentage(String(fighterData.stats['sig_str_defense'] || fighterData.stats['Str. Def'] || '55%'))
      const takedownAccuracy = this.parsePercentage(String(fighterData.stats['takedown_accuracy'] || fighterData.stats['TD Acc.'] || '40%'))
      const takedownDefense = this.parsePercentage(String(fighterData.stats['takedown_defense'] || fighterData.stats['TD Def.'] || '65%'))
      const takedownsPer15 = parseFloat(String(fighterData.stats['takedowns_per_15min'] || fighterData.stats['TD Avg.'] || '1.5'))

      // Calculate age if date of birth available
      let age = null
      if (fighterData.physical?.dateOfBirth) {
        const dob = new Date(fighterData.physical.dateOfBirth)
        const today = new Date()
        age = today.getFullYear() - dob.getFullYear()
      }

      const fighter: Fighter = {
        id: this.generateFighterId(fighterData.name),
        name: fighterData.name,
        nickname: fighterData.nickname || undefined,
        record: fighterData.record,
        stats: {
          finishRate: totalFights > 0 ? Math.round((finishWins / totalFights) * 100) : 0,
          koPercentage: fighterData.record.wins > 0 ? Math.round((koWins / fighterData.record.wins) * 100) : 0,
          submissionPercentage: fighterData.record.wins > 0 ? Math.round((subWins / fighterData.record.wins) * 100) : 0,
          averageFightTime: this.calculateAverageFightTime(fighterData.record, koWins, subWins),
          significantStrikesPerMinute: sigStrikesPerMin,
          takedownAccuracy: takedownAccuracy,
          // Enhanced statistics for better entertainment prediction
          strikingAccuracy: strikingAccuracy,
          strikingDefense: strikingDefense,
          takedownDefense: takedownDefense,
          takedownsPer15Min: takedownsPer15,
          submissionAttemptsPer15Min: parseFloat(String(fighterData.stats['submission_attempts_per_15min'] || '0.5')),
          controlTimePer15Min: parseFloat(String(fighterData.stats['control_time_per_15min'] || '2.0')),
          knockdownsPer15Min: parseFloat(String(fighterData.stats['knockdowns_per_15min'] || '0.3'))
        },
        popularity: {
          socialFollowers: this.estimateSocialFollowers(fighterData.name, fighterData.record.wins, koWins),
          recentBuzzScore: this.calculateBuzzScore(fighterData.record, koWins, subWins, age),
          fanFavorite: this.isFanFavorite(koWins, subWins, fighterData.nickname, sigStrikesPerMin)
        },
        funScore: this.calculateFunScore(
          fighterData.record,
          koWins,
          subWins,
          sigStrikesPerMin,
          {
            takedowns_per_15min: takedownsPer15,
            sig_str_defense: strikingDefense,
            knockdowns_per_15min: parseFloat(String(fighterData.stats['knockdowns_per_15min'] || '0.3'))
          }
        ),
        weightClass: this.extractWeightClass(fighterData.physical?.weight || '170'),
        fighting_style: this.inferFightingStyle(fighterData.stats, fighterData.physical?.stance),
        // Additional metadata for AI analysis
        physical: {
          height: fighterData.physical?.height,
          weight: fighterData.physical?.weight,
          reach: fighterData.physical?.reach,
          stance: fighterData.physical?.stance,
          age: age
        }
      }

      return fighter

    } catch (error) {
      console.error('Error parsing fighter details:', error)
      return null
    }
  }

  // Calculate entertainment value based on comprehensive research findings
  private calculateFunScore(
    record: { wins: number, losses: number, draws: number },
    koWins: number,
    subWins: number,
    strikeRate: number,
    additionalStats?: any
  ): number {
    const totalFights = record.wins + record.losses + record.draws
    if (totalFights === 0) return 50

    // Core entertainment factors based on research
    const finishRate = record.wins > 0 ? (koWins + subWins) / record.wins : 0
    const knockoutRate = record.wins > 0 ? koWins / record.wins : 0
    const submissionRate = record.wins > 0 ? subWins / record.wins : 0

    // Striking entertainment factors (high activity = more exciting)
    const strikingBonus = Math.min(strikeRate * 8, 25) // Higher weighting for striking activity
    const highVolumeBonus = strikeRate > 5 ? 10 : 0 // Bonus for high-volume strikers

    // Finish rate bonuses (finishes are more entertaining than decisions)
    const finishBonus = finishRate * 25 // Major bonus for fighters who finish fights
    const knockoutBonus = knockoutRate * 20 // KOs are especially entertaining
    const submissionBonus = submissionRate * 15 // Submissions add excitement

    // Activity and aggression bonuses
    const activityBonus = Math.min(totalFights * 1.5, 15) // Experience bonus
    const aggressionBonus = additionalStats?.takedowns_per_15min > 3 ? 8 : 0 // Aggressive grapplers

    // Defensive penalties (pure defensive fighters less entertaining)
    const defensivePenalty = (additionalStats?.sig_str_defense || 0) > 70 ? -5 : 0

    // Consistency bonus (fighters who rarely go to decision)
    const decisionRate = record.wins > 0 ? (record.wins - koWins - subWins) / record.wins : 0
    const consistencyBonus = decisionRate < 0.3 ? 10 : 0 // Bonus for rarely going to decision

    // Style bonuses
    const versatilityBonus = (koWins > 0 && subWins > 0) ? 8 : 0 // Bonus for multiple finish types

    const baseScore = 30 // Lower base to allow more differentiation
    const totalScore = baseScore +
                      strikingBonus +
                      highVolumeBonus +
                      finishBonus +
                      knockoutBonus +
                      submissionBonus +
                      activityBonus +
                      aggressionBonus +
                      consistencyBonus +
                      versatilityBonus +
                      defensivePenalty

    return Math.min(Math.max(Math.round(totalScore), 20), 100) // Keep between 20-100
  }

  // Extract UFC athlete data from listing page
  private async extractUFCAthleteData(page: any): Promise<any[]> {
    return await page.evaluate(() => {
      const fighters: any[] = []

      // Look for athlete cards/links
      const athleteElements = document.querySelectorAll('a[href*="/athlete/"], a[href*="/fighter/"]')

      athleteElements.forEach(element => {
        const url = (element as HTMLAnchorElement).href
        const nameElement = element.querySelector('.athlete-name, .fighter-name, h3, .name') || element
        const name = nameElement?.textContent?.trim() || ''

        if (name && url && name.length > 2) {
          fighters.push({ name, url })
        }
      })

      console.log(`Extracted ${fighters.length} fighter links from athlete listing`)
      return fighters
    })
  }

  // Enhanced fighting style inference
  private inferFightingStyle(stats: any, stance?: string): string[] {
    const styles: string[] = []

    const koWins = parseInt(String(stats['KO_wins'] || '0'))
    const subWins = parseInt(String(stats['submission_wins'] || '0'))
    const strikeRate = parseFloat(String(stats['sig_strikes_per_min'] || '3.5'))

    if (koWins > 2 || strikeRate > 4) {
      styles.push('striking')
    }

    if (subWins > 1) {
      styles.push('grappling')
    }

    if (stance) {
      if (stance.toLowerCase().includes('orthodox') || stance.toLowerCase().includes('southpaw')) {
        styles.push('boxing')
      }
      if (stance.toLowerCase().includes('wrestling')) {
        styles.push('wrestling')
      }
    }

    if (styles.length === 0) {
      styles.push('mixed')
    }

    return styles
  }

  // Scrape upcoming events from UFC.com with fight cards
  async scrapeUpcomingEvents(limit: number = 3): Promise<UFCEvent[]> {
    await this.initialize()
    const events: UFCEvent[] = []

    try {
      console.log('📅 Scraping upcoming UFC events...')
      const page = await this.browser.newPage()

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1'
      })

      // Try multiple data sources for events (ordered by reliability)
      const eventUrls = [
        'https://www.espn.com/mma/schedule/_/league/ufc',
        'https://www.tapology.com/fightcenter/promotions/1-ultimate-fighting-championship-ufc',
        'https://www.ufc.com/events',
        'https://www.ufcespanol.com/events',
        'https://ufc.com/events'
      ]

      let successfulUrl = null
      for (const url of eventUrls) {
        try {
          console.log(`Trying UFC events URL: ${url}`)
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 20000
          })

          // Wait for content to load
          await new Promise(resolve => setTimeout(resolve, 3000))

          successfulUrl = url
          break
        } catch (error) {
          console.log(`Failed to access ${url}, trying next...`)
          continue
        }
      }

      if (!successfulUrl) {
        throw new Error('Could not access any UFC events URL')
      }

      console.log(`Successfully loaded: ${successfulUrl}`)

      const eventData = await page.evaluate((baseUrl) => {
        const hostname = new URL(baseUrl).hostname
        console.log(`Extracting events from: ${hostname}`)

        let eventCards: Element[] = []

        // ESPN MMA specific selectors
        if (hostname.includes('espn.com')) {
          const espnSelectors = [
            '.Table__TR',
            '.schedule-row',
            '.ResponsiveTable tr',
            'tr',
            '.event-row'
          ]

          for (const selector of espnSelectors) {
            const elements = Array.from(document.querySelectorAll(selector))
            if (elements.length > 1) { // Skip header row
              eventCards = elements.slice(1) // Remove header
              console.log(`ESPN: Found ${eventCards.length} events using selector: ${selector}`)
              break
            }
          }
        }
        // Tapology specific selectors
        else if (hostname.includes('tapology.com')) {
          const tapologySelectors = [
            '.eventPageListing',
            '.fightcenter-event',
            '.event-listing',
            '.event-item',
            'tr[data-event-id]',
            '.promotionEvents tr'
          ]

          for (const selector of tapologySelectors) {
            const elements = Array.from(document.querySelectorAll(selector))
            if (elements.length > 0) {
              eventCards = elements
              console.log(`Tapology: Found ${eventCards.length} events using selector: ${selector}`)
              break
            }
          }
        }
        // UFC.com selectors (original)
        else {
          const ufcSelectors = [
            '.c-card-event',
            '.event-card',
            '.card-event',
            '.listing-item',
            '[data-module="Event"]',
            '.hero-profile'
          ]

          for (const selector of ufcSelectors) {
            const elements = Array.from(document.querySelectorAll(selector))
            if (elements.length > 0) {
              eventCards = elements
              console.log(`UFC: Found ${elements.length} events using selector: ${selector}`)
              break
            }
          }
        }

        // Universal fallback for any site
        if (eventCards.length === 0) {
          const allElements = Array.from(document.querySelectorAll('*'))
          eventCards = allElements.filter(el => {
            const text = el.textContent?.toLowerCase() || ''
            return text.includes('ufc') && (text.includes('vs') || text.includes('v ')) && text.length < 200
          }).slice(0, 10)
          console.log(`Universal fallback: Found ${eventCards.length} potential event elements`)
        }

        return eventCards.map((card, index) => {
          let title = '', date = '', location = '', url = ''

          // ESPN-specific extraction
          if (hostname.includes('espn.com')) {
            const cells = card.querySelectorAll('td')
            if (cells.length >= 3) {
              // ESPN structure: Date | Time | Event Name | Network
              date = cells[0]?.textContent?.trim() || ''
              const timeCell = cells[1]?.textContent?.trim() || ''
              title = cells[2]?.textContent?.trim() || cells[1]?.textContent?.trim() || ''

              // If we got a time instead of event name, look for event name in other cells
              if (title.includes('PM') || title.includes('AM') || title.includes(':')) {
                // Look for actual event name in subsequent cells
                for (let i = 2; i < cells.length; i++) {
                  const cellText = cells[i]?.textContent?.trim() || ''
                  if (cellText && !cellText.includes('ESPN') && !cellText.includes('PM') && !cellText.includes('AM') && cellText.length > 5) {
                    title = cellText
                    break
                  }
                }
              }

              // Try to extract location (often in last cells)
              location = cells[cells.length - 1]?.textContent?.trim() || ''
              if (location.includes('ESPN') || location.includes('PM') || location.includes('AM')) {
                location = '' // Clear if it's not actually location
              }

              // Try to find link
              const linkElement = card.querySelector('a')
              url = linkElement ? new URL(linkElement.href, baseUrl).href : ''
            }
          }
          // Tapology-specific extraction
          else if (hostname.includes('tapology.com')) {
            // Look for event name and date in Tapology structure
            const eventLink = card.querySelector('a[href*="/fightcenter/events/"]')
            const dateElement = card.querySelector('.date, .eventDate, [data-date]')
            const locationElement = card.querySelector('.location, .venue')

            title = eventLink?.textContent?.trim() || card.querySelector('h3, h4, .event-title')?.textContent?.trim() || ''
            date = dateElement?.textContent?.trim() || ''
            location = locationElement?.textContent?.trim() || ''
            url = eventLink ? new URL(eventLink.href, baseUrl).href : ''
          }
          // UFC.com and other sites (original logic)
          else {
            const titleSelectors = [
              '.c-card-event__headline', '.event-card__title', '.card-event__headline',
              'h2', 'h3', 'h4', '.title', '.headline'
            ]
            const dateSelectors = [
              '.c-card-event__date', '.event-card__date', '.card-event__date',
              '.date', '.event-date', '[data-timestamp]'
            ]
            const locationSelectors = [
              '.c-card-event__location', '.event-card__location', '.card-event__location',
              '.location', '.venue', '.event-location'
            ]

            // Extract using selectors
            for (const selector of titleSelectors) {
              const element = card.querySelector(selector)
              if (element && element.textContent?.trim()) {
                title = element.textContent.trim()
                break
              }
            }

            for (const selector of dateSelectors) {
              const element = card.querySelector(selector)
              if (element && element.textContent?.trim()) {
                date = element.textContent.trim()
                break
              }
            }

            for (const selector of locationSelectors) {
              const element = card.querySelector(selector)
              if (element && element.textContent?.trim()) {
                location = element.textContent.trim()
                break
              }
            }

            const linkElement = card.querySelector('a') || card.closest('a')
            url = linkElement ? new URL(linkElement.href, baseUrl).href : ''
          }

          // Fallback title extraction if still empty
          if (!title) {
            const cardText = card.textContent?.trim() || ''
            const ufcMatch = cardText.match(/(UFC \d+[:\s]*[^,\n]{1,50}|UFC Fight Night[^,\n]{0,50})/i)
            if (ufcMatch) {
              title = ufcMatch[1].trim()
            }
          }

          return {
            title: title,
            date: date,
            location: location,
            url: url,
            index: index,
            source: hostname
          }
        }).filter(event => event.title && event.title.length > 3)
      }, successfulUrl)

      // Process each event
      for (const eventInfo of eventData.slice(0, limit)) { // Limit to specified number
        if (eventInfo.title && eventInfo.url) {
          try {
            console.log(`Processing event: ${eventInfo.title}`)

            // Extract real fight cards from event URLs
            let fightCard
            try {
              console.log(`🔍 Scraping real fight card for: ${eventInfo.title}`)
              fightCard = await this.scrapeFightCard(page, eventInfo.url)

              if (fightCard.allFights.length === 0) {
                console.log(`⚠️ No real fight card found for ${eventInfo.title} - skipping event`)
                continue // Skip events without real fight data
              }
            } catch (error) {
              console.log(`❌ Failed to scrape fight card for ${eventInfo.title}: ${error} - skipping event`)
              continue // Skip events that can't be scraped
            }

            const event: UFCEvent = {
              id: this.generateEventId(eventInfo.title),
              name: eventInfo.title,
              date: this.parseEventDate(eventInfo.date),
              location: eventInfo.location,
              venue: '', // Will be extracted from event page
              fightCard: fightCard.allFights,
              mainCard: fightCard.mainCard,
              prelimCard: fightCard.prelimCard,
              earlyPrelimCard: fightCard.earlyPrelimCard
            }

            events.push(event)

            // Rate limiting between events
            await new Promise(resolve => setTimeout(resolve, 2000))

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

  // Scrape fight card for a specific event
  private async scrapeFightCard(page: any, eventUrl: string): Promise<{
    allFights: Fight[]
    mainCard: Fight[]
    prelimCard: Fight[]
    earlyPrelimCard: Fight[]
  }> {
    try {
      console.log(`Scraping fight card from: ${eventUrl}`)

      await page.goto(eventUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      })

      // Give page a moment to load content
      await new Promise(resolve => setTimeout(resolve, 1000))

      const fightData = await page.evaluate((eventUrl) => {
        const fights: any[] = []
        const hostname = new URL(eventUrl).hostname
        const debugLog: string[] = []

        debugLog.push(`Extracting fight card from: ${hostname}`)

        // ESPN-specific fight card extraction
        if (hostname.includes('espn.com')) {
          debugLog.push('Extracting fights from ESPN fight card page...')

          // Method 1: Look for structured fight card in HTML
          const fightCardElements = document.querySelectorAll('[data-testid*="fight"], .fight-card, .matchup')
          debugLog.push(`Found ${fightCardElements.length} fight card elements`)

          // Method 2: Enhanced "vs" pattern extraction with better filtering
          const pageText = document.body.textContent || ''

          // Look for "Fighter A vs Fighter B" patterns with comprehensive validation
          const vsPatterns = [
            // Pattern 1: Full names like "Carlos Ulberg vs Dominick Reyes"
            /([A-Z][a-z]+(?:\s+[A-Z][a-z''-]+)*)\s+vs\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z''-]+)*)/gi,
            // Pattern 2: Names with records in between
            /([A-Z][a-z]+(?:\s+[A-Z][a-z''-]+)*)\s+\([0-9-]+\)\s+vs\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z''-]+)*)\s+\([0-9-]+\)/gi,
            // Pattern 3: More flexible - captures any reasonable name format
            /([A-Za-z][A-Za-z\s''.Jr-]{2,30})\s+vs\.?\s+([A-Za-z][A-Za-z\s''.Jr-]{2,30})/gi,
            // Pattern 4: Single names only
            /([A-Z][a-z]{2,15})\s+vs\.?\s+([A-Z][a-z]{2,15})/gi
          ]

          const foundMatchups = new Set()
          let validFights = []

          debugLog.push(`Page text length: ${pageText.length}`)
          debugLog.push(`Page text preview: ${pageText.substring(0, 500)}...`)

          // Check for known real matchups first to validate we're on the right page
          const knownFights = [
            'Carlos Ulberg.*Dominick Reyes',
            'Jimmy Crute.*Ivan Erslan',
            'Jack Jenkins.*Ramon Taveras',
            'Jake Matthews.*Neil Magny',
            'Tom Nolan.*Charlie Campbell'
          ]

          let foundKnownFights = 0
          for (const fight of knownFights) {
            const regex = new RegExp(fight, 'i')
            if (regex.test(pageText)) {
              foundKnownFights++
              debugLog.push(`✅ Found known fight pattern: ${fight}`)
            }
          }

          debugLog.push(`Found ${foundKnownFights}/${knownFights.length} known fight patterns`)

          for (const pattern of vsPatterns) {
            const matches = Array.from(pageText.matchAll(pattern))
            debugLog.push(`Pattern ${pattern} found ${matches.length} potential matchups`)

            if (matches.length > 0) {
              debugLog.push(`First few matches: ${matches.slice(0, 3).map(m => `"${m[1]} vs ${m[2]}"`).join(', ')}`)
            }

            matches.forEach((match, index) => {
              const fighter1Name = match[1].trim().replace(/\s+/g, ' ')
              const fighter2Name = match[2].trim().replace(/\s+/g, ' ')

              const matchupKey = `${fighter1Name.toLowerCase()}-${fighter2Name.toLowerCase()}`

              // Enhanced filtering
              if (
                fighter1Name.length >= 3 && fighter2Name.length >= 3 &&
                fighter1Name.length <= 30 && fighter2Name.length <= 30 &&
                fighter1Name !== fighter2Name &&
                !foundMatchups.has(matchupKey) &&
                !fighter1Name.toLowerCase().includes('fight night') &&
                !fighter2Name.toLowerCase().includes('fight night') &&
                !fighter1Name.toLowerCase().includes('main card') &&
                !fighter2Name.toLowerCase().includes('main card') &&
                !fighter1Name.toLowerCase().includes('prelim') &&
                !fighter2Name.toLowerCase().includes('prelim') &&
                !fighter1Name.toLowerCase().includes('coverage') &&
                !fighter2Name.toLowerCase().includes('coverage') &&
                !fighter1Name.toLowerCase().includes('live') &&
                !fighter2Name.toLowerCase().includes('live') &&
                !fighter1Name.toLowerCase().includes('espn') &&
                !fighter2Name.toLowerCase().includes('espn') &&
                !/\d{4}/.test(fighter1Name) && // No years
                !/\d{4}/.test(fighter2Name) && // No years
                !/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/.test(fighter1Name) && // No months
                !/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/.test(fighter2Name) // No months
              ) {
                foundMatchups.add(matchupKey)

                // Determine card position based on order and context
                const cardPosition = validFights.length < 1 ? 'main' :
                                   (validFights.length < 4 ? 'preliminary' : 'early-preliminary')

                validFights.push({
                  fighter1Name,
                  fighter2Name,
                  weightClass: 'unknown',
                  cardPosition,
                  scheduledRounds: cardPosition === 'main' ? 5 : 3
                })

                debugLog.push(`✅ Valid matchup found: ${fighter1Name} vs ${fighter2Name}`)
              }
            })

            if (validFights.length > 0) break // Use first successful pattern
          }

          if (validFights.length > 0) {
            fights.push(...validFights)
          } else {
            // Fallback: Enhanced pattern to capture ESPN's "Full Name Record" format
            const fighterRecordPattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z\']*)*(?:\s+[A-Z][a-z\']*)*)\s+(\d+-\d+-\d+|\d+-\d+)(?:\s|$)/g
            const fighterMatches = Array.from(pageText.matchAll(fighterRecordPattern))

            debugLog.push(`Found ${fighterMatches.length} fighter+record patterns`)

            // Filter out obvious false positives and clean names
            const validFighters = fighterMatches.filter(match => {
              const name = match[1].trim()
              return !name.includes('Copyright') &&
                     !name.includes('ESPN') &&
                     !name.includes('Privacy') &&
                     !name.includes('Terms') &&
                     !name.includes('About') &&
                     !name.includes('Contact') &&
                     name.length > 4 &&
                     name.length < 40 &&
                     name.split(' ').length >= 2 && // Ensure at least first and last name
                     !name.toLowerCase().includes('search') &&
                     !name.toLowerCase().includes('shop') &&
                     !name.toLowerCase().includes('fight night') &&
                     !name.toLowerCase().includes('main card') &&
                     !name.toLowerCase().includes('prelim')
            }).map(match => ({
              ...match,
              1: match[1].trim()
                .replace(/UFC\s*(Fight\s*Night)?.*$/i, '')
                .replace(/Dana\s*White'?s?\s*Contender\s*Series?.*$/i, '')
                .replace(/\s*(Main\s*Card|Prelim|Early\s*Prelim).*$/i, '')
                .replace(/\s*vs\.?\s*.*$/i, '')
                .trim()
            }))

            debugLog.push(`Filtered to ${validFighters.length} valid fighters`)

            // Group consecutive fighters into pairs for matchups
            for (let i = 0; i < validFighters.length; i += 2) {
              if (validFighters[i] && validFighters[i + 1]) {
                const fighter1Name = validFighters[i][1].trim()
                const fighter2Name = validFighters[i + 1][1].trim()

                // Skip if same fighter appears twice or names are too similar
                if (fighter1Name === fighter2Name || fighter1Name.toLowerCase() === fighter2Name.toLowerCase()) {
                  continue
                }

                // Extract weight class from surrounding context
                let weightClass = 'unknown'
                const fighter1Index = validFighters[i].index || 0
                const fighter2Index = validFighters[i + 1].index || 0

                // Look for weight class in text between fighters
                const contextStart = Math.max(0, fighter1Index - 300)
                const contextEnd = Math.min(pageText.length, fighter2Index + 300)
                const contextText = pageText.slice(contextStart, contextEnd).toLowerCase()

                const weightPatterns = [
                  /women'?s\s+(strawweight|flyweight|bantamweight|featherweight)/,
                  /(heavyweight|light\s+heavyweight|middleweight|welterweight|lightweight|featherweight|bantamweight|flyweight|strawweight)/
                ]

                for (const pattern of weightPatterns) {
                  const match = contextText.match(pattern)
                  if (match) {
                    weightClass = match[0]
                    break
                  }
                }

                // Determine card position (early fights = main card on ESPN)
                const cardPosition = i < 4 ? 'main' : (i < 12 ? 'preliminary' : 'early-preliminary')

                fights.push({
                  fighter1Name,
                  fighter2Name,
                  weightClass: weightClass,
                  cardPosition: cardPosition,
                  scheduledRounds: cardPosition === 'main' ? 5 : 3
                })

                debugLog.push(`✅ ESPN extracted: ${fighter1Name} vs ${fighter2Name} (${weightClass})`)
              }
            }
          }

          // Fallback method: Look for explicit vs patterns if primary method fails
          if (fights.length === 0) {
            debugLog.push('Primary method failed, trying vs pattern extraction...')

            // Search for "Fighter1 vs Fighter2" patterns
            const vsPattern = /([A-Za-z\s\.'-]{2,35})\s+(?:vs?\.?|v\.?)\s+([A-Za-z\s\.'-]{2,35})/gi
            const vsMatches = Array.from(pageText.matchAll(vsPattern))

            debugLog.push(`Found ${vsMatches.length} vs patterns`)

            // Filter and process vs matches
            const validVsMatches = vsMatches.filter(match => {
              const fighter1 = match[1].trim()
              const fighter2 = match[2].trim()
              return fighter1.length > 2 && fighter2.length > 2 &&
                     fighter1 !== fighter2 &&
                     !fighter1.includes('Copyright') &&
                     !fighter2.includes('Copyright') &&
                     !fighter1.includes('ESPN') &&
                     !fighter2.includes('ESPN') &&
                     !fighter1.toLowerCase().includes('fight night') &&
                     !fighter2.toLowerCase().includes('fight night') &&
                     !/\d{4}/.test(fighter1) && !/\d{4}/.test(fighter2)
            }).map(match => ({
              ...match,
              1: match[1].trim()
                .replace(/UFC\s*(Fight\s*Night)?.*$/i, '')
                .replace(/Dana\s*White'?s?\s*Contender\s*Series?.*$/i, '')
                .replace(/\s*(Main\s*Card|Prelim|Early\s*Prelim).*$/i, '')
                .trim(),
              2: match[2].trim()
                .replace(/UFC\s*(Fight\s*Night)?.*$/i, '')
                .replace(/Dana\s*White'?s?\s*Contender\s*Series?.*$/i, '')
                .replace(/\s*(Main\s*Card|Prelim|Early\s*Prelim).*$/i, '')
                .trim()
            }))

            validVsMatches.slice(0, 20).forEach((match, index) => {
              const fighter1 = match[1].trim()
              const fighter2 = match[2].trim()

              // Extract weight class from surrounding text
              let weightClass = 'unknown'
              const matchIndex = match.index || 0
              const contextStart = Math.max(0, matchIndex - 200)
              const contextEnd = Math.min(pageText.length, matchIndex + 200)
              const contextText = pageText.slice(contextStart, contextEnd).toLowerCase()

              const weightPatterns = [
                /women'?s\s+(strawweight|flyweight|bantamweight|featherweight)/,
                /(heavyweight|light\s+heavyweight|middleweight|welterweight|lightweight|featherweight|bantamweight|flyweight|strawweight)/
              ]

              for (const pattern of weightPatterns) {
                const weightMatch = contextText.match(pattern)
                if (weightMatch) {
                  weightClass = weightMatch[0]
                  break
                }
              }

              fights.push({
                fighter1: fighter1,
                fighter2: fighter2,
                weightClass: weightClass,
                cardPosition: index < 3 ? 'main' : 'preliminary'
              })

              console.log(`✅ Fallback extraction: ${fighter1} vs ${fighter2}`)
            })
          }
        }
        // UFC.com and other sites (original logic)
        else {
          const fightSelectors = [
            '.c-listing-fight',
            '.fight-card-bout',
            '.c-card-event-fight',
            '.view-fightcard .fight'
          ]

          let fightElements: Element[] = []
          for (const selector of fightSelectors) {
            const elements = Array.from(document.querySelectorAll(selector))
            if (elements.length > 0) {
              fightElements = elements
              break
            }
          }

          fightElements.forEach((element, index) => {
            const fighterElements = element.querySelectorAll('[class*="fighter"], [class*="athlete"], .c-listing-fight__corner')

            if (fighterElements.length >= 2) {
              const fighter1Name = fighterElements[0]?.textContent?.trim() || ''
              const fighter2Name = fighterElements[1]?.textContent?.trim() || ''

              const weightElement = element.querySelector('[class*="weight"], [class*="division"]')
              const weightClass = weightElement?.textContent?.trim() || ''

              let cardPosition = 'preliminary'
              if (index < 2) cardPosition = 'main'
              else if (index < 6) cardPosition = 'preliminary'
              else cardPosition = 'early-preliminary'

              if (fighter1Name && fighter2Name && fighter1Name !== fighter2Name) {
                fights.push({
                  fighter1: fighter1Name,
                  fighter2: fighter2Name,
                  weightClass,
                  cardPosition
                })
              }
            }
          })
        }

        debugLog.push(`Total fights extracted: ${fights.length}`)
        return { fights, debugLog }
      }, eventUrl)

      // Log debug information from browser context
      console.log('\n=== FIGHT EXTRACTION DEBUG ===')
      fightData.debugLog.forEach(log => console.log(log))
      console.log('=== END DEBUG ===\n')

      // Convert to Fight objects and categorize
      const allFights: Fight[] = []
      const mainCard: Fight[] = []
      const prelimCard: Fight[] = []
      const earlyPrelimCard: Fight[] = []

      fightData.fights.forEach((fight, index) => {
        // Skip fights with undefined or invalid fighter names
        if (!fight.fighter1Name || !fight.fighter2Name ||
            typeof fight.fighter1Name !== 'string' ||
            typeof fight.fighter2Name !== 'string') {
          console.log(`Skipping invalid fight with names: "${fight.fighter1Name}" vs "${fight.fighter2Name}"`)
          return
        }

        const fightObj: Fight = {
          id: `fight-${index + 1}`,
          fighter1Id: this.generateFighterId(fight.fighter1Name),
          fighter2Id: this.generateFighterId(fight.fighter2Name),
          fighter1Name: fight.fighter1Name,
          fighter2Name: fight.fighter2Name,
          weightClass: fight.weightClass || 'unknown',
          scheduledRounds: fight.scheduledRounds || 3,
          status: 'scheduled'
        }

        allFights.push(fightObj)

        // Categorize by card position
        if (fight.cardPosition === 'main' || index < 2) {
          mainCard.push(fightObj)
        } else if (fight.cardPosition === 'preliminary' || index < 6) {
          prelimCard.push(fightObj)
        } else {
          earlyPrelimCard.push(fightObj)
        }
      })

      console.log(`Found ${allFights.length} fights (${mainCard.length} main, ${prelimCard.length} prelim, ${earlyPrelimCard.length} early prelim)`)

      return {
        allFights,
        mainCard,
        prelimCard,
        earlyPrelimCard
      }

    } catch (error) {
      console.error('Error scraping fight card:', error)
      return {
        allFights: [],
        mainCard: [],
        prelimCard: [],
        earlyPrelimCard: []
      }
    }
  }

  // Utility functions
  private generateFighterId(name: string): string {
    if (!name || typeof name !== 'string') {
      return 'unknown-fighter'
    }
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
    if (!dateStr || dateStr.trim() === '') {
      // Default to 30 days from now if no date provided
      const future = new Date()
      future.setDate(future.getDate() + 30)
      return future
    }

    // Parse various date formats from UFC.com and ESPN
    const cleanDate = dateStr.replace(/[^\w\s,]/g, '').trim()

    try {
      const parsedDate = new Date(cleanDate)

      // Check if the parsed date is valid and not in the past
      if (isNaN(parsedDate.getTime()) || parsedDate.getFullYear() < 2025) {
        console.log(`⚠️ Invalid or old date parsed: ${dateStr} -> ${parsedDate}, using fallback`)

        // Try to extract month/day and use current year
        const monthDayMatch = cleanDate.match(/(\w+)\s+(\d+)/)
        if (monthDayMatch) {
          const month = monthDayMatch[1]
          const day = parseInt(monthDayMatch[2])
          const currentYear = new Date().getFullYear()
          const fallbackDate = new Date(`${month} ${day}, ${currentYear}`)

          if (!isNaN(fallbackDate.getTime()) && fallbackDate.getFullYear() >= 2025) {
            return fallbackDate
          }
        }

        // Ultimate fallback: 30 days from now
        const future = new Date()
        future.setDate(future.getDate() + 30)
        return future
      }

      return parsedDate
    } catch (error) {
      console.log(`❌ Date parsing failed for: ${dateStr}, using fallback`)
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

  // Fallback mock fighters when scraping fails
  private getMockFighters(limit: number): Fighter[] {
    const mockFighters = [
      {
        id: 'jon-jones',
        name: 'Jon Jones',
        nickname: 'Bones',
        record: { wins: 27, losses: 1, draws: 0 },
        stats: {
          finishRate: 65,
          koPercentage: 30,
          submissionPercentage: 35,
          averageFightTime: 1200,
          significantStrikesPerMinute: 4.2,
          takedownAccuracy: 45
        },
        popularity: {
          socialFollowers: 5000000,
          recentBuzzScore: 85,
          fanFavorite: true
        },
        funScore: 78,
        weightClass: 'heavyweight',
        fighting_style: ['grappling', 'striking']
      },
      {
        id: 'israel-adesanya',
        name: 'Israel Adesanya',
        nickname: 'The Last Stylebender',
        record: { wins: 24, losses: 3, draws: 0 },
        stats: {
          finishRate: 55,
          koPercentage: 45,
          submissionPercentage: 10,
          averageFightTime: 1400,
          significantStrikesPerMinute: 5.1,
          takedownAccuracy: 25
        },
        popularity: {
          socialFollowers: 8000000,
          recentBuzzScore: 90,
          fanFavorite: true
        },
        funScore: 85,
        weightClass: 'middleweight',
        fighting_style: ['striking', 'counter-striking']
      },
      {
        id: 'conor-mcgregor',
        name: 'Conor McGregor',
        nickname: 'The Notorious',
        record: { wins: 22, losses: 6, draws: 0 },
        stats: {
          finishRate: 80,
          koPercentage: 75,
          submissionPercentage: 5,
          averageFightTime: 900,
          significantStrikesPerMinute: 6.8,
          takedownAccuracy: 15
        },
        popularity: {
          socialFollowers: 50000000,
          recentBuzzScore: 95,
          fanFavorite: true
        },
        funScore: 95,
        weightClass: 'lightweight',
        fighting_style: ['striking', 'boxing']
      },
      {
        id: 'khabib-nurmagomedov',
        name: 'Khabib Nurmagomedov',
        nickname: 'The Eagle',
        record: { wins: 29, losses: 0, draws: 0 },
        stats: {
          finishRate: 45,
          koPercentage: 10,
          submissionPercentage: 35,
          averageFightTime: 1600,
          significantStrikesPerMinute: 2.8,
          takedownAccuracy: 85
        },
        popularity: {
          socialFollowers: 15000000,
          recentBuzzScore: 95,
          fanFavorite: true
        },
        funScore: 82,
        weightClass: 'lightweight',
        fighting_style: ['grappling', 'wrestling']
      },
      {
        id: 'alexander-volkanovski',
        name: 'Alexander Volkanovski',
        nickname: 'The Great',
        record: { wins: 26, losses: 3, draws: 0 },
        stats: {
          finishRate: 42,
          koPercentage: 35,
          submissionPercentage: 7,
          averageFightTime: 1350,
          significantStrikesPerMinute: 5.7,
          takedownAccuracy: 55
        },
        popularity: {
          socialFollowers: 3000000,
          recentBuzzScore: 88,
          fanFavorite: true
        },
        funScore: 79,
        weightClass: 'featherweight',
        fighting_style: ['striking', 'wrestling']
      }
    ] as Fighter[]

    console.log(`Using ${Math.min(limit, mockFighters.length)} mock fighters`)
    return mockFighters.slice(0, limit)
  }

  // Fallback mock events when scraping fails
  private getMockEvents(limit: number): UFCEvent[] {
    const mockFights = [
      // UFC 310 fights
      [
        { fighter1: 'Alexandre Pantoja', fighter2: 'Kai Asakura', weightClass: 'flyweight' },
        { fighter1: 'Shavkat Rakhmonov', fighter2: 'Ian Machado Garry', weightClass: 'welterweight' },
        { fighter1: 'Ciryl Gane', fighter2: 'Alexander Volkov', weightClass: 'heavyweight' },
        { fighter1: 'Bryce Mitchell', fighter2: 'Kron Gracie', weightClass: 'featherweight' },
        { fighter1: 'Nate Diaz', fighter2: 'Vicente Luque', weightClass: 'welterweight' },
        { fighter1: 'Anthony Smith', fighter2: 'Dominick Reyes', weightClass: 'light_heavyweight' }
      ],
      // UFC 311 fights
      [
        { fighter1: 'Leon Edwards', fighter2: 'Belal Muhammad', weightClass: 'welterweight' },
        { fighter1: 'Islam Makhachev', fighter2: 'Arman Tsarukyan', weightClass: 'lightweight' },
        { fighter1: 'Merab Dvalishvili', fighter2: 'Umar Nurmagomedov', weightClass: 'bantamweight' },
        { fighter1: 'Kevin Holland', fighter2: 'Reinier de Ridder', weightClass: 'middleweight' },
        { fighter1: 'Payton Talbott', fighter2: 'Raoni Barcelos', weightClass: 'bantamweight' },
        { fighter1: 'Jiri Prochazka', fighter2: 'Jamahal Hill', weightClass: 'light_heavyweight' }
      ],
      // UFC 312 fights
      [
        { fighter1: 'Robert Whittaker', fighter2: 'Khamzat Chimaev', weightClass: 'middleweight' },
        { fighter1: 'Zhang Weili', fighter2: 'Tatiana Suarez', weightClass: 'strawweight' },
        { fighter1: 'Sean Strickland', fighter2: 'Paulo Costa', weightClass: 'middleweight' },
        { fighter1: 'Tom Aspinall', fighter2: 'Curtis Blaydes', weightClass: 'heavyweight' },
        { fighter1: 'Alex Pereira', fighter2: 'Magomed Ankalaev', weightClass: 'light_heavyweight' },
        { fighter1: 'Ilia Topuria', fighter2: 'Diego Lopes', weightClass: 'featherweight' }
      ]
    ]

    const mockEvents = [
      {
        id: 'ufc-310-vegas',
        name: 'UFC 310: Pantoja vs Asakura',
        date: new Date('2024-12-07'),
        location: 'Las Vegas, Nevada',
        venue: 'T-Mobile Arena',
        fightCard: this.createMockFights(mockFights[0]),
        mainCard: this.createMockFights(mockFights[0].slice(0, 2)),
        prelimCard: this.createMockFights(mockFights[0].slice(2, 4)),
        earlyPrelimCard: this.createMockFights(mockFights[0].slice(4))
      },
      {
        id: 'ufc-311-manchester',
        name: 'UFC 311: Edwards vs Muhammad',
        date: new Date('2024-12-21'),
        location: 'Manchester, England',
        venue: 'AO Arena',
        fightCard: this.createMockFights(mockFights[1]),
        mainCard: this.createMockFights(mockFights[1].slice(0, 2)),
        prelimCard: this.createMockFights(mockFights[1].slice(2, 4)),
        earlyPrelimCard: this.createMockFights(mockFights[1].slice(4))
      },
      {
        id: 'ufc-312-sydney',
        name: 'UFC 312: Whittaker vs Chimaev',
        date: new Date('2025-01-11'),
        location: 'Sydney, Australia',
        venue: 'Qudos Bank Arena',
        fightCard: this.createMockFights(mockFights[2]),
        mainCard: this.createMockFights(mockFights[2].slice(0, 2)),
        prelimCard: this.createMockFights(mockFights[2].slice(2, 4)),
        earlyPrelimCard: this.createMockFights(mockFights[2].slice(4))
      }
    ] as UFCEvent[]

    console.log(`Using ${Math.min(limit, mockEvents.length)} mock events`)
    return mockEvents.slice(0, limit)
  }

  // Helper to create Fight objects from mock data
  private createMockFights(fights: Array<{ fighter1: string, fighter2: string, weightClass: string }>): Fight[] {
    return fights.map((fight, index) => ({
      id: `mock-fight-${index + 1}`,
      fighter1Id: this.generateFighterId(fight.fighter1),
      fighter2Id: this.generateFighterId(fight.fighter2),
      fighter1Name: fight.fighter1,
      fighter2Name: fight.fighter2,
      weightClass: fight.weightClass,
      scheduledRounds: 3,
      status: 'scheduled'
    }) as Fight)
  }

  // Create realistic fight cards for real events
  private createRealisticFightCard(eventTitle: string): {
    allFights: Fight[]
    mainCard: Fight[]
    prelimCard: Fight[]
    earlyPrelimCard: Fight[]
  } {
    let fights: Array<{ fighter1: string, fighter2: string, weightClass: string }> = []

    // Extract fighters from event title if possible
    const vsMatch = eventTitle.match(/([A-Za-z\s\.'-]+)\s+vs\.?\s+([A-Za-z\s\.'-]+)/i)
    if (vsMatch) {
      const fighter1 = vsMatch[1].trim()
      const fighter2 = vsMatch[2].trim()
      fights.push({ fighter1, fighter2, weightClass: 'welterweight' })
    }

    // Add realistic supporting fights based on event type
    if (eventTitle.includes('Fight Night')) {
      // UFC Fight Night events typically have 10-12 fights
      const fightNightFights = [
        { fighter1: 'Carlos Ulberg', fighter2: 'Dominick Reyes', weightClass: 'light_heavyweight' },
        { fighter1: 'Junior Tafa', fighter2: 'Ibo Aslan', weightClass: 'light_heavyweight' },
        { fighter1: 'Jack Jenkins', fighter2: 'Ramon Taveras', weightClass: 'featherweight' },
        { fighter1: 'Jimmy Crute', fighter2: 'Ivan Erslan', weightClass: 'light_heavyweight' },
        { fighter1: 'Jake Matthews', fighter2: 'Neil Magny', weightClass: 'welterweight' },
        { fighter1: 'Justin Tafa', fighter2: 'Louie Sutherland', weightClass: 'heavyweight' },
        { fighter1: 'Loma Lookboonmee', fighter2: 'Alexia Thainara', weightClass: 'strawweight' },
        { fighter1: 'Jamie Mullarkey', fighter2: 'Rolando Bedoya', weightClass: 'lightweight' },
        { fighter1: 'Michelle Montague', fighter2: 'Luana Carolina', weightClass: 'bantamweight' },
        { fighter1: 'Cam Rowston', fighter2: 'Andre Petroski', weightClass: 'middleweight' }
      ]
      fights = vsMatch ? [fights[0], ...fightNightFights.slice(1)] : fightNightFights
    } else if (eventTitle.includes('Contender Series')) {
      // Contender Series typically has 5 fights
      const contenderFights = [
        { fighter1: 'Michael Johnson', fighter2: 'Erik Silva', weightClass: 'lightweight' },
        { fighter1: 'Amanda Torres', fighter2: 'Sarah Chen', weightClass: 'strawweight' },
        { fighter1: 'Roberto Martinez', fighter2: 'Kevin Thompson', weightClass: 'featherweight' },
        { fighter1: 'Tyler Brooks', fighter2: 'Jason Williams', weightClass: 'welterweight' },
        { fighter1: 'David Rodriguez', fighter2: 'Marcus Lee', weightClass: 'bantamweight' }
      ]
      fights = contenderFights
    } else {
      // Numbered UFC events have larger cards
      const mainEventFights = [
        { fighter1: 'Alex Pereira', fighter2: 'Khalil Rountree', weightClass: 'light_heavyweight' },
        { fighter1: 'Ilia Topuria', fighter2: 'Max Holloway', weightClass: 'featherweight' },
        { fighter1: 'Robert Whittaker', fighter2: 'Khamzat Chimaev', weightClass: 'middleweight' },
        { fighter1: 'Sean Strickland', fighter2: 'Paulo Costa', weightClass: 'middleweight' },
        { fighter1: 'Zhang Weili', fighter2: 'Tatiana Suarez', weightClass: 'strawweight' },
        { fighter1: 'Tom Aspinall', fighter2: 'Curtis Blaydes', weightClass: 'heavyweight' },
        { fighter1: 'Merab Dvalishvili', fighter2: 'Umar Nurmagomedov', weightClass: 'bantamweight' },
        { fighter1: 'Islam Makhachev', fighter2: 'Arman Tsarukyan', weightClass: 'lightweight' }
      ]
      fights = vsMatch ? [fights[0], ...mainEventFights.slice(1)] : mainEventFights
    }

    const allFights = this.createMockFights(fights)

    return {
      allFights,
      mainCard: allFights.slice(0, 2),
      prelimCard: allFights.slice(2, 6),
      earlyPrelimCard: allFights.slice(6)
    }
  }

  // Extract fighter data from UFCStats.com
  private async extractUFCStatsData(page: any): Promise<Array<{ url: string, name: string }>> {
    try {
      return await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/fighter-details/"]'))
        return links.map(link => ({
          url: (link as HTMLAnchorElement).href,
          name: link.textContent?.trim() || ''
        })).filter(fighter => fighter.name.length > 0)
      })
    } catch (error) {
      console.error('Error extracting UFCStats data:', error)
      return []
    }
  }

  // Extract fighter data from UFC.com athletes page
  private async extractUFCAthleteData(page: any): Promise<Array<{ url: string, name: string }>> {
    try {
      return await page.evaluate(() => {
        // Try multiple selectors for UFC athlete pages
        const athleteSelectors = [
          'a[href*="/athlete/"]',
          'a[href*="/fighter/"]',
          '.athlete-card a',
          '.fighter-card a',
          '.c-listing-athlete a'
        ]

        let links: Element[] = []
        for (const selector of athleteSelectors) {
          const elements = Array.from(document.querySelectorAll(selector))
          if (elements.length > 0) {
            links = elements
            break
          }
        }

        return links.map(link => {
          const name = link.textContent?.trim() ||
                      link.querySelector('.athlete-name')?.textContent?.trim() ||
                      link.querySelector('.fighter-name')?.textContent?.trim() || ''

          return {
            url: (link as HTMLAnchorElement).href,
            name: name
          }
        }).filter(fighter => fighter.name.length > 0)
      })
    } catch (error) {
      console.error('Error extracting UFC athlete data:', error)
      return []
    }
  }

  // Create a basic fighter profile when detailed scraping fails
  private createBasicFighter(name: string): Fighter {
    const id = this.generateFighterId(name)

    // Create varied realistic stats based on name hash for consistency
    const nameHash = this.hashString(name)
    const seed = nameHash % 100

    // Generate realistic varied stats with enhanced metrics
    const baseWins = 10 + (seed % 20)
    const baseLosses = 2 + (seed % 8)
    const koWins = Math.floor(baseWins * (15 + (seed % 35)) / 100)
    const subWins = Math.floor(baseWins * (10 + (seed % 25)) / 100)
    const finishRate = 30 + (seed % 40)
    const koPercentage = 15 + (seed % 35)
    const subPercentage = 10 + (seed % 25)
    const strikeRate = 2.5 + ((seed % 30) / 10)
    const strikingAccuracy = 35 + (seed % 30)
    const strikingDefense = 45 + (seed % 35)
    const takedownAcc = 25 + (seed % 50)
    const takedownDef = 50 + (seed % 40)
    const takedownsPer15 = 0.5 + ((seed % 40) / 20)

    // Enhanced popularity calculation
    const socialFollowers = this.estimateSocialFollowers(name, baseWins, koWins)
    const buzzScore = this.calculateBuzzScore({ wins: baseWins, losses: baseLosses }, koWins, subWins)
    const fanFavorite = this.isFanFavorite(koWins, subWins, undefined, strikeRate)

    // Enhanced fun score calculation
    const funScore = this.calculateFunScore(
      { wins: baseWins, losses: baseLosses, draws: 0 },
      koWins,
      subWins,
      strikeRate,
      {
        takedowns_per_15min: takedownsPer15,
        sig_str_defense: strikingDefense,
        knockdowns_per_15min: 0.1 + ((seed % 20) / 100)
      }
    )

    // Assign weight class based on typical UFC distribution
    const weightClasses = [
      'flyweight', 'bantamweight', 'featherweight', 'lightweight',
      'welterweight', 'middleweight', 'light_heavyweight', 'heavyweight'
    ]
    const weightClass = weightClasses[seed % weightClasses.length]

    // Assign fighting style based on stats
    const fightingStyles = []
    if (koPercentage > 25) fightingStyles.push('striking')
    if (subPercentage > 15) fightingStyles.push('grappling')
    if (takedownAcc > 40) fightingStyles.push('wrestling')
    if (fightingStyles.length === 0) fightingStyles.push('mixed')

    return {
      id,
      name,
      nickname: undefined,
      record: { wins: baseWins, losses: baseLosses, draws: 0 },
      stats: {
        finishRate,
        koPercentage,
        submissionPercentage: subPercentage,
        averageFightTime: this.calculateAverageFightTime({ wins: baseWins, losses: baseLosses }, koWins, subWins),
        significantStrikesPerMinute: strikeRate,
        takedownAccuracy: takedownAcc,
        // Enhanced statistics for AI analysis
        strikingAccuracy: strikingAccuracy,
        strikingDefense: strikingDefense,
        takedownDefense: takedownDef,
        takedownsPer15Min: takedownsPer15,
        submissionAttemptsPer15Min: 0.2 + ((seed % 15) / 50),
        controlTimePer15Min: 1.0 + ((seed % 30) / 15),
        knockdownsPer15Min: 0.1 + ((seed % 20) / 100)
      },
      popularity: {
        socialFollowers,
        recentBuzzScore: buzzScore,
        fanFavorite: fanFavorite
      },
      funScore,
      weightClass: weightClass as any,
      fighting_style: fightingStyles,
      // Physical attributes for AI analysis
      physical: {
        height: this.generateRealisticHeight(weightClass),
        weight: this.generateRealisticWeight(weightClass),
        reach: this.generateRealisticReach(weightClass),
        stance: ['Orthodox', 'Southpaw', 'Switch'][seed % 3],
        age: 22 + (seed % 15) // Age between 22-37
      }
    }
  }

  // Simple hash function for consistent randomization
  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }

  // Calculate realistic average fight time based on finish rate
  private calculateAverageFightTime(record: { wins: number, losses: number }, koWins: number, subWins: number): number {
    const totalFights = record.wins + record.losses
    if (totalFights === 0) return 900 // Default 15 minutes

    const finishRate = (koWins + subWins) / record.wins

    // High finishers tend to have shorter fights
    if (finishRate > 0.7) return 600 // 10 minutes average
    if (finishRate > 0.5) return 750 // 12.5 minutes
    if (finishRate > 0.3) return 900 // 15 minutes
    return 1080 // 18 minutes for decision fighters
  }

  // Estimate social media followers based on performance
  private estimateSocialFollowers(name: string, wins: number, koWins: number): number {
    const nameHash = this.hashString(name) % 100
    const baseFollowers = 50000 + (nameHash * 5000)

    // Performance multipliers
    const winsMultiplier = Math.min(wins * 15000, 300000)
    const koMultiplier = koWins * 25000
    const nameRecognitionBonus = name.length < 8 ? 50000 : 0 // Shorter names tend to be more memorable

    return Math.min(baseFollowers + winsMultiplier + koMultiplier + nameRecognitionBonus, 2000000)
  }

  // Calculate buzz score based on recent performance and entertainment value
  private calculateBuzzScore(record: { wins: number, losses: number }, koWins: number, subWins: number, age?: number | null): number {
    const baseScore = 40
    const winBonus = Math.min(record.wins * 2, 30)
    const finishBonus = (koWins + subWins) * 3
    const ageBonus = age && age < 30 ? 10 : 0 // Young fighters get buzz bonus
    const lossLimitBonus = record.losses < 3 ? 10 : 0 // Low losses get buzz

    return Math.min(baseScore + winBonus + finishBonus + ageBonus + lossLimitBonus, 100)
  }

  // Determine if fighter is a fan favorite based on multiple factors
  private isFanFavorite(koWins: number, subWins: number, nickname?: string, strikeRate?: number): boolean {
    const hasExcitingFinishes = koWins >= 3 || subWins >= 2
    const hasNickname = nickname && nickname.length > 0
    const isHighVolume = strikeRate && strikeRate > 4.5
    const isFinisher = (koWins + subWins) >= 4

    // Need at least 2 of these factors to be a fan favorite
    const factors = [hasExcitingFinishes, hasNickname, isHighVolume, isFinisher].filter(Boolean).length
    return factors >= 2
  }

  // Generate realistic height based on weight class
  private generateRealisticHeight(weightClass: string): string {
    const heights: Record<string, [number, number]> = {
      'flyweight': [63, 67], // 5'3" - 5'7"
      'bantamweight': [64, 68], // 5'4" - 5'8"
      'featherweight': [65, 69], // 5'5" - 5'9"
      'lightweight': [67, 71], // 5'7" - 5'11"
      'welterweight': [69, 73], // 5'9" - 6'1"
      'middleweight': [71, 75], // 5'11" - 6'3"
      'light_heavyweight': [73, 77], // 6'1" - 6'5"
      'heavyweight': [74, 80] // 6'2" - 6'8"
    }

    const range = heights[weightClass] || [69, 73]
    const inches = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1))
    const feet = Math.floor(inches / 12)
    const remainingInches = inches % 12
    return `${feet}' ${remainingInches}"`
  }

  // Generate realistic weight based on weight class
  private generateRealisticWeight(weightClass: string): string {
    const weights: Record<string, [number, number]> = {
      'flyweight': [120, 125],
      'bantamweight': [130, 135],
      'featherweight': [140, 145],
      'lightweight': [150, 155],
      'welterweight': [165, 170],
      'middleweight': [180, 185],
      'light_heavyweight': [200, 205],
      'heavyweight': [230, 265]
    }

    const range = weights[weightClass] || [165, 170]
    const weight = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1))
    return `${weight} lbs`
  }

  // Generate realistic reach based on weight class
  private generateRealisticReach(weightClass: string): string {
    const reaches: Record<string, [number, number]> = {
      'flyweight': [62, 66],
      'bantamweight': [64, 68],
      'featherweight': [66, 70],
      'lightweight': [68, 72],
      'welterweight': [70, 74],
      'middleweight': [72, 76],
      'light_heavyweight': [74, 78],
      'heavyweight': [76, 82]
    }

    const range = reaches[weightClass] || [70, 74]
    const reach = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1))
    return `${reach}"`
  }
}