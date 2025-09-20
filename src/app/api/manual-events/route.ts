// Manual Events API - Allow manual input of real UFC events
import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    const { events } = await request.json()

    if (!events || !Array.isArray(events)) {
      return NextResponse.json({
        success: false,
        error: 'Events array is required'
      }, { status: 400 })
    }

    console.log('📝 Manually adding real UFC events to database...')

    const addedEvents = []

    for (const event of events) {
      // Validate required fields
      if (!event.name || !event.date || !event.location) {
        console.warn(`⚠️ Skipping invalid event: ${JSON.stringify(event)}`)
        continue
      }

      // Add event to database
      const dbEvent = await prisma.event.upsert({
        where: { id: event.id || event.name.toLowerCase().replace(/[^a-z0-9]/g, '-') },
        update: {
          name: event.name,
          date: new Date(event.date + 'T00:00:00.000Z'),
          location: event.location,
          venue: event.venue || 'TBD',
          updatedAt: new Date()
        },
        create: {
          id: event.id || event.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          name: event.name,
          date: new Date(event.date + 'T00:00:00.000Z'),
          location: event.location,
          venue: event.venue || 'TBD'
        }
      })

      addedEvents.push(dbEvent)
      console.log(`✅ Added event: ${event.name} - ${event.date}`)
    }

    return NextResponse.json({
      success: true,
      message: `Successfully added ${addedEvents.length} real events`,
      data: {
        events: addedEvents.length,
        eventNames: addedEvents.map(e => e.name)
      }
    })

  } catch (error) {
    console.error('Error adding manual events:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to add manual events',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

// GET endpoint to show usage instructions
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Manual Events API - Add real UFC events',
    usage: {
      method: 'POST',
      endpoint: '/api/manual-events',
      body: {
        events: [
          {
            id: 'ufc-123',
            name: 'UFC 123: Fighter vs Fighter',
            date: '2025-12-01',
            location: 'Las Vegas, Nevada, USA',
            venue: 'T-Mobile Arena'
          }
        ]
      }
    },
    note: 'Use this endpoint to add real UFC events manually until proper data source integration is implemented'
  })
}