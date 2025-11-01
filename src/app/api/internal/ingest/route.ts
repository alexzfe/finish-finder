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
import { prisma } from '@/lib/database/prisma'
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

    // 3. Upsert data in transaction
    const scrapeLog = await upsertScrapedData(data)

    // 4. Return success response
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
          // Create new fighter
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
            },
          })
          fightersAdded++
        } else if (existing.contentHash !== contentHash) {
          // Update existing fighter
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
