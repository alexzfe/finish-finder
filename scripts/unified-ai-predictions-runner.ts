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
 *   --dry-run           Show what would be done without making API calls
 *   --force             Regenerate predictions even if they already exist
 *   --event-id=<id>     Only process fights for a specific event
 *   --limit=<n>         Limit number of fights to process
 *   --web-search        Enable basic web search enrichment (Brave API)
 *   --structured-search Enable structured entertainment profile extraction (OpenAI API)
 *   --verbose           Show full LLM reasoning and entertainment profile influence
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
import {
  ImprovedFighterContextService,
  FighterEntertainmentService,
} from '../src/lib/ai/improvedFighterContextService'
import { getDefaultSearchFunction } from '../src/lib/ai/webSearchWrapper'
import type { FighterEntertainmentContext } from '../src/lib/ai/schemas/fighterEntertainmentProfile'
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
  webSearch: boolean
  structuredSearch: boolean
  verbose: boolean
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
    webSearch: args.includes('--web-search'),
    structuredSearch: args.includes('--structured-search'),
    verbose: args.includes('--verbose'),
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
  contextService?: ImprovedFighterContextService,
  entertainmentService?: FighterEntertainmentService,
  verbose?: boolean
): Promise<{
  success: boolean
  tokensUsed: number
  costUsd: number
  searchCostUsd: number
  error?: string
}> {
  try {
    const { fighter1, fighter2, event } = fight

    // Fetch recent context if available (Brave search)
    let fighter1Context: string | undefined
    let fighter2Context: string | undefined

    if (contextService) {
      try {
        console.log('  🔍 Fetching fighter context (Brave)...')
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

    // Fetch entertainment profiles if available (OpenAI structured search)
    let fighter1Profile: FighterEntertainmentContext | undefined
    let fighter2Profile: FighterEntertainmentContext | undefined
    let searchCostUsd = 0

    if (entertainmentService) {
      try {
        console.log('  🎭 Fetching entertainment profiles (OpenAI)...')
        const profileResult = await entertainmentService.getFightProfiles(
          { id: fighter1.id, name: fighter1.name },
          { id: fighter2.id, name: fighter2.name }
        )
        fighter1Profile = profileResult.fighter1Profile ?? undefined
        fighter2Profile = profileResult.fighter2Profile ?? undefined
        searchCostUsd = profileResult.totalCostUsd

        if (profileResult.cacheHits > 0) {
          console.log(`    ✓ Cache hits: ${profileResult.cacheHits}`)
        }
        if (profileResult.cacheMisses > 0) {
          console.log(`    🔍 Fresh profiles: ${profileResult.cacheMisses} ($${searchCostUsd.toFixed(4)})`)
        }
      } catch (error) {
        console.warn(`  ⚠ Entertainment profile fetch failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // Build unified input with all available context
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
      fighter2Context,
      fighter1Profile,
      fighter2Profile
    )

    // Generate prediction
    const prediction = await service.predictFight(input)

    // Verbose output: Show LLM reasoning
    if (verbose) {
      console.log('\n  ═══════════════════════════════════════════════════════════')
      console.log('  📝 LLM REASONING (Chain-of-Thought)')
      console.log('  ═══════════════════════════════════════════════════════════')

      const reasoning = prediction.simulation.reasoning
      console.log('\n  [STATISTICIAN - Vulnerability Analysis]')
      console.log(`  ${reasoning.vulnerabilityAnalysis}`)
      console.log('\n  [STATISTICIAN - Offense Analysis]')
      console.log(`  ${reasoning.offenseAnalysis}`)
      console.log('\n  [TAPE WATCHER - Style Matchup]')
      console.log(`  ${reasoning.styleMatchup}`)
      console.log('\n  [SYNTHESIZER - Final Assessment]')
      console.log(`  ${reasoning.finalAssessment}`)

      console.log('\n  ───────────────────────────────────────────────────────────')
      console.log('  📊 ENTERTAINMENT PROFILE INFLUENCE')
      console.log('  ───────────────────────────────────────────────────────────')
      if (fighter1Profile) {
        console.log(`\n  ${fighter1.name}:`)
        console.log(`    Archetype: ${fighter1Profile.primary_archetype}/${fighter1Profile.secondary_archetype || 'none'}`)
        console.log(`    Mentality: ${fighter1Profile.mentality}`)
        console.log(`    Entertainment: ${fighter1Profile.entertainment_prediction}`)
        console.log(`    Tags: ${fighter1Profile.reputation_tags?.join(', ') || 'none'}`)
      } else {
        console.log(`\n  ${fighter1.name}: No entertainment profile`)
      }
      if (fighter2Profile) {
        console.log(`\n  ${fighter2.name}:`)
        console.log(`    Archetype: ${fighter2Profile.primary_archetype}/${fighter2Profile.secondary_archetype || 'none'}`)
        console.log(`    Mentality: ${fighter2Profile.mentality}`)
        console.log(`    Entertainment: ${fighter2Profile.entertainment_prediction}`)
        console.log(`    Tags: ${fighter2Profile.reputation_tags?.join(', ') || 'none'}`)
      } else {
        console.log(`\n  ${fighter2.name}: No entertainment profile`)
      }

      console.log('\n  ───────────────────────────────────────────────────────────')
      console.log('  🎯 FINAL ANALYSIS')
      console.log('  ───────────────────────────────────────────────────────────')
      console.log(`\n  Finish Analysis: ${prediction.simulation.finishAnalysis}`)
      console.log(`\n  Fun Analysis: ${prediction.simulation.funAnalysis}`)
      console.log(`\n  Narrative: ${prediction.simulation.narrative}`)
      console.log(`\n  Key Factors: ${prediction.simulation.keyFactors.join(', ')}`)
      console.log('\n  ═══════════════════════════════════════════════════════════\n')
    }

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
      searchCostUsd,
    }
  } catch (error) {
    return {
      success: false,
      tokensUsed: 0,
      costUsd: 0,
      searchCostUsd: 0,
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
  console.log(`Web search (Brave): ${args.webSearch ? 'ENABLED' : 'DISABLED'}`)
  console.log(`Structured search (OpenAI): ${args.structuredSearch ? 'ENABLED' : 'DISABLED'}`)
  if (args.verbose) console.log(`Verbose mode: ENABLED (showing LLM reasoning)`)
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
  if (args.webSearch) {
    try {
      const searchFunction = getDefaultSearchFunction()
      contextService = new ImprovedFighterContextService(searchFunction)
      console.log('✓ Fighter context service initialized (Brave Search)')
    } catch (error) {
      console.warn(`⚠ Could not initialize Brave search: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  let entertainmentService: FighterEntertainmentService | undefined
  if (args.structuredSearch) {
    try {
      entertainmentService = new FighterEntertainmentService()
      console.log('✓ Entertainment profile service initialized (OpenAI)')

      // Show cache stats
      const stats = await entertainmentService.getCacheStats()
      console.log(`  📦 Cache: ${stats.totalProfiles} profiles, ${stats.expiredProfiles} expired, $${stats.totalCostUsd.toFixed(2)} spent`)
    } catch (error) {
      console.warn(`⚠ Could not initialize entertainment service: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  console.log('')

  // Step 4: Process fights
  let totalTokens = 0
  let totalCost = 0
  let totalSearchCost = 0
  let successCount = 0
  let errorCount = 0
  const errors: Array<{ fight: string; error: string }> = []

  for (let i = 0; i < fights.length; i++) {
    const fight = fights[i]
    const fightLabel = `${fight.fighter1.name} vs ${fight.fighter2.name}`

    console.log(`\n[${i + 1}/${fights.length}] ${fightLabel}`)

    const result = await generatePrediction(
      fight,
      version.id,
      service,
      contextService,
      entertainmentService,
      args.verbose
    )

    if (result.success) {
      successCount++
      totalTokens += result.tokensUsed
      totalCost += result.costUsd
      totalSearchCost += result.searchCostUsd
      const searchInfo = result.searchCostUsd > 0 ? ` + $${result.searchCostUsd.toFixed(4)} search` : ''
      console.log(`  📊 ${result.tokensUsed} tokens, $${result.costUsd.toFixed(4)}${searchInfo}`)
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
  console.log(`Prediction cost: $${totalCost.toFixed(4)}`)
  if (totalSearchCost > 0) {
    console.log(`Search cost: $${totalSearchCost.toFixed(4)}`)
    console.log(`Total cost: $${(totalCost + totalSearchCost).toFixed(4)}`)
  }
  if (successCount > 0) {
    const avgCost = (totalCost + totalSearchCost) / successCount
    console.log(`Average cost per fight: $${avgCost.toFixed(4)}`)
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
