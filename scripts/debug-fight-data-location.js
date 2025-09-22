#!/usr/bin/env node

const axios = require('axios')
const cheerio = require('cheerio')

async function debugFightDataLocation() {
  console.log('🔍 Debug Where Fight Data Actually Lives in UFC 309')
  console.log('=================================================')

  try {
    const url = 'https://en.wikipedia.org/wiki/UFC_309'
    console.log(`📄 Analyzing: ${url}`)

    const response = await axios.get(url)
    const $ = cheerio.load(response.data)

    // Check every section for fight data
    console.log('\n📋 Checking ALL sections for fight content...')
    $('h2, h3, h4').each((_, element) => {
      const $heading = $(element)
      const headingText = $heading.text().trim()

      // Get content after this heading
      const content = $heading.nextUntil('h2, h3, h4')
      const contentText = content.text()

      // Count fight-like patterns
      const fightPatterns = contentText.match(/[A-Z][a-z]+\s+[A-Z][a-z]*\s+(?:vs\.?|defeated|beat|fought)\s+[A-Z][a-z]+\s+[A-Z][a-z]*/gi) || []
      const vsPatterns = contentText.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+vs\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/gi) || []

      if (fightPatterns.length > 0 || vsPatterns.length > 0) {
        console.log(`\n📋 Section: "${headingText}"`)
        console.log(`   Fight patterns: ${fightPatterns.length}`)
        console.log(`   VS patterns: ${vsPatterns.length}`)

        // Show unique patterns
        const allPatterns = [...new Set([...fightPatterns, ...vsPatterns])]
        allPatterns.slice(0, 5).forEach((pattern, i) => {
          console.log(`     ${i + 1}. "${pattern}"`)
        })
      }
    })

    // Check for any results table that might exist elsewhere
    console.log('\n📊 Looking for ANY tables with fight data...')
    $('table').each((i, table) => {
      const $table = $(table)
      const tableText = $table.text()
      const tableVs = tableText.match(/vs\.?/gi) || []
      const fightWords = tableText.match(/\b(?:won|lost|defeated|submission|decision|ko|tko)\b/gi) || []

      if (tableVs.length > 0 || fightWords.length > 2) {
        console.log(`\nTable ${i + 1}: Fight-related content found`)
        console.log(`   Classes: "${$table.attr('class') || 'none'}"`)
        console.log(`   VS mentions: ${tableVs.length}`)
        console.log(`   Fight words: ${fightWords.length}`)

        // Show table structure
        const headers = $table.find('th')
        if (headers.length > 0) {
          console.log(`   Headers: ${headers.map((j, th) => $(th).text().trim()).get().join(' | ')}`)
        }

        // Show sample data
        const firstDataRow = $table.find('tr').eq(1).find('td')
        if (firstDataRow.length > 0) {
          console.log(`   Sample row: ${firstDataRow.map((j, td) => $(td).text().trim().substring(0, 20)).get().join(' | ')}`)
        }
      }
    })

    // Look at the specific fights we know exist
    console.log('\n🎯 Looking for known UFC 309 fights...')
    const knownFights = [
      'Jones vs Miocic',
      'Oliveira vs Chandler',
      'Campbell vs Ruffy',
      'Weidman vs Anders'
    ]

    knownFights.forEach(fight => {
      const mentions = $('body').text().toLowerCase().split(fight.toLowerCase()).length - 1
      console.log(`   "${fight}": ${mentions} mentions`)
    })

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

debugFightDataLocation().catch(console.error)