#!/usr/bin/env node

// Simple script to check for duplicate events using raw SQL
require('ts-node').register({
  project: './tsconfig.node.json'
})

const { PrismaClient } = require('@prisma/client')

async function checkDuplicates() {
  console.log('🔍 Simple Duplicate Check')
  console.log('=========================\n')

  const prisma = new PrismaClient()

  try {
    // Get all events, then check in JavaScript
    const events = await prisma.event.findMany({
      orderBy: { date: 'desc' }
    })

    console.log(`📊 Total events: ${events.length}\n`)

    // Find exact duplicates (same name and date)
    const duplicates = []
    const seen = new Map()

    for (const event of events) {
      const key = `${event.name.toLowerCase()}|${event.date.toISOString()}`

      if (seen.has(key)) {
        const existing = seen.get(key)
        duplicates.push({
          type: 'exact',
          events: [existing, event]
        })
      } else {
        seen.set(key, event)
      }
    }

    if (duplicates.length > 0) {
      console.log(`🚨 Found ${duplicates.length} exact duplicates:\n`)
      duplicates.forEach((dup, i) => {
        console.log(`${i + 1}. Exact duplicate:`)
        dup.events.forEach((event, j) => {
          console.log(`   ${j + 1}. "${event.name}"`)
          console.log(`      ID: ${event.id}`)
          console.log(`      Date: ${event.date}`)
          console.log(`      Venue: ${event.venue}, ${event.location}`)
          console.log(`      Created: ${event.createdAt}`)
        })
        console.log('')
      })
    }

    // Find similar events (same date, similar names)
    const similarEvents = []

    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const event1 = events[i]
        const event2 = events[j]

        // Same date check
        if (event1.date.getTime() === event2.date.getTime()) {
          // Check if names contain common fighters or similar structure
          const name1Lower = event1.name.toLowerCase()
          const name2Lower = event2.name.toLowerCase()

          // Look for common patterns
          const hasCommonFighter = checkCommonFighters(name1Lower, name2Lower)
          const hasCommonEvent = checkCommonEvent(name1Lower, name2Lower)

          if (hasCommonFighter || hasCommonEvent) {
            similarEvents.push({
              event1,
              event2,
              reason: hasCommonFighter ? 'common_fighter' : 'common_event'
            })
          }
        }
      }
    }

    if (similarEvents.length > 0) {
      console.log(`🤔 Found ${similarEvents.length} potentially similar events:\n`)
      similarEvents.forEach((match, i) => {
        console.log(`${i + 1}. Similar events (${match.reason}):`)
        console.log(`   Event 1: "${match.event1.name}" (ID: ${match.event1.id})`)
        console.log(`   Event 2: "${match.event2.name}" (ID: ${match.event2.id})`)
        console.log(`   Date: ${match.event1.date}`)
        console.log(`   Venues: "${match.event1.venue}" vs "${match.event2.venue}"`)
        console.log('')
      })
    }

    // Show recent events for context
    console.log('📅 Recent events (first 15):')
    events.slice(0, 15).forEach((event, i) => {
      console.log(`${i + 1}. "${event.name}" (${event.date.toISOString().split('T')[0]})`)
      console.log(`   ID: ${event.id}, Venue: ${event.venue}`)
    })

  } catch (error) {
    console.error('❌ Check failed:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

function checkCommonFighters(name1, name2) {
  // Extract potential fighter names (look for "vs" patterns)
  const extractFighters = (name) => {
    const matches = name.match(/([a-z]+)\s+vs?\s+([a-z]+)/i)
    return matches ? [matches[1], matches[2]] : []
  }

  const fighters1 = extractFighters(name1)
  const fighters2 = extractFighters(name2)

  if (fighters1.length > 0 && fighters2.length > 0) {
    return fighters1.some(f1 => fighters2.some(f2 => f1 === f2))
  }

  return false
}

function checkCommonEvent(name1, name2) {
  // Remove common UFC prefixes and numbers
  const normalize = (name) => name
    .replace(/ufc\s*\d*/gi, '')
    .replace(/fight\s*night\s*\d*/gi, 'fight night')
    .replace(/[^a-z\s]/g, '')
    .trim()

  const norm1 = normalize(name1)
  const norm2 = normalize(name2)

  // Check if they're very similar after normalization
  return norm1.length > 5 && norm2.length > 5 &&
         (norm1.includes(norm2) || norm2.includes(norm1) ||
          calculateSimilarity(norm1, norm2) > 0.6)
}

function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1

  if (longer.length === 0) return 1.0

  return (longer.length - levenshteinDistance(longer, shorter)) / longer.length
}

function levenshteinDistance(str1, str2) {
  const matrix = []

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  return matrix[str2.length][str1.length]
}

async function main() {
  await checkDuplicates()
  console.log('\n✅ Simple duplicate check complete!')
}

main().catch(console.error)