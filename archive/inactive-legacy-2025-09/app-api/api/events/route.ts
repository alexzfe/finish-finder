// Events API Route - Serve only collected database events
import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET(request: NextRequest) {
  try {
    console.log('Loading events from database only...')

    // Get events with their fights and fighters from database
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
        error: 'No events available. Please collect real UFC events from the admin panel.',
        data: { events: [], totalEvents: 0, totalFighters: 0 }
      })
    }

    // Transform database events to UI format
    const eventsWithFights = events.map(event => {
      const eventFights = event.fights.map(fight => ({
        id: fight.id,
        fighter1: {
          id: fight.fighter1.id,
          name: fight.fighter1.name,
          nickname: fight.fighter1.nickname || undefined,
          record: {
            wins: fight.fighter1.wins,
            losses: fight.fighter1.losses,
            draws: fight.fighter1.draws
          },
          stats: {
            finishRate: 50, // Default values for now
            koPercentage: 30,
            submissionPercentage: 20,
            averageFightTime: 900,
            significantStrikesPerMinute: 3.5,
            takedownAccuracy: 40
          },
          popularity: {
            socialFollowers: 50000,
            recentBuzzScore: 50,
            fanFavorite: false
          },
          funScore: 70,
          weightClass: fight.fighter1.weightClass,
          fighting_style: (() => {
            try {
              return fight.fighter1.fightingStyles ?
                JSON.parse(fight.fighter1.fightingStyles) : ['Mixed Martial Arts']
            } catch {
              return ['Mixed Martial Arts']
            }
          })()
        },
        fighter2: {
          id: fight.fighter2.id,
          name: fight.fighter2.name,
          nickname: fight.fighter2.nickname || undefined,
          record: {
            wins: fight.fighter2.wins,
            losses: fight.fighter2.losses,
            draws: fight.fighter2.draws
          },
          stats: {
            finishRate: 50,
            koPercentage: 30,
            submissionPercentage: 20,
            averageFightTime: 900,
            significantStrikesPerMinute: 3.5,
            takedownAccuracy: 40
          },
          popularity: {
            socialFollowers: 50000,
            recentBuzzScore: 50,
            fanFavorite: false
          },
          funScore: 70,
          weightClass: fight.fighter2.weightClass,
          fighting_style: (() => {
            try {
              return fight.fighter2.fightingStyles ?
                JSON.parse(fight.fighter2.fightingStyles) : ['Mixed Martial Arts']
            } catch {
              return ['Mixed Martial Arts']
            }
          })()
        },
        weightClass: fight.weightClass,
        titleFight: fight.titleFight,
        mainEvent: fight.cardPosition === 'main',
        scheduledRounds: fight.scheduledRounds,
        status: fight.status,
        event: {
          id: event.id,
          name: event.name,
          date: event.date,
          location: event.location,
          venue: event.venue
        },
        predictedFunScore: fight.funFactor || 0,
        funFactors: (() => {
          try {
            return fight.keyFactors ? JSON.parse(fight.keyFactors) : []
          } catch {
            return []
          }
        })(),
        aiDescription: fight.entertainmentReason || '',
        bookingDate: new Date(),
        completed: false
      }))

      return {
        id: event.id,
        name: event.name,
        date: event.date,
        location: event.location,
        venue: event.venue,
        fightCard: eventFights,
        mainCard: eventFights.filter(f => f.mainEvent),
        prelimCard: eventFights.filter(f => !f.mainEvent),
        earlyPrelimCard: []
      }
    })

    console.log(`✅ Loaded ${eventsWithFights.length} events from database`)

    return NextResponse.json({
      success: true,
      data: {
        events: eventsWithFights,
        totalEvents: eventsWithFights.length,
        totalFighters: eventsWithFights.reduce((total, event) => {
          const uniqueFighters = new Set()
          event.fightCard.forEach(fight => {
            uniqueFighters.add(fight.fighter1.id)
            uniqueFighters.add(fight.fighter2.id)
          })
          return total + uniqueFighters.size
        }, 0)
      }
    })

  } catch (error) {
    console.error('Error fetching events:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch events',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

// POST endpoint redirects to data collection
export async function POST(request: NextRequest) {
  return NextResponse.json({
    success: false,
    error: 'Use /api/collect-data endpoint for data collection',
    message: 'This endpoint only serves collected events. Use the admin panel to collect new events.'
  }, { status: 400 })
}