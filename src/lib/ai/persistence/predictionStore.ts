import { type Prisma, type PrismaClient, type PredictionVersion } from '@prisma/client'

import { parseJsonArray } from '../../utils/json'

import type { Prediction } from '../prediction'
import type { FightWithRelations } from '../snapshot'

/**
 * The single answer to "what is the current prediction for this fight?"
 *
 * Built either from a Prediction row (`source: 'prediction'`) or, as a
 * compatibility shim, from legacy columns on the Fight row that older
 * prediction runners populated (`source: 'legacy'`). The shim is expected to
 * disappear once prod is confirmed wiped — see toCurrentPrediction below.
 */
export interface CurrentPrediction {
  funScore: number          // integer, clamped to [1, 10] (or 0 when legacy is empty)
  finishProbability: number // 0-1
  funFactors: string[]
  source: 'prediction' | 'legacy'
  modelUsed: string | null
  createdAt: Date | null
}

interface PredictionRowFields {
  funScore: number | null
  finishProbability: number | null
  funBreakdown: unknown
  modelUsed?: string | null
  createdAt?: Date | null
}

interface FightLegacyFields {
  funFactor: number | null
  finishProbability: number | null
  keyFactors: string | null
  funFactors: string | null
}

export interface FightWithMaybePrediction extends FightLegacyFields {
  predictions: PredictionRowFields[]
}

const FUN_SCORE_FLOOR = 0
const FUN_SCORE_CEILING = 10

export function toCurrentPrediction(
  fight: FightWithMaybePrediction
): CurrentPrediction | null {
  const row = fight.predictions[0]

  if (row && typeof row.funScore === 'number') {
    return {
      funScore: clampFunScore(row.funScore),
      finishProbability: row.finishProbability ?? 0,
      funFactors: extractFunFactorsFromBreakdown(row.funBreakdown),
      source: 'prediction',
      modelUsed: row.modelUsed ?? null,
      createdAt: row.createdAt ?? null,
    }
  }

  const legacyFunScore = typeof fight.funFactor === 'number' ? fight.funFactor : null
  const legacyFinishProb = fight.finishProbability
  const legacyFactors = parseJsonArray(fight.keyFactors ?? fight.funFactors).filter(
    (f): f is string => typeof f === 'string'
  )

  const hasLegacyData =
    (legacyFunScore !== null && legacyFunScore !== 0) ||
    (legacyFinishProb !== null && legacyFinishProb !== 0) ||
    legacyFactors.length > 0

  if (!hasLegacyData) {
    return null
  }

  return {
    funScore: legacyFunScore !== null ? clampFunScore(legacyFunScore) : 0,
    finishProbability: legacyFinishProb ?? 0,
    funFactors: legacyFactors,
    source: 'legacy',
    modelUsed: null,
    createdAt: null,
  }
}

function clampFunScore(score: number): number {
  return Math.min(FUN_SCORE_CEILING, Math.max(FUN_SCORE_FLOOR, Math.round(score)))
}

function extractFunFactorsFromBreakdown(funBreakdown: unknown): string[] {
  if (!funBreakdown) return []

  let parsed: unknown = funBreakdown
  if (typeof funBreakdown === 'string') {
    try {
      parsed = JSON.parse(funBreakdown)
    } catch {
      return []
    }
  }

  if (parsed && typeof parsed === 'object' && 'keyFactors' in parsed) {
    const keyFactors = (parsed as { keyFactors: unknown }).keyFactors
    if (Array.isArray(keyFactors)) {
      return keyFactors.filter((f): f is string => typeof f === 'string')
    }
  }

  return []
}

export interface FindMissingOptions {
  versionId: string
  eventId?: string | null
  includePast?: boolean
}

export interface SavePredictionArgs {
  fightId: string
  versionId: string
  prediction: Prediction
}

export class PredictionStore {
  constructor(private readonly prisma: PrismaClient) {}

  async getActiveVersion(): Promise<PredictionVersion | null> {
    return this.prisma.predictionVersion.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findFightsMissingPrediction({
    versionId,
    eventId,
    includePast,
  }: FindMissingOptions): Promise<FightWithRelations[]> {
    return this.prisma.fight.findMany({
      where: {
        isCancelled: false,
        predictions: { none: { versionId } },
        ...(eventId ? { eventId } : {}),
        ...(includePast || eventId ? {} : { event: { date: { gte: new Date() } } }),
      },
      include: {
        fighter1: { include: { entertainmentProfile: true } },
        fighter2: { include: { entertainmentProfile: true } },
        event: true,
      },
      orderBy: [{ event: { date: 'asc' } }, { fightNumber: 'asc' }],
    })
  }

  async save({ fightId, versionId, prediction }: SavePredictionArgs): Promise<void> {
    const data = buildPersistedShape(prediction)
    await this.prisma.prediction.upsert({
      where: { fightId_versionId: { fightId, versionId } },
      create: { ...data, fightId, versionId },
      update: data,
    })
  }
}

function buildPersistedShape(prediction: Prediction) {
  const { output } = prediction
  // finishReasoning column is retained for schema compatibility; the new
  // contract surfaces no chain-of-thought, so this is intentionally empty.
  const finishReasoning: Prisma.InputJsonValue = {}
  const funBreakdown: Prisma.InputJsonValue = {
    attributes: { ...output.attributes },
    keyFactors: output.keyFactors,
  }

  return {
    finishProbability: prediction.finishProbability,
    finishReasoning,
    funScore: prediction.funScore,
    funBreakdown,
    modelUsed: prediction.modelUsed,
    tokensUsed: prediction.tokensUsed,
    costUsd: prediction.costUsd,
  }
}
