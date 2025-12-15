/**
 * Embedding Service - Phase 3
 *
 * Generates and manages embeddings for fighter profiles using OpenAI's
 * text-embedding-3-small model. Embeddings enable semantic similarity
 * search for finding relevant fighter context.
 *
 * Cost: ~$0.00002 per 1K tokens (~$0.02 per 1000 fighters)
 */

import OpenAI from 'openai'
import { prisma } from '../../database/prisma'

/**
 * Configuration for embedding service
 */
const CONFIG = {
  model: 'text-embedding-3-small',
  dimensions: 1536,
  batchSize: 100, // Process fighters in batches
  maxTokensPerProfile: 500, // Approximate max tokens per fighter profile
}

/**
 * Fighter profile data for embedding generation
 */
interface FighterProfile {
  id: string
  name: string
  nickname: string | null
  weightClass: string
  record: string | null
  wins: number
  losses: number
  draws: number
  stance: string | null
  age: number | null
  height: string | null
  reach: string | null
  // Stats
  significantStrikesPerMinute: number
  strikingAccuracyPercentage: number
  significantStrikesAbsorbedPerMinute: number
  strikingDefensePercentage: number
  takedownAverage: number
  takedownAccuracyPercentage: number
  takedownDefensePercentage: number
  submissionAverage: number
  // Win/Loss methods
  finishRate: number
  koPercentage: number
  submissionPercentage: number
  lossFinishRate: number
  koLossPercentage: number
  submissionLossPercentage: number
}

/**
 * Generate a text profile for a fighter suitable for embedding
 *
 * Creates a structured text representation that captures:
 * - Identity and physical attributes
 * - Fighting style and tendencies
 * - Statistical profile
 * - Finishing ability and durability
 *
 * @param fighter - Fighter data from database
 * @returns Text profile for embedding
 */
export function generateFighterProfileText(fighter: FighterProfile): string {
  const parts: string[] = []

  // Identity
  parts.push(`Fighter: ${fighter.name}`)
  if (fighter.nickname) {
    parts.push(`Nickname: "${fighter.nickname}"`)
  }
  parts.push(`Weight Class: ${fighter.weightClass}`)
  parts.push(`Record: ${fighter.wins}-${fighter.losses}-${fighter.draws}`)

  // Physical attributes
  const physical: string[] = []
  if (fighter.stance) physical.push(`${fighter.stance} stance`)
  if (fighter.age) physical.push(`${fighter.age} years old`)
  if (fighter.height) physical.push(`${fighter.height} tall`)
  if (fighter.reach) physical.push(`${fighter.reach} reach`)
  if (physical.length > 0) {
    parts.push(`Physical: ${physical.join(', ')}`)
  }

  // Striking profile
  const strikingStyle = categorizeStriker(fighter)
  parts.push(`Striking Style: ${strikingStyle}`)
  parts.push(
    `Striking Stats: ${fighter.significantStrikesPerMinute.toFixed(1)} strikes/min, ` +
      `${(fighter.strikingAccuracyPercentage * 100).toFixed(0)}% accuracy, ` +
      `${(fighter.strikingDefensePercentage * 100).toFixed(0)}% defense`
  )

  // Grappling profile
  const grapplingStyle = categorizeGrappler(fighter)
  parts.push(`Grappling Style: ${grapplingStyle}`)
  parts.push(
    `Grappling Stats: ${fighter.takedownAverage.toFixed(1)} TD/15min, ` +
      `${(fighter.takedownAccuracyPercentage * 100).toFixed(0)}% TD accuracy, ` +
      `${(fighter.takedownDefensePercentage * 100).toFixed(0)}% TD defense, ` +
      `${fighter.submissionAverage.toFixed(1)} sub attempts/15min`
  )

  // Finishing ability
  const finishingProfile = categorizeFinisher(fighter)
  parts.push(`Finishing Ability: ${finishingProfile}`)
  parts.push(
    `Win Methods: ${(fighter.koPercentage * 100).toFixed(0)}% KO, ` +
      `${(fighter.submissionPercentage * 100).toFixed(0)}% SUB, ` +
      `${((1 - fighter.finishRate) * 100).toFixed(0)}% DEC`
  )

  // Durability
  const durability = categorizeDurability(fighter)
  parts.push(`Durability: ${durability}`)
  parts.push(
    `Loss Methods: ${(fighter.koLossPercentage * 100).toFixed(0)}% KO, ` +
      `${(fighter.submissionLossPercentage * 100).toFixed(0)}% SUB`
  )

  return parts.join('\n')
}

/**
 * Categorize a fighter's striking style based on stats
 */
function categorizeStriker(fighter: FighterProfile): string {
  const volume = fighter.significantStrikesPerMinute
  const accuracy = fighter.strikingAccuracyPercentage
  const absorbed = fighter.significantStrikesAbsorbedPerMinute
  const defense = fighter.strikingDefensePercentage

  const styles: string[] = []

  // Volume
  if (volume >= 6) styles.push('high-volume')
  else if (volume >= 4) styles.push('moderate-volume')
  else styles.push('low-volume')

  // Accuracy vs volume tradeoff
  if (accuracy >= 0.55 && volume < 5) styles.push('precise counter-striker')
  else if (accuracy >= 0.50) styles.push('accurate')
  else if (volume >= 5) styles.push('pressure fighter')

  // Defensive
  if (defense >= 0.60) styles.push('defensive')
  if (absorbed <= 3.0 && defense >= 0.55) styles.push('elusive')

  // Brawler tendency
  if (absorbed >= 5.0 && volume >= 5.0) styles.push('willing to trade')

  return styles.join(', ') || 'balanced striker'
}

/**
 * Categorize a fighter's grappling style based on stats
 */
function categorizeGrappler(fighter: FighterProfile): string {
  const tdAvg = fighter.takedownAverage
  const tdAcc = fighter.takedownAccuracyPercentage
  const tdDef = fighter.takedownDefensePercentage
  const subAvg = fighter.submissionAverage

  const styles: string[] = []

  // Wrestling
  if (tdAvg >= 3.0 && tdAcc >= 0.45) styles.push('strong wrestler')
  else if (tdAvg >= 2.0) styles.push('uses takedowns')
  else if (tdAvg < 1.0) styles.push('primarily standup')

  // Submission game
  if (subAvg >= 1.5) styles.push('active submission hunter')
  else if (subAvg >= 0.5) styles.push('submission threat')

  // Defensive wrestling
  if (tdDef >= 0.80) styles.push('excellent takedown defense')
  else if (tdDef >= 0.65) styles.push('good takedown defense')
  else if (tdDef < 0.50) styles.push('vulnerable to takedowns')

  return styles.join(', ') || 'balanced grappler'
}

/**
 * Categorize a fighter's finishing ability
 */
function categorizeFinisher(fighter: FighterProfile): string {
  const finishRate = fighter.finishRate
  const koRate = fighter.koPercentage
  const subRate = fighter.submissionPercentage

  const descriptions: string[] = []

  if (finishRate >= 0.80) descriptions.push('elite finisher')
  else if (finishRate >= 0.60) descriptions.push('good finisher')
  else if (finishRate >= 0.40) descriptions.push('moderate finishing rate')
  else descriptions.push('tends to go to decision')

  if (koRate >= 0.50) descriptions.push('knockout power')
  else if (koRate >= 0.30) descriptions.push('can finish with strikes')

  if (subRate >= 0.40) descriptions.push('dangerous on the ground')
  else if (subRate >= 0.20) descriptions.push('submission capable')

  return descriptions.join(', ')
}

/**
 * Categorize a fighter's durability
 */
function categorizeDurability(fighter: FighterProfile): string {
  const lossFinishRate = fighter.lossFinishRate
  const koLossRate = fighter.koLossPercentage
  const subLossRate = fighter.submissionLossPercentage

  if (fighter.losses === 0) return 'untested (no losses)'

  const descriptions: string[] = []

  if (lossFinishRate <= 0.20) descriptions.push('very durable')
  else if (lossFinishRate <= 0.40) descriptions.push('solid chin')
  else if (lossFinishRate >= 0.70) descriptions.push('has been finished')

  if (koLossRate >= 0.50) descriptions.push('susceptible to KO')
  if (subLossRate >= 0.50) descriptions.push('susceptible to submission')

  return descriptions.join(', ') || 'average durability'
}

/**
 * Generate embedding for a single text using OpenAI API
 *
 * @param text - Text to embed
 * @param openai - OpenAI client instance
 * @returns Embedding vector (1536 dimensions)
 */
export async function generateEmbedding(
  text: string,
  openai: OpenAI
): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: CONFIG.model,
    input: text,
    dimensions: CONFIG.dimensions,
  })

  return response.data[0].embedding
}

/**
 * Generate embeddings for multiple texts in a batch
 *
 * @param texts - Array of texts to embed
 * @param openai - OpenAI client instance
 * @returns Array of embedding vectors
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  openai: OpenAI
): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: CONFIG.model,
    input: texts,
    dimensions: CONFIG.dimensions,
  })

  return response.data.map((d) => d.embedding)
}

/**
 * Update embeddings for all fighters or a subset
 *
 * @param options - Update options
 * @returns Summary of update operation
 */
export async function updateFighterEmbeddings(options: {
  openai: OpenAI
  fighterIds?: string[] // If not provided, updates all fighters
  forceUpdate?: boolean // Update even if embedding exists
  batchSize?: number
}): Promise<{
  processed: number
  updated: number
  skipped: number
  errors: number
}> {
  const { openai, fighterIds, forceUpdate = false, batchSize = CONFIG.batchSize } = options

  const result = {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  }

  // Build query
  const whereClause: { id?: { in: string[] }; embeddingUpdatedAt?: null } = {}
  if (fighterIds) {
    whereClause.id = { in: fighterIds }
  }
  if (!forceUpdate) {
    whereClause.embeddingUpdatedAt = null
  }

  // Fetch fighters to update
  const fighters = await prisma.fighter.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      nickname: true,
      weightClass: true,
      record: true,
      wins: true,
      losses: true,
      draws: true,
      stance: true,
      age: true,
      height: true,
      reach: true,
      significantStrikesPerMinute: true,
      strikingAccuracyPercentage: true,
      significantStrikesAbsorbedPerMinute: true,
      strikingDefensePercentage: true,
      takedownAverage: true,
      takedownAccuracyPercentage: true,
      takedownDefensePercentage: true,
      submissionAverage: true,
      finishRate: true,
      koPercentage: true,
      submissionPercentage: true,
      lossFinishRate: true,
      koLossPercentage: true,
      submissionLossPercentage: true,
    },
  })

  console.log(`Found ${fighters.length} fighters to process`)

  // Process in batches
  for (let i = 0; i < fighters.length; i += batchSize) {
    const batch = fighters.slice(i, i + batchSize)
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(fighters.length / batchSize)}`)

    try {
      // Generate profile texts
      const profileTexts = batch.map((f) => generateFighterProfileText(f))

      // Generate embeddings
      const embeddings = await generateEmbeddingsBatch(profileTexts, openai)

      // Update database using raw SQL (Prisma doesn't support vector type)
      for (let j = 0; j < batch.length; j++) {
        const fighter = batch[j]
        const profileText = profileTexts[j]
        const embedding = embeddings[j]

        try {
          await prisma.$executeRaw`
            UPDATE fighters
            SET
              profile_text = ${profileText},
              profile_embedding = ${JSON.stringify(embedding)}::vector,
              embedding_updated_at = NOW()
            WHERE id = ${fighter.id}
          `
          result.updated++
        } catch (updateError) {
          console.error(`Failed to update fighter ${fighter.name}:`, updateError)
          result.errors++
        }

        result.processed++
      }
    } catch (batchError) {
      console.error(`Batch ${Math.floor(i / batchSize) + 1} failed:`, batchError)
      result.errors += batch.length
      result.processed += batch.length
    }
  }

  return result
}

/**
 * Get embedding for a query string
 *
 * @param query - Search query
 * @param openai - OpenAI client
 * @returns Embedding vector
 */
export async function getQueryEmbedding(
  query: string,
  openai: OpenAI
): Promise<number[]> {
  return generateEmbedding(query, openai)
}
