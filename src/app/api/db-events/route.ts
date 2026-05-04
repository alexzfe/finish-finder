/**
 * Database Events API
 *
 * Returns UFC events with fights and the active AI prediction. The response
 * conforms to the canonical wire shape in `@/types` (validated client-side
 * via `UFCEventSchema`).
 */

import { type NextRequest } from 'next/server'


import { CARD_POSITION_ORDER, RATE_LIMITS } from '@/config'
import {
  PredictionStore,
  toCurrentPrediction,
  type CurrentPrediction,
  type FightWithMaybePrediction,
} from '@/lib/ai/persistence/predictionStore'
import { Errors, errorResponse, successResponse } from '@/lib/api'
import { RateLimiter, getClientIP } from '@/lib/api/middleware'
import { prisma } from '@/lib/database/prisma'
import { apiLogger } from '@/lib/monitoring/logger'
import { toCanonicalCardPosition } from '@/lib/utils/cardPosition'
import { toWeightClass } from '@/lib/utils/weight-class'
import type { Fight, Fighter, Prediction, UFCEvent } from '@/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const rateLimiter = new RateLimiter(RATE_LIMITS.DEFAULT)

// PredictionStore is the single seam for "current prediction for a fight" —
// owns active-version lookup and the legacy-column compat shim.
const predictionStore = new PredictionStore(prisma)

interface DbFighter {
  id: string
  name: string
  nickname: string | null
  wins: number
  losses: number
  draws: number
  weightClass: string
  imageUrl: string | null
}

interface DbFight extends FightWithMaybePrediction {
  id: string
  fighter1: DbFighter
  fighter2: DbFighter
  weightClass: string
  titleFight: boolean
  mainEvent: boolean
  cardPosition: string
  scheduledRounds: number
  fightNumber: number | null
  fightPrediction: string | null
  completed: boolean
  bookingDate: Date
  winnerId: string | null
  method: string | null
  round: number | null
  time: string | null
}

interface DbEvent {
  id: string
  name: string
  date: Date
  location: string
  venue: string
  completed: boolean
  fights: DbFight[]
}

function toFighter(row: DbFighter): Fighter {
  return {
    id: row.id,
    name: row.name,
    nickname: row.nickname,
    record: { wins: row.wins, losses: row.losses, draws: row.draws },
    weightClass: toWeightClass(row.weightClass, 'unknown'),
    imageUrl: row.imageUrl,
  }
}

function toPrediction(current: CurrentPrediction | null): Prediction | null {
  if (!current) return null
  return {
    funScore: current.funScore,
    finishProbability: current.finishProbability,
    keyFactors: current.funFactors,
    modelUsed: current.modelUsed,
    createdAt: current.createdAt ? current.createdAt.toISOString() : null,
  }
}

export function transformFight(fight: DbFight): Fight {
  return {
    id: fight.id,
    fighter1: toFighter(fight.fighter1),
    fighter2: toFighter(fight.fighter2),
    weightClass: toWeightClass(fight.weightClass, 'unknown'),
    titleFight: fight.titleFight,
    mainEvent: fight.mainEvent,
    cardPosition: toCanonicalCardPosition(fight.cardPosition),
    scheduledRounds: fight.scheduledRounds,
    fightNumber: fight.fightNumber,
    bookingDate: fight.bookingDate.toISOString(),
    completed: fight.completed,
    winnerId: fight.winnerId,
    method: fight.method,
    round: fight.round,
    time: fight.time,
    fightPrediction: fight.fightPrediction,
    prediction: toPrediction(toCurrentPrediction(fight)),
  }
}

export function transformEvent(event: DbEvent): UFCEvent {
  const fightCard = event.fights.map(transformFight).sort((a, b) => {
    const orderA = CARD_POSITION_ORDER[a.cardPosition] ?? 999
    const orderB = CARD_POSITION_ORDER[b.cardPosition] ?? 999
    if (orderA !== orderB) return orderA - orderB
    return (a.fightNumber ?? 0) - (b.fightNumber ?? 0)
  })

  return {
    id: event.id,
    name: event.name,
    date: event.date.toISOString(),
    location: event.location,
    venue: event.venue,
    completed: event.completed,
    fightCard,
  }
}

export async function GET(request: NextRequest) {
  const clientIP = getClientIP(request)
  const rateLimitResult = rateLimiter.check(clientIP)

  if (!rateLimitResult.allowed) {
    return errorResponse(Errors.rateLimited(Math.ceil(rateLimitResult.resetIn / 1000)))
  }

  try {
    if (!process.env.DATABASE_URL || !prisma) {
      throw Errors.internal('Database not configured')
    }

    const activePredictionVersion = await predictionStore.getActiveVersion()

    const events = await prisma.event.findMany({
      where: {
        fights: { some: { isCancelled: false } },
      },
      include: {
        fights: {
          where: { isCancelled: false },
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

    const transformedEvents = events.map(transformEvent)

    apiLogger.info('Events fetched successfully', {
      count: events.length,
      ip: clientIP,
    })

    return successResponse({
      events: transformedEvents,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    apiLogger.error('Failed to fetch events', {
      error: error instanceof Error ? error.message : String(error),
      ip: clientIP,
    })

    return errorResponse(error)
  }
}
