#!/usr/bin/env node
/**
 * Generate predictions for every upcoming fight that doesn't already have one
 * for the active PredictionVersion. Bump PREDICTION_VERSION whenever the
 * prompt, deterministic math, or output contract changes.
 *
 * Flags:
 *   --limit N         Cap this run to N fights (smoke-testing a new version)
 *   --include-past    Also predict fights whose event date has passed
 *                     (evaluation mode — generates predictions for historical
 *                     events so accuracy can be measured against actualFinish)
 */

import { config } from 'dotenv'
import { existsSync } from 'fs'

const envPath = '.env.local'
if (existsSync(envPath)) {
  config({ path: envPath })
}

import { OpenAIAdapter } from '../src/lib/ai/adapters'
import { PredictionRepository } from '../src/lib/ai/persistence/predictionRepository'
import { Predictor } from '../src/lib/ai/predictor'
import { buildSnapshot, type FightWithRelations } from '../src/lib/ai/snapshot'
import { prisma } from '../src/lib/database/prisma'

const PREDICTION_VERSION = 'v4.0-funscore-1to10'
const PREDICTION_VERSION_DESCRIPTION = `Hybrid Judgment Architecture
- Finish Probability: Deterministic (from attributes)
- Fun Score: AI Judgment (1-10 integer)
- Producer: Predictor + LLMAdapter
- Output: attributes + funScore + keyFactors + confidence (no reasoning)`

const RATE_LIMIT_DELAY_MS = 2000

function parseLimit(): number | null {
  const arg = process.argv.find((a) => a.startsWith('--limit'))
  if (!arg) return null
  const value = arg.includes('=') ? arg.split('=')[1] : process.argv[process.argv.indexOf(arg) + 1]
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

async function main() {
  console.log('🤖 Generating Hybrid Judgment Predictions for All Fights')
  console.log('='.repeat(60))

  const limit = parseLimit()
  const includePast = process.argv.includes('--include-past')
  if (limit) {
    console.log(`⚠️  --limit ${limit} — capping this run`)
  }
  if (includePast) {
    console.log('⚠️  --include-past — predicting events whose date has passed (evaluation mode)')
  }

  const version = await ensurePredictionVersion()
  console.log(`✅ Version: ${version.version}`)

  const allFights = await findFightsMissingPredictions(version.id, includePast)
  const fights = limit ? allFights.slice(0, limit) : allFights
  if (allFights.length === 0) {
    console.log('✅ All fights already have predictions for this version.')
    return
  }
  if (limit && allFights.length > limit) {
    console.log(`📊 ${allFights.length} fight(s) need predictions; processing the first ${limit}.`)
  }

  console.log(`\n📝 Found ${fights.length} fights needing predictions`)
  for (const [eventName, count] of Object.entries(groupByEvent(fights))) {
    console.log(`  📅 ${eventName}: ${count} fights`)
  }

  const adapter = new OpenAIAdapter()
  const predictor = new Predictor(adapter)
  const repository = new PredictionRepository(prisma)
  console.log('\n🧠 Using OpenAIAdapter (default model) with hybrid judgment\n')

  let totalTokens = 0
  let totalCost = 0
  let successCount = 0
  let failedCount = 0
  const successfulFunScores: number[] = []
  const successfulFinishProbs: number[] = []

  for (let i = 0; i < fights.length; i++) {
    const fight = fights[i]
    console.log(`\n[${i + 1}/${fights.length}] ${fight.event.name}`)
    console.log(`    ${fight.fighter1.name} vs ${fight.fighter2.name}`)

    try {
      const snapshot = buildSnapshot(fight)
      const prediction = await predictor.predict(snapshot)
      await repository.save({
        fightId: fight.id,
        versionId: version.id,
        prediction,
      })

      totalTokens += prediction.tokensUsed
      totalCost += prediction.costUsd
      successCount += 1
      successfulFunScores.push(prediction.funScore)
      successfulFinishProbs.push(prediction.finishProbability)

      console.log(
        `  ✅ Saved: Finish ${(prediction.finishProbability * 100).toFixed(0)}% | Fun ${prediction.funScore}/10 | Conf ${prediction.finishConfidence.toFixed(2)}`
      )
    } catch (error) {
      failedCount += 1
      console.error(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`)
    }

    if (i < fights.length - 1) {
      await sleep(RATE_LIMIT_DELAY_MS)
    }
  }

  printSummary({
    total: fights.length,
    successCount,
    failedCount,
    totalTokens,
    totalCost,
    funScores: successfulFunScores,
    finishProbs: successfulFinishProbs,
    version: version.version,
  })
}

async function ensurePredictionVersion() {
  const existing = await prisma.predictionVersion.findUnique({
    where: { version: PREDICTION_VERSION },
  })
  if (existing) return existing

  return prisma.predictionVersion.create({
    data: {
      version: PREDICTION_VERSION,
      finishPromptHash: PREDICTION_VERSION,
      funScorePromptHash: PREDICTION_VERSION,
      description: PREDICTION_VERSION_DESCRIPTION,
      active: true,
    },
  })
}

async function findFightsMissingPredictions(
  versionId: string,
  includePast: boolean
): Promise<FightWithRelations[]> {
  return prisma.fight.findMany({
    where: {
      isCancelled: false,
      predictions: { none: { versionId } },
      ...(includePast ? {} : { event: { date: { gte: new Date() } } }),
    },
    include: {
      fighter1: {
        include: {
          entertainmentProfile: true,
          contextChunks: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
      fighter2: {
        include: {
          entertainmentProfile: true,
          contextChunks: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
      event: true,
    },
    orderBy: [{ event: { date: 'asc' } }, { fightNumber: 'asc' }],
  })
}

function groupByEvent(fights: FightWithRelations[]): Record<string, number> {
  return fights.reduce<Record<string, number>>((acc, fight) => {
    acc[fight.event.name] = (acc[fight.event.name] ?? 0) + 1
    return acc
  }, {})
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

interface SummaryArgs {
  total: number
  successCount: number
  failedCount: number
  totalTokens: number
  totalCost: number
  funScores: number[]
  finishProbs: number[]
  version: string
}

function printSummary({
  total,
  successCount,
  failedCount,
  totalTokens,
  totalCost,
  funScores,
  finishProbs,
  version,
}: SummaryArgs) {
  console.log('\n\n' + '='.repeat(60))
  console.log('📊 FINAL SUMMARY')
  console.log('='.repeat(60))

  const avgFun = successCount > 0 ? funScores.reduce((a, b) => a + b, 0) / successCount : 0
  const avgFinish =
    successCount > 0 ? finishProbs.reduce((a, b) => a + b, 0) / successCount : 0

  console.log(`Total fights processed: ${total}`)
  console.log(`✅ Success: ${successCount}`)
  console.log(`❌ Failed: ${failedCount}`)
  console.log(`Total tokens: ${totalTokens.toLocaleString()}`)
  console.log(`Total cost: $${totalCost.toFixed(4)}`)
  if (successCount > 0) {
    console.log(`Average cost per fight: $${(totalCost / successCount).toFixed(4)}`)
    console.log(`Average fun score: ${avgFun.toFixed(1)}/10`)
    console.log(`Average finish probability: ${(avgFinish * 100).toFixed(1)}%`)

    const high = funScores.filter((s) => s >= 7).length
    const med = funScores.filter((s) => s >= 5 && s < 7).length
    const low = funScores.filter((s) => s < 5).length
    console.log('\nFun Score Distribution:')
    console.log(`  🔥 High (7-10): ${high} fights (${pct(high, successCount)})`)
    console.log(`  ⚖️  Medium (5-6): ${med} fights (${pct(med, successCount)})`)
    console.log(`  😴 Low (1-4): ${low} fights (${pct(low, successCount)})`)
  }

  console.log(`\nVersion: ${version}`)
}

function pct(n: number, total: number) {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : '0%'
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
