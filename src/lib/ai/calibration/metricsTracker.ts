/**
 * Calibration Metrics Tracker - Phase 2.3
 *
 * Tracks calibration metrics over time to monitor prediction quality.
 * Supports:
 * - Brier Score (finish probability accuracy)
 * - Expected Calibration Error (ECE)
 * - Maximum Calibration Error (MCE)
 * - Fun Score correlation with FOTN awards
 */

import { calculateCalibrationMetrics, type CalibrationMetrics } from './plattScaling'
import { prisma } from '../../database/prisma'

/**
 * Fun score evaluation metrics
 */
export interface FunScoreMetrics {
  correlation: number       // Pearson correlation with entertainment indicators
  fotnPrecision: number    // Precision at predicting Fight of the Night
  fotnRecall: number       // Recall for Fight of the Night
  meanAbsoluteError: number // MAE for fun score predictions
}

/**
 * Complete prediction evaluation
 */
export interface PredictionEvaluation {
  finishMetrics: CalibrationMetrics
  funMetrics: FunScoreMetrics
  sampleSize: number
  evaluationPeriod: {
    start: Date
    end: Date
  }
}

/**
 * Calculate Pearson correlation coefficient
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0

  const n = x.length
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0)
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0)
  const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0)

  const numerator = n * sumXY - sumX * sumY
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
  )

  return denominator === 0 ? 0 : numerator / denominator
}

/**
 * Evaluate predictions for a given time period
 */
export async function evaluatePredictions(
  startDate: Date,
  endDate: Date,
  versionId?: string
): Promise<PredictionEvaluation> {
  // Build query conditions
  const whereConditions: Record<string, unknown> = {
    actualFinish: { not: null },
    createdAt: {
      gte: startDate,
      lte: endDate,
    },
  }

  if (versionId) {
    whereConditions.versionId = versionId
  }

  // Fetch predictions with outcomes
  const predictions = await prisma.prediction.findMany({
    where: whereConditions,
    include: {
      fight: {
        include: {
          weakLabel: true,
        },
      },
    },
  })

  if (predictions.length === 0) {
    return {
      finishMetrics: { brierScore: 0, ece: 0, mce: 0, accuracy: 0 },
      funMetrics: {
        correlation: 0,
        fotnPrecision: 0,
        fotnRecall: 0,
        meanAbsoluteError: 0,
      },
      sampleSize: 0,
      evaluationPeriod: { start: startDate, end: endDate },
    }
  }

  // Calculate finish metrics
  const finishData = predictions.map((p) => ({
    predicted: p.finishProbability,
    actual: p.actualFinish!,
  }))
  const finishMetrics = calculateCalibrationMetrics(finishData)

  // Calculate fun score metrics
  const funMetrics = calculateFunMetrics(predictions)

  return {
    finishMetrics,
    funMetrics,
    sampleSize: predictions.length,
    evaluationPeriod: { start: startDate, end: endDate },
  }
}

/**
 * Calculate fun score evaluation metrics
 */
function calculateFunMetrics(predictions: Array<{
  funScore: number
  actualFunScore: number | null
  fight: {
    weakLabel: {
      entertainmentScore: number | null
      bonusAwarded: boolean | null
    } | null
  }
}>): FunScoreMetrics {
  // Filter to predictions with some form of ground truth
  const withLabels = predictions.filter(
    (p) => p.actualFunScore !== null || p.fight.weakLabel?.entertainmentScore !== null
  )

  if (withLabels.length === 0) {
    return {
      correlation: 0,
      fotnPrecision: 0,
      fotnRecall: 0,
      meanAbsoluteError: 0,
    }
  }

  // Calculate correlation with actual/weak labels
  const predicted = withLabels.map((p) => p.funScore)
  const actual = withLabels.map(
    (p) => p.actualFunScore ?? p.fight.weakLabel?.entertainmentScore ?? 50
  )

  const correlation = pearsonCorrelation(predicted, actual)

  // Calculate MAE
  const mae =
    predicted.reduce((acc, p, i) => acc + Math.abs(p - actual[i]), 0) /
    predicted.length

  // Calculate FOTN precision/recall
  // High fun score (>75) should predict bonus-worthy fights
  const withBonus = predictions.filter(
    (p) => p.fight.weakLabel?.bonusAwarded !== null
  )

  let truePositives = 0
  let falsePositives = 0
  let falseNegatives = 0

  for (const p of withBonus) {
    const predictedHigh = p.funScore > 75
    const actualBonus = p.fight.weakLabel?.bonusAwarded ?? false

    if (predictedHigh && actualBonus) truePositives++
    else if (predictedHigh && !actualBonus) falsePositives++
    else if (!predictedHigh && actualBonus) falseNegatives++
  }

  const fotnPrecision =
    truePositives + falsePositives > 0
      ? truePositives / (truePositives + falsePositives)
      : 0
  const fotnRecall =
    truePositives + falseNegatives > 0
      ? truePositives / (truePositives + falseNegatives)
      : 0

  return {
    correlation,
    fotnPrecision,
    fotnRecall,
    meanAbsoluteError: mae,
  }
}

/**
 * Update prediction version with evaluation metrics
 */
export async function updateVersionMetrics(
  versionId: string,
  evaluation: PredictionEvaluation
): Promise<void> {
  await prisma.predictionVersion.update({
    where: { id: versionId },
    data: {
      finishAccuracy: evaluation.finishMetrics.accuracy,
      brierScore: evaluation.finishMetrics.brierScore,
      funScoreCorrelation: evaluation.funMetrics.correlation,
      evaluatedAt: new Date(),
    },
  })
}

/**
 * Get historical metrics for a prediction version
 */
export async function getVersionHistory(
  versionId: string
): Promise<Array<{
  date: Date
  finishMetrics: CalibrationMetrics
  funMetrics: FunScoreMetrics
}>> {
  // For now, return the current evaluation
  // In a full implementation, this would query a metrics history table
  const version = await prisma.predictionVersion.findUnique({
    where: { id: versionId },
  })

  if (!version || !version.evaluatedAt) {
    return []
  }

  return [
    {
      date: version.evaluatedAt,
      finishMetrics: {
        brierScore: version.brierScore ?? 0,
        ece: 0, // Not stored in current schema
        mce: 0, // Not stored in current schema
        accuracy: version.finishAccuracy ?? 0,
      },
      funMetrics: {
        correlation: version.funScoreCorrelation ?? 0,
        fotnPrecision: 0, // Not stored in current schema
        fotnRecall: 0, // Not stored in current schema
        meanAbsoluteError: 0, // Not stored in current schema
      },
    },
  ]
}

/**
 * Generate calibration report
 */
export async function generateCalibrationReport(
  windowMonths: number = 6
): Promise<string> {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - windowMonths)

  // Get active version
  const activeVersion = await prisma.predictionVersion.findFirst({
    where: { active: true },
  })

  if (!activeVersion) {
    return 'No active prediction version found.'
  }

  // Evaluate predictions
  const evaluation = await evaluatePredictions(
    startDate,
    endDate,
    activeVersion.id
  )

  // Format report
  const lines: string[] = [
    '='.repeat(60),
    'CALIBRATION REPORT',
    `Version: ${activeVersion.version}`,
    `Period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
    `Sample Size: ${evaluation.sampleSize}`,
    '='.repeat(60),
    '',
    'FINISH PROBABILITY METRICS',
    '-'.repeat(40),
    `  Brier Score: ${evaluation.finishMetrics.brierScore.toFixed(4)} (lower is better)`,
    `  ECE: ${evaluation.finishMetrics.ece.toFixed(4)} (Expected Calibration Error)`,
    `  MCE: ${evaluation.finishMetrics.mce.toFixed(4)} (Maximum Calibration Error)`,
    `  Accuracy: ${(evaluation.finishMetrics.accuracy * 100).toFixed(1)}%`,
    '',
    'FUN SCORE METRICS',
    '-'.repeat(40),
    `  Correlation: ${evaluation.funMetrics.correlation.toFixed(4)}`,
    `  MAE: ${evaluation.funMetrics.meanAbsoluteError.toFixed(2)}`,
    `  FOTN Precision: ${(evaluation.funMetrics.fotnPrecision * 100).toFixed(1)}%`,
    `  FOTN Recall: ${(evaluation.funMetrics.fotnRecall * 100).toFixed(1)}%`,
    '',
    '='.repeat(60),
  ]

  return lines.join('\n')
}
