// Cleanup Duplicates API - Remove duplicate events
import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    console.log('🧹 Starting duplicate event cleanup...')

    // Find all events grouped by date and venue
    const events = await prisma.event.findMany({
      orderBy: { date: 'asc' }
    })

    const duplicateGroups = new Map()

    // Group events by date + venue combination
    for (const event of events) {
      const key = `${event.date.toISOString()}-${event.venue}`
      if (!duplicateGroups.has(key)) {
        duplicateGroups.set(key, [])
      }
      duplicateGroups.get(key).push(event)
    }

    let duplicatesRemoved = 0

    // Process each group and remove duplicates
    for (const [key, groupEvents] of duplicateGroups) {
      if (groupEvents.length > 1) {
        console.log(`📍 Found ${groupEvents.length} duplicate events for ${key}`)

        // Sort by name length (desc) to keep the most detailed one
        groupEvents.sort((a, b) => b.name.length - a.name.length)

        const keepEvent = groupEvents[0]
        const removeEvents = groupEvents.slice(1)

        console.log(`   ✅ Keeping: ${keepEvent.name} (ID: ${keepEvent.id})`)

        for (const removeEvent of removeEvents) {
          console.log(`   🗑️ Removing: ${removeEvent.name} (ID: ${removeEvent.id})`)

          // Delete fights associated with this event first
          await prisma.fight.deleteMany({
            where: { eventId: removeEvent.id }
          })

          // Delete the duplicate event
          await prisma.event.delete({
            where: { id: removeEvent.id }
          })

          duplicatesRemoved++
        }
      }
    }

    console.log(`✅ Cleanup complete. Removed ${duplicatesRemoved} duplicate events.`)

    return NextResponse.json({
      success: true,
      message: `Removed ${duplicatesRemoved} duplicate events`,
      data: {
        duplicatesRemoved,
        eventsRemaining: events.length - duplicatesRemoved
      }
    })

  } catch (error) {
    console.error('❌ Error cleaning up duplicates:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to cleanup duplicates',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}