#!/usr/bin/env node

// Register ts-node to handle TypeScript imports
require('ts-node').register({
  project: './tsconfig.node.json'
})

// Test script to verify multiple data sources work
const { HybridUFCService } = require('../src/lib/ai/hybridUFCService.ts')
const { WikipediaUFCService } = require('../src/lib/scrapers/wikipediaService.ts')
const { TapologyUFCService } = require('../src/lib/scrapers/tapologyService.ts')

async function testDataSource(name, testFn) {
  console.log(`\n🧪 Testing ${name}...`)
  console.log('=' + '='.repeat(name.length + 10))

  const startTime = Date.now()

  try {
    const result = await testFn()
    const duration = Date.now() - startTime

    if (result && result.length > 0) {
      console.log(`✅ SUCCESS! Found ${result.length} events in ${duration}ms`)
      console.log('📋 Events found:')
      result.slice(0, 3).forEach((event, i) => {
        console.log(`   ${i + 1}. ${event.name} (${event.date})`)
        console.log(`      📍 ${event.venue}, ${event.location}`)
        if (event.source) console.log(`      🔗 Source: ${event.source}`)
      })
      if (result.length > 3) {
        console.log(`   ... and ${result.length - 3} more events`)
      }
      return true
    } else {
      console.log(`❌ No events returned (${duration}ms)`)
      return false
    }

  } catch (error) {
    const duration = Date.now() - startTime

    if (error.response?.status === 403) {
      console.log(`🚫 HTTP 403 BLOCKED (${duration}ms)`)
      console.log('🤖 Bot detection active')
    } else if (error.message.includes('BLOCKED')) {
      console.log(`🚫 BLOCKED (${duration}ms)`)
      console.log('🤖 Anti-scraping protection active')
    } else {
      console.log(`❌ ERROR (${duration}ms): ${error.message}`)
    }
    return false
  }
}

async function testAllSources() {
  console.log('🚀 Testing Multiple UFC Data Sources')
  console.log('=====================================')

  const results = {}

  // Test Wikipedia scraper
  results.wikipedia = await testDataSource('Wikipedia', async () => {
    const service = new WikipediaUFCService()
    return await service.getUpcomingEvents(5)
  })

  // Test Tapology scraper
  results.tapology = await testDataSource('Tapology', async () => {
    const service = new TapologyUFCService()
    return await service.getUpcomingEvents(5)
  })

  // Test Hybrid service (all sources with fallback)
  results.hybrid = await testDataSource('Hybrid Service (Sherdog → Wikipedia → Tapology)', async () => {
    const service = new HybridUFCService(false) // Disable AI
    const result = await service.getUpcomingUFCEvents(5)
    return result.events
  })

  // Summary
  console.log('\n📊 SUMMARY')
  console.log('===========')
  const successCount = Object.values(results).filter(Boolean).length
  const totalCount = Object.keys(results).length

  console.log(`✅ Working sources: ${successCount}/${totalCount}`)

  Object.entries(results).forEach(([source, success]) => {
    const icon = success ? '✅' : '❌'
    console.log(`${icon} ${source.charAt(0).toUpperCase() + source.slice(1)}`)
  })

  if (successCount > 0) {
    console.log('\n🎯 Great! You have working backup data sources.')
    console.log('   The scraper will automatically fall back to working sources.')
  } else {
    console.log('\n⚠️  All sources are currently blocked or unavailable.')
    console.log('   Consider using different VPN locations or waiting before retrying.')
  }

  return results
}

// Run the tests
testAllSources().catch(console.error)