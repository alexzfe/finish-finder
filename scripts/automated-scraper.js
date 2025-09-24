#!/usr/bin/env node

// Register ts-node to handle TypeScript imports with Node.js config
require('ts-node').register({
  project: './tsconfig.node.json'
})

// Import from TypeScript source
const { HybridUFCService } = require('../src/lib/ai/hybridUFCService.ts')
const { TapologyUFCService } = require('../src/lib/scrapers/tapologyService.ts')
const { PrismaClient } = require('@prisma/client')
const { validateJsonField, validateFightData, validateFighterData } = require('../src/lib/database/validation.ts')
const fs = require('fs/promises')
const path = require('path')
let Sentry = null

// TypeScript interfaces converted to JSDoc for JavaScript compatibility

class AutomatedScraper {
  constructor() {
    // Configure Prisma with optimized connection settings for CI
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      },
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
      __internal: {
        engine: {
          connectionLimit: 1
        }
      }
    })
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

      // Upsert fighters first (ensures records/wins/losses are kept current even for existing events)
      if (scrapedData.fighters?.length) {
        const validatedFighters = []
        for (const fighter of scrapedData.fighters) {
          const validation = validateFighterData(fighter)
          if (!validation.valid) {
            await this.log(`⚠️ Skipping invalid fighter data: ${validation.errors.join(', ')}`, 'warn')
            continue
          }
          validatedFighters.push(fighter)
        }

        // Execute fighter upserts in batches to avoid connection pool exhaustion
        const batchSize = 5
        let processedFighters = 0

        for (let i = 0; i < validatedFighters.length; i += batchSize) {
          const batch = validatedFighters.slice(i, i + batchSize)
          const batchOps = batch.map(f => this.prisma.fighter.upsert({
            where: { id: f.id },
            update: {
              name: f.name,
              nickname: f.nickname,
              wins: f.wins,
              losses: f.losses,
              draws: f.draws,
              weightClass: f.weightClass,
              record: f.record,
              updatedAt: new Date()
            },
            create: {
              id: f.id,
              name: f.name,
              nickname: f.nickname,
              wins: f.wins,
              losses: f.losses,
              draws: f.draws,
              weightClass: f.weightClass,
              record: f.record
            }
          }))

          await Promise.all(batchOps)
          processedFighters += batch.length

          // Small delay between batches to prevent overwhelming the connection pool
          if (i + batchSize < validatedFighters.length) {
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }

        await this.log(`✅ Processed ${processedFighters} fighters in batches`)
      }

      // Debug: Log all scraped events
      await this.log(`📋 Scraped ${scrapedData.events.length} events:`)
      for (const event of scrapedData.events) {
        await this.log(`   • ${event.name} (${event.date})`)
      }

      // Compare and detect changes
      for (const scrapedEvent of scrapedData.events) {
        const existingEvent = currentEvents.find(e =>
          this.normalizeEventName(e.name) === this.normalizeEventName(scrapedEvent.name) ||
          this.eventsAreSame(e, scrapedEvent)
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

        // Debug: Log event matching
        if (existingEvent) {
          await this.log(`🔗 Matched existing event: "${existingEvent.name}" with scraped: "${scrapedEvent.name}"`)
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
          this.normalizeEventName(e.name) === this.normalizeEventName(currentEvent.name) ||
          this.eventsAreSame(currentEvent, e)
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
      await this.log(`📊 Current database state: ${currentEvents.length} existing events`)
      await this.log(`📥 Scraped from sources: ${scrapedData.events.length} events`)

      // Debug: Log all scraped event names for troubleshooting
      if (scrapedData.events.length > 0) {
        await this.log(`📋 Scraped event details:`)
        for (const event of scrapedData.events) {
          await this.log(`   • "${event.name}" (${event.date}) - ${event.venue || 'TBA'}, ${event.location || 'TBA'}`)
        }
      }
      await this.saveMissingEvents(missingEventsState)
      await this.saveMissingFights(missingFightsState)

      // AI predictions are now handled by separate workflow
      if (eventsNeedingPredictions.size > 0) {
        await this.log(`ℹ️ ${eventsNeedingPredictions.size} events will need AI predictions (handled by separate daily workflow)`)
        eventsNeedingPredictions.forEach((eventName, eventId) => {
          this.log(`  - ${eventName} (${eventId})`)
        })
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

    // Retry logic for database operations
    const maxRetries = 3
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Use transaction to ensure atomicity with timeout
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

        // Execute fighter operations in batches to avoid connection pool exhaustion
        const batchSize = 5
        for (let i = 0; i < fighterUpserts.length; i += batchSize) {
          const batch = fighterUpserts.slice(i, i + batchSize)
          await Promise.all(batch)
          // Small delay between batches to prevent overwhelming the connection pool
          if (i + batchSize < fighterUpserts.length) {
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }

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
        // Important: include eventId in validation to satisfy schema contracts
        const validatedFights = []
        for (const fight of event.fightCard) {
          const fightWithEvent = { ...fight, eventId: createdEvent.id }
          const validation = validateFightData(fightWithEvent)
          if (!validation.valid) {
            await this.log(`⚠️ Skipping invalid fight data: ${validation.errors.join(', ')}`,'warn')
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
        }, {
          timeout: 30000, // 30 second timeout for transaction
          maxWait: 5000,  // Max time to wait for connection
        })

        // Success - break out of retry loop
        return

      } catch (error) {
        const isRetryableError = error.message.includes('connection pool') ||
                                error.message.includes('timed out') ||
                                error.message.includes('ECONNRESET')

        if (attempt === maxRetries || !isRetryableError) {
          await this.log(`❌ Transaction failed for event ${event.name} after ${attempt} attempts: ${error.message}`, 'error')
          throw error
        }

        await this.log(`⚠️ Retrying transaction for event ${event.name} (attempt ${attempt}/${maxRetries}): ${error.message}`, 'warn')
        // Exponential backoff delay
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
      }
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
        // Use upsert to handle both new and existing fights safely
        // Process fights in batches to avoid connection pool exhaustion
        const batchSize = 5
        for (let i = 0; i < scraped.fightCard.length; i += batchSize) {
          const fightBatch = scraped.fightCard.slice(i, i + batchSize)
          const batchOps = fightBatch.map(fight => this.prisma.fight.upsert({
            where: { id: fight.id },
            update: {
              eventId: existing.id,
              fighter1Id: fight.fighter1Id,
              fighter2Id: fight.fighter2Id,
              weightClass: fight.weightClass,
              titleFight: fight.titleFight || false,
              mainEvent: fight.mainEvent || false,
              cardPosition: fight.cardPosition || 'preliminary',
              scheduledRounds: fight.scheduledRounds || 3,
              fightNumber: fight.fightNumber,
              // Preserve existing AI predictions during updates
              funFactor: fight.funFactor || undefined,
              finishProbability: fight.finishProbability || undefined,
              entertainmentReason: fight.entertainmentReason || undefined,
              keyFactors: fight.keyFactors !== undefined ? validateJsonField(fight.keyFactors, 'keyFactors') : undefined,
              fightPrediction: fight.fightPrediction || undefined,
              riskLevel: fight.riskLevel || undefined,
              predictedFunScore: fight.predictedFunScore || undefined,
              funFactors: fight.funFactors !== undefined ? validateJsonField(fight.funFactors, 'funFactors') : undefined,
              aiDescription: fight.aiDescription || undefined,
              updatedAt: new Date()
            },
            create: {
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
              keyFactors: validateJsonField(fight.keyFactors || [], 'keyFactors'),
              fightPrediction: fight.fightPrediction,
              riskLevel: fight.riskLevel,
              predictedFunScore: fight.predictedFunScore || 0,
              funFactors: validateJsonField(fight.funFactors || [], 'funFactors'),
              aiDescription: fight.aiDescription
            }
          }))

          // Execute batch operations
          await Promise.all(batchOps)

          // Small delay between batches to prevent overwhelming the connection pool
          if (i + batchSize < scraped.fightCard.length) {
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }

        await this.log(`✅ Processed ${scraped.fightCard.length} fights in batches`)
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
      .replace(/ufc\s*/i, '')                    // Remove "UFC"
      .replace(/fight\s*night\s*\d*/i, 'fn')     // Normalize "Fight Night ###" to "fn"
      .replace(/[:\-\.\,]/g, ' ')                // Convert punctuation to spaces
      .replace(/\s+/g, ' ')                      // Collapse multiple spaces
      .replace(/[^a-z0-9\s]/g, '')               // Remove remaining special chars
      .trim()
  }

  eventsAreSame(event1, event2) {
    // Extract UFC number from event names
    const extractUfcNumber = (name) => {
      const match = name.match(/ufc\s*(\d+)/i)
      return match ? match[1] : null
    }

    // Extract main fighters from event names
    const extractFighters = (name) => {
      // Look for "vs", "vs.", or "v." patterns in various formats
      let fighters = ''

      // Pattern 1: "UFC xxx: Fighter vs Fighter" or "UFC Fight Night: Fighter vs Fighter"
      let match = name.match(/(?:ufc|fight night)[^:]*:\s*(.+?\s+(?:vs?\.?|v\.)\s+.+?)(?:\s|$)/i)
      if (match) {
        fighters = match[1]
      } else {
        // Pattern 2: "UFC Fight Night ### - Fighter vs Fighter"
        match = name.match(/fight\s*night\s*\d*\s*[-–]\s*(.+?\s+(?:vs?\.?|v\.)\s+.+?)(?:\s|$)/i)
        if (match) {
          fighters = match[1]
        } else {
          // Pattern 3: Direct "Fighter vs Fighter" (fallback)
          match = name.match(/(.+?\s+(?:vs?\.?|v\.)\s+.+?)(?:\s|$)/i)
          if (match) {
            fighters = match[1]
          }
        }
      }

      return fighters.toLowerCase().replace(/[^a-z\s]/g, '').trim()
    }

    // Check if same date
    const date1 = typeof event1.date === 'string' ? event1.date : event1.date.toISOString().split('T')[0]
    const date2 = typeof event2.date === 'string' ? event2.date : event2.date.toISOString().split('T')[0]

    if (date1 === date2) {
      // Same date - check if same UFC number or similar names
      const ufc1 = extractUfcNumber(event1.name)
      const ufc2 = extractUfcNumber(event2.name)

      if (ufc1 && ufc2 && ufc1 === ufc2) {
        return true // Same UFC number on same date
      }

      // Check name similarity (normalized comparison)
      const norm1 = this.normalizeEventName(event1.name)
      const norm2 = this.normalizeEventName(event2.name)

      if (norm1 === norm2) {
        return true // Same normalized name on same date
      }

      // Check if one name contains the other (for Fight Night vs UFC variations)
      if (norm1.includes(norm2) || norm2.includes(norm1)) {
        return true
      }

      // Check if same main event fighters (for Fight Night variations)
      const fighters1 = extractFighters(event1.name)
      const fighters2 = extractFighters(event2.name)
      if (fighters1 && fighters2 && fighters1.length > 3 && fighters1 === fighters2) {
        return true // Same main event on same date
      }

      // Additional check for Fight Night events with different naming conventions
      const isFightNight1 = /fight\s*night/i.test(event1.name)
      const isFightNight2 = /fight\s*night/i.test(event2.name)

      if (isFightNight1 && isFightNight2 && fighters1 && fighters2) {
        // For Fight Night events, also check if fighters are similar (allow for typos)
        const similarity = this.calculateStringSimilarity(fighters1, fighters2)
        if (similarity > 0.8) {
          return true
        }
      }

      // Check for string similarity in normalized names (catch typos/variations)
      const nameSimilarity = this.calculateStringSimilarity(norm1, norm2)
      if (nameSimilarity > 0.9) {
        return true
      }
    }

    return false
  }

  // Helper function to calculate string similarity using Levenshtein distance
  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0
    if (str1 === str2) return 1

    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1

    if (longer.length === 0) return 1

    const editDistance = this.levenshteinDistance(longer, shorter)
    return (longer.length - editDistance) / longer.length
  }

  levenshteinDistance(str1, str2) {
    const matrix = []

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }

    return matrix[str2.length][str1.length]
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

  async ingestFromTapology(limit) {
    const result = {
      eventsProcessed: 0,
      fightsProcessed: 0,
      changesDetected: [],
      errors: [],
      executionTime: 0
    }

    try {
      await this.log(`Tapology ingest start (limit=${limit})`)
      const tapology = new TapologyUFCService()

      // Fetch current upcoming events from DB for matching
      const currentEvents = await this.prisma.event.findMany({
        include: { fights: { include: { fighter1: true, fighter2: true } } },
        where: { date: { gte: new Date() } },
        orderBy: { date: 'asc' }
      })

      const listings = await tapology.getUpcomingEvents(limit)
      await this.log(`Tapology returned ${listings.length} events`)

      // Ensure events are sorted by date
      listings.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

      const slugify = (v) => (v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^[-]+|[-]+$/g, '') || 'unknown'
      const fid = (n) => (n || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^[-]+|[-]+$/g, '')

      for (const listing of listings) {
        // Require a Tapology event URL to proceed
        if (!listing.tapologyUrl) {
          await this.log(`Skipping listing without tapologyUrl: ${listing.name}`, 'warn')
          continue
        }
        // Fetch fight details for listing
        const details = await tapology.getEventFights(listing.tapologyUrl)

        // Build scraped event object compatible with existing handlers
        // Prefer event name from event page title when available
        const effectiveName = (details.eventName && details.eventName.length > 5) ? details.eventName : listing.name
        // Prefer ID derived from Tapology URL slug (e.g., 129311-ufc-320 -> ufc-320)
        let eventId = slugify(effectiveName)
        try {
          const seg = (new URL(listing.tapologyUrl)).pathname.split('/').pop() || ''
          const num = seg.match(/^(\d+)/)?.[1]
          const namePart = seg.replace(/^\d+-/, '')
          // Compose id with numeric tapology id for uniqueness (e.g., ufc-fight-night-132921)
          if (namePart && num) eventId = `${slugify(namePart)}-${num}`
          else if (num) eventId = `tap-${num}`
          else if (listing.date) eventId = `${slugify(listing.name)}-${String(listing.date)}`
        } catch {}
        const fightCard = (details.fights || []).map((f, i) => ({
          id: `${eventId}-match-${i + 1}`,
          cardPosition: f.cardPosition || 'preliminary',
          fighter1Name: f.fighter1Name,
          fighter2Name: f.fighter2Name,
          weightClass: f.weightClass || 'Unknown',
          titleFight: f.titleFight || false,
          mainEvent: i === 0,
          scheduledRounds: f.scheduledRounds || 3,
          fightNumber: i + 1
        }))

        const scraped = {
          id: eventId,
          name: effectiveName,
          date: listing.date,
          location: listing.location || '',
          venue: listing.venue || '',
          status: 'upcoming',
          fightCard,
          tapologyUrl: listing.tapologyUrl
        }

        // Find existing event by name similarity and date proximity
        const existing = currentEvents.find(e =>
          (e.name.toLowerCase().includes(effectiveName.toLowerCase().substring(0, 10)) &&
           Math.abs(new Date(e.date) - new Date(listing.date)) < 7 * 24 * 60 * 60 * 1000)
        )

        if (existing) {
          // Update existing event
          await this.log(`Updating existing event: ${existing.name}`)

          // Update event fields if changed
          const updates = {}
          if (existing.name !== effectiveName) updates.name = effectiveName
          if (existing.location !== (listing.location || '')) updates.location = listing.location || ''
          if (existing.venue !== (listing.venue || '')) updates.venue = listing.venue || ''
          // Note: tapologyUrl not stored in database schema

          if (Object.keys(updates).length > 0) {
            await this.prisma.event.update({
              where: { id: existing.id },
              data: updates
            })
            result.changesDetected.push({
              type: 'event_updated',
              eventName: existing.name,
              changes: Object.keys(updates)
            })
          }

          // Process fights for existing event
          for (const scrapedFight of fightCard) {
            const existingFight = existing.fights.find(f =>
              f.fighter1.name === scrapedFight.fighter1Name &&
              f.fighter2.name === scrapedFight.fighter2Name
            )

            if (!existingFight) {
              // Create new fight
              await this.log(`Creating new fight: ${scrapedFight.fighter1Name} vs ${scrapedFight.fighter2Name}`)

              // Create fighters if they don't exist
              // Debug: Check what we're getting from scraper
              console.log('🐛 Debug fighter data:', {
                fighter1Name: scrapedFight.fighter1Name,
                fighter1Nickname: scrapedFight.fighter1Nickname,
                fighter2Name: scrapedFight.fighter2Name,
                fighter2Nickname: scrapedFight.fighter2Nickname
              })

              let fighter1 = await this.prisma.fighter.findFirst({
                where: { name: scrapedFight.fighter1Name }
              })
              if (!fighter1) {
                fighter1 = await this.prisma.fighter.create({
                  data: {
                    name: scrapedFight.fighter1Name,
                    nickname: scrapedFight.fighter1Nickname || null,
                    weightClass: scrapedFight.weightClass || 'unknown'
                  }
                })
              } else if (scrapedFight.fighter1Nickname && !fighter1.nickname) {
                // Update nickname if we didn't have it before
                await this.prisma.fighter.update({
                  where: { id: fighter1.id },
                  data: { nickname: scrapedFight.fighter1Nickname }
                })
              }

              let fighter2 = await this.prisma.fighter.findFirst({
                where: { name: scrapedFight.fighter2Name }
              })
              if (!fighter2) {
                fighter2 = await this.prisma.fighter.create({
                  data: {
                    name: scrapedFight.fighter2Name,
                    nickname: scrapedFight.fighter2Nickname || null,
                    weightClass: scrapedFight.weightClass || 'unknown'
                  }
                })
              } else if (scrapedFight.fighter2Nickname && !fighter2.nickname) {
                // Update nickname if we didn't have it before
                await this.prisma.fighter.update({
                  where: { id: fighter2.id },
                  data: { nickname: scrapedFight.fighter2Nickname }
                })
              }

              await this.prisma.fight.create({
                data: {
                  eventId: existing.id,
                  fighter1Id: fighter1.id,
                  fighter2Id: fighter2.id,
                  weightClass: scrapedFight.weightClass,
                  cardPosition: scrapedFight.cardPosition,
                  titleFight: scrapedFight.titleFight,
                  mainEvent: scrapedFight.mainEvent,
                  scheduledRounds: scrapedFight.scheduledRounds,
                  fightNumber: scrapedFight.fightNumber
                }
              })

              result.fightsProcessed++
              result.changesDetected.push({
                type: 'fight_created',
                eventName: existing.name,
                fightName: `${scrapedFight.fighter1Name} vs ${scrapedFight.fighter2Name}`
              })
            }
          }
        } else {
          // Create new event
          await this.log(`Creating new event: ${effectiveName}`)

          const newEvent = await this.prisma.event.create({
            data: {
              id: eventId,
              name: effectiveName,
              date: new Date(listing.date),
              location: listing.location || 'TBA',
              venue: listing.venue || 'TBA',
              completed: false
            }
          })

          // Create fights for new event
          for (const scrapedFight of fightCard) {
            // Create fighters if they don't exist
            let fighter1 = await this.prisma.fighter.findFirst({
              where: { name: scrapedFight.fighter1Name }
            })
            if (!fighter1) {
              fighter1 = await this.prisma.fighter.create({
                data: {
                  name: scrapedFight.fighter1Name,
                  nickname: scrapedFight.fighter1Nickname || null,
                  weightClass: scrapedFight.weightClass || 'unknown'
                }
              })
            } else if (scrapedFight.fighter1Nickname && !fighter1.nickname) {
              // Update nickname if we didn't have it before
              await this.prisma.fighter.update({
                where: { id: fighter1.id },
                data: { nickname: scrapedFight.fighter1Nickname }
              })
            }

            let fighter2 = await this.prisma.fighter.findFirst({
              where: { name: scrapedFight.fighter2Name }
            })
            if (!fighter2) {
              fighter2 = await this.prisma.fighter.create({
                data: {
                  name: scrapedFight.fighter2Name,
                  nickname: scrapedFight.fighter2Nickname || null,
                  weightClass: scrapedFight.weightClass || 'unknown'
                }
              })
            } else if (scrapedFight.fighter2Nickname && !fighter2.nickname) {
              // Update nickname if we didn't have it before
              await this.prisma.fighter.update({
                where: { id: fighter2.id },
                data: { nickname: scrapedFight.fighter2Nickname }
              })
            }

            await this.prisma.fight.create({
              data: {
                eventId: newEvent.id,
                fighter1Id: fighter1.id,
                fighter2Id: fighter2.id,
                weightClass: scrapedFight.weightClass,
                cardPosition: scrapedFight.cardPosition,
                titleFight: scrapedFight.titleFight,
                mainEvent: scrapedFight.mainEvent,
                scheduledRounds: scrapedFight.scheduledRounds,
                fightNumber: scrapedFight.fightNumber
              }
            })

            result.fightsProcessed++
          }

          result.eventsProcessed++
          result.changesDetected.push({
            type: 'event_created',
            eventName: effectiveName
          })
        }
      }

      await this.log(`Tapology ingest completed: ${result.eventsProcessed} events, ${result.fightsProcessed} fights`)
      return result

    } catch (error) {
      await this.log(`Tapology ingest failed: ${error.message}`, 'error')
      result.errors.push(error.message)
      return result
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
          if ((process.env.SCRAPER_SOURCE || 'tapology').toLowerCase() === 'tapology') {
            const limitArg = Number(process.env.SCRAPER_LIMIT || 3)
            const limit = Number.isFinite(limitArg) && limitArg > 0 ? Math.floor(limitArg) : 3
            const result = await scraper.ingestFromTapology(limit)
            console.log('\nTapology Ingest Results:')
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
                if (change.fightName) console.log(`  Fight: ${change.fightName}`)
              })
            }
          } else {
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
