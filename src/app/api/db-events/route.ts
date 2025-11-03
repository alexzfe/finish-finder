import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/database/prisma'
import { parseJsonArray } from '@/lib/utils/json'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    if (!process.env.DATABASE_URL || !prisma) {
      throw new Error('DATABASE_URL not configured')
    }
    // Get the active prediction version
    const activePredictionVersion = await prisma.predictionVersion.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' }
    })

    // Get events with their fights, fighters, and predictions
    const events = await prisma.event.findMany({
      where: {
        // Show events that have fights (indicating they're not just placeholders)
        fights: {
          some: {}
        }
      },
      include: {
        fights: {
          include: {
            fighter1: true,
            fighter2: true,
            predictions: {
              where: activePredictionVersion ? {
                versionId: activePredictionVersion.id
              } : undefined,
              take: 1
            }
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
        // Use new predictions table data if available, fallback to old fields
        predictedFunScore: (() => {
          const prediction = fight.predictions[0]
          if (prediction && typeof prediction.funScore === 'number') {
            return Math.min(100, Math.max(0, Math.round(prediction.funScore)))
          }

          // Fallback to old fields for backward compatibility
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
        finishProbability: (() => {
          const prediction = fight.predictions[0]
          if (prediction && typeof prediction.finishProbability === 'number') {
            return prediction.finishProbability
          }
          return fight.finishProbability || 0
        })(),
        aiDescription: (() => {
          const prediction = fight.predictions[0]
          if (prediction?.finishReasoning) {
            // finishReasoning is a JSON object with breakdown, extract the finalAssessment
            try {
              const reasoning = typeof prediction.finishReasoning === 'string'
                ? JSON.parse(prediction.finishReasoning)
                : prediction.finishReasoning
              return reasoning.finalAssessment || null
            } catch {
              // If parsing fails, return the raw value if it's a string
              return typeof prediction.finishReasoning === 'string'
                ? prediction.finishReasoning
                : null
            }
          }
          return fight.aiDescription || fight.entertainmentReason || null
        })(),
        funFactors: (() => {
          const prediction = fight.predictions[0]
          if (prediction?.funBreakdown) {
            // Extract breakdown reasoning from new predictions
            try {
              const breakdown = typeof prediction.funBreakdown === 'string'
                ? JSON.parse(prediction.funBreakdown)
                : prediction.funBreakdown
              return [breakdown.reasoning || 'AI analysis available']
            } catch {
              return parseJsonArray(fight.keyFactors ?? fight.funFactors)
            }
          }
          return parseJsonArray(fight.keyFactors ?? fight.funFactors)
        })(),
        funFactor: fight.funFactor,
        riskLevel: fight.riskLevel,
        fightPrediction: fight.fightPrediction,
        completed: fight.completed,
        bookingDate: fight.bookingDate
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mainCard: [] as any[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prelimCard: [] as any[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      earlyPrelimCard: [] as any[]
    }))

    // Organize fights by card position
    transformedEvents.forEach(event => {
      // Main card includes Main Event, Co-Main Event, and Main Card fights
      event.mainCard = event.fightCard.filter(f =>
        f.cardPosition === 'Main Event' ||
        f.cardPosition === 'Co-Main Event' ||
        f.cardPosition === 'Main Card'
      )
      // Prelims
      event.prelimCard = event.fightCard.filter(f => f.cardPosition === 'Prelims')
      // Early Prelims
      event.earlyPrelimCard = event.fightCard.filter(f => f.cardPosition === 'Early Prelims')
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
