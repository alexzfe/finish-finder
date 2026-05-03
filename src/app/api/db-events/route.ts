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
import { parseJsonArray } from '@/lib/utils/json'

// Configure route to be dynamic
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Initialize rate limiter
const rateLimiter = new RateLimiter(RATE_LIMITS.DEFAULT)

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
 * Extract the 1-10 fun score from a fight's active prediction.
 * Falls back to the legacy `funFactor` column (already on a 1-10 scale).
 */
function extractPredictedFunScore(fight: {
  predictions: Array<{ funScore: number | null }>
  funFactor: number | null
}): number {
  const prediction = fight.predictions[0]
  if (prediction && typeof prediction.funScore === 'number') {
    return clampFunScore(prediction.funScore)
  }
  if (typeof fight.funFactor === 'number') {
    return clampFunScore(fight.funFactor)
  }
  return 0
}

function clampFunScore(score: number): number {
  return Math.min(10, Math.max(0, Math.round(score)))
}

/**
 * Extract finish probability (0-1) from a fight's active prediction.
 */
function extractFinishProbability(fight: {
  predictions: Array<{ finishProbability: number | null }>
  finishProbability: number | null
}): number {
  const prediction = fight.predictions[0]
  if (prediction && typeof prediction.finishProbability === 'number') {
    return prediction.finishProbability
  }
  return fight.finishProbability || 0
}

/**
 * Extract finish confidence (0-1) from a fight's active prediction.
 */
function extractFinishConfidence(fight: {
  predictions: Array<{ finishConfidence: number | null }>
}): number {
  const prediction = fight.predictions[0]
  if (prediction && typeof prediction.finishConfidence === 'number') {
    return prediction.finishConfidence
  }
  return 0
}

/**
 * Extract keyFactors from a fight's active prediction (funBreakdown.keyFactors).
 * Falls back to legacy keyFactors / funFactors columns.
 */
function extractFunFactors(fight: {
  predictions: Array<{ funBreakdown: unknown }>
  keyFactors: string | null
  funFactors: string | null
}): string[] {
  const prediction = fight.predictions[0]
  if (prediction?.funBreakdown) {
    try {
      const breakdown = typeof prediction.funBreakdown === 'string'
        ? JSON.parse(prediction.funBreakdown)
        : prediction.funBreakdown
      if (Array.isArray(breakdown?.keyFactors)) {
        return breakdown.keyFactors.filter((f: unknown): f is string => typeof f === 'string')
      }
    } catch {
      // fall through to legacy fields
    }
  }
  return parseJsonArray(fight.keyFactors ?? fight.funFactors).filter(
    (f): f is string => typeof f === 'string'
  )
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
    predictedFunScore: extractPredictedFunScore(fight),
    finishProbability: extractFinishProbability(fight),
    finishConfidence: extractFinishConfidence(fight),
    funFactors: extractFunFactors(fight),
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
    const activePredictionVersion = await prisma.predictionVersion.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    })

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
