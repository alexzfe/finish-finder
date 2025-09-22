#!/usr/bin/env node

const axios = require('axios')
const cheerio = require('cheerio')

async function debugUFC320Content() {
  console.log('🔍 Debugging UFC 320 Content Structure')
  console.log('=====================================')

  try {
    const url = 'https://en.wikipedia.org/wiki/UFC_320'
    console.log(`📄 Fetching: ${url}`)

    const response = await axios.get(url)
    const $ = cheerio.load(response.data)

    console.log('\n🔍 Looking for main event info...')

    // Check infobox
    const infobox = $('.infobox')
    if (infobox.length) {
      console.log('\n📋 Infobox content:')
      infobox.find('tr').each((i, row) => {
        const $row = $(row)
        const header = $row.find('th').text().trim()
        const data = $row.find('td').text().trim()
        if (header && data) {
          console.log(`   ${header}: ${data}`)
        }
      })
    }

    // Check for headings that might contain main event info
    console.log('\n📋 All text containing "vs" or "main"...')
    const pageText = $('body').text()
    const vsMatches = pageText.match(/[^.\n]{0,100}(?:vs\.?|main event)[^.\n]{0,100}/gi)
    if (vsMatches) {
      vsMatches.slice(0, 5).forEach((match, i) => {
        console.log(`   ${i + 1}. "${match.trim()}"`)
      })
    }

    // Check under Fight card section
    console.log('\n🥊 Looking under "Fight card" section...')
    $('h2, h3, h4').each((_, element) => {
      const $heading = $(element)
      const text = $heading.text().trim().toLowerCase()

      if (text.includes('fight card') || text.includes('main card')) {
        console.log(`\nFound section: "${$heading.text()}"`)
        const content = $heading.nextUntil('h2, h3, h4')
        console.log(`Content preview: "${content.text().substring(0, 200)}..."`)
      }
    })

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

debugUFC320Content().catch(console.error)