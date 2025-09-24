#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client')

async function showEvents() {
  const prisma = new PrismaClient()

  try {
    console.log('🎯 UFC Events Collection')
    console.log('=' .repeat(80))

    const events = await prisma.event.findMany({
      include: {
        fights: {
          include: {
            fighter1: true,
            fighter2: true
          },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { date: 'asc' }
    })

    if (events.length === 0) {
      console.log('No events found in database.')
      return
    }

    events.forEach((event, eventIndex) => {
      console.log(`\n📅 Event ${eventIndex + 1}: ${event.name}`)
      console.log(`   📍 Date: ${event.date.toISOString().split('T')[0]}`)
      console.log(`   📍 Location: ${event.location}`)
      console.log(`   📍 Venue: ${event.venue}`)
      console.log(`   📍 Status: ${event.completed ? 'Completed' : 'Upcoming'}`)
      console.log(`   📍 Created: ${event.createdAt.toISOString().split('T')[0]}`)

      if (event.fights.length > 0) {
        console.log(`   ⚔️  Fight Card (${event.fights.length} fights):`)
        event.fights.forEach((fight, fightIndex) => {
          const fighter1 = fight.fighter1.name
          const fighter2 = fight.fighter2.name
          const position = fight.cardPosition === 'main' ? '🏆 MAIN' : '📋 CARD'
          const title = fight.titleFight ? '👑 TITLE' : ''
          const weight = fight.weightClass !== 'unknown' ? `(${fight.weightClass})` : ''

          console.log(`      ${fightIndex + 1}. ${position} ${title}`)
          console.log(`         ${fighter1} vs ${fighter2} ${weight}`)
        })
      } else {
        console.log(`   ⚠️  No fights found for this event`)
      }

      console.log('   ' + '─'.repeat(60))
    })

    // Summary stats
    const totalFights = events.reduce((sum, event) => sum + event.fights.length, 0)
    const mainEvents = events.reduce((sum, event) => sum + event.fights.filter(f => f.cardPosition === 'main').length, 0)
    const titleFights = events.reduce((sum, event) => sum + event.fights.filter(f => f.titleFight).length, 0)

    console.log(`\n📊 Collection Summary:`)
    console.log(`   🎯 Total Events: ${events.length}`)
    console.log(`   ⚔️  Total Fights: ${totalFights}`)
    console.log(`   🏆 Main Events: ${mainEvents}`)
    console.log(`   👑 Title Fights: ${titleFights}`)
    console.log(`   📅 Date Range: ${events[0].date.toISOString().split('T')[0]} to ${events[events.length - 1].date.toISOString().split('T')[0]}`)

  } catch (error) {
    console.error('❌ Failed to show events:', error)
  } finally {
    await prisma.$disconnect()
  }
}

showEvents()