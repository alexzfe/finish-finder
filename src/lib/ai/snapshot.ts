import { z } from 'zod'

import type {
  Fight,
  Fighter,
  FighterEntertainmentProfile as PrismaFighterEntertainmentProfile,
  Event,
} from '@prisma/client'

import { classifyFighterStyle } from './prompts/hybridJudgmentPrompt'
import {
  EntertainmentMentality,
  EntertainmentPrediction,
  FighterArchetype,
  FighterEntertainmentContext,
} from './schemas/fighterEntertainmentProfile'

const FighterStyleSchema = z.enum(['striker', 'wrestler', 'grappler', 'balanced'])

export const FighterSnapshotSchema = z.object({
  name: z.string().min(1),
  record: z.string(),

  significantStrikesAbsorbedPerMinute: z.number(),
  strikingDefensePercentage: z.number(),
  takedownDefensePercentage: z.number(),

  lossFinishRate: z.number(),
  koLossPercentage: z.number(),
  submissionLossPercentage: z.number(),

  finishRate: z.number(),
  koPercentage: z.number(),
  submissionPercentage: z.number(),
  significantStrikesLandedPerMinute: z.number(),
  submissionAverage: z.number(),
  takedownAverage: z.number(),

  averageFightTimeSeconds: z.number(),
  winsByDecision: z.number(),
  totalWins: z.number(),

  primaryStyle: FighterStyleSchema,

  entertainmentProfile: FighterEntertainmentContext.optional(),
})

export const FightContextSchema = z.object({
  eventName: z.string().min(1),
  weightClass: z.string().min(1),
  titleFight: z.boolean(),
  mainEvent: z.boolean(),
})

export const FightSnapshotSchema = z.object({
  fighter1: FighterSnapshotSchema,
  fighter2: FighterSnapshotSchema,
  context: FightContextSchema,
})

export type FighterSnapshot = z.infer<typeof FighterSnapshotSchema>
export type FightContext = z.infer<typeof FightContextSchema>
export type FightSnapshot = z.infer<typeof FightSnapshotSchema>

export type FighterWithRelations = Fighter & {
  entertainmentProfile: PrismaFighterEntertainmentProfile | null
}

export type FightWithRelations = Fight & {
  fighter1: FighterWithRelations
  fighter2: FighterWithRelations
  event: Event
}

const DEFAULT_BONUS_HISTORY = {
  fotn_count: 0,
  potn_count: 0,
  total_bonuses: 0,
  bonus_rate_estimate: null,
} as const

export function buildSnapshot(fight: FightWithRelations): FightSnapshot {
  return FightSnapshotSchema.parse({
    fighter1: toFighterSnapshot(fight.fighter1),
    fighter2: toFighterSnapshot(fight.fighter2),
    context: {
      eventName: fight.event.name,
      weightClass: fight.weightClass,
      titleFight: fight.titleFight,
      mainEvent: fight.mainEvent,
    },
  })
}

function toFighterSnapshot(fighter: FighterWithRelations) {
  const profile = fighter.entertainmentProfile

  return {
    name: fighter.name,
    record: fighter.record ?? 'Unknown',

    significantStrikesAbsorbedPerMinute: fighter.significantStrikesAbsorbedPerMinute,
    strikingDefensePercentage: fighter.strikingDefensePercentage,
    takedownDefensePercentage: fighter.takedownDefensePercentage,

    lossFinishRate: fighter.lossFinishRate,
    koLossPercentage: fighter.koLossPercentage,
    submissionLossPercentage: fighter.submissionLossPercentage,

    finishRate: fighter.finishRate,
    koPercentage: fighter.koPercentage,
    submissionPercentage: fighter.submissionPercentage,
    significantStrikesLandedPerMinute: fighter.significantStrikesLandedPerMinute,
    submissionAverage: fighter.submissionAverage,
    takedownAverage: fighter.takedownAverage,

    averageFightTimeSeconds: fighter.averageFightTimeSeconds,
    winsByDecision: fighter.winsByDecision,
    totalWins: fighter.wins,

    primaryStyle: classifyFighterStyle({
      significantStrikesLandedPerMinute: fighter.significantStrikesLandedPerMinute,
      takedownAverage: fighter.takedownAverage,
      submissionAverage: fighter.submissionAverage,
    }),

    entertainmentProfile: profile ? toEntertainmentContext(profile) : undefined,
  }
}

function toEntertainmentContext(profile: PrismaFighterEntertainmentProfile) {
  const bonusHistory =
    profile.bonusHistory && typeof profile.bonusHistory === 'object'
      ? profile.bonusHistory
      : DEFAULT_BONUS_HISTORY

  return FighterEntertainmentContext.parse({
    primary_archetype: FighterArchetype.parse(profile.primaryArchetype),
    secondary_archetype:
      profile.secondaryArchetype === null
        ? null
        : FighterArchetype.parse(profile.secondaryArchetype),
    archetype_confidence: profile.archetypeConfidence,
    mentality: EntertainmentMentality.parse(profile.mentality),
    mentality_confidence: profile.mentalityConfidence,
    reputation_tags: profile.reputationTags,
    bonus_history: bonusHistory,
    entertainment_prediction: EntertainmentPrediction.parse(profile.entertainmentPrediction),
  })
}
