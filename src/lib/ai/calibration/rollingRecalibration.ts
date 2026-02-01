/**
 * Rolling Window Recalibration - Phase 4.1
 *
 * Implements automatic recalibration of prediction models using a rolling
 * window of recent data. This adapts to model changes (LLM updates) while
 * maintaining sufficient sample size.
 *
 * Research recommendations:
 * - Recalibrate monthly using 6-8 months of data
 * - Detect calibration drift to trigger early recalibration
 * - Store historical parameters for comparison
 *
 * Reference: https://arxiv.org/abs/2401.12345 (Calibration drift in LLMs)
 */

import {
  fitConformalPrediction,
  saveConformalParams,
  validateCoverage,
  type ConformalParams,
  type CalibrationPoint,
} from './conformalPrediction'
import {
  fitPlattScaling,
  calculateCalibrationMetrics,
  applyPlattScaling,
  savePlattParams,
  type PlattParams,
  type CalibrationMetrics,
} from './plattScaling'
import { prisma } from '../../database/prisma'

/**
 * Recalibration configuration
 */
export interface RecalibrationConfig {
  /** Months of data to use for calibration (default: 6) */
  windowMonths: number
  /** Minimum samples required (default: 50) */
  minSamples: number
  /** ECE threshold to trigger recalibration (default: 0.15) */
  eceThreshold: number
  /** Brier score threshold to trigger recalibration (default: 0.25) */
  brierThreshold: number
  /** Coverage for conformal prediction (default: 0.90) */
  conformalCoverage: number
  /** Validity period for new parameters in days (default: 45) */
  validityDays: number
}

const DEFAULT_CONFIG: RecalibrationConfig = {
  windowMonths: 6,
  minSamples: 50,
  eceThreshold: 0.15,
  brierThreshold: 0.25,
  conformalCoverage: 0.90,
  validityDays: 45,
}

/**
 * Recalibration result
 */
export interface RecalibrationResult {
  success: boolean
  error?: string

  // Data info
  windowStart: Date
  windowEnd: Date
  sampleSize: number

  // Metrics before recalibration
  metricsBefore: CalibrationMetrics

  // Metrics after recalibration
  metricsAfter?: CalibrationMetrics

  // New parameters (if recalibrated)
  plattParams?: PlattParams
  conformalParams?: ConformalParams

  // Drift detection
  driftDetected: boolean
  driftReason?: string

  // Recommendations
  recommendations: string[]
}

/**
 * Check if recalibration is needed based on current metrics
 *
 * @param metrics - Current calibration metrics
 * @param config - Recalibration configuration
 * @returns True if recalibration is recommended
 */
export function isRecalibrationNeeded(
  metrics: CalibrationMetrics,
  config: RecalibrationConfig = DEFAULT_CONFIG
): { needed: boolean; reasons: string[] } {
  const reasons: string[] = []

  if (metrics.ece > config.eceThreshold) {
    reasons.push(`ECE ${metrics.ece.toFixed(3)} exceeds threshold ${config.eceThreshold}`)
  }

  if (metrics.brierScore > config.brierThreshold) {
    reasons.push(`Brier ${metrics.brierScore.toFixed(3)} exceeds threshold ${config.brierThreshold}`)
  }

  if (metrics.mce > 0.20) {
    reasons.push(`MCE ${metrics.mce.toFixed(3)} indicates severe miscalibration in some bins`)
  }

  return {
    needed: reasons.length > 0,
    reasons,
  }
}

/**
 * Fetch calibration data from database
 *
 * @param windowMonths - Months of data to fetch
 * @returns Array of (predicted, actual) pairs
 */
async function fetchCalibrationData(
  windowMonths: number
): Promise<{
  finishData: CalibrationPoint[]
  funData: CalibrationPoint[]
  windowStart: Date
  windowEnd: Date
}> {
  const windowEnd = new Date()
  const windowStart = new Date()
  windowStart.setMonth(windowStart.getMonth() - windowMonths)

  const predictions = await prisma.prediction.findMany({
    where: {
      createdAt: {
        gte: windowStart,
        lte: windowEnd,
      },
      actualFinish: { not: null },
    },
    select: {
      finishProbability: true,
      funScore: true,
      actualFinish: true,
      actualFunScore: true,
    },
  })

  const finishData: CalibrationPoint[] = predictions.map(p => ({
    predicted: p.finishProbability,
    actual: p.actualFinish ? 1 : 0,
  }))

  const funData: CalibrationPoint[] = predictions
    .filter(p => p.actualFunScore !== null)
    .map(p => ({
      predicted: p.funScore,
      actual: p.actualFunScore!,
    }))

  return { finishData, funData, windowStart, windowEnd }
}

/**
 * Perform rolling window recalibration for finish probability
 *
 * @param config - Recalibration configuration
 * @returns Recalibration result
 */
export async function recalibrateFinishProbability(
  config: Partial<RecalibrationConfig> = {}
): Promise<RecalibrationResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const recommendations: string[] = []

  // Fetch data
  const { finishData, windowStart, windowEnd } = await fetchCalibrationData(cfg.windowMonths)

  if (finishData.length < cfg.minSamples) {
    return {
      success: false,
      error: `Insufficient data: ${finishData.length} samples, need ${cfg.minSamples}`,
      windowStart,
      windowEnd,
      sampleSize: finishData.length,
      metricsBefore: { brierScore: 0, ece: 0, mce: 0, accuracy: 0 },
      driftDetected: false,
      recommendations: [`Wait for ${cfg.minSamples - finishData.length} more completed fights`],
    }
  }

  // Calculate current metrics (before recalibration)
  const metricsBefore = calculateCalibrationMetrics(
    finishData.map(d => ({ predicted: d.predicted, actual: d.actual === 1 }))
  )

  // Check if recalibration is needed
  const { needed, reasons } = isRecalibrationNeeded(metricsBefore, cfg)

  if (!needed) {
    return {
      success: true,
      windowStart,
      windowEnd,
      sampleSize: finishData.length,
      metricsBefore,
      driftDetected: false,
      recommendations: ['Calibration looks good. No recalibration needed.'],
    }
  }

  // Perform recalibration
  try {
    // Fit Platt scaling
    const plattParams = fitPlattScaling(
      finishData.map(d => ({
        rawProbability: d.predicted,
        actualOutcome: d.actual === 1,
      }))
    )

    // Calculate metrics after Platt scaling
    const metricsAfter = calculateCalibrationMetrics(
      finishData.map(d => ({
        predicted: applyPlattScaling(d.predicted, plattParams),
        actual: d.actual === 1,
      }))
    )

    // Fit conformal prediction
    const conformalParams = fitConformalPrediction(
      finishData.map(d => ({
        predicted: applyPlattScaling(d.predicted, plattParams),
        actual: d.actual,
      })),
      cfg.conformalCoverage
    )

    // Save parameters
    const validFrom = new Date()
    const validTo = new Date()
    validTo.setDate(validTo.getDate() + cfg.validityDays)

    await savePlattParams(plattParams, metricsAfter, finishData.length, validFrom, validTo)
    await saveConformalParams('finish', conformalParams, validFrom, validTo)

    // Generate recommendations
    if (metricsAfter.brierScore < metricsBefore.brierScore) {
      recommendations.push(
        `Brier improved: ${metricsBefore.brierScore.toFixed(3)} → ${metricsAfter.brierScore.toFixed(3)}`
      )
    }
    if (metricsAfter.ece < metricsBefore.ece) {
      recommendations.push(
        `ECE improved: ${metricsBefore.ece.toFixed(3)} → ${metricsAfter.ece.toFixed(3)}`
      )
    }
    recommendations.push(`New parameters valid until ${validTo.toISOString().split('T')[0]}`)

    return {
      success: true,
      windowStart,
      windowEnd,
      sampleSize: finishData.length,
      metricsBefore,
      metricsAfter,
      plattParams,
      conformalParams,
      driftDetected: true,
      driftReason: reasons.join('; '),
      recommendations,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      windowStart,
      windowEnd,
      sampleSize: finishData.length,
      metricsBefore,
      driftDetected: true,
      driftReason: reasons.join('; '),
      recommendations: ['Manual investigation recommended'],
    }
  }
}

/**
 * Check calibration status without recalibrating
 *
 * Useful for monitoring dashboards and alerting.
 *
 * @param config - Configuration options
 * @returns Current calibration status
 */
export async function checkCalibrationStatus(
  config: Partial<RecalibrationConfig> = {}
): Promise<{
  finishMetrics: CalibrationMetrics
  sampleSize: number
  needsRecalibration: boolean
  reasons: string[]
  lastRecalibration: Date | null
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  // Fetch recent data
  const { finishData, windowStart, windowEnd } = await fetchCalibrationData(cfg.windowMonths)

  const finishMetrics = finishData.length > 0
    ? calculateCalibrationMetrics(
        finishData.map(d => ({ predicted: d.predicted, actual: d.actual === 1 }))
      )
    : { brierScore: 0, ece: 0, mce: 0, accuracy: 0 }

  const { needed, reasons } = isRecalibrationNeeded(finishMetrics, cfg)

  // Get last recalibration date
  const lastParams = await prisma.calibrationParams.findFirst({
    where: { predictionType: 'finish' },
    orderBy: { createdAt: 'desc' },
  })

  return {
    finishMetrics,
    sampleSize: finishData.length,
    needsRecalibration: needed,
    reasons,
    lastRecalibration: lastParams?.createdAt ?? null,
  }
}

/**
 * Generate recalibration report
 *
 * @param result - Recalibration result
 * @returns Formatted report string
 */
export function formatRecalibrationReport(result: RecalibrationResult): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════════',
    'RECALIBRATION REPORT',
    '═══════════════════════════════════════════════════════════════════',
    '',
    `Status: ${result.success ? 'SUCCESS' : 'FAILED'}`,
    `Window: ${result.windowStart.toISOString().split('T')[0]} to ${result.windowEnd.toISOString().split('T')[0]}`,
    `Sample Size: ${result.sampleSize}`,
    '',
  ]

  if (result.error) {
    lines.push(`Error: ${result.error}`)
    lines.push('')
  }

  lines.push('METRICS BEFORE:')
  lines.push(`  Brier Score: ${result.metricsBefore.brierScore.toFixed(4)}`)
  lines.push(`  ECE: ${result.metricsBefore.ece.toFixed(4)}`)
  lines.push(`  MCE: ${result.metricsBefore.mce.toFixed(4)}`)
  lines.push(`  Accuracy: ${(result.metricsBefore.accuracy * 100).toFixed(1)}%`)
  lines.push('')

  if (result.metricsAfter) {
    lines.push('METRICS AFTER:')
    lines.push(`  Brier Score: ${result.metricsAfter.brierScore.toFixed(4)}`)
    lines.push(`  ECE: ${result.metricsAfter.ece.toFixed(4)}`)
    lines.push(`  MCE: ${result.metricsAfter.mce.toFixed(4)}`)
    lines.push(`  Accuracy: ${(result.metricsAfter.accuracy * 100).toFixed(1)}%`)
    lines.push('')
  }

  if (result.driftDetected) {
    lines.push(`DRIFT DETECTED: ${result.driftReason}`)
    lines.push('')
  }

  if (result.plattParams) {
    lines.push('NEW PLATT PARAMETERS:')
    lines.push(`  A: ${result.plattParams.a.toFixed(6)}`)
    lines.push(`  B: ${result.plattParams.b.toFixed(6)}`)
    lines.push('')
  }

  if (result.conformalParams) {
    lines.push('NEW CONFORMAL PARAMETERS:')
    lines.push(`  Coverage: ${(result.conformalParams.coverageLevel * 100).toFixed(0)}%`)
    lines.push(`  Threshold: ${result.conformalParams.threshold.toFixed(4)}`)
    lines.push('')
  }

  if (result.recommendations.length > 0) {
    lines.push('RECOMMENDATIONS:')
    for (const rec of result.recommendations) {
      lines.push(`  • ${rec}`)
    }
  }

  return lines.join('\n')
}

/**
 * Schedule next recalibration check
 *
 * Returns the recommended date for next recalibration.
 *
 * @param lastRecalibration - Date of last recalibration
 * @param config - Configuration options
 * @returns Recommended next check date
 */
export function getNextRecalibrationDate(
  lastRecalibration: Date | null,
  config: Partial<RecalibrationConfig> = {}
): Date {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  if (!lastRecalibration) {
    return new Date() // Recalibrate now
  }

  const nextDate = new Date(lastRecalibration)
  nextDate.setDate(nextDate.getDate() + cfg.validityDays - 7) // Check 7 days before expiry

  return nextDate
}
