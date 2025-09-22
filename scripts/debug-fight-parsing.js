#!/usr/bin/env node

// Register ts-node to handle TypeScript imports
require('ts-node').register({
  project: './tsconfig.node.json'
})

const axios = require('axios')
const cheerio = require('cheerio')

async function debugFightParsing() {
  console.log('🔍 Debug Fight Parsing from Wikipedia Event Page')
  console.log('===============================================')

  try {
    const url = 'https://en.wikipedia.org/wiki/UFC_309'
    console.log(`📄 Analyzing: ${url}`)

    const response = await axios.get(url)
    const $ = cheerio.load(response.data)

    console.log('\n🔍 Looking for ALL text containing "vs"...')
    const allText = $('body').text()
    const vsMatches = allText.match(/[^\n]{0,50}vs\.?[^\n]{0,50}/gi)

    if (vsMatches) {
      console.log(`Found ${vsMatches.length} "vs" patterns:`)
      vsMatches.slice(0, 10).forEach((match, i) => {
        console.log(`   ${i + 1}. "${match.trim()}"`)
      })
    }

    // First, show all headings on the page
    console.log('\n📋 All headings on the page:')
    $('h1, h2, h3, h4').each((i, element) => {
      const $heading = $(element)
      console.log(`   ${$heading.prop('tagName')}: "${$heading.text().trim()}"`)
    })

    console.log('\n🔍 Looking for fight card sections...')
    const fightCardHeadings = ['main card', 'preliminary card', 'early preliminary card', 'fight card', 'main', 'preliminary', 'prelim']

    let foundSections = false
    fightCardHeadings.forEach(headingText => {
      $('h2, h3, h4').each((_, element) => {
        const $heading = $(element)
        const headingContent = $heading.text().trim().toLowerCase()

        if (headingContent.includes(headingText)) {
          foundSections = true
          console.log(`\n📋 Found section: "${$heading.text().trim()}"`)

          // Find content after this heading until the next major heading
          let content = $heading.nextUntil('h2, h3, h4')

          if (!content.length) {
            content = $heading.next()
          }

          console.log(`   Content elements: ${content.length}`)

          if (content.length > 0) {
            const contentText = content.text().trim()
            console.log(`   Content text (first 300 chars): "${contentText.substring(0, 300)}..."`)

            // Check for vs patterns in this content
            const contentVsMatches = contentText.match(/[^\n]{0,50}vs\.?[^\n]{0,50}/gi)
            if (contentVsMatches) {
              console.log(`   VS patterns in this section: ${contentVsMatches.length}`)
              contentVsMatches.forEach((match, j) => {
                console.log(`     ${j + 1}. "${match.trim()}"`)
              })
            }
          }
        }
      })
    })

    if (!foundSections) {
      console.log('\n❌ No fight card sections found!')
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

debugFightParsing().catch(console.error)