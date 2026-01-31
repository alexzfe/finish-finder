#!/usr/bin/env node
/**
 * Test Hybrid Judgment Prediction on UFC 325
 * 
 * Uses the new approach:
 * - Deterministic finish probability
 * - AI judgment fun score
 */

import { config } from 'dotenv'
import { existsSync } from 'fs'

const envPath = '.env.local'
if (existsSync(envPath)) {
  config({ path: envPath })
}

import { prisma } from '../src/lib/database/prisma'
import {
  HybridJudgmentService,
  buildJudgmentInput,
} from '../src/lib/ai/hybridJudgmentService'

async function testUFC325() {
  console.log('🧪 Testing Hybrid Judgment Prediction on UFC 325')
  console.log('=' .repeat(60))

  // Get UFC 325 event
  const event = await prisma.event.findFirst({
    where: { name: { contains: '325' } },
    include: {
      fights: {
        where: { isCancelled: false },
        include: {
          fighter1: true,
          fighter2: true,
          predictions: true,
        },
        orderBy: { fightNumber: 'asc' },
      },
    },
  })

  if (!event) {
    console.error('❌ UFC 325 not found')
    process.exit(1)
  }

  console.log(`\n📅 ${event.name}`)
  console.log(`📍 ${event.location}`)
  console.log(`🥊 ${event.fights.length} fights to predict\n`)

  // Initialize service
  const service = new HybridJudgmentService('openai')  // or 'anthropic'
  console.log('🤖 Using OpenAI GPT-4o with hybrid judgment\n')

  const results = []

  for (let i = 0; i < event.fights.length; i++) {
    const fight = event.fights[i]
    console.log(`\n[${i + 1}/${event.fights.length}] ${fight.fighter1.name} vs ${fight.fighter2.name}`)
    console.log('-'.repeat(60))

    try {
      // Build input
      const input = buildJudgmentInput(
        fight.fighter1,
        fight.fighter2,
        {
          eventName: event.name,
          weightClass: fight.weightClass,
          titleFight: fight.titleFight,
          mainEvent: fight.mainEvent,
        }
      )

      // Get prediction
      const result = await service.predictFight(input)

      // Display results
      console.log(`  📊 FINISH PROBABILITY (Deterministic): ${(result.finishProbability * 100).toFixed(0)}%`)
      console.log(`     └─ Calculated from: danger=${result.output.attributes.finishDanger}, style=${result.output.attributes.styleClash}`)
      
      console.log(`  🎭 FUN SCORE (AI Judgment): ${result.funScore}/100`)
      console.log(`     └─ AI Confidence: ${(result.funConfidence * 100).toFixed(0)}%`)
      
      console.log(`  📝 AI Reasoning:`)
      console.log(`     └─ ${result.output.reasoning.entertainmentJudgment.substring(0, 100)}...`)
      
      console.log(`  🎯 Key Factors: ${result.output.keyFactors.join(', ')}`)
      console.log(`  💰 Cost: $${result.costUsd.toFixed(4)} (${result.tokensUsed} tokens)`)

      results.push({
        fight: `${fight.fighter1.name} vs ${fight.fighter2.name}`,
        finishProb: result.finishProbability,
        funScore: result.funScore,
        cost: result.costUsd,
      })

      // Small delay between calls
      if (i < event.fights.length - 1) {
        await new Promise(r => setTimeout(r, 1000))
      }

    } catch (error) {
      console.error(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Summary
  console.log('\n\n' + '=' .repeat(60))
  console.log('📊 SUMMARY')
  console.log('=' .repeat(60))
  
  const totalCost = results.reduce((sum, r) => sum + r.cost, 0)
  const avgFunScore = results.reduce((sum, r) => sum + r.funScore, 0) / results.length
  const avgFinishProb = results.reduce((sum, r) => sum + r.finishProb, 0) / results.length
  
  console.log(`Total fights: ${results.length}`)
  console.log(`Total cost: $${totalCost.toFixed(4)}`)
  console.log(`Average cost per fight: $${(totalCost / results.length).toFixed(4)}`)
  console.log(`Average fun score: ${avgFunScore.toFixed(1)}/100`)
  console.log(`Average finish probability: ${(avgFinishProb * 100).toFixed(1)}%`)
  
  // Distribution
  const highFun = results.filter(r => r.funScore >= 70).length
  const medFun = results.filter(r => r.funScore >= 50 && r.funScore < 70).length
  const lowFun = results.filter(r => r.funScore < 50).length
  
  console.log(`\nFun Score Distribution:`)
  console.log(`  High (70-100): ${highFun} fights`)
  console.log(`  Medium (50-69): ${medFun} fights`)
  console.log(`  Low (0-49): ${lowFun} fights`)
}

testUFC325()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
