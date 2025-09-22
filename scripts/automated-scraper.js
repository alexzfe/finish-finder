#!/usr/bin/env node

// Register ts-node to handle TypeScript imports with Node.js config
require('ts-node').register({
  project: './tsconfig.node.json'
})

// Import from TypeScript source
const { HybridUFCService } = require('../src/lib/ai/hybridUFCService.ts')
const { PrismaClient } = require('@prisma/client')
const { validateJsonField, validateFightData, validateFighterData } = require('../src/lib/database/validation.ts')
const fs = require('fs/promises')
const path = require('path')
let Sentry = null

// TypeScript interfaces converted to JSDoc for JavaScript compatibility

class AutomatedScraper {
  constructor() {
    this.prisma = new PrismaClient()
    this.ufcService = new HybridUFCService()
    this.logFile = path.join(__dirname, '../logs/scraper.log')
    this.missingEventsFile = path.join(__dirname, '../logs/missing-events.json')
    this.missingFightsFile = path.join(__dirname, '../logs/missing-fights.json')
    this.cancellationThreshold = Number(process.env.SCRAPER_CANCEL_THRESHOLD || 3)
    if (!Number.isFinite(this.cancellationThreshold) || this.cancellationThreshold < 1) {
      this.cancellationThreshold = 3
    }
    this.fightCancellationThreshold = Number(process.env.SCRAPER_FIGHT_CANCEL_THRESHOLD || 2)
    if (!Number.isFinite(this.fightCancellationThreshold) || this.fightCancellationThreshold < 1) {
      this.fightCancellationThreshold = 2
    }
    this.monitoringSetup = false
  }

  async initialize() {
    // Ensure logs directory exists
    await fs.mkdir(path.dirname(this.logFile), { recursive: true })
    await this.log('AutomatedScraper initialized')
  }

  async checkForEventUpdates() {
    const startTime = Date.now()
    const result = {
      eventsProcessed: 0,
      fightsProcessed: 0,
      changesDetected: [],
      errors: [],
      executionTime: 0
    }

    try {
      await this.log('Starting automated event update check...')
      const missingEventsState = await this.loadMissingEvents()
      const missingFightsState = await this.loadMissingFights()
      const eventsNeedingPredictions = new Map()

      // Get current events from database
      const currentEvents = await this.prisma.event.findMany({
        include: {
          fights: {
            include: {
              fighter1: true,
              fighter2: true
            }
          }
        },
        where: {
          date: {
            gte: new Date() // Only upcoming events
          }
        },
        orderBy: {
          date: 'asc'
        }
      })

      // Scrape latest data from sources (now separated from AI predictions)
      const scrapedData = await this.ufcService.getUpcomingUFCEvents(15)
      result.eventsProcessed = scrapedData.events.length

      // Debug: Log all scraped events
      await this.log(`📋 Scraped ${scrapedData.events.length} events:`)
      for (const event of scrapedData.events) {
        await this.log(`   • ${event.name} (${event.date})`)
      }

      // Compare and detect changes
      for (const scrapedEvent of scrapedData.events) {
        const existingEvent = currentEvents.find(e =>
          this.normalizeEventName(e.name) === this.normalizeEventName(scrapedEvent.name)
        )

        if (!existingEvent) {
          // New event detected - create without AI predictions
          await this.handleNewEvent(scrapedEvent, scrapedData.fighters)
          delete missingFightsState[scrapedEvent.id]
          delete missingEventsState[scrapedEvent.id]
          eventsNeedingPredictions.set(scrapedEvent.id, scrapedEvent.name)

          result.changesDetected.push({
            type: 'added',
            eventId: scrapedEvent.id,
            eventName: scrapedEvent.name,
            changes: { event: { old: null, new: scrapedEvent } },
            timestamp: new Date()
          })
        } else {
          // Check for modifications
          const changes = await this.detectEventChanges(existingEvent, scrapedEvent)
          if (Object.keys(changes).length > 0) {
            await this.handleEventChanges(existingEvent, scrapedEvent, changes, missingFightsState)

            result.changesDetected.push({
              type: 'modified',
              eventId: existingEvent.id,
              eventName: existingEvent.name,
              changes,
              timestamp: new Date()
            })
            eventsNeedingPredictions.set(existingEvent.id, existingEvent.name)
          }
        }

        result.fightsProcessed += scrapedEvent.fightCard.length
        if (existingEvent && missingEventsState[existingEvent.id]) {
          delete missingEventsState[existingEvent.id]
          await this.log(`✅ Event restored after temporary absence: ${existingEvent.name}`)
        }

        const eventIdToCheck = existingEvent ? existingEvent.id : scrapedEvent.id
        const eventNameToCheck = existingEvent ? existingEvent.name : scrapedEvent.name
        if (!eventsNeedingPredictions.has(eventIdToCheck)) {
          const needsPredictions = await this.eventNeedsPredictions(eventIdToCheck)
          if (needsPredictions) {
            eventsNeedingPredictions.set(eventIdToCheck, eventNameToCheck)
          }
        }
      }

      // Check for cancelled/removed events
      for (const currentEvent of currentEvents) {
        const stillExists = scrapedData.events.find(e =>
          this.normalizeEventName(e.name) === this.normalizeEventName(currentEvent.name)
        )

        if (!stillExists && !currentEvent.completed) {
          const currentState = missingEventsState[currentEvent.id] || { count: 0, lastSeen: currentEvent.updatedAt }
          currentState.count += 1
          currentState.lastSeen = currentState.lastSeen || currentEvent.updatedAt
          missingEventsState[currentEvent.id] = currentState

          if (currentState.count >= this.cancellationThreshold) {
            await this.handleCancelledEvent(currentEvent)
            result.changesDetected.push({
              type: 'cancelled',
              eventId: currentEvent.id,
              eventName: currentEvent.name,
              changes: { status: { old: 'active', new: 'cancelled' }, missingCount: currentState.count },
              timestamp: new Date()
            })
            delete missingEventsState[currentEvent.id]
          } else {
            await this.log(`⚠️ Event missing from scrape (${currentState.count}/${this.cancellationThreshold}): ${currentEvent.name}`, 'warn')
            await this.recordMonitoringWarning('Event missing from scrape', {
              type: 'event_missing_warning',
              eventId: currentEvent.id,
              eventName: currentEvent.name,
              missingCount: currentState.count,
              threshold: this.cancellationThreshold
            })
          }
        }
      }

      await this.log(`Scraping completed: ${result.eventsProcessed} events, ${result.fightsProcessed} fights, ${result.changesDetected.length} changes`)
      await this.saveMissingEvents(missingEventsState)
      await this.saveMissingFights(missingFightsState)

      for (const [eventId, eventName] of eventsNeedingPredictions.entries()) {
        await this.generateEventPredictions(eventId, eventName)
      }

    } catch (error) {
      if (error && error.code === 'SHERDOG_BLOCKED') {
        const warningMsg = 'Sherdog returned HTTP 403 (blocked). Skipping scrape and leaving strike counters unchanged.'
        result.errors.push(warningMsg)
        await this.log(warningMsg, 'warn')
      } else {
        const errorMsg = `Scraping failed: ${error.message}`
        result.errors.push(errorMsg)
        await this.log(errorMsg, 'error')
      }
    }

    result.executionTime = Date.now() - startTime
    return result
  }

  async detectEventChanges(existing, scraped) {
    const changes = {}

    // Check basic event details
    if (existing.date.getTime() !== new Date(scraped.date).getTime()) {
      changes.date = { old: existing.date, new: scraped.date }
    }

    if (existing.location !== scraped.location) {
      changes.location = { old: existing.location, new: scraped.location }
    }

    if (existing.venue !== scraped.venue) {
      changes.venue = { old: existing.venue, new: scraped.venue }
    }

    // Check fight card changes
    const existingFightIds = new Set(existing.fights.map(f => `${f.fighter1.name}-${f.fighter2.name}`))
    const scrapedFightIds = new Set(scraped.fightCard.map(f => `${f.fighter1Name}-${f.fighter2Name}`))

    const addedFights = scraped.fightCard.filter(f =>
      !existingFightIds.has(`${f.fighter1Name}-${f.fighter2Name}`)
    )

    const removedFights = existing.fights.filter(f =>
      !scrapedFightIds.has(`${f.fighter1.name}-${f.fighter2.name}`)
    )

    if (addedFights.length > 0 || removedFights.length > 0) {
      changes.fightCard = {
        old: { total: existing.fights.length, fights: existing.fights.map(f => `${f.fighter1.name} vs ${f.fighter2.name}`) },
        new: { total: scraped.fightCard.length, added: addedFights.length, removed: removedFights.length }
      }
    }

    return changes
  }

  async handleNewEvent(event, fighters) {
    await this.log(`Adding new event: ${event.name}`)

    try {
      // Use transaction to ensure atomicity
      await this.prisma.$transaction(async (tx) => {
        // Validate and prepare fighter data for bulk operations
        const validatedFighters = []
        for (const fighter of fighters) {
          const validation = validateFighterData(fighter)
          if (!validation.valid) {
            await this.log(`⚠️ Skipping invalid fighter data: ${validation.errors.join(', ')}`, 'warn')
            continue
          }
          validatedFighters.push(fighter)
        }

        const fighterUpserts = validatedFighters.map(fighter =>
          tx.fighter.upsert({
            where: { id: fighter.id },
            update: {
              name: fighter.name,
              nickname: fighter.nickname,
              wins: fighter.wins,
              losses: fighter.losses,
              draws: fighter.draws,
              weightClass: fighter.weightClass,
              record: fighter.record,
              updatedAt: new Date()
            },
            create: {
              id: fighter.id,
              name: fighter.name,
              nickname: fighter.nickname,
              wins: fighter.wins,
              losses: fighter.losses,
              draws: fighter.draws,
              weightClass: fighter.weightClass,
              record: fighter.record
            }
          })
        )

        // Execute all fighter operations in parallel within transaction
        await Promise.all(fighterUpserts)

        // Create the event
        const createdEvent = await tx.event.create({
          data: {
            id: event.id,
            name: event.name,
            date: new Date(event.date),
            location: event.location,
            venue: event.venue
          }
        })

        // Validate and prepare fight data for bulk creation
        const validatedFights = []
        for (const fight of event.fightCard) {
          const validation = validateFightData(fight)
          if (!validation.valid) {
            await this.log(`⚠️ Skipping invalid fight data: ${validation.errors.join(', ')}`, 'warn')
            continue
          }
          validatedFights.push(fight)
        }

        const fightData = validatedFights.map(fight => ({
          id: fight.id,
          eventId: createdEvent.id,
          fighter1Id: fight.fighter1Id,
          fighter2Id: fight.fighter2Id,
          weightClass: fight.weightClass,
          titleFight: fight.titleFight || false,
          mainEvent: fight.mainEvent || false,
          cardPosition: fight.cardPosition || 'preliminary',
          scheduledRounds: fight.scheduledRounds || 3,
          fightNumber: fight.fightNumber,
          // NO AI predictions here - defaults only with validated JSON
          funFactor: 0,
          finishProbability: 0,
          predictedFunScore: 0,
          funFactors: validateJsonField([], 'funFactors'),
          keyFactors: validateJsonField([], 'keyFactors')
        }))

        // Bulk create fights
        if (fightData.length > 0) {
          await tx.fight.createMany({
            data: fightData,
            skipDuplicates: true
          })
        }

        await this.log(`✅ Successfully created event ${event.name} with ${validatedFighters.length}/${fighters.length} fighters and ${validatedFights.length}/${event.fightCard.length} fights in transaction`)
      })

    } catch (error) {
      await this.log(`❌ Transaction failed for event ${event.name}: ${error.message}`, 'error')
      throw error
    }
  }

  // NEW: Separate method for AI prediction generation
  async generateEventPredictions(eventId, eventName) {
    await this.log(`🤖 Generating AI predictions for event: ${eventName}`)

    try {
      // Get event with fights from database
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        include: {
          fights: {
            include: {
              fighter1: true,
              fighter2: true
            }
          }
        }
      })

      if (!event || event.fights.length === 0) {
        await this.log(`No fights found for event ${eventName}`, 'warn')
        return
      }

      // Convert database fights to format expected by AI service
      const fightsForAI = event.fights.map(fight => ({
        id: fight.id,
        fighter1Id: fight.fighter1Id,
        fighter2Id: fight.fighter2Id,
        fighter1Name: fight.fighter1.name,
        fighter2Name: fight.fighter2.name,
        weightClass: fight.weightClass,
        cardPosition: fight.cardPosition,
        titleFight: fight.titleFight,
        mainEvent: fight.mainEvent,
        scheduledRounds: fight.scheduledRounds
      }))

      // Generate predictions using AI service
      const enrichedFights = await this.ufcService.generateEventPredictions(eventId, eventName, fightsForAI)

      // Update fights in database with AI predictions
      for (const enrichedFight of enrichedFights) {
        await this.prisma.fight.update({
          where: { id: enrichedFight.id },
          data: {
            funFactor: enrichedFight.funFactor || 0,
            finishProbability: enrichedFight.finishProbability || 0,
            entertainmentReason: enrichedFight.entertainmentReason,
            keyFactors: validateJsonField(enrichedFight.keyFactors || [], 'keyFactors'),
            fightPrediction: enrichedFight.fightPrediction,
            riskLevel: enrichedFight.riskLevel,
            predictedFunScore: enrichedFight.predictedFunScore || (enrichedFight.funFactor * 10),
            funFactors: validateJsonField(enrichedFight.funFactors || [], 'funFactors'),
            aiDescription: enrichedFight.aiDescription || enrichedFight.entertainmentReason,
            updatedAt: new Date()
          }
        })
      }

      await this.log(`✅ Generated AI predictions for ${enrichedFights.length} fights in ${eventName}`)

    } catch (error) {
      await this.log(`❌ Failed to generate AI predictions for ${eventName}: ${error.message}`, 'error')
    }
  }

  async handleEventChanges(existing, scraped, changes, missingFightsState) {
    await this.log(`Updating event: ${existing.name} - ${Object.keys(changes).join(', ')} changed`)

    try {
      // Update basic event details
      await this.prisma.event.update({
        where: { id: existing.id },
        data: {
          name: scraped.name,
          date: new Date(scraped.date),
          location: scraped.location,
          venue: scraped.venue,
          updatedAt: new Date()
        }
      })

      // Maintain fights missing across runs
      const eventFightState = missingFightsState[existing.id] || {}
      const scrapedFightKeys = new Set()
      for (const fight of scraped.fightCard || []) {
        scrapedFightKeys.add(this.getFightKeyFromScraped(fight))
      }

      for (const existingFight of existing.fights) {
        const fightKey = this.getFightKeyFromExisting(existingFight)
        if (scrapedFightKeys.has(fightKey)) {
          if (eventFightState[fightKey]) {
            delete eventFightState[fightKey]
          }
          continue
        }

        const currentState = eventFightState[fightKey] || { count: 0, lastSeen: existingFight.updatedAt }
        currentState.count += 1
        currentState.lastSeen = new Date().toISOString()
        eventFightState[fightKey] = currentState

        const fightLabel = `${existingFight.fighter1.name} vs ${existingFight.fighter2.name}`

        if (currentState.count < this.fightCancellationThreshold) {
          await this.log(`⚠️ Fight missing from scrape (${currentState.count}/${this.fightCancellationThreshold}) in ${existing.name}: ${fightLabel}`, 'warn')
          await this.recordMonitoringWarning('Fight missing from scrape', {
            type: 'fight_missing_warning',
            eventId: existing.id,
            fightId: existingFight.id,
            fight: fightLabel,
            missingCount: currentState.count,
            threshold: this.fightCancellationThreshold
          })
          scraped.fightCard.push(this.mapExistingFightToScraped(existingFight))
        } else {
          await this.log(`Fight auto-removed after repeated misses in ${existing.name}: ${fightLabel}`, 'error')
          await this.forwardToMonitoring('error', 'Fight auto-removed after repeated misses', {
            eventId: existing.id,
            fightId: existingFight.id,
            fight: fightLabel,
            threshold: this.fightCancellationThreshold
          })
          delete eventFightState[fightKey]
        }
      }

      if (Object.keys(eventFightState).length > 0) {
        missingFightsState[existing.id] = eventFightState
      } else {
        delete missingFightsState[existing.id]
      }

      // Handle fight card changes if needed
      if (changes.fightCard) {
        // For now, we'll recreate all fights for simplicity
        // In production, you might want more sophisticated merging
        await this.prisma.fight.deleteMany({
          where: { eventId: existing.id }
        })

        for (const fight of scraped.fightCard) {
          await this.prisma.fight.create({
            data: {
              id: fight.id,
              eventId: existing.id,
              fighter1Id: fight.fighter1Id,
              fighter2Id: fight.fighter2Id,
              weightClass: fight.weightClass,
              titleFight: fight.titleFight || false,
              mainEvent: fight.mainEvent || false,
              cardPosition: fight.cardPosition || 'preliminary',
              scheduledRounds: fight.scheduledRounds || 3,
              fightNumber: fight.fightNumber,
              funFactor: fight.funFactor || 0,
              finishProbability: fight.finishProbability || 0,
              entertainmentReason: fight.entertainmentReason,
              keyFactors: JSON.stringify(fight.keyFactors || []),
              fightPrediction: fight.fightPrediction,
              riskLevel: fight.riskLevel,
              predictedFunScore: fight.predictedFunScore || 0,
              funFactors: JSON.stringify(fight.funFactors || []),
              aiDescription: fight.aiDescription
            }
          })
        }
      }

    } catch (error) {
      await this.log(`Failed to update event ${existing.name}: ${error.message}`, 'error')
      throw error
    }
  }

  async handleCancelledEvent(event) {
    await this.log(`Event cancelled after ${this.cancellationThreshold} consecutive misses: ${event.name}`)
    await this.forwardToMonitoring('error', 'Event auto-cancelled after repeated misses', {
      eventId: event.id,
      eventName: event.name,
      threshold: this.cancellationThreshold
    })

    // Mark event as completed (cancelled)
    await this.prisma.event.update({
      where: { id: event.id },
      data: {
        completed: true,
        updatedAt: new Date()
      }
    })
  }

  normalizeEventName(name) {
    return name
      .toLowerCase()
      .replace(/ufc\s*/i, '')
      .replace(/[^a-z0-9]/g, '')
      .trim()
  }

  async scheduleNextRun() {
    // This would typically be handled by a cron job or task scheduler
    // For now, we'll just log when the next run should happen
    const nextRun = new Date(Date.now() + 4 * 60 * 60 * 1000) // 4 hours from now
    await this.log(`Next automated scraping scheduled for: ${nextRun.toISOString()}`)
  }

  async handleDataConflicts() {
    // Placeholder for conflict resolution logic
    // This would handle cases where scraped data conflicts with manual edits
    await this.log('Checking for data conflicts...')

    // In practice, this might:
    // - Check for manual overrides in the database
    // - Compare timestamps to determine which data is newer
    // - Flag conflicts for manual review

    return { resolved: 0, remaining: 0 }
  }

  async log(message, level = 'info') {
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`

    console.log(logEntry.trim())

    try {
      await fs.appendFile(this.logFile, logEntry)
    } catch (error) {
      console.error('Failed to write to log file:', error)
    }
  }

  async recordMonitoringWarning(message, payload) {
    try {
      const warning = {
        type: payload.type || 'scraper_warning',
        timestamp: new Date().toISOString(),
        payload
      }
      await fs.appendFile(this.logFile, `${JSON.stringify(warning)}\n`)
      await this.forwardToMonitoring('warning', message, warning)
    } catch (error) {
      console.error('Failed to record monitoring warning:', error)
    }
  }

  async forwardToMonitoring(level, message, context) {
    if (!process.env.SENTRY_DSN) {
      return
    }

    try {
      if (!this.monitoringSetup) {
        if (!Sentry) {
          Sentry = require('@sentry/node')
        }
        Sentry.init({
          dsn: process.env.SENTRY_DSN,
          environment: process.env.NODE_ENV || 'development',
          release: process.env.SENTRY_RELEASE
        })
        this.monitoringSetup = true
      }

      if (!this.monitoringSetup) {
        return
      }

      Sentry.withScope(scope => {
        scope.setLevel(level)
        scope.setContext('scraper', context)
        Sentry.captureMessage(message)
      })
    } catch (error) {
      console.error('Failed to forward monitoring event:', error)
    }
  }

  getFightKeyFromScraped(fight) {
    return this.normalizeFightKey(fight.fighter1Name, fight.fighter2Name)
  }

  getFightKeyFromExisting(fight) {
    return this.normalizeFightKey(fight.fighter1.name, fight.fighter2.name)
  }

  normalizeFightKey(nameA, nameB) {
    const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
    return `${normalize(nameA || '')}-${normalize(nameB || '')}`
  }

  mapExistingFightToScraped(fight) {
    return {
      id: fight.id,
      fighter1Id: fight.fighter1Id,
      fighter2Id: fight.fighter2Id,
      fighter1Name: fight.fighter1.name,
      fighter2Name: fight.fighter2.name,
      weightClass: fight.weightClass,
      cardPosition: fight.cardPosition,
      scheduledRounds: fight.scheduledRounds,
      status: fight.completed ? 'completed' : 'scheduled',
      titleFight: fight.titleFight,
      mainEvent: fight.mainEvent,
      fightNumber: fight.fightNumber,
      funFactor: fight.funFactor,
      finishProbability: fight.finishProbability,
      entertainmentReason: fight.entertainmentReason,
      keyFactors: fight.keyFactors ? JSON.parse(fight.keyFactors) : [],
      fightPrediction: fight.fightPrediction,
      riskLevel: fight.riskLevel,
      funFactors: fight.funFactors ? JSON.parse(fight.funFactors) : [],
      aiDescription: fight.aiDescription
    }
  }

  async loadMissingEvents() {
    try {
      const data = await fs.readFile(this.missingEventsFile, 'utf8')
      return JSON.parse(data)
    } catch (error) {
      return {}
    }
  }

  async saveMissingEvents(state) {
    try {
      await fs.mkdir(path.dirname(this.missingEventsFile), { recursive: true })
      await fs.writeFile(this.missingEventsFile, JSON.stringify(state, null, 2))
    } catch (error) {
      await this.log(`Failed to persist missing event state: ${error.message}`, 'warn')
    }
  }

  async loadMissingFights() {
    try {
      const data = await fs.readFile(this.missingFightsFile, 'utf8')
      return JSON.parse(data)
    } catch (error) {
      return {}
    }
  }

  async saveMissingFights(state) {
    try {
      await fs.mkdir(path.dirname(this.missingFightsFile), { recursive: true })
      await fs.writeFile(this.missingFightsFile, JSON.stringify(state, null, 2))
    } catch (error) {
      await this.log(`Failed to persist missing fight state: ${error.message}`, 'warn')
    }
  }

  async eventNeedsPredictions(eventId) {
    const fights = await this.prisma.fight.findMany({
      where: { eventId },
      select: {
        id: true,
        funFactor: true,
        predictedFunScore: true,
        entertainmentReason: true,
        aiDescription: true,
        finishProbability: true
      }
    })

    if (fights.length === 0) {
      return false
    }

    return fights.some(fight => {
      const hasDescription = Boolean(fight.entertainmentReason || fight.aiDescription)
      const hasNumericPredictions = Boolean(fight.funFactor && fight.finishProbability)
      return !hasDescription || !hasNumericPredictions
    })
  }

  async getStatus() {
    // Placeholder for status checking
    return {
      lastRun: new Date(),
      nextScheduledRun: new Date(Date.now() + 4 * 60 * 60 * 1000),
      recentChanges: [],
      healthStatus: 'healthy'
    }
  }

  async cleanup() {
    await this.prisma.$disconnect()
    await this.log('AutomatedScraper cleanup completed')
  }
}

// CLI interface
async function main() {
  if (require.main === module) {
    const scraper = new AutomatedScraper()

    try {
      await scraper.initialize()

      const command = process.argv[2] || 'check'

      switch (command) {
        case 'check':
          const result = await scraper.checkForEventUpdates()
          console.log('\nScraping Results:')
          console.log(`Events processed: ${result.eventsProcessed}`)
          console.log(`Fights processed: ${result.fightsProcessed}`)
          console.log(`Changes detected: ${result.changesDetected.length}`)
          console.log(`Execution time: ${result.executionTime}ms`)

          if (result.errors.length > 0) {
            console.log('\nErrors:')
            result.errors.forEach(error => console.log(`- ${error}`))
          }

          if (result.changesDetected.length > 0) {
            console.log('\nChanges detected:')
            result.changesDetected.forEach(change => {
              console.log(`- ${change.type}: ${change.eventName}`)
            })
          }
          break

        case 'status':
          const status = await scraper.getStatus()
          console.log('Scraper Status:', status)
          break

        case 'schedule':
          await scraper.scheduleNextRun()
          break

        default:
          console.log('Usage: node automated-scraper.js [check|status|schedule]')
      }

    } catch (error) {
      console.error('Scraper failed:', error)
      process.exit(1)
    } finally {
      await scraper.cleanup()
    }
  }
}

module.exports = { AutomatedScraper }

// Run if called directly
if (require.main === module) {
  main()
}
