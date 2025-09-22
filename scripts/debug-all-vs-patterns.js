#!/usr/bin/env node

const axios = require('axios')
const cheerio = require('cheerio')

async function debugAllVsPatterns() {
  console.log('🔍 Debug All VS Patterns on UFC Event Page')
  console.log('==========================================')

  try {
    const url = 'https://en.wikipedia.org/wiki/UFC_309'
    console.log(`📄 Analyzing: ${url}`)

    const response = await axios.get(url)
    const $ = cheerio.load(response.data)

    // Check if page exists
    const pageTitle = $('h1#firstHeading').text().trim()
    console.log(`📝 Page Title: "${pageTitle}"`)

    if (pageTitle.includes('does not exist')) {
      console.log('❌ Page does not exist!')
      return
    }

    console.log('\n🔍 Analyzing ALL "vs" patterns in detail...')
    const allText = $('body').text()
    console.log(`📄 Page text length: ${allText.length} characters`)

    // Try different patterns for "vs"
    const vsMatches1 = allText.match(/[^.\n]{5,100}\svs\.?\s[^.\n]{5,100}/gi)
    const vsMatches2 = allText.match(/[^.\n]{10,80}vs[^.\n]{10,80}/gi)

    console.log(`Simple "vs" search: ${(allText.match(/vs/gi) || []).length} matches`)

    const vsMatches = vsMatches1 || vsMatches2

    if (vsMatches) {
      console.log(`Found ${vsMatches.length} potential fight patterns:`)

      // Group similar patterns
      const uniquePatterns = new Set()
      const fightLikePatterns = []

      vsMatches.forEach((match, i) => {
        const cleanMatch = match.trim().replace(/\s+/g, ' ')

        // Skip if we've seen this exact pattern
        if (uniquePatterns.has(cleanMatch)) return
        uniquePatterns.add(cleanMatch)

        // Look for patterns that might be actual fights
        const mightBeFight = /\b[A-Z][a-z]+\s+[A-Z][a-z]*\s+vs\.?\s+[A-Z][a-z]+\s+[A-Z][a-z]*\b/i.test(cleanMatch)

        if (mightBeFight) {
          fightLikePatterns.push(cleanMatch)
        }

        // Show first 20 unique patterns
        if (uniquePatterns.size <= 20) {
          const marker = mightBeFight ? '🥊' : '📝'
          console.log(`   ${marker} ${uniquePatterns.size}. "${cleanMatch}"`)
        }
      })

      if (fightLikePatterns.length > 0) {
        console.log(`\n🥊 POTENTIAL FIGHT PATTERNS (${fightLikePatterns.length}):`)
        fightLikePatterns.forEach((pattern, i) => {
          console.log(`   ${i + 1}. "${pattern}"`)
        })
      }

      // Look specifically in different sections
      console.log('\n🔍 Looking in specific Wikipedia sections...')

      // Check infobox
      const infoboxText = $('.infobox').text()
      const infoboxVs = infoboxText.match(/[^\n.]{10,50}\bvs\.?\b[^\n.]{10,50}/gi)
      if (infoboxVs) {
        console.log(`📊 Infobox patterns: ${infoboxVs.length}`)
        infoboxVs.slice(0, 3).forEach((pattern, i) => {
          console.log(`   ${i + 1}. "${pattern.trim()}"`)
        })
      }

      // Check tables
      const tableText = $('table').text()
      const tableVs = tableText.match(/[^\n.]{10,50}\bvs\.?\b[^\n.]{10,50}/gi)
      if (tableVs) {
        console.log(`📋 Table patterns: ${tableVs.length}`)
        tableVs.slice(0, 5).forEach((pattern, i) => {
          console.log(`   ${i + 1}. "${pattern.trim()}"`)
        })
      }

    } else {
      console.log('No vs patterns found')
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

debugAllVsPatterns().catch(console.error)