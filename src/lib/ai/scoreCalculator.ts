/**
 * Deterministic Score Calculator - Phase 4
 *
 * Calculates finish probability and fun score from qualitative attributes.
 * This ensures consistency between the two scores since they derive from
 * the same underlying attributes.
 *
 * Key principle: LLMs are bad at consistent arithmetic but good at qualitative
 * assessment. We let the LLM rate attributes (1-5) and calculate scores in TS.
 */

import {
  type FightAttributes,
  type FightSimulationOutput,
  type StyleClash,
} from './prompts/unifiedPredictionPrompt'
import { getWeightClassRates } from './prompts/weightClassRates'
import {
  type MLTierPrediction,
  type PredictionComparison,
  comparePredictions,
  calculateEnsembleScore,
  isValidMLTier,
  formatTierPrediction,
  getTierLabel,
  getExpectedFunScore,
  getExpectedFinishProbability,
} from './mlTierIntegration'

/**
 * Configuration for score calculation
 * These weights can be tuned based on historical accuracy data
 */
export const SCORE_CONFIG = {
  // Finish Probability weights
  finish: {
    // finishDanger attribute is the primary driver
    finishDangerWeight: 0.6,
    // Style clash modifier
    styleClashMultipliers: {
      Complementary: 1.15,  // Styles create action
      Neutral: 1.0,
      Canceling: 0.75,      // Styles nullify each other
    } as Record<StyleClash, number>,
    // Minimum and maximum probability bounds
    minProbability: 0.15,
    maxProbability: 0.85,
  },

  // Fun Score weights (out of 100)
  fun: {
    // Primary factors (max 70 points)
    paceWeight: 35,           // Max 35 points
    finishDangerWeight: 35,   // Max 35 points

    // Secondary factors (max 20 points)
    technicalityWeight: 10,   // Max 10 points
    brawlBonus: 10,           // +10 if brawlPotential is true

    // Context bonuses (max 10 points)
    titleFightBonus: 5,
    mainEventBonus: 2,
    rivalryBonus: 3,

    // Penalties (negative points)
    cancelingStylePenalty: -15,  // If styles cancel out

    // Score bounds
    minScore: 0,
    maxScore: 100,
  },
}

/**
 * Calculate finish probability from fight simulation attributes
 *
 * Uses the finishDanger attribute (1-5) as primary signal, adjusted by:
 * - Weight class baseline (heavyweight = higher finish rates)
 * - Style clash modifier (complementary styles = more action)
 *
 * @param simulation - LLM output with qualitative attributes
 * @param weightClass - Weight class for baseline adjustment
 * @returns Finish probability (0-1)
 */
export function calculateFinishProbability(
  simulation: FightSimulationOutput,
  weightClass: string
): number {
  const { attributes } = simulation
  const config = SCORE_CONFIG.finish

  // Get weight class baseline (e.g., 0.70 for Heavyweight)
  const baseline = getWeightClassRates(weightClass).finishRate

  // Convert finishDanger (1-5) to a multiplier (0.4 - 1.2)
  // 1 = 0.4x baseline, 3 = 1.0x baseline, 5 = 1.2x baseline
  const finishDangerMultiplier = 0.4 + (attributes.finishDanger - 1) * 0.2

  // Apply style clash modifier
  const styleMultiplier = config.styleClashMultipliers[attributes.styleClash]

  // Calculate raw probability
  let probability = baseline * finishDangerMultiplier * styleMultiplier

  // Note: We no longer adjust based on method prediction since
  // we're not predicting fight outcomes, just finish likelihood.
  // The qualitative attributes (finishDanger, styleClash) already
  // capture everything needed to calculate finish probability.

  // Clamp to valid range
  return Math.min(
    config.maxProbability,
    Math.max(config.minProbability, probability)
  )
}

/**
 * Calculate fun score from fight simulation attributes
 *
 * Weighted formula:
 * - Pace (35 pts max): Based on pace attribute
 * - Finish Danger (35 pts max): Based on finishDanger attribute
 * - Technicality (10 pts max): Based on technicality attribute
 * - Brawl Bonus (10 pts): If brawlPotential is true
 * - Context bonuses (10 pts max): Title fight, main event, rivalry
 * - Canceling style penalty (-15 pts): If styles nullify each other
 *
 * @param simulation - LLM output with qualitative attributes
 * @param context - Fight context (title fight, main event, etc.)
 * @returns Fun score (0-100)
 */
export function calculateFunScore(
  simulation: FightSimulationOutput,
  context: {
    titleFight: boolean
    mainEvent: boolean
    rivalry?: boolean
  }
): number {
  const { attributes } = simulation
  const config = SCORE_CONFIG.fun

  let score = 0

  // Primary factors (max 70 points)
  // Pace: Convert 1-5 to 0-35 points
  score += (attributes.pace / 5) * config.paceWeight

  // Finish Danger: Convert 1-5 to 0-35 points
  score += (attributes.finishDanger / 5) * config.finishDangerWeight

  // Secondary factors (max 20 points)
  // Technicality: Convert 1-5 to 0-10 points
  // Note: High technicality can be entertaining (chess match) or boring (defensive)
  // We give partial credit - peak at 3-4 (tactical battles)
  const technicalityScore = attributes.technicality <= 3
    ? (attributes.technicality / 3) * config.technicalityWeight
    : ((5 - attributes.technicality) / 2 + 0.5) * config.technicalityWeight
  score += technicalityScore

  // Brawl bonus: +10 if both fighters willing to trade
  if (attributes.brawlPotential) {
    score += config.brawlBonus
  }

  // Context bonuses (max 10 points)
  if (context.titleFight) {
    score += config.titleFightBonus
  }
  if (context.mainEvent) {
    score += config.mainEventBonus
  }
  if (context.rivalry) {
    score += config.rivalryBonus
  }

  // Penalties
  // Canceling styles = likely boring fight
  if (attributes.styleClash === 'Canceling') {
    score += config.cancelingStylePenalty
  }

  // Clamp to valid range
  return Math.min(
    config.maxScore,
    Math.max(config.minScore, Math.round(score))
  )
}

/**
 * Calculate confidence adjustment based on attribute consistency
 *
 * Checks for internal inconsistencies in attribute ratings
 * and adjusts confidence accordingly.
 *
 * @param simulation - LLM output
 * @returns Adjusted confidence (0-1)
 */
export function calculateAdjustedConfidence(
  simulation: FightSimulationOutput
): number {
  const { attributes, confidence } = simulation
  let adjustedConfidence = confidence

  // Check for attribute inconsistencies

  // Inconsistency 1: Low pace but brawlPotential is true
  if (attributes.pace <= 2 && attributes.brawlPotential) {
    adjustedConfidence *= 0.9  // Reduce by 10%
  }

  // Inconsistency 2: High pace but canceling styles
  if (attributes.pace >= 4 && attributes.styleClash === 'Canceling') {
    adjustedConfidence *= 0.9   // Reduce by 10%
  }

  // Inconsistency 3: Very high technicality but brawlPotential true
  if (attributes.technicality >= 5 && attributes.brawlPotential) {
    adjustedConfidence *= 0.95  // Reduce by 5%
  }

  // Clamp to valid range
  return Math.min(1.0, Math.max(0.3, adjustedConfidence))
}

/**
 * Combined calculation result
 */
export interface CalculatedScores {
  finishProbability: number
  funScore: number
  adjustedConfidence: number
  finishConfidence: number  // Same as adjusted for now
  funConfidence: number     // Same as adjusted for now
}

/**
 * Extended calculation result with ML tier integration
 */
export interface CalculatedScoresWithML extends CalculatedScores {
  // ML-validated scores (uses ensemble when ML available)
  validatedFunScore: number
  validatedFinishProbability: number
  validatedConfidence: number

  // ML tier comparison results
  mlComparison?: PredictionComparison
  mlTier?: MLTierPrediction

  // Whether prediction should be flagged for review
  shouldFlag: boolean
  flagReason?: string
}

/**
 * Calculate all scores from fight simulation
 *
 * @param simulation - LLM output with qualitative attributes
 * @param weightClass - Weight class for baseline adjustment
 * @param context - Fight context for fun score bonuses
 * @returns All calculated scores
 */
export function calculateAllScores(
  simulation: FightSimulationOutput,
  weightClass: string,
  context: {
    titleFight: boolean
    mainEvent: boolean
    rivalry?: boolean
  }
): CalculatedScores {
  const finishProbability = calculateFinishProbability(simulation, weightClass)
  const funScore = calculateFunScore(simulation, context)
  const adjustedConfidence = calculateAdjustedConfidence(simulation)

  return {
    finishProbability,
    funScore,
    adjustedConfidence,
    finishConfidence: adjustedConfidence,
    funConfidence: adjustedConfidence,
  }
}

/**
 * Calculate all scores with ML tier validation and ensemble
 *
 * This enhanced version:
 * 1. Calculates base LLM-derived scores
 * 2. Compares with ML tier prediction (if available)
 * 3. Adjusts confidence based on agreement
 * 4. Optionally creates ensemble scores for improved calibration
 *
 * @param simulation - LLM output with qualitative attributes
 * @param weightClass - Weight class for baseline adjustment
 * @param context - Fight context for fun score bonuses
 * @param mlTier - Optional ML tier prediction from database
 * @param useEnsemble - Whether to blend LLM and ML scores (default true)
 * @returns Extended scores with ML validation
 */
export function calculateAllScoresWithML(
  simulation: FightSimulationOutput,
  weightClass: string,
  context: {
    titleFight: boolean
    mainEvent: boolean
    rivalry?: boolean
  },
  mlTier?: MLTierPrediction | null,
  useEnsemble: boolean = true
): CalculatedScoresWithML {
  // Calculate base LLM scores
  const baseScores = calculateAllScores(simulation, weightClass, context)

  // If no ML tier available, return base scores with no ML validation
  if (!isValidMLTier(mlTier)) {
    return {
      ...baseScores,
      validatedFunScore: baseScores.funScore,
      validatedFinishProbability: baseScores.finishProbability,
      validatedConfidence: baseScores.adjustedConfidence,
      shouldFlag: false,
    }
  }

  // Compare LLM predictions with ML tier
  const comparison = comparePredictions(
    baseScores.funScore,
    baseScores.finishProbability,
    mlTier
  )

  // Apply confidence adjustment based on LLM/ML agreement
  const validatedConfidence = Math.min(
    1.0,
    Math.max(0.3, baseScores.adjustedConfidence * comparison.confidenceAdjustment)
  )

  // Calculate validated scores
  let validatedFunScore: number
  let validatedFinishProbability: number

  if (useEnsemble) {
    // Use ensemble: blend LLM and ML predictions
    // Weight LLM more (0.7) since it has context, ML provides calibration anchor
    validatedFunScore = calculateEnsembleScore(
      baseScores.funScore,
      comparison.mlExpectedFunScore,
      0.7,
      mlTier.confidence
    )
    validatedFinishProbability = calculateEnsembleScore(
      baseScores.finishProbability,
      comparison.mlExpectedFinishProbability,
      0.7,
      mlTier.confidence
    )
  } else {
    // No ensemble: use LLM scores but with adjusted confidence
    validatedFunScore = baseScores.funScore
    validatedFinishProbability = baseScores.finishProbability
  }

  return {
    ...baseScores,
    validatedFunScore: Math.round(validatedFunScore),
    validatedFinishProbability: Math.round(validatedFinishProbability * 100) / 100,
    validatedConfidence,
    mlComparison: comparison,
    mlTier,
    shouldFlag: comparison.shouldFlag,
    flagReason: comparison.reason,
  }
}

/**
 * Debug helper: Explain score calculation
 *
 * Useful for understanding why a particular score was generated.
 *
 * @param simulation - LLM output
 * @param weightClass - Weight class
 * @param context - Fight context
 * @returns Explanation string
 */
export function explainScoreCalculation(
  simulation: FightSimulationOutput,
  weightClass: string,
  context: {
    titleFight: boolean
    mainEvent: boolean
    rivalry?: boolean
  }
): string {
  const { attributes, confidence } = simulation
  const baseline = getWeightClassRates(weightClass).finishRate
  const scores = calculateAllScores(simulation, weightClass, context)

  const lines: string[] = [
    '=== SCORE CALCULATION BREAKDOWN ===',
    '',
    'Input Attributes:',
    `  pace: ${attributes.pace}/5`,
    `  finishDanger: ${attributes.finishDanger}/5`,
    `  technicality: ${attributes.technicality}/5`,
    `  styleClash: ${attributes.styleClash}`,
    `  brawlPotential: ${attributes.brawlPotential}`,
    `  groundBattleLikely: ${attributes.groundBattleLikely}`,
    `  raw confidence: ${(confidence * 100).toFixed(1)}%`,
    '',
    'Finish Probability Calculation:',
    `  Weight class baseline: ${(baseline * 100).toFixed(1)}%`,
    `  finishDanger multiplier: ${(0.4 + (attributes.finishDanger - 1) * 0.2).toFixed(2)}x`,
    `  styleClash modifier: ${SCORE_CONFIG.finish.styleClashMultipliers[attributes.styleClash]}x`,
    `  → Final finish probability: ${(scores.finishProbability * 100).toFixed(1)}%`,
    '',
    'Fun Score Calculation:',
    `  Pace (${attributes.pace}/5): ${((attributes.pace / 5) * SCORE_CONFIG.fun.paceWeight).toFixed(1)} pts`,
    `  Finish danger (${attributes.finishDanger}/5): ${((attributes.finishDanger / 5) * SCORE_CONFIG.fun.finishDangerWeight).toFixed(1)} pts`,
    `  Technicality (${attributes.technicality}/5): ~${((attributes.technicality <= 3 ? (attributes.technicality / 3) : ((5 - attributes.technicality) / 2 + 0.5)) * SCORE_CONFIG.fun.technicalityWeight).toFixed(1)} pts`,
    `  Brawl bonus: ${attributes.brawlPotential ? SCORE_CONFIG.fun.brawlBonus : 0} pts`,
    `  Title fight: ${context.titleFight ? SCORE_CONFIG.fun.titleFightBonus : 0} pts`,
    `  Main event: ${context.mainEvent ? SCORE_CONFIG.fun.mainEventBonus : 0} pts`,
    `  Rivalry: ${context.rivalry ? SCORE_CONFIG.fun.rivalryBonus : 0} pts`,
    `  Canceling penalty: ${attributes.styleClash === 'Canceling' ? SCORE_CONFIG.fun.cancelingStylePenalty : 0} pts`,
    `  → Final fun score: ${scores.funScore}/100`,
    '',
    `Adjusted Confidence: ${(scores.adjustedConfidence * 100).toFixed(1)}%`,
  ]

  return lines.join('\n')
}

/**
 * Debug helper: Explain score calculation with ML tier validation
 *
 * Extended version that includes ML tier comparison when available.
 *
 * @param simulation - LLM output
 * @param weightClass - Weight class
 * @param context - Fight context
 * @param mlTier - Optional ML tier prediction
 * @returns Explanation string
 */
export function explainScoreCalculationWithML(
  simulation: FightSimulationOutput,
  weightClass: string,
  context: {
    titleFight: boolean
    mainEvent: boolean
    rivalry?: boolean
  },
  mlTier?: MLTierPrediction | null
): string {
  const baseExplanation = explainScoreCalculation(simulation, weightClass, context)

  if (!isValidMLTier(mlTier)) {
    return baseExplanation + '\n\n(No ML tier data available for validation)'
  }

  const scoresWithML = calculateAllScoresWithML(simulation, weightClass, context, mlTier)
  const comparison = scoresWithML.mlComparison!

  const mlLines: string[] = [
    '',
    '=== ML TIER VALIDATION ===',
    '',
    `ML Tier: ${formatTierPrediction(mlTier)}`,
    `  Expected Fun Score Range: ${getExpectedFunScore(mlTier.tier - 1) || 25}-${getExpectedFunScore(mlTier.tier + 1) || 88}`,
    `  Expected Finish Prob Range: ${(getExpectedFinishProbability(mlTier.tier) * 100).toFixed(0)}%`,
    '',
    'Comparison:',
    `  Fun Score Agreement: ${comparison.funScoreAgreement}`,
    `    LLM: ${scoresWithML.funScore} | ML Expected: ${comparison.mlExpectedFunScore}`,
    `  Finish Prob Agreement: ${comparison.finishProbAgreement}`,
    `    LLM: ${(scoresWithML.finishProbability * 100).toFixed(0)}% | ML Expected: ${(comparison.mlExpectedFinishProbability * 100).toFixed(0)}%`,
    '',
    'Validation Result:',
    `  Confidence Adjustment: ${comparison.confidenceAdjustment.toFixed(2)}x`,
    `  Validated Fun Score: ${scoresWithML.validatedFunScore}`,
    `  Validated Finish Prob: ${(scoresWithML.validatedFinishProbability * 100).toFixed(0)}%`,
    `  Validated Confidence: ${(scoresWithML.validatedConfidence * 100).toFixed(1)}%`,
  ]

  if (scoresWithML.shouldFlag) {
    mlLines.push('')
    mlLines.push(`⚠️ FLAGGED: ${scoresWithML.flagReason}`)
  }

  return baseExplanation + mlLines.join('\n')
}

// Re-export ML tier types for convenience
export type { MLTierPrediction, PredictionComparison }
export {
  isValidMLTier,
  formatTierPrediction,
  getTierLabel,
  getExpectedFunScore,
  getExpectedFinishProbability,
}
