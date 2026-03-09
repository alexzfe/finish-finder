#!/usr/bin/env node
/**
 * Generate Hybrid Judgment Predictions for All Fights Without Predictions
 * 
 * Uses the hybrid approach:
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
import type { FighterEntertainmentContext } from '../src/lib/ai/schemas/fighterEntertainmentProfile'

/**
 * Transform a DB entertainment profile record into the FighterEntertainmentContext
 * shape expected by the hybrid judgment prompt.
 */
function toEntertainmentContext(dbProfile: {
  primaryArchetype: string
  secondaryArchetype: string | null
  archetypeConfidence: number
  mentality: string
  mentalityConfidence: number
  reputationTags: string[]
  bonusHistory: any
  entertainmentPrediction: string
}): FighterEntertainmentContext {
  return {
    primary_archetype: dbProfile.primaryArchetype as any,
    secondary_archetype: (dbProfile.secondaryArchetype as any) ?? null,
    archetype_confidence: dbProfile.archetypeConfidence,
    mentality: dbProfile.mentality as any,
    mentality_confidence: dbProfile.mentalityConfidence,
    reputation_tags: dbProfile.reputationTags,
    bonus_history: dbProfile.bonusHistory ?? {
      fotn_count: 0,
      potn_count: 0,
      total_bonuses: 0,
      bonus_rate_estimate: null,
    },
    entertainment_prediction: dbProfile.entertainmentPrediction as any,
  }
}

// Hash file for version tracking
function hashFile(filePath: string): string {
  const absolutePath = join(process.cwd(), filePath)
  const content = readFileSync(absolutePath, 'utf8')
  return createHash('sha256').update(content).digest('hex')
}

async function generateAllHybridPredictions() {
  console.log('🤖 Generating Hybrid Judgment Predictions for All Fights')
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

  // Find all fights needing predictions (upcoming events, no predictions for this version)
  console.log('\n🔍 Finding fights without predictions...')
  
  const fightsNeedingPredictions = await prisma.fight.findMany({
    where: {
      isCancelled: false,
      predictions: {
        none: {
          versionId: version.id,
        },
      },
    },
    include: {
      fighter1: {
        include: {
          entertainmentProfile: true,
          contextChunks: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
      fighter2: {
        include: {
          entertainmentProfile: true,
          contextChunks: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
      event: true,
    },
    orderBy: [
      { event: { date: 'asc' } },
      { fightNumber: 'asc' },
    ],
  })

  if (fightsNeedingPredictions.length === 0) {
    console.log('✅ All fights already have hybrid predictions!')
    process.exit(0)
  }

  console.log(`📝 Found ${fightsNeedingPredictions.length} fights needing predictions\n`)

  // Group by event for display
  const fightsByEvent = fightsNeedingPredictions.reduce((acc, fight) => {
    const eventName = fight.event.name
    if (!acc[eventName]) acc[eventName] = []
    acc[eventName].push(fight)
    return acc
  }, {} as Record<string, typeof fightsNeedingPredictions>)

  for (const [eventName, fights] of Object.entries(fightsByEvent)) {
    console.log(`  📅 ${eventName}: ${fights.length} fights`)
  }
  console.log('')

  // Initialize service
  const service = new HybridJudgmentService('openai')
  console.log('🧠 Using OpenAI GPT-4o with hybrid judgment\n')

  let totalTokens = 0
  let totalCost = 0
  const results: Array<{
    fight: string
    event: string
    finishProb: number
    funScore: number
    success: boolean
  }> = []

  for (let i = 0; i < fightsNeedingPredictions.length; i++) {
    const fight = fightsNeedingPredictions[i]
    console.log(`\n[${i + 1}/${fightsNeedingPredictions.length}] ${fight.event.name}`)
    console.log(`    ${fight.fighter1.name} vs ${fight.fighter2.name}`)

    try {
      // Extract entertainment profiles if available
      const f1Profile = fight.fighter1.entertainmentProfile
        ? toEntertainmentContext(fight.fighter1.entertainmentProfile)
        : undefined
      const f2Profile = fight.fighter2.entertainmentProfile
        ? toEntertainmentContext(fight.fighter2.entertainmentProfile)
        : undefined

      // Extract most recent context chunk if available
      const f1Context = fight.fighter1.contextChunks?.[0]?.content
      const f2Context = fight.fighter2.contextChunks?.[0]?.content

      const hasF1Profile = !!f1Profile
      const hasF2Profile = !!f2Profile
      const hasF1Context = !!f1Context
      const hasF2Context = !!f2Context
      console.log(`    Profiles: ${hasF1Profile ? '✓' : '✗'} ${fight.fighter1.name} | ${hasF2Profile ? '✓' : '✗'} ${fight.fighter2.name}`)
      console.log(`    Context:  ${hasF1Context ? '✓' : '✗'} ${fight.fighter1.name} | ${hasF2Context ? '✓' : '✗'} ${fight.fighter2.name}`)

      // Build input with profiles and context
      const input = buildJudgmentInput(
        fight.fighter1,
        fight.fighter2,
        {
          eventName: fight.event.name,
          weightClass: fight.weightClass,
          titleFight: fight.titleFight,
          mainEvent: fight.mainEvent,
        },
        f1Context,
        f2Context,
        f1Profile,
        f2Profile
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
        event: fight.event.name,
        finishProb: result.finishProbability,
        funScore: result.funScore,
        success: true,
      })

      // Rate limiting - 2 second delay between calls
      if (i < fightsNeedingPredictions.length - 1) {
        await new Promise(r => setTimeout(r, 2000))
      }

    } catch (error) {
      console.error(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`)
      results.push({
        fight: `${fight.fighter1.name} vs ${fight.fighter2.name}`,
        event: fight.event.name,
        finishProb: 0,
        funScore: 0,
        success: false,
      })
    }
  }

  // Summary
  console.log('\n\n' + '=' .repeat(60))
  console.log('📊 FINAL SUMMARY')
  console.log('=' .repeat(60))
  
  const successCount = results.filter(r => r.success).length
  const failedCount = results.length - successCount
  const successfulResults = results.filter(r => r.success)
  
  const avgFunScore = successfulResults.reduce((sum, r) => sum + r.funScore, 0) / successCount
  const avgFinishProb = successfulResults.reduce((sum, r) => sum + r.finishProb, 0) / successCount
  
  console.log(`Total fights processed: ${fightsNeedingPredictions.length}`)
  console.log(`✅ Success: ${successCount}`)
  console.log(`❌ Failed: ${failedCount}`)
  console.log(`Total tokens: ${totalTokens.toLocaleString()}`)
  console.log(`Total cost: $${totalCost.toFixed(4)}`)
  console.log(`Average cost per fight: $${(totalCost / successCount).toFixed(4)}`)
  console.log(`Average fun score: ${avgFunScore.toFixed(1)}/100`)
  console.log(`Average finish probability: ${(avgFinishProb * 100).toFixed(1)}%`)
  
  // Fun score distribution
  const highFun = successfulResults.filter(r => r.funScore >= 70).length
  const medFun = successfulResults.filter(r => r.funScore >= 50 && r.funScore < 70).length
  const lowFun = successfulResults.filter(r => r.funScore < 50).length
  
  console.log(`\nFun Score Distribution:`)
  console.log(`  🔥 High (70-100): ${highFun} fights (${Math.round(highFun/successCount*100)}%)`)
  console.log(`  ⚖️  Medium (50-69): ${medFun} fights (${Math.round(medFun/successCount*100)}%)`)
  console.log(`  😴 Low (0-49): ${lowFun} fights (${Math.round(lowFun/successCount*100)}%)`)
  
  console.log(`\nVersion: ${version.version}`)
  console.log('\n🎉 All hybrid predictions saved to database!')
}

generateAllHybridPredictions()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
