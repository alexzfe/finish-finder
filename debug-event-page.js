#!/usr/bin/env node

// Debug script to check Tapology event page structure
const axios = require('axios')
const cheerio = require('cheerio')

async function debugEventPage() {
  console.log('🔍 Analyzing Tapology event page structure...')

  try {
    const eventUrl = 'https://www.tapology.com/fightcenter/events/132921-ufc-fight-night'

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    }

    console.log(`📡 Fetching: ${eventUrl}`)
    const response = await axios.get(eventUrl, { headers, timeout: 15000 })
    const $ = cheerio.load(response.data)

    console.log('\n📋 Checking for fight-related elements:')

    // Test common selectors
    const selectors = [
      '.fight_card_bout', '.bout', '.fight_listing', '.bout_listing',
      '.fight', '.card_bout', '.event_bout', '.matchup',
      'tr:contains("vs")', 'div:contains("vs")', 'li:contains("vs")',
      'a[href*="/bouts/"]', 'a[href*="/fighters/"]'
    ]

    for (const selector of selectors) {
      const elements = $(selector)
      if (elements.length > 0) {
        console.log(`✅ ${selector}: Found ${elements.length} elements`)

        // Show sample content from first few elements
        elements.slice(0, 3).each((i, el) => {
          const text = $(el).text().trim().substring(0, 100)
          console.log(`   ${i + 1}. "${text}..."`)
        })
      }
    }

    console.log('\n🔍 Looking for common UFC fight patterns...')
    const text = $.text()
    const vsMatches = text.match(/\w+\s+vs\.?\s+\w+/gi)
    if (vsMatches && vsMatches.length > 0) {
      console.log(`📝 Found ${vsMatches.length} "vs" patterns:`)
      vsMatches.slice(0, 5).forEach((match, i) => {
        console.log(`   ${i + 1}. ${match}`)
      })
    }

    console.log('\n🎯 Checking specific fight bout links...')
    const boutLinks = $('a[href*="/bouts/"]')
    console.log(`Found ${boutLinks.length} bout links`)
    boutLinks.slice(0, 3).each((i, el) => {
      const href = $(el).attr('href')
      const text = $(el).text().trim()
      console.log(`   ${i + 1}. "${text}" -> ${href}`)
    })

  } catch (error) {
    console.error('❌ Debug failed:', error.message)
  }
}

debugEventPage()