// Database Events API Route - Fetch events from database only
import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET(request: NextRequest) {
  try {
    console.log('🗄️ Fetching events from database...')

    const normalizeWeightClass = (value?: string | null): string => {
      if (!value) {
        return 'unknown'
      }
      return value
        .toLowerCase()
        .replace(/women's\s+/g, 'womens_')
        .replace(/[^a-z_]/g, '_')
        .replace(/_{2,}/g, '_')
    }

    const parseStringArray = (value?: string | null, fallback: string[] = ['mixed']): string[] => {
      if (!value) {
        return fallback
      }
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) {
          return parsed.filter(item => typeof item === 'string' && item.length > 0)
        }
      } catch {
        // fall through to fallback handling below
      }
      return [value]
    }

    const parseKeyFactors = (value?: string | null): string[] => {
      if (!value) {
        return []
      }
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) {
          return parsed.filter(item => typeof item === 'string')
        }
      } catch {
        // fall through
      }
      return value ? [value] : []
    }

    // Get events with their fights and fighters
    const events = await prisma.event.findMany({
      include: {
        fights: {
          include: {
            fighter1: true,
            fighter2: true
          }
        }
      },
      orderBy: { date: 'asc' }
    })

    if (events.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No events in database. Please collect data first.',
        data: { events: [], totalEvents: 0, totalFighters: 0 }
      })
    }

    // Transform events to match the UI format
    const transformedEvents = events.map(event => {
      const sortedFights = [...event.fights].sort((a, b) => (a.fightNumber || 0) - (b.fightNumber || 0))

      const fightCard = sortedFights.map(fight => {
        const predictedFunScore = Math.min(100, Math.round((fight.funFactor || 0) * 10))

        return {
          id: fight.id,
          fighter1: {
            id: fight.fighter1.id,
            name: fight.fighter1.name,
            nickname: fight.fighter1.nickname || undefined,
            record: {
              wins: fight.fighter1.wins || 0,
              losses: fight.fighter1.losses || 0,
              draws: fight.fighter1.draws || 0
            },
            stats: {
              finishRate: fight.fighter1.finishRate || 0,
              koPercentage: fight.fighter1.koPercentage || 0,
              submissionPercentage: fight.fighter1.submissionPercentage || 0,
              averageFightTime: fight.fighter1.averageFightTime || 0,
              significantStrikesPerMinute: fight.fighter1.significantStrikesPerMinute || 0,
              takedownAccuracy: fight.fighter1.takedownAccuracy || 0
            },
            popularity: {
              socialFollowers: fight.fighter1.socialFollowers || 0,
              recentBuzzScore: fight.fighter1.recentBuzzScore || 0,
              fanFavorite: fight.fighter1.fanFavorite || false
            },
            funScore: fight.fighter1.funScore || 0,
            weightClass: normalizeWeightClass(fight.fighter1.weightClass || fight.weightClass) as any,
            fighting_style: parseStringArray(fight.fighter1.fightingStyles)
          },
          fighter2: {
            id: fight.fighter2.id,
            name: fight.fighter2.name,
            nickname: fight.fighter2.nickname || undefined,
            record: {
              wins: fight.fighter2.wins || 0,
              losses: fight.fighter2.losses || 0,
              draws: fight.fighter2.draws || 0
            },
            stats: {
              finishRate: fight.fighter2.finishRate || 0,
              koPercentage: fight.fighter2.koPercentage || 0,
              submissionPercentage: fight.fighter2.submissionPercentage || 0,
              averageFightTime: fight.fighter2.averageFightTime || 0,
              significantStrikesPerMinute: fight.fighter2.significantStrikesPerMinute || 0,
              takedownAccuracy: fight.fighter2.takedownAccuracy || 0
            },
            popularity: {
              socialFollowers: fight.fighter2.socialFollowers || 0,
              recentBuzzScore: fight.fighter2.recentBuzzScore || 0,
              fanFavorite: fight.fighter2.fanFavorite || false
            },
            funScore: fight.fighter2.funScore || 0,
            weightClass: normalizeWeightClass(fight.fighter2.weightClass || fight.weightClass) as any,
            fighting_style: parseStringArray(fight.fighter2.fightingStyles)
          },
          weightClass: normalizeWeightClass(fight.weightClass) as any,
          titleFight: fight.titleFight || false,
          mainEvent: fight.mainEvent || false,
          cardPosition: fight.cardPosition as 'main' | 'preliminary' | 'early-preliminary',
          scheduledRounds: fight.scheduledRounds || 3,
          fightNumber: fight.fightNumber || 0,
          status: 'scheduled',
          event: {
            id: event.id,
            name: event.name,
            date: event.date,
            location: event.location,
            venue: event.venue || ''
          },
          predictedFunScore,
          funFactor: fight.funFactor || 0,
          finishProbability: fight.finishProbability || 0,
          funFactors: parseKeyFactors(fight.keyFactors),
          aiDescription: fight.entertainmentReason || '',
          riskLevel: fight.riskLevel || null,
          prediction: fight.fightPrediction || '',
          bookingDate: fight.bookingDate,
          completed: fight.completed
        }
      })

      const mainCard = fightCard.filter(fight => fight.cardPosition === 'main')
      const prelimCard = fightCard.filter(fight => fight.cardPosition === 'preliminary')
      const earlyPrelimCard = fightCard.filter(fight => fight.cardPosition === 'early-preliminary')

      return {
        id: event.id,
        name: event.name,
        date: event.date,
        location: event.location,
        venue: event.venue || '',
        fightCard,
        mainCard,
        prelimCard,
        earlyPrelimCard
      }
    })

    // Calculate main card, prelim card, etc.
    transformedEvents.forEach(event => {
      event.mainCard = event.fightCard.filter(f => f.cardPosition === 'main')
      event.prelimCard = event.fightCard.filter(f => f.cardPosition === 'preliminary')
      event.earlyPrelimCard = event.fightCard.filter(f => f.cardPosition === 'early-preliminary')
    })

    console.log(`✅ Loaded ${transformedEvents.length} events from database`)

    return NextResponse.json({
      success: true,
      data: {
        events: transformedEvents,
        totalEvents: transformedEvents.length,
        totalFighters: events.reduce((total, event) => {
          const uniqueFighters = new Set()
          event.fights.forEach(fight => {
            uniqueFighters.add(fight.fighter1.id)
            uniqueFighters.add(fight.fighter2.id)
          })
          return total + uniqueFighters.size
        }, 0)
      }
    })

  } catch (error) {
    console.error('Error fetching database events:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch database events',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}
