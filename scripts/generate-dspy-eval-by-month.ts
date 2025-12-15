/**
 * Generate DSPy Evaluation Data by Month
 *
 * Generates predictions for historical fights month-by-month to analyze
 * prediction performance over time.
 *
 * Usage:
 *   DATABASE_URL="..." OPENAI_API_KEY="..." npx ts-node scripts/generate-dspy-eval-by-month.ts
 *
 * Options:
 *   --year YYYY       Year to process (default: 2024)
 *   --month MM        Specific month (1-12), or all if not specified
 *   --skip-api        Skip API calls, just count fights
 *   --limit N         Limit fights per month (default: all)
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

// CSV interfaces
interface EventRow {
  EVENT: string
  URL: string
  DATE: string
  LOCATION: string
}

interface FightResultRow {
  EVENT: string
  BOUT: string
  OUTCOME: string
  WEIGHTCLASS: string
  METHOD: string
  ROUND: string
  TIME: string
  URL: string
}

interface MonthlyResult {
  month: string
  totalFights: number
  processedFights: number
  accuracy: number
  brierScore: number
  finishRate: number
  predictedFinishRate: number
  cost: number
}

// Parse date from "December 14, 2024" format
function parseEventDate(dateStr: string): Date | null {
  try {
    const cleaned = dateStr.replace(/"/g, '').trim()
    return new Date(cleaned)
  } catch {
    return null
  }
}

// Normalize fighter name
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

// Check if method is a finish
function isFinish(method: string): boolean {
  const m = method.toUpperCase()
  return m.includes('KO') || m.includes('TKO') || m.includes('SUB')
}

// Parse outcome
function parseOutcome(outcome: string): 'fighter1' | 'fighter2' | 'draw' | 'nc' {
  const parts = outcome.split('/')
  const f1 = parts[0]?.trim()
  const f2 = parts[1]?.trim()
  if (f1 === 'W' && f2 === 'L') return 'fighter1'
  if (f1 === 'L' && f2 === 'W') return 'fighter2'
  if (f1 === 'D' && f2 === 'D') return 'draw'
  return 'nc'
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('MONTHLY DSPY EVALUATION DATA GENERATOR')
  console.log('═══════════════════════════════════════════════════════════════════\n')

  // Parse args
  const args = process.argv.slice(2)
  const yearIdx = args.indexOf('--year')
  const year = yearIdx !== -1 ? parseInt(args[yearIdx + 1], 10) : 2024
  const monthIdx = args.indexOf('--month')
  const specificMonth = monthIdx !== -1 ? parseInt(args[monthIdx + 1], 10) : null
  const skipApi = args.includes('--skip-api')
  const limitIdx = args.indexOf('--limit')
  const limitPerMonth = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : undefined

  console.log(`Configuration:`)
  console.log(`  Year: ${year}`)
  console.log(`  Month: ${specificMonth || 'all'}`)
  console.log(`  Skip API: ${skipApi}`)
  console.log(`  Limit per month: ${limitPerMonth || 'unlimited'}\n`)

  const dataDir = path.join(process.cwd(), 'data/training')

  // 1. Load event details (for dates)
  console.log('Loading event details CSV...')
  const eventsPath = path.join(dataDir, 'ufc_event_details.csv')
  const eventsContent = fs.readFileSync(eventsPath, 'utf-8')
  const eventRows: EventRow[] = parse(eventsContent, { columns: true, skip_empty_lines: true })

  // Build event -> date map
  const eventDates = new Map<string, Date>()
  for (const row of eventRows) {
    const date = parseEventDate(row.DATE)
    if (date) {
      eventDates.set(row.EVENT.trim(), date)
    }
  }
  console.log(`  Loaded ${eventDates.size} event dates`)

  // 2. Load fight results
  console.log('Loading fight results CSV...')
  const resultsPath = path.join(dataDir, 'ufc_fight_results.csv')
  const resultsContent = fs.readFileSync(resultsPath, 'utf-8')
  const resultsRows: FightResultRow[] = parse(resultsContent, { columns: true, skip_empty_lines: true })
  console.log(`  Found ${resultsRows.length} fight results`)

  // 3. Load fighters from database
  console.log('\nLoading fighters from database...')
  const dbFighters = await prisma.fighter.findMany({
    select: {
      id: true,
      name: true,
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

  // Build fighter lookup
  const fighterMap = new Map<string, typeof dbFighters[0]>()
  for (const fighter of dbFighters) {
    fighterMap.set(normalizeName(fighter.name), fighter)
  }

  // 4. Filter fights by year and organize by month
  console.log(`\nFiltering ${year} fights by month...`)
  const fightsByMonth = new Map<string, FightResultRow[]>()

  for (const fight of resultsRows) {
    const eventDate = eventDates.get(fight.EVENT.trim())
    if (!eventDate) continue
    if (eventDate.getFullYear() !== year) continue

    const month = eventDate.getMonth() + 1
    if (specificMonth && month !== specificMonth) continue

    const monthKey = `${year}-${month.toString().padStart(2, '0')}`
    if (!fightsByMonth.has(monthKey)) {
      fightsByMonth.set(monthKey, [])
    }
    fightsByMonth.get(monthKey)!.push(fight)
  }

  // Show month counts
  const sortedMonths = Array.from(fightsByMonth.keys()).sort()
  console.log('\nFights by month:')
  for (const month of sortedMonths) {
    console.log(`  ${month}: ${fightsByMonth.get(month)!.length} fights`)
  }

  // 5. Initialize prediction service
  let predictionService: NewPredictionService | null = null
  if (!skipApi) {
    try {
      predictionService = new NewPredictionService('openai')
      console.log('\n✓ Initialized OpenAI prediction service')
    } catch (error) {
      console.log(`\n⚠ Could not initialize prediction service: ${error}`)
    }
  }

  // 6. Process each month
  const results: MonthlyResult[] = []
  const outputDir = path.join(process.cwd(), 'data/dspy/monthly')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  for (const month of sortedMonths) {
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`Processing ${month}...`)
    console.log(`${'─'.repeat(60)}`)

    const fights = fightsByMonth.get(month)!
    const toProcess = limitPerMonth ? fights.slice(0, limitPerMonth) : fights

    let processed = 0
    let correct = 0
    let brierSum = 0
    let actualFinishes = 0
    let predictedFinishes = 0
    let totalCost = 0
    const evalData: any[] = []

    for (const fight of toProcess) {
      const fighters = parseFighters(fight.BOUT)
      if (!fighters) continue

      const f1 = fighterMap.get(normalizeName(fighters.fighter1))
      const f2 = fighterMap.get(normalizeName(fighters.fighter2))
      if (!f1 || !f2) continue

      const actualFinish = isFinish(fight.METHOD)
      if (actualFinish) actualFinishes++

      let predictedFinishProb = 0.5
      let predictedFunScore = 50
      let reasoning = ''

      if (predictionService) {
        try {
          const finishInput: FinishProbabilityInput = {
            fighter1: {
              name: f1.name,
              record: `${f1.wins}-${f1.losses}-${f1.draws}`,
              significantStrikesAbsorbedPerMinute: f1.significantStrikesAbsorbedPerMinute || 0,
              strikingDefensePercentage: f1.strikingDefensePercentage || 0,
              takedownDefensePercentage: f1.takedownDefensePercentage || 0,
              lossFinishRate: f1.lossFinishRate || 0,
              koLossPercentage: f1.koLossPercentage || 0,
              submissionLossPercentage: f1.submissionLossPercentage || 0,
              finishRate: f1.finishRate || 0,
              koPercentage: f1.koPercentage || 0,
              submissionPercentage: f1.submissionPercentage || 0,
              significantStrikesLandedPerMinute: f1.significantStrikesLandedPerMinute || 0,
              submissionAverage: f1.submissionAverage || 0,
            },
            fighter2: {
              name: f2.name,
              record: `${f2.wins}-${f2.losses}-${f2.draws}`,
              significantStrikesAbsorbedPerMinute: f2.significantStrikesAbsorbedPerMinute || 0,
              strikingDefensePercentage: f2.strikingDefensePercentage || 0,
              takedownDefensePercentage: f2.takedownDefensePercentage || 0,
              lossFinishRate: f2.lossFinishRate || 0,
              koLossPercentage: f2.koLossPercentage || 0,
              submissionLossPercentage: f2.submissionLossPercentage || 0,
              finishRate: f2.finishRate || 0,
              koPercentage: f2.koPercentage || 0,
              submissionPercentage: f2.submissionPercentage || 0,
              significantStrikesLandedPerMinute: f2.significantStrikesLandedPerMinute || 0,
              submissionAverage: f2.submissionAverage || 0,
            },
            context: {
              eventName: fight.EVENT,
              weightClass: fight.WEIGHTCLASS || 'Unknown',
            }
          }

          const funInput: FunScoreInput = {
            fighter1: {
              name: f1.name,
              record: `${f1.wins}-${f1.losses}-${f1.draws}`,
              significantStrikesLandedPerMinute: f1.significantStrikesLandedPerMinute || 0,
              significantStrikesAbsorbedPerMinute: f1.significantStrikesAbsorbedPerMinute || 0,
              finishRate: f1.finishRate || 0,
              koPercentage: f1.koPercentage || 0,
              submissionPercentage: f1.submissionPercentage || 0,
              averageFightTimeSeconds: f1.averageFightTimeSeconds || 0,
              winsByDecision: f1.winsByDecision,
              submissionAverage: f1.submissionAverage || 0,
              strikingDefensePercentage: f1.strikingDefensePercentage || 0,
              takedownAverage: f1.takedownAverage || 0,
              takedownDefensePercentage: f1.takedownDefensePercentage || 0,
              totalWins: f1.wins,
              primaryStyle: classifyFighterStyleLegacy({
                significantStrikesLandedPerMinute: f1.significantStrikesLandedPerMinute || 0,
                takedownAverage: f1.takedownAverage || 0,
                submissionAverage: f1.submissionAverage || 0,
              }),
            },
            fighter2: {
              name: f2.name,
              record: `${f2.wins}-${f2.losses}-${f2.draws}`,
              significantStrikesLandedPerMinute: f2.significantStrikesLandedPerMinute || 0,
              significantStrikesAbsorbedPerMinute: f2.significantStrikesAbsorbedPerMinute || 0,
              finishRate: f2.finishRate || 0,
              koPercentage: f2.koPercentage || 0,
              submissionPercentage: f2.submissionPercentage || 0,
              averageFightTimeSeconds: f2.averageFightTimeSeconds || 0,
              winsByDecision: f2.winsByDecision,
              submissionAverage: f2.submissionAverage || 0,
              strikingDefensePercentage: f2.strikingDefensePercentage || 0,
              takedownAverage: f2.takedownAverage || 0,
              takedownDefensePercentage: f2.takedownDefensePercentage || 0,
              totalWins: f2.wins,
              primaryStyle: classifyFighterStyleLegacy({
                significantStrikesLandedPerMinute: f2.significantStrikesLandedPerMinute || 0,
                takedownAverage: f2.takedownAverage || 0,
                submissionAverage: f2.submissionAverage || 0,
              }),
            },
            context: {
              eventName: fight.EVENT,
              weightClass: fight.WEIGHTCLASS || 'Unknown',
              titleFight: fight.WEIGHTCLASS?.toLowerCase().includes('title') || false,
              mainEvent: false,
            }
          }

          const prediction = await predictionService.predictFight(finishInput, funInput)
          predictedFinishProb = prediction.finishProbability
          predictedFunScore = prediction.funScore
          reasoning = prediction.finishReasoning.finalAssessment
          totalCost += prediction.costUsd

          // Rate limit
          await new Promise(r => setTimeout(r, 300))
        } catch (error) {
          console.error(`  Error: ${error instanceof Error ? error.message : error}`)
        }
      }

      // Calculate metrics
      const brierScore = Math.pow(predictedFinishProb - (actualFinish ? 1 : 0), 2)
      brierSum += brierScore

      const predictedFinish = predictedFinishProb >= 0.5
      if (predictedFinish) predictedFinishes++
      if (predictedFinish === actualFinish) correct++

      evalData.push({
        fighter1_context: `${f1.name} (${f1.wins}-${f1.losses}-${f1.draws})`,
        fighter2_context: `${f2.name} (${f2.wins}-${f2.losses}-${f2.draws})`,
        weight_class: fight.WEIGHTCLASS,
        predicted_finish_prob: predictedFinishProb,
        predicted_fun_score: predictedFunScore,
        actual_finish: actualFinish ? 1 : 0,
        actual_method: fight.METHOD,
      })

      processed++
      if (processed % 10 === 0) {
        process.stdout.write(`\r  Processed: ${processed}/${toProcess.length}`)
      }
    }

    const accuracy = processed > 0 ? correct / processed : 0
    const avgBrier = processed > 0 ? brierSum / processed : 0
    const finishRate = processed > 0 ? actualFinishes / processed : 0
    const predFinishRate = processed > 0 ? predictedFinishes / processed : 0

    console.log(`\n  Results: ${processed} fights`)
    console.log(`    Accuracy: ${(accuracy * 100).toFixed(1)}%`)
    console.log(`    Brier Score: ${avgBrier.toFixed(4)}`)
    console.log(`    Actual Finish Rate: ${(finishRate * 100).toFixed(1)}%`)
    console.log(`    Predicted Finish Rate: ${(predFinishRate * 100).toFixed(1)}%`)
    console.log(`    Cost: $${totalCost.toFixed(2)}`)

    results.push({
      month,
      totalFights: fights.length,
      processedFights: processed,
      accuracy,
      brierScore: avgBrier,
      finishRate,
      predictedFinishRate: predFinishRate,
      cost: totalCost,
    })

    // Save month data
    const monthFile = path.join(outputDir, `${month}_eval.json`)
    fs.writeFileSync(monthFile, JSON.stringify(evalData, null, 2))
  }

  // 7. Summary
  console.log('\n' + '═'.repeat(60))
  console.log('YEARLY SUMMARY')
  console.log('═'.repeat(60))

  const totalFights = results.reduce((sum, r) => sum + r.processedFights, 0)
  const totalCost = results.reduce((sum, r) => sum + r.cost, 0)
  const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy * r.processedFights, 0) / totalFights
  const avgBrier = results.reduce((sum, r) => sum + r.brierScore * r.processedFights, 0) / totalFights

  console.log(`\nTotal fights processed: ${totalFights}`)
  console.log(`Total cost: $${totalCost.toFixed(2)}`)
  console.log(`Average accuracy: ${(avgAccuracy * 100).toFixed(1)}%`)
  console.log(`Average Brier score: ${avgBrier.toFixed(4)}`)

  console.log('\nMonthly Breakdown:')
  console.log('Month      | Fights | Accuracy | Brier  | Finish% | Pred%  | Cost')
  console.log('─'.repeat(70))
  for (const r of results) {
    console.log(
      `${r.month}   |   ${r.processedFights.toString().padStart(3)} |   ${(r.accuracy * 100).toFixed(1)}% | ${r.brierScore.toFixed(4)} |  ${(r.finishRate * 100).toFixed(1)}%  |  ${(r.predictedFinishRate * 100).toFixed(1)}% | $${r.cost.toFixed(2)}`
    )
  }

  // Save summary
  const summaryFile = path.join(outputDir, `${year}_summary.json`)
  fs.writeFileSync(summaryFile, JSON.stringify({ year, results, summary: { totalFights, totalCost, avgAccuracy, avgBrier } }, null, 2))
  console.log(`\nSaved summary to ${summaryFile}`)

  await prisma.$disconnect()
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
