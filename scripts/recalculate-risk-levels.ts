#!/usr/bin/env node
/**
 * Recalculate Risk Levels Utility
 *
 * Updates Fight.riskLevel for all fights that have predictions,
 * using the calculateRiskLevel function with updated thresholds.
 *
 * Usage:
 *   npx ts-node scripts/recalculate-risk-levels.ts [--dry-run]
 */

import { prisma } from '../src/lib/database/prisma'
import { calculateRiskLevel } from '../src/lib/ai/newPredictionService'

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  console.log('🔄 Recalculating Risk Levels')
  console.log('===========================')
  console.log(`Mode: ${dryRun ? 'DRY RUN (no database updates)' : 'LIVE UPDATE'}`)
  console.log('')

  // Get all predictions with their fights
  const predictions = await prisma.prediction.findMany({
    include: {
      fight: {
        include: {
          fighter1: { select: { name: true } },
          fighter2: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`Found ${predictions.length} predictions`)
  console.log('')

  // Calculate new risk levels
  const updates: Array<{
    fightId: string
    fightName: string
    oldRisk: string | null
    newRisk: 'low' | 'balanced' | 'high'
    avgConfidence: number
  }> = []

  for (const pred of predictions) {
    const newRisk = calculateRiskLevel(pred.finishConfidence, pred.funConfidence)
    const avgConf = (pred.finishConfidence + pred.funConfidence) / 2

    updates.push({
      fightId: pred.fightId,
      fightName: `${pred.fight.fighter1.name} vs ${pred.fight.fighter2.name}`,
      oldRisk: pred.fight.riskLevel,
      newRisk,
      avgConfidence: avgConf,
    })
  }

  // Show distribution
  const oldDist = { low: 0, balanced: 0, high: 0, null: 0 }
  const newDist = { low: 0, balanced: 0, high: 0 }

  updates.forEach((u) => {
    if (u.oldRisk) oldDist[u.oldRisk as keyof typeof oldDist]++
    else oldDist.null++
    newDist[u.newRisk]++
  })

  console.log('OLD Distribution:')
  console.log(`  Low:      ${oldDist.low} (${((oldDist.low / updates.length) * 100).toFixed(1)}%)`)
  console.log(`  Balanced: ${oldDist.balanced} (${((oldDist.balanced / updates.length) * 100).toFixed(1)}%)`)
  console.log(`  High:     ${oldDist.high} (${((oldDist.high / updates.length) * 100).toFixed(1)}%)`)
  console.log(`  Null:     ${oldDist.null} (${((oldDist.null / updates.length) * 100).toFixed(1)}%)`)
  console.log('')

  console.log('NEW Distribution (with 0.8/0.7 thresholds):')
  console.log(`  Low:      ${newDist.low} (${((newDist.low / updates.length) * 100).toFixed(1)}%)`)
  console.log(`  Balanced: ${newDist.balanced} (${((newDist.balanced / updates.length) * 100).toFixed(1)}%)`)
  console.log(`  High:     ${newDist.high} (${((newDist.high / updates.length) * 100).toFixed(1)}%)`)
  console.log('')

  // Show changes
  const changed = updates.filter((u) => u.oldRisk !== u.newRisk)
  console.log(`Changes: ${changed.length}/${updates.length} fights`)
  console.log('')

  if (!dryRun) {
    console.log('Updating database...')

    for (let i = 0; i < updates.length; i++) {
      const update = updates[i]
      await prisma.fight.update({
        where: { id: update.fightId },
        data: { riskLevel: update.newRisk },
      })

      if ((i + 1) % 10 === 0 || i === updates.length - 1) {
        console.log(`  ${i + 1}/${updates.length} updated`)
      }
    }

    console.log('')
    console.log('✅ All risk levels updated!')
  } else {
    console.log('✓ Dry run complete - no changes made')
  }
}

main()
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
