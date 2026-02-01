/**
 * Internal API endpoint for ingesting scraped UFC data
 *
 * This endpoint receives data from the Python scraper and upserts it to the database.
 *
 * Security:
 * - Requires Bearer token authentication
 * - Only accessible from internal services (scraper)
 */

import { type NextRequest, NextResponse } from 'next/server'

import * as crypto from 'crypto'

import { ApiError, Errors, errorResponse, successResponse } from '@/lib/api'
import { getRequestId } from '@/lib/api/middleware'
import prisma from '@/lib/database/prisma'
import { apiLogger } from '@/lib/monitoring/logger'
import { ScrapedDataSchema, validateScrapedData, type ScrapedData } from '@/lib/scraper/validation'

/**
 * POST /api/internal/ingest
 *
 * Ingest scraped data from the Python scraper
 */
export async function POST(req: NextRequest) {
  const requestId = getRequestId(req)

  try {
    // 1. Authenticate request with timing-safe comparison
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    const expectedToken = process.env.INGEST_API_SECRET || ''

    // Use timing-safe comparison to prevent timing attacks
    const tokenBuffer = Buffer.from(token || '')
    const expectedBuffer = Buffer.from(expectedToken)
    const tokensMatch = tokenBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(tokenBuffer, expectedBuffer)

    if (!token || !expectedToken || !tokensMatch) {
      throw Errors.unauthorized('Invalid or missing authentication token')
    }

    // 2. Parse and validate request body
    const body = await req.json()
    const errors = validateScrapedData(body)

    if (errors.length > 0) {
      throw Errors.validation('Request validation failed', { errors })
    }

    const data = ScrapedDataSchema.parse(body)

    // 3. Upsert data in transaction
    const scrapeLog = await upsertScrapedData(data, requestId)

    apiLogger.info('Scraper data ingested successfully', {
      requestId,
      scrapeLogId: scrapeLog.id,
      eventsCount: data.events.length,
      fightsCount: data.fights.length,
    })

    // 4. Return success response
    return successResponse({
      scrapeLogId: scrapeLog.id,
      eventsCreated: data.events.length,
      fightsCreated: data.fights.length,
      fightsCancelled: scrapeLog.fightsCancelled,
      fightersCreated: data.fighters.length,
    }, requestId)

  } catch (error) {
    // Log error with context
    if (error instanceof ApiError) {
      apiLogger.warn('Ingestion failed', { requestId, code: error.code, message: error.message })
    } else {
      apiLogger.error('Unexpected ingestion error', { requestId, error: String(error) })
    }

    return errorResponse(error)
  }
}

/**
 * Upsert scraped data to database in a transaction
 */
async function upsertScrapedData(data: ScrapedData, requestId: string) {
  const startTime = new Date()
  let fightsAdded = 0
  let fightsUpdated = 0
  let fightsCancelled = 0
  let fightersAdded = 0

  try {
    await prisma.$transaction(async (tx) => {
      // Upsert fighters
      for (const fighter of data.fighters) {
        const contentHash = calculateContentHash(fighter)

        // Check if fighter exists
        const existing = await tx.fighter.findUnique({
          where: { sourceUrl: fighter.sourceUrl },
        })

        if (!existing) {
          // Create new fighter with all stats
          await tx.fighter.create({
            data: {
              name: fighter.name,
              record: fighter.record,
              wins: fighter.wins ?? 0,
              losses: fighter.losses ?? 0,
              draws: fighter.draws ?? 0,
              weightClass: fighter.weightClass ?? 'Unknown',
              imageUrl: fighter.imageUrl,
              sourceUrl: fighter.sourceUrl,
              lastScrapedAt: new Date(),
              contentHash,

              // Physical attributes
              height: fighter.height,
              weightLbs: fighter.weightLbs,
              reach: fighter.reach,
              reachInches: fighter.reachInches,
              stance: fighter.stance,
              dob: fighter.dob,

              // Striking statistics
              significantStrikesLandedPerMinute: fighter.significantStrikesLandedPerMinute ?? 0,
              strikingAccuracyPercentage: fighter.strikingAccuracyPercentage ?? 0,
              significantStrikesAbsorbedPerMinute: fighter.significantStrikesAbsorbedPerMinute ?? 0,
              strikingDefensePercentage: fighter.strikingDefensePercentage ?? 0,

              // Grappling statistics
              takedownAverage: fighter.takedownAverage ?? 0,
              takedownAccuracyPercentage: fighter.takedownAccuracyPercentage ?? 0,
              takedownDefensePercentage: fighter.takedownDefensePercentage ?? 0,
              submissionAverage: fighter.submissionAverage ?? 0,

              // Win methods & averages
              averageFightTimeSeconds: fighter.averageFightTimeSeconds ?? 0,
              winsByKO: fighter.winsByKO ?? 0,
              winsBySubmission: fighter.winsBySubmission ?? 0,
              winsByDecision: fighter.winsByDecision ?? 0,

              // Loss methods
              lossesByKO: fighter.lossesByKO ?? 0,
              lossesBySubmission: fighter.lossesBySubmission ?? 0,
              lossesByDecision: fighter.lossesByDecision ?? 0,

              // Calculated statistics
              finishRate: fighter.finishRate ?? 0,
              koPercentage: fighter.koPercentage ?? 0,
              submissionPercentage: fighter.submissionPercentage ?? 0,

              // Calculated loss statistics
              lossFinishRate: fighter.lossFinishRate ?? 0,
              koLossPercentage: fighter.koLossPercentage ?? 0,
              submissionLossPercentage: fighter.submissionLossPercentage ?? 0,
            },
          })
          fightersAdded++
        } else if (existing.contentHash !== contentHash) {
          // Update existing fighter with new stats
          await tx.fighter.update({
            where: { sourceUrl: fighter.sourceUrl },
            data: {
              name: fighter.name,
              record: fighter.record,
              wins: fighter.wins ?? existing.wins,
              losses: fighter.losses ?? existing.losses,
              draws: fighter.draws ?? existing.draws,
              imageUrl: fighter.imageUrl ?? existing.imageUrl,
              lastScrapedAt: new Date(),
              contentHash,

              // Physical attributes
              height: fighter.height ?? existing.height,
              weightLbs: fighter.weightLbs ?? existing.weightLbs,
              reach: fighter.reach ?? existing.reach,
              reachInches: fighter.reachInches ?? existing.reachInches,
              stance: fighter.stance ?? existing.stance,
              dob: fighter.dob ?? existing.dob,

              // Striking statistics
              significantStrikesLandedPerMinute: fighter.significantStrikesLandedPerMinute ?? existing.significantStrikesLandedPerMinute,
              strikingAccuracyPercentage: fighter.strikingAccuracyPercentage ?? existing.strikingAccuracyPercentage,
              significantStrikesAbsorbedPerMinute: fighter.significantStrikesAbsorbedPerMinute ?? existing.significantStrikesAbsorbedPerMinute,
              strikingDefensePercentage: fighter.strikingDefensePercentage ?? existing.strikingDefensePercentage,

              // Grappling statistics
              takedownAverage: fighter.takedownAverage ?? existing.takedownAverage,
              takedownAccuracyPercentage: fighter.takedownAccuracyPercentage ?? existing.takedownAccuracyPercentage,
              takedownDefensePercentage: fighter.takedownDefensePercentage ?? existing.takedownDefensePercentage,
              submissionAverage: fighter.submissionAverage ?? existing.submissionAverage,

              // Win methods & averages
              averageFightTimeSeconds: fighter.averageFightTimeSeconds ?? existing.averageFightTimeSeconds,
              winsByKO: fighter.winsByKO ?? existing.winsByKO,
              winsBySubmission: fighter.winsBySubmission ?? existing.winsBySubmission,
              winsByDecision: fighter.winsByDecision ?? existing.winsByDecision,

              // Loss methods
              lossesByKO: fighter.lossesByKO ?? existing.lossesByKO,
              lossesBySubmission: fighter.lossesBySubmission ?? existing.lossesBySubmission,
              lossesByDecision: fighter.lossesByDecision ?? existing.lossesByDecision,

              // Calculated statistics
              finishRate: fighter.finishRate ?? existing.finishRate,
              koPercentage: fighter.koPercentage ?? existing.koPercentage,
              submissionPercentage: fighter.submissionPercentage ?? existing.submissionPercentage,

              // Calculated loss statistics
              lossFinishRate: fighter.lossFinishRate ?? existing.lossFinishRate,
              koLossPercentage: fighter.koLossPercentage ?? existing.koLossPercentage,
              submissionLossPercentage: fighter.submissionLossPercentage ?? existing.submissionLossPercentage,
            },
          })
        }
      }

      // Upsert events
      for (const event of data.events) {
        const contentHash = calculateContentHash(event)

        const existing = await tx.event.findUnique({
          where: { sourceUrl: event.sourceUrl },
        })

        if (!existing) {
          // Create new event
          await tx.event.create({
            data: {
              name: event.name,
              date: new Date(event.date),
              venue: event.venue ?? 'TBA',
              location: event.location ?? 'TBA',
              completed: event.completed ?? false,
              cancelled: event.cancelled ?? false,
              sourceUrl: event.sourceUrl,
              lastScrapedAt: new Date(),
              contentHash,
            },
          })
        } else if (existing.contentHash !== contentHash) {
          // Update existing event
          await tx.event.update({
            where: { sourceUrl: event.sourceUrl },
            data: {
              name: event.name,
              date: new Date(event.date),
              venue: event.venue ?? existing.venue,
              location: event.location ?? existing.location,
              completed: event.completed ?? existing.completed,
              cancelled: event.cancelled ?? existing.cancelled,
              lastScrapedAt: new Date(),
              contentHash,
            },
          })
        }
      }

      // ========================================================
      // BATCH FETCH: Pre-load all fighters and events for O(1) lookups
      // This eliminates N+1 queries in the fight upsert loop
      // ========================================================

      // Build scraped ID -> sourceUrl lookup maps
      const scrapedFighterIdToSourceUrl = new Map(
        data.fighters.map((f) => [f.id, f.sourceUrl])
      )
      const scrapedEventIdToSourceUrl = new Map(
        data.events.map((e) => [e.id, e.sourceUrl])
      )

      // Batch fetch all fighters that were just upserted
      const fighterSourceUrls = data.fighters.map((f) => f.sourceUrl)
      const allFighters = await tx.fighter.findMany({
        where: { sourceUrl: { in: fighterSourceUrls } },
        select: { id: true, sourceUrl: true }
      })
      const fighterBySourceUrl = new Map(
        allFighters.map((f) => [f.sourceUrl, f])
      )

      // Batch fetch all events that were just upserted
      const eventSourceUrls = data.events.map((e) => e.sourceUrl)
      const allEvents = await tx.event.findMany({
        where: { sourceUrl: { in: eventSourceUrls } },
        select: { id: true, sourceUrl: true }
      })
      const eventBySourceUrl = new Map(
        allEvents.map((e) => [e.sourceUrl, e])
      )

      // ========================================================
      // Upsert fights (using lookup maps instead of N+1 queries)
      // ========================================================
      for (const fight of data.fights) {
        const contentHash = calculateContentHash(fight)

        // O(1) map lookups instead of database queries
        const fighter1SourceUrl = scrapedFighterIdToSourceUrl.get(fight.fighter1Id)
        const fighter2SourceUrl = scrapedFighterIdToSourceUrl.get(fight.fighter2Id)
        const eventSourceUrl = scrapedEventIdToSourceUrl.get(fight.eventId)

        const fighter1 = fighter1SourceUrl ? fighterBySourceUrl.get(fighter1SourceUrl) : null
        const fighter2 = fighter2SourceUrl ? fighterBySourceUrl.get(fighter2SourceUrl) : null
        const event = eventSourceUrl ? eventBySourceUrl.get(eventSourceUrl) : null

        if (!fighter1 || !fighter2 || !event) {
          apiLogger.warn('Skipping fight - missing related records', {
            requestId,
            fightId: fight.id,
            hasFighter1: !!fighter1,
            hasFighter2: !!fighter2,
            hasEvent: !!event,
          })
          continue
        }

        // Normalize fighter order (alphabetically by ID) to prevent reversed duplicates
        const [normalizedFighter1Id, normalizedFighter2Id] =
          [fighter1.id, fighter2.id].sort()

        // Use composite unique key to find existing fight
        let existing = await tx.fight.findUnique({
          where: {
            eventId_fighter1Id_fighter2Id: {
              eventId: event.id,
              fighter1Id: normalizedFighter1Id,
              fighter2Id: normalizedFighter2Id,
            },
          },
        })

        // Fallback 1: Check REVERSED order
        if (!existing) {
          existing = await tx.fight.findUnique({
            where: {
              eventId_fighter1Id_fighter2Id: {
                eventId: event.id,
                fighter1Id: normalizedFighter2Id,
                fighter2Id: normalizedFighter1Id,
              },
            },
          })
        }

        // Fallback 2: Check by sourceUrl
        if (!existing && fight.sourceUrl) {
          existing = await tx.fight.findUnique({
            where: { sourceUrl: fight.sourceUrl },
          })
        }

        // Resolve winnerId
        let normalizedWinnerId: string | null = null
        if (fight.winnerId) {
          if (fight.winnerId === fight.fighter1Id) {
            normalizedWinnerId = fighter1.id
          } else if (fight.winnerId === fight.fighter2Id) {
            normalizedWinnerId = fighter2.id
          }
        }

        if (!existing) {
          // Create new fight
          await tx.fight.create({
            data: {
              fighter1Id: normalizedFighter1Id,
              fighter2Id: normalizedFighter2Id,
              eventId: event.id,
              weightClass: fight.weightClass ?? 'Unknown',
              titleFight: fight.titleFight ?? false,
              mainEvent: fight.mainEvent ?? false,
              cardPosition: fight.cardPosition ?? 'preliminary',
              scheduledRounds: fight.scheduledRounds ?? 3,
              completed: fight.completed ?? false,
              isCancelled: false,
              winnerId: normalizedWinnerId,
              method: fight.method,
              round: fight.round,
              time: fight.time,
              sourceUrl: fight.sourceUrl,
              lastScrapedAt: new Date(),
              contentHash,
            },
          })
          fightsAdded++
        } else if (existing.contentHash !== contentHash) {
          // Update existing fight
          await tx.fight.update({
            where: { id: existing.id },
            data: {
              weightClass: fight.weightClass ?? existing.weightClass,
              titleFight: fight.titleFight ?? existing.titleFight,
              mainEvent: fight.mainEvent ?? existing.mainEvent,
              cardPosition: fight.cardPosition ?? existing.cardPosition,
              scheduledRounds: fight.scheduledRounds ?? existing.scheduledRounds,
              completed: fight.completed ?? existing.completed,
              isCancelled: false,
              winnerId: normalizedWinnerId ?? existing.winnerId,
              method: fight.method ?? existing.method,
              round: fight.round ?? existing.round,
              time: fight.time ?? existing.time,
              lastScrapedAt: new Date(),
              contentHash,
            },
          })
          fightsUpdated++
        }
      }

      // SCOPED RECONCILIATION: Mark cancelled fights
      const scrapedEventUrls = data.scrapedEventUrls || []

      if (scrapedEventUrls.length > 0) {
        apiLogger.info('Reconciling fights for scraped events', {
          requestId,
          eventCount: scrapedEventUrls.length,
        })

        for (const eventUrl of scrapedEventUrls) {
          const event = await tx.event.findUnique({
            where: { sourceUrl: eventUrl },
          })

          if (!event) {
            apiLogger.warn('Event not found for URL during reconciliation', { requestId, eventUrl })
            continue
          }

          // Build set of scraped fight keys
          const scrapedFightKeys = new Set<string>()

          for (const fight of data.fights) {
            const fightEvent = data.events.find((e: { id: string; sourceUrl: string }) => e.id === fight.eventId)
            if (!fightEvent || fightEvent.sourceUrl !== eventUrl) continue

            const f1SourceUrl = data.fighters.find((f: { id: string; sourceUrl: string }) => f.id === fight.fighter1Id)?.sourceUrl
            const f2SourceUrl = data.fighters.find((f: { id: string; sourceUrl: string }) => f.id === fight.fighter2Id)?.sourceUrl

            if (!f1SourceUrl || !f2SourceUrl) continue

            const f1 = await tx.fighter.findUnique({ where: { sourceUrl: f1SourceUrl } })
            const f2 = await tx.fighter.findUnique({ where: { sourceUrl: f2SourceUrl } })

            if (!f1 || !f2) continue

            const [nf1, nf2] = [f1.id, f2.id].sort()
            scrapedFightKeys.add(`${event.id}:${nf1}:${nf2}`)
          }

          // Find and mark cancelled fights
          const dbFights = await tx.fight.findMany({
            where: {
              eventId: event.id,
              completed: false,
              isCancelled: false,
            },
            select: { id: true, eventId: true, fighter1Id: true, fighter2Id: true },
          })

          for (const dbFight of dbFights) {
            const [nf1, nf2] = [dbFight.fighter1Id, dbFight.fighter2Id].sort()
            const dbKey = `${dbFight.eventId}:${nf1}:${nf2}`

            if (!scrapedFightKeys.has(dbKey)) {
              await tx.fight.update({
                where: { id: dbFight.id },
                data: { isCancelled: true, lastScrapedAt: new Date() },
              })
              fightsCancelled++
            }
          }
        }

        apiLogger.info('Reconciliation complete', { requestId, fightsCancelled })
      }
    })

    // Create scrape log
    const endTime = new Date()
    const scrapeLog = await prisma.scrapeLog.create({
      data: {
        startTime,
        endTime,
        status: 'SUCCESS',
        eventsFound: data.events.length,
        fightsAdded,
        fightsUpdated,
        fightsCancelled,
        fightersAdded,
      },
    })

    return scrapeLog

  } catch (error) {
    // Log failure
    const endTime = new Date()
    await prisma.scrapeLog.create({
      data: {
        startTime,
        endTime,
        status: 'FAILURE',
        eventsFound: data.events.length,
        fightsAdded,
        fightsUpdated,
        fightsCancelled,
        fightersAdded,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
    })

    throw error
  }
}

/**
 * Calculate SHA256 hash of data for change detection
 */
function calculateContentHash(data: Record<string, unknown>): string {
  // Sort keys for consistent hashing
  const content = JSON.stringify(data, Object.keys(data).sort())
  return crypto.createHash('sha256').update(content).digest('hex')
}
