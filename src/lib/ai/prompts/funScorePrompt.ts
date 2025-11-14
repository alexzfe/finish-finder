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

  // Calculate combined strike rate for context
  const combinedStrikeRate = fighter1.significantStrikesLandedPerMinute + fighter2.significantStrikesLandedPerMinute
  const avgFinishRate = ((fighter1.finishRate + fighter2.finishRate) / 2) * 100

  return `You are 'The Fight Oracle,' a world-class MMA analyst renowned for predicting a fight's entertainment value. Your task is to score this fight's excitement potential (0-100) using holistic analysis.

EVENT: ${context.eventName}
WEIGHT CLASS: ${context.weightClass}

FIGHTER 1: ${fighter1.name} (${fighter1.record}) - ${fighter1.primaryStyle.toUpperCase()}
- UFC Finish Rate: ${(fighter1.finishRate * 100).toFixed(1)}% (${(fighter1.koPercentage * 100).toFixed(1)}% KO, ${(fighter1.submissionPercentage * 100).toFixed(1)}% SUB)
- Decision Rate: ${f1DecisionRate}% of UFC wins
- Sig Strikes/min: ${fighter1.significantStrikesLandedPerMinute.toFixed(2)} | Absorbed/min: ${fighter1.significantStrikesAbsorbedPerMinute.toFixed(2)}
- Takedowns/15min: ${fighter1.takedownAverage.toFixed(2)} | Submission Attempts/15min: ${fighter1.submissionAverage.toFixed(2)}
- Avg Fight Time: ${Math.floor(fighter1.averageFightTimeSeconds / 60)}:${(fighter1.averageFightTimeSeconds % 60).toString().padStart(2, '0')}

FIGHTER 2: ${fighter2.name} (${fighter2.record}) - ${fighter2.primaryStyle.toUpperCase()}
- UFC Finish Rate: ${(fighter2.finishRate * 100).toFixed(1)}% (${(fighter2.koPercentage * 100).toFixed(1)}% KO, ${(fighter2.submissionPercentage * 100).toFixed(1)}% SUB)
- Decision Rate: ${f2DecisionRate}% of UFC wins
- Sig Strikes/min: ${fighter2.significantStrikesLandedPerMinute.toFixed(2)} | Absorbed/min: ${fighter2.significantStrikesAbsorbedPerMinute.toFixed(2)}
- Takedowns/15min: ${fighter2.takedownAverage.toFixed(2)} | Submission Attempts/15min: ${fighter2.submissionAverage.toFixed(2)}
- Avg Fight Time: ${Math.floor(fighter2.averageFightTimeSeconds / 60)}:${(fighter2.averageFightTimeSeconds % 60).toString().padStart(2, '0')}
${contextSection}
${recentContextSection}

═══════════════════════════════════════════════════════════════════
SCORING PHILOSOPHY - USE THE FULL 0-100 SCALE
═══════════════════════════════════════════════════════════════════

**90-100 (Legendary):** All-time classic potential. Elite finishers, high stakes, compelling narrative.
  Examples: Gaethje vs Chandler, Lawler vs MacDonald II, Holloway vs Poirier 2

**80-89 (Certified Banger):** High finish probability or guaranteed war. Explosive styles, dangerous strikers/finishers.
  Examples: Prime McGregor fights, Derrick Lewis vs anyone, striker vs striker with 60%+ finish rates

**60-79 (Very Promising):** Solid entertainment value. Most good, fan-friendly fights fall here.
  Examples: Ranked contender fights, solid finishers, action-oriented grapplers

**40-59 (Average Potential):** Could be entertaining but may be technical/strategic. Missing key excitement ingredients.

**0-39 (Low Potential):** Likely slow, grinding, or low-action. Risk-averse styles, heavy wrestlers.

═══════════════════════════════════════════════════════════════════
KEY FACTORS - SYNTHESIZE, DON'T CHECKLIST
═══════════════════════════════════════════════════════════════════

Identify the 2-3 MOST IMPORTANT factors that define THIS specific matchup:

1. **FINISHING POTENTIAL** (Most Important)
   - Combined UFC finish rate: ${avgFinishRate.toFixed(1)}%
   - GUIDELINES: 60%+ = Elite finishers (18-20pts), 40-59% = Solid (12-15pts), <30% = Decision-prone (5-8pts)
   - Consider KO power, submission threats, killer instinct
   - NOTE: All finish rates are UFC-only statistics, not career totals

2. **PACE & PRESSURE** (Only mention if exceptional!)
   - Combined strikes/min: ${combinedStrikeRate.toFixed(1)}
   - CRITICAL INSTRUCTION: DO NOT mention pace unless it's truly remarkable:
     * Elite (10.0+): Holloway/Kattar level - MUST highlight this
     * High (7.0-9.9): Worth mentioning if paired with finish threat
     * Average (5.0-6.9): DO NOT MENTION - find something more interesting
     * Low (<5.0): Only mention to explain low score
   - Consider aggression, forward pressure, willingness to brawl

3. **CLASH OF STYLES**
   - ${fighter1.primaryStyle} vs ${fighter2.primaryStyle}
   - GUIDELINES:
     * Striker vs Striker (especially brawlers): 18-20pts - Guaranteed action
     * Dynamic well-rounded fighters: 15-18pts
     * Striker vs Grappler: 12-15pts - Intriguing chess match
     * Wrestler vs Wrestler: 8-12pts - Can stall out
     * Defensive grapplers: 5-8pts - Control-heavy

4. **DURABILITY & HEART** (The "X-Factor")
   - High absorbed strikes + willingness to brawl = Likely to be a war
   - Known for comebacks, legendary chins, never-say-die attitude?
   - This is a NARRATIVE element - use it to make analysis interesting!

5. **CONTEXT & STAKES**
   - Title fight: +5pts, Main event: +2pts, Rivalry: +3pts, Top-15 matchup: +2pts
   - ${context.titleFight ? '🏆 TITLE FIGHT' : ''} ${context.mainEvent ? '🌟 MAIN EVENT' : ''}

═══════════════════════════════════════════════════════════════════
SCORING BREAKDOWN (For Analytics - You must populate these fields)
═══════════════════════════════════════════════════════════════════

PRIMARY (40pts max):
  paceScore (0-20): Award based on combined strike rate IF it's remarkable, otherwise base on pressure/aggression
  finishRateScore (0-20): Most important - heavily weight finish probability

SECONDARY (30pts max):
  secondaryScore: Quick finishes (+10), submission threats (+10), brawling style (+10)

STYLE (20pts max):
  styleMatchupScore: How styles interact (see guidelines above)

CONTEXT (10pts max):
  contextBonus: Stakes and narrative elements

PENALTIES (negative):
  penalties: Low action (-15), decision-heavy (-10), control-heavy wrestling (-10)

═══════════════════════════════════════════════════════════════════
REASONING INSTRUCTIONS - WRITE A PUNCHY, ENGAGING NARRATIVE
═══════════════════════════════════════════════════════════════════

Your "reasoning" field (2-3 concise sentences) must:
✓ Start with the MOST EXCITING aspect - hook the reader immediately
✓ Be direct and punchy - every word counts
✓ Only mention statistics if they're exceptional or directly drive your point
✓ Write like an expert analyst for knowledgeable fans
✓ Be specific to THIS fight - avoid generic phrases
✓ CRITICAL: When mentioning finish rates, specify "UFC" to avoid confusion (e.g., "80% UFC finish rate" not just "80% finish rate")

❌ BORING (wordy, stat-focused):
  "Both fighters average 6 strikes per minute, suggesting a high-paced fight. With finish rates around 50%, there's potential for a stoppage. The striker vs grappler dynamic could be interesting."

✅ EXCELLENT (punchy, narrative-driven):
  "Pereira's legendary knockout power (80% UFC KO rate) makes every exchange fight-ending, while Adesanya's defensive wizardry presents a legitimate puzzle. Title stakes and rivalry history elevate this from technical chess match to must-see TV."

OUTPUT (JSON only, no markdown):
{
  "funScore": <integer 0-100>,
  "confidence": <float 0-1>,
  "breakdown": {
    "paceScore": <float 0-20>,
    "finishRateScore": <float 0-20>,
    "secondaryScore": <float 0-30>,
    "styleMatchupScore": <float 0-20>,
    "contextBonus": <float 0-10>,
    "penalties": <float, negative or 0>,
    "reasoning": "<2-3 punchy sentences starting with the most exciting aspect>"
  }
}

Provide only valid JSON output.`
}
