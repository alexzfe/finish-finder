/**
 * Generate DSPy Evaluation Data
 *
 * Creates evaluation dataset from historical fights for DSPy prompt optimization.
 *
 * Process:
 * 1. Load historical fight results from CSV
 * 2. Match fighters to database (using name matching)
 * 3. Generate predictions for each fight (pretending we don't know outcome)
 * 4. Compare to actual outcomes
 * 5. Export as JSON for DSPy training/evaluation
 *
 * Usage:
 *   DATABASE_URL="..." OPENAI_API_KEY="..." npx ts-node scripts/generate-dspy-eval-data.ts
 *
 * Options:
 *   --limit N      Only process N fights (for testing)
 *   --skip-api     Skip API calls, just generate structure (for testing)
 *   --output PATH  Output file path (default: data/dspy/eval_data.json)
 */

import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { prisma } from '../src/lib/database/prisma'
import { NewPredictionService } from '../src/lib/ai/newPredictionService'
import type {
  FinishProbabilityInput,
  FunScoreInput,
  FighterFinishStats,
  FighterFunStats,
} from '../src/lib/ai/prompts'
import { classifyFighterStyleLegacy } from '../src/lib/ai/prompts'

// CSV Row interface
interface FightResultRow {
  EVENT: string
  BOUT: string
  OUTCOME: string
  WEIGHTCLASS: string
  METHOD: string
  ROUND: string
  TIME: string
  'TIME FORMAT': string
  REFEREE: string
  DETAILS: string
  URL: string
}

// Evaluation data point
interface EvalDataPoint {
  fightId: string
  eventName: string
  fighter1Name: string
  fighter2Name: string
  weightClass: string

  // Input context (what AI sees)
  fighter1Context: string
  fighter2Context: string

  // AI predictions
  predictedFinishProbability: number
  predictedFunScore: number
  finishReasoning: string
  funReasoning: string

  // Ground truth
  actualFinish: boolean  // true if KO/TKO/SUB, false if decision
  actualMethod: string
  actualWinner: 'fighter1' | 'fighter2' | 'draw' | 'nc'
  actualRound: number | null

  // Computed metrics
  finishPredictionCorrect: boolean
  brierScore: number
}

// Normalized name for matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Parse fighters from bout string
function parseFighters(bout: string): { fighter1: string; fighter2: string } | null {
  const match = bout.match(/^(.+?)\s+vs\.?\s+(.+)$/i)
  if (!match) return null
  return {
    fighter1: match[1].trim(),
    fighter2: match[2].trim(),
  }
}

// Parse outcome (W/L, L/W, D/D, NC/NC)
function parseOutcome(outcome: string): 'fighter1' | 'fighter2' | 'draw' | 'nc' {
  const parts = outcome.split('/')
  const f1 = parts[0]?.trim()
  const f2 = parts[1]?.trim()

  if (f1 === 'W' && f2 === 'L') return 'fighter1'
  if (f1 === 'L' && f2 === 'W') return 'fighter2'
  if (f1 === 'D' && f2 === 'D') return 'draw'
  return 'nc'
}

// Check if method is a finish (not decision)
function isFinish(method: string): boolean {
  const m = method.toUpperCase()
  return m.includes('KO') || m.includes('TKO') || m.includes('SUB')
}

// Build fighter context string from database
function buildFighterContext(fighter: {
  name: string
  nickname: string | null
  weightClass: string | null
  record: string | null
  wins: number
  losses: number
  draws: number
  winsByKO: number
  winsBySubmission: number
  winsByDecision: number
  lossesByKO: number
  lossesBySubmission: number
  lossesByDecision: number
  finishRate: number | null
  stance: string | null
  height: string | null
  reach: string | null
  age: number | null
}): string {
  const totalWins = fighter.wins || 1
  const koRate = (fighter.winsByKO / totalWins * 100).toFixed(0)
  const subRate = (fighter.winsBySubmission / totalWins * 100).toFixed(0)

  return `${fighter.name}${fighter.nickname ? ` "${fighter.nickname}"` : ''}
Record: ${fighter.wins}-${fighter.losses}-${fighter.draws}
Weight Class: ${fighter.weightClass || 'Unknown'}
Stance: ${fighter.stance || 'Unknown'} | Height: ${fighter.height || 'Unknown'} | Reach: ${fighter.reach || 'Unknown'}
Age: ${fighter.age || 'Unknown'}
Wins: ${fighter.winsByKO} KO (${koRate}%), ${fighter.winsBySubmission} SUB (${subRate}%), ${fighter.winsByDecision} DEC
Losses: ${fighter.lossesByKO} KO, ${fighter.lossesBySubmission} SUB, ${fighter.lossesByDecision} DEC
Finish Rate: ${((fighter.finishRate || 0) * 100).toFixed(0)}%`
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('DSPY EVALUATION DATA GENERATOR')
  console.log('═══════════════════════════════════════════════════════════════════\n')

  // Parse args
  const args = process.argv.slice(2)
  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 200 // Default 200
  const skipApi = args.includes('--skip-api')
  const outputIdx = args.indexOf('--output')
  const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : 'data/dspy/eval_data.json'

  console.log(`Configuration:`)
  console.log(`  Limit: ${limit} fights`)
  console.log(`  Skip API: ${skipApi}`)
  console.log(`  Output: ${outputPath}\n`)

  // 1. Load fight results
  console.log('Loading fight results CSV...')
  const dataDir = path.join(process.cwd(), 'data/training')
  const resultsPath = path.join(dataDir, 'ufc_fight_results.csv')
  const resultsContent = fs.readFileSync(resultsPath, 'utf-8')
  const resultsRows: FightResultRow[] = parse(resultsContent, {
    columns: true,
    skip_empty_lines: true,
  })
  console.log(`  Found ${resultsRows.length} fight results`)

  // 2. Load fighters from database
  console.log('\nLoading fighters from database...')
  const dbFighters = await prisma.fighter.findMany({
    select: {
      id: true,
      name: true,
      nickname: true,
      weightClass: true,
      record: true,
      wins: true,
      losses: true,
      draws: true,
      winsByKO: true,
      winsBySubmission: true,
      winsByDecision: true,
      lossesByKO: true,
      lossesBySubmission: true,
      lossesByDecision: true,
      finishRate: true,
      stance: true,
      height: true,
      reach: true,
      age: true,
      // Additional stats for predictions
      significantStrikesLandedPerMinute: true,
      significantStrikesAbsorbedPerMinute: true,
      strikingDefensePercentage: true,
      takedownDefensePercentage: true,
      takedownAverage: true,
      submissionAverage: true,
      lossFinishRate: true,
      koLossPercentage: true,
      submissionLossPercentage: true,
      koPercentage: true,
      submissionPercentage: true,
      averageFightTimeSeconds: true,
    },
  })
  console.log(`  Found ${dbFighters.length} fighters`)

  // Build fighter lookup map
  const fighterMap = new Map<string, typeof dbFighters[0]>()
  for (const fighter of dbFighters) {
    fighterMap.set(normalizeName(fighter.name), fighter)
  }

  // 3. Filter fights where we can match both fighters
  console.log('\nMatching fighters to database...')
  const matchableFights: Array<{
    row: FightResultRow
    fighter1: typeof dbFighters[0]
    fighter2: typeof dbFighters[0]
  }> = []

  for (const row of resultsRows) {
    const fighters = parseFighters(row.BOUT)
    if (!fighters) continue

    const f1 = fighterMap.get(normalizeName(fighters.fighter1))
    const f2 = fighterMap.get(normalizeName(fighters.fighter2))

    if (f1 && f2) {
      matchableFights.push({ row, fighter1: f1, fighter2: f2 })
    }
  }
  console.log(`  Matched ${matchableFights.length} fights with both fighters in DB`)

  // Take sample for processing
  const samplesToProcess = matchableFights.slice(0, limit)
  console.log(`  Processing ${samplesToProcess.length} fights\n`)

  // 4. Initialize prediction service (if not skipping API)
  let predictionService: NewPredictionService | null = null
  if (!skipApi) {
    try {
      predictionService = new NewPredictionService('openai')
      console.log('✓ Initialized OpenAI prediction service\n')
    } catch (error) {
      console.log('⚠ Could not initialize prediction service, running in skip-api mode')
      console.log(`  Error: ${error instanceof Error ? error.message : error}\n`)
    }
  }

  // 5. Generate evaluation data
  console.log('Generating evaluation data...')
  const evalData: EvalDataPoint[] = []
  let processed = 0
  let errors = 0
  let totalCost = 0

  for (const { row, fighter1, fighter2 } of samplesToProcess) {
    const fighters = parseFighters(row.BOUT)!
    const fightId = `${row.URL.split('/').pop()}_${Date.now()}`

    // Build contexts
    const fighter1Context = buildFighterContext(fighter1)
    const fighter2Context = buildFighterContext(fighter2)

    // Ground truth
    const actualFinish = isFinish(row.METHOD)
    const actualWinner = parseOutcome(row.OUTCOME)
    const actualRound = row.ROUND ? parseInt(row.ROUND, 10) : null

    // Get predictions (or use defaults if skipping API)
    let predictedFinishProbability = 0.5
    let predictedFunScore = 50
    let finishReasoning = ''
    let funReasoning = ''

    if (predictionService) {
      try {
        // Build FighterFinishStats for finish probability
        const f1FinishStats: FighterFinishStats = {
          name: fighter1.name,
          record: `${fighter1.wins}-${fighter1.losses}-${fighter1.draws}`,
          significantStrikesAbsorbedPerMinute: fighter1.significantStrikesAbsorbedPerMinute || 0,
          strikingDefensePercentage: fighter1.strikingDefensePercentage || 0,
          takedownDefensePercentage: fighter1.takedownDefensePercentage || 0,
          lossFinishRate: fighter1.lossFinishRate || 0,
          koLossPercentage: fighter1.koLossPercentage || 0,
          submissionLossPercentage: fighter1.submissionLossPercentage || 0,
          finishRate: fighter1.finishRate || 0,
          koPercentage: fighter1.koPercentage || 0,
          submissionPercentage: fighter1.submissionPercentage || 0,
          significantStrikesLandedPerMinute: fighter1.significantStrikesLandedPerMinute || 0,
          submissionAverage: fighter1.submissionAverage || 0,
        }

        const f2FinishStats: FighterFinishStats = {
          name: fighter2.name,
          record: `${fighter2.wins}-${fighter2.losses}-${fighter2.draws}`,
          significantStrikesAbsorbedPerMinute: fighter2.significantStrikesAbsorbedPerMinute || 0,
          strikingDefensePercentage: fighter2.strikingDefensePercentage || 0,
          takedownDefensePercentage: fighter2.takedownDefensePercentage || 0,
          lossFinishRate: fighter2.lossFinishRate || 0,
          koLossPercentage: fighter2.koLossPercentage || 0,
          submissionLossPercentage: fighter2.submissionLossPercentage || 0,
          finishRate: fighter2.finishRate || 0,
          koPercentage: fighter2.koPercentage || 0,
          submissionPercentage: fighter2.submissionPercentage || 0,
          significantStrikesLandedPerMinute: fighter2.significantStrikesLandedPerMinute || 0,
          submissionAverage: fighter2.submissionAverage || 0,
        }

        const finishInput: FinishProbabilityInput = {
          fighter1: f1FinishStats,
          fighter2: f2FinishStats,
          context: {
            eventName: row.EVENT,
            weightClass: row.WEIGHTCLASS || 'Unknown',
          }
        }

        // Build FighterFunStats for fun score
        const f1FunStats: FighterFunStats = {
          name: fighter1.name,
          record: `${fighter1.wins}-${fighter1.losses}-${fighter1.draws}`,
          significantStrikesLandedPerMinute: fighter1.significantStrikesLandedPerMinute || 0,
          significantStrikesAbsorbedPerMinute: fighter1.significantStrikesAbsorbedPerMinute || 0,
          finishRate: fighter1.finishRate || 0,
          koPercentage: fighter1.koPercentage || 0,
          submissionPercentage: fighter1.submissionPercentage || 0,
          averageFightTimeSeconds: fighter1.averageFightTimeSeconds || 0,
          winsByDecision: fighter1.winsByDecision,
          submissionAverage: fighter1.submissionAverage || 0,
          strikingDefensePercentage: fighter1.strikingDefensePercentage || 0,
          takedownAverage: fighter1.takedownAverage || 0,
          takedownDefensePercentage: fighter1.takedownDefensePercentage || 0,
          totalWins: fighter1.wins,
          primaryStyle: classifyFighterStyleLegacy({
            significantStrikesLandedPerMinute: fighter1.significantStrikesLandedPerMinute || 0,
            takedownAverage: fighter1.takedownAverage || 0,
            submissionAverage: fighter1.submissionAverage || 0,
          }),
        }

        const f2FunStats: FighterFunStats = {
          name: fighter2.name,
          record: `${fighter2.wins}-${fighter2.losses}-${fighter2.draws}`,
          significantStrikesLandedPerMinute: fighter2.significantStrikesLandedPerMinute || 0,
          significantStrikesAbsorbedPerMinute: fighter2.significantStrikesAbsorbedPerMinute || 0,
          finishRate: fighter2.finishRate || 0,
          koPercentage: fighter2.koPercentage || 0,
          submissionPercentage: fighter2.submissionPercentage || 0,
          averageFightTimeSeconds: fighter2.averageFightTimeSeconds || 0,
          winsByDecision: fighter2.winsByDecision,
          submissionAverage: fighter2.submissionAverage || 0,
          strikingDefensePercentage: fighter2.strikingDefensePercentage || 0,
          takedownAverage: fighter2.takedownAverage || 0,
          takedownDefensePercentage: fighter2.takedownDefensePercentage || 0,
          totalWins: fighter2.wins,
          primaryStyle: classifyFighterStyleLegacy({
            significantStrikesLandedPerMinute: fighter2.significantStrikesLandedPerMinute || 0,
            takedownAverage: fighter2.takedownAverage || 0,
            submissionAverage: fighter2.submissionAverage || 0,
          }),
        }

        const funInput: FunScoreInput = {
          fighter1: f1FunStats,
          fighter2: f2FunStats,
          context: {
            eventName: row.EVENT,
            weightClass: row.WEIGHTCLASS || 'Unknown',
            titleFight: row.WEIGHTCLASS?.toLowerCase().includes('title') || false,
            mainEvent: false, // Unknown from CSV
          }
        }

        const prediction = await predictionService.predictFight(finishInput, funInput)

        predictedFinishProbability = prediction.finishProbability
        predictedFunScore = prediction.funScore
        finishReasoning = prediction.finishReasoning.finalAssessment
        funReasoning = prediction.funBreakdown.reasoning
        totalCost += prediction.costUsd

        // Rate limit
        await new Promise(r => setTimeout(r, 500))
      } catch (error) {
        errors++
        console.error(`  Error predicting ${fighters.fighter1} vs ${fighters.fighter2}:`,
          error instanceof Error ? error.message : error)
      }
    }

    // Calculate metrics
    const actualFinishNumeric = actualFinish ? 1 : 0
    const brierScore = Math.pow(predictedFinishProbability - actualFinishNumeric, 2)
    const finishPredictionCorrect =
      (predictedFinishProbability >= 0.5 && actualFinish) ||
      (predictedFinishProbability < 0.5 && !actualFinish)

    evalData.push({
      fightId,
      eventName: row.EVENT,
      fighter1Name: fighters.fighter1,
      fighter2Name: fighters.fighter2,
      weightClass: row.WEIGHTCLASS,
      fighter1Context,
      fighter2Context,
      predictedFinishProbability,
      predictedFunScore,
      finishReasoning,
      funReasoning,
      actualFinish,
      actualMethod: row.METHOD,
      actualWinner,
      actualRound,
      finishPredictionCorrect,
      brierScore,
    })

    processed++
    if (processed % 10 === 0) {
      process.stdout.write(`\r  Processed: ${processed}/${samplesToProcess.length}`)
    }
  }

  console.log(`\n\n═══════════════════════════════════════════════════════════════════`)
  console.log('RESULTS')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(`  Processed: ${processed}`)
  console.log(`  Errors: ${errors}`)
  console.log(`  Total API cost: $${totalCost.toFixed(4)}`)

  // Calculate aggregate metrics
  const withPredictions = evalData.filter(d => d.finishReasoning !== '')
  if (withPredictions.length > 0) {
    const avgBrier = withPredictions.reduce((sum, d) => sum + d.brierScore, 0) / withPredictions.length
    const accuracy = withPredictions.filter(d => d.finishPredictionCorrect).length / withPredictions.length
    console.log(`\n  Finish Prediction Metrics:`)
    console.log(`    Accuracy: ${(accuracy * 100).toFixed(1)}%`)
    console.log(`    Brier Score: ${avgBrier.toFixed(4)}`)
  }

  // 6. Save evaluation data
  console.log(`\nSaving evaluation data to ${outputPath}...`)
  const outputDir = path.dirname(outputPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Save full data
  fs.writeFileSync(outputPath, JSON.stringify(evalData, null, 2))
  console.log(`  ✓ Saved ${evalData.length} evaluation points`)

  // Also save in DSPy-friendly format (just the essentials)
  const dspyFormat = evalData.map(d => ({
    fighter1_context: d.fighter1Context,
    fighter2_context: d.fighter2Context,
    weight_class: d.weightClass,
    predicted_finish_prob: d.predictedFinishProbability,
    predicted_fun_score: d.predictedFunScore,
    actual_finish: d.actualFinish ? 1 : 0,
    actual_method: d.actualMethod,
  }))

  const dspyPath = outputPath.replace('.json', '_dspy.json')
  fs.writeFileSync(dspyPath, JSON.stringify(dspyFormat, null, 2))
  console.log(`  ✓ Saved DSPy format to ${dspyPath}`)

  await prisma.$disconnect()
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
