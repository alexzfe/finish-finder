#!/usr/bin/env node

require('ts-node').register({ project: './tsconfig.node.json' })
const { HybridUFCService } = require('../src/lib/ai/hybridUFCService.ts')

async function main() {
  process.env.TAPOLOGY_ENRICH_RECORDS = process.env.TAPOLOGY_ENRICH_RECORDS || 'true'
  const count = Number(process.argv[2] || 2)
  const svc = new HybridUFCService(false)
  const { events, fighters } = await svc.getUpcomingUFCEvents(count)
  console.log(`Events: ${events.length}, Fighters: ${fighters.length}`)
  const sample = fighters.slice(0, 12)
  for (const f of sample) {
    console.log(`${f.name.padEnd(24)} record=${f.record}  W-L-D=${f.wins}-${f.losses}-${f.draws}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
