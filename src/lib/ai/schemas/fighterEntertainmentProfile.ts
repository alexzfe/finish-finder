/**
 * Fighter Entertainment Profile Schema
 *
 * Zod schema for structured extraction of fighter entertainment signals
 * from web search results. Used with OpenAI's structured outputs.
 *
 * Key signals extracted:
 * - Fighting archetype (brawler, pressure fighter, counter striker, etc.)
 * - Entertainment mentality (finisher, bonus hunter, plays safe, etc.)
 * - Reputation tags (qualitative descriptors from media/fans)
 * - Bonus history and notable wars
 *
 * Note: All fields must be required for OpenAI structured outputs.
 * Use z.union([type, z.null()]) for optional semantics.
 */

import { z } from 'zod'

/**
 * Fighter archetype classification
 *
 * Based on fighting style and approach patterns.
 * Maps to Bloody Elbow's "Four MMA Grappling Archetypes" and common striking classifications.
 */
export const FighterArchetype = z.enum([
  'brawler',           // Trades punches, relies on toughness, "wars"
  'pressure_fighter',  // Always comes forward, high output, relentless
  'counter_striker',   // Patient, times counters, waits for opponent
  'point_fighter',     // Outpoints via jabs/leg kicks, avoids damage
  'volume_striker',    // High output, quantity over power
  'wrestler',          // Takedowns and control primary weapon
  'submission_artist', // Actively hunts submissions on the ground
  'sprawl_and_brawl',  // Good TDD, prefers standing
  'ground_and_pound',  // Wrestle + strike from top position
  'unknown',           // Insufficient data to classify
])

export type FighterArchetype = z.infer<typeof FighterArchetype>

/**
 * Entertainment mentality classification
 *
 * How a fighter approaches winning vs entertaining.
 */
export const EntertainmentMentality = z.enum([
  'finisher',          // Pursues finishes even when ahead
  'coasts_with_lead',  // Plays safe when winning
  'bonus_hunter',      // Explicitly chases FOTN/POTN bonuses
  'plays_safe',        // Conservative, prioritizes winning over action
  'unknown',           // Insufficient data to classify
])

export type EntertainmentMentality = z.infer<typeof EntertainmentMentality>

/**
 * Fight result enum for notable wars
 */
export const FightResult = z.enum(['win', 'loss', 'draw', 'nc'])

export type FightResult = z.infer<typeof FightResult>

/**
 * Notable war entry - a memorable, exciting fight
 */
export const NotableWar = z.object({
  opponent: z.string().describe('Opponent name'),
  event: z.string().describe('Event name (e.g., "UFC 218")'),
  year: z.number().describe('Year the fight took place'),
  description: z.string().describe('Brief description of why it was notable'),
  result: FightResult,
})

export type NotableWar = z.infer<typeof NotableWar>

/**
 * Bonus history tracking
 */
export const BonusHistory = z.object({
  fotn_count: z.number().describe('Fight of the Night bonus count'),
  potn_count: z.number().describe('Performance of the Night bonus count'),
  total_bonuses: z.number().describe('Total UFC bonuses awarded'),
  bonus_rate_estimate: z
    .union([z.number(), z.null()])
    .describe('Estimated bonus rate (bonuses / UFC fights), null if unknown'),
})

export type BonusHistory = z.infer<typeof BonusHistory>

/**
 * Rivalry entry
 */
export const Rivalry = z.object({
  opponent: z.string().describe('Rival fighter name'),
  is_real_beef: z
    .boolean()
    .describe('True if genuine animosity, false if manufactured/promotional'),
  context: z.string().describe('Brief context about the rivalry'),
})

export type Rivalry = z.infer<typeof Rivalry>

/**
 * Entertainment prediction level
 */
export const EntertainmentPrediction = z.enum([
  'high',    // Consistently exciting, bonus-worthy performances
  'medium',  // Generally entertaining with occasional slow fights
  'low',     // Often boring, decision-heavy, low action
  'unknown', // Insufficient data
])

export type EntertainmentPrediction = z.infer<typeof EntertainmentPrediction>

/**
 * Complete Fighter Entertainment Profile
 *
 * Extracted from web search results via structured output.
 * All fields required for OpenAI compatibility; use null for missing data.
 */
export const FighterEntertainmentProfile = z.object({
  // Identity
  fighter_name: z.string().describe('Fighter full name'),
  nickname: z
    .union([z.string(), z.null()])
    .describe('Fighter nickname if known'),

  // Archetype classification
  primary_archetype: FighterArchetype.describe(
    'Primary fighting style archetype'
  ),
  secondary_archetype: z
    .union([FighterArchetype, z.null()])
    .describe('Secondary archetype for hybrid fighters'),
  archetype_reasoning: z
    .string()
    .describe('Evidence supporting archetype classification (2-3 sentences)'),
  archetype_confidence: z
    .number()
    .min(0)
    .max(100)
    .describe('Confidence in archetype classification (0-100)'),

  // Entertainment mentality
  mentality: EntertainmentMentality.describe(
    'How fighter approaches winning vs entertaining'
  ),
  mentality_reasoning: z
    .string()
    .describe('Evidence supporting mentality classification (2-3 sentences)'),
  mentality_confidence: z
    .number()
    .min(0)
    .max(100)
    .describe('Confidence in mentality classification (0-100)'),

  // Qualitative reputation tags
  reputation_tags: z
    .array(z.string())
    .describe(
      'Qualitative tags like "always comes forward", "iron chin", "fades late", "wilts under pressure", "cardio machine", "pillow fists", "dog", "warrior"'
    ),

  // Notable exciting fights
  notable_wars: z
    .array(NotableWar)
    .describe('List of memorable, exciting fights (max 5)'),

  // Bonus history
  bonus_history: BonusHistory.describe('UFC bonus awards history'),

  // Known boring fights
  known_boring_fights: z
    .array(z.string())
    .describe(
      'Fights widely considered uneventful (opponent name + brief note)'
    ),

  // Rivalries that add narrative excitement
  rivalries: z
    .array(Rivalry)
    .describe('Known rivalries that add entertainment value'),

  // Overall assessment
  entertainment_prediction: EntertainmentPrediction.describe(
    'Overall entertainment prediction based on career patterns'
  ),

  // Data quality notes
  extraction_notes: z
    .string()
    .describe(
      'Caveats, ambiguities, data quality issues, or conflicting sources'
    ),
})

export type FighterEntertainmentProfile = z.infer<
  typeof FighterEntertainmentProfile
>

/**
 * Subset of profile relevant for prediction prompt injection
 *
 * Lighter weight version used in the unified prediction prompt.
 */
export const FighterEntertainmentContext = z.object({
  primary_archetype: FighterArchetype,
  secondary_archetype: z.union([FighterArchetype, z.null()]),
  archetype_confidence: z.number(),
  mentality: EntertainmentMentality,
  mentality_confidence: z.number(),
  reputation_tags: z.array(z.string()),
  bonus_history: BonusHistory,
  entertainment_prediction: EntertainmentPrediction,
})

export type FighterEntertainmentContext = z.infer<
  typeof FighterEntertainmentContext
>

/**
 * Convert full profile to lightweight context for prompt injection
 */
export function toEntertainmentContext(
  profile: FighterEntertainmentProfile
): FighterEntertainmentContext {
  return {
    primary_archetype: profile.primary_archetype,
    secondary_archetype: profile.secondary_archetype,
    archetype_confidence: profile.archetype_confidence,
    mentality: profile.mentality,
    mentality_confidence: profile.mentality_confidence,
    reputation_tags: profile.reputation_tags,
    bonus_history: profile.bonus_history,
    entertainment_prediction: profile.entertainment_prediction,
  }
}

/**
 * Create an empty/unknown profile for fighters with no search results
 */
export function createUnknownProfile(
  fighterName: string
): FighterEntertainmentProfile {
  return {
    fighter_name: fighterName,
    nickname: null,
    primary_archetype: 'unknown',
    secondary_archetype: null,
    archetype_reasoning: 'Insufficient data from web search to classify fighting style.',
    archetype_confidence: 0,
    mentality: 'unknown',
    mentality_reasoning: 'Insufficient data from web search to classify entertainment mentality.',
    mentality_confidence: 0,
    reputation_tags: [],
    notable_wars: [],
    bonus_history: {
      fotn_count: 0,
      potn_count: 0,
      total_bonuses: 0,
      bonus_rate_estimate: null,
    },
    known_boring_fights: [],
    rivalries: [],
    entertainment_prediction: 'unknown',
    extraction_notes: 'No search results found or extraction failed.',
  }
}
