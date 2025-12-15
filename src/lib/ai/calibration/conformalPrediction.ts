/**
 * Conformal Prediction - Phase 4.1
 *
 * Implements split conformal prediction for calibrated prediction intervals.
 *
 * Conformal prediction provides prediction intervals with coverage guarantees:
 * - If we want 90% coverage, intervals will contain the true value ~90% of the time
 * - No distributional assumptions required
 * - Works well with small calibration sets (50-100 samples)
 *
 * Reference: Vovk et al. (2005). Algorithmic Learning in a Random World
 */

import { prisma } from '../../database/prisma'

/**
 * Conformal prediction parameters
 */
export interface ConformalParams {
  /** Conformity scores from calibration set (sorted ascending) */
  conformityScores: number[]
  /** Target coverage level (e.g., 0.90 for 90%) */
  coverageLevel: number
  /** Computed threshold for the target coverage */
  threshold: number
  /** Number of calibration samples used */
  calibrationSize: number
}

/**
 * Prediction interval result
 */
export interface PredictionInterval {
  /** Point estimate */
  predicted: number
  /** Lower bound of interval */
  lower: number
  /** Upper bound of interval */
  upper: number
  /** Coverage level (e.g., 0.90) */
  coverage: number
  /** Width of the interval */
  width: number
}

/**
 * Calibration data point for conformal prediction
 */
export interface CalibrationPoint {
  /** Predicted value */
  predicted: number
  /** Actual value */
  actual: number
}

/**
 * Compute conformity scores for calibration set
 *
 * For regression/continuous predictions, conformity score is typically
 * the absolute error: |predicted - actual|
 *
 * @param calibrationData - Array of (predicted, actual) pairs
 * @returns Sorted array of conformity scores
 */
export function computeConformityScores(
  calibrationData: CalibrationPoint[]
): number[] {
  const scores = calibrationData.map(d => Math.abs(d.predicted - d.actual))
  return scores.sort((a, b) => a - b)
}

/**
 * Compute threshold for a given coverage level
 *
 * The threshold is the (1 - alpha) quantile of conformity scores,
 * where alpha = 1 - coverage_level.
 *
 * For finite samples, we use the ceiling of ((n+1) * coverage) to get
 * the exact coverage guarantee.
 *
 * @param scores - Sorted conformity scores
 * @param coverageLevel - Target coverage (e.g., 0.90)
 * @returns Threshold value
 */
export function computeThreshold(
  scores: number[],
  coverageLevel: number
): number {
  const n = scores.length
  if (n === 0) return 0

  // Index for coverage guarantee: ceil((n+1) * coverage) - 1
  // This ensures at least coverage% of new predictions are covered
  const idx = Math.min(
    Math.ceil((n + 1) * coverageLevel) - 1,
    n - 1
  )

  return scores[Math.max(0, idx)]
}

/**
 * Fit conformal prediction parameters from calibration data
 *
 * @param calibrationData - Array of (predicted, actual) pairs
 * @param coverageLevel - Target coverage (default 0.90)
 * @returns Conformal parameters
 */
export function fitConformalPrediction(
  calibrationData: CalibrationPoint[],
  coverageLevel: number = 0.90
): ConformalParams {
  if (calibrationData.length < 10) {
    throw new Error('Need at least 10 calibration points for conformal prediction')
  }

  const conformityScores = computeConformityScores(calibrationData)
  const threshold = computeThreshold(conformityScores, coverageLevel)

  return {
    conformityScores,
    coverageLevel,
    threshold,
    calibrationSize: calibrationData.length,
  }
}

/**
 * Generate prediction interval using conformal prediction
 *
 * @param pointEstimate - Point prediction
 * @param params - Conformal parameters
 * @returns Prediction interval
 */
export function getPredictionInterval(
  pointEstimate: number,
  params: ConformalParams
): PredictionInterval {
  const lower = pointEstimate - params.threshold
  const upper = pointEstimate + params.threshold

  return {
    predicted: pointEstimate,
    lower,
    upper,
    coverage: params.coverageLevel,
    width: upper - lower,
  }
}

/**
 * Clamp prediction interval to valid range
 *
 * @param interval - Raw prediction interval
 * @param min - Minimum valid value (e.g., 0)
 * @param max - Maximum valid value (e.g., 100 for fun score, 1 for probability)
 * @returns Clamped interval
 */
export function clampInterval(
  interval: PredictionInterval,
  min: number,
  max: number
): PredictionInterval {
  return {
    ...interval,
    lower: Math.max(min, interval.lower),
    upper: Math.min(max, interval.upper),
    width: Math.min(max, interval.upper) - Math.max(min, interval.lower),
  }
}

/**
 * Validate coverage on a test set
 *
 * Checks if the actual coverage matches the target coverage.
 *
 * @param testData - Test set of (predicted, actual) pairs
 * @param params - Conformal parameters
 * @returns Actual coverage fraction
 */
export function validateCoverage(
  testData: CalibrationPoint[],
  params: ConformalParams
): number {
  if (testData.length === 0) return 0

  let covered = 0
  for (const point of testData) {
    const interval = getPredictionInterval(point.predicted, params)
    if (point.actual >= interval.lower && point.actual <= interval.upper) {
      covered++
    }
  }

  return covered / testData.length
}

/**
 * Generate conformal intervals for multiple coverage levels
 *
 * Useful for showing confidence at multiple levels (e.g., 50%, 80%, 95%)
 *
 * @param pointEstimate - Point prediction
 * @param calibrationData - Calibration data for fitting
 * @param coverageLevels - Array of coverage levels to compute
 * @returns Array of prediction intervals
 */
export function getMultipleCoverageIntervals(
  pointEstimate: number,
  calibrationData: CalibrationPoint[],
  coverageLevels: number[] = [0.50, 0.80, 0.95]
): PredictionInterval[] {
  const scores = computeConformityScores(calibrationData)

  return coverageLevels.map(coverage => {
    const threshold = computeThreshold(scores, coverage)
    return {
      predicted: pointEstimate,
      lower: pointEstimate - threshold,
      upper: pointEstimate + threshold,
      coverage,
      width: threshold * 2,
    }
  })
}

/**
 * Load conformal parameters from database
 *
 * @param predictionType - Type of prediction ('finish' or 'fun')
 * @returns Conformal params or null if not found
 */
export async function loadConformalParams(
  predictionType: 'finish' | 'fun'
): Promise<ConformalParams | null> {
  const params = await prisma.calibrationParams.findFirst({
    where: {
      predictionType: `${predictionType}_conformal`,
      active: true,
      validFrom: { lte: new Date() },
      validTo: { gte: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!params || !params.conformityScores) {
    return null
  }

  const scores = params.conformityScores as number[]

  return {
    conformityScores: scores,
    coverageLevel: params.coverageLevel ?? 0.90,
    threshold: computeThreshold(scores, params.coverageLevel ?? 0.90),
    calibrationSize: params.trainedOn,
  }
}

/**
 * Save conformal parameters to database
 *
 * @param predictionType - Type of prediction ('finish' or 'fun')
 * @param params - Conformal parameters to save
 * @param validFrom - Start of validity period
 * @param validTo - End of validity period
 */
export async function saveConformalParams(
  predictionType: 'finish' | 'fun',
  params: ConformalParams,
  validFrom: Date,
  validTo: Date
): Promise<void> {
  // Deactivate previous params
  await prisma.calibrationParams.updateMany({
    where: {
      predictionType: `${predictionType}_conformal`,
      active: true,
    },
    data: { active: false },
  })

  // Create new params
  await prisma.calibrationParams.create({
    data: {
      predictionType: `${predictionType}_conformal`,
      conformityScores: params.conformityScores,
      coverageLevel: params.coverageLevel,
      trainedOn: params.calibrationSize,
      active: true,
      validFrom,
      validTo,
    },
  })
}

/**
 * Train conformal prediction from historical predictions
 *
 * @param predictionType - Type of prediction ('finish' or 'fun')
 * @param windowMonths - Number of months of historical data to use
 * @param coverageLevel - Target coverage level
 * @returns Fitted conformal parameters and validation metrics
 */
export async function trainConformalFromHistory(
  predictionType: 'finish' | 'fun',
  windowMonths: number = 12,
  coverageLevel: number = 0.90
): Promise<{
  params: ConformalParams
  validationCoverage: number
  trainSize: number
  testSize: number
}> {
  const windowStart = new Date()
  windowStart.setMonth(windowStart.getMonth() - windowMonths)

  // Fetch predictions with outcomes
  const predictions = await prisma.prediction.findMany({
    where: {
      actualFinish: predictionType === 'finish' ? { not: null } : undefined,
      actualFunScore: predictionType === 'fun' ? { not: null } : undefined,
      createdAt: { gte: windowStart },
    },
    select: {
      finishProbability: true,
      funScore: true,
      actualFinish: true,
      actualFunScore: true,
    },
  })

  if (predictions.length < 20) {
    throw new Error(`Need at least 20 data points, have ${predictions.length}`)
  }

  // Convert to calibration format
  const data: CalibrationPoint[] = predictions.map(p => ({
    predicted: predictionType === 'finish'
      ? p.finishProbability
      : p.funScore,
    actual: predictionType === 'finish'
      ? (p.actualFinish ? 1 : 0)
      : (p.actualFunScore ?? 50),
  }))

  // Split 80/20 for train/test
  const splitIdx = Math.floor(data.length * 0.8)
  const trainData = data.slice(0, splitIdx)
  const testData = data.slice(splitIdx)

  // Fit on training set
  const params = fitConformalPrediction(trainData, coverageLevel)

  // Validate on test set
  const validationCoverage = validateCoverage(testData, params)

  return {
    params,
    validationCoverage,
    trainSize: trainData.length,
    testSize: testData.length,
  }
}

/**
 * Format prediction interval for display
 */
export function formatPredictionInterval(
  interval: PredictionInterval,
  isPercentage: boolean = false
): string {
  if (isPercentage) {
    return `${(interval.predicted * 100).toFixed(0)}% [${(interval.lower * 100).toFixed(0)}%-${(interval.upper * 100).toFixed(0)}%] (${(interval.coverage * 100).toFixed(0)}% CI)`
  }
  return `${interval.predicted.toFixed(0)} [${interval.lower.toFixed(0)}-${interval.upper.toFixed(0)}] (${(interval.coverage * 100).toFixed(0)}% CI)`
}
