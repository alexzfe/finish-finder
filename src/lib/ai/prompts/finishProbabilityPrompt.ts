/**
 * Finish Probability Prompt Template
 *
 * Predicts the probability of a fight ending in a finish (KO/TKO/Submission)
 * using 4-step chain-of-thought reasoning.
 *
 * Temperature: 0.3 (low for consistency)
 * Output: Structured JSON with probability, confidence, and reasoning
 */

import { getWeightClassRates } from './weightClassRates'

/**
 * Fighter statistics for finish probability prediction
 */
export interface FighterFinishStats {
  name: string
  record: string

  // Defensive metrics (key for predicting finishes)
  significantStrikesAbsorbedPerMinute: number  // SApM - lower = better durability
  strikingDefensePercentage: number            // % of strikes avoided - higher = better
  takedownDefensePercentage: number            // % of takedowns defended

  // Offensive finish metrics
  finishRate: number                           // % of wins by finish (KO + SUB)
  koPercentage: number                         // % of wins by KO/TKO
  submissionPercentage: number                 // % of wins by submission
  significantStrikesLandedPerMinute: number    // SLpM - offensive output
  submissionAverage: number                    // Submission attempts per 15 min

  // Optional: Recent form (if available)
  last3Finishes?: number                       // Number of finishes in last 3 fights
}

/**
 * Context for the fight
 */
export interface FinishProbabilityContext {
  eventName: string
  weightClass: string

  // Optional: Betting odds for additional context
  bettingOdds?: {
    fighter1Odds: number      // e.g. -200 (favorite)
    fighter2Odds: number      // e.g. +170 (underdog)
    fighter1ImpliedProb: number  // e.g. 0.667 (66.7%)
  }
}

/**
 * Complete input for finish probability prediction
 */
export interface FinishProbabilityInput {
  fighter1: FighterFinishStats
  fighter2: FighterFinishStats
  context: FinishProbabilityContext
}

/**
 * Structured output from finish probability prediction
 */
export interface FinishProbabilityOutput {
  finishProbability: number  // 0-1 (0-100%)
  confidence: number         // 0-1 (how confident in the prediction)
  reasoning: {
    defensiveComparison: string      // Step 1: Compare defensive metrics
    finishRateComparison: string     // Step 2: Compare finish rates
    weightClassAdjustment: string    // Step 3: Adjust for weight class baseline
    finalAssessment: string          // Step 4: Final probability and reasoning
  }
}

/**
 * Build the Finish Probability prompt using 4-step chain-of-thought reasoning
 *
 * @param input - Fighter stats and context
 * @returns Formatted prompt string for LLM
 */
export function buildFinishProbabilityPrompt(input: FinishProbabilityInput): string {
  const { fighter1, fighter2, context } = input

  // Get weight class base rates
  const weightClassRates = getWeightClassRates(context.weightClass)

  // Build betting odds section if available
  const bettingOddsSection = context.bettingOdds
    ? `
BETTING ODDS (Optional Context):
- ${fighter1.name}: ${context.bettingOdds.fighter1Odds} (implied probability: ${(context.bettingOdds.fighter1ImpliedProb * 100).toFixed(1)}%)
- ${fighter2.name}: ${context.bettingOdds.fighter2Odds}
- The betting favorite typically has an edge, but fighter-specific finish rates should still be weighted heavily`
    : ''

  return `You are an expert MMA analyst specializing in predicting fight finishes. Analyze this fight and predict the probability it ends in a finish (KO/TKO/Submission) rather than a decision.

EVENT: ${context.eventName}
WEIGHT CLASS: ${context.weightClass}
WEIGHT CLASS BASE FINISH RATE: ${(weightClassRates.finishRate * 100).toFixed(1)}% (KO: ${(weightClassRates.koRate * 100).toFixed(1)}%, SUB: ${(weightClassRates.submissionRate * 100).toFixed(1)}%)

FIGHTER 1: ${fighter1.name}
Record: ${fighter1.record}

Defensive Metrics (Durability):
- Significant Strikes Absorbed per Minute: ${fighter1.significantStrikesAbsorbedPerMinute.toFixed(2)} (lower = better durability)
- Striking Defense %: ${(fighter1.strikingDefensePercentage * 100).toFixed(1)}% (higher = better at avoiding damage)
- Takedown Defense %: ${(fighter1.takedownDefensePercentage * 100).toFixed(1)}%

Offensive Finish Metrics:
- Finish Rate: ${(fighter1.finishRate * 100).toFixed(1)}% (${(fighter1.koPercentage * 100).toFixed(1)}% KO, ${(fighter1.submissionPercentage * 100).toFixed(1)}% SUB)
- Significant Strikes Landed per Minute: ${fighter1.significantStrikesLandedPerMinute.toFixed(2)}
- Submission Attempts per 15 min: ${fighter1.submissionAverage.toFixed(2)}
${fighter1.last3Finishes !== undefined ? `- Last 3 Fights: ${fighter1.last3Finishes} finishes` : ''}

FIGHTER 2: ${fighter2.name}
Record: ${fighter2.record}

Defensive Metrics (Durability):
- Significant Strikes Absorbed per Minute: ${fighter2.significantStrikesAbsorbedPerMinute.toFixed(2)} (lower = better durability)
- Striking Defense %: ${(fighter2.strikingDefensePercentage * 100).toFixed(1)}% (higher = better at avoiding damage)
- Takedown Defense %: ${(fighter2.takedownDefensePercentage * 100).toFixed(1)}%

Offensive Finish Metrics:
- Finish Rate: ${(fighter2.finishRate * 100).toFixed(1)}% (${(fighter2.koPercentage * 100).toFixed(1)}% KO, ${(fighter2.submissionPercentage * 100).toFixed(1)}% SUB)
- Significant Strikes Landed per Minute: ${fighter2.significantStrikesLandedPerMinute.toFixed(2)}
- Submission Attempts per 15 min: ${fighter2.submissionAverage.toFixed(2)}
${fighter2.last3Finishes !== undefined ? `- Last 3 Fights: ${fighter2.last3Finishes} finishes` : ''}
${bettingOddsSection}

ANALYSIS FRAMEWORK (4 Steps):

Step 1 - Compare Defensive Metrics:
- Which fighter is more durable? (lower strikes absorbed, higher defense %)
- Which fighter is more vulnerable to being finished?
- Weight recent form if available

Step 2 - Compare Finish Rates:
- Which fighter has a higher finish rate historically?
- Are they finishers via KO or submission?
- Do their offensive styles match defensive vulnerabilities?

Step 3 - Adjust for Weight Class Baseline:
- This weight class has a ${(weightClassRates.finishRate * 100).toFixed(1)}% base finish rate
- Should this specific matchup be higher or lower than baseline?
- Consider if both fighters are durable grapplers (lower) or aggressive strikers (higher)

Step 4 - Final Assessment:
- Synthesize all factors into a single finish probability
- Account for style matchup (striker vs wrestler, etc.)
- Consider if betting odds suggest a mismatch (blowouts often end early)

OUTPUT (JSON only, no markdown):
{
  "finishProbability": <float between 0 and 1>,
  "confidence": <float between 0 and 1 indicating how confident you are>,
  "reasoning": {
    "defensiveComparison": "<2-3 sentences comparing defensive metrics and vulnerability>",
    "finishRateComparison": "<2-3 sentences comparing offensive finish ability>",
    "weightClassAdjustment": "<2-3 sentences explaining how this matchup compares to weight class baseline>",
    "finalAssessment": "<2-3 sentences with final probability and key factors driving it>"
  }
}

IMPORTANT:
- Be realistic: Most fights end in decisions, so probabilities >0.7 should be rare
- Weight defensive metrics heavily: A durable fighter reduces finish probability significantly
- Consider matchup dynamics: Two defensive wrestlers = low finish rate, two aggressive strikers = high finish rate
- Your confidence should reflect data quality and clarity of matchup

Provide only valid JSON output.`
}
