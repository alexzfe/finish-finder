#!/usr/bin/env node

// Local Sherdog access test using rotated headers and human-like delay
require('ts-node/register')

const axios = require('axios')
const cheerio = require('cheerio')
const { getRotatedHeaders, humanDelay, sessionId } = require('../src/lib/scrapers/requestPolicy.ts')

const ORG_URL = 'https://www.sherdog.com/organizations/Ultimate-Fighting-Championship-UFC-2'

async function fetchWithHeaders(url, referer) {
  const headers = getRotatedHeaders(referer)
  const start = Date.now()
  try {
    const res = await axios.get(url, { headers, timeout: 20000 })
    return { ok: true, status: res.status, html: res.data, ms: Date.now() - start }
  } catch (err) {
    const status = err.response?.status
    return { ok: false, status, error: err.message, ms: Date.now() - start }
  }
}

async function main() {
  const sid = sessionId()
  console.log(`🆔 Session: ${sid}`)
  console.log('🌐 Testing Sherdog organization page...')

  await humanDelay(900, 1800)
  const orgRes = await fetchWithHeaders(ORG_URL)

  if (!orgRes.ok) {
    console.log(`❌ ORG PAGE FAILED: status=${orgRes.status || 'n/a'} in ${orgRes.ms}ms (${orgRes.error})`)
    if (orgRes.status === 403) console.log('🚫 403 Forbidden — likely IP-based blocking')
    process.exit(0)
  }

  console.log(`✅ ORG PAGE OK: ${orgRes.status} in ${orgRes.ms}ms`)

  // Try to detect the events table to confirm we got real content
  const $ = cheerio.load(orgRes.html)
  const hasTable = $('table.new_table.event').length > 0
  console.log(`🔎 Event table present: ${hasTable}`)

  if (!hasTable) {
    console.log('⚠️ Content may be obfuscated or blocked; stopping here.')
    process.exit(0)
  }

  // Optionally follow the first event link
  const firstHref = $('table.new_table.event').first().find('tr').slice(1).find('td a').first().attr('href')
  if (!firstHref) {
    console.log('⚠️ No event link found to follow.')
    process.exit(0)
  }

  const detailUrl = new URL(firstHref, ORG_URL).toString()
  console.log(`➡️  Following first event: ${detailUrl}`)
  await humanDelay(1200, 2400)
  const detailRes = await fetchWithHeaders(detailUrl, ORG_URL)

  if (!detailRes.ok) {
    console.log(`❌ DETAIL FAILED: status=${detailRes.status || 'n/a'} in ${detailRes.ms}ms (${detailRes.error})`)
    if (detailRes.status === 403) console.log('🚫 403 Forbidden on detail page — likely IP block persists')
    process.exit(0)
  }

  console.log(`✅ DETAIL PAGE OK: ${detailRes.status} in ${detailRes.ms}ms`)
  const $$ = require('cheerio').load(detailRes.html)
  const fightsTable = $$('table.new_table.upcoming, table.new_table.result').length > 0
  console.log(`🥊 Fight table present: ${fightsTable}`)
}

main().catch(err => {
  console.error('Unexpected error:', err?.message || err)
  process.exit(1)
})

