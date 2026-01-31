/**
 * Hybrid Judgment Prediction Prompt
 * 
 * NEW APPROACH:
 * - Finish Probability: Deterministic (calculated from qualitative attributes)
 * - Fun Score: AI Judgment (direct 0-100 score based on all context)
 * 
 * This gives the AI freedom to judge entertainment value holistically
 * while keeping finish probability mathematically grounded.
 */

import { getWeightClassRates } from './weightClassRates'
import type { FighterEntertainmentContext } from '../schemas/fighterEntertainmentProfile'

export type FighterStyle = 'striker' | 'wrestler' | 'grappler' | 'balanced'

export interface JudgmentFighterStats {
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
  entertainmentProfile?: FighterEntertainmentContext
}

export interface JudgmentPredictionContext {
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

export interface JudgmentPredictionInput {
  fighter1: JudgmentFighterStats
  fighter2: JudgmentFighterStats
  context: JudgmentPredictionContext
}

/**
 * Qualitative attributes for finish probability calculation
 */
export interface FightAttributes {
  pace: 1 | 2 | 3 | 4 | 5                // 1=Stalemate, 5=War
  finishDanger: 1 | 2 | 3 | 4 | 5        // Risk of stoppage
  technicality: 1 | 2 | 3 | 4 | 5        // Strategic complexity
  styleClash: 'Complementary' | 'Neutral' | 'Canceling'
  brawlPotential: boolean
  groundBattleLikely: boolean
}

/**
 * AI Judgment Output - Now includes direct fun score
 */
export interface JudgmentPredictionOutput {
  // Chain-of-thought reasoning
  reasoning: {
    vulnerabilityAnalysis: string    // Statistician view
    offenseAnalysis: string          // Statistician view  
    styleMatchup: string             // Tape Watcher view
    entertainmentJudgment: string    // AI's holistic entertainment assessment
  }
  
  // Concise analysis
  finishAnalysis: string             // 1-2 sentences on finish likelihood
  funAnalysis: string                // 1-2 sentences on entertainment value
  narrative: string                  // 3-4 sentence fight story
  
  // Attributes for deterministic finish probability
  attributes: FightAttributes
  
  // AI JUDGMENT: Direct fun score (0-100)
  // The AI evaluates ALL factors and assigns a holistic score
  funScore: number
  
  // Key factors
  keyFactors: string[]
  
  // Confidence in this analysis
  confidence: number
}

/**
 * Classify fighter style
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
 * Build the hybrid judgment prediction prompt
 * 
 * Key difference: AI directly outputs funScore (0-100) instead of attributes
 */
export function buildJudgmentPredictionPrompt(input: JudgmentPredictionInput): string {
  const { fighter1, fighter2, context } = input
  const weightClassRates = getWeightClassRates(context.weightClass)

  // Calculate dynamic probability anchors
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

  // Build context sections
  const contextSection = buildContextSection(context)
  const recentContextSection = buildRecentContextSection(fighter1, fighter2)
  const entertainmentProfileSection = buildEntertainmentProfileSection(fighter1, fighter2)

  return `You are an elite MMA analyst predicting fight entertainment value. You have access to comprehensive fighter data, statistics, and qualitative profiles.

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
• Combined UFC finish rate: ${(((fighter1.finishRate + fighter2.finishRate) / 2) * 100).toFixed(1)}%
• Style matchup: ${fighter1.primaryStyle.toUpperCase()} vs ${fighter2.primaryStyle.toUpperCase()}
${recentContextSection}${entertainmentProfileSection}

═══════════════════════════════════════════════════════════════════
YOUR TASK: Analyze this fight from TWO perspectives
═══════════════════════════════════════════════════════════════════

**PART 1: FINISH PROBABILITY ANALYSIS (for deterministic calculation)**

Rate these attributes objectively based on the data:

**pace** (Action Level - be honest):
1 = Stalemate/Clinch fest - low output, clinch heavy
2 = Technical/Measured - patient, selective striking
3 = Average - typical UFC pacing
4 = High tempo - consistent pressure, volume striking
5 = War/Brawl - phone booth fighting, constant exchanges

**finishDanger** (Risk of Stoppage) - CALIBRATED FOR ${context.weightClass.toUpperCase()}:
1 = Very Low (~${lowFinishRate}%) - both durable + low finish rates
2 = Below Average (~${belowAvgFinishRate}%) - one factor missing
3 = Average (~${baselinePercent}%) - ${context.weightClass} baseline
4 = Above Average (~${aboveAvgFinishRate}%) - dangerous finisher OR vulnerable
5 = Very High (~${highFinishRate}%) - finisher vs vulnerable opponent

**technicality** (Strategic Complexity):
1 = Pure chaos/brawl
2 = Simple dynamics
3 = Moderate - some adjustments
4 = Technical battle - positional chess
5 = High-level chess - elite skill vs elite skill

**styleClash**: Complementary (creates action) | Neutral | Canceling (nullifies)
**brawlPotential**: true if both willing to stand and trade
**groundBattleLikely**: true if grappling exchange expected

---

**PART 2: FUN SCORE JUDGMENT (Your Holistic Assessment)**

Based on ALL available information, assign a **funScore** from 0-100.

This is YOUR judgment as an MMA expert. Consider:
- Statistical factors (finish rates, pace, volume)
- Stylistic matchup (striker wars, grappling chess, canceling styles)
- Entertainment profiles (if available): archetypes, mentality, bonus history
- Recent context: momentum, injuries, stylistic changes
- Fight context: title fight stakes, rivalry, main event pressure
- Intangibles: known for wars, chin reputation, cardio concerns

FUN SCORE RUBRIC (use the full range):
• 90-100 = Legendary potential - must-watch, all-time classic material
• 80-89  = Certified banger - highly likely to deliver action
• 70-79  = Very promising - solid entertainment expected
• 60-69  = Above average - should be enjoyable
• 50-59  = Average - typical UFC fight, may surprise
• 40-49  = Below average - concerns about excitement
• 30-39  = Low potential - likely to underwhelm
• 20-29  = Very low - significant boring risk
• 0-19   = Avoid - lay-and-pray or stall-fest likely

Be honest. Use the full scale. A grindfest between two wrestlers might be 25.
A striker war between two knockout artists might be 85.

═══════════════════════════════════════════════════════════════════
OUTPUT FORMAT (JSON only, no markdown)
═══════════════════════════════════════════════════════════════════

{
  "reasoning": {
    "vulnerabilityAnalysis": "<Statistician: 2-3 sentences on defensive vulnerabilities and finish susceptibility>",
    "offenseAnalysis": "<Statistician: 2-3 sentences on finish capabilities and offensive threats>",
    "styleMatchup": "<Tape Watcher: 2-3 sentences on how styles interact for entertainment>",
    "entertainmentJudgment": "<Your holistic assessment: what makes this fight exciting or boring? Consider stats, profiles, context, intangibles>"
  },
  "finishAnalysis": "<1-2 sentences: WHY this fight will/won't finish. Cite specific stats>",
  "funAnalysis": "<1-2 sentences: WHY this fight is/isn't entertaining. Cite styles, profiles, or intangibles>",
  "narrative": "<3-4 sentence fight simulation - focus on action, not outcome>",
  "attributes": {
    "pace": <1-5>,
    "finishDanger": <1-5>,
    "technicality": <1-5>,
    "styleClash": "<Complementary|Neutral|Canceling>",
    "brawlPotential": <true|false>,
    "groundBattleLikely": <true|false>
  },
  "funScore": <0-100>,
  "keyFactors": ["<factor 1>", "<factor 2>", "<factor 3>"],
  "confidence": <0.0-1.0>
}

IMPORTANT:
1. funScore is YOUR judgment based on ALL context. Be decisive.
2. Attributes are objective ratings for finish probability calculation.
3. Consider entertainment profiles heavily if available - they reveal fighter mentality.
4. Be willing to use extreme scores (0-20 or 80-100) when warranted.
5. Confidence should reflect uncertainty in your analysis, not the funScore value.

Provide only valid JSON output.`
}

// Helper functions (same as unified prompt)
function buildContextSection(context: JudgmentPredictionContext): string {
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

function buildRecentContextSection(
  fighter1: JudgmentFighterStats,
  fighter2: JudgmentFighterStats
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

function formatEntertainmentProfile(
  profile: FighterEntertainmentContext,
  fighterName: string
): string {
  const archetypeLabel = profile.primary_archetype.replace(/_/g, ' ')
  const secondaryLabel = profile.secondary_archetype
    ? ` / ${profile.secondary_archetype.replace(/_/g, ' ')}`
    : ''
  const mentalityLabel = profile.mentality.replace(/_/g, ' ')

  const bonuses = profile.bonus_history
  const bonusText =
    bonuses.total_bonuses > 0
      ? `${bonuses.total_bonuses} bonuses (${bonuses.fotn_count} FOTN, ${bonuses.potn_count} POTN)`
      : 'No recorded bonuses'

  const tags = profile.reputation_tags.slice(0, 5).join(', ')

  return `${fighterName}:
  • Archetype: ${archetypeLabel}${secondaryLabel} (${profile.archetype_confidence}% confidence)
  • Mentality: ${mentalityLabel} (${profile.mentality_confidence}% confidence)
  • Entertainment Prediction: ${profile.entertainment_prediction.toUpperCase()}
  • Bonus History: ${bonusText}
  • Reputation: ${tags || 'Unknown'}`
}

function buildEntertainmentProfileSection(
  fighter1: JudgmentFighterStats,
  fighter2: JudgmentFighterStats
): string {
  if (!fighter1.entertainmentProfile && !fighter2.entertainmentProfile) {
    return ''
  }

  let section = `

═══════════════════════════════════════════════════════════════════
ENTERTAINMENT PROFILES (Critical for Fun Score Judgment)
═══════════════════════════════════════════════════════════════════

`

  if (fighter1.entertainmentProfile) {
    section += formatEntertainmentProfile(
      fighter1.entertainmentProfile,
      fighter1.name
    )
    section += '\n\n'
  }

  if (fighter2.entertainmentProfile) {
    section += formatEntertainmentProfile(
      fighter2.entertainmentProfile,
      fighter2.name
    )
    section += '\n'
  }

  section += `
⚠️ PROFILE GUIDANCE FOR FUN SCORE:
• "finisher" mentality + high bonus count = likely action fighter (+15-25 fun points)
• "coasts_with_lead" or "plays_safe" = may stall when winning (-20-30 fun points)
• "brawler" vs "brawler" = very high entertainment potential (+20-30 fun points)
• "counter_striker" vs "counter_striker" = may be slow-paced (-15-20 fun points)
• "bonus_hunter" = actively seeks finishes for extra pay (+10-15 fun points)
• Use reputation tags: "always comes forward", "iron chin", "cardio issues", etc.

These profiles are EXPERT ASSESSMENTS from web research - weight them heavily.`

  return section
}
