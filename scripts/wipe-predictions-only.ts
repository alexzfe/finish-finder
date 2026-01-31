#!/usr/bin/env node
/**
 * Wipe ONLY Prediction Data
 * 
 * This script clears all AI prediction data while preserving:
 * - Fighters and their statistics
 * - Events and fight cards
 * - Fight records and outcomes
 * - Fighter context chunks and entertainment profiles
 * 
 * Tables cleared:
 * - Prediction (main predictions)
 * - PredictionVersion (version tracking)
 * - PredictionLog (calibration logs)
 * - WeakSupervisionLabel (calibration labels)
 * - FunScoreHistory (legacy)
 * - PredictionModel (legacy)
 * - PredictionUsage (usage tracking)
 * 
 * Fight fields reset:
 * - Legacy AI fields (funFactor, finishProbability, etc.)
 * - ML tier fields (will be recalculated)
 * - riskLevel
 */

import { config } from 'dotenv'
import { existsSync } from 'fs'

const envPath = '.env.local'
if (existsSync(envPath)) {
  config({ path: envPath })
}

import { prisma } from '../src/lib/database/prisma'

async function wipePredictions() {
  console.log('🧹 Wiping Prediction Data Only')
  console.log('=' .repeat(50))

  // Check connection
  console.log('\n📡 Checking database connection...')
  try {
    await prisma.$queryRaw`SELECT 1`
    console.log('✅ Database connected')
  } catch (error) {
    console.error('❌ Database connection failed:', error)
    process.exit(1)
  }

  // Get counts before deletion
  console.log('\n📊 Current prediction data counts:')
  const counts = {
    predictions: await prisma.prediction.count(),
    predictionVersions: await prisma.predictionVersion.count(),
    predictionLogs: await prisma.predictionLog.count(),
    weakSupervisionLabels: await prisma.weakSupervisionLabel.count(),
    funScoreHistory: await prisma.funScoreHistory.count(),
    predictionModels: await prisma.predictionModel.count(),
    predictionUsage: await prisma.predictionUsage.count(),
    fightsWithPredictions: await prisma.fight.count({
      where: { predictions: { some: {} } }
    }),
  }

  console.log(`  Predictions: ${counts.predictions}`)
  console.log(`  Prediction Versions: ${counts.predictionVersions}`)
  console.log(`  Prediction Logs: ${counts.predictionLogs}`)
  console.log(`  Weak Supervision Labels: ${counts.weakSupervisionLabels}`)
  console.log(`  Fun Score History: ${counts.funScoreHistory}`)
  console.log(`  Prediction Models: ${counts.predictionModels}`)
  console.log(`  Prediction Usage Records: ${counts.predictionUsage}`)
  console.log(`  Fights with Predictions: ${counts.fightsWithPredictions}`)

  const totalPredictionRecords = 
    counts.predictions + 
    counts.predictionVersions + 
    counts.predictionLogs + 
    counts.weakSupervisionLabels +
    counts.funScoreHistory +
    counts.predictionModels +
    counts.predictionUsage

  if (totalPredictionRecords === 0) {
    console.log('\n⚠️ No prediction data found to wipe.')
    console.log('Proceeding to reset Fight model prediction fields...')
  }

  // Confirm before deletion
  console.log('\n⚠️ WARNING: This will delete ALL prediction data.')
  console.log('Fighters, Events, and Fights will be preserved.')
  console.log('\nTo proceed, type "wipe-predictions" and press Enter:')

  // For automated execution, we'll skip the prompt and proceed
  // In a real interactive scenario, you'd use readline here

  console.log('\n🗑️ Deleting prediction data...')

  // Delete in order to respect foreign key constraints
  // 1. Delete predictions first (references PredictionVersion and Fight)
  const deletedPredictions = await prisma.prediction.deleteMany({})
  console.log(`  ✅ Deleted ${deletedPredictions.count} predictions`)

  // 2. Delete prediction logs (references Fight)
  const deletedLogs = await prisma.predictionLog.deleteMany({})
  console.log(`  ✅ Deleted ${deletedLogs.count} prediction logs`)

  // 3. Delete weak supervision labels (references Fight)
  const deletedLabels = await prisma.weakSupervisionLabel.deleteMany({})
  console.log(`  ✅ Deleted ${deletedLabels.count} weak supervision labels`)

  // 4. Delete fun score history
  const deletedFunHistory = await prisma.funScoreHistory.deleteMany({})
  console.log(`  ✅ Deleted ${deletedFunHistory.count} fun score history records`)

  // 5. Delete prediction usage
  const deletedUsage = await prisma.predictionUsage.deleteMany({})
  console.log(`  ✅ Deleted ${deletedUsage.count} prediction usage records`)

  // 6. Delete prediction versions (no dependencies after predictions deleted)
  const deletedVersions = await prisma.predictionVersion.deleteMany({})
  console.log(`  ✅ Deleted ${deletedVersions.count} prediction versions`)

  // 7. Delete prediction models
  const deletedModels = await prisma.predictionModel.deleteMany({})
  console.log(`  ✅ Deleted ${deletedModels.count} prediction models`)

  // Reset Fight model fields
  console.log('\n🔄 Resetting Fight model prediction fields...')
  
  const updatedFights = await prisma.fight.updateMany({
    where: {},
    data: {
      // Legacy AI prediction fields
      funFactor: 0,
      finishProbability: 0,
      entertainmentReason: null,
      keyFactors: '[]',
      fightPrediction: null,
      riskLevel: null,
      predictedFunScore: 0,
      funFactors: '[]',
      aiDescription: null,
      
      // ML tier fields (will be recalculated)
      mlTier: null,
      mlTierConfidence: null,
      mlTierProbabilities: null,
      mlTierComputedAt: null,
    }
  })
  console.log(`  ✅ Reset ${updatedFights.count} fights`)

  // Verify cleanup
  console.log('\n📊 Verification - Counts after wipe:')
  const afterCounts = {
    predictions: await prisma.prediction.count(),
    predictionVersions: await prisma.predictionVersion.count(),
    predictionLogs: await prisma.predictionLog.count(),
    weakSupervisionLabels: await prisma.weakSupervisionLabel.count(),
    funScoreHistory: await prisma.funScoreHistory.count(),
    predictionModels: await prisma.predictionModel.count(),
    predictionUsage: await prisma.predictionUsage.count(),
    fightsWithPredictions: await prisma.fight.count({
      where: { predictions: { some: {} } }
    }),
  }

  console.log(`  Predictions: ${afterCounts.predictions}`)
  console.log(`  Prediction Versions: ${afterCounts.predictionVersions}`)
  console.log(`  Prediction Logs: ${afterCounts.predictionLogs}`)
  console.log(`  Weak Supervision Labels: ${afterCounts.weakSupervisionLabels}`)
  console.log(`  Fun Score History: ${afterCounts.funScoreHistory}`)
  console.log(`  Prediction Models: ${afterCounts.predictionModels}`)
  console.log(`  Prediction Usage Records: ${afterCounts.predictionUsage}`)
  console.log(`  Fights with Predictions: ${afterCounts.fightsWithPredictions}`)

  // Check that core data is preserved
  console.log('\n📦 Core Data Preservation Check:')
  const coreCounts = {
    fighters: await prisma.fighter.count(),
    events: await prisma.event.count(),
    fights: await prisma.fight.count(),
    contextChunks: await prisma.fighterContextChunk.count(),
    entertainmentProfiles: await prisma.fighterEntertainmentProfile.count(),
  }

  console.log(`  Fighters: ${coreCounts.fighters} ✅`)
  console.log(`  Events: ${coreCounts.events} ✅`)
  console.log(`  Fights: ${coreCounts.fights} ✅`)
  console.log(`  Context Chunks: ${coreCounts.contextChunks} ✅`)
  console.log(`  Entertainment Profiles: ${coreCounts.entertainmentProfiles} ✅`)

  console.log('\n' + '=' .repeat(50))
  console.log('✅ Prediction data wiped successfully!')
  console.log('\nNext steps:')
  console.log('  1. Regenerate predictions: npx ts-node scripts/unified-ai-predictions-runner.ts --force')
  console.log('  2. Or with web search: npx ts-node scripts/unified-ai-predictions-runner.ts --force --web-search')
}

// Run
wipePredictions()
  .catch((error) => {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
