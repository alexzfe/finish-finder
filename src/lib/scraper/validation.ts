/**
 * Validation schemas for scraped data from the Python scraper
 *
 * These schemas define the contract between the scraper and the API.
 */

import { z } from 'zod'

/**
 * Fighter schema - matches FighterItem from Python scraper
 */
export const ScrapedFighterSchema = z.object({
  id: z.string(),
  name: z.string(),
  record: z.string().nullable().optional(),
  wins: z.number().int().nullable().optional(),
  losses: z.number().int().nullable().optional(),
  draws: z.number().int().nullable().optional(),
  sourceUrl: z.string().url(),
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
  sourceUrl: z.string().url(),
}).refine(
  (data) => data.fighter1Id !== data.fighter2Id,
  { message: 'fighter1Id and fighter2Id must be different' }
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
})

/**
 * Complete payload schema for the ingestion API
 */
export const ScrapedDataSchema = z.object({
  events: z.array(ScrapedEventSchema),
  fights: z.array(ScrapedFightSchema),
  fighters: z.array(ScrapedFighterSchema),
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
