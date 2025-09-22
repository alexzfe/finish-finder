#!/usr/bin/env node

const axios = require('axios')
const cheerio = require('cheerio')

async function debugTable3() {
  console.log('🔍 Debug Table 3 - The Fight Card Table')
  console.log('=====================================')

  try {
    const url = 'https://en.wikipedia.org/wiki/UFC_309'
    console.log(`📄 Analyzing: ${url}`)

    const response = await axios.get(url)
    const $ = cheerio.load(response.data)

    // Find the specific table with fight data
    let targetTable = null
    $('table').each((i, table) => {
      const $table = $(table)
      const tableText = $table.text()
      const headers = $table.find('th').map((j, th) => $(th).text().trim()).get().join(' | ')

      if (headers.includes('Main card') && headers.includes('Weight class')) {
        targetTable = $table
        console.log(`\n🎯 Found the fight card table (Table ${i + 1})!`)
        console.log(`Classes: "${$table.attr('class') || 'none'}"`)
        console.log(`Headers: ${headers}`)
        return false // break
      }
    })

    if (targetTable) {
      console.log('\n📋 Table structure analysis:')

      // Analyze table rows
      const rows = targetTable.find('tr')
      console.log(`Total rows: ${rows.length}`)

      rows.each((i, row) => {
        const $row = $(row)
        const cells = $row.find('td, th')

        if (cells.length > 0) {
          const cellTexts = cells.map((j, cell) => $(cell).text().trim().substring(0, 30)).get()
          console.log(`\nRow ${i + 1} (${cells.length} cells):`)
          cellTexts.forEach((text, j) => {
            console.log(`   Cell ${j + 1}: "${text}${$(cells[j]).text().trim().length > 30 ? '...' : ''}"`)
          })

          // Check for fight patterns in this row
          const rowText = $row.text()
          const vsMatches = rowText.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:vs\.?|defeated)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/gi)
          if (vsMatches) {
            console.log(`   🥊 Fight patterns: ${vsMatches.join(', ')}`)
          }
        }
      })

      // Look specifically for fight data
      console.log('\n🥊 Looking for actual fight data in table...')
      const tableText = targetTable.text()
      const allFightPatterns = tableText.match(/[^.\n]{10,100}(?:defeated|beat|vs\.?)[^.\n]{10,100}/gi) || []

      console.log(`Fight-related patterns found: ${allFightPatterns.length}`)
      allFightPatterns.slice(0, 10).forEach((pattern, i) => {
        console.log(`   ${i + 1}. "${pattern.trim()}"`)
      })

    } else {
      console.log('❌ Could not find the fight card table!')
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

debugTable3().catch(console.error)