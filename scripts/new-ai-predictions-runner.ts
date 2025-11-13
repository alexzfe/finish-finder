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
 *   npx ts-node scripts/new-ai-predictions-runner.ts [options]
 *
 * Options:
 *   --dry-run         Show what would be done without making API calls
 *   --force           Regenerate predictions even if they already exist
 *   --event-id=<id>   Only process fights for a specific event
 *   --limit=<n>       Limit number of fights to process (useful for testing)
 *   --no-web-search   Disable web search enrichment (faster, but less context)
 *
 * Environment Variables:
 *   AI_PROVIDER               'anthropic' or 'openai' (default: anthropic)
 *   GOOGLE_SEARCH_API_KEY     Required for web search enrichment
 *   GOOGLE_SEARCH_ENGINE_ID   Required for web search enrichment
 */

// Load environment variables from .env.local
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
import { NewPredictionService, calculateRiskLevel } from '../src/lib/ai/newPredictionService'
import { classifyFighterStyle } from '../src/lib/ai/prompts'
import { FighterContextService } from '../src/lib/ai/fighterContextService'
import { getDefaultSearchFunction } from '../src/lib/ai/webSearchWrapper'
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
  limit?: number
  noWebSearch?: boolean  // Flag to disable web search enrichment
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
    noWebSearch: args.includes('--no-web-search'),
    eventId: args.find((arg) => arg.startsWith('--event-id='))?.split('=')[1],
    limit: parseInt(args.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || '0') || undefined,
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
  const whereConditions: Record<string, unknown> = {}

  // Filter by event ID if specified, otherwise filter by upcoming events
  if (args.eventId) {
    whereConditions.eventId = args.eventId
  } else {
    // Only upcoming events (not completed)
    whereConditions.event = {
      completed: false,
      date: {
        gte: new Date(), // Future events only
      },
    }
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
  service: NewPredictionService,
  contextService?: FighterContextService
): Promise<{
  success: boolean
  tokensUsed: number
  costUsd: number
  error?: string
}> {
  try {
    const { fighter1, fighter2, event } = fight

    // Fetch recent context for both fighters if context service provided
    let fighter1Context: string | undefined
    let fighter2Context: string | undefined

    if (contextService) {
      try {
        console.log('  🔍 Fetching fighter context...')
        const [context1, context2] = await contextService.getFightContext(
          fighter1.name,
          fighter2.name,
          event.date
        )
        fighter1Context = context1.searchSuccessful ? context1.recentNews : undefined
        fighter2Context = context2.searchSuccessful ? context2.recentNews : undefined
      } catch (error) {
        console.warn(`  ⚠ Context fetch failed: ${error instanceof Error ? error.message : String(error)}`)
        // Continue without context (graceful degradation)
      }
    }

    // Build finish probability input
    const finishInput = {
      fighter1: {
        name: fighter1.name,
        record: fighter1.record || 'Unknown',
        significantStrikesAbsorbedPerMinute:
          fighter1.significantStrikesAbsorbedPerMinute,
        strikingDefensePercentage: fighter1.strikingDefensePercentage,
        takedownDefensePercentage: fighter1.takedownDefensePercentage,
        lossFinishRate: fighter1.lossFinishRate,
        koLossPercentage: fighter1.koLossPercentage,
        submissionLossPercentage: fighter1.submissionLossPercentage,
        finishRate: fighter1.finishRate,
        koPercentage: fighter1.koPercentage,
        submissionPercentage: fighter1.submissionPercentage,
        significantStrikesLandedPerMinute:
          fighter1.significantStrikesLandedPerMinute,
        submissionAverage: fighter1.submissionAverage,
        recentContext: fighter1Context, // Add web search context
      },
      fighter2: {
        name: fighter2.name,
        record: fighter2.record || 'Unknown',
        significantStrikesAbsorbedPerMinute:
          fighter2.significantStrikesAbsorbedPerMinute,
        strikingDefensePercentage: fighter2.strikingDefensePercentage,
        takedownDefensePercentage: fighter2.takedownDefensePercentage,
        lossFinishRate: fighter2.lossFinishRate,
        koLossPercentage: fighter2.koLossPercentage,
        submissionLossPercentage: fighter2.submissionLossPercentage,
        finishRate: fighter2.finishRate,
        koPercentage: fighter2.koPercentage,
        submissionPercentage: fighter2.submissionPercentage,
        significantStrikesLandedPerMinute:
          fighter2.significantStrikesLandedPerMinute,
        submissionAverage: fighter2.submissionAverage,
        recentContext: fighter2Context, // Add web search context
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
        recentContext: fighter1Context, // Add web search context
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
        recentContext: fighter2Context, // Add web search context
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

    // Calculate and save risk level to Fight table (derived from confidence scores)
    const riskLevel = calculateRiskLevel(
      prediction.finishConfidence,
      prediction.funConfidence
    )

    await prisma.fight.update({
      where: { id: fight.id },
      data: { riskLevel },
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
  console.log(`Web search enrichment: ${args.noWebSearch ? 'DISABLED' : 'ENABLED'}`)
  if (args.eventId) {
    console.log(`Event filter: ${args.eventId}`)
  }
  if (args.limit) {
    console.log(`Limit: ${args.limit} fight(s)`)
  }
  console.log('')

  // Step 1: Get or create prediction version
  const version = await getOrCreateCurrentVersion()
  console.log('')

  // Step 2: Find fights needing predictions
  console.log('🔍 Finding fights needing predictions...')
  let fights = await findFightsNeedingPredictions(version.id, args)

  // Apply limit if specified
  if (args.limit && fights.length > args.limit) {
    console.log(`Limiting to first ${args.limit} fight(s) (found ${fights.length} total)`)
    fights = fights.slice(0, args.limit)
  }

  if (fights.length === 0) {
    console.log('✓ No fights need predictions. All done!')
    return
  }

  console.log(`Found ${fights.length} fight(s) needing predictions:`)
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

  // Step 3: Initialize services
  console.log('🚀 Generating predictions...')
  const service = new NewPredictionService(CONFIG.provider)

  // Initialize context service if web search is enabled
  let contextService: FighterContextService | undefined
  if (!args.noWebSearch) {
    try {
      const searchFunction = getDefaultSearchFunction()
      contextService = new FighterContextService(searchFunction)
      console.log('✓ Fighter context service initialized with Google Search')
    } catch (error) {
      console.warn(`⚠ Could not initialize web search: ${error instanceof Error ? error.message : String(error)}`)
      console.warn('  Predictions will run without recent context enrichment.')
    }
  } else {
    console.log('ℹ Web search disabled via --no-web-search flag')
  }
  console.log('')

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

    const result = await generatePrediction(fight, version.id, service, contextService)

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
