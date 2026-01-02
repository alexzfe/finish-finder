#!/usr/bin/env node
/**
 * Unified AI Predictions Runner - Phase 4 (SOTA Architecture)
 *
 * Generates AI predictions using the unified prediction service.
 *
 * Key improvements over Phase 3:
 * - Single LLM call instead of 4 (finish + fun + 2 extractions)
 * - Deterministic score calculation ensures consistency
 * - Multi-persona analysis (Statistician, Tape Watcher, Synthesizer)
 * - Consistency validation with optional LLM critique
 *
 * Usage:
 *   npx ts-node scripts/unified-ai-predictions-runner.ts [options]
 *
 * Options:
 *   --dry-run         Show what would be done without making API calls
 *   --force           Regenerate predictions even if they already exist
 *   --event-id=<id>   Only process fights for a specific event
 *   --limit=<n>       Limit number of fights to process
 *   --no-web-search   Disable web search enrichment
 *
 * Environment Variables:
 *   AI_PROVIDER             'anthropic' or 'openai' (default: anthropic)
 *   BRAVE_SEARCH_API_KEY    Required for web search enrichment
 */

// Load environment variables
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
  UnifiedPredictionService,
  buildUnifiedInput,
  calculateRiskLevel,
  type UnifiedFightPrediction,
} from '../src/lib/ai/unifiedPredictionService'
import { ImprovedFighterContextService } from '../src/lib/ai/improvedFighterContextService'
import { getDefaultSearchFunction } from '../src/lib/ai/webSearchWrapper'
import type { Fighter, Fight, Event } from '@prisma/client'

/**
 * Configuration
 */
const CONFIG = {
  provider: (process.env.AI_PROVIDER || 'anthropic') as 'anthropic' | 'openai',
  rateLimit: {
    delayMs: 2000, // 2 second delay between fights
  },
  promptFiles: [
    'src/lib/ai/prompts/unifiedPredictionPrompt.ts',
    'src/lib/ai/prompts/weightClassRates.ts',
    'src/lib/ai/prompts/anchorExamples.ts',  // Phase 1.2: Few-shot calibration anchors
    'src/lib/ai/scoreCalculator.ts',
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
  noWebSearch?: boolean
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
 * Get or create the current prediction version
 */
async function getOrCreateCurrentVersion(): Promise<{
  id: string
  version: string
  isNew: boolean
}> {
  // Calculate hashes of prompt template files
  const unifiedPromptHash = hashFile(CONFIG.promptFiles[0])
  const weightClassHash = hashFile(CONFIG.promptFiles[1])
  const anchorExamplesHash = hashFile(CONFIG.promptFiles[2])
  const scoreCalculatorHash = hashFile(CONFIG.promptFiles[3])

  // Combine hashes
  const compositeHash = createHash('sha256')
    .update(unifiedPromptHash + weightClassHash + anchorExamplesHash + scoreCalculatorHash)
    .digest('hex')
    .substring(0, 16)

  console.log('📊 Prompt hashes (Phase 4 - Unified):')
  console.log(`  Unified Prompt:  ${unifiedPromptHash.substring(0, 16)}...`)
  console.log(`  Weight Class:    ${weightClassHash.substring(0, 16)}...`)
  console.log(`  Anchor Examples: ${anchorExamplesHash.substring(0, 16)}...`)
  console.log(`  Score Calc:      ${scoreCalculatorHash.substring(0, 16)}...`)
  console.log(`  Composite:       ${compositeHash}`)

  // Check if this version exists
  // Using the unified prompt hash as both fields since old schema expects two hashes
  let predictionVersion = await prisma.predictionVersion.findFirst({
    where: {
      finishPromptHash: unifiedPromptHash,
      funScorePromptHash: scoreCalculatorHash,
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
  const versionName = `v2.0-unified-${compositeHash}`
  const description = `Phase 4 Unified Architecture
- Single LLM call (vs 4 in Phase 3)
- Deterministic score calculation
- Multi-persona analysis
- Consistency validation
Provider: ${CONFIG.provider}`

  predictionVersion = await prisma.predictionVersion.create({
    data: {
      version: versionName,
      finishPromptHash: unifiedPromptHash,
      funScorePromptHash: scoreCalculatorHash,
      description,
      active: true,
    },
  })

  // Deactivate other versions
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
    isCancelled: false,
  }

  if (args.eventId) {
    whereConditions.eventId = args.eventId
  } else {
    whereConditions.event = {
      completed: false,
      date: {
        gte: new Date(),
      },
    }
  }

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
  service: UnifiedPredictionService,
  contextService?: ImprovedFighterContextService
): Promise<{
  success: boolean
  tokensUsed: number
  costUsd: number
  error?: string
}> {
  try {
    const { fighter1, fighter2, event } = fight

    // Fetch recent context if available
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
      }
    }

    // Build unified input
    const input = buildUnifiedInput(
      fighter1,
      fighter2,
      {
        eventName: event.name,
        weightClass: fight.weightClass,
        titleFight: fight.titleFight,
        mainEvent: fight.mainEvent,
      },
      fighter1Context,
      fighter2Context
    )

    // Generate prediction
    const prediction = await service.predictFight(input)

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

    // Calculate and save risk level
    const riskLevel = calculateRiskLevel(
      prediction.finishConfidence,
      prediction.funConfidence
    )

    await prisma.fight.update({
      where: { id: fight.id },
      data: { riskLevel },
    })

    // Log prediction summary
    console.log(`  ✓ Finish Probability: ${(prediction.finishProbability * 100).toFixed(0)}%`)
    console.log(`  ✓ Fun Score: ${prediction.funScore}/100`)
    console.log(`    Attributes: pace=${prediction.simulation.attributes.pace}, danger=${prediction.simulation.attributes.finishDanger}, style=${prediction.simulation.attributes.styleClash}`)
    console.log(`    Confidence: ${(prediction.simulation.confidence * 100).toFixed(0)}%`)

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

  console.log('🤖 Unified AI Predictions Runner - Phase 4 (SOTA)')
  console.log('=' .repeat(50))
  console.log(`Provider: ${CONFIG.provider}`)
  console.log(`Dry run: ${args.dryRun}`)
  console.log(`Force regenerate: ${args.force}`)
  console.log(`Web search: ${args.noWebSearch ? 'DISABLED' : 'ENABLED'}`)
  if (args.eventId) console.log(`Event filter: ${args.eventId}`)
  if (args.limit) console.log(`Limit: ${args.limit} fight(s)`)
  console.log('')

  // Step 1: Get or create prediction version
  const version = await getOrCreateCurrentVersion()
  console.log('')

  // Step 2: Find fights needing predictions
  console.log('🔍 Finding fights needing predictions...')
  let fights = await findFightsNeedingPredictions(version.id, args)

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
    console.log(`  - ${fight.event.name}: ${fight.fighter1.name} vs ${fight.fighter2.name}`)
  }
  console.log('')

  if (args.dryRun) {
    console.log('🏁 Dry run complete. No API calls made.')
    return
  }

  // Step 3: Initialize services
  console.log('🚀 Generating predictions (Unified Architecture)...')
  const service = new UnifiedPredictionService(CONFIG.provider)

  let contextService: ImprovedFighterContextService | undefined
  if (!args.noWebSearch) {
    try {
      const searchFunction = getDefaultSearchFunction()
      contextService = new ImprovedFighterContextService(searchFunction)
      console.log('✓ Fighter context service initialized')
    } catch (error) {
      console.warn(`⚠ Could not initialize web search: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  console.log('')

  // Step 4: Process fights
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
      console.log(`  📊 ${result.tokensUsed} tokens, $${result.costUsd.toFixed(4)}`)
    } else {
      errorCount++
      errors.push({ fight: fightLabel, error: result.error || 'Unknown error' })
      console.error(`  ✗ Failed: ${result.error}`)
    }

    // Rate limiting
    if (i < fights.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, CONFIG.rateLimit.delayMs))
    }
  }

  // Step 5: Summary
  console.log('\n📊 Summary')
  console.log('=' .repeat(50))
  console.log(`Total fights: ${fights.length}`)
  console.log(`✓ Success: ${successCount}`)
  console.log(`✗ Errors: ${errorCount}`)
  console.log(`Total tokens: ${totalTokens.toLocaleString()}`)
  console.log(`Total cost: $${totalCost.toFixed(4)}`)
  if (successCount > 0) {
    console.log(`Average cost per fight: $${(totalCost / successCount).toFixed(4)}`)
  }

  if (errors.length > 0) {
    console.log('\n❌ Errors:')
    for (const { fight, error } of errors) {
      console.error(`  - ${fight}: ${error}`)
    }
  }

  console.log('\n✨ Phase 4 Architecture - Focused Predictions:')
  console.log('  • Finish Probability: How likely is a stoppage?')
  console.log('  • Fun Score: How entertaining will it be?')
  console.log('  • NO outcome predictions (winner/method)')
  console.log('  • Deterministic scoring from qualitative attributes')
}

// Run
main()
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
