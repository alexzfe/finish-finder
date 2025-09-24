#!/usr/bin/env node

const axios = require('axios')
const cheerio = require('cheerio')

async function debugMissingEvents() {
  console.log('🔍 Debugging missing events like Ulberg vs Reyes...')

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    }

    const url = 'https://www.tapology.com/fightcenter/promotions/1-ultimate-fighting-championship-ufc'
    console.log(`📡 Fetching: ${url}`)

    const response = await axios.get(url, { headers, timeout: 15000 })
    const $ = cheerio.load(response.data)

    console.log('\n🔍 Searching for "Ulberg", "Reyes", or recent events...')

    // Search for Ulberg specifically
    const pageText = $.text()
    const ulbergMatches = pageText.match(/[^\n]*Ulberg[^\n]*/gi) || []
    const reyesMatches = pageText.match(/[^\n]*Reyes[^\n]*/gi) || []

    console.log(`\n📝 Found ${ulbergMatches.length} mentions of "Ulberg":`)
    ulbergMatches.slice(0, 5).forEach((match, i) => {
      console.log(`   ${i + 1}. ${match.trim()}`)
    })

    console.log(`\n📝 Found ${reyesMatches.length} mentions of "Reyes":`)
    reyesMatches.slice(0, 5).forEach((match, i) => {
      console.log(`   ${i + 1}. ${match.trim()}`)
    })

    // Look for all UFC event links on the page
    console.log('\n🔗 All UFC event links found on page:')
    const allEventLinks = $('a[href*="/fightcenter/events/"]')
    console.log(`Found ${allEventLinks.length} event links total`)

    const eventData = []
    allEventLinks.each((i, el) => {
      const href = $(el).attr('href')
      const text = $(el).text().trim()
      const parentText = $(el).closest('div, section, article, li, tr').text().trim()

      if (text.toLowerCase().includes('ufc') || parentText.toLowerCase().includes('ufc')) {
        eventData.push({
          href,
          text,
          parentText: parentText.substring(0, 200) + (parentText.length > 200 ? '...' : '')
        })
      }
    })

    // Sort by most recent (assuming higher event IDs are more recent)
    eventData.sort((a, b) => {
      const aId = parseInt(a.href.match(/events\/(\d+)/)?.[1] || '0')
      const bId = parseInt(b.href.match(/events\/(\d+)/)?.[1] || '0')
      return bId - aId // Descending order
    })

    console.log('\n📅 Top 15 most recent UFC events found:')
    eventData.slice(0, 15).forEach((event, i) => {
      const eventId = event.href.match(/events\/(\d+)/)?.[1] || 'unknown'
      console.log(`   ${i + 1}. ID: ${eventId} | "${event.text}" | ${event.href}`)
      if (event.text.toLowerCase().includes('ulberg') || event.text.toLowerCase().includes('reyes')) {
        console.log(`      ⭐ CONTAINS TARGET FIGHTER!`)
      }
    })

    // Also search for current date context
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    console.log(`\n📅 Today's date: ${todayStr}`)

    // Look for any date mentions on the page
    const dateMatches = pageText.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+2024\b/gi) || []
    console.log(`\n📅 Found ${dateMatches.length} 2024 dates on page`)
    dateMatches.slice(0, 10).forEach((date, i) => {
      console.log(`   ${i + 1}. ${date}`)
    })

  } catch (error) {
    console.error('❌ Debug failed:', error.message)
  }
}

debugMissingEvents()