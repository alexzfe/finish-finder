/**
 * Fun Score Prompt Template
 *
 * Rates a fight's entertainment potential (0-100) using weighted factor analysis.
 *
 * Weighting:
 * - 40% Primary Factors (pace + finish rate)
 * - 30% Secondary Factors (strike differential, knockdowns, subs)
 * - 20% Style Matchup
 * - 10% Context Bonuses (title fight, rivalry, rankings)
 * - Negative Penalties (boring patterns)
 *
 * Temperature: 0.3 (low for consistency)
 * Output: Structured JSON with score and detailed breakdown
 */

/**
 * Fighter style classification
 */
export type FighterStyle = 'striker' | 'wrestler' | 'grappler' | 'balanced'

/**
 * Fighter statistics for entertainment prediction
 */
export interface FighterFunStats {
  name: string
  record: string

  // Pace indicators (Primary Factor - 20%)
  significantStrikesLandedPerMinute: number  // Higher = more action
  significantStrikesAbsorbedPerMinute: number // Willing to take damage to dish it out

  // Finish ability (Primary Factor - 20%)
  finishRate: number                   // % of wins by finish
  koPercentage: number                 // % of wins by KO/TKO
  submissionPercentage: number         // % of wins by submission

  // Fight averages (Secondary Factor)
  averageFightTimeSeconds: number      // Lower = quick finishes (exciting)
  winsByDecision: number               // Lower relative to wins = more exciting
  submissionAverage: number            // Submission attempts per 15 min

  // Defensive stats (for style classification)
  strikingDefensePercentage: number
  takedownAverage: number
  takedownDefensePercentage: number

  // Calculated
  totalWins: number                    // For calculating decision rate
  primaryStyle: FighterStyle           // Derived from stats

  // Optional: Recent context from web search
  recentContext?: string               // Recent news, injuries, training camp updates
}

/**
 * Fight context for entertainment factors
 */
export interface FunScoreContext {
  eventName: string
  weightClass: string
  titleFight: boolean
  mainEvent: boolean

  // Rankings (if available)
  rankings?: {
    fighter1Rank: number | null  // null if unranked
    fighter2Rank: number | null
  }

  // Optional: Rivalry/storyline information
  rivalry?: boolean
  rematch?: boolean
}

/**
 * Complete input for fun score prediction
 */
export interface FunScoreInput {
  fighter1: FighterFunStats
  fighter2: FighterFunStats
  context: FunScoreContext
}

/**
 * Breakdown of fun score by weighted factors
 */
export interface FunScoreBreakdown {
  paceScore: number              // 0-40 points
  finishRateScore: number        // 0-40 points (total primary = 80)
  secondaryScore: number         // 0-30 points
  styleMatchupScore: number      // 0-20 points
  contextBonus: number           // 0-10 points
  penalties: number              // Negative points
  reasoning: string              // Explanation of scores
}

/**
 * Structured output from fun score prediction
 */
export interface FunScoreOutput {
  funScore: number               // 0-100 (sum of all factors)
  confidence: number             // 0-1
  breakdown: FunScoreBreakdown
  keyFactors: string[]           // 4-5 concise factors (1-2 words each) like "Brawler Style", "High Pace"
}

/**
 * Classify fighter style based on statistics
 *
 * @param fighter - Fighter statistics
 * @returns Fighter style classification
 */
export function classifyFighterStyle(fighter: {
  significantStrikesLandedPerMinute: number
  takedownAverage: number
  submissionAverage: number
}): FighterStyle {
  const { significantStrikesLandedPerMinute, takedownAverage, submissionAverage } = fighter

  // Thresholds
  const HIGH_STRIKES = 4.5
  const HIGH_TAKEDOWNS = 2.0
  const HIGH_SUBS = 1.0

  const isStriker = significantStrikesLandedPerMinute >= HIGH_STRIKES
  const isWrestler = takedownAverage >= HIGH_TAKEDOWNS && submissionAverage < HIGH_SUBS
  const isGrappler = submissionAverage >= HIGH_SUBS

  // Classification logic
  if (isGrappler) return 'grappler'
  if (isWrestler) return 'wrestler'
  if (isStriker) return 'striker'
  return 'balanced'
}

/**
 * Build the Fun Score prompt using weighted factor analysis
 *
 * @param input - Fighter stats and context
 * @returns Formatted prompt string for LLM
 */
export function buildFunScorePrompt(input: FunScoreInput): string {
  const { fighter1, fighter2, context } = input

  // Calculate decision rates
  const f1DecisionRate = fighter1.totalWins > 0
    ? (fighter1.winsByDecision / fighter1.totalWins * 100).toFixed(1)
    : '0.0'
  const f2DecisionRate = fighter2.totalWins > 0
    ? (fighter2.winsByDecision / fighter2.totalWins * 100).toFixed(1)
    : '0.0'

  // Rankings section
  const rankingsSection = context.rankings
    ? `
RANKINGS:
- ${fighter1.name}: ${context.rankings.fighter1Rank ? `#${context.rankings.fighter1Rank}` : 'Unranked'}
- ${fighter2.name}: ${context.rankings.fighter2Rank ? `#${context.rankings.fighter2Rank}` : 'Unranked'}
${context.rankings.fighter1Rank && context.rankings.fighter2Rank ? '- Ranked matchup adds stakes!' : ''}`
    : ''

  // Context bonuses section
  const contextSection = `
CONTEXT BONUSES:
- Title Fight: ${context.titleFight ? 'YES (+5 points)' : 'NO'}
- Main Event: ${context.mainEvent ? 'YES (+2 points)' : 'NO'}
- Rivalry/Rematch: ${context.rivalry || context.rematch ? 'YES (+3 points)' : 'NO'}
${rankingsSection}`

  // Recent context section if available
  const recentContextSection =
    fighter1.recentContext || fighter2.recentContext
      ? `
RECENT CONTEXT (From Web Search):

${fighter1.name}:
${fighter1.recentContext || 'No recent context available.'}

${fighter2.name}:
${fighter2.recentContext || 'No recent context available.'}

Note: Consider recent momentum, injuries, or stylistic changes that could affect entertainment value.`
      : ''

  return `You are an MMA entertainment analyst. Rate this fight's excitement potential on a 0-100 scale using weighted factor analysis.

EVENT: ${context.eventName}
WEIGHT CLASS: ${context.weightClass}

FIGHTER 1: ${fighter1.name} (${fighter1.record}) - ${fighter1.primaryStyle.toUpperCase()}
Pace Metrics:
- Sig Strikes Landed per Minute: ${fighter1.significantStrikesLandedPerMinute.toFixed(2)}
- Sig Strikes Absorbed per Minute: ${fighter1.significantStrikesAbsorbedPerMinute.toFixed(2)} (willing to brawl?)

Finish Ability:
- Finish Rate: ${(fighter1.finishRate * 100).toFixed(1)}% (${(fighter1.koPercentage * 100).toFixed(1)}% KO, ${(fighter1.submissionPercentage * 100).toFixed(1)}% SUB)
- Decision Rate: ${f1DecisionRate}% of wins
- Avg Fight Time: ${Math.floor(fighter1.averageFightTimeSeconds / 60)}:${(fighter1.averageFightTimeSeconds % 60).toString().padStart(2, '0')}

Style Indicators:
- Takedowns per 15min: ${fighter1.takedownAverage.toFixed(2)}
- Submission Attempts per 15min: ${fighter1.submissionAverage.toFixed(2)}

FIGHTER 2: ${fighter2.name} (${fighter2.record}) - ${fighter2.primaryStyle.toUpperCase()}
Pace Metrics:
- Sig Strikes Landed per Minute: ${fighter2.significantStrikesLandedPerMinute.toFixed(2)}
- Sig Strikes Absorbed per Minute: ${fighter2.significantStrikesAbsorbedPerMinute.toFixed(2)} (willing to brawl?)

Finish Ability:
- Finish Rate: ${(fighter2.finishRate * 100).toFixed(1)}% (${(fighter2.koPercentage * 100).toFixed(1)}% KO, ${(fighter2.submissionPercentage * 100).toFixed(1)}% SUB)
- Decision Rate: ${f2DecisionRate}% of wins
- Avg Fight Time: ${Math.floor(fighter2.averageFightTimeSeconds / 60)}:${(fighter2.averageFightTimeSeconds % 60).toString().padStart(2, '0')}

Style Indicators:
- Takedowns per 15min: ${fighter2.takedownAverage.toFixed(2)}
- Submission Attempts per 15min: ${fighter2.submissionAverage.toFixed(2)}
${contextSection}
${recentContextSection}

SCORING FRAMEWORK:

PRIMARY FACTORS (40 points total):
1. PACE (0-20 points):
   - Average sig strikes/min of both fighters
   - 8.0+ combined = Elite (20/20)
   - 6.0-8.0 combined = Good (12-15/20)
   - <5.0 combined = Boring (5/20)

2. FINISH RATE (0-20 points):
   - Average finish rate of both fighters
   - 70%+ average = Elite (20/20)
   - 50-70% average = Good (12-15/20)
   - <30% average = Low (5/20)

SECONDARY FACTORS (30 points total):
- Low avg fight time (quick finishes) = +10
- High submission attempts = +10
- Both fighters willing to absorb strikes (brawlers) = +10

STYLE MATCHUP (20 points total):
- Striker vs Striker = High excitement (18-20/20)
- Striker vs Grappler = Good action (12-15/20)
- Wrestler vs Wrestler = Lower excitement (8/20)
- Grappler vs Grappler = Technical but slower (10/20)

CONTEXT BONUS (10 points total):
- Title fight: +5
- Main event: +2
- Ranked matchup (#15 or better): +2
- Rivalry/rematch: +3

NEGATIVE PENALTIES:
- Low pace (<4 strikes/min combined): -15
- High decision rate (>80% for both): -10
- Defensive grapplers (control heavy): -10
- Risk-averse strikers (low absorbed strikes + low output): -5

CALCULATE:
1. Add pace score (0-20) + finish rate score (0-20) = Primary (max 40)
2. Evaluate secondary factors = Secondary (max 30)
3. Score style matchup = Style (max 20)
4. Add context bonuses = Context (max 10)
5. Apply penalties = Penalties (negative)
6. Final Score = Primary + Secondary + Style + Context + Penalties (capped at 0-100)

OUTPUT (JSON only, no markdown):
{
  "funScore": <integer 0-100>,
  "confidence": <float 0-1>,
  "breakdown": {
    "paceScore": <float 0-40>,
    "finishRateScore": <float 0-40>,
    "secondaryScore": <float 0-30>,
    "styleMatchupScore": <float 0-20>,
    "contextBonus": <float 0-10>,
    "penalties": <float, negative or 0>,
    "reasoning": "<3-4 sentences>"
  }
}

IMPORTANT - ANALYSIS STYLE:
- Write conversationally with some personality, but stay professional
- Reference stats naturally in your analysis: "Both fighters average 6+ strikes per minute, which should produce a high-paced fight"
- Be engaging but credible: Blend data with readable insights
- Examples of good phrasing:
  - "Two strikers averaging 6+ significant strikes per minute suggests a high-action fight"
  - "With 70% finish rates on both sides, this fight is unlikely to go the distance"
  - "The striker vs striker matchup typically produces more consistent action than grappling-heavy fights"

IMPORTANT - TECHNICAL ACCURACY:
- Be realistic: Scores >80 should be rare (reserved for guaranteed bangers)
- Weight finish probability heavily: Decisions are less exciting
- Style matchups matter: Striker vs Striker = fireworks
- Penalties are cumulative: A boring defensive matchup should lose 15-25 points

Provide only valid JSON output.`
}
