#!/usr/bin/env node

// Register ts-node to handle TypeScript imports
require('ts-node').register({
  project: './tsconfig.node.json'
})

// Test script to verify browser headers work against Sherdog
const { HybridUFCService } = require('../src/lib/ai/hybridUFCService.ts')

async function testBrowserHeaders() {
  console.log('🧪 Testing browser headers against Sherdog...')
  console.log(`📍 Testing from IP: ${process.env.NODE_ENV === 'test' ? 'Local' : 'Unknown'}`)

  const startTime = Date.now()

  try {
    const ufcService = new HybridUFCService(false) // Disable AI

    console.log('🔍 Attempting to fetch UFC events from Sherdog...')
    const result = await ufcService.getUpcomingUFCEvents(5)

    const duration = Date.now() - startTime

    if (result.events && result.events.length > 0) {
      console.log(`✅ SUCCESS! Fetched ${result.events.length} events in ${duration}ms`)
      console.log('📋 Events found:')
      result.events.forEach((event, i) => {
        console.log(`   ${i + 1}. ${event.name} (${event.date})`)
      })

      console.log(`👥 Found ${result.fighters.length} fighters`)
      console.log('🎯 Browser headers successfully bypassed bot detection!')

    } else {
      console.log(`❌ No events returned (${duration}ms)`)
      console.log('🤖 Might still be detected as bot or no upcoming events')
    }

  } catch (error) {
    const duration = Date.now() - startTime

    if (error.response?.status === 403) {
      console.log(`🚫 HTTP 403 BLOCKED (${duration}ms)`)
      console.log('🤖 Bot detection still active - headers not sufficient')
      console.log(`🌐 Response: ${error.response.statusText}`)
    } else if (error.code === 'SHERDOG_BLOCKED') {
      console.log(`🚫 SHERDOG BLOCKED (${duration}ms)`)
      console.log('🤖 Still being detected as automated traffic')
    } else {
      console.log(`❌ ERROR (${duration}ms): ${error.message}`)
      console.log('🔧 Technical issue, not necessarily blocking')
    }
  }
}

// Run the test
testBrowserHeaders().catch(console.error)