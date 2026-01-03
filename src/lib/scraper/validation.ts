/**
 * Validation schemas for scraped data from the Python scraper
 *
 * These schemas define the contract between the scraper and the API.
 */

import { z } from 'zod'

/**
 * Fighter schema - matches FighterItem from Python scraper
 * Includes comprehensive statistics from UFCStats.com
 */
export const ScrapedFighterSchema = z.object({
  id: z.string(),
  name: z.string(),
  sourceUrl: z.string().url(),
  imageUrl: z.string().url().nullable().optional(),  // Fighter headshot from ESPN/Wikipedia

  // Basic record
  record: z.string().nullable().optional(),
  wins: z.number().int().nullable().optional(),
  losses: z.number().int().nullable().optional(),
  draws: z.number().int().nullable().optional(),

  // Physical attributes (from UFCStats.com)
  height: z.string().nullable().optional(),  // e.g. "5' 11\""
  weightLbs: z.number().int().nullable().optional(),
  reach: z.string().nullable().optional(),  // e.g. "76\""
  reachInches: z.number().int().nullable().optional(),
  stance: z.string().nullable().optional(),  // Orthodox, Southpaw, Switch
  dob: z.string().nullable().optional(),

  // Striking statistics (from UFCStats.com)
  significantStrikesLandedPerMinute: z.number().nullable().optional(),
  strikingAccuracyPercentage: z.number().min(0).max(1).nullable().optional(),
  significantStrikesAbsorbedPerMinute: z.number().nullable().optional(),
  strikingDefensePercentage: z.number().min(0).max(1).nullable().optional(),

  // Grappling statistics (from UFCStats.com)
  takedownAverage: z.number().nullable().optional(),
  takedownAccuracyPercentage: z.number().min(0).max(1).nullable().optional(),
  takedownDefensePercentage: z.number().min(0).max(1).nullable().optional(),
  submissionAverage: z.number().nullable().optional(),

  // Win methods & fight averages (from UFCStats.com)
  averageFightTimeSeconds: z.number().int().nullable().optional(),
  winsByKO: z.number().int().nullable().optional(),
  winsBySubmission: z.number().int().nullable().optional(),
  winsByDecision: z.number().int().nullable().optional(),

  // Loss methods (from UFCStats.com fight history)
  lossesByKO: z.number().int().nullable().optional(),
  lossesBySubmission: z.number().int().nullable().optional(),
  lossesByDecision: z.number().int().nullable().optional(),

  // Calculated statistics (computed by scraper)
  finishRate: z.number().min(0).max(1).nullable().optional(),
  koPercentage: z.number().min(0).max(1).nullable().optional(),
  submissionPercentage: z.number().min(0).max(1).nullable().optional(),

  // Calculated loss statistics (computed by scraper)
  lossFinishRate: z.number().min(0).max(1).nullable().optional(),
  koLossPercentage: z.number().min(0).max(1).nullable().optional(),
  submissionLossPercentage: z.number().min(0).max(1).nullable().optional(),
})

/**
 * Fight schema - matches FightItem from Python scraper
 */
export const ScrapedFightSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  fighter1Id: z.string(),
  fighter2Id: z.string(),
  weightClass: z.string().optional(),
  titleFight: z.boolean().optional().default(false),
  mainEvent: z.boolean().optional().default(false),
  cardPosition: z.string().optional(),
  scheduledRounds: z.number().int().min(3).max(5).optional().default(3),
  sourceUrl: z.string().url(),

  // Fight outcome fields (for completed events)
  completed: z.boolean().optional().default(false),
  winnerId: z.string().nullable().optional(),  // Null for NC, Draw, or upcoming
  method: z.string().nullable().optional(),     // KO/TKO, SUB, DEC, DQ, NC
  round: z.number().int().min(1).max(5).nullable().optional(),
  time: z.string().regex(/^\d{1,2}:\d{2}$/).nullable().optional(),  // Format: M:SS or MM:SS
}).refine(
  (data) => data.fighter1Id !== data.fighter2Id,
  { message: 'fighter1Id and fighter2Id must be different' }
).refine(
  (data) => !data.completed || (data.completed && data.method !== null),
  { message: 'Completed fights must have a method' }
)

/**
 * Event schema - matches EventItem from Python scraper
 */
export const ScrapedEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string().datetime(),
  venue: z.string().optional(),
  location: z.string().optional(),
  sourceUrl: z.string().url(),

  // Event status fields
  completed: z.boolean().optional().default(false),
  cancelled: z.boolean().optional().default(false),
})

/**
 * Complete payload schema for the ingestion API
 */
export const ScrapedDataSchema = z.object({
  events: z.array(ScrapedEventSchema),
  fights: z.array(ScrapedFightSchema),
  fighters: z.array(ScrapedFighterSchema),
  scrapedEventUrls: z.array(z.string().url()).optional().default([]),
})

export type ScrapedFighter = z.infer<typeof ScrapedFighterSchema>
export type ScrapedFight = z.infer<typeof ScrapedFightSchema>
export type ScrapedEvent = z.infer<typeof ScrapedEventSchema>
export type ScrapedData = z.infer<typeof ScrapedDataSchema>

/**
 * Validate scraped data and return detailed errors
 */
export function validateScrapedData(data: unknown): string[] {
  const result = ScrapedDataSchema.safeParse(data)

  if (result.success) {
    return []
  }

  return result.error.errors.map((err) => {
    const path = err.path.join('.')
    return `${path}: ${err.message}`
  })
}
