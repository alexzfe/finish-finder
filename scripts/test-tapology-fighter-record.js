#!/usr/bin/env node
require('ts-node/register')
const { TapologyUFCService } = require('../src/lib/scrapers/tapologyService.ts')

async function main() {
  const name = process.argv.slice(2).join(' ') || 'Dominick Reyes'
  const tap = new TapologyUFCService()
  const info = await tap.getFighterRecordByName(name)
  console.log(name, '=>', info)
}

main().catch(console.error)

