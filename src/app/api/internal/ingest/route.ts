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
import { ScrapedDataSchema, validateScrapedData } from '@/lib/scraper/validation'
import * as crypto from 'crypto'

/**
 * POST /api/internal/ingest
 *
 * Ingest scraped data from the Python scraper
 */
export async function POST(req: NextRequest) {
  // 1. Authenticate request
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token || token !== process.env.INGEST_API_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    // 2. Diagnostic logging
    console.log('Inspecting prisma object. Keys:', Object.keys(prisma || {}))

    // 3. Parse and validate request body
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
    console.error('Ingestion error:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * Upsert scraped data to database in a transaction
 */
async function upsertScrapedData(data: any) {
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

      // Upsert fights
      for (const fight of data.fights) {
        const contentHash = calculateContentHash(fight)

        // Find fighter IDs by sourceUrl
        const fighter1 = await tx.fighter.findUnique({
          where: { sourceUrl: data.fighters.find((f: any) => f.id === fight.fighter1Id)?.sourceUrl },
        })
        const fighter2 = await tx.fighter.findUnique({
          where: { sourceUrl: data.fighters.find((f: any) => f.id === fight.fighter2Id)?.sourceUrl },
        })
        const event = await tx.event.findUnique({
          where: { sourceUrl: data.events.find((e: any) => e.id === fight.eventId)?.sourceUrl },
        })

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
              scheduledRounds: fight.scheduledRounds ?? 3,
              // Fight outcome fields (for completed events)
              completed: fight.completed ?? false,
              winnerId: fight.winnerId,  // Can be null for NC/Draw/upcoming
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
          // Update existing fight (including outcome data when fight completes)
          await tx.fight.update({
            where: { sourceUrl: fight.sourceUrl },
            data: {
              weightClass: fight.weightClass ?? existing.weightClass,
              titleFight: fight.titleFight ?? existing.titleFight,
              mainEvent: fight.mainEvent ?? existing.mainEvent,
              cardPosition: fight.cardPosition ?? existing.cardPosition,
              scheduledRounds: fight.scheduledRounds ?? existing.scheduledRounds,
              // Update outcome when fight completes
              completed: fight.completed ?? existing.completed,
              winnerId: fight.winnerId ?? existing.winnerId,
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
 *
 * IMPORTANT: This function hashes ALL fields in the data object,
 * including outcome fields (completed, winnerId, method, round, time).
 * When a fight completes, these fields change, causing the hash to change,
 * which triggers a database update. This is critical for outcome tracking!
 */
function calculateContentHash(data: any): string {
  // Sort keys for consistent hashing
  const content = JSON.stringify(data, Object.keys(data).sort())
  return crypto.createHash('sha256').update(content).digest('hex')
}
