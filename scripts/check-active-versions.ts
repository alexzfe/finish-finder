/**
 * One-shot diagnostic: list every PredictionVersion row with its active flag
 * and how many predictions it owns. /api/db-events picks the *most recent
 * active* version, so multiple `active: true` rows make older cohorts vanish
 * from the UI.
 */

import { config } from 'dotenv'
import { existsSync } from 'fs'

if (existsSync('.env.local')) {
  config({ path: '.env.local' })
}

import { prisma } from '../src/lib/database/prisma'

async function main() {
  const versions = await prisma.predictionVersion.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { predictions: true } } },
  })

  console.log(`${versions.length} PredictionVersion row(s):`)
  for (const v of versions) {
    const flag = v.active ? '✅ active' : '   inactive'
    console.log(`  ${flag}  ${v.createdAt.toISOString()}  ${v.version.padEnd(40)} ${v._count.predictions} predictions`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
