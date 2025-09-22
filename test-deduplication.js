#!/usr/bin/env node

// Test script to validate the improved deduplication logic
const { AutomatedScraper } = require('./scripts/automated-scraper.js')

async function testDeduplication() {
  console.log('🧪 Testing Improved Deduplication Logic')
  console.log('=======================================\n')

  const scraper = new AutomatedScraper()

  // Test cases based on the duplicates we found
  const testCases = [
    {
      name: 'UFC Fight Night duplicates',
      event1: {
        name: 'UFC Fight Night: de Ridder vs. Allen',
        date: '2025-10-18'
      },
      event2: {
        name: 'UFC Fight Night 262 - De Ridder vs. Allen',
        date: '2025-10-18'
      },
      shouldMatch: true
    },
    {
      name: 'Oliveira vs Fiziev duplicates',
      event1: {
        name: 'UFC Fight Night: Oliveira vs. Fiziev',
        date: '2025-10-11'
      },
      event2: {
        name: 'UFC Fight Night 261 - Oliveira vs. Fiziev',
        date: '2025-10-11'
      },
      shouldMatch: true
    },
    {
      name: 'Different events (should not match)',
      event1: {
        name: 'UFC 320: Ankalaev vs. Pereira 2',
        date: '2025-10-04'
      },
      event2: {
        name: 'UFC Fight Night: Ulberg vs. Reyes',
        date: '2025-09-28'
      },
      shouldMatch: false
    },
    {
      name: 'Same event different dates (should not match)',
      event1: {
        name: 'UFC Fight Night: de Ridder vs. Allen',
        date: '2025-10-18'
      },
      event2: {
        name: 'UFC Fight Night: de Ridder vs. Allen',
        date: '2025-10-19'
      },
      shouldMatch: false
    }
  ]

  let passed = 0
  let failed = 0

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase.name}`)
    console.log(`  Event 1: "${testCase.event1.name}" (${testCase.event1.date})`)
    console.log(`  Event 2: "${testCase.event2.name}" (${testCase.event2.date})`)

    const result = scraper.eventsAreSame(testCase.event1, testCase.event2)
    const expected = testCase.shouldMatch

    console.log(`  Expected: ${expected}, Got: ${result}`)

    if (result === expected) {
      console.log('  ✅ PASS\n')
      passed++
    } else {
      console.log('  ❌ FAIL\n')
      failed++
    }
  }

  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`)

  // Test normalization function
  console.log('\n🔍 Testing Normalization Function:')

  const normalizationTests = [
    'UFC Fight Night: de Ridder vs. Allen',
    'UFC Fight Night 262 - De Ridder vs. Allen',
    'UFC 320: Ankalaev vs. Pereira 2',
    'UFC Fight Night: Oliveira vs. Fiziev'
  ]

  normalizationTests.forEach(name => {
    const normalized = scraper.normalizeEventName(name)
    console.log(`  "${name}" → "${normalized}"`)
  })

  console.log('\n✅ Deduplication test complete!')
}

testDeduplication().catch(console.error)