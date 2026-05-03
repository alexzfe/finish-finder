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
import type { FightContext, FighterSnapshot, FightSnapshot } from '../snapshot'

export type FighterStyle = 'striker' | 'wrestler' | 'grappler' | 'balanced'

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
 * Raw structured output the LLM produces for the prompt above. The Predictor
 * derives the user-facing Prediction from this.
 */
export interface JudgmentPredictionOutput {
  /** Internal qualitative ratings consumed by the deterministic finishProbability math. */
  attributes: FightAttributes
  /** AI-judged 1-10 entertainment score. */
  funScore: number
  /** 3-5 short phrases summarising what drives the fight. */
  keyFactors: string[]
  /** 0-1 confidence in the overall analysis. */
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
 * Build the hybrid judgment prediction prompt.
 *
 * Output: qualitative attributes (drive deterministic finishProbability),
 * a 1-10 funScore (direct AI judgment), keyFactors, and confidence.
 */
export function buildJudgmentPredictionPrompt(input: FightSnapshot): string {
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

IMPORTANT: You are an MMA expert with deep knowledge of UFC fighters. USE your knowledge of these fighters — their reputations, famous fights, tendencies, rivalries, training camps, and public personas — to inform your numeric ratings. Don't be timid: a known wrestler-vs-wrestler matchup deserves a low funScore even if the stats look balanced.

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

Based on ALL available information, assign a **funScore** from 1 to 10 (integer).

This is YOUR judgment as an MMA expert. Consider:
- Statistical factors (finish rates, pace, volume)
- Stylistic matchup (striker wars, grappling chess, canceling styles)
- Entertainment profiles (if available): archetypes, mentality, bonus history
- Recent context: momentum, injuries, stylistic changes
- Fight context: title fight stakes, rivalry, main event pressure
- Intangibles: known for wars, chin reputation, cardio concerns

FUN SCORE CALIBRATION (median should be ~5, use the FULL 1-10 range):
• 10 — All-time classic potential (rare; Gaethje vs Chandler, Holloway vs Kattar tier)
• 9  — Card highlight, high action guaranteed (Poirier vs Hooker tier)
• 8  — Strong matchup, likely delivers (Burns vs Chimaev tier)
• 7  — Above average, action-leaning, solid bonus candidate
• 6  — Solid but not special — typical competitive UFC fight
• 5  — Middling — could go either way, some stalling risk
• 4  — Likely underwhelming — heavy grappling, low output, or stylistic mismatch
• 3  — Probable snoozefest — lay-and-pray, point fighting, extreme skill gap
• 2  — Unwatchable — clear mismatch or known stalling specialists
• 1  — Worst-case — both fighters infamously dull, no redeeming dynamics

DISTRIBUTION GUIDE: On a typical 12-fight card, expect roughly:
  - 0-1 fights at 9-10
  - 2-3 fights at 7-8
  - 4-5 fights at 4-6
  - 1-2 fights at 1-3
If you're rating most fights ≥7, you're being too generous.

═══════════════════════════════════════════════════════════════════
OUTPUT FORMAT (JSON only, no markdown)
═══════════════════════════════════════════════════════════════════

{
  "attributes": {
    "pace": <1-5>,
    "finishDanger": <1-5>,
    "technicality": <1-5>,
    "styleClash": "<Complementary|Neutral|Canceling>",
    "brawlPotential": <true|false>,
    "groundBattleLikely": <true|false>
  },
  "funScore": <1-10>,
  "keyFactors": ["<factor 1>", "<factor 2>", "<factor 3>"],
  "confidence": <0.0-1.0>
}

CRITICAL INSTRUCTIONS:
1. funScore is YOUR expert judgment. Be decisive and USE THE FULL 1-10 RANGE.
2. Attributes are objective ratings used to compute finish probability deterministically — pick them based on the data, not on your funScore.
3. A boring fight deserves a boring score. Don't inflate scores to be nice.
4. If both fighters have high decision rates and low finish rates, score ≤ 5.
5. If styles cancel out (wrestler vs wrestler, counter-striker vs counter-striker), score 3-4.
6. Confidence (0.0-1.0) reflects uncertainty in your overall analysis, independent of the funScore value.
7. keyFactors: 3-5 short phrases such as "knockout power", "scramble heavy", "wrestling stalemate".

Provide only valid JSON output.`
}

// Helper functions (same as unified prompt)
function buildContextSection(context: FightContext): string {
  const parts: string[] = []

  if (context.titleFight) parts.push('🏆 TITLE FIGHT')
  if (context.mainEvent) parts.push('🌟 MAIN EVENT')

  return parts.length > 0 ? parts.join(' | ') : ''
}

function buildRecentContextSection(
  fighter1: FighterSnapshot,
  fighter2: FighterSnapshot
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
  fighter1: FighterSnapshot,
  fighter2: FighterSnapshot
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
PROFILE GUIDANCE (adjust fun score, don't let it dominate):
• "finisher" + bonus history → nudge up 5-10 points
• "brawler" vs "brawler" → nudge up 10-15 points
• "bonus_hunter" → nudge up 5 points
• "coasts_with_lead" or "plays_safe" → nudge down 10-20 points
• "counter_striker" vs "counter_striker" → nudge down 10-15 points
• "wrestler" vs "wrestler" with low finish rates → nudge down 15-25 points
• Use reputation tags for specificity, not just score adjustment`

  return section
}
