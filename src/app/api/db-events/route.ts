import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Initialize Prisma client only when DATABASE_URL is available
let prisma: PrismaClient | null = null

function getPrismaClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not configured')
  }
  if (!prisma) {
    prisma = new PrismaClient()
  }
  return prisma
}

export async function GET() {
  try {
    const prismaClient = getPrismaClient()
    // Get upcoming events with their fights and fighters
    const events = await prismaClient.event.findMany({
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
      }
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
        funFactors: fight.funFactors ? JSON.parse(fight.funFactors) : [],
        aiDescription: fight.aiDescription || fight.entertainmentReason,
        funFactor: fight.funFactor,
        finishProbability: fight.finishProbability,
        riskLevel: fight.riskLevel,
        fightPrediction: fight.fightPrediction,
        completed: fight.completed,
        bookingDate: fight.bookingDate
      })),
      mainCard: [],
      prelimCard: [],
      earlyPrelimCard: []
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
  } finally {
    if (prisma) {
      await prisma.$disconnect()
    }
  }
}
