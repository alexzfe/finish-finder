/**
 * ML Tier Integration - Phase 4
 *
 * Integrates the trained XGBoost tier model predictions with the LLM-based
 * score calculation. The ML tier provides an objective baseline that can:
 *
 * 1. Validate LLM predictions (flag disagreements)
 * 2. Adjust confidence when ML and LLM agree/disagree
 * 3. Provide ensemble scores for improved calibration
 *
 * Tier Definitions:
 *   1 - Low: Likely uneventful/grinding fight
 *   2 - Average: Standard competitive fight
 *   3 - Good: Above average action expected
 *   4 - Excellent: High likelihood of exciting fight
 *   5 - Elite: Near-certain entertainment (FOTN contender)
 */

/**
 * Mapping from ML tier to expected fun score range
 * Based on historical correlation between tiers and entertainment
 */
export const TIER_TO_FUN_SCORE = {
  1: { min: 0, max: 35, expected: 25 },    // Low entertainment
  2: { min: 30, max: 55, expected: 42 },   // Average entertainment
  3: { min: 45, max: 70, expected: 58 },   // Good entertainment
  4: { min: 60, max: 85, expected: 72 },   // Excellent entertainment
  5: { min: 75, max: 100, expected: 88 },  // Elite entertainment
} as const

/**
 * Mapping from ML tier to expected finish probability range
 * Based on historical correlation between tiers and finish rates
 */
export const TIER_TO_FINISH_PROB = {
  1: { min: 0.15, max: 0.35, expected: 0.25 },  // Low finish likelihood
  2: { min: 0.30, max: 0.50, expected: 0.40 },  // Average finish likelihood
  3: { min: 0.40, max: 0.60, expected: 0.50 },  // Good finish likelihood
  4: { min: 0.50, max: 0.75, expected: 0.62 },  // High finish likelihood
  5: { min: 0.65, max: 0.90, expected: 0.78 },  // Very high finish likelihood
} as const

/**
 * ML Tier prediction from database
 */
export interface MLTierPrediction {
  tier: number           // 1-5
  confidence: number     // 0-1
  probabilities: number[] // [P(T1), P(T2), P(T3), P(T4), P(T5)]
}

/**
 * Result of comparing LLM and ML predictions
 */
export interface PredictionComparison {
  llmFunScore: number
  mlExpectedFunScore: number
  funScoreAgreement: 'strong' | 'moderate' | 'weak' | 'disagree'

  llmFinishProbability: number
  mlExpectedFinishProbability: number
  finishProbAgreement: 'strong' | 'moderate' | 'weak' | 'disagree'

  confidenceAdjustment: number  // Multiplier to apply to LLM confidence
  shouldFlag: boolean           // Whether to flag for human review
  reason?: string               // Reason for flagging
}

/**
 * Compare LLM prediction with ML tier prediction
 *
 * @param llmFunScore - Fun score from LLM (0-100)
 * @param llmFinishProb - Finish probability from LLM (0-1)
 * @param mlTier - ML tier prediction from database
 * @returns Comparison result with agreement level and confidence adjustment
 */
export function comparePredictions(
  llmFunScore: number,
  llmFinishProb: number,
  mlTier: MLTierPrediction
): PredictionComparison {
  const tier = mlTier.tier as keyof typeof TIER_TO_FUN_SCORE
  const funRange = TIER_TO_FUN_SCORE[tier]
  const finishRange = TIER_TO_FINISH_PROB[tier]

  // Calculate fun score agreement
  let funScoreAgreement: PredictionComparison['funScoreAgreement']
  const funScoreDiff = Math.abs(llmFunScore - funRange.expected)

  if (llmFunScore >= funRange.min && llmFunScore <= funRange.max) {
    funScoreAgreement = funScoreDiff <= 10 ? 'strong' : 'moderate'
  } else if (funScoreDiff <= 20) {
    funScoreAgreement = 'weak'
  } else {
    funScoreAgreement = 'disagree'
  }

  // Calculate finish probability agreement
  let finishProbAgreement: PredictionComparison['finishProbAgreement']
  const finishProbDiff = Math.abs(llmFinishProb - finishRange.expected)

  if (llmFinishProb >= finishRange.min && llmFinishProb <= finishRange.max) {
    finishProbAgreement = finishProbDiff <= 0.10 ? 'strong' : 'moderate'
  } else if (finishProbDiff <= 0.20) {
    finishProbAgreement = 'weak'
  } else {
    finishProbAgreement = 'disagree'
  }

  // Calculate confidence adjustment based on agreement
  // Strong agreement = boost confidence
  // Disagreement = reduce confidence
  let confidenceAdjustment = 1.0

  const agreements = [funScoreAgreement, finishProbAgreement]
  const strongCount = agreements.filter(a => a === 'strong').length
  const disagreeCount = agreements.filter(a => a === 'disagree').length

  if (strongCount === 2) {
    confidenceAdjustment = 1.15  // Both strongly agree - boost 15%
  } else if (strongCount === 1 && disagreeCount === 0) {
    confidenceAdjustment = 1.05  // One strong, no disagreement - boost 5%
  } else if (disagreeCount === 1) {
    confidenceAdjustment = 0.85  // One disagreement - reduce 15%
  } else if (disagreeCount === 2) {
    confidenceAdjustment = 0.70  // Both disagree - reduce 30%
  }

  // Factor in ML tier confidence
  // If ML is uncertain, reduce the adjustment magnitude
  const mlConfidenceWeight = 0.5 + (mlTier.confidence * 0.5)  // 0.5-1.0
  confidenceAdjustment = 1 + (confidenceAdjustment - 1) * mlConfidenceWeight

  // Determine if should flag for review
  let shouldFlag = false
  let reason: string | undefined

  // Flag if strong disagreement and ML is confident
  if (disagreeCount >= 1 && mlTier.confidence > 0.4) {
    shouldFlag = true
    reason = `ML tier ${mlTier.tier} (conf: ${(mlTier.confidence * 100).toFixed(0)}%) disagrees with LLM prediction`
  }

  // Flag if fun score is way off from tier expectation
  if (funScoreDiff > 30) {
    shouldFlag = true
    reason = `LLM fun score ${llmFunScore} far from Tier ${mlTier.tier} expected ${funRange.expected}`
  }

  return {
    llmFunScore,
    mlExpectedFunScore: funRange.expected,
    funScoreAgreement,
    llmFinishProbability: llmFinishProb,
    mlExpectedFinishProbability: finishRange.expected,
    finishProbAgreement,
    confidenceAdjustment,
    shouldFlag,
    reason,
  }
}

/**
 * Calculate ensemble score by blending LLM and ML predictions
 *
 * Uses configurable weights to combine:
 * - LLM prediction (nuanced, context-aware)
 * - ML tier baseline (objective, historically calibrated)
 *
 * @param llmScore - Score from LLM
 * @param mlExpected - Expected score from ML tier
 * @param llmWeight - Weight for LLM score (0-1, default 0.7)
 * @param mlConfidence - ML tier confidence (reduces ML weight if low)
 * @returns Blended score
 */
export function calculateEnsembleScore(
  llmScore: number,
  mlExpected: number,
  llmWeight: number = 0.7,
  mlConfidence: number = 0.5
): number {
  // Scale ML weight by its confidence
  const effectiveMlWeight = (1 - llmWeight) * (0.5 + mlConfidence * 0.5)
  const effectiveLlmWeight = 1 - effectiveMlWeight

  return llmScore * effectiveLlmWeight + mlExpected * effectiveMlWeight
}

/**
 * Get expected fun score for an ML tier
 */
export function getExpectedFunScore(tier: number): number {
  const validTier = Math.max(1, Math.min(5, tier)) as keyof typeof TIER_TO_FUN_SCORE
  return TIER_TO_FUN_SCORE[validTier].expected
}

/**
 * Get expected finish probability for an ML tier
 */
export function getExpectedFinishProbability(tier: number): number {
  const validTier = Math.max(1, Math.min(5, tier)) as keyof typeof TIER_TO_FINISH_PROB
  return TIER_TO_FINISH_PROB[validTier].expected
}

/**
 * Convert ML tier to a descriptive label
 */
export function getTierLabel(tier: number): string {
  const labels: Record<number, string> = {
    1: 'Low',
    2: 'Average',
    3: 'Good',
    4: 'Excellent',
    5: 'Elite',
  }
  return labels[tier] || 'Unknown'
}

/**
 * Format ML tier prediction for display
 */
export function formatTierPrediction(mlTier: MLTierPrediction): string {
  const label = getTierLabel(mlTier.tier)
  const confidence = (mlTier.confidence * 100).toFixed(0)
  return `Tier ${mlTier.tier} (${label}) - ${confidence}% confidence`
}

/**
 * Check if ML tier data is available and valid
 */
export function isValidMLTier(mlTier: MLTierPrediction | null | undefined): mlTier is MLTierPrediction {
  return (
    mlTier !== null &&
    mlTier !== undefined &&
    typeof mlTier.tier === 'number' &&
    mlTier.tier >= 1 &&
    mlTier.tier <= 5 &&
    typeof mlTier.confidence === 'number' &&
    mlTier.confidence >= 0 &&
    mlTier.confidence <= 1
  )
}
