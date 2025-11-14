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

  // Loss finish vulnerability (CRITICAL for defense assessment)
  lossFinishRate: number                       // % of losses by finish (KO + SUB) - higher = vulnerable
  koLossPercentage: number                     // % of losses by KO/TKO - indicates chin durability
  submissionLossPercentage: number             // % of losses by submission - indicates grappling defense

  // Offensive finish metrics
  finishRate: number                           // % of wins by finish (KO + SUB)
  koPercentage: number                         // % of wins by KO/TKO
  submissionPercentage: number                 // % of wins by submission
  significantStrikesLandedPerMinute: number    // SLpM - offensive output
  submissionAverage: number                    // Submission attempts per 15 min

  // Optional: Recent form (if available)
  last3Finishes?: number                       // Number of finishes in last 3 fights

  // Optional: Recent context from web search
  recentContext?: string                       // Recent news, injuries, training camp updates
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
  keyFactors: string[]       // 4-5 concise factors (1-2 words each) like "High Volume", "Weak Chin"
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

  // Build recent context section if available
  const recentContextSection =
    fighter1.recentContext || fighter2.recentContext
      ? `
RECENT CONTEXT (From Web Search):

${fighter1.name}:
${fighter1.recentContext || 'No recent context available.'}

${fighter2.name}:
${fighter2.recentContext || 'No recent context available.'}

Note: Consider recent injuries, momentum, training camp reports, and style changes when analyzing this matchup.`
      : ''

  return `You are an expert MMA analyst specializing in predicting fight finishes.

Analyze this fight and predict the probability it ends in a finish (KO/TKO/Submission) rather than a decision.

EVENT: ${context.eventName}
WEIGHT CLASS: ${context.weightClass}
WEIGHT CLASS BASE FINISH RATE: ${(weightClassRates.finishRate * 100).toFixed(1)}% (KO: ${(weightClassRates.koRate * 100).toFixed(1)}%, SUB: ${(weightClassRates.submissionRate * 100).toFixed(1)}%)

FIGHTER 1: ${fighter1.name}
Record: ${fighter1.record}

Defensive Metrics (Durability):
- Significant Strikes Absorbed per Minute: ${fighter1.significantStrikesAbsorbedPerMinute.toFixed(2)} (lower = better durability)
- Striking Defense %: ${(fighter1.strikingDefensePercentage * 100).toFixed(1)}% (higher = better at avoiding damage)
- Takedown Defense %: ${(fighter1.takedownDefensePercentage * 100).toFixed(1)}%

🚨 LOSS FINISH VULNERABILITY (CRITICAL FOR PREDICTIONS):
- UFC Loss Finish Rate: ${(fighter1.lossFinishRate * 100).toFixed(1)}% (${(fighter1.koLossPercentage * 100).toFixed(1)}% KO losses, ${(fighter1.submissionLossPercentage * 100).toFixed(1)}% SUB losses)
  → ${fighter1.lossFinishRate >= 0.6 ? '⚠️ HIGH vulnerability - frequently finished in the UFC' : fighter1.lossFinishRate >= 0.3 ? 'MODERATE vulnerability' : 'LOW vulnerability - durable'}

Offensive Finish Metrics:
- UFC Finish Rate: ${(fighter1.finishRate * 100).toFixed(1)}% (${(fighter1.koPercentage * 100).toFixed(1)}% KO, ${(fighter1.submissionPercentage * 100).toFixed(1)}% SUB)
- Significant Strikes Landed per Minute: ${fighter1.significantStrikesLandedPerMinute.toFixed(2)}
- Submission Attempts per 15 min: ${fighter1.submissionAverage.toFixed(2)}
${fighter1.last3Finishes !== undefined ? `- Last 3 Fights: ${fighter1.last3Finishes} finishes` : ''}

FIGHTER 2: ${fighter2.name}
Record: ${fighter2.record}

Defensive Metrics (Durability):
- Significant Strikes Absorbed per Minute: ${fighter2.significantStrikesAbsorbedPerMinute.toFixed(2)} (lower = better durability)
- Striking Defense %: ${(fighter2.strikingDefensePercentage * 100).toFixed(1)}% (higher = better at avoiding damage)
- Takedown Defense %: ${(fighter2.takedownDefensePercentage * 100).toFixed(1)}%

🚨 LOSS FINISH VULNERABILITY (CRITICAL FOR PREDICTIONS):
- UFC Loss Finish Rate: ${(fighter2.lossFinishRate * 100).toFixed(1)}% (${(fighter2.koLossPercentage * 100).toFixed(1)}% KO losses, ${(fighter2.submissionLossPercentage * 100).toFixed(1)}% SUB losses)
  → ${fighter2.lossFinishRate >= 0.6 ? '⚠️ HIGH vulnerability - frequently finished in the UFC' : fighter2.lossFinishRate >= 0.3 ? 'MODERATE vulnerability' : 'LOW vulnerability - durable'}

Offensive Finish Metrics:
- UFC Finish Rate: ${(fighter2.finishRate * 100).toFixed(1)}% (${(fighter2.koPercentage * 100).toFixed(1)}% KO, ${(fighter2.submissionPercentage * 100).toFixed(1)}% SUB)
- Significant Strikes Landed per Minute: ${fighter2.significantStrikesLandedPerMinute.toFixed(2)}
- Submission Attempts per 15 min: ${fighter2.submissionAverage.toFixed(2)}
${fighter2.last3Finishes !== undefined ? `- Last 3 Fights: ${fighter2.last3Finishes} finishes` : ''}
${bettingOddsSection}
${recentContextSection}

ANALYSIS FRAMEWORK (4 Steps):

Step 1 - Assess Defensive Vulnerability (MOST CRITICAL):
- 🚨 START HERE: Check loss finish rates - this is the PRIMARY vulnerability indicator
  * 60%+ loss finish rate = HIGH vulnerability (frequently finished when losing)
  * 30-59% = MODERATE vulnerability (average durability)
  * <30% = LOW vulnerability (durable, hard to finish)
- Match offensive strengths vs defensive weaknesses (e.g., KO artist vs 70% KO loss rate = danger)
- Secondary: Compare strikes absorbed and defense percentages
- Weight recent form if available

Step 2 - Compare Offensive Finish Rates:
- Which fighter has a higher finish rate historically?
- Are they finishers via KO or submission?
- CRITICAL: Does their finish method align with opponent's vulnerability? (KO power vs high KO loss rate)
- High offensive finish rate + high defensive vulnerability in opponent = STRONG finish probability

Step 3 - Adjust for Weight Class Baseline:
- This weight class has a ${(weightClassRates.finishRate * 100).toFixed(1)}% base finish rate
- Should this specific matchup be higher or lower than baseline?
- Consider if both fighters are durable grapplers (lower) or aggressive strikers (higher)
- Factor in if one fighter is significantly more vulnerable than average for the weight class

Step 4 - Final Assessment:
- Synthesize all factors into a single finish probability
- Account for style matchup (striker vs wrestler, etc.)
- Consider if betting odds suggest a mismatch (blowouts often end early)
- REMEMBER: A single highly vulnerable fighter paired with a strong finisher should push probability significantly higher

OUTPUT (JSON only, no markdown):
{
  "finishProbability": <float between 0 and 1>,
  "confidence": <float between 0 and 1>,
  "reasoning": {
    "defensiveComparison": "<2-3 sentences>",
    "finishRateComparison": "<2-3 sentences>",
    "weightClassAdjustment": "<2-3 sentences>",
    "finalAssessment": "<2-3 sentences>"
  }
}

IMPORTANT - ANALYSIS STYLE:
- Write conversationally with some personality, but stay professional
- Reference stats naturally in your analysis: "With 5.2 strikes absorbed per minute and only 52% defense, he's vulnerable"
- Be engaging but credible: Blend data with readable insights
- CRITICAL: When mentioning finish rates or loss finish rates, specify "UFC" to avoid confusion (e.g., "100% UFC finish rate" not just "100% finish rate")
- Examples of good phrasing:
  - "Absorbing 5+ strikes per minute with just 52% defense makes him a finish candidate"
  - "Both fighters favor offense over defense, which tends to produce exciting exchanges"
  - "The 65% baseline finish rate will likely be exceeded given both fighters finish over 75% of their UFC wins"
  - "His 100% UFC loss finish rate shows he's been finished in every UFC loss, indicating high vulnerability"

IMPORTANT - TECHNICAL ACCURACY:
- Be realistic: Most fights end in decisions, so probabilities >0.7 should be rare
- Weight defensive metrics heavily: A durable fighter reduces finish probability significantly
- Consider matchup dynamics: Two defensive wrestlers = low finish rate, two aggressive strikers = high finish rate
- Your confidence should reflect data quality and clarity of matchup

Provide only valid JSON output.`
}
