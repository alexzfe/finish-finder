#!/usr/bin/env node
/**
 * Bootstrap Calibration Script - Phase 2.0
 *
 * Initializes the calibration system with historical data:
 * 1. Generates weak supervision labels for completed fights
 * 2. Trains initial Platt scaling parameters
 * 3. Generates calibration report
 *
 * Usage:
 *   npx ts-node scripts/bootstrap-calibration.ts [options]
 *
 * Options:
 *   --labels-only      Only generate weak supervision labels
 *   --platt-only       Only train Platt scaling
 *   --report-only      Only generate calibration report
 *   --batch-size=<n>   Batch size for label generation (default: 500)
 */

// Load environment variables
import { config } from 'dotenv'
import { existsSync } from 'fs'
const envPath = '.env.local'
if (existsSync(envPath)) {
  config({ path: envPath })
}

import { prisma } from '../src/lib/database/prisma'
import {
  batchGenerateWeakLabels,
  trainPlattScalingFromHistory,
  savePlattParams,
  generateCalibrationReport,
} from '../src/lib/ai/calibration'

/**
 * Command line arguments
 */
interface Args {
  labelsOnly: boolean
  plattOnly: boolean
  reportOnly: boolean
  batchSize: number
}

/**
 * Parse command line arguments
 */
function parseArgs(): Args {
  const args = process.argv.slice(2)
  return {
    labelsOnly: args.includes('--labels-only'),
    plattOnly: args.includes('--platt-only'),
    reportOnly: args.includes('--report-only'),
    batchSize: parseInt(
      args.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1] || '500'
    ),
  }
}

/**
 * Generate weak supervision labels
 */
async function generateLabels(batchSize: number): Promise<void> {
  console.log('\n📊 PHASE 1: GENERATING WEAK SUPERVISION LABELS')
  console.log('='.repeat(50))

  let totalProcessed = 0
  let totalCreated = 0
  let totalSkipped = 0

  // Keep generating until no more fights need labels
  let hasMore = true
  while (hasMore) {
    const result = await batchGenerateWeakLabels(batchSize)

    if (result.processed === 0) {
      hasMore = false
      break
    }

    totalProcessed += result.processed
    totalCreated += result.created
    totalSkipped += result.skipped

    console.log(
      `  Batch: ${result.processed} fights, ${result.created} labels created, ${result.skipped} skipped`
    )
  }

  console.log('')
  console.log(`✓ Total fights processed: ${totalProcessed}`)
  console.log(`✓ Labels created: ${totalCreated}`)
  console.log(`✓ Skipped (low confidence): ${totalSkipped}`)
}

/**
 * Train Platt scaling parameters
 */
async function trainPlatt(): Promise<void> {
  console.log('\n📊 PHASE 2: TRAINING PLATT SCALING')
  console.log('='.repeat(50))

  try {
    const result = await trainPlattScalingFromHistory(12) // 12 months window

    console.log(`Training samples: ${result.trainingSize}`)
    console.log('')
    console.log('Before calibration:')
    console.log(`  Brier Score: ${result.metricsBefore.brierScore.toFixed(4)}`)
    console.log(`  ECE: ${result.metricsBefore.ece.toFixed(4)}`)
    console.log(`  Accuracy: ${(result.metricsBefore.accuracy * 100).toFixed(1)}%`)
    console.log('')
    console.log('After calibration:')
    console.log(`  Brier Score: ${result.metricsAfter.brierScore.toFixed(4)}`)
    console.log(`  ECE: ${result.metricsAfter.ece.toFixed(4)}`)
    console.log(`  Accuracy: ${(result.metricsAfter.accuracy * 100).toFixed(1)}%`)
    console.log('')
    console.log(`Platt parameters: A=${result.params.a.toFixed(4)}, B=${result.params.b.toFixed(4)}`)

    // Calculate improvement
    const brierImprovement =
      ((result.metricsBefore.brierScore - result.metricsAfter.brierScore) /
        result.metricsBefore.brierScore) *
      100

    if (brierImprovement > 0) {
      console.log(`✓ Brier Score improved by ${brierImprovement.toFixed(1)}%`)
    } else {
      console.log(`⚠ Brier Score got worse by ${Math.abs(brierImprovement).toFixed(1)}%`)
    }

    // Save parameters
    const validFrom = new Date()
    const validTo = new Date()
    validTo.setMonth(validTo.getMonth() + 3) // Valid for 3 months

    await savePlattParams(
      result.params,
      result.metricsAfter,
      result.trainingSize,
      validFrom,
      validTo
    )

    console.log('✓ Platt parameters saved to database')
  } catch (error) {
    if (error instanceof Error && error.message.includes('Not enough data')) {
      console.log('⚠ Not enough historical data for Platt scaling')
      console.log('  Need at least 10 predictions with known outcomes')
    } else {
      throw error
    }
  }
}

/**
 * Generate and display calibration report
 */
async function showReport(): Promise<void> {
  console.log('\n📊 CALIBRATION REPORT')
  console.log('='.repeat(50))

  const report = await generateCalibrationReport(6)
  console.log(report)
}

/**
 * Show system stats
 */
async function showStats(): Promise<void> {
  console.log('📊 CURRENT SYSTEM STATUS')
  console.log('='.repeat(50))

  // Count completed fights
  const completedFights = await prisma.fight.count({
    where: { completed: true },
  })

  // Count fights with labels
  const labeledFights = await prisma.weakSupervisionLabel.count()

  // Count predictions
  const predictions = await prisma.prediction.count()

  // Count evaluated predictions
  const evaluatedPredictions = await prisma.prediction.count({
    where: { actualFinish: { not: null } },
  })

  // Active calibration params
  const activeParams = await prisma.calibrationParams.findFirst({
    where: { active: true },
  })

  console.log(`Completed fights: ${completedFights}`)
  console.log(`Fights with weak labels: ${labeledFights}`)
  console.log(`Total predictions: ${predictions}`)
  console.log(`Evaluated predictions: ${evaluatedPredictions}`)
  console.log(
    `Active Platt params: ${activeParams ? `A=${activeParams.paramA?.toFixed(4)}, B=${activeParams.paramB?.toFixed(4)}` : 'None'}`
  )
}

/**
 * Main function
 */
async function main() {
  const args = parseArgs()

  console.log('🎯 CALIBRATION BOOTSTRAP SCRIPT')
  console.log('='.repeat(50))

  // Show current stats
  await showStats()

  // Run selected phases
  const runAll = !args.labelsOnly && !args.plattOnly && !args.reportOnly

  if (args.labelsOnly || runAll) {
    await generateLabels(args.batchSize)
  }

  if (args.plattOnly || runAll) {
    await trainPlatt()
  }

  if (args.reportOnly || runAll) {
    await showReport()
  }

  console.log('\n✨ Calibration bootstrap complete!')
}

// Run
main()
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
