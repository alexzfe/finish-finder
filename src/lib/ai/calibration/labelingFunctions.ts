/**
 * Weak Supervision Labeling Functions - Phase 2.4
 *
 * Generates weak labels for entertainment value from fight statistics.
 * Uses multiple heuristic functions that vote on entertainment level.
 *
 * Each labeling function returns:
 * - "HIGH": Fight was likely highly entertaining
 * - "MEDIUM": Average entertainment
 * - "LOW": Likely boring
 * - "ABSTAIN": No signal for this function
 *
 * Final label is determined by majority vote with confidence weighting.
 */

import { prisma } from '../../database/prisma'

/**
 * Entertainment label from a labeling function
 */
export type EntertainmentLabel = 'HIGH' | 'MEDIUM' | 'LOW' | 'ABSTAIN'

/**
 * Result from a single labeling function
 */
export interface LabelingResult {
  label: EntertainmentLabel
  confidence: number  // 0-1, how confident is this function
}

/**
 * Fight statistics used for labeling
 */
export interface FightStats {
  method: string | null           // KO, TKO, SUB, DEC
  round: number | null            // Round fight ended
  time: string | null             // Time in round (MM:SS)
  totalFightTimeSeconds: number   // Calculated total time
  bonusAwarded: boolean           // FOTN, POTN
  significantStrikes?: number     // Total strikes landed
  knockdowns?: number             // Total knockdowns
  submissionAttempts?: number     // Total submission attempts
  controlTime?: number            // Ground control seconds
}

/**
 * Labeling function registry
 */
type LabelingFunction = (stats: FightStats) => LabelingResult

/**
 * 1. Quick Finish Label
 * Fights ending quickly in KO/TKO/SUB are typically exciting
 */
export const quickFinishLabel: LabelingFunction = (stats) => {
  if (!stats.method || stats.method === 'DEC') {
    return { label: 'ABSTAIN', confidence: 0 }
  }

  // First round finish
  if (stats.round === 1 && stats.totalFightTimeSeconds < 180) {
    return { label: 'HIGH', confidence: 0.8 }
  }

  // Second round finish
  if (stats.round && stats.round <= 2) {
    return { label: 'HIGH', confidence: 0.6 }
  }

  // Late round finish
  if (stats.round && stats.round >= 3) {
    return { label: 'MEDIUM', confidence: 0.5 }
  }

  return { label: 'ABSTAIN', confidence: 0 }
}

/**
 * 2. Bonus Winner Label
 * FOTN/POTN winners are definitively entertaining
 */
export const bonusWinnerLabel: LabelingFunction = (stats) => {
  if (stats.bonusAwarded) {
    return { label: 'HIGH', confidence: 0.95 }  // Very high confidence
  }
  return { label: 'ABSTAIN', confidence: 0 }
}

/**
 * 3. High Action Label
 * Based on significant strikes landed
 */
export const highActionLabel: LabelingFunction = (stats) => {
  if (stats.significantStrikes === undefined) {
    return { label: 'ABSTAIN', confidence: 0 }
  }

  // Adjust for fight length (strikes per minute)
  const fightMinutes = stats.totalFightTimeSeconds / 60
  if (fightMinutes === 0) return { label: 'ABSTAIN', confidence: 0 }

  const strikesPerMinute = stats.significantStrikes / fightMinutes

  // High action: > 15 strikes/min (both fighters combined)
  if (strikesPerMinute > 15) {
    return { label: 'HIGH', confidence: 0.7 }
  }

  // Medium action: 10-15 strikes/min
  if (strikesPerMinute >= 10) {
    return { label: 'MEDIUM', confidence: 0.5 }
  }

  // Low action: < 10 strikes/min
  if (strikesPerMinute < 7) {
    return { label: 'LOW', confidence: 0.6 }
  }

  return { label: 'ABSTAIN', confidence: 0 }
}

/**
 * 4. Knockdown Drama Label
 * Knockdowns indicate exciting exchanges
 */
export const knockdownDramaLabel: LabelingFunction = (stats) => {
  if (stats.knockdowns === undefined) {
    return { label: 'ABSTAIN', confidence: 0 }
  }

  // Multiple knockdowns = definitely exciting
  if (stats.knockdowns >= 2) {
    return { label: 'HIGH', confidence: 0.8 }
  }

  // Single knockdown
  if (stats.knockdowns === 1) {
    return { label: 'MEDIUM', confidence: 0.5 }
  }

  return { label: 'ABSTAIN', confidence: 0 }
}

/**
 * 5. Decision Grind Label
 * Long decisions without much action tend to be boring
 */
export const decisionGrindLabel: LabelingFunction = (stats) => {
  if (stats.method !== 'DEC') {
    return { label: 'ABSTAIN', confidence: 0 }
  }

  // Check for low strike rate + high control time
  const fightMinutes = stats.totalFightTimeSeconds / 60
  if (fightMinutes === 0) return { label: 'ABSTAIN', confidence: 0 }

  const strikesPerMinute = (stats.significantStrikes ?? 0) / fightMinutes
  const controlPercentage = (stats.controlTime ?? 0) / stats.totalFightTimeSeconds

  // High control + low strikes = grind fest
  if (controlPercentage > 0.5 && strikesPerMinute < 8) {
    return { label: 'LOW', confidence: 0.7 }
  }

  return { label: 'ABSTAIN', confidence: 0 }
}

/**
 * 6. Submission Battle Label
 * Multiple submission attempts indicate exciting grappling
 */
export const submissionBattleLabel: LabelingFunction = (stats) => {
  if (stats.submissionAttempts === undefined) {
    return { label: 'ABSTAIN', confidence: 0 }
  }

  // Many sub attempts = exciting grappling
  if (stats.submissionAttempts >= 4) {
    return { label: 'HIGH', confidence: 0.6 }
  }

  // Some activity
  if (stats.submissionAttempts >= 2) {
    return { label: 'MEDIUM', confidence: 0.4 }
  }

  return { label: 'ABSTAIN', confidence: 0 }
}

/**
 * All labeling functions
 */
export const LABELING_FUNCTIONS: Record<string, LabelingFunction> = {
  quick_finish: quickFinishLabel,
  bonus_winner: bonusWinnerLabel,
  high_action: highActionLabel,
  knockdown_drama: knockdownDramaLabel,
  decision_grind: decisionGrindLabel,
  submission_battle: submissionBattleLabel,
}

/**
 * Aggregate labels from multiple functions
 *
 * Uses confidence-weighted voting to determine final label
 */
export function aggregateLabels(
  votes: Record<string, LabelingResult>
): {
  label: EntertainmentLabel
  score: number
  confidence: number
  contributingFunctions: string[]
} {
  // Filter out abstentions
  const activeVotes = Object.entries(votes).filter(
    ([, result]) => result.label !== 'ABSTAIN'
  )

  if (activeVotes.length === 0) {
    return {
      label: 'ABSTAIN',
      score: 50,  // Default middle score
      confidence: 0,
      contributingFunctions: [],
    }
  }

  // Calculate weighted votes for each label
  const labelWeights: Record<EntertainmentLabel, number> = {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    ABSTAIN: 0,
  }

  for (const [, result] of activeVotes) {
    labelWeights[result.label] += result.confidence
  }

  // Find winning label
  let winningLabel: EntertainmentLabel = 'MEDIUM'
  let maxWeight = 0

  for (const [label, weight] of Object.entries(labelWeights)) {
    if (weight > maxWeight) {
      maxWeight = weight
      winningLabel = label as EntertainmentLabel
    }
  }

  // Calculate confidence as weighted agreement
  const totalWeight = Object.values(labelWeights).reduce((a, b) => a + b, 0)
  const confidence = totalWeight > 0 ? maxWeight / totalWeight : 0

  // Calculate entertainment score (0-100)
  const scoreMap: Record<EntertainmentLabel, number> = {
    HIGH: 85,
    MEDIUM: 50,
    LOW: 25,
    ABSTAIN: 50,
  }
  const score = scoreMap[winningLabel]

  // Get contributing functions
  const contributingFunctions = activeVotes
    .filter(([, result]) => result.label === winningLabel)
    .map(([name]) => name)

  return {
    label: winningLabel,
    score,
    confidence,
    contributingFunctions,
  }
}

/**
 * Generate weak supervision label for a fight
 */
export function generateWeakLabel(
  stats: FightStats
): {
  label: EntertainmentLabel
  score: number
  confidence: number
  contributingFunctions: string[]
  votes: Record<string, LabelingResult>
} {
  // Run all labeling functions
  const votes: Record<string, LabelingResult> = {}

  for (const [name, fn] of Object.entries(LABELING_FUNCTIONS)) {
    votes[name] = fn(stats)
  }

  // Aggregate votes
  const aggregated = aggregateLabels(votes)

  return {
    ...aggregated,
    votes,
  }
}

/**
 * Calculate total fight time from round and time string
 */
export function calculateTotalFightTime(
  round: number | null,
  timeStr: string | null,
  scheduledRounds: number = 3
): number {
  if (!round || !timeStr) {
    // Full fight duration
    return scheduledRounds * 5 * 60
  }

  // Parse time (MM:SS format)
  const [minutes, seconds] = timeStr.split(':').map(Number)
  const roundTime = (minutes || 0) * 60 + (seconds || 0)

  // Previous rounds + current round time
  return (round - 1) * 5 * 60 + roundTime
}

/**
 * Batch generate weak labels for completed fights
 */
export async function batchGenerateWeakLabels(
  batchSize: number = 100
): Promise<{
  processed: number
  created: number
  skipped: number
}> {
  // Find completed fights without weak labels
  const fights = await prisma.fight.findMany({
    where: {
      completed: true,
      weakLabel: null,
      method: { not: null },
    },
    take: batchSize,
    select: {
      id: true,
      method: true,
      round: true,
      time: true,
      scheduledRounds: true,
    },
  })

  let created = 0
  let skipped = 0

  for (const fight of fights) {
    const totalTime = calculateTotalFightTime(
      fight.round,
      fight.time,
      fight.scheduledRounds
    )

    const stats: FightStats = {
      method: fight.method,
      round: fight.round,
      time: fight.time,
      totalFightTimeSeconds: totalTime,
      bonusAwarded: false, // Would need to fetch from external source
      // These would need additional data sources:
      significantStrikes: undefined,
      knockdowns: undefined,
      submissionAttempts: undefined,
      controlTime: undefined,
    }

    const result = generateWeakLabel(stats)

    // Skip if no confident label
    if (result.label === 'ABSTAIN' || result.confidence < 0.3) {
      skipped++
      continue
    }

    // Create weak label
    await prisma.weakSupervisionLabel.create({
      data: {
        fightId: fight.id,
        actualFinish: fight.method !== 'DEC',
        entertainmentLabel: result.label,
        entertainmentScore: result.score,
        entertainmentConfidence: result.confidence,
        contributingFunctions: result.contributingFunctions,
        functionVotes: JSON.parse(JSON.stringify(result.votes)),  // Ensure JSON serializable
        finishRound: fight.round,
        totalFightTimeSeconds: totalTime,
        labelingVersion: '1.0',
      },
    })

    created++
  }

  return {
    processed: fights.length,
    created,
    skipped,
  }
}
