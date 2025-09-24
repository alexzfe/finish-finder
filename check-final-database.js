#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client')

async function checkDatabase() {
  const prisma = new PrismaClient()

  try {
    console.log('📊 Final Database State Report')
    console.log('=' .repeat(50))

    // Count events
    const events = await prisma.event.findMany({
      orderBy: { createdAt: 'desc' }
    })
    console.log(`📅 Total Events: ${events.length}`)

    events.forEach((event, i) => {
      console.log(`   ${i + 1}. ${event.name} (${event.date.toISOString().split('T')[0]}) - ${event.location}`)
    })

    // Count fighters
    const fighters = await prisma.fighter.findMany({
      orderBy: { createdAt: 'desc' }
    })
    console.log(`\n🥊 Total Fighters: ${fighters.length}`)

    if (fighters.length <= 20) {
      fighters.forEach((fighter, i) => {
        console.log(`   ${i + 1}. ${fighter.name} (${fighter.weightClass})`)
      })
    } else {
      console.log(`   First 10:`)
      fighters.slice(0, 10).forEach((fighter, i) => {
        console.log(`   ${i + 1}. ${fighter.name} (${fighter.weightClass})`)
      })
      console.log(`   ... and ${fighters.length - 10} more`)
    }

    // Count fights
    const fights = await prisma.fight.findMany({
      include: {
        event: true,
        fighter1: true,
        fighter2: true
      },
      orderBy: { createdAt: 'desc' }
    })
    console.log(`\n⚔️ Total Fights: ${fights.length}`)

    console.log(`\nFights by Event:`)
    const fightsByEvent = {}
    fights.forEach(fight => {
      const eventName = fight.event.name
      if (!fightsByEvent[eventName]) {
        fightsByEvent[eventName] = []
      }
      fightsByEvent[eventName].push(fight)
    })

    Object.entries(fightsByEvent).forEach(([eventName, eventFights]) => {
      console.log(`   ${eventName}: ${eventFights.length} fights`)
      eventFights.slice(0, 3).forEach((fight, i) => {
        console.log(`      ${i + 1}. ${fight.fighter1.name} vs ${fight.fighter2.name}`)
      })
      if (eventFights.length > 3) {
        console.log(`      ... and ${eventFights.length - 3} more`)
      }
    })

    console.log(`\n🎯 Summary:`)
    console.log(`   ✅ ${events.length} UFC events scraped`)
    console.log(`   ✅ ${fighters.length} unique fighters created`)
    console.log(`   ✅ ${fights.length} fights scheduled`)
    console.log(`   ✅ Database successfully populated with upcoming events`)

  } catch (error) {
    console.error('❌ Database check failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkDatabase()