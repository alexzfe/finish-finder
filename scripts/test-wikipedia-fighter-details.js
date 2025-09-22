#!/usr/bin/env node

// Register ts-node to handle TypeScript imports
require('ts-node').register({
  project: './tsconfig.node.json'
})

// Test script to verify Wikipedia fighter detail scraping
const { WikipediaUFCService } = require('../src/lib/scrapers/wikipediaService.ts')
const { HybridUFCService } = require('../src/lib/ai/hybridUFCService.ts')

async function testWikipediaFighterDetails() {
  console.log('🧪 Testing Wikipedia Fighter Detail Scraping...')
  console.log('============================================')

  try {
    // Test 1: Get Wikipedia events with URLs
    console.log('\n📋 Step 1: Fetch Wikipedia events...')
    const wikiService = new WikipediaUFCService()
    const events = await wikiService.getUpcomingEvents(3)

    if (events.length === 0) {
      console.log('❌ No events found from Wikipedia')
      return
    }

    console.log(`✅ Found ${events.length} Wikipedia events:`)
    events.forEach((event, i) => {
      console.log(`   ${i + 1}. ${event.name}`)
      console.log(`      📅 Date: ${event.date}`)
      console.log(`      📍 Location: ${event.venue}, ${event.location}`)
      console.log(`      🔗 URL: ${event.wikipediaUrl || 'NO URL'}`)
    })

    // Test 2: Try to fetch fight details for first event with URL
    const eventWithUrl = events.find(e => e.wikipediaUrl)
    if (!eventWithUrl) {
      console.log('\n❌ No events have Wikipedia URLs')
      return
    }

    console.log(`\n🔍 Step 2: Fetch fight details for: ${eventWithUrl.name}`)
    console.log(`URL: ${eventWithUrl.wikipediaUrl}`)

    const fightDetails = await wikiService.getEventDetails(eventWithUrl.wikipediaUrl)

    console.log(`✅ Found ${fightDetails.fights.length} fights and ${fightDetails.fighters.length} fighters`)

    if (fightDetails.fights.length > 0) {
      console.log('\n🥊 Fights found:')
      fightDetails.fights.slice(0, 3).forEach((fight, i) => {
        console.log(`   ${i + 1}. ${fight.fighter1Name} vs ${fight.fighter2Name}`)
        console.log(`      ⚖️ ${fight.weightClass} (${fight.cardPosition})`)
        console.log(`      🏆 Title: ${fight.titleFight ? 'Yes' : 'No'}`)
      })
    }

    if (fightDetails.fighters.length > 0) {
      console.log('\n👤 Fighters found:')
      fightDetails.fighters.slice(0, 3).forEach((fighter, i) => {
        console.log(`   ${i + 1}. ${fighter.name}`)
        console.log(`      🔗 URL: ${fighter.wikipediaUrl || 'No URL'}`)
      })
    }

    // Test 3: Test with hybrid service
    console.log(`\n🔄 Step 3: Test with Hybrid Service...`)
    const hybridService = new HybridUFCService(false) // No AI
    const result = await hybridService.getUpcomingUFCEvents(2)

    console.log(`✅ Hybrid service found ${result.events.length} events`)
    if (result.events.length > 0) {
      const eventWithFights = result.events.find(e => e.fightCard.length > 0)
      if (eventWithFights) {
        console.log(`🎯 Found event with fight card: ${eventWithFights.name}`)
        console.log(`   Fights: ${eventWithFights.fightCard.length}`)
        console.log(`   Fighters: ${result.fighters.length}`)
      } else {
        console.log(`⚠️ No events have fight cards populated`)
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error('Stack:', error.stack)
  }
}

// Run the test
testWikipediaFighterDetails().catch(console.error)