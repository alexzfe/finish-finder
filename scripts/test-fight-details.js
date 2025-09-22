#!/usr/bin/env node

// Register ts-node to handle TypeScript imports
require('ts-node').register({
  project: './tsconfig.node.json'
})

// Test script to verify Wikipedia fight and fighter details scraping
const { HybridUFCService } = require('../src/lib/ai/hybridUFCService.ts')

async function testFightDetails() {
  console.log('🥊 Testing Wikipedia Fight & Fighter Details Scraping')
  console.log('===================================================')

  try {
    const hybridService = new HybridUFCService(false) // No AI predictions

    console.log('\n🔍 Getting upcoming events with detailed fight cards...')
    const result = await hybridService.getUpcomingUFCEvents(3) // Test with 3 events

    console.log(`\n📊 RESULTS SUMMARY:`)
    console.log(`Events: ${result.events.length}`)
    console.log(`Total Fighters: ${result.fighters.length}`)
    console.log(`Total Fights: ${result.events.reduce((sum, event) => sum + event.fightCard.length, 0)}`)

    console.log(`\n🎯 DETAILED BREAKDOWN:`)

    result.events.forEach((event, i) => {
      console.log(`\n${i + 1}. ${event.name} (${event.date})`)
      console.log(`   📍 ${event.venue}, ${event.location}`)
      console.log(`   🥊 ${event.fightCard.length} fights scheduled`)

      if (event.fightCard.length > 0) {
        console.log(`   Fight Card:`)
        event.fightCard.forEach((fight, j) => {
          console.log(`     ${j + 1}. ${fight.fighter1Name} vs ${fight.fighter2Name}`)
          console.log(`        Weight: ${fight.weightClass} | Position: ${fight.cardPosition}`)
          console.log(`        Title: ${fight.titleFight ? 'Yes' : 'No'} | Rounds: ${fight.scheduledRounds}`)
        })
      }
    })

    console.log(`\n👥 FIGHTERS DETECTED:`)
    result.fighters.slice(0, 10).forEach((fighter, i) => {
      console.log(`   ${i + 1}. ${fighter.name}`)
      console.log(`      Record: ${fighter.record} | Weight: ${fighter.weightClass}`)
      console.log(`      Age: ${fighter.age} | Height: ${fighter.height} | Reach: ${fighter.reach}`)
      console.log(`      Nationality: ${fighter.nationality} | Style: ${fighter.fightingStyle}`)
    })

    if (result.fighters.length > 10) {
      console.log(`   ... and ${result.fighters.length - 10} more fighters`)
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

// Run the test
testFightDetails().catch(console.error)