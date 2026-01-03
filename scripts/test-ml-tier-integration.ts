/**
 * End-to-End Test: ML Tier Integration
 *
 * Tests the integration of ML tier predictions with the LLM score calculator.
 *
 * Usage:
 *   npx ts-node scripts/test-ml-tier-integration.ts
 */

import { PrismaClient } from '@prisma/client'
import {
  calculateAllScores,
  calculateAllScoresWithML,
  explainScoreCalculationWithML,
  type MLTierPrediction,
} from '../src/lib/ai/scoreCalculator'
import type { FightSimulationOutput } from '../src/lib/ai/prompts/unifiedPredictionPrompt'

const prisma = new PrismaClient()

// Type for attribute ratings (1-5)
type Rating = 1 | 2 | 3 | 4 | 5

// Mock LLM simulation output for testing
function createMockSimulation(
  pace: Rating,
  finishDanger: Rating,
  technicality: Rating = 3,
  brawlPotential: boolean = true
): FightSimulationOutput {
  return {
    reasoning: {
      vulnerabilityAnalysis: 'Test vulnerability analysis',
      offenseAnalysis: 'Test offense analysis',
      styleMatchup: 'Test style matchup',
      finalAssessment: 'Test final assessment',
    },
    finishAnalysis: 'Test finish analysis - high finish danger expected.',
    funAnalysis: 'Test fun analysis - high pace and action expected.',
    narrative: 'Mock fight narrative for testing.',
    attributes: {
      pace,
      finishDanger,
      technicality,
      styleClash: 'Neutral',
      brawlPotential,
      groundBattleLikely: false,
    },
    keyFactors: ['factor1', 'factor2'],
    confidence: 0.75,
  }
}

async function testMLTierIntegration() {
  console.log('=' .repeat(70))
  console.log('ML Tier Integration Test')
  console.log('=' .repeat(70))

  // Fetch fights with ML tiers from database
  const fights = await prisma.fight.findMany({
    where: {
      mlTier: { not: null },
      completed: false,
    },
    include: {
      fighter1: true,
      fighter2: true,
    },
    take: 5,
  })

  console.log(`\nFound ${fights.length} fights with ML tier predictions\n`)

  for (const fight of fights) {
    console.log('-'.repeat(70))
    console.log(`${fight.fighter1.name} vs ${fight.fighter2.name}`)
    console.log(`Weight Class: ${fight.weightClass}`)
    console.log(`ML Tier: ${fight.mlTier} (conf: ${fight.mlTierConfidence?.toFixed(3)})`)

    // Parse ML tier from database
    const mlTier: MLTierPrediction = {
      tier: fight.mlTier!,
      confidence: fight.mlTierConfidence ?? 0.5,
      probabilities: fight.mlTierProbabilities as number[] ?? [],
    }

    // Test with different LLM simulations to show agreement/disagreement

    // Test 1: High-action simulation (should agree with higher tiers)
    console.log('\n  Test 1: High-action LLM simulation')
    const highActionSim = createMockSimulation(5, 4, 3, true)
    const highActionScores = calculateAllScoresWithML(
      highActionSim,
      fight.weightClass,
      { titleFight: fight.titleFight, mainEvent: fight.mainEvent },
      mlTier
    )
    console.log(`    LLM Fun Score: ${highActionScores.funScore}`)
    console.log(`    Validated Fun Score: ${highActionScores.validatedFunScore}`)
    console.log(`    Agreement: ${highActionScores.mlComparison?.funScoreAgreement}`)
    console.log(`    Confidence Adj: ${highActionScores.mlComparison?.confidenceAdjustment.toFixed(2)}x`)

    // Test 2: Low-action simulation (should agree with lower tiers)
    console.log('\n  Test 2: Low-action LLM simulation')
    const lowActionSim = createMockSimulation(2, 2, 4, false)
    const lowActionScores = calculateAllScoresWithML(
      lowActionSim,
      fight.weightClass,
      { titleFight: fight.titleFight, mainEvent: fight.mainEvent },
      mlTier
    )
    console.log(`    LLM Fun Score: ${lowActionScores.funScore}`)
    console.log(`    Validated Fun Score: ${lowActionScores.validatedFunScore}`)
    console.log(`    Agreement: ${lowActionScores.mlComparison?.funScoreAgreement}`)
    console.log(`    Confidence Adj: ${lowActionScores.mlComparison?.confidenceAdjustment.toFixed(2)}x`)

    // Show flagging behavior
    if (highActionScores.shouldFlag) {
      console.log(`\n  ⚠️ HIGH-ACTION FLAGGED: ${highActionScores.flagReason}`)
    }
    if (lowActionScores.shouldFlag) {
      console.log(`\n  ⚠️ LOW-ACTION FLAGGED: ${lowActionScores.flagReason}`)
    }
  }

  // Detailed explanation for first fight
  if (fights.length > 0) {
    const fight = fights[0]
    const mlTier: MLTierPrediction = {
      tier: fight.mlTier!,
      confidence: fight.mlTierConfidence ?? 0.5,
      probabilities: fight.mlTierProbabilities as number[] ?? [],
    }
    const sim = createMockSimulation(4, 4, 3, true)

    console.log('\n' + '=' .repeat(70))
    console.log('DETAILED EXPLANATION EXAMPLE')
    console.log('=' .repeat(70))
    console.log(`\nFight: ${fight.fighter1.name} vs ${fight.fighter2.name}\n`)

    const explanation = explainScoreCalculationWithML(
      sim,
      fight.weightClass,
      { titleFight: fight.titleFight, mainEvent: fight.mainEvent },
      mlTier
    )
    console.log(explanation)
  }

  // Summary statistics
  console.log('\n' + '=' .repeat(70))
  console.log('SUMMARY')
  console.log('=' .repeat(70))

  const tierDistribution = await prisma.fight.groupBy({
    by: ['mlTier'],
    where: { mlTier: { not: null } },
    _count: true,
  })

  console.log('\nML Tier Distribution in Database:')
  for (const tier of tierDistribution.sort((a, b) => (a.mlTier ?? 0) - (b.mlTier ?? 0))) {
    const label = ['Low', 'Average', 'Good', 'Excellent', 'Elite'][tier.mlTier! - 1]
    console.log(`  Tier ${tier.mlTier} (${label}): ${tier._count} fights`)
  }

  const avgConfidence = await prisma.fight.aggregate({
    where: { mlTier: { not: null } },
    _avg: { mlTierConfidence: true },
  })
  console.log(`\nAverage ML Tier Confidence: ${(avgConfidence._avg.mlTierConfidence! * 100).toFixed(1)}%`)

  await prisma.$disconnect()
  console.log('\nDone!')
}

testMLTierIntegration().catch(console.error)
