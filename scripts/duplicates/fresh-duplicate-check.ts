#!/usr/bin/env node

// Fresh approach to check duplicates without connection conflicts
import { PrismaClient } from '@prisma/client'

async function main() {
  console.log('🔍 Fresh Duplicate Analysis')
  console.log('===========================\n')

  // Create a completely fresh Prisma client
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  })

  try {
    // First, get a count of all events
    const totalEvents = await prisma.event.count()
    console.log(`📊 Total events in database: ${totalEvents}`)

    // Get all events in a simple query
    const allEvents = await prisma.event.findMany({
      select: {
        id: true,
        name: true,
        date: true,
        venue: true,
        location: true,
        createdAt: true
      },
      orderBy: {
        date: 'desc'
      }
    })

    console.log(`📋 Retrieved ${allEvents.length} events for analysis\n`)

    // Manual duplicate detection for the specific cases we saw
    const duplicateGroups = []
    const eventMap = new Map()

    // Group by date first
    allEvents.forEach(event => {
      const dateKey = event.date.toISOString().split('T')[0]
      if (!eventMap.has(dateKey)) {
        eventMap.set(dateKey, [])
      }
      eventMap.get(dateKey).push(event)
    })

    // Find dates with multiple events
    for (const [date, events] of eventMap.entries()) {
      if (events.length > 1) {
        console.log(`🚨 Multiple events on ${date}:`)
        events.forEach((event, i) => {
          console.log(`   ${i + 1}. "${event.name}" (ID: ${event.id})`)
          console.log(`      Venue: ${event.venue}, ${event.location}`)
          console.log(`      Created: ${event.createdAt}`)
        })
        console.log('')

        // Check if any are similar
        for (let i = 0; i < events.length; i++) {
          for (let j = i + 1; j < events.length; j++) {
            const event1 = events[i]
            const event2 = events[j]

            // Simple similarity check
            const similarity = calculateNameSimilarity(event1.name, event2.name)
            if (similarity > 0.5) {
              console.log(`   ⚠️  Similar names detected (${(similarity * 100).toFixed(1)}% match):`)
              console.log(`      "${event1.name}" vs "${event2.name}"`)
              console.log('')
            }
          }
        }
      }
    }

    // Show recent events for context
    console.log('📅 Most recent 15 events:')
    allEvents.slice(0, 15).forEach((event, i) => {
      console.log(`${i + 1}. "${event.name}"`)
      console.log(`   Date: ${event.date.toISOString().split('T')[0]}`)
      console.log(`   ID: ${event.id}`)
      console.log('')
    })

  } catch (error) {
    console.error('❌ Analysis failed:', error.message)
    console.error('Stack trace:', error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

function calculateNameSimilarity(name1, name2) {
  // Normalize names
  const normalize = (name) => name.toLowerCase()
    .replace(/ufc\s*/gi, '')
    .replace(/fight\s*night\s*/gi, 'fightnight')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const norm1 = normalize(name1)
  const norm2 = normalize(name2)

  if (norm1 === norm2) return 1.0
  if (norm1.length === 0 || norm2.length === 0) return 0

  // Simple word overlap calculation
  const words1 = norm1.split(' ')
  const words2 = norm2.split(' ')

  const commonWords = words1.filter(word => words2.includes(word))
  const totalWords = new Set([...words1, ...words2]).size

  return commonWords.length / totalWords
}

main().catch(console.error)