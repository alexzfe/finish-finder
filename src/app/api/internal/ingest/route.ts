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
import { IngestOrchestrator, type IngestResult } from '@/lib/scraper/ingestOrchestrator'
import { ScrapedDataSchema, type ScrapedData } from '@/lib/scraper/validation'

const fighterStore = new FighterStore(prisma)
const eventStore = new EventStore(prisma)
const fightStore = new FightStore(prisma)
const orchestrator = new IngestOrchestrator(
  prisma.$transaction.bind(prisma),
  fighterStore,
  eventStore,
  fightStore,
)

/**
 * POST /api/internal/ingest
 *
 * Ingest scraped data from the Python scraper
 */
export async function POST(req: NextRequest) {
  const requestId = getRequestId(req)

  try {
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

    const body = await req.json()
    const parsed = ScrapedDataSchema.safeParse(body)

    if (!parsed.success) {
      const errors = parsed.error.errors.map((err) => `${err.path.join('.')}: ${err.message}`)
      throw Errors.validation('Request validation failed', { errors })
    }

    const data = parsed.data
    const startTime = new Date()

    let result: IngestResult
    try {
      result = await orchestrator.apply(data)
    } catch (error) {
      // Transaction rolled back; record a FAILURE audit row with zeros
      // (partial counts after rollback are misleading and were a known bug
      // in the previous inline implementation).
      await prisma.scrapeLog.create({
        data: {
          startTime,
          endTime: new Date(),
          status: 'FAILURE',
          eventsFound: data.events.length,
          fightsAdded: 0,
          fightsUpdated: 0,
          fightsCancelled: 0,
          fightersAdded: 0,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      })
      throw error
    }

    emitDomainLogs(result, data, requestId)

    const scrapeLog = await prisma.scrapeLog.create({
      data: {
        startTime,
        endTime: new Date(),
        status: 'SUCCESS',
        eventsFound: data.events.length,
        fightsAdded: result.fights.created,
        fightsUpdated: result.fights.updated,
        fightsCancelled: result.fights.cancelled,
        fightersAdded: result.fighters.added,
      },
    })

    apiLogger.info('Scraper data ingested successfully', {
      requestId,
      scrapeLogId: scrapeLog.id,
      eventsCount: data.events.length,
      fightsCount: data.fights.length,
    })

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

function emitDomainLogs(result: IngestResult, data: ScrapedData, requestId: string) {
  for (const skipped of result.skipped) {
    apiLogger.warn('Skipping fight - missing related records', {
      requestId,
      fightId: skipped.scrapedFightId,
      reason: skipped.reason,
    })
  }

  if (result.reversedOrderHits > 0) {
    // Legacy compatibility signal — once this stays at 0 across enough
    // ingest runs, the reversed-order fallback can be deleted.
    apiLogger.info('Matched fights in reversed fighter order (legacy compat)', {
      requestId,
      hits: result.reversedOrderHits,
    })
  }

  if ((data.scrapedEventUrls ?? []).length > 0) {
    apiLogger.info('Reconciliation complete', {
      requestId,
      fightsCancelled: result.fights.cancelled,
    })
  }
}
