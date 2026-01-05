/**
 * Import Fight Records from CSV
 *
 * Calculates win/loss/draw records from historical fight results.
 * Only updates fighters who have 0-0-0 records (preserves live scraper data).
 *
 * Rules:
 * - Live scraper data is TRUTH - only update fighters with 0-0-0 records
 * - Parse fight results to determine winner/loser
 * - Handle draws and no contests
 *
 * Usage:
 *   DATABASE_URL="..." npx ts-node scripts/import-fight-records.ts
 */

import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { prisma } from '../src/lib/database/prisma'

// CSV Row interface
interface FightResultRow {
  EVENT: string
  BOUT: string           // "Fighter A vs. Fighter B"
  OUTCOME: string        // "W/L" or "L/W" or "D/D" or "NC/NC"
  WEIGHTCLASS: string
  METHOD: string
  ROUND: string
  TIME: string
  'TIME FORMAT': string
  REFEREE: string
  DETAILS: string
  URL: string
}

// Fighter record accumulator
interface FighterRecord {
  name: string
  wins: number
  losses: number
  draws: number
  noContests: number
  // Win methods
  winsByKO: number
  winsBySubmission: number
  winsByDecision: number
  // Loss methods
  lossesByKO: number
  lossesBySubmission: number
  lossesByDecision: number
}

function parseOutcome(outcome: string): { fighter1: string; fighter2: string } {
  // Format is "W/L" meaning fighter1 won, fighter2 lost
  // Or "L/W" meaning fighter1 lost, fighter2 won
  // Or "D/D" for draw
  // Or "NC/NC" for no contest
  const parts = outcome.split('/')
  return {
    fighter1: parts[0]?.trim() || '',
    fighter2: parts[1]?.trim() || '',
  }
}

function parseMethod(method: string): 'KO' | 'SUB' | 'DEC' | 'OTHER' {
  const m = method.toUpperCase()
  if (m.includes('KO') || m.includes('TKO')) return 'KO'
  if (m.includes('SUB')) return 'SUB'
  if (m.includes('DEC')) return 'DEC'
  return 'OTHER'
}

function parseFighters(bout: string): { fighter1: string; fighter2: string } | null {
  // Format: "Fighter A vs. Fighter B" or "Fighter A vs Fighter B"
  const match = bout.match(/^(.+?)\s+vs\.?\s+(.+)$/i)
  if (!match) return null
  return {
    fighter1: match[1].trim(),
    fighter2: match[2].trim(),
  }
}

// Normalize fighter name for matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .replace(/\s+/g, ' ')        // Normalize spaces
    .trim()
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('FIGHT RECORDS IMPORT')
  console.log('═══════════════════════════════════════════════════════════════════\n')

  const dataDir = path.join(process.cwd(), 'data/training')

  // 1. Load fight results
  console.log('Loading fight results CSV...')
  const resultsPath = path.join(dataDir, 'ufc_fight_results.csv')
  const resultsContent = fs.readFileSync(resultsPath, 'utf-8')
  const resultsRows: FightResultRow[] = parse(resultsContent, {
    columns: true,
    skip_empty_lines: true,
  })
  console.log(`  Found ${resultsRows.length} fight results`)

  // 2. Get all fighters from database
  console.log('\nFetching fighters from database...')
  const dbFighters = await prisma.fighter.findMany({
    select: {
      id: true,
      name: true,
      wins: true,
      losses: true,
      draws: true,
    },
  })
  console.log(`  Found ${dbFighters.length} fighters in database`)

  // Build lookup map (normalized name -> fighter)
  const fighterMap = new Map<string, typeof dbFighters[0]>()
  for (const fighter of dbFighters) {
    fighterMap.set(normalizeName(fighter.name), fighter)
  }

  // 3. Identify fighters with 0-0-0 records (candidates for update)
  const zeroRecordFighters = new Set(
    dbFighters
      .filter((f) => f.wins === 0 && f.losses === 0 && f.draws === 0)
      .map((f) => normalizeName(f.name))
  )
  console.log(`  Found ${zeroRecordFighters.size} fighters with 0-0-0 records`)

  // 4. Calculate records from fight results
  console.log('\nProcessing fight results...')
  const records = new Map<string, FighterRecord>()

  const initRecord = (name: string): FighterRecord => ({
    name,
    wins: 0,
    losses: 0,
    draws: 0,
    noContests: 0,
    winsByKO: 0,
    winsBySubmission: 0,
    winsByDecision: 0,
    lossesByKO: 0,
    lossesBySubmission: 0,
    lossesByDecision: 0,
  })

  let processedFights = 0
  let skippedFights = 0

  for (const fight of resultsRows) {
    const fighters = parseFighters(fight.BOUT)
    if (!fighters) {
      skippedFights++
      continue
    }

    const outcome = parseOutcome(fight.OUTCOME)
    const method = parseMethod(fight.METHOD)

    const norm1 = normalizeName(fighters.fighter1)
    const norm2 = normalizeName(fighters.fighter2)

    // Only process if at least one fighter needs updating
    if (!zeroRecordFighters.has(norm1) && !zeroRecordFighters.has(norm2)) {
      skippedFights++
      continue
    }

    // Initialize records if needed
    if (!records.has(norm1)) records.set(norm1, initRecord(fighters.fighter1))
    if (!records.has(norm2)) records.set(norm2, initRecord(fighters.fighter2))

    const record1 = records.get(norm1)!
    const record2 = records.get(norm2)!

    // Process outcomes
    if (outcome.fighter1 === 'W' && outcome.fighter2 === 'L') {
      record1.wins++
      record2.losses++
      if (method === 'KO') {
        record1.winsByKO++
        record2.lossesByKO++
      } else if (method === 'SUB') {
        record1.winsBySubmission++
        record2.lossesBySubmission++
      } else if (method === 'DEC') {
        record1.winsByDecision++
        record2.lossesByDecision++
      }
    } else if (outcome.fighter1 === 'L' && outcome.fighter2 === 'W') {
      record1.losses++
      record2.wins++
      if (method === 'KO') {
        record1.lossesByKO++
        record2.winsByKO++
      } else if (method === 'SUB') {
        record1.lossesBySubmission++
        record2.winsBySubmission++
      } else if (method === 'DEC') {
        record1.lossesByDecision++
        record2.winsByDecision++
      }
    } else if (outcome.fighter1 === 'D' && outcome.fighter2 === 'D') {
      record1.draws++
      record2.draws++
    } else if (outcome.fighter1 === 'NC' || outcome.fighter2 === 'NC') {
      record1.noContests++
      record2.noContests++
    }

    processedFights++
  }

  console.log(`  Processed ${processedFights} relevant fights`)
  console.log(`  Skipped ${skippedFights} fights (fighters already have records)`)

  // 5. Update database
  console.log('\nUpdating fighter records...')
  let updated = 0
  let notFound = 0

  for (const [normName, record] of records) {
    // Only update fighters that:
    // 1. Exist in database
    // 2. Have 0-0-0 records (live scraper data is truth)
    const dbFighter = fighterMap.get(normName)
    if (!dbFighter) {
      notFound++
      continue
    }

    if (!zeroRecordFighters.has(normName)) {
      continue // Skip - has live scraper data
    }

    // Calculate percentages
    const totalWins = record.wins || 1 // Avoid division by zero
    const totalLosses = record.losses || 1
    const finishRate = (record.winsByKO + record.winsBySubmission) / totalWins
    const koPercentage = record.winsByKO / totalWins
    const submissionPercentage = record.winsBySubmission / totalWins
    const lossFinishRate = (record.lossesByKO + record.lossesBySubmission) / totalLosses
    const koLossPercentage = record.lossesByKO / totalLosses
    const submissionLossPercentage = record.lossesBySubmission / totalLosses

    try {
      await prisma.fighter.update({
        where: { id: dbFighter.id },
        data: {
          wins: record.wins,
          losses: record.losses,
          draws: record.draws,
          winsByKO: record.winsByKO,
          winsBySubmission: record.winsBySubmission,
          winsByDecision: record.winsByDecision,
          lossesByKO: record.lossesByKO,
          lossesBySubmission: record.lossesBySubmission,
          lossesByDecision: record.lossesByDecision,
          finishRate: record.wins > 0 ? finishRate : 0,
          koPercentage: record.wins > 0 ? koPercentage : 0,
          submissionPercentage: record.wins > 0 ? submissionPercentage : 0,
          lossFinishRate: record.losses > 0 ? lossFinishRate : 0,
          koLossPercentage: record.losses > 0 ? koLossPercentage : 0,
          submissionLossPercentage: record.losses > 0 ? submissionLossPercentage : 0,
          record: `${record.wins}-${record.losses}-${record.draws}`,
        },
      })
      updated++

      if (updated % 100 === 0) {
        process.stdout.write(`\r  Updated: ${updated}`)
      }
    } catch (error) {
      console.error(`\n  Error updating ${record.name}:`, error instanceof Error ? error.message : error)
    }
  }

  console.log(`\n\n═══════════════════════════════════════════════════════════════════`)
  console.log('RESULTS')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(`  Updated: ${updated}`)
  console.log(`  Not found in DB: ${notFound}`)

  // Show some examples
  console.log('\nSample updated records:')
  const sampleFighters = await prisma.fighter.findMany({
    where: {
      wins: { gt: 0 },
    },
    take: 5,
    orderBy: { wins: 'desc' },
    select: { name: true, wins: true, losses: true, draws: true },
  })
  for (const f of sampleFighters) {
    console.log(`  ${f.name}: ${f.wins}-${f.losses}-${f.draws}`)
  }

  await prisma.$disconnect()
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
