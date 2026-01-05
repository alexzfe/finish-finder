/**
 * Internal API endpoint for ingesting scraped UFC data
 *
 * This endpoint receives data from the Python scraper and upserts it to the database.
 *
 * Security:
 * - Requires Bearer token authentication
 * - Only accessible from internal services (scraper)
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/database/prisma'
import { ScrapedDataSchema, validateScrapedData, type ScrapedData } from '@/lib/scraper/validation'
import * as crypto from 'crypto'

/**
 * POST /api/internal/ingest
 *
 * Ingest scraped data from the Python scraper
 */
export async function POST(req: NextRequest) {
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
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    // 2. Parse and validate request body
    const body = await req.json()
    const errors = validateScrapedData(body)

    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          errors,
        },
        { status: 400 }
      )
    }

    const data = ScrapedDataSchema.parse(body)

    // 4. Upsert data in transaction
    const scrapeLog = await upsertScrapedData(data)

    // 5. Return success response
    return NextResponse.json({
      success: true,
      scrapeLogId: scrapeLog.id,
      eventsCreated: data.events.length,
      fightsCreated: data.fights.length,
      fightersCreated: data.fighters.length,
    })
  } catch (error) {
    // Log detailed error for debugging (captured by Sentry)
    console.error('Ingestion error:', error)

    // Return generic error to client without exposing internal details
    return NextResponse.json(
      {
        error: 'Internal server error',
        requestId: crypto.randomUUID(),
      },
      { status: 500 }
    )
  }
}

/**
 * Upsert scraped data to database in a transaction
 */
async function upsertScrapedData(data: ScrapedData) {
  const startTime = new Date()
  let fightsAdded = 0
  let fightsUpdated = 0
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

              // Calculated statistics
              finishRate: fighter.finishRate ?? 0,
              koPercentage: fighter.koPercentage ?? 0,
              submissionPercentage: fighter.submissionPercentage ?? 0,
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

              // Calculated statistics
              finishRate: fighter.finishRate ?? existing.finishRate,
              koPercentage: fighter.koPercentage ?? existing.koPercentage,
              submissionPercentage: fighter.submissionPercentage ?? existing.submissionPercentage,
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
          console.warn(`Skipping fight ${fight.id}: missing related records`)
          continue
        }

        const existing = await tx.fight.findUnique({
          where: { sourceUrl: fight.sourceUrl },
        })

        if (!existing) {
          // Create new fight
          await tx.fight.create({
            data: {
              fighter1Id: fighter1.id,
              fighter2Id: fighter2.id,
              eventId: event.id,
              weightClass: fight.weightClass ?? 'Unknown',
              titleFight: fight.titleFight ?? false,
              mainEvent: fight.mainEvent ?? false,
              cardPosition: fight.cardPosition ?? 'preliminary',
              sourceUrl: fight.sourceUrl,
              lastScrapedAt: new Date(),
              contentHash,
            },
          })
          fightsAdded++
        } else if (existing.contentHash !== contentHash) {
          // Update existing fight
          await tx.fight.update({
            where: { sourceUrl: fight.sourceUrl },
            data: {
              weightClass: fight.weightClass ?? existing.weightClass,
              titleFight: fight.titleFight ?? existing.titleFight,
              mainEvent: fight.mainEvent ?? existing.mainEvent,
              cardPosition: fight.cardPosition ?? existing.cardPosition,
              lastScrapedAt: new Date(),
              contentHash,
            },
          })
          fightsUpdated++
        }
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
        fightersAdded,
      },
    })

    return scrapeLog
  } catch (error) {
    // Log failure
    const endTime = new Date()
    const scrapeLog = await prisma.scrapeLog.create({
      data: {
        startTime,
        endTime,
        status: 'FAILURE',
        eventsFound: data.events.length,
        fightsAdded,
        fightsUpdated,
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
function calculateContentHash(data: any): string {
  // Sort keys for consistent hashing
  const content = JSON.stringify(data, Object.keys(data).sort())
  return crypto.createHash('sha256').update(content).digest('hex')
}
