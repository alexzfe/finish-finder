#!/usr/bin/env node
/**
 * Generate predictions for every upcoming fight that doesn't already have one
 * for the active PredictionVersion. Bump PREDICTION_VERSION whenever the
 * prompt, deterministic math, or output contract changes.
 *
 * Versioning is deliberately manual: an earlier approach hashed the source
 * files producing the prediction, but cosmetic edits churned the version
 * and bloated the PredictionVersion table, so it was dropped.
 *
 * Flags:
 *   --limit N         Cap this run to N fights (smoke-testing a new version)
 *   --include-past    Also predict fights whose event date has passed
 *                     (evaluation mode — generates predictions for historical
 *                     events so accuracy can be measured against actualFinish)
 *   --event-id ID     Restrict to a single event (implies --include-past for
 *                     historical events; useful for A/B-ing one card)
 */

import { config } from 'dotenv'
import { existsSync } from 'fs'

const envPath = '.env.local'
if (existsSync(envPath)) {
  config({ path: envPath })
}

import { OpenAIAdapter } from '../src/lib/ai/adapters'
import { PredictionStore } from '../src/lib/ai/persistence/predictionStore'
import { Predictor } from '../src/lib/ai/predictor'
import { buildSnapshot, type FightWithRelations } from '../src/lib/ai/snapshot'
import { prisma } from '../src/lib/database/prisma'

const PREDICTION_VERSION = 'v4.3-low-effort-gpt55'
const PREDICTION_VERSION_DESCRIPTION = `Hybrid Judgment Architecture
- Finish Probability: Deterministic (from attributes)
- Fun Score: AI Judgment (1-10 integer)
- Producer: Predictor + LLMAdapter
- Model: gpt-5.5
- Reasoning effort: low (was default medium in v4.2)
- Output: attributes + funScore + keyFactors`

const OPENAI_MODEL = 'gpt-5.5' as const

const RATE_LIMIT_DELAY_MS = 2000

function parseLimit(): number | null {
  const arg = process.argv.find((a) => a.startsWith('--limit'))
  if (!arg) return null
  const value = arg.includes('=') ? arg.split('=')[1] : process.argv[process.argv.indexOf(arg) + 1]
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parseEventId(): string | null {
  const arg = process.argv.find((a) => a.startsWith('--event-id'))
  if (!arg) return null
  const value = arg.includes('=') ? arg.split('=')[1] : process.argv[process.argv.indexOf(arg) + 1]
  return value && value.length > 0 ? value : null
}

async function main() {
  console.log('🤖 Generating Hybrid Judgment Predictions for All Fights')
  console.log('='.repeat(60))

  const limit = parseLimit()
  const includePast = process.argv.includes('--include-past')
  const eventId = parseEventId()
  if (limit) {
    console.log(`⚠️  --limit ${limit} — capping this run`)
  }
  if (includePast) {
    console.log('⚠️  --include-past — predicting events whose date has passed (evaluation mode)')
  }
  if (eventId) {
    console.log(`⚠️  --event-id ${eventId} — restricting to a single event`)
  }

  const store = new PredictionStore(prisma)

  const version = await ensurePredictionVersion()
  console.log(`✅ Version: ${version.version}`)

  const allFights = await store.findFightsMissingPrediction({
    versionId: version.id,
    eventId,
    includePast,
  })
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

  const adapter = new OpenAIAdapter({ model: OPENAI_MODEL, reasoningEffort: 'low' })
  const predictor = new Predictor(adapter)
  console.log(`\n🧠 Using OpenAIAdapter(model=${OPENAI_MODEL}) with hybrid judgment\n`)

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
      await store.save({
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
        `  ✅ Saved: Finish ${(prediction.finishProbability * 100).toFixed(0)}% | Fun ${prediction.funScore}/10`
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
  // Atomically make PREDICTION_VERSION the *only* active row. /api/db-events
  // picks the most recent active version, so leaving prior versions active
  // would hide today's cohort behind whichever one the API found first.
  return prisma.$transaction(async (tx) => {
    await tx.predictionVersion.updateMany({
      where: { version: { not: PREDICTION_VERSION }, active: true },
      data: { active: false },
    })

    const existing = await tx.predictionVersion.findUnique({
      where: { version: PREDICTION_VERSION },
    })
    if (existing) {
      return existing.active
        ? existing
        : tx.predictionVersion.update({
            where: { version: PREDICTION_VERSION },
            data: { active: true },
          })
    }

    return tx.predictionVersion.create({
      data: {
        version: PREDICTION_VERSION,
        finishPromptHash: PREDICTION_VERSION,
        funScorePromptHash: PREDICTION_VERSION,
        description: PREDICTION_VERSION_DESCRIPTION,
        active: true,
      },
    })
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
