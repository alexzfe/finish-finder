#!/usr/bin/env node

// Script to analyze specific duplicate events found in Supabase
require('ts-node').register({
  project: './tsconfig.node.json'
})

const { PrismaClient } = require('@prisma/client')

async function analyzeSpecificDuplicates() {
  console.log('🔍 Analyzing Specific Duplicate Events')
  console.log('====================================\n')

  const prisma = new PrismaClient()

  try {
    // Look for the specific duplicates we found
    const deRidderEvents = await prisma.event.findMany({
      where: {
        OR: [
          { name: { contains: 'de Ridder vs. Allen', mode: 'insensitive' } },
          { name: { contains: 'De Ridder vs. Allen', mode: 'insensitive' } }
        ]
      },
      include: {
        fights: {
          include: {
            fighter1: true,
            fighter2: true
          }
        }
      }
    })

    console.log(`🎯 Found ${deRidderEvents.length} events with "de Ridder vs. Allen":\n`)

    deRidderEvents.forEach((event, i) => {
      console.log(`${i + 1}. "${event.name}"`)
      console.log(`   ID: ${event.id}`)
      console.log(`   Date: ${event.date}`)
      console.log(`   Venue: ${event.venue}, ${event.location}`)
      console.log(`   Fights: ${event.fights.length}`)
      console.log(`   Created: ${event.createdAt}`)

      if (event.fights.length > 0) {
        console.log(`   Sample fights:`)
        event.fights.slice(0, 3).forEach((fight, j) => {
          const fighterNames = `${fight.fighter1.name} vs ${fight.fighter2.name}`
          console.log(`     - ${fighterNames}`)
        })
      }
      console.log('')
    })

    // Check for other potential duplicates with similar logic
    console.log('🔍 Checking for other date-based duplicates...\n')

    const duplicatesByDate = await prisma.$queryRaw`
      SELECT date, COUNT(*) as count,
             array_agg(name) as event_names,
             array_agg(id) as event_ids
      FROM events
      GROUP BY date
      HAVING COUNT(*) > 1
      ORDER BY date DESC
    `

    console.log(`📅 Found ${duplicatesByDate.length} dates with multiple events:\n`)

    duplicatesByDate.forEach((row, i) => {
      console.log(`${i + 1}. Date: ${row.date} (${row.count} events)`)
      row.event_names.forEach((name, j) => {
        console.log(`   - "${name}" (ID: ${row.event_ids[j]})`)
      })
      console.log('')
    })

    // Check for name similarity duplicates
    console.log('🔍 Checking for name similarity duplicates...\n')

    const allEvents = await prisma.event.findMany({
      select: {
        id: true,
        name: true,
        date: true,
        createdAt: true
      },
      orderBy: { date: 'desc' }
    })

    const similarEvents = []

    for (let i = 0; i < allEvents.length; i++) {
      for (let j = i + 1; j < allEvents.length; j++) {
        const event1 = allEvents[i]
        const event2 = allEvents[j]

        // Same date check
        if (event1.date.getTime() === event2.date.getTime()) {
          // Normalize names for comparison
          const normalize = (name) => name.toLowerCase()
            .replace(/ufc\s*/i, '')
            .replace(/fight night\s*\d*/i, 'fight night')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim()

          const norm1 = normalize(event1.name)
          const norm2 = normalize(event2.name)

          // Check if names are very similar (>70% match)
          const similarity = calculateSimilarity(norm1, norm2)

          if (similarity > 0.7) {
            similarEvents.push({
              similarity,
              event1,
              event2
            })
          }
        }
      }
    }

    if (similarEvents.length > 0) {
      console.log(`🎯 Found ${similarEvents.length} potentially similar events:\n`)

      similarEvents.sort((a, b) => b.similarity - a.similarity).forEach((match, i) => {
        console.log(`${i + 1}. Similarity: ${(match.similarity * 100).toFixed(1)}%`)
        console.log(`   Event 1: "${match.event1.name}" (ID: ${match.event1.id})`)
        console.log(`   Event 2: "${match.event2.name}" (ID: ${match.event2.id})`)
        console.log(`   Date: ${match.event1.date}`)
        console.log('')
      })
    }

  } catch (error) {
    console.error('❌ Analysis failed:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1

  if (longer.length === 0) return 1.0

  const editDistance = levenshteinDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
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
  await analyzeSpecificDuplicates()
  console.log('✅ Specific duplicate analysis complete!')
}

main().catch(console.error)