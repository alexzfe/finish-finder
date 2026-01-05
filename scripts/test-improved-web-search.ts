#!/usr/bin/env node
/**
 * Test Script for Improved Fighter Context Service
 *
 * Usage:
 *   npx ts-node scripts/test-improved-web-search.ts
 *   npx ts-node scripts/test-improved-web-search.ts --fighter="Jon Jones"
 *   npx ts-node scripts/test-improved-web-search.ts --compare
 */

// Load environment variables
import { config } from 'dotenv'
import { existsSync } from 'fs'
const envPath = '.env.local'
if (existsSync(envPath)) {
  config({ path: envPath })
}

import { ImprovedFighterContextService } from '../src/lib/ai/improvedFighterContextService'
import { FighterContextService } from '../src/lib/ai/fighterContextService'
import { getDefaultSearchFunction } from '../src/lib/ai/webSearchWrapper'

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2)
  return {
    fighter: args.find(arg => arg.startsWith('--fighter='))?.split('=')[1] || 'Jon Jones',
    compare: args.includes('--compare'),
  }
}

/**
 * Test improved service with a single fighter
 */
async function testImprovedService(fighterName: string) {
  console.log('🧪 Testing Improved Fighter Context Service')
  console.log('============================================\n')

  try {
    const searchFunction = getDefaultSearchFunction()
    const service = new ImprovedFighterContextService(searchFunction)

    // Test with different fighter profiles
    const testCases = [
      {
        name: fighterName,
        stats: { isTitleHolder: true, winStreak: 3 },
        description: 'Champion on win streak'
      },
      {
        name: fighterName,
        stats: { isRanked: true, lossStreak: 2 },
        description: 'Ranked fighter needing bounce back'
      },
      {
        name: fighterName,
        stats: undefined,
        description: 'No additional context'
      }
    ]

    for (const testCase of testCases) {
      console.log(`\n📋 Test Case: ${testCase.description}`)
      console.log(`Fighter: ${testCase.name}`)
      console.log(`Stats:`, testCase.stats || 'None provided')
      console.log('---')

      const context = await service.getFighterContext(
        testCase.name,
        new Date(),
        testCase.stats
      )

      // Display results
      console.log(`\n✅ Results:`)
      console.log(`  Quality: ${context.searchQuality}`)
      console.log(`  Attempts: ${context.queriesAttempted}`)
      console.log(`  Success: ${context.searchSuccessful}`)
      console.log(`  Length: ${context.recentNews.length} chars`)
      console.log(`\n📰 Context Preview (first 300 chars):`)
      console.log(`  ${context.recentNews.substring(0, 300)}...`)
      console.log('\n' + '='.repeat(60))
    }

    // Display cache stats
    console.log('\n📊 Cache Statistics:')
    const cacheStats = service.getCacheStats()
    console.log(`  Size: ${cacheStats.size} entries`)
    console.log(`  Entries:`)
    cacheStats.entries.forEach(entry => {
      const ageSeconds = Math.floor(entry.age / 1000)
      console.log(`    - ${entry.fighter}: ${entry.quality} quality (${ageSeconds}s ago)`)
    })

  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  }
}

/**
 * Compare old vs new service
 */
async function compareServices(fighterName: string) {
  console.log('⚖️  Comparing Old vs New Fighter Context Service')
  console.log('================================================\n')

  try {
    const searchFunction = getDefaultSearchFunction()

    const oldService = new FighterContextService(searchFunction)
    const newService = new ImprovedFighterContextService(searchFunction)

    console.log(`Testing with: ${fighterName}`)
    console.log('---\n')

    // Test old service
    console.log('🔵 OLD SERVICE:')
    const startOld = Date.now()
    const oldContext = await oldService.getFighterContext(fighterName, new Date())
    const timeOld = Date.now() - startOld

    console.log(`  Time: ${timeOld}ms`)
    console.log(`  Success: ${oldContext.searchSuccessful}`)
    console.log(`  Length: ${oldContext.recentNews.length} chars`)
    console.log(`  Preview: ${oldContext.recentNews.substring(0, 150)}...`)

    console.log('\n')

    // Test new service
    console.log('🟢 NEW SERVICE:')
    const startNew = Date.now()
    const newContext = await newService.getFighterContext(
      fighterName,
      new Date(),
      { isTitleHolder: true }  // Add context
    )
    const timeNew = Date.now() - startNew

    console.log(`  Time: ${timeNew}ms`)
    console.log(`  Success: ${newContext.searchSuccessful}`)
    console.log(`  Quality: ${newContext.searchQuality}`)
    console.log(`  Attempts: ${newContext.queriesAttempted}`)
    console.log(`  Length: ${newContext.recentNews.length} chars`)
    console.log(`  Preview: ${newContext.recentNews.substring(0, 150)}...`)

    // Comparison
    console.log('\n📊 COMPARISON:')
    console.log(`  ├─ Length difference: ${newContext.recentNews.length - oldContext.recentNews.length > 0 ? '+' : ''}${newContext.recentNews.length - oldContext.recentNews.length} chars`)
    console.log(`  ├─ Time difference: ${timeNew - timeOld > 0 ? '+' : ''}${timeNew - timeOld}ms`)
    console.log(`  ├─ New features: Quality scoring (${newContext.searchQuality}), Multi-attempt (${newContext.queriesAttempted} attempts)`)
    console.log(`  └─ Recommendation: ${newContext.searchQuality === 'high' || newContext.searchQuality === 'medium' ? '✅ New service provides better context' : '⚠️  Results similar, consider use case'}`)

  } catch (error) {
    console.error('❌ Comparison failed:', error)
    throw error
  }
}

/**
 * Main test runner
 */
async function main() {
  const args = parseArgs()

  console.log('🚀 Improved Web Search Test Runner')
  console.log('===================================\n')

  // Check environment
  if (!process.env.BRAVE_SEARCH_API_KEY) {
    console.error('❌ Error: BRAVE_SEARCH_API_KEY not set in .env.local')
    console.error('\nPlease add your Brave Search API key:')
    console.error('  1. Get free API key: https://brave.com/search/api/')
    console.error('  2. Add to .env.local: BRAVE_SEARCH_API_KEY=your_key_here')
    console.error('  3. Free tier: 2,000 queries/month\n')
    process.exit(1)
  }

  try {
    if (args.compare) {
      await compareServices(args.fighter)
    } else {
      await testImprovedService(args.fighter)
    }

    console.log('\n✅ Test completed successfully!')
  } catch (error) {
    console.error('\n❌ Test failed with error:', error)
    process.exit(1)
  }
}

// Run the test
main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
