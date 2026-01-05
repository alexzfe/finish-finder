/**
 * Unified Prediction Prompt - Phase 4 (SOTA Architecture)
 *
 * Replaces separate finish probability and fun score prompts with a single
 * "Fight Simulation" prompt that outputs qualitative attributes.
 *
 * Key innovations:
 * - Multi-persona analysis (Statistician, Tape Watcher, Synthesizer)
 * - Qualitative attribute outputs (1-5 scales) instead of direct numbers
 * - Deterministic score calculation in TypeScript (not LLM arithmetic)
 * - Guaranteed consistency between finish probability and fun score
 *
 * Temperature: 0.3 (low for consistency)
 * Output: Structured JSON with qualitative attributes and reasoning
 */

import { getWeightClassRates, type WeightClassRates } from './weightClassRates'
import { buildFewShotExamplesSection } from './anchorExamples'

/**
 * Style clash classification
 */
export type StyleClash = 'Complementary' | 'Neutral' | 'Canceling'

/**
 * Fighter style classification
 */
export type FighterStyle = 'striker' | 'wrestler' | 'grappler' | 'balanced'

/**
 * Fighter statistics for unified prediction
 * Combines data from both old FighterFinishStats and FighterFunStats
 */
export interface UnifiedFighterStats {
  name: string
  record: string

  // Defensive metrics
  significantStrikesAbsorbedPerMinute: number
  strikingDefensePercentage: number
  takedownDefensePercentage: number

  // Loss vulnerability
  lossFinishRate: number
  koLossPercentage: number
  submissionLossPercentage: number

  // Offensive metrics
  finishRate: number
  koPercentage: number
  submissionPercentage: number
  significantStrikesLandedPerMinute: number
  submissionAverage: number
  takedownAverage: number

  // Fight averages
  averageFightTimeSeconds: number
  winsByDecision: number
  totalWins: number

  // Derived style
  primaryStyle: FighterStyle

  // Optional context
  recentContext?: string
}

/**
 * Fight context for predictions
 */
export interface UnifiedPredictionContext {
  eventName: string
  weightClass: string
  titleFight: boolean
  mainEvent: boolean
  rankings?: {
    fighter1Rank: number | null
    fighter2Rank: number | null
  }
  rivalry?: boolean
  rematch?: boolean
}

/**
 * Complete input for unified prediction
 */
export interface UnifiedPredictionInput {
  fighter1: UnifiedFighterStats
  fighter2: UnifiedFighterStats
  context: UnifiedPredictionContext
}

/**
 * Qualitative attributes output by LLM
 * These are used for deterministic score calculation
 */
export interface FightAttributes {
  pace: 1 | 2 | 3 | 4 | 5                // 1=Stalemate, 5=War
  finishDanger: 1 | 2 | 3 | 4 | 5        // Risk of finish
  technicality: 1 | 2 | 3 | 4 | 5        // Strategic complexity
  styleClash: StyleClash                  // How styles interact
  brawlPotential: boolean                 // Will they stand and trade?
  groundBattleLikely: boolean             // Will it go to the mat?
}

/**
 * Prediction breakdown with reasoning
 */
export interface PredictionReasoning {
  vulnerabilityAnalysis: string    // Step 1: Defense analysis
  offenseAnalysis: string          // Step 2: Finish capability
  styleMatchup: string             // Step 3: How styles interact
  finalAssessment: string          // Step 4: Synthesis
}

/**
 * Complete output from unified prediction
 * Scores are NOT included - they're calculated deterministically
 *
 * NOTE: We do NOT predict winner or method - only finish probability and fun score.
 * This keeps the prediction focused on entertainment value rather than outcome betting.
 *
 * IMPORTANT: Field order matches JSON output (reasoning first for Chain-of-Thought)
 */
export interface FightSimulationOutput {
  reasoning: PredictionReasoning  // Step-by-step analysis (FIRST - CoT principle)
  finishAnalysis: string          // Concise 1-2 sentence: WHY this fight will/won't be a finish
  funAnalysis: string             // Concise 1-2 sentence: WHY this fight will/won't be entertaining
  narrative: string               // 3-4 sentence fight story
  attributes: FightAttributes     // Qualitative ratings
  keyFactors: string[]            // 3-5 key factors (2-3 words each)
  confidence: number              // 0-1 confidence in the analysis
}

/**
 * Classify fighter style based on statistics
 */
export function classifyFighterStyle(fighter: {
  significantStrikesLandedPerMinute: number
  takedownAverage: number
  submissionAverage: number
}): FighterStyle {
  const { significantStrikesLandedPerMinute, takedownAverage, submissionAverage } = fighter

  const HIGH_STRIKES = 4.5
  const HIGH_TAKEDOWNS = 2.0
  const HIGH_SUBS = 1.0

  const isStriker = significantStrikesLandedPerMinute >= HIGH_STRIKES
  const isWrestler = takedownAverage >= HIGH_TAKEDOWNS && submissionAverage < HIGH_SUBS
  const isGrappler = submissionAverage >= HIGH_SUBS

  if (isGrappler) return 'grappler'
  if (isWrestler) return 'wrestler'
  if (isStriker) return 'striker'
  return 'balanced'
}

/**
 * Build the unified prediction prompt
 *
 * Uses multi-persona Chain-of-Simulation approach:
 * 1. The Statistician - analyzes pure numbers
 * 2. The Tape Watcher - analyzes fighting habits/tendencies
 * 3. The Synthesizer - reconciles both views
 */
export function buildUnifiedPredictionPrompt(input: UnifiedPredictionInput): string {
  const { fighter1, fighter2, context } = input
  const weightClassRates = getWeightClassRates(context.weightClass)

  // Calculate dynamic probability anchors from weight class baseline
  // These provide calibrated reference points for this specific weight class
  const baselinePercent = (weightClassRates.finishRate * 100).toFixed(0)
  const lowFinishRate = (weightClassRates.finishRate * 0.3 * 100).toFixed(0)
  const belowAvgFinishRate = (weightClassRates.finishRate * 0.6 * 100).toFixed(0)
  const aboveAvgFinishRate = Math.min(85, weightClassRates.finishRate * 1.3 * 100).toFixed(0)
  const highFinishRate = Math.min(95, weightClassRates.finishRate * 1.6 * 100).toFixed(0)

  // Calculate derived stats
  const f1DecisionRate = fighter1.totalWins > 0
    ? ((fighter1.winsByDecision / fighter1.totalWins) * 100).toFixed(1)
    : '0.0'
  const f2DecisionRate = fighter2.totalWins > 0
    ? ((fighter2.winsByDecision / fighter2.totalWins) * 100).toFixed(1)
    : '0.0'
  const combinedStrikeRate = fighter1.significantStrikesLandedPerMinute + fighter2.significantStrikesLandedPerMinute
  const avgFinishRate = ((fighter1.finishRate + fighter2.finishRate) / 2) * 100

  // Build context section
  const contextSection = buildContextSection(context)
  const recentContextSection = buildRecentContextSection(fighter1, fighter2)

  return `You are an elite MMA analyst who predicts fights by simulating how they will unfold. You will analyze this matchup using THREE distinct perspectives, then synthesize them into a unified prediction.

═══════════════════════════════════════════════════════════════════
EVENT: ${context.eventName}
WEIGHT CLASS: ${context.weightClass} (Baseline finish rate: ${(weightClassRates.finishRate * 100).toFixed(1)}%)
${contextSection}
═══════════════════════════════════════════════════════════════════

FIGHTER 1: ${fighter1.name} (${fighter1.record}) - ${fighter1.primaryStyle.toUpperCase()}
┌─────────────────────────────────────────────────────────────────┐
│ DEFENSE                                                          │
│ • Strikes Absorbed/min: ${fighter1.significantStrikesAbsorbedPerMinute.toFixed(2)} | Defense: ${(fighter1.strikingDefensePercentage * 100).toFixed(1)}%
│ • Takedown Defense: ${(fighter1.takedownDefensePercentage * 100).toFixed(1)}%
│ • UFC Loss Finish Rate: ${(fighter1.lossFinishRate * 100).toFixed(1)}% (${(fighter1.koLossPercentage * 100).toFixed(1)}% KO, ${(fighter1.submissionLossPercentage * 100).toFixed(1)}% SUB)
│   ${fighter1.lossFinishRate >= 0.6 ? '⚠️ HIGH vulnerability' : fighter1.lossFinishRate >= 0.3 ? '⚡ Moderate vulnerability' : '🛡️ Durable'}
├─────────────────────────────────────────────────────────────────┤
│ OFFENSE                                                          │
│ • UFC Finish Rate: ${(fighter1.finishRate * 100).toFixed(1)}% (${(fighter1.koPercentage * 100).toFixed(1)}% KO, ${(fighter1.submissionPercentage * 100).toFixed(1)}% SUB)
│ • Decision Rate: ${f1DecisionRate}% of UFC wins
│ • Strikes/min: ${fighter1.significantStrikesLandedPerMinute.toFixed(2)} | TD/15min: ${fighter1.takedownAverage.toFixed(2)} | Sub Avg: ${fighter1.submissionAverage.toFixed(2)}
│ • Avg Fight Time: ${Math.floor(fighter1.averageFightTimeSeconds / 60)}:${(fighter1.averageFightTimeSeconds % 60).toString().padStart(2, '0')}
└─────────────────────────────────────────────────────────────────┘

FIGHTER 2: ${fighter2.name} (${fighter2.record}) - ${fighter2.primaryStyle.toUpperCase()}
┌─────────────────────────────────────────────────────────────────┐
│ DEFENSE                                                          │
│ • Strikes Absorbed/min: ${fighter2.significantStrikesAbsorbedPerMinute.toFixed(2)} | Defense: ${(fighter2.strikingDefensePercentage * 100).toFixed(1)}%
│ • Takedown Defense: ${(fighter2.takedownDefensePercentage * 100).toFixed(1)}%
│ • UFC Loss Finish Rate: ${(fighter2.lossFinishRate * 100).toFixed(1)}% (${(fighter2.koLossPercentage * 100).toFixed(1)}% KO, ${(fighter2.submissionLossPercentage * 100).toFixed(1)}% SUB)
│   ${fighter2.lossFinishRate >= 0.6 ? '⚠️ HIGH vulnerability' : fighter2.lossFinishRate >= 0.3 ? '⚡ Moderate vulnerability' : '🛡️ Durable'}
├─────────────────────────────────────────────────────────────────┤
│ OFFENSE                                                          │
│ • UFC Finish Rate: ${(fighter2.finishRate * 100).toFixed(1)}% (${(fighter2.koPercentage * 100).toFixed(1)}% KO, ${(fighter2.submissionPercentage * 100).toFixed(1)}% SUB)
│ • Decision Rate: ${f2DecisionRate}% of UFC wins
│ • Strikes/min: ${fighter2.significantStrikesLandedPerMinute.toFixed(2)} | TD/15min: ${fighter2.takedownAverage.toFixed(2)} | Sub Avg: ${fighter2.submissionAverage.toFixed(2)}
│ • Avg Fight Time: ${Math.floor(fighter2.averageFightTimeSeconds / 60)}:${(fighter2.averageFightTimeSeconds % 60).toString().padStart(2, '0')}
└─────────────────────────────────────────────────────────────────┘

MATCHUP SUMMARY:
• Combined strikes/min: ${combinedStrikeRate.toFixed(1)} ${combinedStrikeRate >= 10 ? '(ELITE pace)' : combinedStrikeRate >= 7 ? '(High pace)' : ''}
• Combined UFC finish rate: ${avgFinishRate.toFixed(1)}%
• Style matchup: ${fighter1.primaryStyle.toUpperCase()} vs ${fighter2.primaryStyle.toUpperCase()}
${recentContextSection}

═══════════════════════════════════════════════════════════════════
MULTI-PERSONA ANALYSIS FRAMEWORK
═══════════════════════════════════════════════════════════════════

Analyze this fight from THREE perspectives, then synthesize:

**PERSONA 1: THE STATISTICIAN**
Focus purely on the numbers. Calculate vulnerability vs offense matchups.
- If Fighter A has high KO loss rate AND Fighter B has high KO rate = high finish danger
- Compare decision rates to assess likelihood of going the distance
- Use the ${(weightClassRates.finishRate * 100).toFixed(1)}% weight class baseline as your anchor

**PERSONA 2: THE TAPE WATCHER**
Think about fighting habits, tendencies, and intangibles.
- How do these styles interact? (striker vs wrestler = chess match, striker vs striker = war)
- What patterns emerge? (forward pressure vs counter striker, etc.)
- Consider cardio, chin reputation, fight IQ indicators

**PERSONA 3: THE SYNTHESIZER**
Reconcile both views into final qualitative ratings.
- Where do Statistician and Tape Watcher agree? (high confidence)
- Where do they disagree? (flag as uncertainty)
- Produce final attribute ratings

═══════════════════════════════════════════════════════════════════
ATTRIBUTE RATING GUIDE (Use these scales)
═══════════════════════════════════════════════════════════════════

**pace** (Action Level):
1 = Stalemate/Clinch fest - low output, clinch heavy
2 = Technical/Measured - patient, selective striking
3 = Average - typical UFC pacing
4 = High tempo - consistent pressure, volume striking
5 = War/Brawl - phone booth fighting, constant exchanges

**finishDanger** (Risk of Stoppage) - CALIBRATED FOR ${context.weightClass.toUpperCase()}:
1 = Very Low (~${lowFinishRate}% finish rate) - both durable + low finish rates, likely to see the judges
2 = Below Average (~${belowAvgFinishRate}% finish rate) - one factor (durability OR finish rate) missing
3 = Average (~${baselinePercent}% finish rate) - ${context.weightClass} baseline, typical for this division
4 = Above Average (~${aboveAvgFinishRate}% finish rate) - at least one dangerous finisher OR vulnerable chin
5 = Very High (~${highFinishRate}% finish rate) - dangerous finisher vs vulnerable opponent, expect stoppage

**technicality** (Strategic Complexity):
1 = Pure chaos/brawl - no game planning matters
2 = Simple dynamics - clear offensive vs defensive roles
3 = Moderate - some adjustments expected
4 = Technical battle - positional chess, adaptations matter
5 = High-level chess - elite skill vs elite skill

**styleClash**:
• "Complementary" = Styles create action (striker vs striker, grappler vs grappler)
• "Neutral" = Mixed dynamics, could go either way
• "Canceling" = Styles nullify each other (wrestler vs wrestler stalling, elite TDD vs wrestler)

**brawlPotential**: true if both fighters willing to stand and trade (strikers, brawlers)
**groundBattleLikely**: true if grappling exchange expected (wrestlers, BJJ specialists)
${buildFewShotExamplesSection(false)}
═══════════════════════════════════════════════════════════════════
OUTPUT FORMAT (JSON only, no markdown)
═══════════════════════════════════════════════════════════════════

IMPORTANT: We are NOT predicting who will win. We are only predicting:
1. How likely is a FINISH (stoppage vs decision)?
2. How ENTERTAINING will the fight be?

{
  "reasoning": {
    "vulnerabilityAnalysis": "<Statistician view: 2-3 sentences on defensive capabilities and vulnerability to finishes>",
    "offenseAnalysis": "<Statistician view: 2-3 sentences on finish capabilities and offensive threats>",
    "styleMatchup": "<Tape Watcher view: 2-3 sentences on how styles interact and create action/entertainment>",
    "finalAssessment": "<Synthesizer view: 2-3 sentences on overall finish likelihood and entertainment value>"
  },
  "finishAnalysis": "<1-2 sentences: WHY this fight will/won't be a finish. MUST name fighters and cite specific stats (e.g., '[Name]'s 65% KO rate meets [Name]'s 40% KO loss vulnerability').>",
  "funAnalysis": "<1-2 sentences: WHY this fight will/won't be entertaining. MUST name fighters and their specific styles (e.g., '[Name]'s pressure striking against [Name]'s counter game').>",
  "narrative": "<3-4 sentence fight simulation - HOW might this fight unfold? Focus on the action and entertainment value, not who wins>",
  "attributes": {
    "pace": <1-5>,
    "finishDanger": <1-5>,
    "technicality": <1-5>,
    "styleClash": "<Complementary|Neutral|Canceling>",
    "brawlPotential": <true|false>,
    "groundBattleLikely": <true|false>
  },
  "keyFactors": ["<factor 1>", "<factor 2>", "<factor 3>"],
  "confidence": <0.0-1.0>
}

IMPORTANT GUIDELINES:
1. All percentage stats are UFC-only. Always specify "UFC" when citing them.
2. The narrative should paint a vivid picture of HOW the fight could unfold - focus on action, not outcome.
3. keyFactors should be 2-3 words each (e.g., "High KO danger", "Cardio battle", "Chin concerns"). For grappling, use specific terms: "Scramble battle" (entertaining), "Submission threat", "Ground-and-pound", "Lay and pray" (boring), "Cage grinding", "Top control".
4. Be honest about uncertainty - lower confidence if the matchup dynamics are unpredictable.
5. Attribute ratings must be internally consistent:
   - If pace is 1-2, brawlPotential should be false
   - If both fighters are wrestlers, groundBattleLikely should be true
   - High finishDanger means both fighters have finish threats OR vulnerabilities

Provide only valid JSON output.`
}

/**
 * Build context section for prompt
 */
function buildContextSection(context: UnifiedPredictionContext): string {
  const parts: string[] = []

  if (context.titleFight) parts.push('🏆 TITLE FIGHT')
  if (context.mainEvent) parts.push('🌟 MAIN EVENT')
  if (context.rivalry) parts.push('⚔️ RIVALRY')
  if (context.rematch) parts.push('🔄 REMATCH')

  if (context.rankings) {
    const r1 = context.rankings.fighter1Rank ? `#${context.rankings.fighter1Rank}` : 'Unranked'
    const r2 = context.rankings.fighter2Rank ? `#${context.rankings.fighter2Rank}` : 'Unranked'
    parts.push(`Rankings: ${r1} vs ${r2}`)
  }

  return parts.length > 0 ? parts.join(' | ') : ''
}

/**
 * Build recent context section for prompt
 */
function buildRecentContextSection(
  fighter1: UnifiedFighterStats,
  fighter2: UnifiedFighterStats
): string {
  if (!fighter1.recentContext && !fighter2.recentContext) {
    return ''
  }

  let section = '\n\nRECENT CONTEXT (From Web Search):\n'

  if (fighter1.recentContext) {
    section += `${fighter1.name}: ${fighter1.recentContext}\n`
  }
  if (fighter2.recentContext) {
    section += `${fighter2.name}: ${fighter2.recentContext}\n`
  }

  section += 'Consider recent momentum, injuries, or stylistic changes in your analysis.'

  return section
}
