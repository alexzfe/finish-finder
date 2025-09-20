#!/usr/bin/env node

const { HybridUFCService } = require('../src/lib/ai/hybridUFCService.ts')

async function debugScraper() {
  const ufcService = new HybridUFCService()

  console.log('🔍 Debug: Fetching ALL events from Sherdog...')

  try {
    // Get raw events before filtering
    const rawEvents = await ufcService.searchRealUFCEvents(20) // Get more events

    console.log(`\n📊 Found ${rawEvents.length} raw events:`)
    console.log('=' .repeat(50))

    rawEvents.forEach((event, index) => {
      console.log(`${index + 1}. ${event.name}`)
      console.log(`   Date: ${event.date}`)
      console.log(`   Location: ${event.location}`)
      console.log(`   Venue: ${event.venue}`)
      console.log(`   Status: ${event.status}`)
      console.log(`   Detail URL: ${event.detailUrl}`)
      console.log()
    })

    // Check if UFC 320 and Fight Night 261 are in the raw results
    const ufc320 = rawEvents.find(e => e.name.includes('320'))
    const fightNight261 = rawEvents.find(e => e.name.includes('261') || e.name.includes('Oliveira vs. Fiziev'))

    console.log('🔍 Specific Events Check:')
    console.log(`UFC 320 found: ${ufc320 ? '✅ ' + ufc320.name : '❌ Not found'}`)
    console.log(`Fight Night 261 found: ${fightNight261 ? '✅ ' + fightNight261.name : '❌ Not found'}`)

  } catch (error) {
    console.error('❌ Debug scraper failed:', error.message)
  }
}

debugScraper()