#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client')

async function showFights() {
  const prisma = new PrismaClient()

  try {
    console.log('🥊 UFC Fights Collection')
    console.log('=' .repeat(80))

    const fights = await prisma.fight.findMany({
      include: {
        fighter1: true,
        fighter2: true,
        event: true
      },
      orderBy: [
        { event: { date: 'asc' } },
        { createdAt: 'asc' }
      ]
    })

    if (fights.length === 0) {
      console.log('No fights found in database.')
      return
    }

    console.log(`\n📊 Total Fights Found: ${fights.length}`)
    console.log('─'.repeat(80))

    let currentEventName = ''
    let eventFightCount = 0

    fights.forEach((fight, index) => {
      // Group by event
      if (currentEventName !== fight.event.name) {
        if (currentEventName !== '') {
          console.log(`   └─ ${eventFightCount} fights total\n`)
        }
        currentEventName = fight.event.name
        eventFightCount = 0

        console.log(`\n📅 ${fight.event.name}`)
        console.log(`   📍 Date: ${fight.event.date.toISOString().split('T')[0]}`)
        console.log(`   📍 Location: ${fight.event.location}, ${fight.event.venue}`)
      }

      eventFightCount++

      // Format fighter display
      const fighter1Display = `${fight.fighter1.name}${fight.fighter1.nickname ? ` "${fight.fighter1.nickname}"` : ''}`
      const fighter2Display = `${fight.fighter2.name}${fight.fighter2.nickname ? ` "${fight.fighter2.nickname}"` : ''}`

      const position = fight.cardPosition === 'main' ? '🏆 MAIN' : '📋 PRELIM'
      const title = fight.titleFight ? '👑 TITLE' : ''
      const weight = fight.weightClass !== 'unknown' ? `(${fight.weightClass})` : ''

      console.log(`   ${eventFightCount}. ${position} ${title} ${weight}`)
      console.log(`      ${fighter1Display}`)
      console.log(`      vs`)
      console.log(`      ${fighter2Display}`)

      // Show fighter details if available
      if (fight.fighter1.record || fight.fighter2.record) {
        const f1Record = fight.fighter1.record || 'No record'
        const f2Record = fight.fighter2.record || 'No record'
        console.log(`      Records: ${f1Record} vs ${f2Record}`)
      }

      if (fight.fighter1.ranking || fight.fighter2.ranking) {
        const f1Ranking = fight.fighter1.ranking ? `#${fight.fighter1.ranking}` : 'Unranked'
        const f2Ranking = fight.fighter2.ranking ? `#${fight.fighter2.ranking}` : 'Unranked'
        console.log(`      Rankings: ${f1Ranking} vs ${f2Ranking}`)
      }

      console.log('')
    })

    if (currentEventName !== '') {
      console.log(`   └─ ${eventFightCount} fights total\n`)
    }

    // Summary statistics
    console.log('📈 Fight Statistics:')
    console.log('─'.repeat(40))

    const mainEvents = fights.filter(f => f.cardPosition === 'main').length
    const titleFights = fights.filter(f => f.titleFight).length
    const weightClasses = [...new Set(fights.map(f => f.weightClass))].filter(w => w !== 'unknown')
    const uniqueFighters = new Set()
    fights.forEach(f => {
      uniqueFighters.add(f.fighter1.name)
      uniqueFighters.add(f.fighter2.name)
    })

    console.log(`🏆 Main Events: ${mainEvents}`)
    console.log(`👑 Title Fights: ${titleFights}`)
    console.log(`👥 Unique Fighters: ${uniqueFighters.size}`)
    console.log(`⚖️ Weight Classes: ${weightClasses.length > 0 ? weightClasses.join(', ') : 'All unknown'}`)

    // Show fighters with nicknames
    const fightersWithNicknames = []
    fights.forEach(f => {
      if (f.fighter1.nickname) fightersWithNicknames.push(`${f.fighter1.name} "${f.fighter1.nickname}"`)
      if (f.fighter2.nickname) fightersWithNicknames.push(`${f.fighter2.name} "${f.fighter2.nickname}"`)
    })

    const uniqueNicknames = [...new Set(fightersWithNicknames)]
    if (uniqueNicknames.length > 0) {
      console.log(`\n🏷️ Fighters with Nicknames (${uniqueNicknames.length}):`)
      uniqueNicknames.slice(0, 15).forEach(fighter => {
        console.log(`   • ${fighter}`)
      })
      if (uniqueNicknames.length > 15) {
        console.log(`   ... and ${uniqueNicknames.length - 15} more`)
      }
    }

  } catch (error) {
    console.error('❌ Failed to show fights:', error)
  } finally {
    await prisma.$disconnect()
  }
}

showFights()