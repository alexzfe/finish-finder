/**
 * Import Historical Fighters from CSV
 *
 * Imports fighters from UFCStats CSV data into Supabase.
 * Uses sourceUrl as the canonical identifier to handle name changes.
 *
 * Rules:
 * - Live scraper data is TRUTH - never overwrite existing fighter data
 * - Only CREATE new fighters or fill in MISSING fields
 * - sourceUrl is the unique key (handles name changes)
 *
 * Usage:
 *   DATABASE_URL="..." npx ts-node scripts/import-historical-fighters.ts
 */

import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { prisma } from '../src/lib/database/prisma'

// CSV Row interfaces
interface FighterDetailsRow {
  FIRST: string
  LAST: string
  NICKNAME: string
  URL: string
}

interface FighterTottRow {
  FIGHTER: string
  HEIGHT: string
  WEIGHT: string
  REACH: string
  STANCE: string
  DOB: string
  URL: string
}

// Helper functions
function parseHeight(height: string): string | null {
  if (!height || height === '--') return null
  return height.trim()
}

function parseWeight(weight: string): number | null {
  if (!weight || weight === '--') return null
  const match = weight.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

function parseReach(reach: string): number | null {
  if (!reach || reach === '--') return null
  const match = reach.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

function parseAge(dob: string): number | null {
  if (!dob || dob === '--') return null
  try {
    const birthDate = new Date(dob)
    if (isNaN(birthDate.getTime())) return null
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    return age
  } catch {
    return null
  }
}

function guessWeightClass(weightLbs: number | null): string {
  if (!weightLbs) return 'Unknown'
  if (weightLbs <= 115) return "Women's Strawweight"
  if (weightLbs <= 125) return 'Flyweight'
  if (weightLbs <= 135) return 'Bantamweight'
  if (weightLbs <= 145) return 'Featherweight'
  if (weightLbs <= 155) return 'Lightweight'
  if (weightLbs <= 170) return 'Welterweight'
  if (weightLbs <= 185) return 'Middleweight'
  if (weightLbs <= 205) return 'Light Heavyweight'
  return 'Heavyweight'
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('HISTORICAL FIGHTER IMPORT')
  console.log('═══════════════════════════════════════════════════════════════════\n')

  const dataDir = path.join(process.cwd(), 'data/training')

  // 1. Load fighter details (names)
  console.log('Loading fighter details CSV...')
  const detailsPath = path.join(dataDir, 'ufc_fighter_details.csv')
  const detailsContent = fs.readFileSync(detailsPath, 'utf-8')
  const detailsRows: FighterDetailsRow[] = parse(detailsContent, {
    columns: true,
    skip_empty_lines: true,
  })
  console.log(`  Found ${detailsRows.length} fighters in details CSV`)

  // 2. Load fighter tott (physical attributes)
  console.log('Loading fighter TOTT CSV...')
  const tottPath = path.join(dataDir, 'ufc_fighter_tott.csv')
  const tottContent = fs.readFileSync(tottPath, 'utf-8')
  const tottRows: FighterTottRow[] = parse(tottContent, {
    columns: true,
    skip_empty_lines: true,
  })
  console.log(`  Found ${tottRows.length} fighters in TOTT CSV`)

  // 3. Build lookup map for TOTT data by URL
  const tottMap = new Map<string, FighterTottRow>()
  for (const row of tottRows) {
    if (row.URL) {
      tottMap.set(row.URL.trim(), row)
    }
  }
  console.log(`  Built TOTT lookup map with ${tottMap.size} entries`)

  // 4. Get existing fighters from database (by sourceUrl)
  console.log('\nFetching existing fighters from database...')
  const existingFighters = await prisma.fighter.findMany({
    select: { id: true, sourceUrl: true, name: true },
  })
  const existingUrls = new Set(existingFighters.map((f) => f.sourceUrl).filter(Boolean))
  console.log(`  Found ${existingFighters.length} existing fighters (${existingUrls.size} with URLs)`)

  // 5. Process fighters
  console.log('\nProcessing fighters...')
  let created = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < detailsRows.length; i++) {
    const details = detailsRows[i]
    if (!details.URL) {
      skipped++
      continue
    }

    const url = details.URL.trim()

    // Skip if fighter already exists (live scraper is truth)
    if (existingUrls.has(url)) {
      skipped++
      continue
    }

    // Get TOTT data if available
    const tott = tottMap.get(url)

    // Build fighter data
    const name = `${details.FIRST} ${details.LAST}`.trim()
    const weightLbs = parseWeight(tott?.WEIGHT || '')
    const weightClass = guessWeightClass(weightLbs)

    try {
      await prisma.fighter.create({
        data: {
          name,
          nickname: details.NICKNAME || null,
          sourceUrl: url,
          weightClass,
          height: parseHeight(tott?.HEIGHT || ''),
          weightLbs,
          reach: tott?.REACH || null,
          reachInches: parseReach(tott?.REACH || ''),
          stance: tott?.STANCE || null,
          dob: tott?.DOB || null,
          age: parseAge(tott?.DOB || ''),
          // Stats default to 0 - will be filled by live scraper or fight history
          wins: 0,
          losses: 0,
          draws: 0,
        },
      })
      created++

      if (created % 100 === 0) {
        process.stdout.write(`\r  Created: ${created}, Skipped: ${skipped}`)
      }
    } catch (error) {
      // Could be duplicate or other constraint violation
      errors++
      if (errors <= 5) {
        console.error(`\n  Error creating ${name}:`, error instanceof Error ? error.message : error)
      }
    }
  }

  console.log(`\n\n═══════════════════════════════════════════════════════════════════`)
  console.log('RESULTS')
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(`  Created: ${created}`)
  console.log(`  Skipped (already exist): ${skipped}`)
  console.log(`  Errors: ${errors}`)

  // Final count
  const finalCount = await prisma.fighter.count()
  console.log(`\n  Total fighters in database: ${finalCount}`)

  await prisma.$disconnect()
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
