// Data Collection API Route
import { NextRequest, NextResponse } from 'next/server'
import { UFCStatsCollector } from '@/lib/scraping/ufcStatsCollector'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// POST endpoint to trigger data collection
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()

    const collector = new UFCStatsCollector()

    switch (action) {
      case 'fighters':
        console.log('🥊 Starting fighter data collection...')
        const fighters = await collector.scrapeFighters()

        // Store in database
        for (const fighter of fighters) {
          await prisma.fighter.upsert({
            where: { id: fighter.id },
            update: {
              name: fighter.name,
              nickname: fighter.nickname,
              wins: fighter.record.wins,
              losses: fighter.record.losses,
              draws: fighter.record.draws,
              weightClass: fighter.weightClass,
              finishRate: fighter.stats.finishRate,
              koPercentage: fighter.stats.koPercentage,
              submissionPercentage: fighter.stats.submissionPercentage,
              averageFightTime: fighter.stats.averageFightTime,
              significantStrikesPerMinute: fighter.stats.significantStrikesPerMinute,
              takedownAccuracy: fighter.stats.takedownAccuracy,
              socialFollowers: fighter.popularity.socialFollowers,
              recentBuzzScore: fighter.popularity.recentBuzzScore,
              fanFavorite: fighter.popularity.fanFavorite,
              funScore: fighter.funScore,
              fightingStyles: JSON.stringify(fighter.fighting_style),
              updatedAt: new Date()
            },
            create: {
              id: fighter.id,
              name: fighter.name,
              nickname: fighter.nickname,
              wins: fighter.record.wins,
              losses: fighter.record.losses,
              draws: fighter.record.draws,
              weightClass: fighter.weightClass,
              finishRate: fighter.stats.finishRate,
              koPercentage: fighter.stats.koPercentage,
              submissionPercentage: fighter.stats.submissionPercentage,
              averageFightTime: fighter.stats.averageFightTime,
              significantStrikesPerMinute: fighter.stats.significantStrikesPerMinute,
              takedownAccuracy: fighter.stats.takedownAccuracy,
              socialFollowers: fighter.popularity.socialFollowers,
              recentBuzzScore: fighter.popularity.recentBuzzScore,
              fanFavorite: fighter.popularity.fanFavorite,
              funScore: fighter.funScore,
              fightingStyles: fighter.fighting_style
            }
          })
        }

        return NextResponse.json({
          success: true,
          message: `Successfully collected ${fighters.length} fighters`,
          data: { count: fighters.length }
        })

      case 'events':
        console.log('📅 Starting event data collection...')
        const events = await collector.scrapeUpcomingEvents()

        // Store in database
        for (const event of events) {
          await prisma.event.upsert({
            where: { id: event.id },
            update: {
              name: event.name,
              date: event.date,
              location: event.location,
              venue: event.venue,
              updatedAt: new Date()
            },
            create: {
              id: event.id,
              name: event.name,
              date: event.date,
              location: event.location,
              venue: event.venue
            }
          })
        }

        return NextResponse.json({
          success: true,
          message: `Successfully collected ${events.length} events`,
          data: { count: events.length }
        })

      case 'all':
        console.log('🚀 Starting comprehensive data collection...')
        const allData = await collector.collectAllData()

        // Store fighters
        for (const fighter of allData.fighters) {
          await prisma.fighter.upsert({
            where: { id: fighter.id },
            update: {
              name: fighter.name,
              nickname: fighter.nickname,
              wins: fighter.record.wins,
              losses: fighter.record.losses,
              draws: fighter.record.draws,
              weightClass: fighter.weightClass,
              finishRate: fighter.stats.finishRate,
              koPercentage: fighter.stats.koPercentage,
              submissionPercentage: fighter.stats.submissionPercentage,
              averageFightTime: fighter.stats.averageFightTime,
              significantStrikesPerMinute: fighter.stats.significantStrikesPerMinute,
              takedownAccuracy: fighter.stats.takedownAccuracy,
              socialFollowers: fighter.popularity.socialFollowers,
              recentBuzzScore: fighter.popularity.recentBuzzScore,
              fanFavorite: fighter.popularity.fanFavorite,
              funScore: fighter.funScore,
              fightingStyles: JSON.stringify(fighter.fighting_style),
              updatedAt: new Date()
            },
            create: {
              id: fighter.id,
              name: fighter.name,
              nickname: fighter.nickname,
              wins: fighter.record.wins,
              losses: fighter.record.losses,
              draws: fighter.record.draws,
              weightClass: fighter.weightClass,
              finishRate: fighter.stats.finishRate,
              koPercentage: fighter.stats.koPercentage,
              submissionPercentage: fighter.stats.submissionPercentage,
              averageFightTime: fighter.stats.averageFightTime,
              significantStrikesPerMinute: fighter.stats.significantStrikesPerMinute,
              takedownAccuracy: fighter.stats.takedownAccuracy,
              socialFollowers: fighter.popularity.socialFollowers,
              recentBuzzScore: fighter.popularity.recentBuzzScore,
              fanFavorite: fighter.popularity.fanFavorite,
              funScore: fighter.funScore,
              fightingStyles: fighter.fighting_style
            }
          })
        }

        // Store events
        for (const event of allData.events) {
          await prisma.event.upsert({
            where: { id: event.id },
            update: {
              name: event.name,
              date: event.date,
              location: event.location,
              venue: event.venue,
              updatedAt: new Date()
            },
            create: {
              id: event.id,
              name: event.name,
              date: event.date,
              location: event.location,
              venue: event.venue
            }
          })
        }

        return NextResponse.json({
          success: true,
          message: `Successfully collected all data`,
          data: {
            fighters: allData.fighters.length,
            events: allData.events.length
          }
        })

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action. Use: fighters, events, or all' },
          { status: 400 }
        )
    }

  } catch (error) {
    console.error('Data collection error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Data collection failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

// GET endpoint to check collection status
export async function GET(request: NextRequest) {
  try {
    const fighterCount = await prisma.fighter.count()
    const eventCount = await prisma.event.count()
    const fightCount = await prisma.fight.count()

    const lastUpdated = await prisma.fighter.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    })

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          fighters: fighterCount,
          events: eventCount,
          fights: fightCount
        },
        lastUpdated: lastUpdated?.updatedAt || null,
        status: fighterCount > 0 ? 'ready' : 'empty'
      }
    })

  } catch (error) {
    console.error('Error checking collection status:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check status',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}