#!/usr/bin/env node
/**
 * Save Hybrid Judgment Predictions for UFC 325 to Database
 * 
 * Uses the new hybrid approach:
 * - Deterministic finish probability
 * - AI judgment fun score
 */

import { config } from 'dotenv'
import { existsSync } from 'fs'

const envPath = '.env.local'
if (existsSync(envPath)) {
  config({ path: envPath })
}

import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { prisma } from '../src/lib/database/prisma'
import {
  HybridJudgmentService,
  buildJudgmentInput,
  type JudgmentPredictionResult,
} from '../src/lib/ai/hybridJudgmentService'

// Hash file for version tracking
function hashFile(filePath: string): string {
  const absolutePath = join(process.cwd(), filePath)
  const content = readFileSync(absolutePath, 'utf8')
  return createHash('sha256').update(content).digest('hex')
}

async function saveUFC325Predictions() {
  console.log('💾 Saving Hybrid Judgment Predictions for UFC 325')
  console.log('=' .repeat(60))

  // Get or create prediction version for hybrid judgment
  const promptHash = hashFile('src/lib/ai/prompts/hybridJudgmentPrompt.ts')
  const serviceHash = hashFile('src/lib/ai/hybridJudgmentService.ts')
  const compositeHash = createHash('sha256')
    .update(promptHash + serviceHash)
    .digest('hex')
    .substring(0, 16)

  let version = await prisma.predictionVersion.findFirst({
    where: {
      finishPromptHash: promptHash,
      funScorePromptHash: serviceHash,
    },
  })

  if (!version) {
    version = await prisma.predictionVersion.create({
      data: {
        version: `v3.0-hybrid-${compositeHash}`,
        finishPromptHash: promptHash,
        funScorePromptHash: serviceHash,
        description: `Hybrid Judgment Architecture
- Finish Probability: Deterministic (from attributes)
- Fun Score: AI Judgment (direct 0-100 holistic assessment)
- Service: HybridJudgmentService`,
        active: true,
      },
    })
    console.log(`✅ Created new version: ${version.version}`)
  } else {
    console.log(`✅ Using existing version: ${version.version}`)
  }

  // Get UFC 325 event
  const event = await prisma.event.findFirst({
    where: { name: { contains: '325' } },
    include: {
      fights: {
        where: { isCancelled: false },
        include: {
          fighter1: true,
          fighter2: true,
          predictions: {
            where: { versionId: version.id }
          }
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
  console.log(`🥊 ${event.fights.length} fights to process\n`)

  // Filter fights that need predictions
  const fightsNeedingPredictions = event.fights.filter(f => f.predictions.length === 0)
  
  if (fightsNeedingPredictions.length === 0) {
    console.log('✅ All fights already have hybrid predictions for this version')
    process.exit(0)
  }

  console.log(`📝 ${fightsNeedingPredictions.length} fights need predictions\n`)

  // Initialize service
  const service = new HybridJudgmentService('openai')

  let totalTokens = 0
  let totalCost = 0
  const results: Array<{
    fight: string
    finishProb: number
    funScore: number
    success: boolean
  }> = []

  for (let i = 0; i < fightsNeedingPredictions.length; i++) {
    const fight = fightsNeedingPredictions[i]
    console.log(`\n[${i + 1}/${fightsNeedingPredictions.length}] ${fight.fighter1.name} vs ${fight.fighter2.name}`)

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

      // Save to database
      await prisma.prediction.upsert({
        where: {
          fightId_versionId: {
            fightId: fight.id,
            versionId: version.id,
          },
        },
        create: {
          fightId: fight.id,
          versionId: version.id,
          finishProbability: result.finishProbability,
          finishConfidence: result.finishConfidence,
          finishReasoning: {
            vulnerabilityAnalysis: result.output.reasoning.vulnerabilityAnalysis,
            offenseAnalysis: result.output.reasoning.offenseAnalysis,
            styleMatchup: result.output.reasoning.styleMatchup,
            finalAssessment: result.output.reasoning.entertainmentJudgment,
            finishAnalysis: result.output.finishAnalysis,
            keyFactors: result.output.keyFactors,
          },
          funScore: result.funScore,
          funConfidence: result.funConfidence,
          funBreakdown: {
            aiJudgment: result.output.reasoning.entertainmentJudgment,
            funAnalysis: result.output.funAnalysis,
            narrative: result.output.narrative,
            attributes: result.output.attributes,
            keyFactors: result.output.keyFactors,
          } as any,
          modelUsed: result.modelUsed,
          tokensUsed: result.tokensUsed,
          costUsd: result.costUsd,
        },
        update: {
          finishProbability: result.finishProbability,
          finishConfidence: result.finishConfidence,
          finishReasoning: {
            vulnerabilityAnalysis: result.output.reasoning.vulnerabilityAnalysis,
            offenseAnalysis: result.output.reasoning.offenseAnalysis,
            styleMatchup: result.output.reasoning.styleMatchup,
            finalAssessment: result.output.reasoning.entertainmentJudgment,
            finishAnalysis: result.output.finishAnalysis,
            keyFactors: result.output.keyFactors,
          },
          funScore: result.funScore,
          funConfidence: result.funConfidence,
          funBreakdown: {
            aiJudgment: result.output.reasoning.entertainmentJudgment,
            funAnalysis: result.output.funAnalysis,
            narrative: result.output.narrative,
            attributes: result.output.attributes,
            keyFactors: result.output.keyFactors,
          } as any,
          modelUsed: result.modelUsed,
          tokensUsed: result.tokensUsed,
          costUsd: result.costUsd,
        },
      })

      // Calculate and save risk level
      const avgConfidence = (result.finishConfidence + result.funConfidence) / 2
      let riskLevel: 'low' | 'balanced' | 'high'
      if (avgConfidence >= 0.78) riskLevel = 'low'
      else if (avgConfidence >= 0.675) riskLevel = 'balanced'
      else riskLevel = 'high'

      await prisma.fight.update({
        where: { id: fight.id },
        data: { riskLevel },
      })

      console.log(`  ✅ Saved: Finish ${(result.finishProbability * 100).toFixed(0)}% | Fun ${result.funScore}/100 | Risk: ${riskLevel}`)

      totalTokens += result.tokensUsed
      totalCost += result.costUsd
      results.push({
        fight: `${fight.fighter1.name} vs ${fight.fighter2.name}`,
        finishProb: result.finishProbability,
        funScore: result.funScore,
        success: true,
      })

      // Rate limiting
      if (i < fightsNeedingPredictions.length - 1) {
        await new Promise(r => setTimeout(r, 1000))
      }

    } catch (error) {
      console.error(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`)
      results.push({
        fight: `${fight.fighter1.name} vs ${fight.fighter2.name}`,
        finishProb: 0,
        funScore: 0,
        success: false,
      })
    }
  }

  // Summary
  console.log('\n\n' + '=' .repeat(60))
  console.log('📊 SUMMARY')
  console.log('=' .repeat(60))
  
  const successCount = results.filter(r => r.success).length
  const avgFunScore = results.filter(r => r.success).reduce((sum, r) => sum + r.funScore, 0) / successCount
  const avgFinishProb = results.filter(r => r.success).reduce((sum, r) => sum + r.finishProb, 0) / successCount
  
  console.log(`Total fights: ${fightsNeedingPredictions.length}`)
  console.log(`✅ Success: ${successCount}`)
  console.log(`❌ Errors: ${fightsNeedingPredictions.length - successCount}`)
  console.log(`Total tokens: ${totalTokens.toLocaleString()}`)
  console.log(`Total cost: $${totalCost.toFixed(4)}`)
  console.log(`Average fun score: ${avgFunScore.toFixed(1)}/100`)
  console.log(`Average finish probability: ${(avgFinishProb * 100).toFixed(1)}%`)
  console.log(`\nVersion: ${version.version}`)
  console.log('\n🎉 UFC 325 predictions saved! Check the UI to see them.')
}

saveUFC325Predictions()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
