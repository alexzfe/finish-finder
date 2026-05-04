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
import { calculateContentHash } from '@/lib/scraper/contentHash'
import {
  type DbRef,
  type ExistingFight,
  planFightReconciliation,
} from '@/lib/scraper/fightReconciler'
import { ScrapedDataSchema, type ScrapedData } from '@/lib/scraper/validation'

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
    const result = ScrapedDataSchema.safeParse(body)

    if (!result.success) {
      const errors = result.error.errors.map((err) => `${err.path.join('.')}: ${err.message}`)
      throw Errors.validation('Request validation failed', { errors })
    }

    const data = result.data

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
      // BATCH FETCH: Pre-load just-upserted fighters and events, plus all
      // existing fights for the events in scope, so the planner has everything
      // it needs without further IO.
      // ========================================================

      const fighterSourceUrls = data.fighters.map((f) => f.sourceUrl)
      const allFighters = await tx.fighter.findMany({
        where: { sourceUrl: { in: fighterSourceUrls } },
        select: { id: true, sourceUrl: true },
      })
      const fighterBySourceUrl = new Map<string, DbRef>()
      for (const f of allFighters) {
        // The findMany filter guarantees non-null sourceUrl, but Prisma's
        // generated type widens to `string | null`; narrow it here.
        if (f.sourceUrl) fighterBySourceUrl.set(f.sourceUrl, { id: f.id, sourceUrl: f.sourceUrl })
      }

      const eventSourceUrls = data.events.map((e) => e.sourceUrl)
      const allEvents = await tx.event.findMany({
        where: { sourceUrl: { in: eventSourceUrls } },
        select: { id: true, sourceUrl: true },
      })
      const eventBySourceUrl = new Map<string, DbRef>()
      for (const e of allEvents) {
        if (e.sourceUrl) eventBySourceUrl.set(e.sourceUrl, { id: e.id, sourceUrl: e.sourceUrl })
      }

      const allEventIds = allEvents.map((e) => e.id)
      const existingFights = allEventIds.length > 0
        ? await tx.fight.findMany({
            where: { eventId: { in: allEventIds } },
            select: {
              id: true,
              eventId: true,
              fighter1Id: true,
              fighter2Id: true,
              sourceUrl: true,
              contentHash: true,
              completed: true,
              isCancelled: true,
            },
          })
        : []

      const existingFightsByEventId = new Map<string, ExistingFight[]>()
      for (const ef of existingFights) {
        const list = existingFightsByEventId.get(ef.eventId) ?? []
        list.push(ef)
        existingFightsByEventId.set(ef.eventId, list)
      }

      // ========================================================
      // Plan + apply fight reconciliation
      // ========================================================
      const plan = planFightReconciliation({
        scrapedFights: data.fights,
        scrapedFighters: data.fighters,
        scrapedEvents: data.events,
        fighterBySourceUrl,
        eventBySourceUrl,
        existingFightsByEventId,
        scrapedEventUrls: data.scrapedEventUrls ?? [],
      })

      const now = new Date()

      for (const create of plan.toCreate) {
        await tx.fight.create({
          data: { ...create.data, lastScrapedAt: now },
        })
        fightsAdded++
      }

      for (const update of plan.toUpdate) {
        await tx.fight.update({
          where: { id: update.existingId },
          data: { ...update.data, lastScrapedAt: now },
        })
        fightsUpdated++
      }

      for (const cancel of plan.toCancel) {
        await tx.fight.update({
          where: { id: cancel.existingId },
          data: { isCancelled: true, lastScrapedAt: now },
        })
        fightsCancelled++
      }

      for (const skipped of plan.skipped) {
        apiLogger.warn('Skipping fight - missing related records', {
          requestId,
          fightId: skipped.scrapedFightId,
          reason: skipped.reason,
        })
      }

      if (plan.reversedOrderHits > 0) {
        // Legacy compatibility signal — once this stays at 0 across enough
        // ingest runs, the reversed-order fallback can be deleted.
        apiLogger.info('Matched fights in reversed fighter order (legacy compat)', {
          requestId,
          hits: plan.reversedOrderHits,
        })
      }

      if ((data.scrapedEventUrls ?? []).length > 0) {
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
