#!/usr/bin/env node

const axios = require('axios')
const cheerio = require('cheerio')

async function debugPageTitle() {
  console.log('🔍 Debugging UFC 320 Page Title')
  console.log('==============================')

  try {
    const url = 'https://en.wikipedia.org/wiki/UFC_320'
    console.log(`📄 Fetching: ${url}`)

    const response = await axios.get(url)
    const $ = cheerio.load(response.data)

    const pageTitle = $('h1#firstHeading').text().trim()
    console.log(`📝 Page Title: "${pageTitle}"`)

    // Test the regex pattern
    const titleMatch = pageTitle.match(/UFC.*?:\s*(.+?)\s+vs\.?\s+(.+?)(?:\s+\d+)?(?:\s|$)/i)

    if (titleMatch) {
      console.log('✅ Title matches pattern!')
      console.log(`   Fighter 1: "${titleMatch[1]}"`)
      console.log(`   Fighter 2: "${titleMatch[2]}"`)
    } else {
      console.log('❌ Title does not match pattern')

      // Try simpler patterns
      const simpleMatch = pageTitle.match(/(.+?)\s+vs\.?\s+(.+)/i)
      if (simpleMatch) {
        console.log(`🤔 Would match simpler pattern: "${simpleMatch[1]}" vs "${simpleMatch[2]}"`)
      }
    }

    // Show other headings on the page
    console.log('\n📋 Other headings on page:')
    $('h2, h3').slice(0, 5).each((i, element) => {
      console.log(`   ${$(element).text().trim()}`)
    })

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

debugPageTitle().catch(console.error)