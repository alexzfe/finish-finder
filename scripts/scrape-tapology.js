#!/usr/bin/env node

// Quick dev tool: list upcoming Tapology events and optionally dump one event's fights
require('ts-node').register({ project: './tsconfig.node.json' })
const { TapologyUFCService } = require('../src/lib/scrapers/tapologyService.ts')

async function main() {
  const svc = new TapologyUFCService()
  const cmd = process.argv[2] || 'list'
  const arg = process.argv[3]

  if (cmd === 'list') {
    const events = await svc.getUpcomingEvents(10)
    console.log('\nUpcoming Tapology UFC events:')
    for (const e of events) {
      console.log(`- ${e.date} | ${e.name} | ${e.venue}, ${e.location} | ${e.tapologyUrl || ''}`)
    }
  } else if (cmd === 'fights') {
    if (!arg) {
      console.error('Usage: node scripts/scrape-tapology.js fights <tapologyEventUrl>')
      process.exit(1)
    }
    const details = await svc.getEventFights(arg)
    console.log(`\nFights: ${details.fights.length}`)
    details.fights.forEach((f, i) => {
      console.log(`${i + 1}. [${f.cardPosition}] ${f.fighter1Name} vs ${f.fighter2Name} ${f.titleFight ? '(Title)' : ''}`)
    })
  } else {
    console.log('Usage: node scripts/scrape-tapology.js [list|fights <url>]')
  }
}

main().catch(err => {
  console.error('Tapology scrape failed:', err)
  process.exit(1)
})

