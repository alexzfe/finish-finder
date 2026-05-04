/**
 * Canonical wire shape for events / fights / fighters / predictions.
 *
 * Single source of truth for the contract between the server (API routes +
 * static export) and the client. Both sides import these types; the zod
 * schemas validate at the seam so drift between API and static JSON shows
 * up at parse time, not silently in the UI.
 */

import { z } from 'zod'

export const WeightClassSchema = z.enum([
  'strawweight',
  'flyweight',
  'bantamweight',
  'featherweight',
  'lightweight',
  'welterweight',
  'middleweight',
  'light_heavyweight',
  'heavyweight',
  'womens_strawweight',
  'womens_flyweight',
  'womens_bantamweight',
  'womens_featherweight',
  'catchweight',
  'unknown',
])
export type WeightClass = z.infer<typeof WeightClassSchema>

export const CardPositionSchema = z.enum([
  'main-event',
  'co-main',
  'main-card',
  'preliminary',
  'early-preliminary',
])
export type CardPosition = z.infer<typeof CardPositionSchema>

export const FighterRecordSchema = z.object({
  wins: z.number(),
  losses: z.number(),
  draws: z.number(),
})

export const FighterSchema = z.object({
  id: z.string(),
  name: z.string(),
  nickname: z.string().nullable(),
  record: FighterRecordSchema,
  weightClass: WeightClassSchema,
  imageUrl: z.string().nullable(),
})
export type Fighter = z.infer<typeof FighterSchema>

/**
 * The current prediction for a fight, projected for the wire.
 *
 * Distinct from the AI module's internal `Prediction` (src/lib/ai/prediction.ts),
 * which carries token cost / billing fields. This shape is what the UI renders.
 */
export const PredictionSchema = z.object({
  funScore: z.number(), // 1-10 integer
  finishProbability: z.number(), // 0-1
  keyFactors: z.array(z.string()),
  modelUsed: z.string().nullable(),
  createdAt: z.string().nullable(), // ISO
})
export type Prediction = z.infer<typeof PredictionSchema>

export const FightSchema = z.object({
  id: z.string(),
  fighter1: FighterSchema,
  fighter2: FighterSchema,
  weightClass: WeightClassSchema,
  titleFight: z.boolean(),
  mainEvent: z.boolean(),
  cardPosition: CardPositionSchema,
  scheduledRounds: z.number(),
  fightNumber: z.number().nullable(),
  bookingDate: z.string(), // ISO
  completed: z.boolean(),
  winnerId: z.string().nullable(),
  // method / time are rendered as free text; lenient parse to avoid blanking
  // pages when a scraper emits an unexpected value.
  method: z.string().nullable(),
  round: z.number().nullable(),
  time: z.string().nullable(),
  fightPrediction: z.string().nullable(),
  prediction: PredictionSchema.nullable(),
})
export type Fight = z.infer<typeof FightSchema>

export const UFCEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string(), // ISO
  location: z.string(),
  venue: z.string(),
  completed: z.boolean(),
  fightCard: z.array(FightSchema),
})
export type UFCEvent = z.infer<typeof UFCEventSchema>
