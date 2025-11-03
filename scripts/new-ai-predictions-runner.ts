#!/usr/bin/env node
/**
 * AI Predictions Runner - Phase 3.2
 *
 * Generates AI predictions for fights that don't have them yet.
 *
 * Features:
 * - Version management: Tracks prompt template changes via SHA256 hashes
 * - Batch processing: Processes all unpredicted fights for upcoming events
 * - Progress tracking: Logs progress and metrics (tokens, cost, time)
 * - Error handling: Continues on individual fight failures, logs errors
 *
 * Usage:
 *   npx ts-node scripts/new-ai-predictions-runner.ts [--dry-run] [--force] [--event-id=<id>]
 *
 * Options:
 *   --dry-run     Show what would be done without making API calls
 *   --force       Regenerate predictions even if they already exist
 *   --event-id    Only process fights for a specific event
 */

import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { prisma } from '../src/lib/database/prisma'
import { NewPredictionService } from '../src/lib/ai/newPredictionService'
import { classifyFighterStyle } from '../src/lib/ai/prompts'
import type { Fighter, Fight, Event } from '@prisma/client'

/**
 * Configuration
 */
const CONFIG = {
  provider: (process.env.AI_PROVIDER || 'anthropic') as 'anthropic' | 'openai',
  rateLimit: {
    delayMs: 2000, // 2 second delay between fights to avoid rate limits
  },
  promptFiles: [
    'src/lib/ai/prompts/finishProbabilityPrompt.ts',
    'src/lib/ai/prompts/funScorePrompt.ts',
    'src/lib/ai/prompts/weightClassRates.ts',
  ],
}

/**
 * Command line arguments
 */
interface Args {
  dryRun: boolean
  force: boolean
  eventId?: string
}

/**
 * Fight with all relations loaded
 */
interface FightWithRelations extends Fight {
  fighter1: Fighter
  fighter2: Fighter
  event: Event
}

/**
 * Parse command line arguments
 */
function parseArgs(): Args {
  const args = process.argv.slice(2)
  return {
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    eventId: args.find((arg) => arg.startsWith('--event-id='))?.split('=')[1],
  }
}

/**
 * Calculate SHA256 hash of a file
 */
function hashFile(filePath: string): string {
  const absolutePath = join(process.cwd(), filePath)
  const content = readFileSync(absolutePath, 'utf8')
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Get or create the current prediction version based on prompt hashes
 */
async function getOrCreateCurrentVersion(): Promise<{
  id: string
  version: string
  isNew: boolean
}> {
  // Calculate hashes of prompt template files
  const finishPromptHash = hashFile(CONFIG.promptFiles[0])
  const funScorePromptHash = hashFile(CONFIG.promptFiles[1])
  const weightClassHash = hashFile(CONFIG.promptFiles[2])

  // Combine all hashes for composite key
  const compositeHash = createHash('sha256')
    .update(finishPromptHash + funScorePromptHash + weightClassHash)
    .digest('hex')
    .substring(0, 16) // Shorter version for readability

  console.log('📊 Prompt hashes:')
  console.log(`  Finish:  ${finishPromptHash.substring(0, 16)}...`)
  console.log(`  Fun:     ${funScorePromptHash.substring(0, 16)}...`)
  console.log(`  Weights: ${weightClassHash.substring(0, 16)}...`)
  console.log(`  Composite: ${compositeHash}`)

  // Check if this version already exists
  let predictionVersion = await prisma.predictionVersion.findFirst({
    where: {
      finishPromptHash,
      funScorePromptHash,
    },
  })

  if (predictionVersion) {
    console.log(
      `✓ Found existing version: ${predictionVersion.version} (${predictionVersion.active ? 'active' : 'inactive'})`
    )
    return {
      id: predictionVersion.id,
      version: predictionVersion.version,
      isNew: false,
    }
  }

  // Create new version
  const versionName = `v1.0-${compositeHash}`
  const description = `Initial production version (Phase 3)\nFinish: Chain-of-thought 4-step reasoning\nFun: Weighted factor analysis\nProvider: ${CONFIG.provider}`

  predictionVersion = await prisma.predictionVersion.create({
    data: {
      version: versionName,
      finishPromptHash,
      funScorePromptHash,
      description,
      active: true,
    },
  })

  // Deactivate all other versions
  await prisma.predictionVersion.updateMany({
    where: {
      id: { not: predictionVersion.id },
      active: true,
    },
    data: { active: false },
  })

  console.log(`✓ Created new version: ${versionName} (marked as active)`)

  return {
    id: predictionVersion.id,
    version: versionName,
    isNew: true,
  }
}

/**
 * Find fights that need predictions
 */
async function findFightsNeedingPredictions(
  versionId: string,
  args: Args
): Promise<FightWithRelations[]> {
  const whereConditions: Record<string, unknown> = {
    // Only upcoming events (not completed)
    event: {
      completed: false,
      date: {
        gte: new Date(), // Future events only
      },
    },
  }

  // Filter by event ID if specified
  if (args.eventId) {
    whereConditions.eventId = args.eventId
  }

  // If not forcing, exclude fights that already have predictions for this version
  if (!args.force) {
    whereConditions.predictions = {
      none: {
        versionId,
      },
    }
  }

  const fights = await prisma.fight.findMany({
    where: whereConditions,
    include: {
      fighter1: true,
      fighter2: true,
      event: true,
    },
    orderBy: [{ event: { date: 'asc' } }, { fightNumber: 'asc' }],
  })

  return fights as FightWithRelations[]
}

/**
 * Generate prediction for a single fight
 */
async function generatePrediction(
  fight: FightWithRelations,
  versionId: string,
  service: NewPredictionService
): Promise<{
  success: boolean
  tokensUsed: number
  costUsd: number
  error?: string
}> {
  try {
    const { fighter1, fighter2, event } = fight

    // Build finish probability input
    const finishInput = {
      fighter1: {
        name: fighter1.name,
        record: fighter1.record || 'Unknown',
        significantStrikesAbsorbedPerMinute:
          fighter1.significantStrikesAbsorbedPerMinute,
        strikingDefensePercentage: fighter1.strikingDefensePercentage,
        takedownDefensePercentage: fighter1.takedownDefensePercentage,
        finishRate: fighter1.finishRate,
        koPercentage: fighter1.koPercentage,
        submissionPercentage: fighter1.submissionPercentage,
        significantStrikesLandedPerMinute:
          fighter1.significantStrikesLandedPerMinute,
        submissionAverage: fighter1.submissionAverage,
      },
      fighter2: {
        name: fighter2.name,
        record: fighter2.record || 'Unknown',
        significantStrikesAbsorbedPerMinute:
          fighter2.significantStrikesAbsorbedPerMinute,
        strikingDefensePercentage: fighter2.strikingDefensePercentage,
        takedownDefensePercentage: fighter2.takedownDefensePercentage,
        finishRate: fighter2.finishRate,
        koPercentage: fighter2.koPercentage,
        submissionPercentage: fighter2.submissionPercentage,
        significantStrikesLandedPerMinute:
          fighter2.significantStrikesLandedPerMinute,
        submissionAverage: fighter2.submissionAverage,
      },
      context: {
        eventName: event.name,
        weightClass: fight.weightClass,
      },
    }

    // Build fun score input
    const funInput = {
      fighter1: {
        name: fighter1.name,
        record: fighter1.record || 'Unknown',
        significantStrikesLandedPerMinute:
          fighter1.significantStrikesLandedPerMinute,
        significantStrikesAbsorbedPerMinute:
          fighter1.significantStrikesAbsorbedPerMinute,
        finishRate: fighter1.finishRate,
        koPercentage: fighter1.koPercentage,
        submissionPercentage: fighter1.submissionPercentage,
        averageFightTimeSeconds: fighter1.averageFightTimeSeconds,
        winsByDecision: fighter1.winsByDecision,
        submissionAverage: fighter1.submissionAverage,
        strikingDefensePercentage: fighter1.strikingDefensePercentage,
        takedownAverage: fighter1.takedownAverage,
        takedownDefensePercentage: fighter1.takedownDefensePercentage,
        totalWins: fighter1.wins,
        primaryStyle: classifyFighterStyle({
          significantStrikesLandedPerMinute:
            fighter1.significantStrikesLandedPerMinute,
          takedownAverage: fighter1.takedownAverage,
          submissionAverage: fighter1.submissionAverage,
        }),
      },
      fighter2: {
        name: fighter2.name,
        record: fighter2.record || 'Unknown',
        significantStrikesLandedPerMinute:
          fighter2.significantStrikesLandedPerMinute,
        significantStrikesAbsorbedPerMinute:
          fighter2.significantStrikesAbsorbedPerMinute,
        finishRate: fighter2.finishRate,
        koPercentage: fighter2.koPercentage,
        submissionPercentage: fighter2.submissionPercentage,
        averageFightTimeSeconds: fighter2.averageFightTimeSeconds,
        winsByDecision: fighter2.winsByDecision,
        submissionAverage: fighter2.submissionAverage,
        strikingDefensePercentage: fighter2.strikingDefensePercentage,
        takedownAverage: fighter2.takedownAverage,
        takedownDefensePercentage: fighter2.takedownDefensePercentage,
        totalWins: fighter2.wins,
        primaryStyle: classifyFighterStyle({
          significantStrikesLandedPerMinute:
            fighter2.significantStrikesLandedPerMinute,
          takedownAverage: fighter2.takedownAverage,
          submissionAverage: fighter2.submissionAverage,
        }),
      },
      context: {
        eventName: event.name,
        weightClass: fight.weightClass,
        titleFight: fight.titleFight,
        mainEvent: fight.mainEvent,
      },
    }

    // Generate prediction
    const prediction = await service.predictFight(finishInput, funInput)

    // Save to database
    await prisma.prediction.upsert({
      where: {
        fightId_versionId: {
          fightId: fight.id,
          versionId,
        },
      },
      create: {
        fightId: fight.id,
        versionId,
        finishProbability: prediction.finishProbability,
        finishConfidence: prediction.finishConfidence,
        finishReasoning: prediction.finishReasoning as any,
        funScore: prediction.funScore,
        funConfidence: prediction.funConfidence,
        funBreakdown: prediction.funBreakdown as any,
        modelUsed: prediction.modelUsed,
        tokensUsed: prediction.tokensUsed,
        costUsd: prediction.costUsd,
      },
      update: {
        finishProbability: prediction.finishProbability,
        finishConfidence: prediction.finishConfidence,
        finishReasoning: prediction.finishReasoning as any,
        funScore: prediction.funScore,
        funConfidence: prediction.funConfidence,
        funBreakdown: prediction.funBreakdown as any,
        modelUsed: prediction.modelUsed,
        tokensUsed: prediction.tokensUsed,
        costUsd: prediction.costUsd,
      },
    })

    return {
      success: true,
      tokensUsed: prediction.tokensUsed,
      costUsd: prediction.costUsd,
    }
  } catch (error) {
    return {
      success: false,
      tokensUsed: 0,
      costUsd: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Main runner
 */
async function main() {
  const args = parseArgs()

  console.log('🤖 AI Predictions Runner - Phase 3')
  console.log('==================================')
  console.log(`Provider: ${CONFIG.provider}`)
  console.log(`Dry run: ${args.dryRun}`)
  console.log(`Force regenerate: ${args.force}`)
  if (args.eventId) {
    console.log(`Event filter: ${args.eventId}`)
  }
  console.log('')

  // Step 1: Get or create prediction version
  const version = await getOrCreateCurrentVersion()
  console.log('')

  // Step 2: Find fights needing predictions
  console.log('🔍 Finding fights needing predictions...')
  const fights = await findFightsNeedingPredictions(version.id, args)

  if (fights.length === 0) {
    console.log('✓ No fights need predictions. All done!')
    return
  }

  console.log(`Found ${fights.length} fights needing predictions:`)
  for (const fight of fights) {
    console.log(
      `  - ${fight.event.name}: ${fight.fighter1.name} vs ${fight.fighter2.name}`
    )
  }
  console.log('')

  if (args.dryRun) {
    console.log('🏁 Dry run complete. No API calls made.')
    return
  }

  // Step 3: Initialize prediction service
  console.log('🚀 Generating predictions...')
  const service = new NewPredictionService(CONFIG.provider)

  // Step 4: Process each fight
  let totalTokens = 0
  let totalCost = 0
  let successCount = 0
  let errorCount = 0
  const errors: Array<{ fight: string; error: string }> = []

  for (let i = 0; i < fights.length; i++) {
    const fight = fights[i]
    const fightLabel = `${fight.fighter1.name} vs ${fight.fighter2.name}`

    console.log(`\n[${i + 1}/${fights.length}] ${fightLabel}`)

    const result = await generatePrediction(fight, version.id, service)

    if (result.success) {
      successCount++
      totalTokens += result.tokensUsed
      totalCost += result.costUsd

      console.log(
        `  ✓ Success (${result.tokensUsed} tokens, $${result.costUsd.toFixed(4)})`
      )
    } else {
      errorCount++
      errors.push({ fight: fightLabel, error: result.error || 'Unknown error' })
      console.error(`  ✗ Failed: ${result.error}`)
    }

    // Rate limiting delay (except for last fight)
    if (i < fights.length - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, CONFIG.rateLimit.delayMs)
      )
    }
  }

  // Step 5: Summary
  console.log('\n📊 Summary')
  console.log('==========')
  console.log(`Total fights: ${fights.length}`)
  console.log(`✓ Success: ${successCount}`)
  console.log(`✗ Errors: ${errorCount}`)
  console.log(`Total tokens: ${totalTokens.toLocaleString()}`)
  console.log(`Total cost: $${totalCost.toFixed(4)}`)
  console.log(
    `Average cost per fight: $${(totalCost / successCount).toFixed(4)}`
  )

  if (errors.length > 0) {
    console.log('\n❌ Errors:')
    for (const { fight, error } of errors) {
      console.error(`  - ${fight}: ${error}`)
    }
  }
}

// Run the script
main()
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
