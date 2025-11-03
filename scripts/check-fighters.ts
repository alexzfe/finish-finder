import { config } from 'dotenv'
import { existsSync } from 'fs'
if (existsSync('.env.local')) {
  config({ path: '.env.local' })
}

import { prisma } from '../src/lib/database/prisma'

async function main() {
  const fighters = await prisma.fighter.findMany({
    where: {
      OR: [
        { name: 'Adrian Yanez' },
        { name: 'Cristian Quinonez' }
      ]
    }
  })

  console.log('Fighter Data from Database:\n')

  for (const f of fighters) {
    console.log(`${f.name}:`)
    console.log(`  Source URL: ${f.sourceUrl || 'MISSING'}`)
    console.log(`  Last Scraped: ${f.lastScrapedAt || 'NEVER'}`)
    console.log(`  Record: ${f.record} (${f.wins}-${f.losses}-${f.draws})`)
    console.log(`  Strikes Landed/min: ${f.significantStrikesLandedPerMinute}`)
    console.log(`  Strikes Absorbed/min: ${f.significantStrikesAbsorbedPerMinute}`)
    console.log(`  Striking Defense: ${f.strikingDefensePercentage}`)
    console.log(`  Takedown Defense: ${f.takedownDefensePercentage}`)
    console.log(`  Finish Rate: ${f.finishRate}`)
    console.log(`  Wins: KO=${f.winsByKO}, SUB=${f.winsBySubmission}, DEC=${f.winsByDecision}`)
    console.log()
  }

  if (fighters.length === 0) {
    console.log('❌ No fighters found in database!')
  }
}

main().finally(() => prisma.$disconnect())
