#!/usr/bin/env node

import { PrismaClient } from '@prisma/client'

interface DuplicateEvent {
  name: string
  count: number
  dates: string
  venues: string
  locations: string
}

interface DuplicateByNameAndDate {
  name: string
  date: Date
  count: number
  venues: string
  locations: string
  event_ids: string
}

interface EventWithCount {
  id: string
  name: string
  date: Date
  venue: string
  location: string
  _count: {
    fights: number
  }
}

interface PotentialDuplicate {
  type: string
  events: EventWithCount[]
  normalizedKey: string
}

async function checkForDuplicates() {
  console.log('🔍 Checking Supabase Database for Duplicate Events')
  console.log('================================================\n')

  // Use the production DATABASE_URL from environment
  const prisma = new PrismaClient()

  try {
    console.log('📊 Analyzing events for duplicates...\n')

    // Check for duplicate events by name
    const duplicatesByName = await prisma.$queryRaw<DuplicateEvent[]>`
      SELECT name, COUNT(*) as count,
             string_agg(DISTINCT date::text, ', ') as dates,
             string_agg(DISTINCT venue, ', ') as venues,
             string_agg(DISTINCT location, ', ') as locations
      FROM events
      GROUP BY name
      HAVING COUNT(*) > 1
      ORDER BY count DESC, name
    `

    console.log(`🔍 Events with duplicate names: ${duplicatesByName.length}`)
    if (duplicatesByName.length > 0) {
      console.log('\n📋 Duplicate events by name:')
      duplicatesByName.forEach((row: DuplicateEvent, i: number) => {
        console.log(`\n${i + 1}. "${row.name}" (${row.count} occurrences)`)
        console.log(`   Dates: ${row.dates}`)
        console.log(`   Venues: ${row.venues}`)
        console.log(`   Locations: ${row.locations}`)
      })
    }

    // Check for duplicate events by name AND date
    const duplicatesByNameAndDate = await prisma.$queryRaw<DuplicateByNameAndDate[]>`
      SELECT name, date, COUNT(*) as count,
             string_agg(DISTINCT venue, ', ') as venues,
             string_agg(DISTINCT location, ', ') as locations,
             string_agg(id::text, ', ') as event_ids
      FROM events
      GROUP BY name, date
      HAVING COUNT(*) > 1
      ORDER BY count DESC, date DESC
    `

    console.log(`\n🔍 Events with duplicate name+date: ${duplicatesByNameAndDate.length}`)
    if (duplicatesByNameAndDate.length > 0) {
      console.log('\n🚨 TRUE DUPLICATES (same name + date):')
      duplicatesByNameAndDate.forEach((row: DuplicateByNameAndDate, i: number) => {
        console.log(`\n${i + 1}. "${row.name}" on ${row.date}`)
        console.log(`   Count: ${row.count} duplicates`)
        console.log(`   Venues: ${row.venues}`)
        console.log(`   Locations: ${row.locations}`)
        console.log(`   Event IDs: ${row.event_ids}`)
      })
    }

    // Check for similar events (potential duplicates with slight name variations)
    const allEvents = await prisma.event.findMany({
      select: {
        id: true,
        name: true,
        date: true,
        venue: true,
        location: true,
        _count: {
          select: {
            fights: true
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    })

    console.log(`\n📈 Total events in database: ${allEvents.length}`)

    // Analyze for potential duplicates by normalizing names
    const normalizedEvents = new Map<string, EventWithCount>()
    const potentialDuplicates: PotentialDuplicate[] = []

    allEvents.forEach((event: EventWithCount) => {
      const normalizedName = event.name
        .toLowerCase()
        .replace(/ufc\s*/i, '')
        .replace(/[^a-z0-9]/g, '')
        .trim()

      const key = `${normalizedName}_${event.date.toISOString()}`

      if (normalizedEvents.has(key)) {
        const existing = normalizedEvents.get(key)!
        potentialDuplicates.push({
          type: 'potential_duplicate',
          events: [existing, event],
          normalizedKey: key
        })
      } else {
        normalizedEvents.set(key, event)
      }
    })

    if (potentialDuplicates.length > 0) {
      console.log(`\n🤔 Potential duplicates (after normalization): ${potentialDuplicates.length}`)
      potentialDuplicates.forEach((dup: PotentialDuplicate, i: number) => {
        console.log(`\n${i + 1}. Potential duplicate:`)
        dup.events.forEach((event: EventWithCount, j: number) => {
          console.log(`   ${j + 1}. "${event.name}" (${event.date.toISOString().split('T')[0]})`)
          console.log(`      ID: ${event.id}`)
          console.log(`      Venue: ${event.venue}, ${event.location}`)
          console.log(`      Fights: ${event._count.fights}`)
        })
      })
    }

    // Show recent events for context
    const recentEvents = allEvents.slice(0, 10)
    console.log(`\n📅 Recent events (last 10):`)
    recentEvents.forEach((event: EventWithCount, i: number) => {
      console.log(`${i + 1}. "${event.name}" (${event.date.toISOString().split('T')[0]})`)
      console.log(`   Venue: ${event.venue}, ${event.location}`)
      console.log(`   Fights: ${event._count.fights}`)
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('❌ Database check failed:', errorMessage)
    if (errorMessage.includes('Environment variable not found: DATABASE_URL')) {
      console.log('\n💡 Make sure DATABASE_URL is set to your Supabase connection string')
      console.log('   Example: postgresql://user:pass@host:5432/database')
    }
  } finally {
    await prisma.$disconnect()
  }
}

async function main() {
  await checkForDuplicates()
  console.log('\n✅ Database duplicate check complete!')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
