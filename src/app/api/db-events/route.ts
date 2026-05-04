/**
 * Database Events API
 *
 * Returns UFC events with their fights, fighters, and AI predictions.
 * Used by the frontend to display the fight cards.
 *
 * Features:
 * - Rate limiting (30 requests/minute per IP)
 * - Automatic card position sorting
 * - Prediction data transformation (new → old format for backward compatibility)
 *
 * @example
 * GET /api/db-events
 * Response: { success: true, data: { events: [...], timestamp: "..." } }
 */

import { type NextRequest } from 'next/server'

import * as Sentry from '@sentry/nextjs'

import { Errors, errorResponse, successResponse } from '@/lib/api'
import { RateLimiter, createRateLimitHeaders, getClientIP } from '@/lib/api/middleware'
import { CARD_POSITION_ORDER, RATE_LIMITS } from '@/config'
import { prisma } from '@/lib/database/prisma'
import { apiLogger } from '@/lib/monitoring/logger'
import { PredictionStore, toCurrentPrediction } from '@/lib/ai/persistence/predictionStore'

// Configure route to be dynamic
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Initialize rate limiter
const rateLimiter = new RateLimiter(RATE_LIMITS.DEFAULT)

// PredictionStore is the single seam for "current prediction for a fight" —
// owns active-version lookup and the legacy-column compat shim.
const predictionStore = new PredictionStore(prisma)

/**
 * Transformed fight data for API response
 */
interface TransformedFight {
  id: string
  fighter1: {
    id: string
    name: string
    nickname: string | null
    record: { wins: number; losses: number; draws: number }
    weightClass: string
    imageUrl: string | null
  }
  fighter2: {
    id: string
    name: string
    nickname: string | null
    record: { wins: number; losses: number; draws: number }
    weightClass: string
    imageUrl: string | null
  }
  weightClass: string
  titleFight: boolean
  mainEvent: boolean
  cardPosition: string
  scheduledRounds: number
  fightNumber: number | null
  predictedFunScore: number       // 1-10 integer
  finishProbability: number       // 0-1
  finishConfidence: number        // 0-1
  funFactors: string[]
  fightPrediction: string | null
  completed: boolean
  bookingDate: Date
  winnerId: string | null
  method: string | null
  round: number | null
  time: string | null
}

/**
 * Transformed event data for API response
 */
interface TransformedEvent {
  id: string
  name: string
  date: Date
  location: string
  venue: string
  completed: boolean
  fightCard: TransformedFight[]
  mainCard: TransformedFight[]
  prelimCard: TransformedFight[]
  earlyPrelimCard: TransformedFight[]
}

/**
 * Transform database fight to API response format
 */
function transformFight(fight: {
  id: string
  fighter1: {
    id: string
    name: string
    nickname: string | null
    wins: number
    losses: number
    draws: number
    weightClass: string
    imageUrl: string | null
  }
  fighter2: {
    id: string
    name: string
    nickname: string | null
    wins: number
    losses: number
    draws: number
    weightClass: string
    imageUrl: string | null
  }
  weightClass: string
  titleFight: boolean
  mainEvent: boolean
  cardPosition: string
  scheduledRounds: number
  fightNumber: number | null
  predictions: Array<{
    funScore: number | null
    finishProbability: number | null
    finishConfidence: number | null
    funBreakdown: unknown
  }>
  funFactor: number | null
  finishProbability: number | null
  keyFactors: string | null
  funFactors: string | null
  fightPrediction: string | null
  completed: boolean
  bookingDate: Date
  winnerId: string | null
  method: string | null
  round: number | null
  time: string | null
}): TransformedFight {
  const current = toCurrentPrediction(fight)
  return {
    id: fight.id,
    fighter1: {
      id: fight.fighter1.id,
      name: fight.fighter1.name,
      nickname: fight.fighter1.nickname,
      record: {
        wins: fight.fighter1.wins,
        losses: fight.fighter1.losses,
        draws: fight.fighter1.draws,
      },
      weightClass: fight.fighter1.weightClass,
      imageUrl: fight.fighter1.imageUrl,
    },
    fighter2: {
      id: fight.fighter2.id,
      name: fight.fighter2.name,
      nickname: fight.fighter2.nickname,
      record: {
        wins: fight.fighter2.wins,
        losses: fight.fighter2.losses,
        draws: fight.fighter2.draws,
      },
      weightClass: fight.fighter2.weightClass,
      imageUrl: fight.fighter2.imageUrl,
    },
    weightClass: fight.weightClass,
    titleFight: fight.titleFight,
    mainEvent: fight.mainEvent,
    cardPosition: fight.cardPosition,
    scheduledRounds: fight.scheduledRounds,
    fightNumber: fight.fightNumber,
    predictedFunScore: current?.funScore ?? 0,
    finishProbability: current?.finishProbability ?? 0,
    finishConfidence: current?.finishConfidence ?? 0,
    funFactors: current?.funFactors ?? [],
    fightPrediction: fight.fightPrediction,
    completed: fight.completed,
    bookingDate: fight.bookingDate,
    winnerId: fight.winnerId,
    method: fight.method,
    round: fight.round,
    time: fight.time,
  }
}

/**
 * Transform database event to API response format
 */
function transformEvent(event: {
  id: string
  name: string
  date: Date
  location: string
  venue: string
  completed: boolean
  fights: TransformedFight[]
}): TransformedEvent {
  return {
    id: event.id,
    name: event.name,
    date: event.date,
    location: event.location,
    venue: event.venue,
    completed: event.completed,
    fightCard: event.fights,
    mainCard: [],
    prelimCard: [],
    earlyPrelimCard: [],
  }
}

/**
 * Sort fights by card position
 */
function sortFightsByCardPosition(fights: TransformedFight[]): TransformedFight[] {
  return fights.sort((a, b) => {
    const orderA = CARD_POSITION_ORDER[a.cardPosition] ?? 999
    const orderB = CARD_POSITION_ORDER[b.cardPosition] ?? 999
    return orderA - orderB
  })
}

/**
 * Organize fights into card sections
 */
function organizeFightsByCard(event: TransformedEvent): void {
  event.mainCard = event.fightCard.filter(f =>
    f.cardPosition === 'Main Event' ||
    f.cardPosition === 'Co-Main Event' ||
    f.cardPosition === 'Main Card'
  )
  event.prelimCard = event.fightCard.filter(f => f.cardPosition === 'Prelims')
  event.earlyPrelimCard = event.fightCard.filter(f => f.cardPosition === 'Early Prelims')
}

/**
 * GET /api/db-events
 *
 * Returns all upcoming UFC events with their fights and predictions.
 *
 * @returns {Promise<NextResponse>} JSON response with events data
 */
export async function GET(request: NextRequest) {
  const clientIP = getClientIP(request)
  const rateLimitResult = rateLimiter.check(clientIP)

  // Check rate limit
  if (!rateLimitResult.allowed) {
    return errorResponse(
      Errors.rateLimited(Math.ceil(rateLimitResult.resetIn / 1000)),
    )
  }

  try {
    // Verify database is configured
    if (!process.env.DATABASE_URL || !prisma) {
      throw Errors.internal('Database not configured')
    }

    // Get active prediction version
    const activePredictionVersion = await predictionStore.getActiveVersion()

    // Fetch events with fights and predictions
    const events = await prisma.event.findMany({
      where: {
        fights: {
          some: {
            isCancelled: false,
          },
        },
      },
      include: {
        fights: {
          where: {
            isCancelled: false,
          },
          include: {
            fighter1: true,
            fighter2: true,
            predictions: {
              where: activePredictionVersion
                ? { versionId: activePredictionVersion.id }
                : undefined,
              take: 1,
            },
          },
        },
      },
      orderBy: { date: 'asc' },
      take: 50,
    })

    // Transform and sort data
    const transformedEvents = events.map(event => {
      const transformedEvent = transformEvent(event)
      transformedEvent.fightCard = event.fights.map(transformFight)
      transformedEvent.fightCard = sortFightsByCardPosition(transformedEvent.fightCard)
      organizeFightsByCard(transformedEvent)
      return transformedEvent
    })

    apiLogger.info('Events fetched successfully', {
      count: events.length,
      ip: clientIP,
    })

    return successResponse({
      events: transformedEvents,
      timestamp: new Date().toISOString(),
    })

  } catch (error) {
    // Log to Sentry for monitoring
    Sentry.captureException(error, {
      data: { route: '/api/db-events' },
    })

    apiLogger.error('Failed to fetch events', {
      error: error instanceof Error ? error.message : String(error),
      ip: clientIP,
    })

    return errorResponse(error)
  }
}
