import { Prisma, type PrismaClient } from '@prisma/client'

import type { Prediction } from '../prediction'

const RISK_LOW_THRESHOLD = 0.78
const RISK_BALANCED_THRESHOLD = 0.675

export type RiskLevel = 'low' | 'balanced' | 'high'

export interface SavePredictionArgs {
  fightId: string
  versionId: string
  prediction: Prediction
}

export class PredictionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save({ fightId, versionId, prediction }: SavePredictionArgs): Promise<void> {
    const data = buildPersistedShape(prediction)

    await this.prisma.prediction.upsert({
      where: { fightId_versionId: { fightId, versionId } },
      create: { ...data, fightId, versionId },
      update: data,
    })

    await this.prisma.fight.update({
      where: { id: fightId },
      data: { riskLevel: deriveRiskLevel(prediction.finishConfidence) },
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
    finishConfidence: prediction.finishConfidence,
    finishReasoning,
    funScore: prediction.funScore,
    funConfidence: prediction.funConfidence,
    funBreakdown,
    modelUsed: prediction.modelUsed,
    tokensUsed: prediction.tokensUsed,
    costUsd: prediction.costUsd,
  }
}

export function deriveRiskLevel(confidence: number): RiskLevel {
  if (confidence >= RISK_LOW_THRESHOLD) return 'low'
  if (confidence >= RISK_BALANCED_THRESHOLD) return 'balanced'
  return 'high'
}
