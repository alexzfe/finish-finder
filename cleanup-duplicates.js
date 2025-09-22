#!/usr/bin/env node

// Script to clean up duplicate events identified in the production database
const { PrismaClient } = require('@prisma/client')

async function cleanupDuplicates() {
  console.log('🧹 Cleaning Up Duplicate Events')
  console.log('===============================\n')

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  })

  try {
    // 1. Remove the corrupted numbered events (736, 737, etc.)
    console.log('1️⃣ Removing corrupted numbered events...')

    const corruptedEvents = await prisma.event.findMany({
      where: {
        name: {
          in: ['733', '734', '735', '736', '737', '738', '739', '740', '741', '742', '743', '744', '745', '746', '747']
        }
      },
      include: {
        fights: true
      }
    })

    console.log(`   Found ${corruptedEvents.length} corrupted events`)

    for (const event of corruptedEvents) {
      console.log(`   Deleting event "${event.name}" (${event.fights.length} fights)`)

      // Delete fights first (cascade should handle this, but being explicit)
      await prisma.fight.deleteMany({
        where: { eventId: event.id }
      })

      // Delete the event
      await prisma.event.delete({
        where: { id: event.id }
      })
    }

    // 2. Remove duplicate UFC Fight Night events (keep the newer, more complete ones)
    console.log('\n2️⃣ Removing duplicate UFC Fight Night events...')

    // Remove older de Ridder vs Allen event
    const oldDeRidder = await prisma.event.findUnique({
      where: { id: 'ufc-fight-night-262-de-ridder-vs-allen' },
      include: { fights: true }
    })

    if (oldDeRidder) {
      console.log(`   Removing older "UFC Fight Night 262 - De Ridder vs. Allen" (${oldDeRidder.fights.length} fights)`)
      await prisma.fight.deleteMany({
        where: { eventId: oldDeRidder.id }
      })
      await prisma.event.delete({
        where: { id: oldDeRidder.id }
      })
    }

    // Remove older Oliveira vs Fiziev event
    const oldOliveira = await prisma.event.findUnique({
      where: { id: 'ufc-fight-night-261-oliveira-vs-fiziev' },
      include: { fights: true }
    })

    if (oldOliveira) {
      console.log(`   Removing older "UFC Fight Night 261 - Oliveira vs. Fiziev" (${oldOliveira.fights.length} fights)`)
      await prisma.fight.deleteMany({
        where: { eventId: oldOliveira.id }
      })
      await prisma.event.delete({
        where: { id: oldOliveira.id }
      })
    }

    // 3. Check for any remaining duplicates by date and name similarity
    console.log('\n3️⃣ Checking for remaining duplicates...')

    const allEvents = await prisma.event.findMany({
      select: {
        id: true,
        name: true,
        date: true,
        _count: {
          select: {
            fights: true
          }
        }
      },
      orderBy: { date: 'desc' }
    })

    const duplicateCandidates = []
    const eventsByDate = new Map()

    // Group by date
    allEvents.forEach(event => {
      const dateKey = event.date.toISOString().split('T')[0]
      if (!eventsByDate.has(dateKey)) {
        eventsByDate.set(dateKey, [])
      }
      eventsByDate.get(dateKey).push(event)
    })

    // Find dates with multiple events that might be duplicates
    for (const [date, events] of eventsByDate.entries()) {
      if (events.length > 1) {
        // Check for name similarity
        for (let i = 0; i < events.length; i++) {
          for (let j = i + 1; j < events.length; j++) {
            const similarity = calculateNameSimilarity(events[i].name, events[j].name)
            if (similarity > 0.6) {
              duplicateCandidates.push({
                date,
                event1: events[i],
                event2: events[j],
                similarity
              })
            }
          }
        }
      }
    }

    if (duplicateCandidates.length > 0) {
      console.log(`   ⚠️  Found ${duplicateCandidates.length} potential remaining duplicates:`)
      duplicateCandidates.forEach((dup, i) => {
        console.log(`   ${i + 1}. ${dup.date} - ${(dup.similarity * 100).toFixed(1)}% similar`)
        console.log(`      "${dup.event1.name}" (${dup.event1._count.fights} fights)`)
        console.log(`      "${dup.event2.name}" (${dup.event2._count.fights} fights)`)
      })
    } else {
      console.log('   ✅ No remaining duplicates found')
    }

    // 4. Show final database state
    console.log('\n4️⃣ Final database state:')
    const finalCount = await prisma.event.count()
    console.log(`   Total events: ${finalCount}`)

    const recentEvents = await prisma.event.findMany({
      select: {
        name: true,
        date: true,
        _count: {
          select: { fights: true }
        }
      },
      orderBy: { date: 'desc' },
      take: 10
    })

    console.log('\n   Recent events:')
    recentEvents.forEach((event, i) => {
      console.log(`   ${i + 1}. "${event.name}" (${event.date.toISOString().split('T')[0]}) - ${event._count.fights} fights`)
    })

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message)
    console.error('Stack trace:', error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

function calculateNameSimilarity(name1, name2) {
  const normalize = (name) => name.toLowerCase()
    .replace(/ufc\s*/gi, '')
    .replace(/fight\s*night\s*\d*/gi, 'fightnight')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const norm1 = normalize(name1)
  const norm2 = normalize(name2)

  if (norm1 === norm2) return 1.0
  if (norm1.length === 0 || norm2.length === 0) return 0

  const words1 = norm1.split(' ')
  const words2 = norm2.split(' ')

  const commonWords = words1.filter(word => words2.includes(word))
  const totalWords = new Set([...words1, ...words2]).size

  return commonWords.length / totalWords
}

async function main() {
  await cleanupDuplicates()
  console.log('\n✅ Duplicate cleanup complete!')
}

main().catch(console.error)