#!/usr/bin/env node

// Register ts-node to handle TypeScript imports
require('ts-node').register({
  project: './tsconfig.node.json'
})

// Test script to verify Wikipedia fighter detail scraping on a specific event
const { WikipediaUFCService } = require('../src/lib/scrapers/wikipediaService.ts')

async function testSpecificEvent() {
  console.log('🧪 Testing Wikipedia Fighter Detail Scraping on specific event...')
  console.log('===============================================================')

  try {
    const wikiService = new WikipediaUFCService()

    // Test with a known completed event that should have results
    const testUrl = 'https://en.wikipedia.org/wiki/UFC_294'

    console.log(`🔍 Testing URL: ${testUrl}`)

    const fightDetails = await wikiService.getEventDetails(testUrl)

    console.log(`✅ Found ${fightDetails.fights.length} fights and ${fightDetails.fighters.length} fighters`)

    if (fightDetails.fights.length > 0) {
      console.log('\n🥊 Fights found:')
      fightDetails.fights.slice(0, 5).forEach((fight, i) => {
        console.log(`   ${i + 1}. ${fight.fighter1Name} vs ${fight.fighter2Name}`)
        console.log(`      ⚖️ ${fight.weightClass} (${fight.cardPosition})`)
        console.log(`      🏆 Title: ${fight.titleFight ? 'Yes' : 'No'}`)
      })
    }

    if (fightDetails.fighters.length > 0) {
      console.log('\n👤 Fighters found:')
      fightDetails.fighters.slice(0, 5).forEach((fighter, i) => {
        console.log(`   ${i + 1}. ${fighter.name}`)
        console.log(`      🔗 URL: ${fighter.wikipediaUrl || 'No URL'}`)
      })
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

// Run the test
testSpecificEvent().catch(console.error)