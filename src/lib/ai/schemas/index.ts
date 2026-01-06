/**
 * AI Schemas Index
 *
 * Zod schemas for structured AI outputs.
 */

export {
  // Enums
  FighterArchetype,
  EntertainmentMentality,
  FightResult,
  EntertainmentPrediction,
  // Objects
  NotableWar,
  BonusHistory,
  Rivalry,
  FighterEntertainmentProfile,
  FighterEntertainmentContext,
  // Utility functions
  toEntertainmentContext,
  createUnknownProfile,
  // Types
  type FighterArchetype as FighterArchetypeType,
  type EntertainmentMentality as EntertainmentMentalityType,
  type FightResult as FightResultType,
  type EntertainmentPrediction as EntertainmentPredictionType,
  type NotableWar as NotableWarType,
  type BonusHistory as BonusHistoryType,
  type Rivalry as RivalryType,
  type FighterEntertainmentProfile as FighterEntertainmentProfileType,
  type FighterEntertainmentContext as FighterEntertainmentContextType,
} from './fighterEntertainmentProfile'
