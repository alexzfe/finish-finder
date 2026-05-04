/**
 * Internal API endpoint for ingesting scraped UFC data
 *
 * This endpoint receives data from the Python scraper and upserts it to the database.
 *
 * Security:
 * - Requires Bearer token authentication
 * - Only accessible from internal services (scraper)
 */

import { type NextRequest } from 'next/server'

import * as crypto from 'crypto'

import { ApiError, Errors, errorResponse, successResponse } from '@/lib/api'
import { getRequestId } from '@/lib/api/middleware'
import { EventStore } from '@/lib/database/eventStore'
import { FighterStore } from '@/lib/database/fighterStore'
import { FightStore } from '@/lib/database/fightStore'
import prisma from '@/lib/database/prisma'
import { apiLogger } from '@/lib/monitoring/logger'
import { planFightReconciliation } from '@/lib/scraper/fightReconciler'
import { ScrapedDataSchema, type ScrapedData } from '@/lib/scraper/validation'

const fighterStore = new FighterStore(prisma)
const eventStore = new EventStore(prisma)
const fightStore = new FightStore(prisma)

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
    const scrapeLog = await ingestScrapedData(data, requestId)

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
    if (error instanceof ApiError) {
      apiLogger.warn('Ingestion failed', { requestId, code: error.code, message: error.message })
    } else {
      apiLogger.error('Unexpected ingestion error', { requestId, error: String(error) })
    }

    return errorResponse(error)
  }
}

async function ingestScrapedData(data: ScrapedData, requestId: string) {
  const startTime = new Date()
  let fightersAdded = 0
  let fightsAdded = 0
  let fightsUpdated = 0
  let fightsCancelled = 0

  try {
    await prisma.$transaction(async (tx) => {
      const fighterResult = await fighterStore.upsertMany(data.fighters, { tx })
      fightersAdded = fighterResult.added

      await eventStore.upsertMany(data.events, { tx })

      const fighterBySourceUrl = await fighterStore.findBySourceUrls(
        data.fighters.map((f) => f.sourceUrl),
        { tx },
      )
      const eventBySourceUrl = await eventStore.findBySourceUrls(
        data.events.map((e) => e.sourceUrl),
        { tx },
      )
      const eventIds = Array.from(eventBySourceUrl.values()).map((e) => e.id)
      const existingFightsByEventId = await fightStore.findExistingForReconciliation(eventIds, {
        tx,
      })

      const plan = planFightReconciliation({
        scrapedFights: data.fights,
        scrapedFighters: data.fighters,
        scrapedEvents: data.events,
        fighterBySourceUrl,
        eventBySourceUrl,
        existingFightsByEventId,
        scrapedEventUrls: data.scrapedEventUrls ?? [],
      })

      const fightResult = await fightStore.applyReconciliationPlan(plan, { tx })
      fightsAdded = fightResult.created
      fightsUpdated = fightResult.updated
      fightsCancelled = fightResult.cancelled

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

    const endTime = new Date()
    return await prisma.scrapeLog.create({
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
  } catch (error) {
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
