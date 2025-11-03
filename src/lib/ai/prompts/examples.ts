/**
 * Example Usage of AI Prediction Prompts
 *
 * This file demonstrates how to use the Finish Probability and Fun Score prompts
 * with real fighter statistics from the database.
 */

import {
  buildFinishProbabilityPrompt,
  buildFunScorePrompt,
  classifyFighterStyle,
  type FighterFinishStats,
  type FighterFunStats,
  type FinishProbabilityInput,
  type FunScoreInput,
} from './index'

/**
 * Example: Generate Finish Probability prompt for a fight
 */
export function exampleFinishProbabilityPrompt() {
  // Fighter stats from database (example data)
  const fighter1: FighterFinishStats = {
    name: 'Gabriel Bonfim',
    record: '18-1-0',

    // Defensive metrics
    significantStrikesAbsorbedPerMinute: 2.85,
    strikingDefensePercentage: 0.62,
    takedownDefensePercentage: 0.75,

    // Offensive finish metrics
    finishRate: 0.667,  // 12 finishes out of 18 wins
    koPercentage: 0.333,  // 6 KOs
    submissionPercentage: 0.333,  // 6 submissions
    significantStrikesLandedPerMinute: 4.52,
    submissionAverage: 1.2,

    // Recent form
    last3Finishes: 2,
  }

  const fighter2: FighterFinishStats = {
    name: 'Randy Brown',
    record: '20-6-0',

    // Defensive metrics
    significantStrikesAbsorbedPerMinute: 3.12,
    strikingDefensePercentage: 0.58,
    takedownDefensePercentage: 0.80,

    // Offensive finish metrics
    finishRate: 0.45,  // 9 finishes out of 20 wins
    koPercentage: 0.30,  // 6 KOs
    submissionPercentage: 0.15,  // 3 submissions
    significantStrikesLandedPerMinute: 3.89,
    submissionAverage: 0.5,

    // Recent form
    last3Finishes: 1,
  }

  const input: FinishProbabilityInput = {
    fighter1,
    fighter2,
    context: {
      eventName: 'UFC Fight Night: Bonfim vs. Brown',
      weightClass: 'Welterweight',
      // Optional betting odds
      bettingOdds: {
        fighter1Odds: -145,
        fighter2Odds: +125,
        fighter1ImpliedProb: 0.592,
      },
    },
  }

  const prompt = buildFinishProbabilityPrompt(input)

  console.log('=== FINISH PROBABILITY PROMPT ===')
  console.log(prompt)
  console.log('\n')

  return prompt
}

/**
 * Example: Generate Fun Score prompt for a fight
 */
export function exampleFunScorePrompt() {
  // Fighter stats from database (example data)
  const fighter1Stats = {
    name: 'Gabriel Bonfim',
    record: '18-1-0',

    // Pace metrics
    significantStrikesLandedPerMinute: 4.52,
    significantStrikesAbsorbedPerMinute: 2.85,

    // Finish ability
    finishRate: 0.667,
    koPercentage: 0.333,
    submissionPercentage: 0.333,

    // Fight averages
    averageFightTimeSeconds: 480,  // 8 minutes average
    winsByDecision: 6,
    submissionAverage: 1.2,

    // For style classification
    strikingDefensePercentage: 0.62,
    takedownAverage: 1.5,
    takedownDefensePercentage: 0.75,

    // Calculated
    totalWins: 18,
  }

  // Classify fighter style automatically
  const fighter1: FighterFunStats = {
    ...fighter1Stats,
    primaryStyle: classifyFighterStyle(fighter1Stats),
  }

  const fighter2Stats = {
    name: 'Randy Brown',
    record: '20-6-0',

    // Pace metrics
    significantStrikesLandedPerMinute: 3.89,
    significantStrikesAbsorbedPerMinute: 3.12,

    // Finish ability
    finishRate: 0.45,
    koPercentage: 0.30,
    submissionPercentage: 0.15,

    // Fight averages
    averageFightTimeSeconds: 720,  // 12 minutes average
    winsByDecision: 11,
    submissionAverage: 0.5,

    // For style classification
    strikingDefensePercentage: 0.58,
    takedownAverage: 0.8,
    takedownDefensePercentage: 0.80,

    // Calculated
    totalWins: 20,
  }

  const fighter2: FighterFunStats = {
    ...fighter2Stats,
    primaryStyle: classifyFighterStyle(fighter2Stats),
  }

  const input: FunScoreInput = {
    fighter1,
    fighter2,
    context: {
      eventName: 'UFC Fight Night: Bonfim vs. Brown',
      weightClass: 'Welterweight',
      titleFight: false,
      mainEvent: true,
      rankings: {
        fighter1Rank: null,  // Unranked
        fighter2Rank: 15,    // #15 ranked
      },
    },
  }

  const prompt = buildFunScorePrompt(input)

  console.log('=== FUN SCORE PROMPT ===')
  console.log(prompt)
  console.log('\n')

  return prompt
}

/**
 * Example: Map database fighter to prompt input format
 *
 * This shows how to transform a Prisma fighter record into the format
 * needed for the prompts.
 */
export function mapDatabaseFighterToFinishStats(dbFighter: {
  name: string
  record: string | null
  significantStrikesAbsorbedPerMinute: number
  strikingDefensePercentage: number
  takedownDefensePercentage: number
  finishRate: number
  koPercentage: number
  submissionPercentage: number
  significantStrikesLandedPerMinute: number
  submissionAverage: number
}): FighterFinishStats {
  return {
    name: dbFighter.name,
    record: dbFighter.record || '0-0-0',
    significantStrikesAbsorbedPerMinute: dbFighter.significantStrikesAbsorbedPerMinute,
    strikingDefensePercentage: dbFighter.strikingDefensePercentage,
    takedownDefensePercentage: dbFighter.takedownDefensePercentage,
    finishRate: dbFighter.finishRate,
    koPercentage: dbFighter.koPercentage,
    submissionPercentage: dbFighter.submissionPercentage,
    significantStrikesLandedPerMinute: dbFighter.significantStrikesLandedPerMinute,
    submissionAverage: dbFighter.submissionAverage,
    // last3Finishes would need to be calculated from fight history
  }
}

/**
 * Example: Map database fighter to fun score format
 */
export function mapDatabaseFighterToFunStats(dbFighter: {
  name: string
  record: string | null
  wins: number
  significantStrikesLandedPerMinute: number
  significantStrikesAbsorbedPerMinute: number
  finishRate: number
  koPercentage: number
  submissionPercentage: number
  averageFightTimeSeconds: number
  winsByDecision: number
  submissionAverage: number
  strikingDefensePercentage: number
  takedownAverage: number
  takedownDefensePercentage: number
}): FighterFunStats {
  const baseStats = {
    name: dbFighter.name,
    record: dbFighter.record || '0-0-0',
    significantStrikesLandedPerMinute: dbFighter.significantStrikesLandedPerMinute,
    significantStrikesAbsorbedPerMinute: dbFighter.significantStrikesAbsorbedPerMinute,
    finishRate: dbFighter.finishRate,
    koPercentage: dbFighter.koPercentage,
    submissionPercentage: dbFighter.submissionPercentage,
    averageFightTimeSeconds: dbFighter.averageFightTimeSeconds,
    winsByDecision: dbFighter.winsByDecision,
    submissionAverage: dbFighter.submissionAverage,
    strikingDefensePercentage: dbFighter.strikingDefensePercentage,
    takedownAverage: dbFighter.takedownAverage,
    takedownDefensePercentage: dbFighter.takedownDefensePercentage,
    totalWins: dbFighter.wins,
  }

  return {
    ...baseStats,
    primaryStyle: classifyFighterStyle(baseStats),
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  console.log('\n### EXAMPLE 1: Finish Probability Prompt ###\n')
  exampleFinishProbabilityPrompt()

  console.log('\n### EXAMPLE 2: Fun Score Prompt ###\n')
  exampleFunScorePrompt()

  console.log('\n### Fighter Style Classification Examples ###')
  console.log('Striker:', classifyFighterStyle({ significantStrikesLandedPerMinute: 5.2, takedownAverage: 0.5, submissionAverage: 0.2 }))
  console.log('Wrestler:', classifyFighterStyle({ significantStrikesLandedPerMinute: 2.8, takedownAverage: 3.5, submissionAverage: 0.3 }))
  console.log('Grappler:', classifyFighterStyle({ significantStrikesLandedPerMinute: 3.1, takedownAverage: 1.2, submissionAverage: 1.8 }))
  console.log('Balanced:', classifyFighterStyle({ significantStrikesLandedPerMinute: 3.5, takedownAverage: 1.0, submissionAverage: 0.5 }))
}
