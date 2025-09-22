#!/usr/bin/env node

const axios = require('axios')
const cheerio = require('cheerio')

async function debugResultsSection() {
  console.log('🔍 Debug Results Section on UFC 309')
  console.log('==================================')

  try {
    const url = 'https://en.wikipedia.org/wiki/UFC_309'
    console.log(`📄 Analyzing: ${url}`)

    const response = await axios.get(url)
    const $ = cheerio.load(response.data)

    console.log('\n🔍 Looking for Results section...')
    $('h2, h3, h4').each((_, element) => {
      const $heading = $(element)
      const headingText = $heading.text().trim().toLowerCase()

      if (headingText.includes('results')) {
        console.log(`\n📋 Found Results section: "${$heading.text().trim()}"`)

        // Get content after this heading
        const content = $heading.nextUntil('h2, h3, h4')
        console.log(`   Content elements: ${content.length}`)

        if (content.length > 0) {
          // Show raw HTML structure
          console.log('\n📄 Content HTML structure:')
          content.each((i, elem) => {
            const $elem = $(elem)
            console.log(`   ${i + 1}. <${elem.tagName}> "${$elem.text().trim().substring(0, 100)}${$elem.text().length > 100 ? '...' : ''}"`)
          })

          // Look for tables specifically
          const tables = content.find('table')
          console.log(`\n📊 Tables in Results section: ${tables.length}`)

          tables.each((i, table) => {
            const $table = $(table)
            console.log(`\nTable ${i + 1}:`)
            console.log(`   Classes: ${$table.attr('class') || 'none'}`)
            console.log(`   Headers: ${$table.find('th').length}`)
            console.log(`   Rows: ${$table.find('tr').length}`)

            // Show table headers
            $table.find('th').each((j, th) => {
              console.log(`     Header ${j + 1}: "${$(th).text().trim()}"`)
            })

            // Show first few rows
            $table.find('tr').slice(0, 3).each((j, tr) => {
              const $row = $(tr)
              const cells = $row.find('td')
              if (cells.length > 0) {
                console.log(`     Row ${j + 1}: ${cells.length} cells`)
                cells.each((k, cell) => {
                  const cellText = $(cell).text().trim()
                  console.log(`       Cell ${k + 1}: "${cellText.substring(0, 50)}${cellText.length > 50 ? '...' : ''}"`)
                })
              }
            })
          })

          // Look for vs patterns
          const contentText = content.text()
          const vsMatches = contentText.match(/[^.\n]{10,80}\svs\.?\s[^.\n]{10,80}/gi)
          if (vsMatches) {
            console.log(`\n🥊 VS patterns in Results section: ${vsMatches.length}`)
            vsMatches.slice(0, 5).forEach((match, i) => {
              console.log(`   ${i + 1}. "${match.trim()}"`)
            })
          } else {
            console.log('\n❌ No VS patterns found in Results section')
          }
        }
      }
    })

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

debugResultsSection().catch(console.error)