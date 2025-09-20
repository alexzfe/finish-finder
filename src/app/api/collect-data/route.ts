// Hybrid Web Search + AI UFC Data Collection API Route
import { NextRequest, NextResponse } from 'next/server'
import { HybridUFCService } from '@/lib/ai/hybridUFCService'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// POST endpoint to trigger data collection
export async function POST(request: NextRequest) {
  try {
    // Get parameters from URL or body
    const { searchParams } = new URL(request.url)
    const forceRealParam = searchParams.get('forceReal') === 'true'

    let action = 'targeted'  // Default action
    let forceReal = forceRealParam

    try {
      const body = await request.json()
      action = body.action || action
      forceReal = body.forceReal || forceReal
    } catch (e) {
      // No JSON body, use URL params and defaults
      console.log('No JSON body provided, using defaults and URL params')
    }

    const hybridService = new HybridUFCService()

    switch (action) {
      case 'targeted':
        console.log('🌐 Starting hybrid UFC data collection (real events + AI analysis)...')
        const targetedData = await hybridService.getUpcomingUFCEvents(5)

        // Entertainment predictions are already generated in the hybrid service

        // Step 1: Store events first (preserving existing events in chronological order)
        console.log(`📅 Processing ${targetedData.events.length} new events for chronological storage...`)

        for (const event of targetedData.events) {
          const eventDate = new Date(event.date + 'T00:00:00.000Z')

          // Check for existing events with same date and venue
          const existingEvent = await prisma.event.findFirst({
            where: {
              date: eventDate,
              venue: event.venue
            }
          })

          if (existingEvent) {
            console.log(`🔄 Event already exists: ${event.name} on ${event.date} at ${event.venue}`)

            // If the new event has more detail (longer name), update the existing one
            if (event.name.length > existingEvent.name.length) {
              console.log(`   📝 Updating with more detailed name: ${event.name}`)
              await prisma.event.update({
                where: { id: existingEvent.id },
                data: {
                  name: event.name,
                  updatedAt: new Date()
                }
              })
            } else {
              console.log(`   ✅ Keeping existing event (already detailed enough)`)
            }
            continue
          }

          // Create new event if no duplicate found
          console.log(`➕ Adding new event: ${event.name} on ${event.date}`)
          await prisma.event.create({
            data: {
              id: event.id,
              name: event.name,
              date: eventDate,
              location: event.location,
              venue: event.venue
            }
          })
        }

        // After adding events, get all events sorted chronologically
        const allEvents = await prisma.event.findMany({
          orderBy: { date: 'asc' }
        })

        console.log(`📊 Total events in database: ${allEvents.length} (sorted chronologically)`)
        allEvents.forEach((event, index) => {
          console.log(`   ${index + 1}. ${event.name} - ${event.date.toISOString().split('T')[0]}`)
        })

        // Step 2: Store fighters second (before fights that reference them)
        for (const fighter of targetedData.fighters) {
          await prisma.fighter.upsert({
            where: { id: fighter.id },
            update: {
              name: fighter.name,
              nickname: fighter.nickname || null,
              wins: fighter.wins,
              losses: fighter.losses,
              draws: fighter.draws,
              weightClass: fighter.weightClass,
              height: fighter.height || null,
              reach: fighter.reach || null,
              age: fighter.age || null,
              nationality: fighter.nationality || null,
              fightingStyles: fighter.fightingStyle || null,
              record: fighter.record,
              winsByKO: fighter.winsByKO || 0,
              winsBySubmission: fighter.winsBySubmission || 0,
              winsByDecision: fighter.winsByDecision || 0,
              currentStreak: fighter.currentStreak || null,
              ranking: fighter.ranking || null,
              updatedAt: new Date()
            },
            create: {
              id: fighter.id,
              name: fighter.name,
              nickname: fighter.nickname || null,
              wins: fighter.wins,
              losses: fighter.losses,
              draws: fighter.draws,
              weightClass: fighter.weightClass,
              height: fighter.height || null,
              reach: fighter.reach || null,
              age: fighter.age || null,
              nationality: fighter.nationality || null,
              fightingStyles: fighter.fightingStyle || null,
              record: fighter.record,
              winsByKO: fighter.winsByKO || 0,
              winsBySubmission: fighter.winsBySubmission || 0,
              winsByDecision: fighter.winsByDecision || 0,
              currentStreak: fighter.currentStreak || null,
              ranking: fighter.ranking || null
            }
          })
        }

        // Step 3: Store fights last (after events and fighters exist)
        for (const event of targetedData.events) {
          for (const fight of event.fightCard) {
            // Verify fighter IDs exist
            const fighter1Exists = await prisma.fighter.findUnique({ where: { id: fight.fighter1Id } })
            const fighter2Exists = await prisma.fighter.findUnique({ where: { id: fight.fighter2Id } })

            if (!fighter1Exists || !fighter2Exists) {
              console.warn(`⚠️ Skipping fight ${fight.id} - missing fighters: ${fight.fighter1Id} or ${fight.fighter2Id}`)
              continue
            }

            await prisma.fight.upsert({
              where: { id: fight.id },
              update: {
                fighter1Id: fight.fighter1Id,
                fighter2Id: fight.fighter2Id,
                eventId: event.id,
                weightClass: fight.weightClass,
                titleFight: fight.titleFight || false,
                mainEvent: fight.mainEvent || false,
                cardPosition: fight.cardPosition,
                scheduledRounds: fight.scheduledRounds,
                fightNumber: fight.fightNumber || 0,
                funFactor: fight.funFactor || 0,
                finishProbability: fight.finishProbability || 0,
                entertainmentReason: fight.entertainmentReason || null,
                keyFactors: JSON.stringify(fight.keyFactors || []),
                fightPrediction: fight.fightPrediction || null,
                riskLevel: fight.riskLevel || null,
                updatedAt: new Date()
              },
              create: {
                id: fight.id,
                fighter1Id: fight.fighter1Id,
                fighter2Id: fight.fighter2Id,
                eventId: event.id,
                weightClass: fight.weightClass,
                titleFight: fight.titleFight || false,
                mainEvent: fight.mainEvent || false,
                cardPosition: fight.cardPosition,
                scheduledRounds: fight.scheduledRounds,
                fightNumber: fight.fightNumber || 0,
                funFactor: fight.funFactor || 0,
                finishProbability: fight.finishProbability || 0,
                entertainmentReason: fight.entertainmentReason || null,
                keyFactors: JSON.stringify(fight.keyFactors || []),
                fightPrediction: fight.fightPrediction || null,
                riskLevel: fight.riskLevel || null
              }
            })
          }
        }

        return NextResponse.json({
          success: true,
          message: `Successfully collected targeted data: ${targetedData.events.length} events, ${targetedData.fighters.length} fighters`,
          data: {
            events: targetedData.events.length,
            fighters: targetedData.fighters.length
          }
        })

      default:
        return NextResponse.json(
          { success: false, error: 'Currently only "targeted" action is supported with AI data collection' },
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
