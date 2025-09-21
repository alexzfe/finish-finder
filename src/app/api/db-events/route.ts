import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/database/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function parseJsonArray(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn('Failed to parse JSON payload from database, falling back to empty array.', {
      error,
      payloadPreview: value.slice(0, 120)
    })
    return []
  }
}

export async function GET() {
  try {
    if (!process.env.DATABASE_URL || !prisma) {
      throw new Error('DATABASE_URL not configured')
    }
    // Get upcoming events with their fights and fighters
    const events = await prisma.event.findMany({
      where: {
        date: {
          gte: new Date() // Only upcoming events
        },
        completed: false
      },
      include: {
        fights: {
          include: {
            fighter1: true,
            fighter2: true
          },
          orderBy: {
            fightNumber: 'asc'
          }
        }
      },
      orderBy: {
        date: 'asc'
      },
      take: 50 // Limit results for performance
    })

    // Transform the data to match the expected format
    const transformedEvents = events.map(event => ({
      id: event.id,
      name: event.name,
      date: event.date,
      location: event.location,
      venue: event.venue,
      fightCard: event.fights.map(fight => ({
        id: fight.id,
        fighter1: {
          id: fight.fighter1.id,
          name: fight.fighter1.name,
          nickname: fight.fighter1.nickname,
          record: {
            wins: fight.fighter1.wins,
            losses: fight.fighter1.losses,
            draws: fight.fighter1.draws
          },
          weightClass: fight.fighter1.weightClass,
          imageUrl: fight.fighter1.imageUrl
        },
        fighter2: {
          id: fight.fighter2.id,
          name: fight.fighter2.name,
          nickname: fight.fighter2.nickname,
          record: {
            wins: fight.fighter2.wins,
            losses: fight.fighter2.losses,
            draws: fight.fighter2.draws
          },
          weightClass: fight.fighter2.weightClass,
          imageUrl: fight.fighter2.imageUrl
        },
        weightClass: fight.weightClass,
        titleFight: fight.titleFight,
        mainEvent: fight.mainEvent,
        cardPosition: fight.cardPosition,
        scheduledRounds: fight.scheduledRounds,
        fightNumber: fight.fightNumber,
        predictedFunScore: (() => {
          const rawScore = fight.predictedFunScore
          if (typeof rawScore === 'number') {
            const scaled = rawScore <= 10 ? Math.round(rawScore * 10) : Math.round(rawScore)
            return Math.min(100, Math.max(0, scaled))
          }

          if (typeof fight.funFactor === 'number') {
            const fallback = Math.round(fight.funFactor * 10)
            return Math.min(100, Math.max(0, fallback))
          }

          return 0
        })(),
        funFactors: parseJsonArray(fight.keyFactors ?? fight.funFactors),
        aiDescription: fight.aiDescription || fight.entertainmentReason,
        funFactor: fight.funFactor,
        finishProbability: fight.finishProbability,
        riskLevel: fight.riskLevel,
        fightPrediction: fight.fightPrediction,
        completed: fight.completed,
        bookingDate: fight.bookingDate
      })),
      mainCard: [] as any[],
      prelimCard: [] as any[],
      earlyPrelimCard: [] as any[]
    }))

    // Organize fights by card position
    transformedEvents.forEach(event => {
      event.mainCard = event.fightCard.filter(f => f.cardPosition === 'main')
      event.prelimCard = event.fightCard.filter(f => f.cardPosition === 'preliminary')
      event.earlyPrelimCard = event.fightCard.filter(f => f.cardPosition === 'early-preliminary')
    })

    return NextResponse.json({
      success: true,
      data: {
        events: transformedEvents,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    Sentry.captureException(error, {
      data: {
        route: '/api/db-events'
      }
    })
    console.error('Database events API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch events from database'
    }, { status: 500 })
  }
}
