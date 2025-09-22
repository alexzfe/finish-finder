#!/usr/bin/env node

// Register ts-node to handle TypeScript imports
require('ts-node').register({
  project: './tsconfig.node.json'
})

const axios = require('axios')
const cheerio = require('cheerio')

async function debugWikipediaPage() {
  console.log('🔍 Debugging Wikipedia Event Page Structure')
  console.log('==========================================')

  try {
    const url = 'https://en.wikipedia.org/wiki/UFC_309'
    console.log(`📄 Analyzing: ${url}`)

    const response = await axios.get(url)
    const $ = cheerio.load(response.data)

    console.log('\n📋 Looking for headings containing fight card info...')
    $('h1, h2, h3, h4').each((i, element) => {
      const $heading = $(element)
      const text = $heading.text().trim().toLowerCase()

      if (text.includes('card') || text.includes('main') || text.includes('preliminary')) {
        console.log(`   ${$heading.prop('tagName')}: "${$heading.text().trim()}"`)

        // Show content after this heading
        const content = $heading.nextUntil('h1, h2, h3, h4')
        console.log(`   Content elements: ${content.length}`)

        if (content.length > 0) {
          const contentText = content.text().trim().substring(0, 200)
          console.log(`   Sample content: "${contentText}..."`)

          // Check for fight patterns
          const fights = content.text().match(/[^:]+vs\s+[^:\n]+/gi)
          if (fights) {
            console.log(`   Found fight patterns: ${fights.length}`)
            fights.slice(0, 3).forEach((fight, j) => {
              console.log(`     ${j + 1}. ${fight.trim()}`)
            })
          }
        }
        console.log('')
      }
    })

    console.log('\n🔍 Looking for any text containing "vs"...')
    const pageText = $('body').text()
    const vsMatches = pageText.match(/[^.\n]*\bvs\.?\s+[^.\n]*/gi)
    if (vsMatches) {
      console.log(`Found ${vsMatches.length} "vs" patterns:`)
      vsMatches.slice(0, 5).forEach((match, i) => {
        console.log(`   ${i + 1}. ${match.trim()}`)
      })
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

debugWikipediaPage().catch(console.error)