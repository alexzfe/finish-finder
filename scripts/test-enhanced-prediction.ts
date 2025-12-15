/**
 * Test Enhanced Prediction Service
 */
import { PrismaClient } from '@prisma/client'
import { createEnhancedPredictionService } from '../src/lib/ai/enhancedPredictionService'
import type { FinishProbabilityInput, FunScoreInput } from '../src/lib/ai/prompts'
import { classifyFighterStyle } from '../src/lib/ai/prompts/funScorePrompt'

const prisma = new PrismaClient()

async function test() {
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('TESTING ENHANCED PREDICTION SERVICE')
  console.log('═══════════════════════════════════════════════════════════════════\n')

  // Get a fight with fighter details
  const fight = await prisma.fight.findFirst({
    where: { completed: false },
    include: {
      fighter1: true,
      fighter2: true,
      event: true,
    },
    orderBy: { event: { date: 'asc' } }
  })

  if (!fight) {
    console.log('No upcoming fights found')
    return
  }

  console.log(`Fight: ${fight.fighter1.name} vs ${fight.fighter2.name}`)
  console.log(`Event: ${fight.event.name}`)
  console.log(`Weight Class: ${fight.weightClass}\n`)

  // Build inputs
  const f1 = fight.fighter1
  const f2 = fight.fighter2

  const finishInput: FinishProbabilityInput = {
    fighter1: {
      name: f1.name,
      record: `${f1.wins}-${f1.losses}-${f1.draws}`,
      significantStrikesAbsorbedPerMinute: f1.significantStrikesAbsorbedPerMinute || 0,
      strikingDefensePercentage: f1.strikingDefensePercentage || 0,
      takedownDefensePercentage: f1.takedownDefensePercentage || 0,
      lossFinishRate: f1.lossFinishRate || 0,
      koLossPercentage: f1.koLossPercentage || 0,
      submissionLossPercentage: f1.submissionLossPercentage || 0,
      finishRate: f1.finishRate || 0,
      koPercentage: f1.koPercentage || 0,
      submissionPercentage: f1.submissionPercentage || 0,
      significantStrikesLandedPerMinute: f1.significantStrikesLandedPerMinute || 0,
      submissionAverage: f1.submissionAverage || 0,
    },
    fighter2: {
      name: f2.name,
      record: `${f2.wins}-${f2.losses}-${f2.draws}`,
      significantStrikesAbsorbedPerMinute: f2.significantStrikesAbsorbedPerMinute || 0,
      strikingDefensePercentage: f2.strikingDefensePercentage || 0,
      takedownDefensePercentage: f2.takedownDefensePercentage || 0,
      lossFinishRate: f2.lossFinishRate || 0,
      koLossPercentage: f2.koLossPercentage || 0,
      submissionLossPercentage: f2.submissionLossPercentage || 0,
      finishRate: f2.finishRate || 0,
      koPercentage: f2.koPercentage || 0,
      submissionPercentage: f2.submissionPercentage || 0,
      significantStrikesLandedPerMinute: f2.significantStrikesLandedPerMinute || 0,
      submissionAverage: f2.submissionAverage || 0,
    },
    context: {
      eventName: fight.event.name,
      weightClass: fight.weightClass,
    }
  }

  const funInput: FunScoreInput = {
    fighter1: {
      name: f1.name,
      record: `${f1.wins}-${f1.losses}-${f1.draws}`,
      significantStrikesLandedPerMinute: f1.significantStrikesLandedPerMinute || 0,
      significantStrikesAbsorbedPerMinute: f1.significantStrikesAbsorbedPerMinute || 0,
      finishRate: f1.finishRate || 0,
      koPercentage: f1.koPercentage || 0,
      submissionPercentage: f1.submissionPercentage || 0,
      averageFightTimeSeconds: f1.averageFightTimeSeconds || 900,
      winsByDecision: f1.winsByDecision || 0,
      submissionAverage: f1.submissionAverage || 0,
      strikingDefensePercentage: f1.strikingDefensePercentage || 0,
      takedownAverage: f1.takedownAverage || 0,
      takedownDefensePercentage: f1.takedownDefensePercentage || 0,
      totalWins: f1.wins,
      primaryStyle: classifyFighterStyle({
        significantStrikesLandedPerMinute: f1.significantStrikesLandedPerMinute || 0,
        takedownAverage: f1.takedownAverage || 0,
        submissionAverage: f1.submissionAverage || 0,
      }),
    },
    fighter2: {
      name: f2.name,
      record: `${f2.wins}-${f2.losses}-${f2.draws}`,
      significantStrikesLandedPerMinute: f2.significantStrikesLandedPerMinute || 0,
      significantStrikesAbsorbedPerMinute: f2.significantStrikesAbsorbedPerMinute || 0,
      finishRate: f2.finishRate || 0,
      koPercentage: f2.koPercentage || 0,
      submissionPercentage: f2.submissionPercentage || 0,
      averageFightTimeSeconds: f2.averageFightTimeSeconds || 900,
      winsByDecision: f2.winsByDecision || 0,
      submissionAverage: f2.submissionAverage || 0,
      strikingDefensePercentage: f2.strikingDefensePercentage || 0,
      takedownAverage: f2.takedownAverage || 0,
      takedownDefensePercentage: f2.takedownDefensePercentage || 0,
      totalWins: f2.wins,
      primaryStyle: classifyFighterStyle({
        significantStrikesLandedPerMinute: f2.significantStrikesLandedPerMinute || 0,
        takedownAverage: f2.takedownAverage || 0,
        submissionAverage: f2.submissionAverage || 0,
      }),
    },
    context: {
      eventName: fight.event.name,
      weightClass: fight.weightClass,
      titleFight: fight.titleFight,
      mainEvent: fight.mainEvent,
    }
  }

  console.log('Creating enhanced prediction service...')
  const service = await createEnhancedPredictionService('openai', {
    applyCalibration: true,
    includeConformalIntervals: true,
    useEnrichedContext: true,
    logPrediction: false, // Don't log for test
  })

  console.log(`Calibration loaded: ${service.hasCalibration()}`)
  console.log(`Conformal intervals loaded: ${service.hasConformalIntervals()}\n`)

  console.log('Running prediction...\n')

  const prediction = await service.predictFight(
    finishInput,
    funInput,
    fight.fighter1Id,
    fight.fighter2Id,
    fight.id,
    fight.mainEvent || fight.titleFight
  )

  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('PREDICTION RESULTS')
  console.log('═══════════════════════════════════════════════════════════════════\n')

  console.log(`Finish Probability: ${(prediction.finishProbability * 100).toFixed(1)}%`)
  console.log(`  Calibration Applied: ${prediction.calibrationApplied}`)
  console.log(`  Confidence: ${(prediction.finishConfidence * 100).toFixed(1)}%`)

  console.log(`\nFun Score: ${prediction.funScore}`)
  if (prediction.funScoreInterval) {
    console.log(`  90% Confidence Interval: [${prediction.funScoreInterval.lower.toFixed(0)}, ${prediction.funScoreInterval.upper.toFixed(0)}]`)
  }
  console.log(`  Confidence: ${(prediction.funConfidence * 100).toFixed(1)}%`)

  console.log(`\nContext Enhanced: ${prediction.contextEnhanced}`)
  console.log(`Context Quality: ${prediction.contextQuality}`)

  console.log(`\nFinish Reasoning:`)
  console.log(`  ${prediction.finishReasoning.finalAssessment}`)

  console.log(`\nFun Reasoning:`)
  console.log(`  ${prediction.funBreakdown.reasoning}`)

  console.log(`\nKey Factors (Finish): ${prediction.finishReasoning.keyFactors.join(', ') || 'N/A'}`)
  console.log(`Key Factors (Fun): ${prediction.funBreakdown.keyFactors.join(', ') || 'N/A'}`)

  console.log(`\nModel: ${prediction.modelUsed}`)
  console.log(`Tokens: ${prediction.tokensUsed}`)
  console.log(`Cost: $${prediction.costUsd.toFixed(4)}`)

  await prisma.$disconnect()
}

test().catch(console.error)
