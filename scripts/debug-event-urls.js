#!/usr/bin/env node

// Register ts-node to handle TypeScript imports
require('ts-node').register({
  project: './tsconfig.node.json'
})

// Test script to debug Wikipedia event URLs
const { WikipediaUFCService } = require('../src/lib/scrapers/wikipediaService.ts')

async function debugEventUrls() {
  console.log('🔍 Debugging Wikipedia Event URLs')
  console.log('================================')

  try {
    const wikiService = new WikipediaUFCService()
    const events = await wikiService.getUpcomingEvents(5)

    console.log(`Found ${events.length} events:`)

    events.forEach((event, i) => {
      console.log(`\n${i + 1}. ${event.name}`)
      console.log(`   Date: ${event.date}`)
      console.log(`   URL: ${event.wikipediaUrl || 'NO URL'}`)

      if (event.wikipediaUrl) {
        // Check if this looks like a valid event page URL
        const isValidEventUrl = event.wikipediaUrl.includes('/wiki/UFC') &&
                               !event.wikipediaUrl.includes('List_of_UFC_events')

        console.log(`   Valid Event URL: ${isValidEventUrl ? 'YES' : 'NO'}`)
      }
    })

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

debugEventUrls().catch(console.error)