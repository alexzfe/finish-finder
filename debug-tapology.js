#!/usr/bin/env node

// Simple debugging script for Tapology parsing issues
require('ts-node').register({
  project: './tsconfig.node.json'
})

const { TapologyUFCService } = require('./src/lib/scrapers/tapologyService.ts')

async function debugTapology() {
  console.log('🔍 Starting Tapology debug session...')

  const tapology = new TapologyUFCService()

  try {
    // Test 1: Get upcoming events list
    console.log('\n📋 Testing getUpcomingEvents...')
    const events = await tapology.getUpcomingEvents(3)
    console.log(`Found ${events.length} events:`)
    events.forEach((event, i) => {
      console.log(`  ${i + 1}. "${event.name}" - ${event.date} - ${event.tapologyUrl || 'No URL'}`)
    })

    if (events.length > 0) {
      // Test 2: Get fight details for first event
      const firstEvent = events[0]
      if (firstEvent.tapologyUrl) {
        console.log(`\n🥊 Testing getEventFights for: ${firstEvent.name}`)
        const fightDetails = await tapology.getEventFights(firstEvent.tapologyUrl)
        console.log(`Event fights result:`)
        console.log(`  - Event Name: ${fightDetails.eventName || 'Not found'}`)
        console.log(`  - Fights: ${fightDetails.fights?.length || 0}`)
        console.log(`  - Fighters: ${fightDetails.fighters?.length || 0}`)

        if (fightDetails.fights && fightDetails.fights.length > 0) {
          console.log(`\n🎯 First few fights:`)
          fightDetails.fights.slice(0, 3).forEach((fight, i) => {
            console.log(`    ${i + 1}. ${fight.fighter1Name} vs ${fight.fighter2Name} (${fight.weightClass || 'Unknown'})`)
          })
        }
      } else {
        console.log(`⚠️ First event has no tapologyUrl, cannot test fight details`)
      }
    }

  } catch (error) {
    console.error('❌ Debug session failed:', error.message)
    console.error('Stack:', error.stack)
  }
}

debugTapology()