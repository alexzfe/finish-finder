/**
 * Few-Shot Anchor Examples - Phase 1.2
 *
 * Provides reference fights spanning the entertainment spectrum
 * to calibrate LLM predictions through anchoring bias.
 *
 * These examples help the model understand what different
 * attribute ratings look like in practice.
 */

import type { FightAttributes, StyleClash } from './unifiedPredictionPrompt'

/**
 * Anchor example structure
 */
export interface AnchorExample {
  /** Fight identifier */
  fight: string
  /** Event name */
  event: string
  /** Brief description of why this is a good anchor */
  description: string
  /** The attributes this fight exemplifies */
  attributes: FightAttributes
  /** Key factors that drove the entertainment value */
  keyFactors: string[]
  /** Actual outcome (for context) */
  outcome: {
    method: 'KO' | 'TKO' | 'SUB' | 'DEC'
    round: number
    fightOfTheNight: boolean
  }
}

/**
 * High entertainment anchors (scores 85-100)
 * Reference: These fights are considered legendary/certified bangers
 */
export const HIGH_ENTERTAINMENT_ANCHORS: AnchorExample[] = [
  {
    fight: 'Justin Gaethje vs Michael Chandler',
    event: 'UFC 268',
    description: 'Quintessential brawl - both fighters known for violence, delivered FOTY',
    attributes: {
      pace: 5,
      finishDanger: 5,
      technicality: 2,
      styleClash: 'Complementary' as StyleClash,
      brawlPotential: true,
      groundBattleLikely: false,
    },
    keyFactors: ['Elite KO power', 'Forward pressure', 'Iron chins tested'],
    outcome: { method: 'TKO', round: 1, fightOfTheNight: true },
  },
  {
    fight: 'Dustin Poirier vs Max Holloway 2',
    event: 'UFC 236',
    description: 'Elite volume strikers in 5-round war, incredible pace throughout',
    attributes: {
      pace: 5,
      finishDanger: 4,
      technicality: 4,
      styleClash: 'Complementary' as StyleClash,
      brawlPotential: true,
      groundBattleLikely: false,
    },
    keyFactors: ['Volume striking', 'Championship rounds', 'Elite cardio'],
    outcome: { method: 'DEC', round: 5, fightOfTheNight: true },
  },
]

/**
 * Medium entertainment anchors (scores 55-75)
 * Reference: Competitive fights with some action but not elite
 */
export const MEDIUM_ENTERTAINMENT_ANCHORS: AnchorExample[] = [
  {
    fight: 'Sean Strickland vs Israel Adesanya',
    event: 'UFC 293',
    description: 'Technical striker vs counter striker - measured pace, strategic fight',
    attributes: {
      pace: 3,
      finishDanger: 3,
      technicality: 4,
      styleClash: 'Neutral' as StyleClash,
      brawlPotential: false,
      groundBattleLikely: false,
    },
    keyFactors: ['Range management', 'Counter striking', 'Low output'],
    outcome: { method: 'DEC', round: 5, fightOfTheNight: false },
  },
  {
    fight: 'Belal Muhammad vs Leon Edwards 2',
    event: 'UFC 304',
    description: 'Wrestler vs striker - competitive grappling exchanges, moderate action',
    attributes: {
      pace: 3,
      finishDanger: 2,
      technicality: 4,
      styleClash: 'Neutral' as StyleClash,
      brawlPotential: false,
      groundBattleLikely: true,
    },
    keyFactors: ['Cage grinding', 'Takedown battles', 'Cardio test'],
    outcome: { method: 'DEC', round: 5, fightOfTheNight: false },
  },
]

/**
 * Low entertainment anchors (scores 0-45)
 * Reference: Fights that are typically boring or one-sided
 */
export const LOW_ENTERTAINMENT_ANCHORS: AnchorExample[] = [
  {
    fight: 'Jake Shields vs Demian Maia',
    event: 'UFC Fight Night 29',
    description: 'Two grapplers canceling each other out - minimal striking, grappling stalemates',
    attributes: {
      pace: 1,
      finishDanger: 1,
      technicality: 3,
      styleClash: 'Canceling' as StyleClash,
      brawlPotential: false,
      groundBattleLikely: true,
    },
    keyFactors: ['Lay and pray', 'Low output', 'Position stalemate'],
    outcome: { method: 'DEC', round: 3, fightOfTheNight: false },
  },
  {
    fight: 'Amir Albazi vs Kai Kara-France',
    event: 'UFC 284',
    description: 'Dominant control-focused grappling, limited damage, grinding pace',
    attributes: {
      pace: 2,
      finishDanger: 2,
      technicality: 3,
      styleClash: 'Canceling' as StyleClash,
      brawlPotential: false,
      groundBattleLikely: true,
    },
    keyFactors: ['Smothering control', 'Limited damage', 'No scrambles'],
    outcome: { method: 'DEC', round: 3, fightOfTheNight: false },
  },
]

/**
 * Build few-shot examples section for prompt
 *
 * @param includeAll - Whether to include all examples (true) or just key anchors (false)
 * @returns Formatted string for inclusion in prompt
 */
export function buildFewShotExamplesSection(includeAll: boolean = false): string {
  const examples: AnchorExample[] = includeAll
    ? [...HIGH_ENTERTAINMENT_ANCHORS, ...MEDIUM_ENTERTAINMENT_ANCHORS, ...LOW_ENTERTAINMENT_ANCHORS]
    : [HIGH_ENTERTAINMENT_ANCHORS[0], MEDIUM_ENTERTAINMENT_ANCHORS[0], LOW_ENTERTAINMENT_ANCHORS[0]]

  const lines: string[] = [
    '',
    '═══════════════════════════════════════════════════════════════════',
    'CALIBRATION ANCHORS (Reference fights for attribute ratings)',
    '═══════════════════════════════════════════════════════════════════',
    '',
  ]

  for (const example of examples) {
    const tierLabel = HIGH_ENTERTAINMENT_ANCHORS.includes(example)
      ? '🔥 HIGH ENTERTAINMENT'
      : MEDIUM_ENTERTAINMENT_ANCHORS.includes(example)
        ? '⚖️ MEDIUM ENTERTAINMENT'
        : '❄️ LOW ENTERTAINMENT'

    lines.push(`${tierLabel}: ${example.fight}`)
    lines.push(`  Attributes: pace=${example.attributes.pace}, finishDanger=${example.attributes.finishDanger}, ` +
      `technicality=${example.attributes.technicality}, styleClash=${example.attributes.styleClash}`)
    lines.push(`  brawlPotential=${example.attributes.brawlPotential}, groundBattleLikely=${example.attributes.groundBattleLikely}`)
    lines.push(`  Key factors: ${example.keyFactors.join(', ')}`)
    lines.push(`  Outcome: ${example.outcome.method} R${example.outcome.round}${example.outcome.fightOfTheNight ? ' (FOTN)' : ''}`)
    lines.push('')
  }

  lines.push('Use these as reference points when rating the current matchup.')
  lines.push('')

  return lines.join('\n')
}

/**
 * Get anchor examples for a specific tier
 */
export function getAnchorsByTier(tier: 'high' | 'medium' | 'low'): AnchorExample[] {
  switch (tier) {
    case 'high':
      return HIGH_ENTERTAINMENT_ANCHORS
    case 'medium':
      return MEDIUM_ENTERTAINMENT_ANCHORS
    case 'low':
      return LOW_ENTERTAINMENT_ANCHORS
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DSPy-Optimized Few-Shot Examples
// Generated from 240 real 2024 UFC fights via DSPy BootstrapFewShot
// ═══════════════════════════════════════════════════════════════════════════

/**
 * DSPy-optimized finish probability example
 */
export interface DSPyFinishExample {
  fighter1: string
  fighter2: string
  weightClass: string
  reasoning: string
  finishProbability: number
  actualFinish: boolean
}

/**
 * DSPy-optimized fun score example
 */
export interface DSPyFunExample {
  fighter1: string
  fighter2: string
  weightClass: string
  reasoning: string
  funScore: number
  actualFinish: boolean
}

/**
 * Finish probability examples optimized by DSPy
 * Calibrated on 240 UFC fights from Jan-May + Dec 2024
 */
export const DSPY_FINISH_EXAMPLES: DSPyFinishExample[] = [
  {
    fighter1: 'Yair Rodriguez (11-4-0)',
    fighter2: 'Brian Ortega (8-5-0)',
    weightClass: 'Featherweight',
    reasoning: `1) **Defensive comparison**: Yair Rodriguez has demonstrated solid defensive skills, utilizing his reach and movement effectively to evade strikes. Brian Ortega, while known for his durability, has also absorbed significant damage in his fights, which raises concerns about his ability to withstand high-volume striking.

2) **Offensive finish rates**: Rodriguez has a higher finish rate in his victories, with several wins coming by way of KO/TKO, showcasing his striking power. Ortega, primarily a submission specialist, has fewer overall finishes compared to Rodriguez.

3) **Weight class adjustment**: In the Featherweight division, fighters tend to be quicker and more agile, which can lead to higher finish rates due to the speed of exchanges.

4) **Final assessment**: Given Rodriguez's striking ability and Ortega's defensive vulnerabilities, there is a higher likelihood of a finish in this matchup.`,
    finishProbability: 0.65,
    actualFinish: true,
  },
  {
    fighter1: 'Charles Jourdain (17-8-1)',
    fighter2: 'Sean Woodson (7-2-1)',
    weightClass: 'Featherweight',
    reasoning: `1) **Defensive comparison**: Charles Jourdain has shown a balanced approach with good defensive skills using movement and striking. Sean Woodson has a notable reach advantage but has been vulnerable to aggressive fighters who can close the gap.

2) **Offensive finish rates**: Jourdain has a higher finish rate with a mix of knockouts and submissions. Woodson has primarily won by decision, indicating he may not actively seek finishes.

3) **Weight class adjustment**: In the Featherweight division, fighters are typically quicker and more agile, which can lead to higher finish rates.

4) **Final assessment**: Given Jourdain's higher finish rate and aggressive style, combined with Woodson's defensive vulnerabilities, there is a reasonable likelihood of a finish.`,
    finishProbability: 0.65,
    actualFinish: false,
  },
  {
    fighter1: 'Kurt Holobaugh (2-7-0)',
    fighter2: 'Trey Ogden (3-3-0)',
    weightClass: 'Lightweight',
    reasoning: `1) **Defensive comparison**: Kurt Holobaugh has a record of 2-7-0, indicating he has been finished multiple times, raising concerns about his defensive capabilities. Trey Ogden at 3-3-0 shows similar vulnerabilities.

2) **Offensive finish rates**: Holobaugh has only managed 2 wins with inconsistent finishes. Ogden has 3 wins also with mixed finishes. Both have struggled to secure finishes consistently.

3) **Weight class adjustment**: In the lightweight division, fighters possess speed and power that can lead to higher finish rates, but given both fighters' records, they may not capitalize on this.

4) **Final assessment**: Given both fighters' potential to be finished but overall low finishing rates, there is only a moderate likelihood of a finish.`,
    finishProbability: 0.45,
    actualFinish: false,
  },
]

/**
 * Fun score examples optimized by DSPy
 * Calibrated on 240 UFC fights from Jan-May + Dec 2024
 */
export const DSPY_FUN_EXAMPLES: DSPyFunExample[] = [
  {
    fighter1: 'Yair Rodriguez (11-4-0)',
    fighter2: 'Brian Ortega (8-5-0)',
    weightClass: 'Featherweight',
    reasoning: `This highly anticipated Featherweight bout showcases contrasting styles that could lead to an action-packed fight. Rodriguez is renowned for his striking prowess, creativity, and ability to finish fights, while Ortega is a submission specialist with a strong grappling game. The clash of Rodriguez's dynamic striking against Ortega's grappling creates a compelling narrative. Both fighters have shown a willingness to engage in high-paced exchanges, and the stakes are significant as they look to solidify positions in the competitive featherweight division. Given their finishing abilities and potential for dramatic moments, this fight is likely to deliver an exciting spectacle.`,
    funScore: 90,
    actualFinish: true,
  },
  {
    fighter1: 'Charles Jourdain (17-8-1)',
    fighter2: 'Sean Woodson (7-2-1)',
    weightClass: 'Featherweight',
    reasoning: `This featherweight bout is highly anticipated due to both fighters' striking capabilities. Jourdain is known for his aggressive striking and willingness to engage in high-paced exchanges, making him a fan favorite. Woodson brings a unique style with his long reach and technical striking, creating interesting dynamics. The potential for finishes is present, as both fighters have demonstrated knockout power. The stakes are significant as both look to climb the ranks. Given their contrasting styles—Jourdain's aggression versus Woodson's range control—this fight is likely to deliver an exciting spectacle.`,
    funScore: 80,
    actualFinish: false,
  },
  {
    fighter1: 'Kurt Holobaugh (2-7-0)',
    fighter2: 'Trey Ogden (3-3-0)',
    weightClass: 'Lightweight',
    reasoning: `This lightweight bout features two fighters with records suggesting a struggle for consistency. Holobaugh at 2-7-0 has faced significant challenges, while Ogden's 3-3-0 record indicates similar experience and inconsistency. Given their records, the fight may lack the high-level action and finishing ability typically seen in more established fighters. The stakes are relatively low, as neither fighter is in title contention, which could lead to a cautious approach. Overall, this bout may not provide the excitement or entertainment value that fans typically look for.`,
    funScore: 20,
    actualFinish: false,
  },
]

/**
 * Build DSPy few-shot section for finish probability prompts
 */
export function buildDSPyFinishExamplesSection(): string {
  const lines: string[] = [
    '',
    '═══════════════════════════════════════════════════════════════════',
    'CALIBRATED EXAMPLES (from 240 real UFC fights)',
    '═══════════════════════════════════════════════════════════════════',
    '',
  ]

  for (const example of DSPY_FINISH_EXAMPLES) {
    lines.push(`**${example.fighter1} vs ${example.fighter2}** (${example.weightClass})`)
    lines.push(`Reasoning: ${example.reasoning}`)
    lines.push(`Finish Probability: ${(example.finishProbability * 100).toFixed(0)}%`)
    lines.push(`Actual Result: ${example.actualFinish ? 'FINISH' : 'DECISION'}`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Build DSPy few-shot section for fun score prompts
 */
export function buildDSPyFunExamplesSection(): string {
  const lines: string[] = [
    '',
    '═══════════════════════════════════════════════════════════════════',
    'CALIBRATED EXAMPLES (from 240 real UFC fights)',
    '═══════════════════════════════════════════════════════════════════',
    '',
  ]

  for (const example of DSPY_FUN_EXAMPLES) {
    lines.push(`**${example.fighter1} vs ${example.fighter2}** (${example.weightClass})`)
    lines.push(`Reasoning: ${example.reasoning}`)
    lines.push(`Fun Score: ${example.funScore}`)
    lines.push(`Actual Result: ${example.actualFinish ? 'FINISH' : 'DECISION'}`)
    lines.push('')
  }

  return lines.join('\n')
}
