// Load environment variables
import { config } from 'dotenv'
import { existsSync } from 'fs'
if (existsSync('.env.local')) {
  config({ path: '.env.local' })
}

import { prisma } from '../src/lib/database/prisma'

async function main() {
  const prediction = await prisma.prediction.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      fight: {
        include: {
          fighter1: true,
          fighter2: true,
          event: true
        }
      }
    }
  })

  if (!prediction) {
    console.log('No prediction found')
    return
  }

  const reasoning = prediction.finishReasoning as any
  const breakdown = prediction.funBreakdown as any

  console.log('\n' + '='.repeat(80))
  console.log('AI FIGHT PREDICTION')
  console.log('='.repeat(80))
  console.log(`Event: ${prediction.fight.event.name}`)
  console.log(`Date: ${prediction.fight.event.date.toISOString().split('T')[0]}`)
  console.log(`Fight: ${prediction.fight.fighter1.name} vs ${prediction.fight.fighter2.name}`)
  console.log(`Weight Class: ${prediction.fight.weightClass}`)
  console.log(`Card Position: ${prediction.fight.cardPosition}`)
  console.log()

  console.log('─'.repeat(80))
  console.log('FINISH PROBABILITY PREDICTION')
  console.log('─'.repeat(80))
  console.log(`Probability: ${(prediction.finishProbability * 100).toFixed(1)}%`)
  console.log(`Confidence: ${(prediction.finishConfidence * 100).toFixed(1)}%`)
  console.log()
  console.log('Chain-of-Thought Reasoning:')
  console.log()
  console.log('1. DEFENSIVE COMPARISON:')
  console.log(`   ${reasoning.defensiveComparison}`)
  console.log()
  console.log('2. FINISH RATE COMPARISON:')
  console.log(`   ${reasoning.finishRateComparison}`)
  console.log()
  console.log('3. WEIGHT CLASS ADJUSTMENT:')
  console.log(`   ${reasoning.weightClassAdjustment}`)
  console.log()
  console.log('4. FINAL ASSESSMENT:')
  console.log(`   ${reasoning.finalAssessment}`)
  console.log()

  console.log('─'.repeat(80))
  console.log('FUN SCORE PREDICTION')
  console.log('─'.repeat(80))
  console.log(`Fun Score: ${prediction.funScore.toFixed(1)}/100`)
  console.log(`Confidence: ${(prediction.funConfidence * 100).toFixed(1)}%`)
  console.log()
  console.log('Score Breakdown:')
  console.log(`  Pace Score:          ${breakdown.paceScore}/40`)
  console.log(`  Finish Rate Score:   ${breakdown.finishRateScore}/40`)
  console.log(`  Secondary Factors:   ${breakdown.secondaryScore}/30`)
  console.log(`  Style Matchup:       ${breakdown.styleMatchupScore}/20`)
  console.log(`  Context Bonus:       ${breakdown.contextBonus}/10`)
  console.log(`  Penalties:           ${breakdown.penalties}`)
  console.log(`  ────────────────────────────────`)
  console.log(`  TOTAL:               ${prediction.funScore.toFixed(1)}/100`)
  console.log()
  console.log('Reasoning:')
  console.log(`  ${breakdown.reasoning}`)
  console.log()

  console.log('─'.repeat(80))
  console.log('FIGHTER STATISTICS USED')
  console.log('─'.repeat(80))
  const f1 = prediction.fight.fighter1
  const f2 = prediction.fight.fighter2

  console.log(`${f1.name}:`)
  console.log(`  Record: ${f1.record || 'Unknown'}`)
  console.log(`  Strikes Landed/min: ${f1.significantStrikesLandedPerMinute}`)
  console.log(`  Strikes Absorbed/min: ${f1.significantStrikesAbsorbedPerMinute}`)
  console.log(`  Striking Defense: ${(f1.strikingDefensePercentage * 100).toFixed(0)}%`)
  console.log(`  Finish Rate: ${(f1.finishRate * 100).toFixed(0)}%`)
  console.log(`  KO Rate: ${(f1.koPercentage * 100).toFixed(0)}%`)
  console.log(`  Submission Rate: ${(f1.submissionPercentage * 100).toFixed(0)}%`)
  console.log()
  console.log(`${f2.name}:`)
  console.log(`  Record: ${f2.record || 'Unknown'}`)
  console.log(`  Strikes Landed/min: ${f2.significantStrikesLandedPerMinute}`)
  console.log(`  Strikes Absorbed/min: ${f2.significantStrikesAbsorbedPerMinute}`)
  console.log(`  Striking Defense: ${(f2.strikingDefensePercentage * 100).toFixed(0)}%`)
  console.log(`  Finish Rate: ${(f2.finishRate * 100).toFixed(0)}%`)
  console.log(`  KO Rate: ${(f2.koPercentage * 100).toFixed(0)}%`)
  console.log(`  Submission Rate: ${(f2.submissionPercentage * 100).toFixed(0)}%`)
  console.log()

  console.log('─'.repeat(80))
  console.log('METADATA')
  console.log('─'.repeat(80))
  console.log(`Model: ${prediction.modelUsed}`)
  console.log(`Tokens Used: ${prediction.tokensUsed.toLocaleString()}`)
  console.log(`Cost: $${prediction.costUsd.toFixed(4)}`)
  console.log(`Generated: ${prediction.createdAt.toISOString()}`)
  console.log(`Version: ${prediction.versionId}`)
  console.log('='.repeat(80) + '\n')
}

main().finally(() => prisma.$disconnect())
