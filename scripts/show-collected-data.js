#!/usr/bin/env node

// Register ts-node to handle TypeScript imports
require('ts-node').register({
  project: './tsconfig.node.json'
})

// Test script to show actual collected fight and fighter data
const { HybridUFCService } = require('../src/lib/ai/hybridUFCService.ts')

async function showCollectedData() {
  console.log('📊 Showing Actual Fight & Fighter Data Collected')
  console.log('==============================================')

  try {
    const hybridService = new HybridUFCService(false) // No AI predictions

    console.log('\n🔍 Collecting data from Wikipedia-first scraper...')
    const result = await hybridService.getUpcomingUFCEvents(50) // Collect ALL upcoming events

    console.log(`\n📈 SUMMARY:`)
    console.log(`Total Events: ${result.events.length}`)
    console.log(`Total Fighters: ${result.fighters.length}`)
    console.log(`Total Fights: ${result.events.reduce((sum, event) => sum + event.fightCard.length, 0)}`)

    console.log(`\n🎯 FIGHT DATA STRUCTURE:`)
    result.events.forEach((event, i) => {
      console.log(`\n--- EVENT ${i + 1}: ${event.name} ---`)
      console.log(`Date: ${event.date}`)
      console.log(`Venue: ${event.venue}`)
      console.log(`Location: ${event.location}`)
      console.log(`Fight Card Length: ${event.fightCard.length}`)

      if (event.fightCard.length > 0) {
        console.log(`\nFIGHTS:`)
        event.fightCard.forEach((fight, j) => {
          console.log(`  Fight ${j + 1}:`)
          console.log(`    ID: ${fight.id}`)
          console.log(`    Fighter 1: "${fight.fighter1Name}" (ID: ${fight.fighter1Id})`)
          console.log(`    Fighter 2: "${fight.fighter2Name}" (ID: ${fight.fighter2Id})`)
          console.log(`    Weight Class: "${fight.weightClass}"`)
          console.log(`    Card Position: "${fight.cardPosition}"`)
          console.log(`    Title Fight: ${fight.titleFight}`)
          console.log(`    Scheduled Rounds: ${fight.scheduledRounds}`)
          console.log(`    Status: "${fight.status}"`)
        })
      } else {
        console.log(`  No fights found`)
      }
    })

    console.log(`\n👥 FIGHTER DATA STRUCTURE:`)
    const sampleFighters = result.fighters.slice(0, 5) // Show first 5 fighters
    sampleFighters.forEach((fighter, i) => {
      console.log(`\n--- FIGHTER ${i + 1} ---`)
      console.log(`ID: ${fighter.id}`)
      console.log(`Name: "${fighter.name}"`)
      console.log(`Nickname: "${fighter.nickname}"`)
      console.log(`Record: "${fighter.record}"`)
      console.log(`Weight Class: "${fighter.weightClass}"`)
      console.log(`Age: ${fighter.age}`)
      console.log(`Height: "${fighter.height}"`)
      console.log(`Reach: "${fighter.reach}"`)
      console.log(`Nationality: "${fighter.nationality}"`)
      console.log(`Fighting Style: "${fighter.fightingStyle}"`)
      console.log(`Wins: ${fighter.wins}`)
      console.log(`Losses: ${fighter.losses}`)
      console.log(`Draws: ${fighter.draws}`)
    })

    if (result.fighters.length > 5) {
      console.log(`\n... and ${result.fighters.length - 5} more fighters`)
    }

    console.log(`\n🔍 DATA QUALITY ANALYSIS:`)
    const fightsWithValidNames = result.events.flatMap(e => e.fightCard).filter(f =>
      f.fighter1Name && f.fighter2Name &&
      f.fighter1Name !== 'Unknown' && f.fighter2Name !== 'Unknown' &&
      !f.fighter1Name.includes('(') && !f.fighter2Name.includes('(')
    )
    console.log(`Valid fights (with proper fighter names): ${fightsWithValidNames.length}`)

    const fightersWithValidNames = result.fighters.filter(f =>
      f.name && f.name !== 'Unknown' && !f.name.includes('(')
    )
    console.log(`Valid fighters (with proper names): ${fightersWithValidNames.length}`)

    const fightsWithWeightClass = result.events.flatMap(e => e.fightCard).filter(f =>
      f.weightClass && f.weightClass !== 'Unknown'
    )
    console.log(`Fights with weight class data: ${fightsWithWeightClass.length}`)

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

showCollectedData().catch(console.error)