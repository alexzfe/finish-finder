#!/usr/bin/env node

// Register ts-node to handle TypeScript imports
require('ts-node').register({
  project: './tsconfig.node.json'
})

// Test script for improved Wikipedia fighter data parsing
const { WikipediaUFCService } = require('../src/lib/scrapers/wikipediaService.ts')

async function testImprovedParsing() {
  console.log('🧪 Testing Improved Wikipedia Fighter Data Parsing')
  console.log('================================================')

  try {
    const wikiService = new WikipediaUFCService()

    // Test with actual upcoming UFC 321: Aspinall vs. Gane
    console.log('🎯 Testing fight card extraction from upcoming UFC 321: Aspinall vs. Gane...')
    const result = await wikiService.getEventDetails('https://en.wikipedia.org/wiki/UFC_321')

    console.log(`\n📊 RESULTS:`)
    console.log(`Fights found: ${result.fights.length}`)
    console.log(`Fighters found: ${result.fighters.length}`)

    if (result.fights.length > 0) {
      console.log(`\n🥊 FIGHTS:`)
      result.fights.forEach((fight, i) => {
        console.log(`${i + 1}. ${fight.fighter1Name} vs ${fight.fighter2Name}`)
        console.log(`   Weight Class: ${fight.weightClass}`)
        console.log(`   Card Position: ${fight.cardPosition}`)
        console.log(`   Title Fight: ${fight.titleFight}`)
        console.log('')
      })

      console.log(`\n👥 FIGHTERS:`)
      result.fighters.slice(0, 10).forEach((fighter, i) => {
        console.log(`${i + 1}. ${fighter.name} (ID: ${fighter.id})`)
      })

      if (result.fighters.length > 10) {
        console.log(`... and ${result.fighters.length - 10} more fighters`)
      }

      console.log(`\n✅ DATA QUALITY CHECK:`)
      const validFights = result.fights.filter(f =>
        f.fighter1Name && f.fighter2Name &&
        f.fighter1Name.length > 2 && f.fighter2Name.length > 2 &&
        !/^\d/.test(f.fighter1Name) && !/^\d/.test(f.fighter2Name)
      )
      console.log(`Valid fights: ${validFights.length}/${result.fights.length}`)

      const badFights = result.fights.filter(f =>
        /^\d/.test(f.fighter1Name) || /^\d/.test(f.fighter2Name) ||
        f.fighter1Name.includes('(') || f.fighter2Name.includes(')')
      )

      if (badFights.length > 0) {
        console.log(`\n❌ PROBLEMATIC FIGHTS DETECTED:`)
        badFights.forEach((fight, i) => {
          console.log(`${i + 1}. "${fight.fighter1Name}" vs "${fight.fighter2Name}"`)
        })
      } else {
        console.log(`✅ All fights have clean fighter names!`)
      }

    } else {
      console.log(`❌ No fights found - this might indicate an issue with fight card detection`)
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

testImprovedParsing().catch(console.error)